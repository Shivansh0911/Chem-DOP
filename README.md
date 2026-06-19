# pI Predictor — ML-based Isoelectric Point Prediction

A full-stack machine learning web app that predicts the **isoelectric point (pI)** of amino acids and peptides, trained on ~7,500 experimental measurements.

---

## What is pI and Why Does It Matter?

The **isoelectric point (pI)** is the pH at which a molecule carries zero net electrical charge. For amino acids and peptides, pI is determined by the collective protonation equilibria of all ionisable groups (α-amino, α-carboxyl, and ionisable side chains) governed by the Henderson-Hasselbalch equation.

### Why pI Matters

| Application | How pI is Used |
|---|---|
| **2-D Gel Electrophoresis** | First dimension separates proteins by pI (isoelectric focusing) |
| **Protein Purification** | Ion-exchange chromatography uses pI to select binding/elution pH |
| **Drug Formulation** | Therapeutic peptides are formulated near pI for maximum stability |
| **Protein Solubility** | Proteins have minimum solubility at pI (important for crystallisation) |
| **Protein–Protein Interactions** | Charge complementarity drives many binding interfaces |

---

## Dataset

**Source:** Pérez-Riverol Y. et al., "Prediction of Isoelectric Point for Diverse Proteins Using Random Forest and Gradient Boosting," *Bioinformatics* 2016.

**Repository:** `github.com/bigbio/pIR`

| Dataset | Rows |
|---|---|
| Peptide pIs (`dataPeptidePIs.csv`) | ~3,500 |
| Protein pIs (`dataProteinPIs.csv`) | ~4,000 |
| **Combined (after cleaning)** | **~7,500** |

Both CSVs contain:
- `sequence` — amino acid sequence (single-letter codes)
- `pIExp` — experimentally measured pI (ground truth)
- Algorithm columns (`bjell`, `expasy`, `solomon`, `rodwell`) — prior predictions used as features

---

## Feature Engineering

Each sequence is converted to a 28-dimensional feature vector:

```
length, log_length                  — sequence size (log-scaled for long proteins)
acidic_frac (D+E)                   — fraction of negatively charged residues
basic_frac  (R+K+H)                 — fraction of positively charged residues
aromatic_frac (F+W+Y)               — aromatic character
nonpolar_frac (A+V+L+I+M+P)        — hydrophobic core
polar_uncharged_frac (S+T+N+Q+C+G) — polar but neutral
charge_proxy = basic_frac - acidic_frac  ← strongest single predictor
aa_A … aa_Y                         — per-residue fractional composition (20 features)
```

Algorithm predictions (`bjell`, `expasy`, `solomon`, `rodwell`) are appended as extra features, allowing the ML model to learn systematic biases in each classical calculator.

**Why composition predicts pI:**
The pI of a protein is dominated by its charged residue ratio. A sequence rich in Asp/Glu (acidic, pKa ~3.9–4.2) will have pI near 3–5; one rich in Arg/Lys (basic, pKa ~10.5–12.5) will have pI near 9–11. The tree ensemble learns non-linear interactions between these ratios that no fixed pKa table can capture.

---

## ML Models

| Model | Algorithm | Key Hyperparameters | Notes |
|---|---|---|---|
| Random Forest | Bagged decision trees | 300 trees, no max depth | Robust; provides confidence interval via tree spread |
| Gradient Boosting | Sequential boosting | 200 rounds, lr=0.05, depth=5 | Usually lowest RMSE |
| Ridge Regression | L2-penalised linear | α=1.0 | Linear baseline; fastest |

**Train/test split:** 80/20 stratified by `round(pI)` — ensures all pI ranges are proportionally represented.

**Model Comparison (fill after training):**

| Model | RMSE | MAE | R² |
|---|---|---|---|
| Random Forest | TBD | TBD | TBD |
| Gradient Boosting | TBD | TBD | TBD |
| Ridge | TBD | TBD | TBD |

---

## Running Locally

### Backend (FastAPI)

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
```

On first run, the server will:
1. Download both CSV datasets from GitHub (~seconds)
2. Train all three models (~60–90 seconds on a modern CPU)
3. Save model files to `backend/models/`
4. Subsequent startups load from disk instantly

API available at `http://localhost:8000`  
Docs at `http://localhost:8000/docs`

### Frontend (React + Vite)

```bash
cd frontend
npm install
npm run dev
```

App available at `http://localhost:5173`

> The Vite dev server proxies `/api` → `http://localhost:8000`, so no CORS issues during development.

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/` | Health check + model status |
| `POST` | `/predict` | pI prediction for a sequence or AA name |
| `GET` | `/amino-acids` | All 20 standard amino acids with properties |
| `GET` | `/titration-curve?sequence=...` | Charge vs pH data (Henderson-Hasselbalch) |
| `GET` | `/model-metrics` | RMSE / MAE / R² for all three models |

---

## Hosting (Free Tier)

### Backend → Render.com

1. Push repository to GitHub
2. New Web Service → root directory: `/backend`
3. Build command: `pip install -r requirements.txt`
4. Start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
5. Models train on first boot (~2 min); cached on disk via persistent disk or retrained each cold start

### Frontend → Vercel

1. New Project → root directory: `/frontend`
2. Framework: Vite (auto-detected)
3. Add environment variable: `VITE_API_URL=https://your-render-app.onrender.com`
4. Deploy

---

## Project Structure

```
amino-pi-predictor/
├── backend/
│   ├── main.py         — FastAPI app + endpoints
│   ├── model.py        — training pipeline, save/load, predict + confidence interval
│   ├── data.py         — AA reference table, dataset download, feature engineering, titration curve
│   ├── requirements.txt
│   └── models/         — auto-created: rf.pkl, gb.pkl, ridge.pkl, scaler.pkl, meta.pkl
└── frontend/
    ├── src/
    │   ├── App.jsx
    │   └── components/
    │       ├── SearchBar.jsx       — input with live sequence validation
    │       ├── ResultCard.jsx      — predicted pI + confidence bar + charge stats
    │       ├── TitrationCurve.jsx  — Recharts LineChart of charge vs pH
    │       ├── ModelComparison.jsx — three-model comparison cards with test metrics
    │       └── AminoAcidTable.jsx  — sortable/filterable 20-AA reference table
    ├── index.html
    ├── tailwind.config.js
    ├── vite.config.js
    └── package.json
```
