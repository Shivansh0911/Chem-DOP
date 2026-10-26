import React, { useEffect, useState } from 'react'
import { getJSON } from '../api.js'

// The bench answer, worked out by rule rather than by a language model: which
// resin, what buffer pH, and what charge that actually produces. Every number
// here is reproducible — run it twice and you get the same protocol.
export default function Protocol({ sequence }) {
  const [data, setData] = useState(null)
  const [pH, setPH]     = useState('7.4')
  const [charge, setCharge] = useState(null)
  const [error, setError]   = useState('')

  useEffect(() => {
    setData(null); setCharge(null); setError('')
    if (!sequence) return
    getJSON(`/protocol?sequence=${encodeURIComponent(sequence)}`).then(setData).catch(e => setError(e.message))
  }, [sequence])

  useEffect(() => {
    if (!sequence) return
    const v = Number(pH)
    if (Number.isNaN(v) || v < 0 || v > 14) return
    const id = setTimeout(() => {
      getJSON(`/charge?sequence=${encodeURIComponent(sequence)}&pH=${v}`).then(setCharge).catch(() => {})
    }, 250)
    return () => clearTimeout(id)
  }, [sequence, pH])

  if (!sequence) return null

  return (
    <div className="card">
      <h2 className="text-base font-semibold text-lab-700 mb-1">Purification protocol</h2>
      <p className="text-xs text-gray-400 mb-4">
        Worked out from the predicted pI by fixed rules — no AI involved, so this is identical every time.
      </p>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {data && (
        <div className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-3">
            {data.options.map(o => (
              <div key={o.mode}
                className={`rounded-xl border p-4 ${o.mode === data.recommended
                  ? 'border-lab-400 bg-lab-50 ring-2 ring-lab-200' : 'border-gray-100 bg-gray-50'}`}>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <h3 className="text-sm font-semibold text-gray-800 capitalize">{o.mode}</h3>
                  {o.mode === data.recommended && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-lab-600 text-white font-medium">Recommended</span>
                  )}
                </div>
                <p className="text-xs text-gray-500 mb-2">{o.resin}</p>
                <div className="flex gap-5 mb-2">
                  <div>
                    <div className="font-mono text-xl font-bold text-gray-800">pH {o.buffer_pH}</div>
                    <div className="text-[10px] text-gray-400">buffer</div>
                  </div>
                  <div>
                    <div className={`font-mono text-xl font-bold ${o.net_charge > 0 ? 'text-blue-600' : 'text-red-600'}`}>
                      {o.net_charge > 0 ? '+' : ''}{o.net_charge.toFixed(2)}
                    </div>
                    <div className="text-[10px] text-gray-400">net charge there</div>
                  </div>
                </div>
                <p className="text-xs text-gray-600">{o.why}</p>
              </div>
            ))}
          </div>

          {!data.recommended && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Neither resin gets a firm grip on this one in a usable buffer range. It is close to
              neutral across the practical pH window, so ion exchange is the wrong tool — try size
              exclusion or reversed-phase instead.
            </p>
          )}

          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
            <p className="text-xs text-amber-800">
              <span className="font-semibold">Storage: </span>{data.solubility_note}
            </p>
          </div>

          {data.caveat && (
            <p className="text-xs text-gray-500 border border-gray-200 rounded-lg px-3 py-2">{data.caveat}</p>
          )}

          <div className="border-t border-gray-100 pt-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Check any other pH</h3>
            <div className="flex items-center gap-3 flex-wrap">
              <label className="text-xs text-gray-500">My buffer is at pH</label>
              <input type="number" step="0.1" min="0" max="14" value={pH} onChange={e => setPH(e.target.value)}
                className="w-24 text-sm px-3 py-2 border border-gray-200 rounded-lg outline-none focus:border-lab-400 font-mono" />
              {charge && (
                <p className="text-sm text-gray-700">
                  → net charge <b className={`font-mono ${charge.net_charge > 0 ? 'text-blue-600' : 'text-red-600'}`}>
                    {charge.net_charge > 0 ? '+' : ''}{charge.net_charge.toFixed(2)}
                  </b>, {charge.state}. It binds {charge.binds}.
                </p>
              )}
            </div>
            {charge?.near_pI && (
              <p className="text-xs text-amber-700 mt-2">
                Careful — that is within 0.5 of the pI, where this peptide is least soluble.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
