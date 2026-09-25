"""
model.py — ML training pipeline for isoelectric point (pI) prediction.

Idea: physics-informed machine learning.
  Classical pI calculators are Henderson-Hasselbalch with a fixed pKa table.
  Nine published tables disagree with each other and with experiment because
  real pKa values shift with neighbouring residues, termini and solvation.
  We compute all nine classical pIs as *features*, add sequence composition,
  and let the models learn the *residual* (experimental pI − Rodwell pI) from
  ~8,400 experimental measurements.  Final pI = physics + learned correction.  The test-set comparison against every classical table is
  stored in meta.pkl so the app can show exactly how much ML adds.

Three models are trained and persisted:
  1. Random Forest  — robust bagged trees
  2. Gradient Boosting — sequential error correction
  3. Ridge Regression — linear baseline; fast, interpretable

Run `python model.py` to (re)train from the command line.
"""

import os
import numpy as np
import joblib
from sklearn.ensemble import RandomForestRegressor, GradientBoostingRegressor
from sklearn.linear_model import Ridge
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_squared_error, mean_absolute_error, r2_score
from sklearn.preprocessing import StandardScaler

from data import (
    download_and_merge_datasets,
    build_feature_matrix,
    extract_features,
    PKA_SETS,
)

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
_DIR = os.path.dirname(os.path.abspath(__file__))
MODELS_DIR = os.path.join(_DIR, "models")
os.makedirs(MODELS_DIR, exist_ok=True)

RF_PATH      = os.path.join(MODELS_DIR, "rf.pkl")
GB_PATH      = os.path.join(MODELS_DIR, "gb.pkl")
RIDGE_PATH   = os.path.join(MODELS_DIR, "ridge.pkl")
SCALER_PATH  = os.path.join(MODELS_DIR, "scaler.pkl")
META_PATH    = os.path.join(MODELS_DIR, "meta.pkl")   # feature names + metrics

FEATURE_VERSION = 6   # bump when extract_features() changes → forces retrain

# Residual learning: the models predict the *correction* to this classical
# calculator rather than pI from scratch.  Physics carries the prediction
# (and extrapolates to very acidic/basic sequences); ML learns what the pKa
# table gets wrong.
BASE_CALCULATOR = "rodwell"

# Applicability domain.  The peptide measurements come from pH 3–10 IPG strips,
# so sequences whose physics pI lies below ~3.6 or above ~10 are barely
# represented (a handful of noisy rows).  Outside the dense region (1st–99th
# percentile of the physics baseline) the learned correction is unreliable, so
# we fade it out linearly over DOMAIN_FADE pH units and fall back to physics.
DOMAIN_FADE = 0.5

# ---------------------------------------------------------------------------
# Model definitions
# ---------------------------------------------------------------------------
def _make_rf():
    return RandomForestRegressor(
        n_estimators=150,
        min_samples_leaf=5,     # no leaf can be driven by one or two noisy measurements
        max_features=0.5,
        random_state=42,
        n_jobs=2,               # bounded so training fits Render's 512 MB free tier
    )

def _make_gb():
    return GradientBoostingRegressor(
        n_estimators=300,
        learning_rate=0.05,
        max_depth=4,
        subsample=0.8,
        random_state=42,
    )

def _make_ridge():
    return Ridge(alpha=1.0)

# ---------------------------------------------------------------------------
# Training
# ---------------------------------------------------------------------------

def _metrics(y_true, y_pred) -> dict:
    rmse = float(np.sqrt(mean_squared_error(y_true, y_pred)))
    mae  = float(mean_absolute_error(y_true, y_pred))
    r2   = float(r2_score(y_true, y_pred))
    return {"rmse": round(rmse, 4), "mae": round(mae, 4), "r2": round(r2, 4)}


