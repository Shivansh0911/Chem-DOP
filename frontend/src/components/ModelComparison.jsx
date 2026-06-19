import React from 'react'

const MODEL_INFO = {
  rf: {
    label: 'Random Forest',
    desc: '300 trees, ensemble average. Also provides the 90% confidence interval.',
    color: 'indigo',
  },
  gb: {
    label: 'Gradient Boosting',
    desc: '200 boosting rounds, lr=0.05. Typically lowest test error.',
    color: 'violet',
  },
  ridge: {
    label: 'Ridge Regression',
    desc: 'Linear baseline (α=1.0). Fast and interpretable.',
    color: 'slate',
  },
}

const COLOR_MAP = {
  indigo: {
    bg: 'bg-indigo-50',
    border: 'border-indigo-200',
    text: 'text-indigo-700',
    badge: 'bg-indigo-100 text-indigo-700',
    ring: 'ring-2 ring-indigo-400',
  },
  violet: {
    bg: 'bg-violet-50',
    border: 'border-violet-200',
    text: 'text-violet-700',
    badge: 'bg-violet-100 text-violet-700',
    ring: 'ring-2 ring-violet-400',
  },
  slate: {
    bg: 'bg-slate-50',
    border: 'border-slate-200',
    text: 'text-slate-700',
    badge: 'bg-slate-100 text-slate-600',
    ring: 'ring-2 ring-slate-400',
  },
}

function ModelCard({ modelKey, prediction, metrics, isBest }) {
  const info   = MODEL_INFO[modelKey]
  const colors = COLOR_MAP[info.color]

  return (
    <div className={`rounded-xl border p-4 flex flex-col gap-2 transition
      ${colors.bg} ${colors.border}
      ${isBest ? colors.ring + ' shadow-md' : ''}`}
    >
      <div className="flex items-center justify-between">
        <span className={`text-sm font-semibold ${colors.text}`}>{info.label}</span>
        {isBest && (
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colors.badge}`}>
            Best
          </span>
        )}
      </div>

      {prediction != null && (
        <div className={`text-3xl font-bold ${colors.text}`}>
          {Number(prediction).toFixed(3)}
        </div>
      )}
      {prediction == null && (
        <div className="text-2xl text-gray-300 font-mono">—</div>
      )}

      {metrics && (
        <div className="text-xs text-gray-500 space-y-0.5 mt-1 border-t border-gray-200 pt-2">
          <div className="flex justify-between">
            <span>RMSE</span>
            <span className="font-mono font-medium">{metrics.rmse}</span>
          </div>
          <div className="flex justify-between">
            <span>MAE</span>
            <span className="font-mono font-medium">{metrics.mae}</span>
          </div>
          <div className="flex justify-between">
            <span>R²</span>
            <span className="font-mono font-medium">{metrics.r2}</span>
          </div>
        </div>
      )}

      <p className="text-xs text-gray-400 mt-auto">{info.desc}</p>
    </div>
  )
}

export default function ModelComparison({ result, metrics }) {
  const bestModel = result?.best_model

  return (
    <div className="card">
      <h2 className="text-base font-semibold text-lab-700 mb-1">Model Comparison</h2>
      <p className="text-xs text-gray-400 mb-4">
        All three models trained on ~7,500 experimental pI measurements. Lower RMSE = better.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {Object.keys(MODEL_INFO).map(key => (
          <ModelCard
            key={key}
            modelKey={key}
            prediction={result?.[`${key}_prediction`]}
            metrics={metrics?.[key]}
            isBest={key === bestModel}
          />
        ))}
      </div>
    </div>
  )
}
