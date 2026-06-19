import React from 'react'

function ChargeBadge({ chargeClass }) {
  const map = {
    acidic:  'badge-acidic',
    neutral: 'badge-neutral',
    basic:   'badge-basic',
  }
  return (
    <span className={map[chargeClass] ?? 'badge-neutral'}>
      {chargeClass.charAt(0).toUpperCase() + chargeClass.slice(1)}
    </span>
  )
}

function ConfidenceBar({ low, high, best }) {
  // Map pH 0-14 scale to 0-100% for the bar
  const toPercent = v => Math.max(0, Math.min(100, (v / 14) * 100))
  const leftPct  = toPercent(low)
  const widthPct = toPercent(high) - leftPct
  const dotPct   = toPercent(best)

  return (
    <div className="mt-2">
      <div className="flex justify-between text-xs text-gray-400 mb-1">
        <span>pH 0</span>
        <span className="text-lab-600 font-semibold">90% CI: {low.toFixed(2)} – {high.toFixed(2)}</span>
        <span>pH 14</span>
      </div>
      <div className="relative h-4 bg-gray-100 rounded-full overflow-visible">
        {/* CI band */}
        <div
          className="absolute top-0 h-full bg-lab-200 rounded-full"
          style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
        />
        {/* Best prediction dot */}
        <div
          className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full
                     bg-lab-600 border-2 border-white shadow"
          style={{ left: `calc(${dotPct}% - 8px)` }}
        />
        {/* Label */}
        <span
          className="absolute -top-5 text-xs font-bold text-lab-700"
          style={{ left: `calc(${dotPct}% - 16px)` }}
        >
          {best.toFixed(2)}
        </span>
      </div>
    </div>
  )
}

function Stat({ label, value, sub }) {
  return (
    <div className="text-center">
      <div className="text-2xl font-bold text-gray-800">{value}</div>
      <div className="text-xs text-gray-400 mt-0.5">{label}</div>
      {sub && <div className="text-xs text-gray-400">{sub}</div>}
    </div>
  )
}

export default function ResultCard({ result }) {
  if (!result) return null

  const {
    sequence, length, best_prediction, confidence_low, confidence_high,
    charge_class, physics_estimate, is_single_aa, known_pI, prediction_error,
    features,
  } = result

  return (
    <div className="card space-y-5">
      {/* Header row */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <span className="text-5xl font-bold text-lab-700">{best_prediction.toFixed(2)}</span>
            <div>
              <div className="text-xs text-gray-400 font-medium uppercase tracking-wide">
                Predicted pI
              </div>
              <ChargeBadge chargeClass={charge_class} />
            </div>
          </div>
          {is_single_aa && known_pI != null && (
            <p className="mt-1 text-sm text-gray-500">
              Reference pI: <span className="font-semibold text-gray-700">{known_pI}</span>
              {' · '}
              Error: <span className={`font-semibold ${prediction_error < 0.5 ? 'text-green-600' : 'text-amber-600'}`}>
                ±{prediction_error}
              </span>
            </p>
          )}
        </div>

        {/* Sequence chip */}
        <div className="text-right">
          <div
            className="font-mono text-xs bg-gray-50 border border-gray-200 rounded-lg px-3 py-2
                       max-w-[200px] truncate text-gray-600"
            title={sequence}
          >
            {sequence}
          </div>
          <div className="text-xs text-gray-400 mt-1">{length} residue{length !== 1 ? 's' : ''}</div>
        </div>
      </div>

      {/* Confidence range bar */}
      <ConfidenceBar low={confidence_low} high={confidence_high} best={best_prediction} />

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4 pt-2 border-t border-gray-100">
        <Stat
          label="Acidic residues"
          value={`${(features.acidic_fraction * 100).toFixed(1)}%`}
          sub="(D + E)"
        />
        <Stat
          label="Basic residues"
          value={`${(features.basic_fraction * 100).toFixed(1)}%`}
          sub="(R + K + H)"
        />
        <Stat
          label="Physics estimate"
          value={physics_estimate?.toFixed(2) ?? '—'}
          sub="Henderson-Hasselbalch"
        />
      </div>

      {/* Charge proxy meter */}
      <div>
        <div className="flex justify-between text-xs text-gray-400 mb-1">
          <span>More acidic ←</span>
          <span className="text-gray-600 font-medium">
            Charge proxy: {features.charge_proxy >= 0 ? '+' : ''}{features.charge_proxy.toFixed(3)}
          </span>
          <span>→ More basic</span>
        </div>
        <div className="relative h-2 bg-gray-100 rounded-full">
          <div
            className={`absolute top-0 h-full rounded-full transition-all
              ${features.charge_proxy >= 0 ? 'bg-blue-400' : 'bg-red-400'}`}
            style={{
              left:  features.charge_proxy >= 0 ? '50%' : `${50 + features.charge_proxy * 50}%`,
              width: `${Math.abs(features.charge_proxy) * 50}%`,
            }}
          />
          <div className="absolute top-1/2 left-1/2 -translate-y-1/2 -translate-x-1/2
                          w-0.5 h-3 bg-gray-300 rounded" />
        </div>
      </div>
    </div>
  )
}
