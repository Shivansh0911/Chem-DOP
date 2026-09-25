import React, { useState } from 'react'
import { postJSON } from '../api.js'

const EXAMPLES = [
  'A 12-residue peptide that binds DNA strongly and contains a tryptophan for fluorescence tracking',
  'A peptide that stays highly soluble in a pH 7.4 buffer and carries no net charge there',
  'An acidic 10-mer for calcium binding, avoid cysteine',
  'A cell-penetrating peptide that sticks to negatively charged membranes',
]

export default function Designer({ llmAvailable, onInspect }) {
  const [goal, setGoal]       = useState('')
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  async function run(e) {
    e?.preventDefault()
    if (!goal.trim()) return
    setLoading(true); setError(''); setData(null)
    try { setData(await postJSON('/ai/design', { goal: goal.trim(), max_rounds: 3 })) }
    catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }

  return (
    <div className="space-y-6">
      <div className="card">
        <h2 className="text-lg font-semibold text-lab-700 mb-1">Inverse Design — describe the molecule you need</h2>
        <p className="text-sm text-gray-500 mb-4">
          The LLM turns your sentence into a numeric spec and proposes candidates; our ML model scores
          every one; the LLM reads the scores and tries again. Up to 3 rounds, closed loop.
        </p>

        <form onSubmit={run} className="flex gap-3">
          <input value={goal} onChange={e => setGoal(e.target.value)}
            placeholder="e.g. a 12-residue peptide that binds DNA and has a Trp for tracking"
            className="flex-1 px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-lab-500 outline-none text-sm" />
          <button type="submit" disabled={loading || !llmAvailable}
            className="px-6 py-3 rounded-xl bg-lab-600 hover:bg-lab-700 text-white font-semibold text-sm disabled:opacity-50 whitespace-nowrap">
            {loading ? 'Designing…' : 'Design'}
          </button>
        </form>

        {!llmAvailable && <p className="mt-3 text-xs text-amber-600">AI is disabled on the server (GROQ_API_KEY not set).</p>}
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <div className="mt-3 flex flex-wrap gap-2">
          <span className="text-xs text-gray-400">Try:</span>
          {EXAMPLES.map(ex => (
            <button key={ex} onClick={() => setGoal(ex)}
              className="text-xs px-2 py-1 rounded-lg bg-lab-50 text-lab-600 hover:bg-lab-100 text-left">
              {ex.length > 48 ? ex.slice(0, 48) + '…' : ex}
            </button>
          ))}
        </div>

        {loading && (
          <div className="mt-5 text-sm text-gray-400 animate-pulse">
            Reading the goal → writing a spec → proposing peptides → scoring them with the ML model → refining…
          </div>
        )}
      </div>

      {data && <Spec data={data} />}
      {data?.rounds.map(r => (
        <Round key={r.round} round={r} target={data.spec.target_pI} best={data.best} onInspect={onInspect} />
      ))}
      {data?.best && <Winner best={data.best} data={data} onInspect={onInspect} />}
    </div>
  )
}

