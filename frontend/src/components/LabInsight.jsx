import React, { useState, useEffect } from 'react'
import { postJSON } from '../api.js'

export default function LabInsight({ sequence, llmAvailable }) {
  const [pH, setPH]         = useState(7.4)
  const [data, setData]     = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState('')

  useEffect(() => { setData(null); setError('') }, [sequence])

  async function run() {
    setLoading(true); setError('')
    try { setData(await postJSON('/ai/insight', { sequence, working_pH: Number(pH) })) }
    catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  const ins = data?.insight

  return (
    <div className="card border-lab-200">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-base font-semibold text-lab-700">AI Lab Note</h2>
          <p className="text-xs text-gray-400">
            LLM reasoning grounded only in the model's numbers — how to purify, run and handle this molecule.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500">Working pH</label>
          <input type="number" step="0.1" min="0" max="14" value={pH}
            onChange={e => setPH(e.target.value)}
            className="w-20 text-sm px-2 py-1.5 border border-gray-200 rounded-lg outline-none focus:border-lab-400" />
          <button onClick={run} disabled={loading || !llmAvailable}
            className="px-4 py-1.5 rounded-lg bg-lab-600 hover:bg-lab-700 text-white text-sm font-semibold disabled:opacity-50">
            {loading ? 'Thinking…' : data ? 'Regenerate' : 'Generate'}
          </button>
        </div>
      </div>

      {!llmAvailable && <p className="mt-3 text-xs text-amber-600">AI is disabled on the server (GROQ_API_KEY not set).</p>}
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      {ins && (
        <div className="mt-4 space-y-4 text-sm">
          <p className="text-gray-800 font-semibold">{ins.headline}</p>

          {ins.drivers?.length > 0 && (
            <div>
              <h3 className="text-xs uppercase tracking-wide text-gray-400 mb-1">What drives the pI</h3>
              <ul className="list-disc list-inside space-y-1 text-gray-600">
                {ins.drivers.map((d, i) => <li key={i}>{d}</li>)}
              </ul>
            </div>
          )}

          <div className="grid sm:grid-cols-2 gap-3">
            <Box title="Model vs textbook physics">{ins.model_vs_physics}</Box>
            <Box title={`At pH ${data.facts.working_pH}`}>{ins.at_working_pH}</Box>
            {ins.purification && (
              <Box title="Ion-exchange purification" accent>
                <div className="font-semibold text-lab-700">{ins.purification.resin} · buffer pH {ins.purification.buffer_pH}</div>
                <div className="mt-1">{ins.purification.why}</div>
              </Box>
            )}
            <Box title="Solubility">{ins.solubility_warning}</Box>
          </div>

          {ins.caveats?.length > 0 && (
            <p className="text-xs text-gray-400">
              <span className="font-semibold">Caveats: </span>{ins.caveats.join(' · ')}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function Box({ title, children, accent }) {
  return (
    <div className={`rounded-xl border p-3 ${accent ? 'border-lab-200 bg-lab-50' : 'border-gray-100 bg-gray-50'}`}>
      <div className="text-[11px] uppercase tracking-wide text-gray-400 mb-1">{title}</div>
      <div className="text-gray-700 text-sm">{children}</div>
    </div>
  )
}
