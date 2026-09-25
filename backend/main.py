"""
main.py — FastAPI backend for the pI Predictor app.

Endpoints
---------
GET  /health                   → health check (and / when no UI is bundled)
POST /predict                  → ML pI prediction for a sequence or AA name
GET  /amino-acids              → reference table of all 20 standard AAs
GET  /titration-curve?sequence → Henderson-Hasselbalch charge vs pH data
GET  /model-metrics            → RMSE / MAE / R² for all three models
GET  /model-info               → metrics + classical baselines + feature importance
POST /ai/insight               → LLM lab note grounded in model numbers
POST /ai/design                → closed-loop LLM ⇄ ML inverse peptide design
POST /ai/tune                  → LLM point mutations, re-scored by ML
"""

import os
import threading
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

import model as ml
import llm
from data import (
    amino_acids_as_dicts,
    lookup_amino_acid,
    titration_curve,
    physics_pI_estimate,
    VALID_AAS,
    classical_pIs,
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
    version="2.0.0",
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

class InsightRequest(BaseModel):
    sequence: str
    working_pH: float = Field(7.4, ge=0, le=14)

class DesignRequest(BaseModel):
    goal: str = Field(..., min_length=5, max_length=600)
    max_rounds: int = Field(3, ge=1, le=4)

class TuneRequest(BaseModel):
    sequence: str
    target_pI: float = Field(..., ge=2, le=13)


def _require_ready():
    if not _model_ready:
        raise HTTPException(status_code=503, detail="Models are still training. Try again in a moment.")


def _require_llm():
    if not llm.available():
        raise HTTPException(status_code=503, detail="AI features are disabled: GROQ_API_KEY is not set on the server.")


def _clean_sequence(raw: str, max_len: int = 5000) -> str:
    aa_row = lookup_amino_acid(raw.strip())
    seq = aa_row[1] if aa_row else raw.upper().replace(" ", "").strip()
    if not seq:
        raise HTTPException(status_code=400, detail="Sequence cannot be empty.")
    bad = {c for c in seq if c not in VALID_AAS}
    if bad:
        raise HTTPException(status_code=400, detail=f"Invalid character(s): {', '.join(sorted(bad))}.")
    if len(seq) > max_len:
        raise HTTPException(status_code=400, detail=f"Sequence longer than {max_len} residues.")
    return seq

# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.api_route("/health", methods=["GET", "HEAD"])
def health_check():
    """
    Status probe. Also served at / when no built frontend is present.

    HEAD is allowed because uptime monitors (UptimeRobot and friends) send HEAD
    by default; FastAPI does not add it automatically, and a bare @app.get here
    answers those pings with 405, which reads as an outage.
    """
    return {"status": "ok", "model_trained": _model_ready, "llm_available": llm.available()}


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
        "base_pI":           preds["base_pI"],
        "ml_correction":     preds["ml_correction"],
        "in_domain":         preds["in_domain"],
        "classical":         classical_pIs(sequence),
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


@app.get("/model-info")
def get_model_info():
    _require_ready()
    return ml.get_meta()

# ---------------------------------------------------------------------------
# AI (Groq) endpoints — the LLM proposes, the ML model verifies
# ---------------------------------------------------------------------------

def _run_llm(fn, *args):
    try:
        return fn(*args)
    except llm.LLMError as e:
        raise HTTPException(status_code=502, detail=str(e))


@app.post("/ai/insight")
def ai_insight(req: InsightRequest):
    _require_ready(); _require_llm()
    return _run_llm(llm.lab_insight, _clean_sequence(req.sequence), req.working_pH)


@app.post("/ai/design")
def ai_design(req: DesignRequest):
    _require_ready(); _require_llm()
    return _run_llm(llm.design, req.goal.strip(), req.max_rounds)


@app.post("/ai/tune")
def ai_tune(req: TuneRequest):
    _require_ready(); _require_llm()
    seq = _clean_sequence(req.sequence, max_len=200)
    if len(seq) < 2:
        raise HTTPException(status_code=400, detail="Tuning needs a peptide of at least 2 residues.")
    return _run_llm(llm.tune, seq, req.target_pI)


# ---------------------------------------------------------------------------
# Single-service hosting: serve the built React app from this same server.
# If frontend/dist exists (Render builds it), the API and the UI share one
# origin — no second host, no CORS.  Mounted last so /predict etc. win.
# ---------------------------------------------------------------------------
_DIST = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "frontend", "dist")

if not os.path.isdir(_DIST):
    # API-only deployment (local dev, split hosting). HEAD too, for uptime monitors.
    app.api_route("/", methods=["GET", "HEAD"])(health_check)
else:
    app.mount("/assets", StaticFiles(directory=os.path.join(_DIST, "assets")), name="assets")

    @app.api_route("/{full_path:path}", methods=["GET", "HEAD"], include_in_schema=False)
    def spa(full_path: str):
        candidate = os.path.normpath(os.path.join(_DIST, full_path))
        if full_path and candidate.startswith(_DIST) and os.path.isfile(candidate):
            return FileResponse(candidate)
        return FileResponse(os.path.join(_DIST, "index.html"))   # client-side routing
