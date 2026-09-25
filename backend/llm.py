"""
llm.py — Groq-powered reasoning layer on top of the pI model.

Design principle: "the LLM proposes, the model disposes".
  The LLM never invents a pI.  Every number it sees comes from our ML model /
  Henderson-Hasselbalch code, and every sequence it proposes is re-scored by
  the ML model before it reaches the user.  The LLM contributes what ML can't:
  turning a plain-English goal into a spec, proposing chemically sensible
  candidates/mutations, and translating numbers into a lab protocol.

Three features:
  1. lab_insight()   — grounded interpretation + wet-lab strategy for one sequence
  2. design()        — closed-loop inverse design: goal → spec → propose → score → refine
  3. tune()          — point-mutation suggestions to move a sequence to a target pI
"""

import json
import os
import re

import httpx

import model as ml
from data import VALID_AAS, charge_at_pH, classical_pIs, physics_pI_estimate

GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"


def _load_dotenv():
    """Tiny .env loader so local dev needs no extra dependency."""
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
    if not os.path.exists(path):
        return
    for line in open(path, encoding="utf-8"):
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip())

_load_dotenv()


class LLMError(RuntimeError):
    pass


def available() -> bool:
    return bool(os.environ.get("GROQ_API_KEY"))


def _chat_json(system: str, user: str, temperature: float = 0.4) -> dict:
    key = os.environ.get("GROQ_API_KEY")
    if not key:
        raise LLMError("GROQ_API_KEY is not configured on the server.")
    body = {
        "model": os.environ.get("GROQ_MODEL", "openai/gpt-oss-120b"),
        "messages": [
            {"role": "system", "content": system + "\nRespond with a single valid JSON object only."},
            {"role": "user", "content": user},
        ],
        "response_format": {"type": "json_object"},
        "temperature": temperature,
    }
    if "gpt-oss" in body["model"]:
        body["reasoning_effort"] = "low"
    try:
        r = httpx.post(GROQ_URL, json=body, timeout=60,
                       headers={"Authorization": f"Bearer {key}"})
    except httpx.HTTPError as e:
        raise LLMError(f"Could not reach Groq: {e}") from e
    if r.status_code != 200:
        raise LLMError(f"Groq returned {r.status_code}: {r.text[:200]}")
    content = r.json()["choices"][0]["message"]["content"]
    try:
        return json.loads(content)
    except json.JSONDecodeError as e:
        raise LLMError("LLM returned malformed JSON.") from e


def _clean_seq(s) -> str:
    return re.sub(r"[^A-Z]", "", str(s).upper())


# ---------------------------------------------------------------------------
# Shared: the "fact sheet" — deterministic numbers the LLM must reason from
# ---------------------------------------------------------------------------

def fact_sheet(sequence: str, working_pH: float) -> dict:
    p = ml.predict(sequence)
    counts = {aa: sequence.count(aa) for aa in "DEKRHCY"}
    pis = classical_pIs(sequence)
    return {
        "sequence": sequence,
        "length": len(sequence),
        "ml_pI": p["best_prediction"],
        "ml_90pct_interval": [p["confidence_low"], p["confidence_high"]],
        "physics_baseline_pI": p["base_pI"],
        "ml_correction_to_physics": p["ml_correction"],
        "classical_calculator_range": [min(pis.values()), max(pis.values())],
        "ionisable_residue_counts": counts,
        "net_charge_at_working_pH": charge_at_pH(sequence, working_pH),
        "net_charge_at_pH_7_4": charge_at_pH(sequence, 7.4),
        "working_pH": working_pH,
        "inside_training_domain": p["in_domain"],
        "ml_trust_weight": p["ml_weight"],
    }


# ---------------------------------------------------------------------------
# 1. Lab insight
# ---------------------------------------------------------------------------

