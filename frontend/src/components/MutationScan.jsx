import React, { useState } from 'react'
import { getJSON } from '../api.js'

// The counterpart to the AI tuner. The AI proposes a few clever mutations;
// this tries every single one there is. Exhaustive, repeatable, no AI — so you
// can be certain nothing better was missed.
export default function MutationScan({ initialSequence = '', onInspect }) {
  const [seq, setSeq]     = useState(initialSequence)
  const [data, setData]   = useState(null)
  const [busy, setBusy]   = useState(false)
  const [error, setError] = useState('')

  async function run(e) {
    e?.preventDefault()
    if (!seq.trim()) return
    setBusy(true); setError(''); setData(null)
    try { setData(await getJSON(`/mutation-scan?sequence=${encodeURIComponent(seq.trim())}&top=10`)) }
    catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }

  const maxSens = data ? Math.max(...data.sensitivity.map(s => s.max_shift), 0.001) : 1

  return (
    <div className="space-y-6">
      <div className="card">
        <h2 className="text-lg font-semibold text-lab-700 mb-1">Exhaustive mutation scan</h2>
        <p className="text-sm text-gray-500 mb-4">
          Tries <b>every possible single substitution</b> — all 19 alternatives at every position —
          and ranks them. The AI tuner above is creative; this one is complete. Same answer every time.
        </p>
        <form onSubmit={run} className="flex gap-3 flex-wrap">
          <input value={seq} onChange={e => setSeq(e.target.value.toUpperCase())}
            placeholder="DAQQNELIVK"
            className="flex-1 min-w-[260px] px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-lab-500 outline-none font-mono text-sm" />
          <button type="submit" disabled={busy}
            className="px-6 py-3 rounded-xl bg-lab-600 hover:bg-lab-700 text-white font-semibold text-sm disabled:opacity-50">
            {busy ? 'Scanning…' : 'Scan every mutation'}
          </button>
        </form>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </div>

      {data && (
        <>
          <div className="card">
            <p className="text-sm text-gray-600">
              Starting pI <b className="font-mono text-lab-700">{data.base_pI.toFixed(2)}</b> ·
              {' '}<b>{data.variants_tested}</b> variants tested · {data.note}
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <Table title="Biggest increase in pI" rows={data.raises_pI} base={data.base_pI} onInspect={onInspect} up />
            <Table title="Biggest decrease in pI" rows={data.lowers_pI} base={data.base_pI} onInspect={onInspect} />
          </div>

          <div className="card">
            <h3 className="text-base font-semibold text-lab-700 mb-1">Which positions matter</h3>
            <p className="text-xs text-gray-400 mb-4">
              How far the pI can move if you change each position. Flat bars are safe places to mutate
              for some other reason without disturbing the charge.
            </p>
            <div className="space-y-1.5">
              {data.sensitivity.map(s => (
                <div key={s.position} className="flex items-center gap-3 text-xs">
                  <span className="w-20 shrink-0 font-mono text-gray-600">
                    {s.residue}{s.position}
                  </span>
                  <div className="flex-1 h-4 bg-gray-50 rounded overflow-hidden">
                    <div className="h-full bg-lab-500 rounded" style={{ width: `${(s.max_shift / maxSens) * 100}%` }} />
                  </div>
                  <span className="w-14 text-right font-mono text-gray-500">{s.max_shift.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function Table({ title, rows, base, onInspect, up }) {
  return (
    <div className="card">
      <h3 className="text-base font-semibold text-lab-700 mb-3">{title}</h3>
      <div className="space-y-1.5">
        {rows.map(r => (
          <div key={r.mutation} className="flex items-center gap-3 text-xs rounded-lg px-2 py-1.5 bg-gray-50">
            <span className="font-mono font-semibold text-lab-700 w-16">{r.mutation}</span>
            <span className="text-gray-400 flex-1 truncate">{r.from} → {r.to} at {r.position}</span>
            <span className="font-mono text-gray-700">{base.toFixed(2)} → <b>{r.pI.toFixed(2)}</b></span>
            <span className={`font-mono font-semibold w-14 text-right ${up ? 'text-blue-600' : 'text-red-600'}`}>
              {r.shift > 0 ? '+' : ''}{r.shift.toFixed(2)}
            </span>
            <button onClick={() => onInspect?.(r.sequence)} className="text-lab-600 hover:underline">open</button>
          </div>
        ))}
      </div>
    </div>
  )
}
