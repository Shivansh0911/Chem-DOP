"""
main.py — FastAPI backend for the pI Predictor app.

Endpoints
---------
GET  /                         → health check
POST /predict                  → ML pI prediction for a sequence or AA name
GET  /amino-acids              → reference table of all 20 standard AAs
GET  /titration-curve?sequence → Henderson-Hasselbalch charge vs pH data
GET  /model-metrics            → RMSE / MAE / R² for all three models
"""

import os
import threading
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import model as ml
from data import (
    amino_acids_as_dicts,
    lookup_amino_acid,
    titration_curve,
    physics_pI_estimate,
    VALID_AAS,
)

# ---------------------------------------------------------------------------
# Startup — train or load models
# ---------------------------------------------------------------------------

_model_ready = False
_train_lock  = threading.Lock()

def _ensure_models():
    global _model_ready
    with _train_lock:
        if _model_ready:
            return
        if ml.models_exist():
            ml.load_models()
        else:
            print("No saved models found — training from scratch (this takes ~2 min)...")
            ml.train()
            ml.load_models()
        _model_ready = True

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Run model loading/training in a background thread so the server stays
    # responsive (returns 503 on /predict until ready).
    t = threading.Thread(target=_ensure_models, daemon=True)
    t.start()
    yield

# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

app = FastAPI(
    title="pI Predictor API",
    description="ML-based isoelectric point prediction for amino acids and peptides",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------

class PredictRequest(BaseModel):
    input: str

# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.get("/")
def health_check():
    return {"status": "ok", "model_trained": _model_ready}


@app.post("/predict")
def predict(req: PredictRequest):
    if not _model_ready:
        raise HTTPException(status_code=503, detail="Models are still training. Try again in a moment.")

    raw = req.input.strip()
    if not raw:
        raise HTTPException(status_code=400, detail="Input cannot be empty.")

    # Resolve: could be a name ("Alanine"), 3L ("Ala"), 1L ("A"), or sequence
    aa_row = lookup_amino_acid(raw)
    if aa_row:
        # Single amino acid — use its 1-letter code as the sequence
        sequence    = aa_row[1]
        known_pI    = aa_row[3]
        is_single   = True
    else:
        # Treat as peptide sequence — validate characters
        sequence = raw.upper().replace(" ", "")
        invalid  = [c for c in sequence if c not in VALID_AAS]
        if invalid:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid character(s) in sequence: {', '.join(set(invalid))}. "
                       "Only the 20 standard amino acid codes are accepted.",
            )
        known_pI  = None
        is_single = False

    preds = ml.predict(sequence)
    pi    = preds["best_prediction"]

    if pi < 5.5:
        charge_class = "acidic"
    elif pi > 7.5:
        charge_class = "basic"
    else:
        charge_class = "neutral"

    seq_feats = {
        "acidic_fraction": round((sequence.count("D") + sequence.count("E")) / len(sequence), 4),
        "basic_fraction":  round((sequence.count("R") + sequence.count("K") + sequence.count("H")) / len(sequence), 4),
        "charge_proxy":    round(
            (sequence.count("R") + sequence.count("K") + sequence.count("H") -
             sequence.count("D") - sequence.count("E")) / len(sequence),
            4,
        ),
    }

    response = {
        "sequence":          sequence,
        "length":            len(sequence),
        "rf_prediction":     preds["rf_prediction"],
        "gb_prediction":     preds["gb_prediction"],
        "ridge_prediction":  preds["ridge_prediction"],
        "best_prediction":   preds["best_prediction"],
        "best_model":        preds["best_model"],
        "confidence_low":    preds["confidence_low"],
        "confidence_high":   preds["confidence_high"],
        "physics_estimate":  physics_pI_estimate(sequence),
        "charge_class":      charge_class,
        "features":          seq_feats,
        "is_single_aa":      is_single,
    }

    if is_single and known_pI is not None:
        response["known_pI"]      = known_pI
        response["prediction_error"] = round(abs(preds["best_prediction"] - known_pI), 3)

    return response


@app.get("/amino-acids")
def get_amino_acids():
    return amino_acids_as_dicts()


@app.get("/titration-curve")
def get_titration_curve(sequence: str = Query(..., min_length=1)):
    sequence = sequence.upper().strip()

    # Allow name / 3L lookup
    aa_row = lookup_amino_acid(sequence)
    if aa_row:
        sequence = aa_row[1]

    invalid = [c for c in sequence if c not in VALID_AAS]
    if invalid:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid characters: {', '.join(set(invalid))}",
        )

    return titration_curve(sequence)


@app.get("/model-metrics")
def get_model_metrics():
    if not _model_ready:
        raise HTTPException(status_code=503, detail="Models not yet trained.")
    return ml.get_metrics()
