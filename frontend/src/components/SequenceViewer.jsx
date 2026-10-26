import React, { useEffect, useMemo, useState } from 'react'
import { getJSON } from '../api.js'

// Every letter of the sequence, decoded and alive.
//
// Drag the pH slider and each residue recolours as it gains or loses its
// proton, while the running total shows the net charge building up. This is
// the Henderson-Hasselbalch equation made visible: the pI is simply the pH
// where the blue and the red cancel out.
//
// The pKa constants come from the server, so this view can never disagree
// with the titration curve or the physics baseline.

const MAX_TILES = 400

const CLASS_STYLE = {
  acidic:    { dot: 'bg-red-500',    label: 'Acidic (D, E)' },
  basic:     { dot: 'bg-blue-500',   label: 'Basic (K, R, H)' },
  ionisable: { dot: 'bg-violet-500', label: 'Weakly ionisable (C, Y)' },
  aromatic:  { dot: 'bg-amber-500',  label: 'Aromatic (F, W)' },
  neutral:   { dot: 'bg-gray-300',   label: 'Neutral' },
}

// Charge of one group at a pH. A base is positive while protonated; an acid is
// negative once it has given its proton away.
function groupCharge(kind, pka, pH) {
  if (!kind || pka == null) return 0
  return kind === 'base'
    ? 1 / (1 + 10 ** (pH - pka))
    : -1 / (1 + 10 ** (pka - pH))
}

// Colour a tile by how charged it is right now: blue positive, red negative.
function tileTone(q) {
  if (q > 0.5)   return 'bg-blue-600 text-white border-blue-700'
  if (q > 0.08)  return 'bg-blue-100 text-blue-900 border-blue-300'
  if (q < -0.5)  return 'bg-red-600 text-white border-red-700'
  if (q < -0.08) return 'bg-red-100 text-red-900 border-red-300'
  return 'bg-gray-50 text-gray-500 border-gray-200'
}

