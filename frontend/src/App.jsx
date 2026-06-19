import React, { useState, useEffect, useCallback } from 'react'
import SearchBar       from './components/SearchBar.jsx'
import ResultCard      from './components/ResultCard.jsx'
import TitrationCurve  from './components/TitrationCurve.jsx'
import ModelComparison from './components/ModelComparison.jsx'
import AminoAcidTable  from './components/AminoAcidTable.jsx'

const API = import.meta.env.VITE_API_URL ?? 'https://chem-dop.onrender.com'

export default function App() {
  const [result,     setResult]     = useState(null)
  const [metrics,    setMetrics]    = useState(null)
  const [aminoAcids, setAminoAcids] = useState([])
  const [loading,    setLoading]    = useState(false)
  const [apiError,   setApiError]   = useState('')
  const [modelReady, setModelReady] = useState(null) // null=unknown, true/false

  // Fetch static data once on mount
  useEffect(() => {
    fetch(`${API}/amino-acids`)
      .then(r => r.json())
      .then(setAminoAcids)
      .catch(() => {})

    fetch(`${API}/`)
      .then(r => r.json())
      .then(d => setModelReady(d.model_trained))
      .catch(() => setModelReady(false))

    fetch(`${API}/model-metrics`)
      .then(r => r.json())
      .then(d => { if (!d.detail) setMetrics(d) })
      .catch(() => {})
  }, [])

  // Poll until model is ready (for first boot training)
  useEffect(() => {
    if (modelReady) return
    if (modelReady === null) return
    const id = setInterval(() => {
      fetch(`${API}/`)
        .then(r => r.json())
        .then(d => {
          if (d.model_trained) {
            setModelReady(true)
            clearInterval(id)
            // Fetch metrics now that model is ready
            return fetch(`${API}/model-metrics`).then(r => r.json()).then(setMetrics)
          }
        })
        .catch(() => {})
    }, 5000)
    return () => clearInterval(id)
  }, [modelReady])

  const handlePredict = useCallback(async (input) => {
    setLoading(true)
    setApiError('')
    try {
      const res = await fetch(`${API}/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail ?? 'Prediction failed.')
      setResult(data)
    } catch (e) {
      setApiError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  const handleTableSelect = useCallback((aa) => {
    handlePredict(aa.name)
  }, [handlePredict])

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-lab-50">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-lab-600 flex items-center justify-center">
              <span className="text-white font-bold text-sm">pI</span>
            </div>
            <div>
              <h1 className="font-bold text-gray-800 leading-tight">pI Predictor</h1>
              <p className="text-xs text-gray-400">ML-based isoelectric point prediction</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium
                ${modelReady === true
                  ? 'bg-green-100 text-green-700'
                  : modelReady === false
                  ? 'bg-amber-100 text-amber-700 animate-pulse'
                  : 'bg-gray-100 text-gray-500'
                }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full
                ${modelReady === true ? 'bg-green-500' : 'bg-amber-400'}`}
              />
              {modelReady === true ? 'Models ready' : modelReady === false ? 'Training…' : 'Connecting…'}
            </span>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        {/* Training notice */}
        {modelReady === false && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">
            <strong>First launch detected.</strong> Models are being trained on ~7,500 experimental
            measurements. This takes about 2 minutes. The page will update automatically.
          </div>
        )}

        {/* Search */}
        <SearchBar onPredict={handlePredict} loading={loading} />

        {/* API error */}
        {apiError && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
            {apiError}
          </div>
        )}

        {/* Results */}
        {result && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-6">
              <ResultCard result={result} />
              <ModelComparison result={result} metrics={metrics} />
            </div>
            <TitrationCurve
              sequence={result.sequence}
              predictedPI={result.best_prediction}
            />
          </div>
        )}

        {/* Amino acid table */}
        <AminoAcidTable
          aminoAcids={aminoAcids}
          onSelect={handleTableSelect}
        />

        {/* About section */}
        <div className="card text-sm text-gray-600 space-y-2">
          <h3 className="font-semibold text-gray-800">What is pI?</h3>
          <p>
            The <strong>isoelectric point (pI)</strong> is the pH at which a molecule carries zero
            net charge. At this pH, proteins have minimal solubility and zero electrophoretic
            mobility — critical for:
          </p>
          <ul className="list-disc list-inside space-y-1 text-gray-500">
            <li>2-D gel electrophoresis (proteins separated by pI in the first dimension)</li>
            <li>Protein purification via ion-exchange chromatography</li>
            <li>Drug formulation — maximising stability of therapeutic peptides</li>
            <li>Predicting protein–protein and protein–membrane interactions</li>
          </ul>
          <p className="text-xs text-gray-400 pt-1">
            Dataset: Pérez-Riverol et al., <em>Bioinformatics</em> 2016.
            Source: <code>github.com/bigbio/pIR</code> (~7,500 experimental measurements).
          </p>
        </div>
      </main>
    </div>
  )
}
