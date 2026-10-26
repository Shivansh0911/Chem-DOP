import React from 'react'

// Where this peptide sits on the pH scale, against buffers a chemist actually
// works with. A number like 3.17 means little on its own; seeing it fall below
// the acetate range and far from physiological pH says what it will do.

const MARKS = [
  { pH: 1.5,  label: 'Gastric acid' },
  { pH: 4.8,  label: 'Acetate buffer' },
  { pH: 7.4,  label: 'Blood / physiological' },
  { pH: 8.0,  label: 'Tris buffer' },
  { pH: 10.3, label: 'Carbonate buffer' },
]

const BANDS = [
  { from: 0,   to: 5.5,  tone: 'bg-red-100',  name: 'Acidic' },
  { from: 5.5, to: 7.5,  tone: 'bg-gray-100', name: 'Neutral' },
  { from: 7.5, to: 14,   tone: 'bg-blue-100', name: 'Basic' },
]

const pct = v => (v / 14) * 100

export default function PIScale({ result }) {
  if (!result) return null
  const { best_prediction: pI, confidence_low: lo, confidence_high: hi, in_domain } = result

  return (
    <div className="card">
      <h2 className="text-base font-semibold text-lab-700 mb-1">Where this sits on the pH scale</h2>
      <p className="text-xs text-gray-400 mb-6">
        The dot is the predicted pI, the bar around it is the 90% range. Below are buffers you would
        actually reach for, so you can see which ones sit above the pI and which below.
      </p>

      <div className="relative pt-9 pb-2">
        {/* the pI marker, above the scale */}
        <div className="absolute top-0 -translate-x-1/2 flex flex-col items-center"
          style={{ left: `${pct(pI)}%` }}>
          <span className="font-mono font-bold text-sm text-lab-700 whitespace-nowrap">
            pI {pI.toFixed(2)}
          </span>
          <span className="w-px h-2 bg-lab-600" />
        </div>

        {/* the coloured bands */}
        <div className="relative h-9 rounded-lg overflow-hidden flex">
          {BANDS.map(b => (
            <div key={b.name} className={`${b.tone} flex items-center justify-center`}
              style={{ width: `${pct(b.to - b.from)}%` }}>
              <span className="text-[10px] uppercase tracking-wide text-gray-500 font-medium">{b.name}</span>
            </div>
          ))}

          {/* confidence range */}
          <div className="absolute top-0 h-full bg-lab-600/25 border-x-2 border-lab-600/50"
            style={{ left: `${pct(lo)}%`, width: `${pct(hi) - pct(lo)}%` }} />

          {/* the pI itself */}
          <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 rounded-full
            bg-lab-600 border-2 border-white shadow"
            style={{ left: `${pct(pI)}%` }} />
        </div>

        {/* the ruler */}
        <div className="flex justify-between text-[10px] text-gray-400 font-mono mt-1">
          {[0, 2, 4, 6, 8, 10, 12, 14].map(t => <span key={t}>{t}</span>)}
        </div>
      </div>

      {/* reference buffers */}
      <div className="mt-4 space-y-1.5">
        {MARKS.map(m => {
          const above = m.pH > pI
          return (
            <div key={m.label} className="flex items-center gap-3 text-xs">
              <span className="w-10 shrink-0 font-mono text-gray-500 text-right">{m.pH}</span>
              <div className="relative flex-1 h-4">
                <div className="absolute top-1/2 w-full h-px bg-gray-100" />
                <div className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2 h-2 rounded-full
                  ${above ? 'bg-red-500' : 'bg-blue-500'}`} style={{ left: `${pct(m.pH)}%` }} />
              </div>
              <span className="w-44 shrink-0 text-gray-600">{m.label}</span>
              <span className={`w-28 shrink-0 text-right font-medium ${above ? 'text-red-600' : 'text-blue-600'}`}>
                {above ? 'negative here' : 'positive here'}
              </span>
            </div>
          )
        })}
      </div>

      {!in_domain && (
        <p className="text-xs text-amber-700 mt-4 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          This pI falls outside the range our laboratory data covers, so the position shown is the
          textbook estimate with no learned correction, and the range around it is deliberately wider.
        </p>
      )}
    </div>
  )
}
