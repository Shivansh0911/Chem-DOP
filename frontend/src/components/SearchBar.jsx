import React, { useState, useCallback } from 'react'

const VALID = new Set('ACDEFGHIKLMNPQRSTVWY')

// Resolve a short string to whether it might be a known AA name / code
// (we just allow letters + spaces for names, single-letter codes, etc.)
function classifyChars(input) {
  const upper = input.toUpperCase().replace(/\s/g, '')
  return upper.split('').map(ch => ({
    char: ch,
    valid: VALID.has(ch) || /[A-Z]/.test(ch), // letters allowed (names)
  }))
}

function isLikelySequence(val) {
  // If every char is a valid AA code → treat as sequence
  const upper = val.toUpperCase().replace(/\s/g, '')
  return upper.length > 0 && [...upper].every(c => VALID.has(c))
}

export default function SearchBar({ onPredict, loading }) {
  const [value, setValue] = useState('')
  const [error, setError] = useState('')

  const handleChange = useCallback((e) => {
    setValue(e.target.value)
    setError('')
  }, [])

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault()
    const trimmed = value.trim()
    if (!trimmed) {
      setError('Please enter an amino acid name, code, or peptide sequence.')
      return
    }

    // If it looks like a pure sequence, validate all chars
    const isSeq = isLikelySequence(trimmed)
    if (isSeq) {
      const bad = [...trimmed.toUpperCase()].filter(c => !VALID.has(c))
      if (bad.length > 0) {
        setError(`Invalid residue codes: ${[...new Set(bad)].join(', ')}`)
        return
      }
    }

    setError('')
    onPredict(trimmed)
  }, [value, onPredict])

  // Colour-code the sequence if it looks like one
  const isSeq = isLikelySequence(value)
  const chars = isSeq ? classifyChars(value) : null

  const examples = ['Alanine', 'His', 'K', 'ACDEFGHIKLM', 'MKTLLLTLVVVTIVCLDLGAVK']

  return (
    <div className="card">
      <h2 className="text-lg font-semibold text-lab-700 mb-1">Predict Isoelectric Point (pI)</h2>
      <p className="text-sm text-gray-500 mb-4">
        Enter a single amino acid (name, 1-letter, or 3-letter code) or a peptide sequence.
      </p>

      <form onSubmit={handleSubmit} className="flex gap-3">
        <div className="relative flex-1">
          <input
            type="text"
            value={value}
            onChange={handleChange}
            placeholder="e.g. Lysine | Lys | K | ACDEFGHIKLM"
            className={`w-full px-4 py-3 rounded-xl border-2 font-mono text-sm outline-none transition
              ${error
                ? 'border-red-400 focus:border-red-500'
                : 'border-gray-200 focus:border-lab-500'
              }`}
            spellCheck={false}
            autoComplete="off"
          />
          {/* Inline colour preview for sequence mode */}
          {isSeq && value.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-0.5 px-1">
              {chars.map((c, i) => (
                <span
                  key={i}
                  className={`text-xs font-mono font-semibold px-0.5 rounded
                    ${c.valid ? 'text-lab-600' : 'text-red-500 bg-red-50'}`}
                >
                  {c.char}
                </span>
              ))}
            </div>
          )}
        </div>
        <button
          type="submit"
          disabled={loading}
          className="px-6 py-3 rounded-xl bg-lab-600 hover:bg-lab-700 text-white font-semibold
                     text-sm transition disabled:opacity-60 flex items-center gap-2 whitespace-nowrap"
        >
          {loading ? (
            <>
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10"
                  stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor"
                  d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Predicting…
            </>
          ) : (
            'Predict pI'
          )}
        </button>
      </form>

      {error && (
        <p className="mt-2 text-sm text-red-600 font-medium">{error}</p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <span className="text-xs text-gray-400">Try:</span>
        {examples.map(ex => (
          <button
            key={ex}
            onClick={() => { setValue(ex); setError('') }}
            className="text-xs px-2 py-1 rounded-lg bg-lab-50 text-lab-600 hover:bg-lab-100 transition font-mono"
          >
            {ex}
          </button>
        ))}
      </div>
    </div>
  )
}
