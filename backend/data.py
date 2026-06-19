"""
data.py — Reference amino acid data, dataset download, and feature engineering.

The isoelectric point (pI) is the pH at which a molecule carries no net charge.
For amino acids, it depends on the pKa values of the ionizable groups:
  - N-terminal amino group (always present, basic)
  - C-terminal carboxyl group (always present, acidic)
  - Side-chain R group (only in Asp, Glu, Cys, Tyr, His, Lys, Arg)

At pH < pI the molecule is net positive; at pH > pI it is net negative.
"""

import math
import io
import os
import requests
import pandas as pd
import numpy as np

# ---------------------------------------------------------------------------
# Reference table — 20 standard amino acids
# Fields: name, 1-letter, 3-letter, known_pI, MW (Da),
#         pKa_NH2 (alpha-amino), pKa_COOH (alpha-carboxyl), pKa_R (side chain),
#         hydrophobicity (Kyte-Doolittle scale)
# ---------------------------------------------------------------------------
AMINO_ACIDS = [
    ("Alanine",       "A", "Ala",  6.01,  89.09,  9.69, 2.34, None,   1.8),
    ("Arginine",      "R", "Arg", 10.76, 174.20,  9.04, 2.17, 12.48, -4.5),
    ("Asparagine",    "N", "Asn",  5.41, 132.12,  8.80, 2.02, None,  -3.5),
    ("Aspartic Acid", "D", "Asp",  2.85, 133.10,  9.82, 1.88,  3.65, -3.5),
    ("Cysteine",      "C", "Cys",  5.07, 121.16, 10.78, 1.96,  8.18,  2.5),
    ("Glutamine",     "Q", "Gln",  5.65, 146.15,  9.13, 2.17, None,  -3.5),
    ("Glutamic Acid", "E", "Glu",  3.15, 147.13,  9.47, 2.19,  4.25, -3.5),
    ("Glycine",       "G", "Gly",  6.06,  75.03,  9.60, 2.34, None,  -0.4),
    ("Histidine",     "H", "His",  7.60, 155.16,  9.17, 1.82,  6.00, -3.2),
    ("Isoleucine",    "I", "Ile",  6.05, 131.17,  9.68, 2.36, None,   4.5),
    ("Leucine",       "L", "Leu",  6.01, 131.17,  9.60, 2.36, None,   3.8),
    ("Lysine",        "K", "Lys",  9.60, 146.19,  8.95, 2.18, 10.53, -3.9),
    ("Methionine",    "M", "Met",  5.74, 149.21,  9.21, 2.28, None,   1.9),
    ("Phenylalanine", "F", "Phe",  5.49, 165.19,  9.13, 1.83, None,   2.8),
    ("Proline",       "P", "Pro",  6.30, 115.13, 10.60, 1.99, None,  -1.6),
    ("Serine",        "S", "Ser",  5.68, 105.09,  9.15, 2.21, None,  -0.8),
    ("Threonine",     "T", "Thr",  6.16, 119.12,  9.10, 2.09, None,  -0.7),
    ("Tryptophan",    "W", "Trp",  5.89, 204.23,  9.39, 2.38, None,  -0.9),
    ("Tyrosine",      "Y", "Tyr",  5.64, 181.19,  9.11, 2.20, 10.07, -1.3),
    ("Valine",        "V", "Val",  5.97, 117.15,  9.62, 2.32, None,   4.2),
]

# Build lookup dicts for fast resolution of user input
_BY_1L   = {row[1].upper(): row for row in AMINO_ACIDS}
_BY_3L   = {row[2].lower(): row for row in AMINO_ACIDS}
_BY_NAME = {row[0].lower(): row for row in AMINO_ACIDS}

def lookup_amino_acid(query: str):
    """Return the AMINO_ACIDS row matching query (1L, 3L, or full name), or None."""
    q = query.strip()
    if len(q) == 1:
        return _BY_1L.get(q.upper())
    if len(q) == 3:
        return _BY_3L.get(q.lower())
    return _BY_NAME.get(q.lower())

def amino_acids_as_dicts():
    """Return the reference table as a list of dicts for the API."""
    keys = ["name", "code_1l", "code_3l", "pI", "mw",
            "pka_nh2", "pka_cooh", "pka_r", "hydrophobicity"]
    return [dict(zip(keys, row)) for row in AMINO_ACIDS]

