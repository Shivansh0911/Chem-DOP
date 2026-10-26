import React, { useState } from 'react'
import { postJSON, downloadText } from '../api.js'

const SAMPLE = `>Insulin B chain fragment
FVNQHLCGSHLVEAL
>Angiotensin II
DRVYIHPF
>Glucagon fragment
HSQGTFTSDYSKYLDSRR
>Test-set peptide, measured pI 3.15
DAQQNELIVK
>Test-set peptide, measured pI 6.75
YYSETHAVLGR`

// A real lab never has one peptide. This takes a whole FASTA file or a pasted
// list, scores everything in one pass, and hands back a CSV for the notebook.
export default function BatchPanel({ onInspect }) {
  const [text, setText]   = useState('')
  const [data, setData]   = useState(null)
  const [busy, setBusy]   = useState(false)
  const [error, setError] = useState('')

  async function run(e) {
    e?.preventDefault()
    if (!text.trim()) return
    setBusy(true); setError(''); setData(null)
    try { setData(await postJSON('/batch', { text, as_csv: true })) }
    catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }

  function loadFile(e) {
    const f = e.target.files?.[0]
    if (!f) return
    const r = new FileReader()
    r.onload = () => setText(String(r.result).slice(0, 200000))
    r.readAsText(f)
    e.target.value = ''
  }

  const rows = data?.rows ?? []
  const lo = rows.length ? Math.floor(Math.min(...rows.map(r => r.ci_low)) - 0.3) : 0
  const hi = rows.length ? Math.ceil(Math.max(...rows.map(r => r.ci_high)) + 0.3) : 14
  const pct = v => ((v - lo) / (hi - lo)) * 100

  return (
    <div className="space-y-6">
      <div className="card">
        <h2 className="text-lg font-semibold text-lab-700 mb-1">Many peptides at once</h2>
        <p className="text-sm text-gray-500 mb-4">
          Paste a FASTA file, or one sequence per line. Everything is scored in a single pass and
          you can download the whole table as a CSV for your lab notebook.
        </p>

        <form onSubmit={run} className="space-y-3">
          <textarea value={text} onChange={e => setText(e.target.value)} rows={8}
            placeholder={'>peptide-1\nDAQQNELIVK\n>peptide-2\nRYWGFEDKRR'}
            className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-lab-500 outline-none font-mono text-sm" />
          <div className="flex gap-3 flex-wrap items-center">
            <button type="submit" disabled={busy}
              className="px-6 py-3 rounded-xl bg-lab-600 hover:bg-lab-700 text-white font-semibold text-sm disabled:opacity-50">
              {busy ? 'Scoring…' : 'Score them all'}
            </button>
            <label className="px-4 py-3 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 cursor-pointer">
              Upload a file
              <input type="file" accept=".txt,.fasta,.fa,.faa,.seq,.csv" onChange={loadFile} className="hidden" />
            </label>
            <button type="button" onClick={() => setText(SAMPLE)}
              className="text-xs px-3 py-2 rounded-lg bg-lab-50 text-lab-600 hover:bg-lab-100">
              Load an example
            </button>
          </div>
        </form>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </div>

      {data && (
        <>
          {data.errors?.length > 0 && (
            <div className="card border-amber-200 bg-amber-50">
              <h3 className="text-sm font-semibold text-amber-800 mb-2">
                {data.errors.length} entr{data.errors.length === 1 ? 'y was' : 'ies were'} skipped
              </h3>
              <ul className="text-xs text-amber-700 space-y-1">
                {data.errors.map((er, i) => (
                  <li key={i}><span className="font-mono">{er.name}</span> — {er.reason}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="card">
            <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
              <div>
                <h3 className="text-base font-semibold text-lab-700">{rows.length} results</h3>
                <p className="text-xs text-gray-400">Click a sequence to open its full analysis.</p>
              </div>
              <button onClick={() => downloadText('pI-results.csv', data.csv)}
                className="px-4 py-2 rounded-lg bg-lab-600 hover:bg-lab-700 text-white text-sm font-semibold">
                Download CSV
              </button>
            </div>

            <div className="overflow-x-auto rounded-xl border border-gray-100">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left">
                    {['Name', 'Sequence', 'Len', 'pI', '90% range', 'Charge pH 7.4', 'Acidic', 'Basic'].map(h => (
                      <th key={h} className="px-3 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} className={`border-t border-gray-50 ${i % 2 ? 'bg-gray-50/40' : 'bg-white'}`}>
                      <td className="px-3 py-2.5 text-gray-700">{r.name}</td>
                      <td className="px-3 py-2.5">
                        <button onClick={() => onInspect?.(r.sequence)}
                          className="font-mono text-xs text-lab-700 hover:underline break-all text-left">
                          {r.sequence.length > 26 ? r.sequence.slice(0, 26) + '…' : r.sequence}
                        </button>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs text-gray-500">{r.length}</td>
                      <td className="px-3 py-2.5 font-mono font-bold text-lab-700">
                        {r.pI.toFixed(2)}
                        {!r.reliable && <span className="ml-1 text-[10px] text-gray-400">physics only</span>}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs text-gray-500">{r.ci_low.toFixed(2)}–{r.ci_high.toFixed(2)}</td>
                      <td className={`px-3 py-2.5 font-mono text-xs ${r.charge_pH7_4 > 0 ? 'text-blue-600' : 'text-red-600'}`}>
                        {r.charge_pH7_4 > 0 ? '+' : ''}{r.charge_pH7_4.toFixed(2)}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs text-gray-500">{r.acidic_pct}%</td>
                      <td className="px-3 py-2.5 font-mono text-xs text-gray-500">{r.basic_pct}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {rows.length > 1 && (
            <div className="card">
              <h3 className="text-base font-semibold text-lab-700 mb-1">Side by side</h3>
              <p className="text-xs text-gray-400 mb-4">
                Each bar is the 90% range; the dot is the predicted pI. Useful for seeing at a glance
                which of a set will behave differently on the same column.
              </p>
              <div className="space-y-2">
                {rows.map((r, i) => (
                  <div key={i} className="flex items-center gap-3 text-xs">
                    <span className="w-36 shrink-0 text-gray-600 truncate" title={r.name}>{r.name}</span>
                    <div className="relative flex-1 h-5 bg-gray-50 rounded">
                      <div className="absolute top-1.5 h-2 bg-lab-200 rounded-full"
                        style={{ left: `${pct(r.ci_low)}%`, width: `${pct(r.ci_high) - pct(r.ci_low)}%` }} />
                      <div className="absolute top-1 w-3 h-3 rounded-full bg-lab-600 -translate-x-1/2"
                        style={{ left: `${pct(r.pI)}%` }} />
                    </div>
                    <span className="w-12 text-right font-mono font-semibold text-lab-700">{r.pI.toFixed(2)}</span>
                  </div>
                ))}
              </div>
              <div className="flex justify-between text-[10px] text-gray-400 mt-1 pl-36">
                <span>pH {lo}</span><span>pH {hi}</span>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
