import React, { useState, useEffect, useCallback } from 'react'
import SearchBar         from './components/SearchBar.jsx'
import ResultCard        from './components/ResultCard.jsx'
import TitrationCurve    from './components/TitrationCurve.jsx'
import ModelComparison   from './components/ModelComparison.jsx'
import AminoAcidTable    from './components/AminoAcidTable.jsx'
import CalculatorSpread  from './components/CalculatorSpread.jsx'
import LabInsight        from './components/LabInsight.jsx'
import Designer          from './components/Designer.jsx'
import Tuner             from './components/Tuner.jsx'
import HowItWorks        from './components/HowItWorks.jsx'
import { API, postJSON } from './api.js'

const TABS = [
  { id: 'predict', label: 'Predict',     hint: 'sequence → pI + lab note' },
  { id: 'design',  label: 'AI Designer', hint: 'goal → sequence' },
  { id: 'tune',    label: 'pI Tuner',    hint: 'mutate toward a target' },
  { id: 'how',     label: 'How it works', hint: 'benchmarks & method' },
]

export default function App() {
  const [tab,        setTab]        = useState('predict')
  const [result,     setResult]     = useState(null)
  const [metrics,    setMetrics]    = useState(null)
  const [aminoAcids, setAminoAcids] = useState([])
  const [loading,    setLoading]    = useState(false)
  const [apiError,   setApiError]   = useState('')
  const [modelReady, setModelReady] = useState(null)   // null=unknown, true/false
  const [llmReady,   setLlmReady]   = useState(false)
  const [tunerSeed,  setTunerSeed]  = useState('')

  useEffect(() => {
    fetch(`${API}/amino-acids`).then(r => r.json()).then(setAminoAcids).catch(() => {})
    fetch(`${API}/health`).then(r => r.json())
      .then(d => { setModelReady(d.model_trained); setLlmReady(!!d.llm_available) })
      .catch(() => setModelReady(false))
    fetch(`${API}/model-metrics`).then(r => r.json())
      .then(d => { if (!d.detail) setMetrics(d) }).catch(() => {})
  }, [])

  // Poll until the model finishes training (first boot on a cold Render dyno)
  useEffect(() => {
    if (modelReady !== false) return
    const id = setInterval(() => {
      fetch(`${API}/health`).then(r => r.json()).then(d => {
        if (d.model_trained) {
          setModelReady(true); setLlmReady(!!d.llm_available); clearInterval(id)
          fetch(`${API}/model-metrics`).then(r => r.json()).then(setMetrics).catch(() => {})
        }
      }).catch(() => {})
    }, 5000)
    return () => clearInterval(id)
  }, [modelReady])

  const handlePredict = useCallback(async (input) => {
    setLoading(true); setApiError('')
    try { setResult(await postJSON('/predict', { input })) }
    catch (e) { setApiError(e.message) }
    finally { setLoading(false) }
  }, [])

  // Jump from a designed / mutated sequence straight into the full analysis
  const inspect = useCallback((sequence) => {
    setTab('predict')
    handlePredict(sequence)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [handlePredict])

  const toTuner = useCallback((sequence) => { setTunerSeed(sequence); setTab('tune') }, [])

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-lab-50">
      <header className="border-b border-gray-200 bg-white/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 pt-3 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-lab-600 flex items-center justify-center">
              <span className="text-white font-bold text-sm">pI</span>
            </div>
            <div>
              <h1 className="font-bold text-gray-800 leading-tight">pI Predictor</h1>
              <p className="text-xs text-gray-400">Physics-informed ML + LLM peptide design</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Pill ok={modelReady === true} pending={modelReady === null}
              labels={['Models ready', 'Training…', 'Connecting…']} />
            <Pill ok={llmReady} pending={false} labels={['AI online', 'AI offline', '']} />
          </div>
        </div>

        <nav className="max-w-6xl mx-auto px-4 flex gap-1 overflow-x-auto">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} title={t.hint}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition
                ${tab === t.id
                  ? 'border-lab-600 text-lab-700'
                  : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        {modelReady === false && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">
            <strong>Server waking up.</strong> The free Render instance sleeps when idle and retrains on
            first boot (~1 minute). This page updates automatically.
          </div>
        )}

        {tab === 'predict' && (
          <>
            <SearchBar onPredict={handlePredict} loading={loading} />
            {apiError && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">{apiError}</div>
            )}

            {result && (
              <>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="space-y-6">
                    <ResultCard result={result} />
                    <CalculatorSpread result={result} />
                  </div>
                  <div className="space-y-6">
                    <TitrationCurve sequence={result.sequence} predictedPI={result.best_prediction} />
                    <ModelComparison result={result} metrics={metrics} />
                  </div>
                </div>

                <LabInsight sequence={result.sequence} llmAvailable={llmReady} />

                <button onClick={() => toTuner(result.sequence)}
                  className="text-sm px-4 py-2 rounded-lg border border-lab-300 text-lab-700 hover:bg-lab-50 font-medium">
                  Tune this sequence toward a different pI →
                </button>
              </>
            )}

            <AminoAcidTable aminoAcids={aminoAcids} onSelect={aa => handlePredict(aa.name)} />
          </>
        )}

        {tab === 'design' && <Designer llmAvailable={llmReady} onInspect={inspect} />}
        {tab === 'tune'   && <Tuner llmAvailable={llmReady} initialSequence={tunerSeed} onInspect={inspect} />}
        {tab === 'how'    && <HowItWorks />}

        <footer className="text-xs text-gray-400 pt-4 border-t border-gray-200">
          Trained on ~8,400 experimental isoelectric points (Pérez-Riverol et al., <em>Bioinformatics</em> 2016).
          Predictions are computational estimates — verify experimentally before relying on them.
        </footer>
      </main>
    </div>
  )
}

function Pill({ ok, pending, labels }) {
  const [onLabel, offLabel, pendingLabel] = labels
  const text = pending ? pendingLabel : ok ? onLabel : offLabel
  if (!text) return null
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium
      ${pending ? 'bg-gray-100 text-gray-500'
        : ok ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${ok && !pending ? 'bg-green-500' : 'bg-amber-400'}`} />
      {text}
    </span>
  )
}
