import React from 'react'
import { CALCULATOR_LABELS } from '../api.js'

// Shows the 9 classical pKa-table answers for this sequence next to the ML answer,
// so the audience sees *why* ML is needed: the textbook methods disagree.
export default function CalculatorSpread({ result }) {
  const entries = Object.entries(result.classical ?? {})
  if (!entries.length) return null
  const vals = entries.map(([, v]) => v).concat(result.best_prediction)
  const lo = Math.floor(Math.min(...vals) - 0.3)
  const hi = Math.ceil(Math.max(...vals) + 0.3)
  const pct = v => ((v - lo) / (hi - lo)) * 100

  return (
    <div className="card">
      <h2 className="text-base font-semibold text-lab-700 mb-1">9 Textbook Calculators vs ML</h2>
      <p className="text-xs text-gray-400 mb-4">
        Each classical method is Henderson-Hasselbalch with a different published pKa table — they
        disagree by {(Math.max(...entries.map(e => e[1])) - Math.min(...entries.map(e => e[1]))).toFixed(2)} pH units here.
        The ML model starts from <b>Rodwell</b> and learns the correction from experiments.
      </p>
      <div className="space-y-1.5">
        {entries.sort((a, b) => a[1] - b[1]).map(([k, v]) => (
          <Row key={k} label={CALCULATOR_LABELS[k] ?? k} value={v} left={pct(v)} base={k === 'rodwell'} />
        ))}
        <Row label="ML (ours)" value={result.best_prediction} left={pct(result.best_prediction)} ml />
      </div>
      <div className="flex justify-between text-[10px] text-gray-400 mt-1 pl-24">
        <span>pH {lo}</span><span>pH {hi}</span>
      </div>
    </div>
  )
}

function Row({ label, value, left, ml, base }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className={`w-24 shrink-0 ${ml ? 'font-bold text-lab-700' : base ? 'text-gray-700 font-semibold' : 'text-gray-500'}`}>{label}</span>
      <div className="relative flex-1 h-4 bg-gray-50 rounded">
        <div className={`absolute top-0.5 w-3 h-3 rounded-full -translate-x-1/2
          ${ml ? 'bg-lab-600 ring-2 ring-lab-200' : base ? 'bg-gray-600' : 'bg-gray-300'}`}
          style={{ left: `${left}%` }} />
      </div>
      <span className={`w-12 text-right font-mono ${ml ? 'font-bold text-lab-700' : 'text-gray-500'}`}>{value.toFixed(2)}</span>
    </div>
  )
}
