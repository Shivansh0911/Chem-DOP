# Running pI Predictor locally, and putting it on a public link

Two scripts sit in the project root:

| Script | What it does |
|---|---|
| `run-local.ps1` | Starts the whole app on `http://localhost:8000` |
| `share.ps1` | Puts that running app on a public `https://` URL |

Everything below is PowerShell, run from the project folder.

---

## 1. First time only — prerequisites

| Need | Check with | If missing |
|---|---|---|
| Python 3.12 | `python --version` | [python.org](https://www.python.org/downloads/) — tick **Add to PATH** |
| Node 18+ | `node --version` | [nodejs.org](https://nodejs.org) (LTS) |
| Git | `git --version` | [git-scm.com](https://git-scm.com) |

Get the code:

```powershell
git clone https://github.com/Shivansh0911/Chem-DOP.git
cd Chem-DOP
```

### The API key

Three features (AI lab note, AI Designer, pI Tuner) use Groq. Everything else —
prediction, batch, evidence, protocol, charge, mutation scan — works without it.

Create `backend\.env`:

```
GROQ_API_KEY=<your key>
```

Free key from [console.groq.com/keys](https://console.groq.com/keys). This file is
gitignored and must never be committed.

---

## 2. Start it

```powershell
.\run-local.ps1
```

First run takes about 3 minutes: installs packages, downloads the dataset, trains the
models (~40 s), builds the UI. Later runs start in a few seconds because it skips any
step whose output already exists.

Then open **http://localhost:8000**.

Stop with `Ctrl+C`.

### Flags

```powershell
.\run-local.ps1 -Rebuild    # retrain models and rebuild the UI from scratch
```

Use `-Rebuild` after pulling changes to the model or the frontend.

### If you are editing the frontend

Leave `run-local.ps1` running, and in a second terminal:

```powershell
cd frontend
npm run dev
```

That serves on **http://localhost:5173** with hot reload. Vite proxies the API calls
to port 8000, so no environment variable is needed.

---

## 3. Put it on a public link

Your laptop can serve the site to anyone — useful for a demo when Render is asleep or
out of free hours.

**Leave `run-local.ps1` running.** In a second terminal:

```powershell
.\share.ps1
```

It prints a `https://....ngrok-free.dev` URL. That URL works from any device, anywhere.

### Making the link permanent

By default the URL changes every restart. A free ngrok account includes **one
permanent domain**:

1. Go to [dashboard.ngrok.com/domains](https://dashboard.ngrok.com/domains)
2. **New Domain** → it gives you something like `chem-dop.ngrok-free.app`
3. Save it once:

```powershell
.\share.ps1 -Domain chem-dop.ngrok-free.app -Save
```

From then on plain `.\share.ps1` always uses that same address. Put it in a slide, a
QR code or an email and it stays correct.

### Things to know about the tunnel

- The link is live **only while both terminals are running**. Close them and it dies.
- First-time visitors see an ngrok warning page — they click **Visit Site** once.
- The traffic goes through your machine, so it is as fast as your upload speed. Fine
  for a demo; not a deployment.
- Anyone with the link can use it. Don't leave it running unattended.

---

## 4. Checking it actually works

```powershell
curl http://localhost:8000/health
```

Expect:

```json
{"status":"ok","model_trained":true,"llm_available":true}
```

`llm_available: false` just means no Groq key — the rest still works.

A real prediction:

```powershell
curl -X POST http://localhost:8000/predict -H "Content-Type: application/json" -d '{\"input\":\"RYWGFEDKRR\"}'
```

Should return `best_prediction` ≈ **10.425**, physics 10.39, correction 0.0 — the
correction is zero because this peptide sits above the calibrated range (3.58–9.75),
so the system falls back to physics and says so on screen.

Interactive API docs: **http://localhost:8000/docs**

---

## 5. When something is wrong

| Symptom | Cause | Fix |
|---|---|---|
| `Nothing is serving on port 8000` from `share.ps1` | `run-local.ps1` isn't running | Start it in another terminal first |
| Port 8000 already in use | An earlier run never exited | `Get-Process python \| Stop-Process -Force` |
| `running scripts is disabled on this system` | PowerShell execution policy | `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` |
| Page loads but every number is blank | UI built, API not reachable | Check `/health`; restart `run-local.ps1` |
| `llm_available: false` | No key, or a bad one | Check `backend\.env`, restart |
| Predictions look wrong after a `git pull` | Stale models on disk | `.\run-local.ps1 -Rebuild` |
| `npm run build` fails on Node 20.x | Vite version | The project pins Vite 5, which is correct for Node 20 — run `npm install` again |

---

## 6. Demo sequences

| Sequence | pI | Why it is worth showing |
|---|---|---|
| `DAQQNELIVK` | 3.17 | In the held-out set; measured 3.15. Look it up in the **Evidence** tab to prove the model never saw it. |
| `RYWGFEDKRR` | 10.43 | Strongly basic, above the calibrated range — the app says *physics only* instead of guessing |
| `YYSETHAVLGR` | 6.99 | Near-neutral; measured 6.75 |
| `K` | 9.75 | A single amino acid (lysine) — the simplest possible check |

`DAQQNELIVK` is the one to open with: it is the sequence where all nine published
calculators are wrong by about 0.9 pH units, and where that error would send a chemist
to the wrong resin.