_INSIGHT_SYSTEM = """You are a senior protein biochemist writing a short, practical lab note.
You receive a FACT SHEET computed by a validated ML model and Henderson-Hasselbalch code.
Rules:
- Use ONLY numbers from the fact sheet. Never invent a pI or charge.
- Explain *which residues* drive the pI and why (pKa reasoning), in plain language a
  2nd-year chemistry student can follow.
- ml_correction_to_physics = ml_pI - physics_baseline_pI. Negative means experiments on
  similar sequences came out MORE ACIDIC than the pKa table predicts; positive means MORE BASIC.
  State the direction correctly. If |correction| > 0.3, give a plausible reason (terminal
  effects, neighbouring like-charges suppressing ionisation, His/Cys/Tyr environment).
- If inside_training_domain is false, say the ML correction was faded out (ml_trust_weight)
  because the sequence lies outside the experimental data (too short, or pI beyond ~9.6),
  so the value is mostly physics.
- Use the actual ml_pI when deciding the resin. Double-check the sign rule before answering.
- Lab advice must follow the sign rules: buffer pH below pI => molecule is positive =>
  binds a CATION exchanger (e.g. SP/CM resin); buffer pH above pI => negative => binds an
  ANION exchanger (e.g. Q/DEAE). Pick a buffer ~1 pH unit from pI. Minimum solubility at pI.
Return JSON:
{"headline": str (one sentence),
 "drivers": [str, ...] (2-4 bullets naming residues and their pKa role),
 "model_vs_physics": str (1-2 sentences),
 "at_working_pH": str (charge state and electrophoretic direction: toward cathode(-) or anode(+)),
 "purification": {"resin": str, "buffer_pH": number, "why": str},
 "solubility_warning": str,
 "caveats": [str, ...]}"""


def lab_insight(sequence: str, working_pH: float = 7.4) -> dict:
    facts = fact_sheet(sequence, working_pH)
    out = _chat_json(_INSIGHT_SYSTEM, "FACT SHEET:\n" + json.dumps(facts, indent=1), 0.3)
    return {"facts": facts, "insight": out}


# ---------------------------------------------------------------------------
# 2. Closed-loop inverse design
# ---------------------------------------------------------------------------

_SPEC_SYSTEM = """You convert a scientist's plain-English peptide request into a numeric design spec.
You are told the model's CALIBRATED RANGE — the pI window covered by the experimental training data.
Pick a target the chemistry can actually reach: a short peptide made basic enough to bind DNA lands
near pI 11-12, not 10. Prefer a target inside the calibrated range when the intent allows it; if the
intent genuinely demands a pI outside it, say so in `interpretation` and use tolerance 0.5.
Infer a target isoelectric point from the intent when not stated:
- "binds DNA/RNA", "cell-penetrating", "antimicrobial", "sticks to negatively charged membranes" => basic, pI 9.5-11
- "acidic", "binds positively charged surface", "calcium binding" => pI 3.5-4.5
- "neutral", "no net charge at physiological pH" => pI ~7.4
- "soluble at pH X" => pI at least 1.5 units away from X
Lengths: default 8-15 if unstated. Keep lengths between 4 and 40.
Return JSON:
{"target_pI": number, "tolerance": number (0.2-0.5),
 "length_min": int, "length_max": int,
 "must_include": str (one-letter residues required, may be ""),
 "avoid": str (one-letter residues to avoid, may be ""),
 "interpretation": str (one sentence on how you read the request)}"""

_PROPOSE_SYSTEM = """You are a peptide design chemist working in a loop with an ML pI oracle.
You propose sequences; the oracle scores them; you refine.
Use pKa reasoning: add D/E to lower pI, K/R to raise it (R strongest), H shifts near 6,
termini contribute ~+1/-1. Respect the spec (length, must_include, avoid). Use only the
20 standard one-letter codes. Make candidates diverse — not trivial repeats like KKKKKK
unless the spec demands it; include realistic hydrophobic/polar residues.
When given oracle feedback, learn from the errors: analyse which changes moved pI and by how much.
Return JSON: {"analysis": str (1-2 sentences; for round 1 your strategy),
              "candidates": [{"sequence": str, "rationale": str}, ...] (exactly 5)}"""


