import { useEffect, useState } from 'react'
import { Camera } from 'lucide-react'

import { getVisualEvidencePhotos } from '../lib/tradeInVisualAnalysis'
import type { VisualEvidencePhoto } from '../lib/tradeInVisualAnalysis'

interface Props {
  tradeInId: string
  analysisId: string
}

const labels: Record<string, string> = {
  FRONT: 'Frente',
  BACK: 'Parte posterior',
  LEFT: 'Lateral izquierdo',
  RIGHT: 'Lateral derecho',
}

export default function VisualAnalysisEvidence({
  tradeInId,
  analysisId,
}: Props) {
  const [open, setOpen] = useState(false)
  const [photos, setPhotos] = useState<VisualEvidencePhoto[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    if (!open) return

    let active = true

    setLoading(true)
    setError('')
    setPhotos([])

    getVisualEvidencePhotos(tradeInId, analysisId)
      .then((result) => {
        if (active) setPhotos(result)
      })
      .catch((cause: unknown) => {
        if (!active) return

        setError(
          cause instanceof Error
            ? cause.message
            : 'No pudimos consultar la evidencia del análisis.',
        )
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [open, tradeInId, analysisId, revision])

  return (
    <section className="visual-evidence-panel">
      <button
        type="button"
        className="secondary-button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Camera size={18} aria-hidden="true" />
        {open ? 'Ocultar evidencia' : 'Ver fotografías de este análisis'}
      </button>

      {open && (
        <div className="visual-evidence-content">
          <p className="claim-muted">
            Copias conservadas al iniciar este intento. Abre cada imagen
            para revisarla en tamaño completo.
          </p>

          {loading && <p role="status">Cargando evidencia…</p>}

          {error && (
            <div className="alert error" role="alert">
              <p>{error}</p>
              <button
                type="button"
                className="text-button"
                disabled={loading}
                onClick={() => setRevision((value) => value + 1)}
              >
                Volver a consultar
              </button>
            </div>
          )}

          {!loading && !error && photos.length === 0 && (
            <p className="claim-muted">
              Este intento no tiene copias de evidencia disponibles.
            </p>
          )}

          {!loading && !error && photos.length > 0 && (
            <>
              {photos.length !== 4 && (
                <p className="warranty-error" role="alert">
                  La evidencia está incompleta: se encontraron{' '}
                  {photos.length} de las cuatro fotografías esperadas.
                </p>
              )}

              <div className="admin-trade-photo-grid">
                {photos.map((photo) => (
                  <figure
                    className="admin-trade-photo"
                    key={photo.angle}
                  >
                    <a
                      href={photo.imageUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Abrir evidencia: ${
                        labels[photo.angle] ?? photo.angle
                      }`}
                    >
                      <img
                        src={photo.imageUrl}
                        alt={`Evidencia del análisis: ${
                          labels[photo.angle] ?? photo.angle
                        }`}
                        loading="lazy"
                      />
                    </a>

                    <figcaption>
                      {labels[photo.angle] ?? photo.angle}
                    </figcaption>
                  </figure>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </section>
  )
}