import React from 'react'

// Every one-letter code decoded, grouped by what the residue does to the pI.
// This sits on the main page because a sequence is meaningless to a reader who
// does not already know the codes — and a reviewer should not have to guess.
const GROUPS = [
  {
    title: 'Acidic — pull the pI DOWN',
    hint: 'negatively charged side chains',
    tone: 'border-red-200 bg-red-50', chip: 'bg-red-600',
    codes: [['D', 'Asp', 'Aspartic acid'], ['E', 'Glu', 'Glutamic acid']],
  },
  {
    title: 'Basic — push the pI UP',
    hint: 'positively charged side chains',
    tone: 'border-blue-200 bg-blue-50', chip: 'bg-blue-600',
    codes: [['K', 'Lys', 'Lysine'], ['R', 'Arg', 'Arginine'], ['H', 'His', 'Histidine']],
  },
  {
    title: 'Weakly ionisable — small effect',
    hint: 'charge only at extreme pH',
    tone: 'border-violet-200 bg-violet-50', chip: 'bg-violet-600',
    codes: [['C', 'Cys', 'Cysteine'], ['Y', 'Tyr', 'Tyrosine']],
  },
  {
    title: 'Neutral — no direct effect on pI',
    hint: 'they still affect size, folding and solubility',
    tone: 'border-gray-200 bg-gray-50', chip: 'bg-gray-500',
    codes: [
      ['A', 'Ala', 'Alanine'], ['N', 'Asn', 'Asparagine'], ['F', 'Phe', 'Phenylalanine'],
      ['G', 'Gly', 'Glycine'], ['I', 'Ile', 'Isoleucine'], ['L', 'Leu', 'Leucine'],
      ['M', 'Met', 'Methionine'], ['P', 'Pro', 'Proline'], ['Q', 'Gln', 'Glutamine'],
      ['S', 'Ser', 'Serine'], ['T', 'Thr', 'Threonine'], ['V', 'Val', 'Valine'],
      ['W', 'Trp', 'Tryptophan'],
    ],
  },
]

export default function AminoAcidLegend({ sequence }) {
  const used = new Set((sequence ?? '').toUpperCase())

  return (
    <div className="card">
      <h2 className="text-base font-semibold text-lab-700 mb-1">What each letter means</h2>
      <p className="text-xs text-gray-400 mb-4">
        A sequence like <span className="font-mono">RYWGFEDKRR</span> is one letter per amino acid.
        Only five of the twenty actually set the pI — the rest come along for the ride.
        {sequence && ' Letters in your sequence are highlighted.'}
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {GROUPS.map(g => (
          <div key={g.title} className={`rounded-xl border p-4 ${g.tone}`}>
            <h3 className="text-sm font-semibold text-gray-800">{g.title}</h3>
            <p className="text-[11px] text-gray-500 mb-3">{g.hint}</p>
            <div className="flex flex-wrap gap-1.5">
              {g.codes.map(([one, three, full]) => {
                const on = used.has(one)
                return (
                  <span key={one} title={`${one} = ${three} = ${full}`}
                    className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs
                      ${on ? 'border-lab-400 bg-white shadow-sm' : 'border-transparent bg-white/70'}`}>
                    <span className={`w-5 h-5 rounded ${g.chip} text-white font-bold font-mono
                      flex items-center justify-center text-[11px]`}>{one}</span>
                    <span className="font-medium text-gray-700">{three}</span>
                    <span className="text-gray-400 hidden sm:inline">{full}</span>
                  </span>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