# ---------------------------------------------------------------------------
# Dataset download
# ---------------------------------------------------------------------------
PEPTIDE_DATA_URL = (
    "https://raw.githubusercontent.com/bigbio/pIR/master/"
    "inst/extdata/dataPeptidePIs.csv"
)
PROTEIN_DATA_URL = (
    "https://raw.githubusercontent.com/bigbio/pIR/master/"
    "inst/extdata/dataProteinPIs.csv"
)

VALID_AAS = set("ACDEFGHIKLMNPQRSTVWY")

_DATA_DIR = os.path.dirname(os.path.abspath(__file__))
_PEPTIDE_CACHE = os.path.join(_DATA_DIR, "dataPeptidePIs.csv")
_PROTEIN_CACHE  = os.path.join(_DATA_DIR, "dataProteinPIs.csv")

def _fetch_csv(url: str, cache_path: str) -> pd.DataFrame:
    if os.path.exists(cache_path):
        print(f"  Using cached file: {os.path.basename(cache_path)}")
        return pd.read_csv(cache_path)
    resp = requests.get(url, timeout=60)
    resp.raise_for_status()
    with open(cache_path, "w", encoding="utf-8") as f:
        f.write(resp.text)
    return pd.read_csv(io.StringIO(resp.text))

def _is_valid_sequence(seq) -> bool:
    if not isinstance(seq, str) or len(seq) == 0:
        return False
    return all(c in VALID_AAS for c in seq.upper().strip())

def download_and_merge_datasets() -> pd.DataFrame:
    """
    Download (or load from local cache) peptide and protein pI datasets,
    combine, and return a clean DataFrame.
    """
    print("Loading peptide dataset...")
    peptides = _fetch_csv(PEPTIDE_DATA_URL, _PEPTIDE_CACHE)
    print(f"  Peptide rows: {len(peptides)}")

    print("Loading protein dataset...")
    proteins = _fetch_csv(PROTEIN_DATA_URL, _PROTEIN_CACHE)
    print(f"  Protein rows: {len(proteins)}")

    # Normalise column names to lowercase
    peptides.columns = [c.lower().strip() for c in peptides.columns]
    proteins.columns = [c.lower().strip() for c in proteins.columns]

    # Keep only rows that have both sequence and experimental pI
    combined = pd.concat([peptides, proteins], ignore_index=True)
    before = len(combined)

    combined = combined.dropna(subset=["sequence", "piexp"])
    combined = combined[combined["sequence"].apply(_is_valid_sequence)]
    combined["sequence"] = combined["sequence"].str.upper().str.strip()

    print(f"  Combined after cleaning: {len(combined)} / {before} rows kept")
    return combined.reset_index(drop=True)

# ---------------------------------------------------------------------------
# Feature engineering
# ---------------------------------------------------------------------------
# Side-chain pKa values used for Henderson-Hasselbalch titration curves.
# Only residues with ionisable side chains are listed.
_PKA_SIDE_CHAINS = {
    "D": ("acid",  3.65),   # Asp — carboxyl side chain
    "E": ("acid",  4.25),   # Glu — carboxyl side chain
    "C": ("acid",  8.18),   # Cys — thiol
    "Y": ("acid", 10.07),   # Tyr — phenol
    "H": ("base",  6.00),   # His — imidazole
    "K": ("base", 10.53),   # Lys — epsilon-amino
    "R": ("base", 12.48),   # Arg — guanidinium
}

# Backbone pKa values used for the terminal groups
_PKA_NTERM = 8.0   # approximate alpha-amino
_PKA_CTERM = 3.1   # approximate alpha-carboxyl


