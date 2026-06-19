import React, { useState, useMemo } from 'react'

function pIColor(pi) {
  if (pi < 6)  return 'text-red-600 font-semibold'
  if (pi > 8)  return 'text-blue-600 font-semibold'
  return 'text-gray-500'
}

function HydroBar({ value }) {
  // Kyte-Doolittle: roughly -4.5 to +4.5
  const norm  = (value + 4.5) / 9.0
  const pct   = Math.max(0, Math.min(100, norm * 100))
  const color = value >= 0 ? 'bg-amber-400' : 'bg-cyan-400'
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-mono text-gray-500">{value >= 0 ? '+' : ''}{value}</span>
    </div>
  )
}

const SORT_KEYS = ['name', 'pI', 'mw', 'hydrophobicity']

export default function AminoAcidTable({ aminoAcids, onSelect }) {
  const [sortKey,  setSortKey]  = useState('name')
  const [sortDesc, setSortDesc] = useState(false)
  const [filter,   setFilter]   = useState('')

  const sorted = useMemo(() => {
    let rows = aminoAcids ?? []

    if (filter.trim()) {
      const q = filter.trim().toLowerCase()
      rows = rows.filter(r =>
        r.name.toLowerCase().includes(q) ||
        r.code_1l.toLowerCase() === q ||
        r.code_3l.toLowerCase() === q
      )
    }

    rows = [...rows].sort((a, b) => {
      const va = a[sortKey]
      const vb = b[sortKey]
      if (va == null) return 1
      if (vb == null) return -1
      if (typeof va === 'string') return sortDesc ? vb.localeCompare(va) : va.localeCompare(vb)
      return sortDesc ? vb - va : va - vb
    })

    return rows
  }, [aminoAcids, sortKey, sortDesc, filter])

  function handleSort(key) {
    if (key === sortKey) setSortDesc(d => !d)
    else { setSortKey(key); setSortDesc(false) }
  }

  function SortIcon({ col }) {
    if (col !== sortKey) return <span className="text-gray-300 ml-1">↕</span>
    return <span className="text-lab-600 ml-1">{sortDesc ? '↓' : '↑'}</span>
  }

  const headers = [
    { key: 'name',          label: 'Name' },
    { key: null,            label: 'Codes' },
    { key: 'pI',            label: 'pI' },
    { key: 'mw',            label: 'MW (Da)' },
    { key: null,            label: 'pKa (NH₂/COOH/R)' },
    { key: 'hydrophobicity', label: 'Hydrophobicity' },
  ]

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h2 className="text-base font-semibold text-lab-700">Standard Amino Acids</h2>
          <p className="text-xs text-gray-400">Click a row to predict its pI</p>
        </div>
        <input
          type="text"
          placeholder="Filter…"
          value={filter}
          onChange={e => setFilter(e.target.value)}
          className="text-sm px-3 py-1.5 border border-gray-200 rounded-lg outline-none
                     focus:border-lab-400 font-mono w-36"
        />
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-100">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-left">
              {headers.map(h => (
                <th
                  key={h.label}
                  className={`px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide
                    ${h.key ? 'cursor-pointer hover:text-lab-600 select-none' : ''}`}
                  onClick={() => h.key && handleSort(h.key)}
                >
                  {h.label}
                  {h.key && <SortIcon col={h.key} />}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((aa, i) => (
              <tr
                key={aa.code_1l}
                className={`border-t border-gray-50 cursor-pointer transition
                  ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}
                  hover:bg-lab-50`}
                onClick={() => onSelect?.(aa)}
              >
                <td className="px-4 py-2.5 font-medium text-gray-700">{aa.name}</td>
                <td className="px-4 py-2.5">
                  <span className="font-mono text-lab-700 font-bold mr-1">{aa.code_1l}</span>
                  <span className="text-gray-400 text-xs">/ {aa.code_3l}</span>
                </td>
                <td className={`px-4 py-2.5 font-mono ${pIColor(aa.pI)}`}>
                  {aa.pI?.toFixed(2)}
                </td>
                <td className="px-4 py-2.5 font-mono text-gray-500 text-xs">
                  {aa.mw?.toFixed(2)}
                </td>
                <td className="px-4 py-2.5 font-mono text-xs text-gray-500">
                  {aa.pka_nh2} / {aa.pka_cooh}
                  {aa.pka_r != null ? ` / ${aa.pka_r}` : ' / —'}
                </td>
                <td className="px-4 py-2.5">
                  <HydroBar value={aa.hydrophobicity} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {sorted.length === 0 && (
          <div className="text-center py-8 text-gray-400 text-sm">No matches found.</div>
        )}
      </div>

      {/* pI colour legend */}
      <div className="mt-3 flex gap-4 text-xs text-gray-400">
        <span><span className="text-red-600 font-semibold">Red</span> = pI &lt; 6 (acidic)</span>
        <span><span className="text-gray-500">Gray</span> = pI 6–8 (neutral)</span>
        <span><span className="text-blue-600 font-semibold">Blue</span> = pI &gt; 8 (basic)</span>
      </div>
    </div>
  )
}
