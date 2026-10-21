import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { ClipboardCheck, LoaderCircle } from 'lucide-react'

import {
  getVisualReview,
  reviewDecisionLabels,
  saveVisualReview,
} from '../lib/visualReviews'

import type {
  SaveVisualReviewInput,
  VisualReview,
  VisualReviewDecision,
} from '../lib/visualReviews'

interface Props {
  tradeInId: string
  analysisId: string
}

export default function AdminVisualReviewPanel({
  tradeInId,
  analysisId,
}: Props) {
  const [review, setReview] = useState<VisualReview | null>(null)
  const [decision, setDecision] = useState<VisualReviewDecision | ''>('')
  const [notes, setNotes] = useState('')
  const [confirmed, setConfirmed] = useState(false)

  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)

  const submitting = useRef(false)
  const pending = useRef<SaveVisualReviewInput | null>(null)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')

    getVisualReview(tradeInId, analysisId)
      .then((data) => {
        if (!active) return

        setReview(data.review)

        if (data.review) {
          pending.current = null
        }
      })
      .catch((cause: unknown) => {
        if (!active) return

        setError(
          cause instanceof Error
            ? cause.message
            : 'No pudimos consultar la revisión.',
        )
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [tradeInId, analysisId, revision])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (
      submitting.current ||
      review ||
      !decision ||
      !notes.trim() ||
      !confirmed
    ) {
      return
    }

    const normalizedNotes = notes.trim()

    if (
      pending.current &&
      (pending.current.decision !== decision ||
        pending.current.notes !== normalizedNotes)
    ) {
      setError(
        'Hay un envío anterior sin confirmar. Consulta la revisión antes de cambiar su contenido.',
      )
      return
    }

    if (!pending.current) {
      pending.current = {
        requestKey: crypto.randomUUID(),
        decision,
        notes: normalizedNotes,
      }
    }

    submitting.current = true
    setBusy(true)
    setError('')

    try {
      const data = await saveVisualReview(
        tradeInId,
        analysisId,
        pending.current,
      )

      if (!data.review) {
        throw new Error('El servidor no devolvió la revisión guardada.')
      }

      setReview(data.review)
      pending.current = null
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'No se pudo confirmar el guardado. Consulta la revisión antes de volver a intentarlo.',
      )
    } finally {
      submitting.current = false
      setBusy(false)
    }
  }

  return (
    <section className="visual-review-panel">
      <h4>
        <ClipboardCheck size={20} aria-hidden="true" />
        Revisión del administrador
      </h4>

      {error && (
        <div className="alert error" role="alert">
          <p>{error}</p>
          <button
            type="button"
            className="text-button"
            disabled={busy || loading}
            onClick={() => setRevision((value) => value + 1)}
          >
            Consultar revisión guardada
          </button>
        </div>
      )}

      {loading ? (
        <p role="status">Consultando revisión…</p>
      ) : review ? (
        <div className="visual-review-result">
          <span className="badge">
            {reviewDecisionLabels[review.decision]}
          </span>

          <p className="visual-review-notes">{review.notes}</p>

          <p className="claim-muted">
            Registrado por {review.reviewerName} el{' '}
            {new Date(review.reviewedAt).toLocaleString('es-PE')}.
          </p>

          <p className="claim-muted">
            Esta revisión corresponde a este informe. No modifica la
            cotización ni aprueba el canje.
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
          <fieldset className="visual-policy-fields" disabled={busy}>
            <label>
              Resultado de tu revisión
              <select
                value={decision}
                required
                onChange={(event) =>
                  setDecision(
                    event.target.value as VisualReviewDecision | '',
                  )
                }
              >
                <option value="">Selecciona una opción</option>
                <option value="AGREE">Coincido con el informe</option>
                <option value="DISAGREE">Discrepo del informe</option>
                <option value="NEEDS_MORE_EVIDENCE">
                  Necesito más evidencia
                </option>
              </select>
            </label>

            <label>
              Observaciones
              <textarea
                value={notes}
                required
                maxLength={2000}
                rows={4}
                placeholder="Describe lo que comprobaste y explica tu decisión."
                onChange={(event) => setNotes(event.target.value)}
              />
            </label>

            <small className="claim-muted">
              {notes.length} / 2000 caracteres
            </small>

            <label className="visual-review-confirm">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(event) => setConfirmed(event.target.checked)}
                required
              />
              <span>
                He revisado las fotografías y el informe. Entiendo que
                esta revisión será final y no editable.
              </span>
            </label>

            <button
              type="submit"
              className="primary-button"
              disabled={
                busy || !decision || !notes.trim() || !confirmed
              }
            >
              {busy && (
                <LoaderCircle
                  size={17}
                  className="spinner"
                  aria-hidden="true"
                />
              )}
              {busy ? 'Guardando…' : 'Registrar revisión final'}
            </button>
          </fieldset>
        </form>
      )}
    </section>
  )
}