"""
labtools.py — the deterministic bench tools.

Nothing here uses a language model. Every number is computed from the trained
model or from the Henderson-Hasselbalch code, so each of these answers is
reproducible: run it twice, get the same thing. That matters for anything a
chemist would write into a lab notebook.
"""

import re

import model as ml
from data import VALID_AAS, charge_at_pH, lookup_amino_acid

# ---------------------------------------------------------------------------
# Reading what a chemist actually pastes
# ---------------------------------------------------------------------------

def parse_sequences(text: str, limit: int = 500) -> dict:
    """
    Accept FASTA, one-per-line, or comma separated, and say what was dropped.

    FASTA is the format sequences arrive in from UniProt, PDB and every
    sequencing tool, so pasting a FASTA file has to just work.
    """
    entries, errors = [], []
    name, buf, in_record = None, [], False

    def take(raw: str, label):
        seq = re.sub(r"[^A-Za-z]", "", raw).upper()
        if not seq:
            return
        bad = sorted({c for c in seq if c not in VALID_AAS})
        if bad:
            errors.append({"name": label or seq[:16],
                           "reason": f"not standard residue code(s): {', '.join(bad)}"})
        else:
            entries.append({"name": label or f"seq{len(entries) + 1}", "sequence": seq})

    def flush():
        """
        Close the open FASTA record. A record's lines are one wrapped sequence,
        which is what FASTA means — but if joining them produces something that
        is not a peptide, the paste was probably a header followed by a list.
        Rather than lose those sequences, fall back to one per line.
        """
        nonlocal buf
        if not buf:
            return
        joined = re.sub(r"[^A-Za-z]", "", "".join(buf)).upper()
        if joined and all(c in VALID_AAS for c in joined):
            take(joined, name)
        elif len(buf) > 1 and any(
                re.sub(r"[^A-Za-z]", "", ln).upper()
                and all(c in VALID_AAS for c in re.sub(r"[^A-Za-z]", "", ln).upper())
                for ln in buf):
            for i, ln in enumerate(buf):
                take(ln, name if i == 0 else None)
        else:
            take(joined, name)          # report it as the one bad record it is
        buf = []

    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        if line.startswith(">"):                 # FASTA header: a named record starts
            flush()
            name, in_record = line[1:].strip()[:60] or None, True
            continue
        if "," in line or "\t" in line:          # CSV / TSV: several per line
            flush()
            in_record = False
            for part in re.split(r"[,\t]", line):
                if part.strip():
                    take(part, None)
            continue
        if in_record:
            buf.append(line)                     # FASTA wraps one sequence over lines
        else:
            take(line, None)                     # a bare list is one per line
    flush()

    # A name the user gave may repeat; make them unique so a CSV stays readable.
    seen = {}
    for e in entries:
        n = e["name"]
        seen[n] = seen.get(n, 0) + 1
        if seen[n] > 1:
            e["name"] = f"{n} ({seen[n]})"

    truncated = len(entries) > limit
    return {"entries": entries[:limit], "errors": errors, "truncated": truncated,
            "count": min(len(entries), limit)}


def predict_batch(entries: list) -> dict:
    """Score many sequences in one pass and return a table a lab can export."""
    seqs = [e["sequence"] for e in entries]
    if not seqs:
        return {"rows": []}
    preds = ml.predict_many(seqs)
    rows = []
    for e, p in zip(entries, preds):
        seq = e["sequence"]
        n = len(seq)
        rows.append({
            "name": e["name"],
            "sequence": seq,
            "length": n,
            "pI": p["pI"],
            "ci_low": p["ci_low"],
            "ci_high": p["ci_high"],
            "reliable": p["in_domain"],
            "charge_pH7_4": charge_at_pH(seq, 7.4),
            "acidic_pct": round((seq.count("D") + seq.count("E")) / n * 100, 1),
            "basic_pct": round((seq.count("R") + seq.count("K") + seq.count("H")) / n * 100, 1),
        })
    return {"rows": rows}


def to_csv(rows: list) -> str:
    """A plain CSV, because a lab notebook is a spreadsheet more often than not."""
    cols = ["name", "sequence", "length", "pI", "ci_low", "ci_high",
            "reliable", "charge_pH7_4", "acidic_pct", "basic_pct"]
    out = [",".join(cols)]
    for r in rows:
        vals = []
        for c in cols:
            v = r[c]
            v = "yes" if v is True else "no" if v is False else str(v)
            vals.append(f'"{v}"' if "," in v else v)
        out.append(",".join(vals))
    return "\n".join(out)


# ---------------------------------------------------------------------------
# Charge at a chosen pH
# ---------------------------------------------------------------------------

def charge_report(sequence: str, pH: float) -> dict:
    """What the molecule is doing at the pH the chemist actually plans to use."""
    pI = ml.predict(sequence)["best_prediction"]
    q = charge_at_pH(sequence, pH)
    if q > 0.2:
        state, moves = "positively charged", "toward the cathode (negative electrode)"
    elif q < -0.2:
        state, moves = "negatively charged", "toward the anode (positive electrode)"
    else:
        state, moves = "close to neutral", "barely at all"
    return {
        "sequence": sequence, "pH": pH, "net_charge": q, "pI": pI,
        "state": state, "moves": moves,
        "binds": ("a cation exchanger (negatively charged resin)" if q > 0.2
                  else "an anion exchanger (positively charged resin)" if q < -0.2
                  else "neither resin well — it has almost no charge to grip"),
        "near_pI": abs(pH - pI) < 0.5,
    }


