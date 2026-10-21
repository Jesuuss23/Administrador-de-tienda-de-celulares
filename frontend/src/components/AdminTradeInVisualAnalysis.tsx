import { useEffect, useRef, useState } from 'react'
import { LoaderCircle, RefreshCw, Sparkles } from 'lucide-react'
import AdminVisualPolicyPanel from './AdminVisualPolicyPanel'
import AdminVisualReviewPanel from './AdminVisualReviewPanel'
import VisualAnalysisEvidence from './VisualAnalysisEvidence'
import {
  analyzeTradeInPhotos,
  getVisualAnalyses,
} from '../lib/tradeInVisualAnalysis'

import type { VisualAnalysis } from '../lib/tradeInVisualAnalysis'

interface Props {
  tradeInId: string
}

const angleLabels: Record<string, string> = {
  FRONT: 'Frente',
  BACK: 'Parte posterior',
  LEFT: 'Lateral izquierdo',
  RIGHT: 'Lateral derecho',
}

const statusLabels: Record<string, string> = {
  QUEUED: 'Pendiente',
  PROCESSING: 'Analizando',
  SUCCEEDED: 'Completado',
  FAILED: 'No completado',
}

const confidenceLabels: Record<string, string> = {
  LOW: 'Baja',
  MEDIUM: 'Media',
  HIGH: 'Alta',
}

