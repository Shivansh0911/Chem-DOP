"""
model.py — ML training pipeline for isoelectric point (pI) prediction.

Why machine learning works here:
  The pI of a peptide arises from the collective ionisation equilibria of all
  its residues — a non-linear function of composition.  Classical algorithms
  (Henderson-Hasselbalch with fixed pKa tables) ignore context effects such as
  local electrostatics and hydrogen bonding.  Tree-based ensembles can learn
  these corrections from experimental data and typically outperform pure
  physics-based approaches by 0.3–0.8 RMSE units on mixed datasets.

Three models are trained and persisted:
  1. Random Forest  — robust, naturally yields per-tree uncertainty estimates
  2. Gradient Boosting — often lowest RMSE, sequential error correction
  3. Ridge Regression — linear baseline; fast, interpretable
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
    ALGO_COLUMNS,
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

# ---------------------------------------------------------------------------
# Model definitions
# ---------------------------------------------------------------------------
def _make_rf():
    return RandomForestRegressor(
        n_estimators=100,       # reduced from 300 — trains ~3x faster, minimal accuracy loss
        max_depth=None,
        min_samples_split=2,
        random_state=42,
        n_jobs=-1,
    )

def _make_gb():
    return GradientBoostingRegressor(
        n_estimators=100,       # reduced from 200 — halves training time
        learning_rate=0.08,
        max_depth=4,
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
    Download data, engineer features, train three models, evaluate on hold-out
    test set, and persist everything to disk.
    Returns the metrics dict: {"rf": {...}, "gb": {...}, "ridge": {...}}
    """
    df = download_and_merge_datasets()
    X, y, feature_names = build_feature_matrix(df)

    # Stratified split — drop bins with only 1 sample (can't appear in both splits).
    strat_bins = np.round(y).astype(int)
    counts = np.bincount(strat_bins - strat_bins.min())
    rare   = np.where(counts < 2)[0] + strat_bins.min()
    use_stratify = strat_bins if len(rare) == 0 else None
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=use_stratify
    )

    # Ridge needs standardised features; RF and GB are scale-invariant.
    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_test_scaled  = scaler.transform(X_test)

    print(f"Training on {len(X_train)} samples, testing on {len(X_test)}...")

    rf    = _make_rf()
    gb    = _make_gb()
    ridge = _make_ridge()

    print("  Fitting Random Forest...")
    rf.fit(X_train, y_train)
    print("  Fitting Gradient Boosting...")
    gb.fit(X_train, y_train)
    print("  Fitting Ridge...")
    ridge.fit(X_train_scaled, y_train)

    metrics = {
        "rf":    _metrics(y_test, rf.predict(X_test)),
        "gb":    _metrics(y_test, gb.predict(X_test)),
        "ridge": _metrics(y_test, ridge.predict(X_test_scaled)),
    }
    print("Metrics:", metrics)

    joblib.dump(rf,    RF_PATH)
    joblib.dump(gb,    GB_PATH)
    joblib.dump(ridge, RIDGE_PATH)
    joblib.dump(scaler, SCALER_PATH)
    joblib.dump({"feature_names": feature_names, "metrics": metrics}, META_PATH)
    print("Models saved.")
    return metrics

# ---------------------------------------------------------------------------
# Loading
# ---------------------------------------------------------------------------

_rf = _gb = _ridge = _scaler = None
_feature_names: list = []
_metrics_cache: dict = {}

def models_exist() -> bool:
    return all(os.path.exists(p) for p in [RF_PATH, GB_PATH, RIDGE_PATH, SCALER_PATH, META_PATH])

def load_models():
    global _rf, _gb, _ridge, _scaler, _feature_names, _metrics_cache
    _rf     = joblib.load(RF_PATH)
    _gb     = joblib.load(GB_PATH)
    _ridge  = joblib.load(RIDGE_PATH)
    _scaler = joblib.load(SCALER_PATH)
    meta = joblib.load(META_PATH)
    _feature_names = meta["feature_names"]
    _metrics_cache = meta["metrics"]
    print("Models loaded from disk.")

def get_metrics() -> dict:
    return _metrics_cache

# ---------------------------------------------------------------------------
# Prediction
# ---------------------------------------------------------------------------

def _build_single_feature_row(sequence: str, algo_hints: dict = None) -> np.ndarray:
    """
    Build one feature row for a sequence.
    algo_hints: optional dict of known algorithm predictions to include.
    """
    feats = extract_features(sequence)

    # Append algorithm predictions in the same order they were trained on.
    # If the live request has no algorithm values, fill with NaN → imputed to 0.
    for col in ALGO_COLUMNS:
        key = f"algo_{col}"
        if key in _feature_names:
            feats[key] = (algo_hints or {}).get(col, float("nan"))

    # Build row in training column order
    row = np.array([feats.get(f, 0.0) for f in _feature_names], dtype=float)
    # Replace NaN (missing algo columns) with 0
    row = np.nan_to_num(row, nan=0.0)
    return row.reshape(1, -1)


def predict(sequence: str, algo_hints: dict = None) -> dict:
    """
    Run all three models and return a results dict.

    algo_hints: optional dict with keys like "bjell", "expasy" to pass
                algorithm-predicted values as extra features (improves accuracy).
    """
    if _rf is None:
        raise RuntimeError("Models not loaded. Call load_models() first.")

    X = _build_single_feature_row(sequence, algo_hints)
    X_scaled = _scaler.transform(X)

    rf_pred    = float(_rf.predict(X)[0])
    gb_pred    = float(_gb.predict(X)[0])
    ridge_pred = float(_ridge.predict(X_scaled)[0])

    # Confidence interval from individual RF trees (90% CI)
    # Each tree in the forest is an independent estimator; their spread reflects
    # model uncertainty — wider CI means the sequence is unlike training data.
    tree_preds = np.array([tree.predict(X)[0] for tree in _rf.estimators_])
    ci_low  = float(np.percentile(tree_preds, 5))
    ci_high = float(np.percentile(tree_preds, 95))

    # Pick best model by lowest test-RMSE
    rmses = {k: v["rmse"] for k, v in _metrics_cache.items()}
    best_key = min(rmses, key=rmses.get)
    best_pred = {"rf": rf_pred, "gb": gb_pred, "ridge": ridge_pred}[best_key]

    return {
        "rf_prediction":    round(rf_pred, 3),
        "gb_prediction":    round(gb_pred, 3),
        "ridge_prediction": round(ridge_pred, 3),
        "best_prediction":  round(best_pred, 3),
        "best_model":       best_key,
        "confidence_low":   round(ci_low, 3),
        "confidence_high":  round(ci_high, 3),
    }
