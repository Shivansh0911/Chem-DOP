# pI Predictor — Complete Project Documentation

A physics-informed machine learning system for predicting the isoelectric point of
peptides, with a laboratory decision-support interface built around it.

> **Purpose of this document.** This is the complete source material for the project:
> the chemistry, the dataset, the method, every feature, every measured result, the
> defects found during development, and the use cases. It is written to be read end
> to end or mined section by section. Every figure quoted here was measured on the
> running system — none is estimated or carried over from a paper.

**Repository:** `github.com/Shivansh0911/Chem-DOP` (public)
**Dataset:** `github.com/bigbio/pIR`
**Screenshots:** [`docs/screenshots/`](screenshots/)

---

## Table of contents

1. [Abstract](#1-abstract)
2. [Background: what the isoelectric point is](#2-background-what-the-isoelectric-point-is)
3. [Problem statement](#3-problem-statement)
4. [Objectives](#4-objectives)
5. [Dataset](#5-dataset)
6. [Methodology](#6-methodology)
7. [System architecture](#7-system-architecture)
8. [Phase A — the mid-semester system](#8-phase-a--the-mid-semester-system)
9. [Phase B — post-midsem development](#9-phase-b--post-midsem-development)
10. [Results](#10-results)
11. [Verification](#11-verification)
12. [Defects found and resolved](#12-defects-found-and-resolved)
13. [Use cases](#13-use-cases)
14. [Deployment and operation](#14-deployment-and-operation)
15. [Limitations](#15-limitations)
16. [Future work](#16-future-work)
17. [Conclusion](#17-conclusion)
18. [Appendices](#18-appendices)

---

## 1. Abstract

The isoelectric point (pI) is the pH at which a peptide carries zero net electrical
charge. It governs ion-exchange purification, isoelectric focusing, formulation
stability and electrostatic binding behaviour, and is therefore required before most
practical work on a peptide can begin.

The standard computational approach solves the Henderson–Hasselbalch relation using a
tabulated set of pKa constants. At least nine such tables have been independently
published, and they disagree with one another by up to approximately one pH unit on
the same sequence. On the benchmark used here, the most accurate of them achieves a
root-mean-square error of 0.724 pH units against experimentally measured values.

This project does not replace that calculation. It retains it and learns its error.
Nine classical pI values are computed for every sequence, one is taken as a baseline,
and three regression models are trained to predict the **residual** — the signed
difference between that baseline and the laboratory-measured value — over 8,435
experimental measurements. The served prediction is the baseline plus the learned
correction.

On 1,687 peptides withheld from training, the system achieves an RMSE of **0.512 pH
units** and a mean absolute error of **0.255**, approximately 30% below the best
published calculator. All three trained models outperform all nine published tables.
A split-conformal prediction interval is reported with every result and achieves
**90.0%** empirical coverage against its nominal 90% target.

Around the model sits a web application providing residue-level visualisation,
provenance and verification tooling, batch processing, rule-based purification
protocol selection, exhaustive mutational analysis, and a language-model layer
constrained so that it never emits a numerical prediction.

---

## 2. Background: what the isoelectric point is

### 2.1 Physical basis

A peptide is a linear chain of amino acids joined by peptide bonds. Several of the
twenty standard amino acids carry ionisable side chains, and the chain additionally
possesses a free α-amino group at its N-terminus and a free α-carboxyl group at its
C-terminus.

Each ionisable group has a characteristic acid dissociation constant, expressed as
pKa. At a pH below a group's pKa the group tends to be protonated; above it, it tends
to be deprotonated. For a basic group protonation confers a positive charge; for an
acidic group deprotonation confers a negative charge.

The net charge of the molecule is the sum over all ionisable groups. Because each
group's protonation state varies continuously with pH, net charge is a continuous,
monotonically decreasing function of pH. The pH at which this function crosses zero
is the **isoelectric point**.

### 2.2 Which residues matter

| Class | Residues | Behaviour | Effect on pI |
|---|---|---|---|
| Acidic | Asp (D), Glu (E) | Negative when deprotonated | Lowers |
| Basic | Lys (K), Arg (R), His (H) | Positive when protonated | Raises |
| Weakly ionisable | Cys (C), Tyr (Y) | Ionise only at extreme pH | Small shift |
| Aromatic | Phe (F), Trp (W) | No charge; absorb UV at 280 nm | None directly |
| Neutral | A, G, I, L, M, N, P, Q, S, T, V | No ionisable side chain | None directly |

The termini contribute one positive and one negative charge respectively and matter
disproportionately in short peptides, where they are not diluted by side-chain
contributions.

### 2.3 Why it is needed in practice

| Application | Dependence on pI |
|---|---|
| **Ion-exchange chromatography** | At a buffer pH below the pI the molecule is net positive and binds a cation exchanger; above the pI it is net negative and binds an anion exchanger. Both the resin choice and the buffer pH follow from the pI. |
| **Isoelectric focusing / 2-D gels** | The first dimension separates species by pI; the expected position must be known to interpret the result. |
| **Formulation and storage** | Solubility is at a minimum at the pI, where the molecule has no net charge to keep it in solution. Therapeutic peptides must be formulated away from it or they aggregate and precipitate. |
| **Electrostatic binding** | Nucleic acids and cell membranes are negatively charged. A peptide with a high pI is positively charged at physiological pH and will associate with them — the basis of DNA-binding and cell-penetrating peptide design. |

---

## 3. Problem statement

### 3.1 The classical method and its disagreement

Henderson–Hasselbalch requires a pKa for every ionisable group. These are empirical
constants measured in model compounds, and different research groups have arrived at
different values. The nine tables implemented in this project are EMBOSS, DTASelect,
Solomon, Sillero, Rodwell, Lehninger, Grimsley, Bjellqvist and IPC.

For the peptide `DAQQNELIVK` they produce:

```
4.015   4.060   4.072   4.117   4.119   4.184   4.317   4.370   4.438
```

The spread between them is 0.42 pH units. The experimentally measured value for this
peptide is **3.15** — every published method overestimates it, and the closest is
still 0.87 too high.

### 3.2 Why the tables fail

A fixed table assigns one pKa to every lysine in every sequence. In reality a
residue's effective pKa is perturbed by its local environment: neighbouring like
charges raise the energetic cost of ionisation, proximity to a terminus alters the
local field, and solvent accessibility changes the dielectric environment. The
governing equation is correct; the constants supplied to it are context-free
approximations.

### 3.3 Why the error has practical consequence

The failure is not a matter of precision. Consider a chemist purifying `DAQQNELIVK`
who selects a working buffer at pH 3.6:

| | Believed pI | Reasoning | Resin selected |
|---|---|---|---|
| Using the textbook | 4.06 | 3.6 < 4.06, so the peptide is **positive** | Cation exchanger |
| Physical reality | 3.15 | 3.6 > 3.15, so the peptide is **negative** | Anion exchanger |

The two conclusions are opposite. The molecule does not bind, the sample is lost in
the flow-through, and the experiment must be repeated. Any buffer selected anywhere
in the interval 3.15–4.06 produces this inversion. An error of 0.9 pH units does not
degrade the answer; it reverses the decision that depends on it.

### 3.4 Why naive machine learning is not the answer

The obvious alternative is to discard the physical model and regress pI directly from
sequence. This is worse in two specific ways:

1. The model must expend capacity rediscovering chemistry that could simply be
   supplied to it, reducing the effective information available for the part that is
   genuinely unknown.
2. Regression models revert toward the conditional mean on inputs unlike their
   training distribution. A strongly acidic or strongly basic peptide — exactly the
   cases where a prediction is most consequential — is where such a model is least
   reliable, and it gives no signal that this has happened.

---

## 4. Objectives

1. Produce pI predictions measurably more accurate than every published calculator,
   evaluated on data withheld from training.
2. Retain the physical model rather than replacing it, so that predictions remain
   interpretable and degrade gracefully outside the training distribution.
3. Quantify uncertainty honestly, with an interval whose stated coverage is verified
   rather than assumed.
4. Make every claim independently checkable against the published source data.
5. Deliver the result as a tool that supports laboratory decisions, not merely a
   number.
6. Where a language model is used, constrain it so that no unverifiable quantity ever
   reaches the user.

---

## 5. Dataset

### 5.1 Provenance

| Field | Value |
|---|---|
| Name | pIR — experimentally measured isoelectric points |
| Publication | Pérez-Riverol Y. *et al.*, "Prediction of Isoelectric Point for Diverse Proteins Using Random Forest and Gradient Boosting", *Bioinformatics* (2016) |
| Repository | `github.com/bigbio/pIR` |
| Files used | `inst/extdata/dataPeptidePIs.csv`, `inst/extdata/dataProteinPIs.csv` |
| Licence | Public, freely downloadable |

### 5.2 Composition

| Quantity | Value |
|---|---|
| Peptide records | 7,391 |
| Protein records | 1,066 |
| Total records | 8,457 |
| Usable after cleaning | **8,435** |
| Training partition | 6,748 |
| Held-out test partition | **1,687** |
| Measured pI range | 1.10 – 12.10 |
| Distinct measured values | 202 |
| Sequence lengths represented | 6 – 2,692 residues |

Cleaning removes records with a missing sequence or missing experimental value, and
records containing characters outside the twenty standard one-letter codes.

### 5.3 Measurement method

The experimental values were obtained by isoelectric focusing: species are
electrophoresed across an immobilised pH gradient and migrate until they reach the pH
at which their net charge is zero, where migration ceases. The position reached gives
the pI directly.

Two consequences follow for this project. First, the values are genuine physical
measurements rather than computed estimates. Second, because the peptide fractions
derive from gradient strips spanning roughly pH 3–10, the measured values are
**quantised** onto approximately 202 discrete levels, and coverage outside that
window is sparse. Both facts are reflected in the system's applicability gate
(§6.5).

### 5.4 Partitioning

The split is 80/20 with `random_state=42`, stratified on the rounded pI so that every
region of the pI range is proportionally represented in both partitions. The seed is
fixed and recorded, and the partition is reproduced identically by the verification
tooling (§9.3), which is what allows a user to confirm that a given record was
genuinely withheld.

Leakage was checked explicitly: exactly **one** sequence out of 1,687 appears in both
partitions, arising from a duplicate record in the source files.

---

## 6. Methodology

### 6.1 Residual formulation

For a sequence *s* with classical baseline `pI_base(s)` and measured value `pI_exp(s)`,
the training target is

```
residual(s) = pI_exp(s) − pI_base(s)
```

and the served prediction is

```
pI_pred(s) = pI_base(s) + w(s) · model(features(s))
```

where `w(s) ∈ [0, 1]` is the applicability weight defined in §6.5. The Rodwell table
is used as the baseline.

This formulation has three properties that motivated it:

- **The physical model carries the prediction.** Even with the learned term fully
  suppressed, the output remains a defensible chemical estimate.
- **The learned term is small and well conditioned.** The model fits a residual
  centred near zero rather than a quantity spanning 1–12.
- **The output is decomposable.** The interface presents both terms, so a disputed
  prediction can be attributed to either the chemistry or the correction.

### 6.2 Feature construction

Approximately fifty features are derived per sequence, all of them chemically
nameable quantities rather than learned embeddings.

| Group | Features | Rationale |
|---|---|---|
| Size | `length`, `log_length` | Terminal contributions are diluted in longer chains |
| Composition fractions | `acidic_frac`, `basic_frac`, `aromatic_frac`, `nonpolar_frac`, `polar_uncharged_frac`, `charge_proxy` | Bulk charge character |
| Per-residue composition | `aa_A` … `aa_Y` (20) | Residue-specific effects |
| Ionisable counts | `n_D`, `n_E`, `n_C`, `n_Y`, `n_H`, `n_K`, `n_R` | Absolute counts matter more than fractions in short peptides |
| Termini | `nterm_charged`, `cterm_charged` | A charged terminal residue alters the local field |
| Physical estimates | `pI_emboss` … `pI_ipc` (9), `pI_classical_mean`, `pI_classical_spread`, `charge_pH7` | The classical predictions themselves, and their disagreement |

`pI_classical_spread` — the standard deviation across the nine tables — is
informative in itself: tables agree on conventional sequences and diverge on unusual
ones, so the spread functions as a learned indicator of atypicality.

**Critically, all nine classical pI values are computed by this project's own code**,
by the same function at training time and at prediction time. This is not incidental;
see §12.1.

### 6.3 Models

Three regressors are trained on the identical residual target:

| Model | Configuration | Notes |
|---|---|---|
| Random Forest | 150 trees, `min_samples_leaf=5`, `max_features=0.5`, `n_jobs=2` | The leaf-size floor prevents a single noisy measurement from determining a leaf. Parallelism is bounded to fit a 512 MB deployment host. |
| Gradient Boosting | 300 estimators, learning rate 0.05, depth 4, subsample 0.8 | Sequential residual correction |
| Ridge regression | α = 1.0, standardised features | Linear baseline on the same target |

The application reports whichever achieves the lowest held-out RMSE; at present this
is the Random Forest. Reporting the winner rather than a fixed choice means the
comparison is re-decided on evidence at each training run.

### 6.4 Uncertainty quantification

The reported interval is a **split-conformal** interval: the half-width is the 90th
percentile of absolute error on the held-out partition, currently **±0.57** pH units.

The guarantee this provides is frequentist and empirical: on data drawn from the same
distribution, the true value lies within the interval approximately 90% of the time.
Measured over all 1,687 held-out records, 1,519 fall inside — **90.0%** against a
nominal 90%.

This is deliberately *not* a tree-variance or ensemble-spread heuristic, which has no
coverage guarantee and is frequently misreported as a confidence interval.

### 6.5 Applicability gate

The experimental data derives from pH 3–10 gradient strips. Outside that window
evidence is absent rather than merely sparse, and a learned correction extrapolated
there would be unsupported.

The gate defines an applicable region from the 1st to 99th percentile of the baseline
pI across the training data, which evaluates to **3.58 – 9.75**. The applicability
weight `w(s)` is 1.0 inside this region, decays linearly to 0 over 0.5 pH units
beyond it, and is 0 for sequences shorter than the minimum training length.

When `w < 1` the application states *"physics only"* on screen and widens the
interval. The system reports that it does not know, rather than guessing confidently.

**The reported accuracy is measured through this gate**, exactly as a user receives
it. Scoring the ungated models would yield 0.489, but no user is served that pipeline;
quoting it would misrepresent the product. See §12.2.

---

## 7. System architecture

### 7.1 Stack

| Layer | Technology |
|---|---|
| Backend | FastAPI, Python 3.12 |
| ML | scikit-learn 1.4 (Random Forest, Gradient Boosting, Ridge) |
| Language model | Groq, `openai/gpt-oss-120b`, JSON-constrained output |
| Frontend | React 18, Vite 5, Tailwind CSS, Recharts |
| Serving | Single service — FastAPI serves the built SPA alongside the API |

### 7.2 Module responsibilities

| Module | Responsibility |
|---|---|
| `backend/data.py` | Amino acid reference table; the nine pKa sets; dataset acquisition and cleaning; feature construction; titration curve; per-residue decoding; the single charge-calculation table |
| `backend/model.py` | Residual training pipeline; applicability gate; conformal interval; `predict`, `predict_many`; persistence |
| `backend/evidence.py` | Reproduces the train/test partition from the training seed; sequence lookup; held-out sampling; interval coverage |
| `backend/labtools.py` | Sequence parsing; batch scoring; CSV export; protocol selection; charge at a given pH; exhaustive mutation scan. **Contains no language-model calls.** |
| `backend/llm.py` | Groq integration: fact-sheet construction, lab note, inverse-design loop, mutation tuner |
| `backend/main.py` | HTTP surface, validation, static serving |
| `frontend/src/App.jsx` | Tab routing, readiness polling, URL state |
| `frontend/src/components/` | 17 presentation components |

### 7.3 Dependency discipline

```
data.py  ←  model.py  ←  evidence.py
   ↑           ↑      ←  labtools.py
   └───────────┴──────←  llm.py
                      ←  main.py
```

`data.py` imports nothing project-local; nothing imports `main.py`. The practical
consequence is that there is exactly one function constructing features, called by
both the training path and the prediction path, so the two cannot diverge. This was a
direct response to the defect described in §12.3.

---

## 8. Phase A — the mid-semester system

The state of the project at the mid-semester review. The prediction model has not
been modified since; all accuracy figures in §10 originate here and remain current.

### 8.1 Capabilities

| Capability | Description |
|---|---|
| Single prediction | Accepts a sequence, amino acid name, or one- or three-letter code. Returns the pI decomposed as `baseline + correction`, with the conformal interval. |
| Classical comparison | All nine published calculators plotted on a shared pH axis beside the model output. |
| Titration curve | Net charge as a function of pH from 0 to 14 at 0.1 resolution, with the predicted pI marked. |
| Model comparison | All three models' predictions with their held-out metrics; the selected model indicated. |
| AI lab note | A language model composes purification guidance from a fact sheet of computed quantities. |
| AI designer | A natural-language goal is converted to a numeric specification, then three rounds of propose-and-score. |
| pI tuner | The language model proposes point mutations; each is validated against the sequence and re-scored by the model. |
| Method page | Live benchmark against all nine methods, feature importances, training facts. |

### 8.2 The constraining principle

A rule enforced in code: **the language model is never permitted to state a pI.** It
receives only computed quantities, and any sequence it proposes is scored by the
trained model before a number is displayed alongside it. The language model
contributes specification interpretation, candidate generation and natural-language
explanation; it does not contribute arithmetic.

### 8.3 Deficiencies identified at review

1. **Unverifiable claims.** Every figure was asserted by the interface. A reviewer
   had no means of checking any prediction against the source data. This was the
   explicit criticism raised.
2. **Demonstration rather than instrument.** A single input field processing one
   sequence. No laboratory screens one molecule, and a pI alone is not the output a
   chemist requires — it is an input to a decision they must still make unaided.

Phase B addresses both.

---

## 9. Phase B — post-midsem development

Twelve features in four phases, plus shareable links and an amino-acid legend. The
prediction model was deliberately left untouched; this was a stated constraint, and
§10 confirms it held.

### 9.1 Phase 1 — Representation

**Feature 1 — Residue-level viewer with a live pH control.**
Each residue is rendered as a tile bearing its one-letter code. Hovering reveals the
three-letter code, full name, class and effect on charge. A pH slider recolours every
tile continuously as its group's protonation state changes — blue positive, red
negative — with running positive, negative and net totals. A control jumps the slider
to the predicted pI, where the opposing contributions visibly cancel.

Charge is computed in the browser so the control responds without latency, but the
pKa constants are served by the API, so the view cannot drift from the titration
curve or the model's own charge feature.

**Feature 2 — pI contextualised against laboratory buffers.**
A pH ribbon marks acidic, neutral and basic regions, carries the prediction and its
interval, and lists five buffers a chemist actually uses — gastric acid (1.5),
acetate (4.8), physiological (7.4), Tris (8.0), carbonate (10.3) — each annotated
with the sign of the peptide's charge at that pH.

### 9.2 Phase 2 — Evidence and validation

**Feature 3 — Evidence tab.**
Names the dataset, the publication, the exact files, and the measurement method, then
ranks all three models against all nine calculators. Every figure is recomputed
server-side from the published data on each load; none is written into the page.

**Feature 4 — Lookup against the laboratory data.**
Accepts any sequence and reports whether it appears in the dataset, its measured
value, and whether the record was used for training or withheld. The partition is
reconstructed from the training seed, so "withheld" is a reproducible fact rather
than an assertion. The response also gives the classical estimate's error alongside
the model's, making the improvement concrete per-record.

**Feature 5 — Redrawable held-out sample.**
A table of records the model never saw, measured value beside prediction, sampled at
random across the pI range. A control redraws the sample, demonstrating that the rows
are not curated. The aggregate interval coverage over the entire held-out partition
is reported beside the sample, because the sample is deliberately spread across the
range — including the sparse extremes — and therefore reads worse than the model
performs overall.

### 9.3 Phase 3 — Laboratory scale

**Feature 6 — Batch scoring.** A pasted or uploaded file is scored in a single
vectorised pass, returning pI, interval, charge at pH 7.4 and composition per record.

**Feature 7 — Input format handling.** Accepts FASTA — the export format of every
sequence database — along with newline-delimited lists and comma- or tab-separated
values. Three cases are handled explicitly:

- Wrapped FASTA lines are concatenated into a single sequence, per the format.
- A header followed by a list (a common malformed paste) is *recovered* by falling
  back to per-line parsing, rather than silently concatenated into one invalid record.
- Any sequence containing non-standard residues is reported by name with the offending
  characters identified, rather than dropped without notice.

**Feature 8 — CSV export.** Writes the complete result table. A laboratory record is a
spreadsheet far more often than a web page.

**Feature 9 — Comparative display.** Every record in the batch is drawn on one shared
pH axis with its interval, making divergent behaviour on a common column immediately
visible.

### 9.4 Phase 4 — Decision support

None of these three invokes a language model. Each is deterministic: identical input
produces identical output on every execution, which is a prerequisite for anything
entered in a laboratory record.

**Feature 10 — Rule-based purification protocol.**
Recommends a resin and buffer pH and reports the net charge that buffer produces.
Both options are displayed so the recommendation can be verified rather than trusted.

The conventional heuristic — buffer one pH unit from the pI — fails on strongly
acidic or basic peptides, placing the buffer outside a usable range or leaving
insufficient charge to bind. Instead the usable window (pH 3.5–10.5) is scanned for a
buffer delivering a net charge of at least 1.0 of the required sign, preferring the
candidate nearest neutral, where peptides are most stable. A storage exclusion band of
pI ± 0.5 is reported alongside.

For `DAQQNELIVK` this yields anion exchange at pH 7.0 with net charge −1.00. The
conventional heuristic would select pH 4.2, where the charge is −0.09 — insufficient
to bind.

**Feature 11 — Charge at an arbitrary pH.**
Accepts the user's actual working pH and reports net charge, electrophoretic
direction, which resin will bind, and a warning when within 0.5 units of the pI.

**Feature 12 — Exhaustive single-mutation scan.**
Enumerates all 19 substitutions at every position, scores each, and ranks by induced
pI shift. A per-position sensitivity profile identifies where mutation is
charge-neutral — useful when a substitution is needed for an unrelated reason.

For a 10-residue peptide this is 190 variants, scored in approximately one second.
The language-model tuner is creative but proposes a handful of candidates; this is
exhaustive, guaranteeing nothing superior was overlooked, and is bit-identical across
runs. The two are complementary.

### 9.5 Additional

**Shareable result links.** The sequence is carried in the page address, so any result
can be transmitted as a URL and opens showing the same analysis.

**Amino acid legend.** All twenty one-letter codes decoded on the main page, grouped
by effect on pI, with the codes present in the current sequence highlighted.

---

## 10. Results

### 10.1 Benchmark

All methods evaluated on the identical 1,687 held-out records. Our models are scored
*through* the applicability gate, as served.

| Method | RMSE (pH) | MAE (pH) | Type |
|---|---|---|---|
| **Random Forest (this work)** | **0.512** | **0.255** | Physics + learned residual |
| **Ridge (this work)** | **0.520** | 0.292 | Physics + learned residual |
| **Gradient Boosting (this work)** | **0.542** | 0.274 | Physics + learned residual |
| Grimsley | 0.724 | 0.556 | Published pKa table |
| Rodwell | 0.768 | — | Published pKa table |
| Bjellqvist | 0.830 | — | Published pKa table |
| Sillero | 0.910 | — | Published pKa table |
| DTASelect | 0.924 | — | Published pKa table |
| EMBOSS | 0.929 | — | Published pKa table |
| Lehninger | 1.050 | — | Published pKa table |
| IPC | 1.052 | — | Published pKa table |
| Solomon | 1.056 | — | Published pKa table |

**Headline results**

- RMSE reduced by **29.2%** relative to the best published method (0.512 vs 0.724).
- **All three** trained models outperform **all nine** published tables.
- Mean absolute error **0.255** pH units.
- Conformal interval coverage **90.0%** (1,519 of 1,687) against a 90% target.

The benchmark table is recomputed at every training run and served from
`/model-info`, so the figures displayed in the application always describe the
deployed model.

### 10.2 Representative held-out predictions

Records withheld from training, with the classical estimate shown for comparison:

| Sequence | Measured | Classical | Predicted | Error |
|---|---|---|---|---|
| `DAQQNELIVK` | 3.15 | 4.06 | **3.17** | 0.02 |
| `ATEGPIVSDK` | 3.45 | — | 3.48 | 0.03 |
| `STFFSVSSSDLMSK` | 4.95 | — | 4.88 | 0.07 |
| `REELSNILTQLR` | 5.55 | — | 5.37 | 0.18 |
| `YYSETHAVLGR` | 6.75 | 7.00 | 6.99 | 0.24 |
| `ILYRPIPDQLPK` | 8.85 | — | 8.89 | 0.04 |
| `VLNITGTPIVR` | 9.15 | 9.75 | 8.92 | 0.23 |

### 10.3 Feature importance

The gradient-boosting model's highest-weighted features are `charge_pH7`,
`pI_sillero`, `aa_C`, `aa_H`, `charge_proxy` and `pI_rodwell`. That net charge at
physiological pH and the classical estimates dominate is the expected and desirable
outcome: the model is refining a physically grounded quantity rather than
substituting for it.

---

## 11. Verification

### 11.1 Acceptance testing

Each of the twelve planned features was specified with an acceptance test before
implementation. All were executed against the running system:

| # | Feature | Acceptance evidence |
|---|---|---|
| 1 | Sequence viewer | Tile 2 of `RYWGFEDKRR` = Y/Tyr/Tyrosine; 10 tiles; termini pKa 9.564/2.383 |
| 2 | Buffer contextualisation | pI 3.174; charge at pH 1.5/4.8/7.4/8.0/10.3 = +1.88/−0.64/−1.01/−1.03/−2.22; sign inverts exactly at the pI |
| 3 | Evidence tab | 8,435 records; 3 models vs 9 calculators; 0.5124 vs 0.7237 |
| 4 | Sequence lookup | `DAQQNELIVK`: measured 3.15, held-out, classical error 0.91, model error 0.024 |
| 5 | Held-out sample | Distinct seeds yield distinct rows; coverage across all 1,687 = 90.0% |
| 6 | Batch scoring | 3 scored in one pass, 1 rejected |
| 7 | Format parsing | Wrapped FASTA → `DAQQNELIVK`; malformed line reported as "not standard residue code(s): B, X, Z" |
| 8 | CSV export | Header plus one row per result, matching the displayed table |
| 9 | Comparative display | Every row carries `ci_low` and `ci_high` |
| 10 | Purification protocol | Anion exchange at pH 7.0, charge −1.00 |
| 11 | Charge at chosen pH | pH 3.6 → +0.56 (near-pI warning raised); pH 7.4 → −1.01 |
| 12 | Mutation scan | 190 variants; top substitution E6K at +5.58; 10 positions profiled |
| R | Unified pKa table | Titration curve and charge readout agree at pH 2, 4, 7.4 and 10 |
| + | Shareable links | `/?seq=…` re-predicts on load |

**Result: 14 of 14 passing.**

### 11.2 Cross-implementation verification

The browser-side charge calculation was validated against the server implementation
across five sequences spanning the pI range at ten pH values each. Maximum divergence
after correction: **0.0005** — attributable entirely to the server's three-decimal
rounding. This check uncovered the defect in §12.1.

### 11.3 Interface verification

The full application was exercised end to end under browser automation: all six tabs,
every interactive control, at desktop and mobile widths. Zero console errors, zero
uncaught exceptions. A nine-minute narrated recording of this run is retained as the
demonstration artefact.

---

## 12. Defects found and resolved

### 12.1 Divergent pKa tables

**Symptom.** Browser-side and server-side charge calculations disagreed by up to 0.54
charge units.

**Cause.** Not the new code. The application had been computing charge with *two
different pKa tables*: one behind the titration curve and physics estimate, another
behind the charge readout, the purification protocol, the batch table and the model's
own `charge_pH7` feature. The same peptide at the same pH read differently depending
on which panel was consulted.

**Resolution.** All charge computation routed through a single declared table
(`CHARGE_PKA_SET`). Model predictions were unaffected, as feature construction was
already reading the correct table, so no retraining was required.

**Significance.** This class of defect passes conventional testing because each half
is internally self-consistent. It surfaces only when two independent implementations
are forced to agree — which is precisely what the cross-check in §11.2 was built to
do. This is the most instructive finding of the project.

### 12.2 Metrics describing an unserved pipeline

**Symptom.** Reported RMSE of 0.489 while served predictions derived from a pipeline
whose true error is 0.512.

**Cause.** Test metrics were computed from raw model output, but every served
prediction passes through the applicability gate first.

**Resolution.** The held-out set is now scored through the same gate. Training and
prediction share one `_weight()` function, so they cannot diverge. The advertised
figure is now the figure a user's prediction is actually drawn from.

### 12.3 Feature leakage from pre-computed columns

**Symptom (historical, Phase A).** Lysine predicted at 6.11 against a true value of
9.60 — nearly identical to aspartic acid at 6.99, despite the two being chemically
opposite.

**Cause.** The source CSVs ship pre-computed columns from other calculators
(`bjell`, `expasy`, …). An early version used them as model inputs. Those columns do
not exist for a user-supplied sequence, so at prediction time they were zero-filled
and every prediction collapsed toward the dataset mean.

**Resolution.** All nine calculators are computed by project code, with the identical
function invoked during training and prediction. This motivated the dependency
discipline in §7.3.

### 12.4 Route shadowing

The SPA catch-all route was registered before the new API endpoints and would have
intercepted every one of them. Moved below.

### 12.5 HEAD requests rejected

`/health` responded 405 to HEAD. Uptime monitors issue HEAD by default and FastAPI
does not register it automatically, so a healthy service would have been reported as
down. Now registered for both methods.

### 12.6 Hardcoded origin

The frontend fell back to a hardcoded host when no environment variable was set, so a
deployment under any other name would serve a page calling a dead address — a failure
visible only in the browser, never at build time. It now calls whatever origin served
it.

### 12.7 Misleading sample statistics

The on-screen held-out sample is deliberately spread across the pI range, including
the sparse extremes, and therefore reported coverage below the true figure. The
aggregate over the full partition is now displayed beside it with an explanation.

---

## 13. Use cases

### 13.1 Designing an ion-exchange purification

*The primary use case.* A chemist has a peptide and must select a resin and buffer.

1. Enter the sequence. Obtain the pI with its interval.
2. The protocol panel recommends a resin and buffer pH, and reports the net charge
   that buffer produces, with the rejected alternative shown for comparison.
3. Enter the pH of the buffer actually available and confirm the charge is adequate.
4. Observe the storage exclusion band to avoid precipitation during handling.

Addressed by features 10 and 11. *Reproducible; no language model involved.*

### 13.2 Screening a synthesis or digest batch

A laboratory has produced tens or hundreds of peptides.

1. Export sequences as FASTA from the synthesiser or database.
2. Paste or upload into the Batch tab; all are scored in one pass.
3. Review the comparative display to identify which will co-elute and which will
   separate on a given column.
4. Export CSV into the laboratory record.

Addressed by features 6–9.

### 13.3 Designing a peptide to a charge specification

Required: a peptide with a target pI — basic for nucleic-acid binding, acidic for
calcium coordination, neutral for solubility at physiological pH.

1. Describe the requirement in natural language in the AI Designer.
2. The specification is converted to numeric targets; candidates are proposed and
   scored by the model; the loop self-corrects across rounds.
3. The final sequence opens in full analysis for verification.

*The language model proposes; the trained model adjudicates.*

### 13.4 Engineering an existing peptide to a new pI

A peptide exists but its charge behaviour is wrong.

1. Supply the sequence and target pI to the Tuner for minimal conservative
   substitutions with chemical rationale and predicted shift.
2. Run the exhaustive scan to confirm no superior substitution was missed, and to
   identify charge-neutral positions safe to mutate for unrelated reasons such as
   stability or solubility.

Addressed by feature 12, complementing the Phase A tuner.

### 13.5 Interpreting a 2-D gel or IEF result

Predicted pI values for candidate identities can be compared against observed
migration positions, with the interval indicating how tightly the comparison
constrains the identification.

### 13.6 Formulation and storage

The solubility minimum at the pI, and the exclusion band around it, determine the
buffer in which a therapeutic peptide can be stored without aggregation.

### 13.7 Teaching

The residue viewer with the pH slider makes the Henderson–Hasselbalch relation
directly observable: a student watches individual groups protonate and deprotonate
and sees the isoelectric point emerge as the pH where opposing contributions cancel.
The nine-calculator comparison demonstrates concretely that published constants
disagree.

### 13.8 Methodological verification

A reviewer, examiner or collaborator can verify any claim without access to the
development environment: look up a sequence, confirm its partition membership,
compare measured against predicted, redraw the sample, and read the benchmark —
all recomputed server-side from public data.

---

## 14. Deployment and operation

### 14.1 Architecture

A single service. The build compiles the React application; FastAPI serves it
alongside the API. One origin, no CORS configuration, one process to operate.

Models are trained during the build rather than on first request, so a cold start
loads five serialised files from disk rather than retraining.

### 14.2 Local operation

With the repository prepared:

```bash
cd backend
python -m uvicorn main:app --port 8000
```

Then open `http://localhost:8000`.

From a clean clone:

```bash
git clone https://github.com/Shivansh0911/Chem-DOP.git
cd Chem-DOP/backend
pip install -r requirements.txt
# create .env containing GROQ_API_KEY=<key>   (gitignored; never committed)
python model.py                 # ~40 s; acquires the dataset itself
cd ../frontend && npm install && npm run build
cd ../backend && python -m uvicorn main:app --port 8000
```

Without a Groq key the system operates fully except the three language-model
features, which report themselves disabled. For frontend development, `npm run dev`
in a second terminal serves on port 5173 with API requests proxied; no environment
variable is required in either mode.

### 14.3 Operational notes

- The API key is supplied through the environment and is never committed.
- `/health` answers both GET and HEAD for uptime monitoring.
- Random Forest parallelism is bounded (`n_jobs=2`) to fit a 512 MB host.
- `FEATURE_VERSION` is recorded in the model metadata; incrementing it when feature
  construction changes forces retraining rather than silently loading incompatible
  serialised models.

---

## 15. Limitations

| Limitation | Consequence |
|---|---|
| **Standard residues only** | No post-translational modifications, no disulfide bonds, no non-standard amino acids. Each alters pI and none is represented in the training data. |
| **Composition, not conformation** | Features describe which residues are present, not how the chain folds. A buried ionisable residue has a shifted pKa invisible to this model. |
| **Calibrated range pI 3.58 – 9.75** | Outside it the system returns the classical estimate and declares that it has done so. |
| **Quantised targets** | Measured values cluster on ~202 discrete levels from gradient-strip fractionation; the data is coarser than a decimal place implies. |
| **Greedy design loop** | Three rounds of five candidates explores a narrow region of sequence space. Good solutions, not provably optimal ones. |
| **Unpinned dependencies** | A host resolves its own scikit-learn, so a deployed model can differ from a local build by roughly 0.08 pH on an individual sequence. Quote figures from the instance being demonstrated. |
| **No experimental validation of designs** | No peptide produced by the designer has been synthesised and measured. |

---

## 16. Future work

1. **Post-translational modifications.** Phosphorylation, acetylation and amidation
   alter charge substantially and are common in real samples. Requires modified pKa
   handling and training data that includes them.
2. **Structure-aware features.** Where a structure or reliable prediction exists,
   solvent accessibility would allow buried and exposed ionisable residues to be
   distinguished — the largest identified source of residual error.
3. **Uncertainty-guided design.** The conformal interval already quantifies confidence
   per sequence. Directing the design loop toward regions of low predicted uncertainty
   would convert a greedy search into a principled one.
4. **Extended calibration range.** Experimental measurements beyond pH 3–10 would
   allow the applicability gate to be widened rather than merely declared.
5. **Experimental validation.** Synthesising a designed peptide and measuring its pI
   by isoelectric focusing is the only test that closes the loop this project opens.
6. **Dependency pinning.** Required for exact reproducibility of a deployed model.

---

## 17. Conclusion

The project demonstrates that a physical model and a statistical model are more
effective in combination than either alone. By retaining the Henderson–Hasselbalch
formulation and learning only its systematic error, the system achieves a 29%
reduction in RMSE relative to the best published calculator while remaining
interpretable: every prediction decomposes into a chemical estimate and a correction,
both visible to the user.

Three design commitments distinguish it from a conventional applied machine learning
exercise:

- **The physical model remains primary.** The learned term is a correction, not a
  replacement, and is suppressed where evidence does not support it.
- **Uncertainty is measured rather than asserted.** The interval's stated coverage was
  verified empirically at 90.0% against its 90% nominal target.
- **Claims are independently checkable.** Every figure can be reproduced from public
  data through the interface, which was the specific deficiency raised at review.

The language-model integration follows the same discipline: it contributes
specification interpretation and candidate generation, and is prohibited from
emitting a quantity. The deterministic bench tools — protocol selection, charge
calculation, mutational scanning — use no language model at all, and are
reproducible by construction.

The remaining work is principally experimental. The system's predictions have been
validated against withheld laboratory measurements; its *designs* have not yet been
synthesised and measured, and that is the test that matters next.

---

## 18. Appendices

### A. API reference

| Method | Endpoint | Returns |
|---|---|---|
| GET, HEAD | `/health` | Model and language-model readiness |
| POST | `/predict` | Three model outputs, selected model, interval, decomposition, all nine calculators, composition |
| GET | `/residues` | Per-residue decoding with the pKa constants used |
| GET | `/titration-curve` | 141 charge/pH points |
| GET | `/charge` | Net charge at a given pH, electrophoretic direction, binding resin |
| GET | `/protocol` | Resin and buffer selected by rule, both options with charges |
| GET | `/mutation-scan` | All single substitutions ranked, per-position sensitivity |
| POST | `/batch` | Parse and score a file, optional CSV |
| GET | `/amino-acids` | Twenty-residue reference table |
| GET | `/model-metrics` | RMSE, MAE, R² per model |
| GET | `/model-info` | Metrics, classical baselines, feature importance, training facts |
| GET | `/evidence/summary` | Provenance, partition sizes, all model and calculator scores |
| GET | `/evidence/lookup` | Dataset membership and partition for a sequence |
| GET | `/evidence/examples` | Random held-out records plus aggregate coverage |
| POST | `/ai/insight` | Grounded laboratory note |
| POST | `/ai/design` | Inverse-design loop with all rounds |
| POST | `/ai/tune` | Scored mutation variants |

### B. Frontend components

`SearchBar`, `ResultCard`, `SequenceViewer`, `PIScale`, `CalculatorSpread`,
`TitrationCurve`, `ModelComparison`, `Protocol`, `LabInsight`, `AminoAcidLegend`,
`AminoAcidTable`, `BatchPanel`, `Evidence`, `Designer`, `Tuner`, `MutationScan`,
`HowItWorks`.

### C. Reference data

**pKa constants (IPC set, used for all charge calculation)**

| Group | pKa |
|---|---|
| N-terminus | 9.564 |
| C-terminus | 2.383 |
| Asp (D) | 3.887 |
| Glu (E) | 4.317 |
| Cys (C) | 8.297 |
| Tyr (Y) | 10.071 |
| His (H) | 6.018 |
| Lys (K) | 10.517 |
| Arg (R) | 12.503 |

**Worked example — `RYWGFEDKRR`**

| Position | Code | Residue | Class |
|---|---|---|---|
| 1 | R | Arginine | Basic |
| 2 | Y | Tyrosine | Weakly ionisable |
| 3 | W | Tryptophan | Aromatic |
| 4 | G | Glycine | Neutral |
| 5 | F | Phenylalanine | Aromatic |
| 6 | E | Glutamic acid | Acidic |
| 7 | D | Aspartic acid | Acidic |
| 8 | K | Lysine | Basic |
| 9 | R | Arginine | Basic |
| 10 | R | Arginine | Basic |

Four basic against two acidic residues gives a predicted pI of **10.43** — outside
the calibrated range, so the system reports it as a physics-only estimate.

### D. Screenshots

Eleven captures of the running system are held in [`docs/screenshots/`](screenshots/)
with an index describing each and instructions for reproducing them.

### E. Glossary

| Term | Definition |
|---|---|
| **pI** | Isoelectric point — the pH at which net charge is zero |
| **pKa** | The pH at which an ionisable group is half dissociated |
| **Henderson–Hasselbalch** | The relation linking pH, pKa and protonation state |
| **Residual learning** | Training a model on the error of an existing estimator rather than on the target itself |
| **Conformal interval** | A prediction interval whose coverage is calibrated empirically on held-out data |
| **Applicability domain** | The input region in which a model's predictions are supported by evidence |
| **Ion exchange** | Chromatographic separation by charge; cation exchangers bind positive species, anion exchangers negative |
| **Isoelectric focusing** | Electrophoretic separation across a pH gradient, used to measure pI |
| **FASTA** | The standard text format for biological sequences |
| **RMSE** | Root-mean-square error, in pH units here |

### F. Reference figures

| Quantity | Value |
|---|---|
| Training records | 6,748 |
| Held-out records | 1,687 |
| Total measurements | 8,435 |
| Best model RMSE | 0.512 |
| Best model MAE | 0.255 |
| Best classical RMSE | 0.724 (Grimsley) |
| Improvement | 29.2% |
| Interval half-width | ±0.57 |
| Interval coverage | 90.0% (1,519 / 1,687) |
| Calibrated pI range | 3.58 – 9.75 |
| Features per sequence | ~50 |
| pKa tables implemented | 9 |
| Acceptance checks passing | 14 / 14 |

---

*All figures measured on the running system. Dataset: Pérez-Riverol et al.,
Bioinformatics 2016.*
