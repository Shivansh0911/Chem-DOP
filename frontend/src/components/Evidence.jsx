import React, { useEffect, useState } from 'react'
import { getJSON, CALCULATOR_LABELS } from '../api.js'

// The page that exists so nothing here has to be taken on trust. Everything on
// it is pulled live from the server, which computes it from the published
// dataset — none of these numbers are typed into the page.
export default function Evidence({ onInspect }) {
  const [summary, setSummary] = useState(null)
  const [examples, setExamples] = useState(null)
  const [query, setQuery]     = useState('DAQQNELIVK')
  const [hit, setHit]         = useState(null)
  const [busy, setBusy]       = useState(false)
  const [error, setError]     = useState('')

  useEffect(() => {
    getJSON('/evidence/summary').then(setSummary).catch(e => setError(e.message))
    getJSON('/evidence/examples?n=15').then(setExamples).catch(() => {})
  }, [])

  async function lookup(e) {
    e?.preventDefault()
    setBusy(true); setError(''); setHit(null)
    try { setHit(await getJSON(`/evidence/lookup?sequence=${encodeURIComponent(query.trim())}`)) }
    catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }

  function reshuffle() {
    getJSON(`/evidence/examples?n=15&seed=${Math.floor(Math.random() * 9999)}`)
      .then(setExamples).catch(() => {})
  }

  return (
    <div className="space-y-6">
      <div className="card">
        <h2 className="text-lg font-semibold text-lab-700 mb-1">Check this yourself</h2>
        <p className="text-sm text-gray-500">
          Every claim on this site can be verified against the published source data. Nothing below
          is written into the page — the server recomputes it from the dataset each time you load this tab.
        </p>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </div>

      {summary && (
        <>
          <div className="card">
            <h3 className="text-base font-semibold text-lab-700 mb-3">Where the data comes from</h3>
            <dl className="text-sm space-y-2">
              <Row k="Dataset" v={summary.source.name} />
              <Row k="Published in" v={summary.source.paper} />
              <Row k="Download it" v={summary.source.repository} mono />
              <Row k="Our source code" v={summary.source.our_code} mono />
            </dl>
            <p className="text-xs text-gray-500 mt-3 leading-relaxed">
              <span className="font-semibold">How the pI was measured: </span>{summary.source.measurement}
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 text-center">
              <Stat label="Measurements" value={summary.rows_total.toLocaleString()} />
              <Stat label="Used for training" value={summary.rows_training.toLocaleString()} />
              <Stat label="Hidden for testing" value={summary.rows_test.toLocaleString()} accent />
              <Stat label="Measured pI range" value={`${summary.measured_pI_range[0]} – ${summary.measured_pI_range[1]}`} />
            </div>
          </div>

          <div className="card">
            <h3 className="text-base font-semibold text-lab-700 mb-1">Is a sequence in the lab data?</h3>
            <p className="text-xs text-gray-400 mb-3">
              Paste any sequence. If a laboratory has measured it, you will see the measured value,
              whether we trained on it, and how close we came.
            </p>
            <form onSubmit={lookup} className="flex gap-3 flex-wrap">
              <input value={query} onChange={e => setQuery(e.target.value.toUpperCase())}
                className="flex-1 min-w-[260px] px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-lab-500 outline-none font-mono text-sm" />
              <button type="submit" disabled={busy}
                className="px-6 py-3 rounded-xl bg-lab-600 hover:bg-lab-700 text-white font-semibold text-sm disabled:opacity-50">
                {busy ? 'Looking…' : 'Look it up'}
              </button>
            </form>

            {hit && !hit.found && (
              <p className="mt-4 text-sm text-gray-600">
                <b>Not in the dataset.</b> No laboratory in this collection has measured{' '}
                <span className="font-mono">{hit.sequence}</span>, so there is nothing here to check our
                prediction against — which is exactly the situation the model was built for.
              </p>
            )}

            {hit?.found && (
              <div className="mt-4 rounded-xl border border-lab-200 bg-lab-50 p-4 space-y-3">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="font-mono text-sm font-semibold text-lab-700 break-all">{hit.sequence}</span>
                  <span className={`text-xs px-2.5 py-1 rounded-full font-medium
                    ${hit.used_for === 'held-out test' ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'}`}>
                    {hit.used_for === 'held-out test' ? 'Never seen during training' : 'Used for training'}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                  <Stat label="Measured in a lab" value={hit.measured_pI} />
                  <Stat label="Textbook said" value={hit.textbook_pI} sub={`off by ${hit.textbook_error}`} />
                  <Stat label="We said" value={hit.our_prediction} sub={`off by ${hit.error}`} accent />
                  <Stat label="Our stated range"
                    value={`${hit.interval[0]} – ${hit.interval[1]}`}
                    sub={hit.inside_interval ? 'contains the truth' : 'missed it'} />
                </div>
                <button onClick={() => onInspect?.(hit.sequence)}
                  className="text-sm text-lab-600 hover:underline font-medium">
                  Open the full analysis →
                </button>
              </div>
            )}
          </div>

          <div className="card">
            <div className="flex items-start justify-between gap-3 flex-wrap mb-1">
              <h3 className="text-base font-semibold text-lab-700">Peptides the model never saw</h3>
              <button onClick={reshuffle}
                className="text-xs px-3 py-1.5 rounded-lg border border-lab-300 text-lab-700 hover:bg-lab-50 font-medium">
                Draw a different sample
              </button>
            </div>
            <p className="text-xs text-gray-400 mb-3">
              {examples?.note} Press the button to draw a fresh random sample — the table is not curated.
            </p>
            {examples && (
              <>
                <div className="overflow-x-auto rounded-xl border border-gray-100">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-left">
                        {['Sequence', 'Measured in lab', 'Our prediction', 'Off by', 'Inside our range?'].map(h => (
                          <th key={h} className="px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {examples.rows.map((r, i) => (
                        <tr key={r.sequence} className={`border-t border-gray-50 ${i % 2 ? 'bg-gray-50/40' : 'bg-white'}`}>
                          <td className="px-4 py-2.5">
                            <button onClick={() => onInspect?.(r.sequence)}
                              className="font-mono text-xs text-lab-700 hover:underline break-all text-left">
                              {r.sequence}
                            </button>
                          </td>
                          <td className="px-4 py-2.5 font-mono font-semibold">{r.measured_pI.toFixed(2)}</td>
                          <td className="px-4 py-2.5 font-mono text-lab-700 font-semibold">{r.our_prediction.toFixed(2)}</td>
                          <td className={`px-4 py-2.5 font-mono ${r.error <= 0.3 ? 'text-green-700' : r.error <= 0.6 ? 'text-amber-600' : 'text-gray-500'}`}>
                            {r.error.toFixed(2)}
                          </td>
                          <td className="px-4 py-2.5 text-xs">
                            {r.inside_interval
                              ? <span className="text-green-700 font-medium">yes</span>
                              : <span className="text-amber-700 font-medium">no</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="text-xs text-gray-500 mt-3 space-y-1">
                  <p>
                    On this sample of {examples.rows.length}: average error{' '}
                    <b className="font-mono">{examples.mean_error}</b>, inside the stated range{' '}
                    <b>{examples.inside_interval}</b>.
                  </p>
                  {examples.overall && (
                    <p>
                      Across <b>all {examples.overall.rows.toLocaleString()}</b> held-out peptides:
                      average error <b className="font-mono">{examples.overall.mean_error}</b>, inside
                      the range <b className="font-mono">{examples.overall.percent}%</b>. The small
                      table above is deliberately spread across the whole pI range, including the
                      sparse extremes where the model is weakest, so it reads a little worse than the
                      model really is.
                    </p>
                  )}
                </div>
              </>
            )}
          </div>

          <div className="card">
            <h3 className="text-base font-semibold text-lab-700 mb-1">Us against every published method</h3>
            <p className="text-xs text-gray-400 mb-3">
              Scored on the same {summary.rows_test.toLocaleString()} hidden peptides. Average error in pH units — lower is better.
            </p>
            <div className="space-y-1.5">
              {[
                ...Object.entries(summary.all_models).map(([k, v]) => ({ name: `${k.toUpperCase()} (ours)`, rmse: v.rmse, ours: true })),
                ...Object.entries(summary.all_classical).map(([k, v]) => ({ name: CALCULATOR_LABELS[k] ?? k, rmse: v.rmse, ours: false })),
              ].sort((a, b) => a.rmse - b.rmse).map(m => (
                <div key={m.name} className="flex items-center gap-3 text-xs">
                  <span className={`w-36 shrink-0 ${m.ours ? 'font-bold text-lab-700' : 'text-gray-500'}`}>{m.name}</span>
                  <div className="flex-1 h-4 bg-gray-50 rounded overflow-hidden">
                    <div className={`h-full rounded ${m.ours ? 'bg-lab-600' : 'bg-gray-300'}`}
                      style={{ width: `${(m.rmse / 1.2) * 100}%` }} />
                  </div>
                  <span className={`w-12 text-right font-mono ${m.ours ? 'font-bold text-lab-700' : 'text-gray-500'}`}>
                    {m.rmse.toFixed(3)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function Row({ k, v, mono }) {
  return (
    <div className="flex gap-4 border-b border-gray-50 pb-1.5">
      <dt className="text-gray-500 w-40 shrink-0">{k}</dt>
      <dd className={`text-gray-800 ${mono ? 'font-mono text-xs break-all' : ''}`}>{v}</dd>
    </div>
  )
}

function Stat({ label, value, sub, accent }) {
  return (
    <div className={`rounded-xl border p-3 ${accent ? 'border-lab-200 bg-lab-50' : 'border-gray-100 bg-gray-50'}`}>
      <div className={`text-xl font-bold font-mono ${accent ? 'text-lab-700' : 'text-gray-800'}`}>{value}</div>
      <div className="text-[11px] text-gray-500 mt-0.5">{label}</div>
      {sub && <div className="text-[11px] text-gray-400">{sub}</div>}
    </div>
  )
}