# ---------------------------------------------------------------------------
# Purification protocol — rules, not a language model
# ---------------------------------------------------------------------------

_WORKABLE = (3.5, 10.5)     # buffers outside this damage most peptides


def protocol(sequence: str) -> dict:
    """
    Turn a pI into the two decisions a chemist has to make: which resin, and
    what buffer pH. Both options are shown with the charge they produce, so
    the recommendation can be checked rather than trusted.
    """
    p = ml.predict(sequence)
    pI = p["best_prediction"]

    # A buffer one unit from the pI is the textbook rule of thumb, but on a
    # strongly acidic or basic peptide that lands outside a usable range, or
    # leaves too little charge to grip the resin. So we scan the workable
    # window for a pH that actually delivers charge, preferring one near
    # neutral, where peptides are most stable.
    grid = [round(_WORKABLE[0] + 0.1 * i, 1)
            for i in range(int((_WORKABLE[1] - _WORKABLE[0]) / 0.1) + 1)]

    options = []
    for mode, resin, sign in (
        ("cation exchange", "strong cation exchanger (SP / sulfopropyl)", +1),
        ("anion exchange",  "strong anion exchanger (Q / quaternary amine)", -1),
    ):
        usable = [(ph, charge_at_pH(sequence, ph)) for ph in grid]
        strong = [(ph, q) for ph, q in usable if sign * q >= 1.0]
        if strong:
            ph, q = min(strong, key=lambda t: abs(t[0] - 7.0))   # closest to neutral
        else:
            ph, q = max(usable, key=lambda t: sign * t[1])       # best we can do
        options.append({
            "mode": mode, "resin": resin, "buffer_pH": ph, "net_charge": q,
            "workable": True, "binds": sign * q >= 1.0,
            "why": (f"At pH {ph} the peptide carries {q:+.2f} net charge, so it "
                    f"sticks to {'a negatively' if sign > 0 else 'a positively'} charged resin."
                    if sign * q >= 1.0 else
                    f"Even at its best pH in the usable range the charge only reaches "
                    f"{q:+.2f}, which is too weak to bind this resin reliably."),
        })
    binders = [o for o in options if o["binds"]]
    recommended = max(binders, key=lambda o: abs(o["net_charge"]))["mode"] if binders else None

    return {
        "sequence": sequence,
        "pI": pI,
        "reliable": p["in_domain"],
        "options": options,
        "recommended": recommended,
        "avoid_pH_band": [round(pI - 0.5, 2), round(pI + 0.5, 2)],
        "solubility_note": (
            f"Solubility is at its minimum at the pI. Keep the peptide away from "
            f"pH {pI - 0.5:.2f}–{pI + 0.5:.2f} during storage or it may precipitate."
        ),
        "caveat": None if p["in_domain"] else (
            "This pI falls outside the range our laboratory data covers, so it is "
            "the textbook estimate with no learned correction. Treat the buffer "
            "numbers as a starting point and confirm experimentally."
        ),
    }


# ---------------------------------------------------------------------------
# Exhaustive single-mutation scan
# ---------------------------------------------------------------------------

MAX_SCAN_LEN = 40


def mutation_scan(sequence: str, top: int = 15) -> dict:
    """
    Try EVERY possible single substitution and rank them by how far they move
    the pI.

    The AI tuner proposes a handful of clever mutations. This does the opposite:
    it is exhaustive, so nothing is missed, and the result is identical every
    time it runs. Between them you get both creativity and completeness.
    """
    seq = sequence.upper().strip()
    n = len(seq)
    if n > MAX_SCAN_LEN:
        raise ValueError(f"The scan covers sequences up to {MAX_SCAN_LEN} residues; "
                         f"this one is {n}.")

    base = ml.predict(seq)["best_prediction"]
    variants, labels = [], []
    for i, wt in enumerate(seq):
        for new in sorted(VALID_AAS):
            if new == wt:
                continue
            variants.append(seq[:i] + new + seq[i + 1:])
            labels.append((f"{wt}{i + 1}{new}", i + 1, wt, new))

    scored = ml.predict_many(variants)
    rows = []
    for (code, pos, wt, new), p in zip(labels, scored):
        rows.append({
            "mutation": code, "position": pos, "from": wt, "to": new,
            "sequence": p["sequence"], "pI": p["pI"],
            "shift": round(p["pI"] - base, 3), "reliable": p["in_domain"],
        })

    up = sorted(rows, key=lambda r: -r["shift"])[:top]
    down = sorted(rows, key=lambda r: r["shift"])[:top]

    # Which position is the most sensitive overall — useful when deciding where
    # it is safe to mutate for some other reason.
    by_pos = {}
    for r in rows:
        by_pos.setdefault(r["position"], []).append(abs(r["shift"]))
    sensitivity = [
        {"position": pos, "residue": seq[pos - 1],
         "max_shift": round(max(v), 3), "mean_shift": round(sum(v) / len(v), 3)}
        for pos, v in sorted(by_pos.items())
    ]

    return {
        "sequence": seq, "base_pI": base, "variants_tested": len(rows),
        "raises_pI": up, "lowers_pI": down, "sensitivity": sensitivity,
        "note": "Every possible single substitution was tested — "
                f"{len(rows)} variants. This search is exhaustive and repeatable.",
    }