export default function SequenceViewer({ sequence, pI }) {
  const [data, setData] = useState(null)
  const [pH, setPH]     = useState(7.4)
  const [hover, setHover] = useState(null)
  const [error, setError] = useState('')

  // Past a few hundred residues the tiles stop being readable and the row
  // would dominate the page, so the viewer steps aside rather than failing.
  const tooLong = sequence && sequence.length > MAX_TILES

  useEffect(() => {
    setData(null); setError(''); setHover(null)
    if (!sequence || tooLong) return
    getJSON(`/residues?sequence=${encodeURIComponent(sequence)}`)
      .then(d => { setData(d); setPH(7.4) })
      .catch(e => setError(e.message))
  }, [sequence, tooLong])

  const live = useMemo(() => {
    if (!data) return null
    const charges = data.residues.map(r => groupCharge(r.kind, r.pka, pH))
    const nTerm = groupCharge('base', data.termini.n_term_pka, pH)
    const cTerm = groupCharge('acid', data.termini.c_term_pka, pH)
    const net = charges.reduce((a, b) => a + b, 0) + nTerm + cTerm
    const pos = charges.filter(c => c > 0).reduce((a, b) => a + b, 0) + nTerm
    const neg = charges.filter(c => c < 0).reduce((a, b) => a + b, 0) + cTerm
    return { charges, nTerm, cTerm, net, pos, neg }
  }, [data, pH])

  if (!sequence) return null

  const shown = hover != null ? data?.residues[hover] : null
  const atPI = pI != null && Math.abs(pH - pI) < 0.08

  return (
    <div className="card">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-1">
        <h2 className="text-base font-semibold text-lab-700">Your sequence, letter by letter</h2>
        {pI != null && (
          <button onClick={() => setPH(Number(pI.toFixed(2)))}
            className="text-xs px-3 py-1.5 rounded-lg border border-lab-300 text-lab-700 hover:bg-lab-50 font-medium">
            Jump to the pI ({pI.toFixed(2)})
          </button>
        )}
      </div>
      <p className="text-xs text-gray-400 mb-4">
        Each tile is one amino acid. Move the slider and watch them charge and discharge —
        blue is positive, red is negative. The pI is the pH where the two cancel out exactly.
      </p>

      {tooLong && (
        <p className="text-sm text-gray-500">
          This one is {sequence.length.toLocaleString()} residues long. Laying every residue out as a
          tile only helps up to about {MAX_TILES}, so the titration curve below is the better view for
          a protein this size — it shows the same charge behaviour across the whole pH range.
        </p>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      {data && live && (
        <>
          {/* the tiles */}
          <div className="flex flex-wrap gap-1.5 mb-1">
            <Terminus label="H₂N–" q={live.nTerm} title={`N-terminus · pKa ${data.termini.n_term_pka}`} />
            {data.residues.map((r, i) => {
              const q = live.charges[i]
              return (
                <button key={i}
                  onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(i)} onBlur={() => setHover(null)}
                  title={`${r.letter} = ${r.code3} = ${r.name}`}
                  className={`relative w-10 h-12 rounded-lg border font-mono font-bold text-sm
                    flex flex-col items-center justify-center transition-colors
                    ${tileTone(q)} ${hover === i ? 'ring-2 ring-lab-400' : ''}`}>
                  <span>{r.letter}</span>
                  <span className="text-[9px] font-normal opacity-70">{r.position}</span>
                  <span className={`absolute -top-1 -right-1 w-2 h-2 rounded-full ${CLASS_STYLE[r.class].dot}`} />
                </button>
              )
            })}
            <Terminus label="–COOH" q={live.cTerm} title={`C-terminus · pKa ${data.termini.c_term_pka}`} />
          </div>

          {/* what the hovered tile is */}
          <div className="h-12 mb-3">
            {shown ? (
              <div className="text-sm">
                <span className="font-mono font-bold text-lab-700">{shown.letter}</span>
                <span className="text-gray-400"> = </span>
                <span className="font-semibold text-gray-800">{shown.code3}</span>
                <span className="text-gray-400"> = </span>
                <span className="font-semibold text-gray-800">{shown.name}</span>
                <span className="text-gray-400"> · position {shown.position}</span>
                <div className="text-xs text-gray-500">
                  {shown.role}
                  {shown.pka != null && (
                    <> · side-chain pKa <span className="font-mono">{shown.pka}</span>,
                      so it flips charge around pH {shown.pka}</>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-xs text-gray-400 pt-1">
                Point at any tile to see which amino acid it is and what it does.
              </p>
            )}
          </div>

          {/* the pH control */}
          <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <label htmlFor="ph-slider" className="text-sm font-medium text-gray-700">
                Buffer pH <span className="font-mono text-lab-700 font-bold">{pH.toFixed(1)}</span>
                {atPI && <span className="ml-2 text-xs text-lab-600 font-semibold">— this is the pI</span>}
              </label>
              <div className="flex items-center gap-4 text-sm">
                <span className="text-blue-600 font-mono">+{live.pos.toFixed(2)}</span>
                <span className="text-red-600 font-mono">{live.neg.toFixed(2)}</span>
                <span className="font-mono font-bold text-gray-800">
                  net {live.net > 0 ? '+' : ''}{live.net.toFixed(2)}
                </span>
              </div>
            </div>

            <input id="ph-slider" type="range" min="0" max="14" step="0.1" value={pH}
              onChange={e => setPH(Number(e.target.value))}
              className="w-full accent-lab-600" />

            <div className="flex justify-between text-[10px] text-gray-400 font-mono">
              {[0, 2, 4, 6, 8, 10, 12, 14].map(t => <span key={t}>{t}</span>)}
            </div>

            {/* the positive/negative balance as one bar */}
            <div className="flex h-3 rounded-full overflow-hidden bg-gray-200">
              <div className="bg-red-500 transition-all"
                style={{ width: `${(Math.abs(live.neg) / (live.pos + Math.abs(live.neg) || 1)) * 100}%` }} />
              <div className="bg-blue-500 transition-all"
                style={{ width: `${(live.pos / (live.pos + Math.abs(live.neg) || 1)) * 100}%` }} />
            </div>
            <p className="text-xs text-gray-500">
              {Math.abs(live.net) < 0.15
                ? 'The positives and negatives cancel — this is the isoelectric point, where the peptide is least soluble.'
                : live.net > 0
                  ? 'Net positive: it moves toward the negative electrode and binds a cation exchanger.'
                  : 'Net negative: it moves toward the positive electrode and binds an anion exchanger.'}
            </p>
          </div>

          {/* legend */}
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-[11px] text-gray-500">
            {Object.entries(CLASS_STYLE).map(([k, v]) => (
              data.counts[k] > 0 && (
                <span key={k} className="inline-flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${v.dot}`} />
                  {v.label} · {data.counts[k]}
                </span>
              )
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function Terminus({ label, q, title }) {
  return (
    <div title={title}
      className={`h-12 px-2 rounded-lg border font-mono text-[11px] flex flex-col items-center justify-center
        ${tileTone(q)}`}>
      <span>{label}</span>
      <span className="text-[9px] opacity-70">{q > 0 ? '+' : ''}{q.toFixed(2)}</span>
    </div>
  )
}