def train():
    """
    Load data, engineer features, train three models, evaluate on a hold-out
    test set (and evaluate every classical pKa table on the same set), then
    persist everything to disk.
    """
    df = download_and_merge_datasets()
    X, y, feature_names = build_feature_matrix(df)

    # Stratified split — only if every pI bin has at least 2 samples.
    strat_bins = np.round(y).astype(int)
    counts = np.bincount(strat_bins - strat_bins.min())
    use_stratify = strat_bins if (counts[counts > 0] >= 2).all() else None
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=use_stratify
    )

    # Ridge needs standardised features; RF and GB are scale-invariant.
    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_test_scaled  = scaler.transform(X_test)

    print(f"Training on {len(X_train)} samples, testing on {len(X_test)}...")

    base_col = feature_names.index(f"pI_{BASE_CALCULATOR}")
    base_train, base_test = X_train[:, base_col], X_test[:, base_col]
    resid_train = y_train - base_train

    rf, gb, ridge = _make_rf(), _make_gb(), _make_ridge()
    print("  Fitting Random Forest...")
    rf.fit(X_train, resid_train)
    print("  Fitting Gradient Boosting...")
    gb.fit(X_train, resid_train)
    print("  Fitting Ridge...")
    ridge.fit(X_train_scaled, resid_train)

    metrics = {
        "rf":    _metrics(y_test, base_test + rf.predict(X_test)),
        "gb":    _metrics(y_test, base_test + gb.predict(X_test)),
        "ridge": _metrics(y_test, base_test + ridge.predict(X_test_scaled)),
    }

    # Split-conformal 90% interval: the 90th percentile of absolute test error.
    # "For 9 in 10 unseen sequences the true pI lies within ± this value."
    best_key = min(metrics, key=lambda k: metrics[k]["rmse"])
    best_test = base_test + {"rf": rf.predict(X_test), "gb": gb.predict(X_test),
                             "ridge": ridge.predict(X_test_scaled)}[best_key]
    conformal_q90 = float(np.quantile(np.abs(y_test - best_test), 0.9))

    # Classical baselines on the *same* test rows
    baselines = {}
    for name in PKA_SETS:
        col = feature_names.index(f"pI_{name}")
        baselines[name] = _metrics(y_test, X_test[:, col])

    # Global feature importance (GB) — top 10, for the "what the model looks at" panel
    order = np.argsort(gb.feature_importances_)[::-1][:10]
    importance = [
        {"feature": feature_names[i], "importance": round(float(gb.feature_importances_[i]), 4)}
        for i in order
    ]

    print("Metrics:", metrics)
    print("Best classical:", min(baselines.items(), key=lambda kv: kv[1]["rmse"]))

    joblib.dump(rf,    RF_PATH, compress=3)
    joblib.dump(gb,    GB_PATH, compress=3)
    joblib.dump(ridge, RIDGE_PATH)
    joblib.dump(scaler, SCALER_PATH)
    joblib.dump({
        "feature_version": FEATURE_VERSION,
        "base_calculator": BASE_CALCULATOR,
        "conformal_q90":   round(conformal_q90, 3),
        "feature_names":   feature_names,
        "metrics":         metrics,
        "baselines":       baselines,
        "importance":      importance,
        "n_train":         int(len(X_train)),
        "n_test":          int(len(X_test)),
        "pI_domain":       [round(float(np.percentile(X[:, base_col], 1)), 2),
                            round(float(np.percentile(X[:, base_col], 99)), 2)],
        "train_len_range": [int(X[:, feature_names.index("length")].min()),
                            int(X[:, feature_names.index("length")].max())],
    }, META_PATH)
    print("Models saved.")
    return metrics

# ---------------------------------------------------------------------------
# Loading
# ---------------------------------------------------------------------------

_rf = _gb = _ridge = _scaler = None
_feature_names: list = []
_meta: dict = {}

def models_exist() -> bool:
    if not all(os.path.exists(p) for p in [RF_PATH, GB_PATH, RIDGE_PATH, SCALER_PATH, META_PATH]):
        return False
    # Stale models from an older feature set must be retrained
    return joblib.load(META_PATH).get("feature_version") == FEATURE_VERSION

def load_models():
    global _rf, _gb, _ridge, _scaler, _feature_names, _meta
    _rf     = joblib.load(RF_PATH)
    _gb     = joblib.load(GB_PATH)
    _ridge  = joblib.load(RIDGE_PATH)
    _scaler = joblib.load(SCALER_PATH)
    _meta   = joblib.load(META_PATH)
    _feature_names = _meta["feature_names"]
    print("Models loaded from disk.")