def extract_features(sequence: str) -> dict:
    """
    Convert a raw amino acid sequence into a numerical feature vector.

    Why composition predicts pI:
    - Acidic residues (D, E) lower pI; basic residues (K, R, H) raise it.
    - The charge_proxy (basic_frac - acidic_frac) is the single strongest
      predictor: a large positive value → basic protein (high pI), negative → acidic.
    - Aromatic, nonpolar, and polar-uncharged fractions capture hydrophobic
      character and secondary structural tendencies that correlate weakly with pI.
    - Log-length matters because termini contribute fixed pKa values; in a long
      sequence those terminal charges are diluted by the bulk residue distribution.
    - Including pre-computed algorithm outputs (bjell, expasy, etc.) as features
      lets the ML model learn to correct systematic biases in each calculator.
    """
    seq = sequence.upper().strip()
    n = len(seq)

    aa_fracs = {aa: seq.count(aa) / n for aa in VALID_AAS}

    acidic          = (seq.count("D") + seq.count("E")) / n
    basic           = (seq.count("R") + seq.count("K") + seq.count("H")) / n
    aromatic        = (seq.count("F") + seq.count("W") + seq.count("Y")) / n
    nonpolar        = (seq.count("A") + seq.count("V") + seq.count("L") +
                       seq.count("I") + seq.count("M") + seq.count("P")) / n
    polar_uncharged = (seq.count("S") + seq.count("T") + seq.count("N") +
                       seq.count("Q") + seq.count("C") + seq.count("G")) / n
    charge_proxy    = basic - acidic

    return {
        "length":               n,
        "log_length":           math.log(n + 1),
        "acidic_frac":          acidic,
        "basic_frac":           basic,
        "aromatic_frac":        aromatic,
        "nonpolar_frac":        nonpolar,
        "polar_uncharged_frac": polar_uncharged,
        "charge_proxy":         charge_proxy,
        **{f"aa_{aa}": aa_fracs[aa] for aa in sorted(VALID_AAS)},
    }

# Algorithm columns present in both CSVs (used as extra features if available)
ALGO_COLUMNS = ["bjell", "expasy", "solomon", "rodwell"]

def build_feature_matrix(df: pd.DataFrame):
    """
    Build X (feature matrix) and y (target vector) from the combined dataset.
    Algorithm-predicted columns are appended when present.
    Returns (X: np.ndarray, y: np.ndarray, feature_names: list[str])
    """
    base_features = [extract_features(seq) for seq in df["sequence"]]
    X_base = pd.DataFrame(base_features)

    algo_frames = []
    for col in ALGO_COLUMNS:
        if col in df.columns:
            algo_frames.append(df[col].astype(float).rename(f"algo_{col}"))

    if algo_frames:
        X = pd.concat([X_base] + algo_frames, axis=1)
    else:
        X = X_base

    # Fill any NaN in algo columns (some rows may be missing) with median
    X = X.fillna(X.median(numeric_only=True))

    y = df["piexp"].values.astype(float)
    return X.values, y, list(X.columns)

# ---------------------------------------------------------------------------
# Titration curve — Henderson-Hasselbalch
# ---------------------------------------------------------------------------

def compute_charge(sequence: str, pH: float) -> float:
    """
    Net charge of a peptide at a given pH using Henderson-Hasselbalch.

    For a basic group (proton donor at low pH, acceptor at high pH):
        charge contribution = +1 / (1 + 10^(pH - pKa))
    For an acidic group (neutral at low pH, deprotonated/negative at high pH):
        charge contribution = -1 / (1 + 10^(pKa - pH))
    Summation over all ionisable sites gives the net charge.
    """
    seq = sequence.upper().strip()
    charge = 0.0

    # N-terminus (basic)
    charge += 1.0 / (1.0 + 10 ** (pH - _PKA_NTERM))
    # C-terminus (acidic)
    charge -= 1.0 / (1.0 + 10 ** (_PKA_CTERM - pH))

    for aa in seq:
        if aa in _PKA_SIDE_CHAINS:
            kind, pka = _PKA_SIDE_CHAINS[aa]
            if kind == "base":
                charge += 1.0 / (1.0 + 10 ** (pH - pka))
            else:
                charge -= 1.0 / (1.0 + 10 ** (pka - pH))

    return round(charge, 4)

def titration_curve(sequence: str, step: float = 0.1):
    """Return list of {pH, charge} dicts from pH 0 to 14."""
    phs = [round(i * step, 2) for i in range(int(14 / step) + 1)]
    return [{"pH": ph, "charge": compute_charge(sequence, ph)} for ph in phs]

def physics_pI_estimate(sequence: str) -> float:
    """
    Estimate pI by bisection: find pH where net charge ≈ 0.
    This is a classical Henderson-Hasselbalch estimate, not ML.
    """
    lo, hi = 0.0, 14.0
    for _ in range(100):
        mid = (lo + hi) / 2.0
        c = compute_charge(sequence, mid)
        if abs(c) < 1e-6:
            return round(mid, 2)
        if c > 0:
            lo = mid
        else:
            hi = mid
    return round((lo + hi) / 2.0, 2)
