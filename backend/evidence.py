"""
evidence.py — lets anyone check our claims against the source data.

The point of this module is that no claim in the app has to be taken on trust.
A reviewer can look up any sequence in the published dataset, see the value a
laboratory actually measured for it, see whether that row was used for training
or held back for testing, and compare it against what we predict.

The train/test split is reproduced here with the same seed and the same rule
model.train() uses, so "this row was held out" is a fact, not a claim.
"""

import numpy as np
from sklearn.model_selection import train_test_split

import model as ml
from data import download_and_merge_datasets

# ---------------------------------------------------------------------------
# Where the data came from. Printed in the app so the source is never a mystery.
# ---------------------------------------------------------------------------
SOURCE = {
    "name": "pIR — experimentally measured isoelectric points",
    "paper": "Pérez-Riverol Y. et al., \"Prediction of Isoelectric Point for "
             "Diverse Proteins Using Random Forest and Gradient Boosting\", "
             "Bioinformatics (2016)",
    "repository": "https://github.com/bigbio/pIR",
    "files": [
        "inst/extdata/dataPeptidePIs.csv",
        "inst/extdata/dataProteinPIs.csv",
    ],
    "measurement": "Isoelectric focusing: the molecules are run across a pH "
                   "gradient and settle where their net charge is zero. The "
                   "position gives the pI.",
    "our_code": "https://github.com/Shivansh0911/Chem-DOP",
}

_index: dict | None = None
_rows: list | None = None


def _build():
    """Load the dataset once and reproduce the exact train/test split."""
    global _index, _rows
    if _index is not None:
        return

    df = download_and_merge_datasets()
    y = df["piexp"].values.astype(float)
    seqs = df["sequence"].values

    # Same stratification rule and seed as model.train(), so the split matches.
    bins = np.round(y).astype(int)
    counts = np.bincount(bins - bins.min())
    strat = bins if (counts[counts > 0] >= 2).all() else None
    _, test_idx = train_test_split(
        np.arange(len(y)), test_size=0.2, random_state=42, stratify=strat
    )
    split = np.full(len(y), "training", dtype=object)
    split[test_idx] = "held-out test"

    rows, index = [], {}
    for i, s in enumerate(seqs):
        row = {"sequence": s, "measured_pI": round(float(y[i]), 2),
               "length": len(s), "used_for": split[i]}
        rows.append(row)
        index.setdefault(s, row)      # duplicates keep their first row

    _rows, _index = rows, index


_coverage_cache: dict | None = None


def coverage() -> dict:
    """
    How the 90% interval actually performs across every held-out row.

    The examples table below spreads its sample across the pI range on purpose,
    which over-weights the sparse extremes where the model is weakest. Quoting
    only that sample would undersell the calibration, so the page shows this
    figure beside it: the honest number over all held-out rows.
    """
    global _coverage_cache
    if _coverage_cache is not None:
        return _coverage_cache
    _build()
    test = [r for r in _rows if r["used_for"] == "held-out test"]
    preds = ml.predict_many([r["sequence"] for r in test])
    inside = sum(1 for r, p in zip(test, preds)
                 if p["ci_low"] <= r["measured_pI"] <= p["ci_high"])
    errs = [abs(p["pI"] - r["measured_pI"]) for r, p in zip(test, preds)]
    _coverage_cache = {
        "rows": len(test),
        "inside": inside,
        "percent": round(inside / len(test) * 100, 1),
        "mean_error": round(float(np.mean(errs)), 3),
    }
    return _coverage_cache


def summary() -> dict:
    """Provenance plus the numbers behind every claim the app makes."""
    _build()
    meta = ml.get_meta()
    n_test = sum(1 for r in _rows if r["used_for"] == "held-out test")
    measured = np.array([r["measured_pI"] for r in _rows])
    best = min(meta["metrics"], key=lambda k: meta["metrics"][k]["rmse"])
    best_classical = min(meta["baselines"], key=lambda k: meta["baselines"][k]["rmse"])
    return {
        "source": SOURCE,
        "rows_total": len(_rows),
        "rows_training": len(_rows) - n_test,
        "rows_test": n_test,
        "measured_pI_range": [round(float(measured.min()), 2),
                              round(float(measured.max()), 2)],
        "distinct_measured_values": int(len(np.unique(measured))),
        "best_model": best,
        "best_model_rmse": meta["metrics"][best]["rmse"],
        "best_classical": best_classical,
        "best_classical_rmse": meta["baselines"][best_classical]["rmse"],
        "interval_half_width": meta["conformal_q90"],
        "reliable_pI_range": meta["pI_domain"],
        "all_models": meta["metrics"],
        "all_classical": meta["baselines"],
    }


def lookup(sequence: str) -> dict:
    """Is this exact sequence in the published dataset? If so, show its row."""
    _build()
    row = _index.get(sequence.upper().strip())
    if row is None:
        return {"found": False, "sequence": sequence}
    pred = ml.predict(row["sequence"])
    return {
        "found": True,
        **row,
        "our_prediction": pred["best_prediction"],
        "error": round(abs(pred["best_prediction"] - row["measured_pI"]), 3),
        "interval": [pred["confidence_low"], pred["confidence_high"]],
        "inside_interval": pred["confidence_low"] <= row["measured_pI"] <= pred["confidence_high"],
        "textbook_pI": pred["base_pI"],
        "textbook_error": round(abs(pred["base_pI"] - row["measured_pI"]), 3),
    }


def examples(n: int = 12, seed: int = 7) -> dict:
    """
    A fair sample of held-out rows: measured value beside our prediction.

    Rows are drawn at random across the pI range, never picked for looking
    good — the seed is fixed only so the page is stable between reloads.
    """
    _build()
    test = [r for r in _rows if r["used_for"] == "held-out test"]
    rng = np.random.default_rng(seed)

    # Spread the sample across the pI range instead of over-sampling the
    # crowded acidic band, so the table is representative rather than flattering.
    bands = [(0, 4), (4, 5), (5, 6.5), (6.5, 8), (8, 14)]
    picks = []
    for lo, hi in bands:
        pool = [r for r in test if lo <= r["measured_pI"] < hi]
        if pool:
            take = min(max(1, n // len(bands)), len(pool))
            picks += [pool[i] for i in rng.choice(len(pool), size=take, replace=False)]

    preds = ml.predict_many([r["sequence"] for r in picks])
    out = []
    for r, p in zip(picks, preds):
        out.append({
            "sequence": r["sequence"],
            "length": r["length"],
            "measured_pI": r["measured_pI"],
            "our_prediction": p["pI"],
            "error": round(abs(p["pI"] - r["measured_pI"]), 3),
            "interval": [p["ci_low"], p["ci_high"]],
            "inside_interval": p["ci_low"] <= r["measured_pI"] <= p["ci_high"],
        })
    out.sort(key=lambda r: r["measured_pI"])

    covered = sum(1 for r in out if r["inside_interval"])
    return {
        "note": "Every row below was hidden from the model during training. "
                "The sample is drawn at random across the pI range, not chosen.",
        "rows": out,
        "inside_interval": f"{covered} of {len(out)}",
        "mean_error": round(float(np.mean([r['error'] for r in out])), 3),
        # Spreading the sample across the range deliberately includes the sparse
        # extremes, so this small table reads worse than the model really is.
        # The full figure goes with it so the comparison is honest.
        "overall": coverage(),
    }