def _rejection_reason(seq: str, spec: dict):
    """None if the candidate satisfies the spec, else a human-readable reason."""
    if not seq:
        return "empty sequence"
    bad = {c for c in seq if c not in VALID_AAS}
    if bad:
        return f"not a standard residue code: {', '.join(sorted(bad))}"
    if not (spec["length_min"] <= len(seq) <= spec["length_max"]):
        return f"{len(seq)} residues, spec asks for {spec['length_min']}-{spec['length_max']}"
    hit = [c for c in spec.get("avoid", "") if c in seq]
    if hit:
        return f"contains {', '.join(hit)}, which the spec excludes"
    missing = [c for c in spec.get("must_include", "") if c not in seq]
    if missing:
        return f"missing required residue {', '.join(missing)}"
    return None


def design(goal: str, max_rounds: int = 3) -> dict:
    domain = ml.get_meta()["pI_domain"]
    spec = _chat_json(
        _SPEC_SYSTEM,
        f"CALIBRATED RANGE: pI {domain[0]} to {domain[1]}\n\nREQUEST: {goal}",
        0.2,
    )
    try:
        spec["target_pI"]  = float(spec["target_pI"])
        spec["tolerance"]  = min(0.5, max(0.2, float(spec.get("tolerance", 0.3))))
        spec["length_min"] = max(4, int(spec.get("length_min", 8)))
        spec["length_max"] = min(40, max(spec["length_min"], int(spec.get("length_max", 15))))
        # A request like "12-residue" collapses the range to a single value, which makes
        # the loop fail on an off-by-one rather than on the chemistry. Allow a little slack.
        if spec["length_max"] - spec["length_min"] < 2:
            spec["length_min"] = max(4, spec["length_min"] - 1)
            spec["length_max"] = min(40, spec["length_max"] + 1)
        spec["must_include"] = "".join(c for c in _clean_seq(spec.get("must_include", "")) if c in VALID_AAS)
        spec["avoid"]        = "".join(c for c in _clean_seq(spec.get("avoid", "")) if c in VALID_AAS)
    except (KeyError, TypeError, ValueError) as e:
        raise LLMError("Could not interpret the design goal.") from e

    rounds, history, seen = [], [], set()
    best = None
    for rnd in range(1, max_rounds + 1):
        prompt = {"goal": goal, "spec": spec, "round": rnd}
        prompt["calibrated_pI_range"] = domain
        prompt["hard_constraint"] = (
            f"Every sequence MUST be {spec['length_min']}-{spec['length_max']} residues long. "
            "Count the letters before answering."
        )
        rejected = [{"sequence": c["sequence"], "why": c["rejected_because"]}
                    for r in rounds for c in r["candidates"] if not c["valid"]]
        if rejected:
            prompt["rejected_last_round"] = rejected[-6:]
        if history:
            prompt["oracle_feedback_so_far"] = history[-12:]
            prompt["note"] = ("Candidates outside the calibrated range are scored by physics alone, so "
                              "sequences with identical residue counts get identical pI. If you are stuck "
                              "there, change the NUMBER of ionisable residues, not their order.")
        resp = _chat_json(_PROPOSE_SYSTEM, json.dumps(prompt), 0.8)

        proposed = []
        for c in resp.get("candidates", []):
            seq = _clean_seq(c.get("sequence", ""))
            if seq in seen:
                continue
            seen.add(seq)
            reason = _rejection_reason(seq, spec)
            proposed.append({"sequence": seq, "rationale": str(c.get("rationale", ""))[:240],
                             "valid": reason is None, "rejected_because": reason})

        valid = [c for c in proposed if c["valid"]]
        scores = {s["sequence"]: s for s in ml.predict_many([c["sequence"] for c in valid])} if valid else {}
        for c in proposed:
            if c["valid"]:
                sc = scores[c["sequence"]]
                c.update(pI=sc["pI"], ci_low=sc["ci_low"], ci_high=sc["ci_high"],
                         in_domain=sc["in_domain"],
                         error=round(sc["pI"] - spec["target_pI"], 3),
                         charge_pH7_4=charge_at_pH(c["sequence"], 7.4))
                history.append({"sequence": c["sequence"], "oracle_pI": c["pI"],
                                "error": c["error"], "in_calibrated_range": c["in_domain"]})
                if best is None or abs(c["error"]) < abs(best["error"]):
                    best = {**c, "round": rnd}

        rounds.append({"round": rnd, "analysis": str(resp.get("analysis", ""))[:400],
                       "candidates": sorted(proposed, key=lambda c: abs(c.get("error", 99)))})
        if best and abs(best["error"]) <= spec["tolerance"]:
            break

    return {"goal": goal, "spec": spec, "rounds": rounds, "best": best,
            "calibrated_range": domain,
            "converged": bool(best and abs(best["error"]) <= spec["tolerance"])}


