import React, { useEffect, useState } from 'react'
import { API, CALCULATOR_LABELS } from '../api.js'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList,
} from 'recharts'

const MODEL_LABELS = { rf: 'Random Forest', gb: 'Gradient Boosting', ridge: 'Ridge' }

export default function HowItWorks() {
  const [info, setInfo] = useState(null)

  useEffect(() => {
    fetch(`${API}/model-info`).then(r => r.json()).then(d => { if (!d.detail) setInfo(d) }).catch(() => {})
  }, [])

  const bars = info ? [
    ...Object.entries(info.baselines).map(([k, v]) => ({
      name: CALCULATOR_LABELS[k] ?? k, rmse: v.rmse, ours: false,
    })).sort((a, b) => b.rmse - a.rmse),
    ...Object.entries(info.metrics).map(([k, v]) => ({
      name: `${MODEL_LABELS[k]} (ours)`, rmse: v.rmse, ours: true,
    })).sort((a, b) => b.rmse - a.rmse),
  ] : []

  const bestOurs = info && Math.min(...Object.values(info.metrics).map(m => m.rmse))
  const bestClassical = info && Math.min(...Object.values(info.baselines).map(m => m.rmse))

  return (
    <div className="space-y-6">
      <div className="card">
        <h2 className="text-lg font-semibold text-lab-700 mb-3">How a prediction is made</h2>
        <div className="grid md:grid-cols-4 gap-3 text-sm">
          <Step n="1" title="Physics first">
            The sequence is run through nine published pKa tables (EMBOSS, IPC, Bjellqvist…), each
            solving Henderson-Hasselbalch for the pH where net charge is zero.
          </Step>
          <Step n="2" title="ML learns the error">
            Our models never predict pI from scratch. They predict the <b>residual</b> — how far the
            Rodwell table was wrong on {info ? (info.n_train + info.n_test).toLocaleString() : '8,400'} real
            measurements. Physics carries the answer, ML corrects it.
          </Step>
          <Step n="3" title="Honest uncertainty">
            The ±band is a split-conformal interval: on held-out data the true pI fell inside it 90% of
            the time{info ? ` (±${info.conformal_q90})` : ''}. Outside the experimental domain the
            correction is faded out and the band widens.
          </Step>
          <Step n="4" title="LLM reasoning">
            Groq (gpt-oss-120b) turns goals into specs, proposes sequences and writes lab protocols —
            but every number it reports came from the code above, never from the LLM.
          </Step>
        </div>
      </div>

      {info && (
        <div className="card">
          <h2 className="text-base font-semibold text-lab-700 mb-1">Benchmark — us vs every textbook method</h2>
          <p className="text-xs text-gray-400 mb-4">
            Same {info.n_test.toLocaleString()} held-out sequences for everyone. RMSE in pH units, lower is better.
            Our best beats the best classical table by {(((bestClassical - bestOurs) / bestClassical) * 100).toFixed(0)}%.
          </p>
          <ResponsiveContainer width="100%" height={380}>
            <BarChart data={bars} layout="vertical" margin={{ left: 30, right: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11 }} domain={[0, 'dataMax']} />
              <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11 }} />
              <Tooltip formatter={v => [`RMSE ${v}`, '']} />
              <Bar dataKey="rmse" radius={[0, 4, 4, 0]} isAnimationActive={false}>
                <LabelList dataKey="rmse" position="right" style={{ fontSize: 10, fill: '#9ca3af' }} />
                {bars.map((b, i) => <Cell key={i} fill={b.ours ? '#4f46e5' : '#d1d5db'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {info && (
        <div className="grid md:grid-cols-2 gap-6">
          <div className="card">
            <h2 className="text-base font-semibold text-lab-700 mb-1">What the model actually looks at</h2>
            <p className="text-xs text-gray-400 mb-3">Top features by gradient-boosting importance.</p>
            <div className="space-y-1.5">
              {info.importance.map(f => (
                <div key={f.feature} className="flex items-center gap-2 text-xs">
                  <span className="w-36 shrink-0 font-mono text-gray-600 truncate">{f.feature}</span>
                  <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-lab-500 rounded-full"
                      style={{ width: `${(f.importance / info.importance[0].importance) * 100}%` }} />
                  </div>
                  <span className="w-10 text-right font-mono text-gray-400">{f.importance.toFixed(3)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <h2 className="text-base font-semibold text-lab-700 mb-3">Training at a glance</h2>
            <dl className="text-sm space-y-2">
              <Fact k="Training sequences" v={info.n_train.toLocaleString()} />
              <Fact k="Held-out test sequences" v={info.n_test.toLocaleString()} />
              <Fact k="Residual baseline" v={CALCULATOR_LABELS[info.base_calculator] ?? info.base_calculator} />
              <Fact k="Sequence lengths seen" v={`${info.train_len_range[0]}–${info.train_len_range[1]} residues`} />
              <Fact k="Reliable pI range" v={`${info.pI_domain[0]} – ${info.pI_domain[1]}`} />
              <Fact k="90% interval half-width" v={`± ${info.conformal_q90}`} />
            </dl>
            <p className="text-xs text-gray-400 mt-4">
              Data: Pérez-Riverol et al., <em>Bioinformatics</em> 2016 — peptide and protein pIs measured
              by isoelectric focusing (github.com/bigbio/pIR).
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

function Step({ n, title, children }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
      <div className="flex items-center gap-2 mb-1">
        <span className="w-5 h-5 rounded-full bg-lab-600 text-white text-xs font-bold flex items-center justify-center">{n}</span>
        <span className="font-semibold text-gray-800 text-sm">{title}</span>
      </div>
      <p className="text-xs text-gray-600 leading-relaxed">{children}</p>
    </div>
  )
}

function Fact({ k, v }) {
  return (
    <div className="flex justify-between border-b border-gray-50 pb-1.5">
      <dt className="text-gray-500">{k}</dt>
      <dd className="font-mono font-medium text-gray-800">{v}</dd>
    </div>
  )
}