export default function AdminTradeInVisualAnalysis({
  tradeInId,
}: Props) {
  const storageKey = `celu-canje:visual-analysis:${tradeInId}`

  const [items, setItems] = useState<VisualAnalysis[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const [reviewingId, setReviewingId] = useState<string | null>(null)
  const [pendingKey, setPendingKey] = useState<string | null>(
    () => sessionStorage.getItem(storageKey),
  )

  const submitting = useRef(false)

  useEffect(() => {
    let active = true
    let timer: ReturnType<typeof setTimeout> | undefined

    async function load() {
      try {
        const result = await getVisualAnalyses(tradeInId)

        if (!active) return

        setItems(result)

        if (
          result.some(
            (item) =>
              item.status === 'PROCESSING' || item.status === 'QUEUED',
          )
        ) {
          timer = setTimeout(() => void load(), 5000)
        }
      } catch (cause) {
        if (active) {
          setError(
            cause instanceof Error
              ? cause.message
              : 'No pudimos consultar los análisis.',
          )
        }
      } finally {
        if (active) setLoading(false)
      }
    }

    setLoading(true)
    void load()

    return () => {
      active = false
      if (timer) clearTimeout(timer)
    }
  }, [tradeInId, revision])

  async function handleAnalyze() {
    if (submitting.current) return

    submitting.current = true
    setBusy(true)
    setError('')

    try {
      const requestKey = pendingKey ?? crypto.randomUUID()

      // Conservamos la clave si se pierde la respuesta o recargas la página.
      sessionStorage.setItem(storageKey, requestKey)
      setPendingKey(requestKey)

      const result = await analyzeTradeInPhotos(tradeInId, requestKey)

      setItems((previous) =>
        [result, ...previous.filter((item) => item.id !== result.id)].slice(
          0,
          20,
        ),
      )

      if (result.status === 'SUCCEEDED' || result.status === 'FAILED') {
        sessionStorage.removeItem(storageKey)
        setPendingKey(null)
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'No se pudo confirmar el resultado. Consulta el mismo intento.',
      )
    } finally {
      submitting.current = false
      setBusy(false)
      setRevision((value) => value + 1)
    }
  }

  return (
    <section className="visual-analysis-panel">
      <div className="trade-photos-heading">
        <div>
          <span className="eyebrow">EVALUACIÓN ASISTIDA</span>
          <h3>
            <Sparkles size={20} aria-hidden="true" /> Análisis visual
          </h3>
          <p>
            Revisa daños visibles en las cuatro fotografías. El administrador
            conserva la decisión sobre el canje.
          </p>
        </div>

        <button
          type="button"
          className="claim-refresh"
          disabled={loading || busy}
          aria-label="Actualizar análisis"
          onClick={() => {
            setError('')
            setRevision((value) => value + 1)
          }}
        >
          <RefreshCw size={17} aria-hidden="true" />
        </button>
      </div>

      <p className="claim-muted">
        Al iniciar un análisis, las cuatro fotografías se envían a Gemini.
        La operación utiliza la cuota de tu proyecto de Google.
      </p>

      <button
        type="button"
        className="primary-button"
        disabled={busy || loading}
        onClick={() => void handleAnalyze()}
      >
        {busy ? (
          <LoaderCircle size={18} className="spinner" aria-hidden="true" />
        ) : (
          <Sparkles size={18} aria-hidden="true" />
        )}

        {busy
          ? 'Procesando…'
          : pendingKey
            ? 'Consultar el mismo intento'
            : 'Analizar fotografías con IA'}
      </button>

      {error && (
        <div className="alert error" role="alert">
          {error}
        </div>
      )}

      {loading && items.length === 0 && (
        <p role="status">Consultando historial…</p>
      )}

      {!loading && items.length === 0 && (
        <p className="claim-muted">
          Todavía no hay análisis. Primero inicia la revisión del canje y
          comprueba que tenga las cuatro fotografías.
        </p>
      )}
        <details className="visual-policy-settings">
        <summary>Configurar criterios globales de evaluación</summary>
        <AdminVisualPolicyPanel />
        </details>
      <div className="visual-analysis-history">
        {items.map((item) => (
          <article className="visual-analysis-card" key={item.id}>
            <div className="visual-analysis-heading">
              <div>
                <strong>{statusLabels[item.status] ?? item.status}</strong>
                <p className="claim-muted">
                  {new Date(item.createdAt).toLocaleString('es-PE')}
                </p>
              </div>

              {item.status === 'SUCCEEDED' && (
                <div className="visual-analysis-score">
                  <strong>
                    {item.aestheticScore === null
                      ? 'Sin puntuación'
                      : `${item.aestheticScore.toFixed(1)}%`}
                  </strong>
                  <span>Estado estético estimado</span>
                </div>
              )}
            </div>

            {item.status === 'PROCESSING' && (
              <p role="status">
                Análisis en proceso. El historial se actualiza automáticamente.
              </p>
            )}

            {item.errorMessage && (
              <p className="warranty-error">{item.errorMessage}</p>
            )}

            {item.result && (
              <>
                <p>{item.result.summary}</p>

                {item.aestheticScore === null && (
                  <p className="claim-muted">
                    Hay zonas que no se pudieron evaluar. No se calculó un
                    porcentaje global.
                  </p>
                )}

                <div className="visual-analysis-angles">
                  {item.result.angles.map((angle) => (
                    <div className="visual-analysis-angle" key={angle.angle}>
                      <strong>
                        {angleLabels[angle.angle] ?? angle.angle}
                      </strong>
                      <span className="badge">
                        {angle.evaluable
                          ? `Severidad ${angle.severity}/4`
                          : 'Evidencia insuficiente'}
                      </span>
                      <p>{angle.observations}</p>
                      <small>
                        Confianza declarada:{' '}
                        {confidenceLabels[angle.confidence] ?? angle.confidence}
                      </small>
                    </div>
                  ))}
                </div>
              </>
            )}
            {item.policySnapshot && (
            <details className="visual-analysis-policy">
                <summary>
                Criterios aplicados · Versión {item.policySnapshot.version}
                </summary>

                <div className="visual-analysis-policy-content">
                <strong>{item.policySnapshot.name}</strong>

                <p className="claim-muted">
                    Esta es la política guardada al iniciar este análisis.
                    Los cambios posteriores en la configuración global no modifican
                    este registro.
                </p>

                <div className="visual-policy-tags">
                    {item.policySnapshot.criteria.map((criterion) => (
                    <span className="badge" key={criterion.code}>
                        {angleLabels[criterion.code] ?? criterion.label}:{' '}
                        {criterion.weight} %
                    </span>
                    ))}
                </div>

                <p className="visual-policy-instructions">
                    {item.policySnapshot.instructions}
                </p>

                {item.status === 'SUCCEEDED' && (
                    <p className="claim-muted">
                    Puntuación por ángulo: 100 − severidad × 25.
                    El resultado global utiliza los pesos indicados y solo se
                    calcula si los cuatro ángulos son evaluables.
                    </p>
                )}
                </div>
            </details>
            )}
            <p className="claim-muted">
              Modelo: {item.model}. Requiere revisión humana.
            </p>
            <VisualAnalysisEvidence
            key={item.id}
            tradeInId={tradeInId}
            analysisId={item.id}
            />
            {item.status === 'SUCCEEDED' && (
            <div className="visual-review-section">
                <button
                type="button"
                className="secondary-button"
                aria-expanded={reviewingId === item.id}
                onClick={() =>
                    setReviewingId((current) =>
                    current === item.id ? null : item.id,
                    )
                }
                >
                {reviewingId === item.id
                    ? 'Cerrar revisión'
                    : 'Consultar o registrar revisión'}
                </button>
                {reviewingId === item.id && (
                <AdminVisualReviewPanel
                    key={item.id}
                    tradeInId={tradeInId}
                    analysisId={item.id}
                />
                )}
            </div>
            )}
          </article>
        ))}
      </div>
    </section>
  )
}