def get_metrics() -> dict:
    return _meta["metrics"]

def get_meta() -> dict:
    return {k: v for k, v in _meta.items() if k != "feature_names"}

# ---------------------------------------------------------------------------
# Prediction
# ---------------------------------------------------------------------------

def _feature_rows(sequences: list[str]) -> np.ndarray:
    rows = []
    for seq in sequences:
        feats = extract_features(seq)
        rows.append([feats[f] for f in _feature_names])
    return np.array(rows, dtype=float)


def _base(X: np.ndarray) -> np.ndarray:
    return X[:, _feature_names.index(f"pI_{BASE_CALCULATOR}")]


def _domain_weight(seq_len: int, base_pI: float) -> float:
    """1.0 = fully trust the ML correction, 0.0 = pure physics."""
    lo_len, _ = _meta["train_len_range"]
    if seq_len < lo_len:
        return 0.0
    lo_pI, hi_pI = _meta["pI_domain"]
    dist = max(lo_pI - base_pI, base_pI - hi_pI, 0.0)
    return max(0.0, 1.0 - dist / DOMAIN_FADE)


def _half_width(w):
    """90% interval half-width: conformal inside the domain, wider as we leave it."""
    q = _meta["conformal_q90"]
    return q * (2.0 - w)


def _best_key() -> str:
    rmses = {k: v["rmse"] for k, v in _meta["metrics"].items()}
    return min(rmses, key=rmses.get)


def predict_many(sequences: list[str]) -> list[dict]:
    """Fast batch scoring (used by the AI designer). Returns best-model pI + 90% CI."""
    if _rf is None:
        raise RuntimeError("Models not loaded. Call load_models() first.")
    X = _feature_rows(sequences)
    base = _base(X)
    w = np.array([_domain_weight(len(s), b) for s, b in zip(sequences, base)])
    preds = {
        "rf":    base + w * _rf.predict(X),
        "gb":    base + w * _gb.predict(X),
        "ridge": base + w * _ridge.predict(_scaler.transform(X)),
    }
    best = preds[_best_key()]
    lo, hi = best - _half_width(w), best + _half_width(w)
    return [
        {"sequence": s, "pI": round(float(v), 3),
         "ci_low": round(float(l), 3), "ci_high": round(float(h), 3),
         "in_domain": bool(wt == 1.0)}
        for s, v, l, h, wt in zip(sequences, best, lo, hi, w)
    ]


def predict(sequence: str) -> dict:
    """Run all three models on one sequence and return a results dict."""
    if _rf is None:
        raise RuntimeError("Models not loaded. Call load_models() first.")

    X = _feature_rows([sequence])
    X_scaled = _scaler.transform(X)
    base = float(_base(X)[0])
    w = _domain_weight(len(sequence), base)

    rf_pred    = base + w * float(_rf.predict(X)[0])
    gb_pred    = base + w * float(_gb.predict(X)[0])
    ridge_pred = base + w * float(_ridge.predict(X_scaled)[0])

    best_key  = _best_key()
    best_pred = {"rf": rf_pred, "gb": gb_pred, "ridge": ridge_pred}[best_key]

    # Calibrated 90% interval (split-conformal, doubled outside the domain)
    ci_low  = best_pred - _half_width(w)
    ci_high = best_pred + _half_width(w)

    in_domain = w == 1.0

    return {
        "rf_prediction":    round(rf_pred, 3),
        "gb_prediction":    round(gb_pred, 3),
        "ridge_prediction": round(ridge_pred, 3),
        "best_prediction":  round(best_pred, 3),
        "best_model":       best_key,
        "confidence_low":   round(ci_low, 3),
        "confidence_high":  round(ci_high, 3),
        "base_pI":          round(base, 3),
        "ml_correction":    round(best_pred - base, 3),
        "in_domain":        in_domain,
        "ml_weight":        round(w, 3),
    }


if __name__ == "__main__":
    train()
