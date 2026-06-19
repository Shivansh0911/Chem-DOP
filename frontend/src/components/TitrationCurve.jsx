import React, { useEffect, useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine, ResponsiveContainer, Label,
} from 'recharts'

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow px-3 py-2 text-xs font-mono">
      <p className="text-gray-500">pH {Number(label).toFixed(1)}</p>
      <p className="text-lab-700 font-semibold">
        Charge: {Number(payload[0].value).toFixed(3)}
      </p>
    </div>
  )
}

export default function TitrationCurve({ sequence, predictedPI }) {
  const [data, setData]     = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState('')

  useEffect(() => {
    if (!sequence) return
    setLoading(true)
    setError('')

    fetch(`${API}/titration-curve?sequence=${encodeURIComponent(sequence)}`)
      .then(r => r.json())
      .then(d => {
        if (d.detail) throw new Error(d.detail)
        setData(d)
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [sequence])

  if (!sequence) return null

  return (
    <div className="card">
      <h2 className="text-base font-semibold text-lab-700 mb-1">Titration Curve</h2>
      <p className="text-xs text-gray-400 mb-4">
        Net charge vs pH — computed via Henderson-Hasselbalch using known pKa values.
      </p>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10"
              stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          Loading curve…
        </div>
      )}

      {error && <p className="text-sm text-red-500">{error}</p>}

      {!loading && data.length > 0 && (
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={data} margin={{ top: 20, right: 20, bottom: 24, left: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />

            <XAxis
              dataKey="pH"
              type="number"
              domain={[0, 14]}
              tickCount={8}
              tick={{ fontSize: 11, fontFamily: 'monospace' }}
            >
              <Label value="pH" offset={-8} position="insideBottom" style={{ fontSize: 12, fill: '#9ca3af' }} />
            </XAxis>

            <YAxis
              tick={{ fontSize: 11, fontFamily: 'monospace' }}
              tickFormatter={v => v.toFixed(1)}
            >
              <Label value="Net Charge" angle={-90} position="insideLeft"
                style={{ fontSize: 12, fill: '#9ca3af' }} offset={10} />
            </YAxis>

            <Tooltip content={<CustomTooltip />} />

            {/* Zero-charge horizontal reference */}
            <ReferenceLine y={0} stroke="#d1d5db" strokeDasharray="6 3" />

            {/* pI vertical reference */}
            {predictedPI != null && (
              <ReferenceLine
                x={predictedPI}
                stroke="#6366f1"
                strokeDasharray="6 3"
                label={{
                  value: `pI = ${predictedPI.toFixed(2)}`,
                  position: 'insideTopRight',
                  fontSize: 11,
                  fill: '#6366f1',
                  fontFamily: 'monospace',
                }}
              />
            )}

            <Line
              type="monotone"
              dataKey="charge"
              stroke="#6366f1"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: '#6366f1' }}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