function Spec({ data }) {
  const s = data.spec
  return (
    <div className="card bg-lab-50 border-lab-200">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="font-semibold text-lab-700 text-sm">Step 1 — Goal read as a numeric spec</h3>
        <span className={`text-xs px-2.5 py-1 rounded-full font-medium
          ${data.converged ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
          {data.converged ? 'Converged within tolerance' : 'Closest achievable — see note'}
        </span>
      </div>
      <p className="text-sm text-gray-600 mt-2 italic">"{s.interpretation}"</p>
      {!data.converged && (
        <p className="text-xs text-amber-700 mt-2">
          The loop stopped outside the ±{s.tolerance} tolerance. Usually this means the chemistry itself
          can't reach that pI at this length — a peptide basic enough to bind DNA is simply more basic than
          pI {s.target_pI} — or the target sits outside the calibrated range
          (pI {data.calibrated_range[0]}–{data.calibrated_range[1]}), where scoring falls back to physics alone.
        </p>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-4 text-center">
        <Cell label="Target pI" value={s.target_pI} big />
        <Cell label="Tolerance" value={`± ${s.tolerance}`} />
        <Cell label="Length" value={`${s.length_min}–${s.length_max}`} />
        <Cell label="Must include" value={s.must_include || '—'} />
        <Cell label="Avoid" value={s.avoid || '—'} />
      </div>
    </div>
  )
}

function Cell({ label, value, big }) {
  return (
    <div>
      <div className={`font-bold text-lab-700 ${big ? 'text-2xl' : 'text-lg'}`}>{value}</div>
      <div className="text-[11px] text-gray-400 uppercase tracking-wide">{label}</div>
    </div>
  )
}

function Round({ round, target, best, onInspect }) {
  return (
    <div className="card">
      <div className="flex items-baseline gap-3 mb-1">
        <h3 className="font-semibold text-lab-700 text-sm">Round {round.round}</h3>
        <span className="text-xs text-gray-400">LLM proposes · ML scores</span>
      </div>
      <p className="text-sm text-gray-600 mb-4">{round.analysis}</p>

      <div className="space-y-2">
        {round.candidates.map(c => (
          <Candidate key={c.sequence} c={c} target={target}
            isBest={best?.sequence === c.sequence} onInspect={onInspect} />
        ))}
      </div>
    </div>
  )
}

function Candidate({ c, target, isBest, onInspect }) {
  if (!c.valid) {
    return (
      <div className="flex items-center gap-3 text-xs px-3 py-2 rounded-lg bg-red-50 border border-red-100">
        <span className="font-mono text-gray-500 line-through">{c.sequence || '(empty)'}</span>
        <span className="text-red-600">rejected — {c.rejected_because}. Never shown as a result.</span>
      </div>
    )
  }
  const err = Math.abs(c.error)
  const tone = err <= 0.3 ? 'bg-green-50 border-green-200' : err <= 1 ? 'bg-amber-50 border-amber-100' : 'bg-gray-50 border-gray-100'
  return (
    <div className={`rounded-xl border p-3 ${tone} ${isBest ? 'ring-2 ring-lab-400' : ''}`}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <button onClick={() => onInspect?.(c.sequence)}
          className="font-mono text-sm font-semibold text-lab-700 hover:underline break-all text-left">
          {c.sequence}
        </button>
        <div className="flex items-center gap-4 text-xs shrink-0">
          {c.in_domain === false && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-200 text-gray-600"
              title="Outside the experimental range, so this is the physics estimate with no learned correction">
              physics only
            </span>
          )}
          <Metric label="ML pI" value={c.pI.toFixed(2)} strong />
          <Metric label="vs target" value={`${c.error > 0 ? '+' : ''}${c.error.toFixed(2)}`} />
          <Metric label="charge pH 7.4" value={c.charge_pH7_4?.toFixed(2)} />
        </div>
      </div>
      <p className="text-xs text-gray-500 mt-1.5">{c.rationale}</p>
    </div>
  )
}

function Metric({ label, value, strong }) {
  return (
    <div className="text-center">
      <div className={`font-mono ${strong ? 'text-sm font-bold text-gray-800' : 'text-gray-600'}`}>{value}</div>
      <div className="text-[10px] text-gray-400">{label}</div>
    </div>
  )
}

function Winner({ best, data, onInspect }) {
  return (
    <div className="card border-2 border-lab-400 bg-gradient-to-br from-lab-50 to-white">
      <h3 className="text-sm font-semibold text-lab-700 mb-3">Final design</h3>
      <div className="flex items-end gap-6 flex-wrap">
        <div>
          <div className="font-mono text-xl font-bold text-gray-800 break-all">{best.sequence}</div>
          <div className="text-xs text-gray-400 mt-1">
            {best.sequence.length} residues · found in round {best.round} · target was pI {data.spec.target_pI}
          </div>
        </div>
        <div className="text-right ml-auto">
          <div className="text-4xl font-bold text-lab-700">{best.pI.toFixed(2)}</div>
          <div className="text-xs text-gray-400">predicted pI · 90% CI {best.ci_low.toFixed(2)}–{best.ci_high.toFixed(2)}</div>
        </div>
      </div>
      <button onClick={() => onInspect?.(best.sequence)}
        className="mt-4 text-sm px-4 py-2 rounded-lg bg-lab-600 hover:bg-lab-700 text-white font-semibold">
        Open in full analysis →
      </button>
    </div>
  )
}
