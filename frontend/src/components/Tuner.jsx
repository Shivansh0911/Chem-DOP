import React, { useState } from 'react'
import { postJSON } from '../api.js'

export default function Tuner({ llmAvailable, initialSequence = '', onInspect }) {
  const [seq, setSeq]       = useState(initialSequence)
  const [target, setTarget] = useState(5.0)
  const [data, setData]     = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState('')

  async function run(e) {
    e?.preventDefault()
    if (!seq.trim()) return
    setLoading(true); setError(''); setData(null)
    try { setData(await postJSON('/ai/tune', { sequence: seq.trim(), target_pI: Number(target) })) }
    catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }

  return (
    <div className="space-y-6">
      <div className="card">
        <h2 className="text-lg font-semibold text-lab-700 mb-1">Mutation Tuner — move an existing peptide's pI</h2>
        <p className="text-sm text-gray-500 mb-4">
          Give a sequence and the pI you want. The LLM suggests minimal point mutations with a chemical
          rationale; every variant is re-scored by the ML model so you see the real shift, not a guess.
        </p>

        <form onSubmit={run} className="flex gap-3 flex-wrap">
          <input value={seq} onChange={e => setSeq(e.target.value.toUpperCase())}
            placeholder="MKTLLLTLVVVTIVCLDLGAVK"
            className="flex-1 min-w-[240px] px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-lab-500 outline-none font-mono text-sm" />
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500 whitespace-nowrap">Target pI</label>
            <input type="number" step="0.1" min="2" max="13" value={target}
              onChange={e => setTarget(e.target.value)}
              className="w-20 px-3 py-3 rounded-xl border-2 border-gray-200 focus:border-lab-500 outline-none text-sm" />
          </div>
          <button type="submit" disabled={loading || !llmAvailable}
            className="px-6 py-3 rounded-xl bg-lab-600 hover:bg-lab-700 text-white font-semibold text-sm disabled:opacity-50">
            {loading ? 'Engineering…' : 'Suggest mutations'}
          </button>
        </form>

        {!llmAvailable && <p className="mt-3 text-xs text-amber-600">AI is disabled on the server (GROQ_API_KEY not set).</p>}
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </div>

      {data && (
        <div className="card">
          <div className="flex items-baseline justify-between flex-wrap gap-2 mb-1">
            <h3 className="font-semibold text-lab-700 text-sm">Variants, ranked by how close they land</h3>
            <span className="text-xs text-gray-400">
              wild type pI <b className="text-gray-700 font-mono">{data.current.pI.toFixed(2)}</b> → target <b className="text-gray-700 font-mono">{data.target_pI}</b>
            </span>
          </div>
          <p className="text-sm text-gray-600 mb-4">{data.strategy}</p>

          <div className="space-y-2">
            {data.variants.map((v, i) => <Variant key={i} v={v} wt={data.current.pI} target={data.target_pI} onInspect={onInspect} />)}
          </div>
        </div>
      )}
    </div>
  )
}

function Variant({ v, wt, target, onInspect }) {
  if (!v.valid) {
    return (
      <div className="text-xs px-3 py-2 rounded-lg bg-red-50 border border-red-100 text-red-600">
        {v.mutations.join(', ') || '(none)'} — rejected: the residue named doesn't match that position
      </div>
    )
  }
  const err = Math.abs(v.error)
  const tone = err <= 0.3 ? 'bg-green-50 border-green-200' : err <= 1 ? 'bg-amber-50 border-amber-100' : 'bg-gray-50 border-gray-100'
  return (
    <div className={`rounded-xl border p-3 ${tone}`}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          {v.mutations.map(m => (
            <span key={m} className="font-mono text-xs px-2 py-1 rounded-lg bg-white border border-gray-200 font-semibold text-lab-700">{m}</span>
          ))}
        </div>
        <div className="flex items-center gap-4 text-xs shrink-0">
          <div className="text-center">
            <div className="font-mono text-sm font-bold text-gray-800">
              {wt.toFixed(2)} → {v.pI.toFixed(2)}
            </div>
            <div className="text-[10px] text-gray-400">predicted pI</div>
          </div>
          <div className="text-center">
            <div className={`font-mono text-sm font-semibold ${v.shift >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
              {v.shift > 0 ? '+' : ''}{v.shift.toFixed(2)}
            </div>
            <div className="text-[10px] text-gray-400">shift</div>
          </div>
        </div>
      </div>
      <p className="text-xs text-gray-500 mt-1.5">{v.rationale}</p>
      <button onClick={() => onInspect?.(v.sequence)}
        className="mt-1 font-mono text-[11px] text-lab-600 hover:underline break-all text-left">
        {v.sequence} →
      </button>
    </div>
  )
}
