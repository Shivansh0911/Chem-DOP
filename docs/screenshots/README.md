# Screenshots

Captured from the running application, not mock-ups. Each was taken while driving
the real site against the trained model, so every number in them is a live result.

The peptide used throughout is `DAQQNELIVK`, which is in the **held-out test set** —
the model never saw it during training. A laboratory measured its pI at **3.15**.

| Screenshot | What it shows |
| --- | --- |
| [01-prediction-decomposition](01-prediction-decomposition.png) | The core idea: pI 3.17 shown as textbook 4.06 **plus** a learned correction of −0.89 |
| [02-sequence-viewer](02-sequence-viewer.png) | Every residue as a tile; hovering decodes it (`I = Ile = Isoleucine`), with the pH slider and charge balance below |
| [03-ph-slider](03-ph-slider.png) | The same viewer at a different pH — tiles recoloured as their groups gain or lose protons |
| [04-ph-scale-buffers](04-ph-scale-buffers.png) | The predicted pI on a pH ribbon, against gastric acid, acetate, physiological, Tris and carbonate |
| [05-purification-protocol](05-purification-protocol.png) | Rule-based protocol: anion exchange at pH 7.0, net charge −1.00, with the storage band flagged |
| [06-evidence-sources](06-evidence-sources.png) | Dataset, paper, exact files, and how the pI was measured — all recomputed server-side |
| [07-evidence-lookup](07-evidence-lookup.png) | `DAQQNELIVK` marked *never seen during training*: measured 3.15, textbook off by 0.91, ours off by 0.024 |
| [08-batch-results](08-batch-results.png) | A whole FASTA file scored in one pass, with CSV export |
| [09-ai-designer](09-ai-designer.png) | The inverse-design loop: the AI proposes, our model scores, the AI corrects itself |
| [10-mutation-scan](10-mutation-scan.png) | All 190 single substitutions ranked, plus per-position sensitivity |
| [11-benchmark](11-benchmark.png) | Our three models against all nine published calculators on the same held-out set |

## Reproducing them

Start the app and open any of these:

```
http://localhost:8000/?seq=DAQQNELIVK     # 01–05
http://localhost:8000/?seq=RYWGFEDKRR     # a basic peptide, for contrast
```

Then the Evidence, Batch, AI Designer and pI Tuner tabs for 06–10, and
How it works for 11.