# ---------------------------------------------------------------------------
# 3. Mutation tuner
# ---------------------------------------------------------------------------

_TUNE_SYSTEM = """You are a protein engineer. Suggest minimal point mutations that move a peptide's
isoelectric point toward a target while disturbing the sequence as little as possible.
Prefer conservative swaps (D<->N, E<->Q, K<->R, K->Q/E, S/T/A/G->D/E/K/R) at surface-like positions;
avoid touching C, P, G, W unless necessary. Positions are 1-based.
Return JSON: {"strategy": str (one sentence),
 "variants": [{"mutations": ["K5E", ...] (1-3 mutations, format <wt><pos><new>),
               "rationale": str}, ...] (exactly 6 variants)}"""

_MUT_RE = re.compile(r"^([A-Z])(\d+)([A-Z])$")


def _apply(seq: str, muts: list[str]):
    s = list(seq)
    for m in muts:
        g = _MUT_RE.match(str(m).strip().upper())
        if not g:
            return None
        wt, pos, new = g.group(1), int(g.group(2)), g.group(3)
        if not (1 <= pos <= len(s)) or s[pos - 1] != wt or new not in VALID_AAS:
            return None
        s[pos - 1] = new
    return "".join(s)


def tune(sequence: str, target_pI: float) -> dict:
    current = ml.predict_many([sequence])[0]
    user = json.dumps({"sequence": sequence,
                       "numbered": " ".join(f"{a}{i+1}" for i, a in enumerate(sequence)),
                       "current_ml_pI": current["pI"], "target_pI": target_pI})
    resp = _chat_json(_TUNE_SYSTEM, user, 0.6)

    variants, seqs = [], []
    for v in resp.get("variants", []):
        muts = [str(m).strip().upper() for m in v.get("mutations", [])][:3]
        new = _apply(sequence, muts) if muts else None
        variants.append({"mutations": muts, "rationale": str(v.get("rationale", ""))[:240],
                         "sequence": new, "valid": new is not None and new != sequence})
        if variants[-1]["valid"]:
            seqs.append(new)
    scores = {s["sequence"]: s for s in ml.predict_many(seqs)} if seqs else {}
    for v in variants:
        if v["valid"]:
            sc = scores[v["sequence"]]
            v.update(pI=sc["pI"], ci_low=sc["ci_low"], ci_high=sc["ci_high"],
                     in_domain=sc["in_domain"],
                     shift=round(sc["pI"] - current["pI"], 3),
                     error=round(sc["pI"] - target_pI, 3))
    variants.sort(key=lambda v: (not v["valid"], abs(v.get("error", 99))))
    return {"sequence": sequence, "current": current, "target_pI": target_pI,
            "strategy": str(resp.get("strategy", "")), "variants": variants,
            "physics_pI": physics_pI_estimate(sequence)}
