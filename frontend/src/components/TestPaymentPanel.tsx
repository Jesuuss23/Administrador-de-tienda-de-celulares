import { useEffect, useRef, useState } from 'react'
import { FlaskConical, LoaderCircle } from 'lucide-react'

import { ApiError } from '../lib/auth'
import { formatMoney } from '../lib/orders'

import {
  getPaymentAttempts,
  simulatePayment,
} from '../lib/payments'

import type {
  PaymentAttempt,
  TestOutcome,
} from '../lib/payments'

interface Props {
  orderId: string
  amountDue: number
  currency: string
  canPay: boolean
  blocked?: boolean
  onBusyChange?: (busy: boolean) => void
  onProcessed: () => void
}

export default function TestPaymentPanel({
  orderId,
  amountDue,
  currency,
  canPay,
  blocked = false,
  onBusyChange,
  onProcessed,
}: Props) {
  const [attempts, setAttempts] = useState<PaymentAttempt[]>([])
  const [loading, setLoading] = useState(true)
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)

  const [error, setError] = useState('')
  const [enabled, setEnabled] = useState(true)
  const [retry, setRetry] = useState(0)

  const processing = useRef(false)

  const pendingAttempt = useRef<{
    requestKey: string
    outcome: TestOutcome
  } | null>(null)

  const [uncertainOutcome, setUncertainOutcome] =
    useState<TestOutcome | null>(null)

  useEffect(() => {
    let active = true

    setLoading(true)
    setLoaded(false)
    setError('')
    setEnabled(true)

    getPaymentAttempts(orderId)
      .then((result) => {
        if (!active) return

        setAttempts(result)
        setLoaded(true)
      })
      .catch((err: unknown) => {
        if (!active) return

        if (err instanceof ApiError && err.status === 404) {
          setEnabled(false)

          setError(
            'No se pudo acceder al módulo de pagos de prueba ' +
            'para este pedido.',
          )
        } else {
          setError(
            err instanceof ApiError
              ? err.message
              : 'No pudimos consultar los intentos de pago.',
          )
        }
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [orderId, retry])

  const hasApprovedPayment = attempts.some(
    (attempt) => attempt.status === 'APPROVED',
  )

  const canStartPayment =
    canPay &&
    Number.isFinite(amountDue) &&
    amountDue > 0 &&
    loaded &&
    enabled &&
    !loading &&
    !hasApprovedPayment

  const showActions =
    canStartPayment || uncertainOutcome !== null

  async function handleSimulate(outcome: TestOutcome) {
    if (
    processing.current ||
    busy ||
    loading ||
    !enabled ||
    blocked
    ) {
    return
    }

    const previous = pendingAttempt.current

    if (previous && previous.outcome !== outcome) {
      setError(
        'Primero confirma el resultado del intento anterior.',
      )
      return
    }

    // Un reintento conserva la clave del intento original.
    // El servidor devolverá su resultado o validará el estado actual.
    if (!previous && !canStartPayment) {
      return
    }

    const attempt = previous ?? {
      requestKey: crypto.randomUUID(),
      outcome,
    }

    pendingAttempt.current = attempt
    processing.current = true

    setBusy(true)
    onBusyChange?.(true)
    setError('')

    try {
      await simulatePayment(
        orderId,
        attempt.requestKey,
        attempt.outcome,
      )

      pendingAttempt.current = null
      setUncertainOutcome(null)

      setRetry((value) => value + 1)
      onProcessed()
    } catch (err) {
      const definitiveError =
        err instanceof ApiError &&
        err.status >= 400 &&
        err.status < 500

      if (definitiveError) {
        pendingAttempt.current = null
        setUncertainOutcome(null)

        if (
          err instanceof ApiError &&
          (err.status === 401 || err.status === 409)
        ) {
          onProcessed()
        }
      } else {
        setUncertainOutcome(attempt.outcome)
      }

      setError(
        err instanceof ApiError
          ? err.message
          : 'No se pudo confirmar el resultado. Reintenta ' +
            'la misma operación o actualiza el pedido.',
      )
        } finally {
        processing.current = false
        setBusy(false)
        onBusyChange?.(false)
        }
        
  }

  function refreshAttempts() {
    if (busy || loading) return
    setRetry((value) => value + 1)
  }

  return (
    <section className="test-payment-panel">
      <div className="test-payment-title">
        <FlaskConical size={20} aria-hidden="true" />

        <strong>
          {showActions
            ? 'Pago de demostración'
            : 'Historial de pagos'}
        </strong>
      </div>

      {canStartPayment && (
        <>
          <div className="cart-summary-line">
            <span>Importe a simular</span>

            <strong>
              {formatMoney(amountDue, currency)}
            </strong>
          </div>

          <p>
            Esta operación es simulada. No utiliza tarjetas
            ni realiza cobros reales.
          </p>
        </>
      )}

      {amountDue === 0 && (
        <p>
          Este pedido no tiene una diferencia monetaria
          por pagar.
        </p>
      )}

      {loading && (
        <p className="cart-summary-note" role="status">
          Consultando pagos…
        </p>
      )}

      {uncertainOutcome !== null && (
        <div className="alert" role="status">
          <p>
            El resultado del último intento sigue sin confirmarse.
            El botón de reintento utilizará la misma clave
            para evitar duplicar la operación.
          </p>
        </div>
      )}

      {error && (
        <div className="alert error" role="alert">
          <p>{error}</p>

          <button
            type="button"
            className="text-button"
            disabled={busy || loading}
            onClick={refreshAttempts}
          >
            Consultar intentos
          </button>

          <button
            type="button"
            className="text-button"
            disabled={busy}
            onClick={onProcessed}
          >
            Actualizar pedido
          </button>
        </div>
      )}

    {showActions && enabled && (
    <div className="test-payment-actions">
        <button
        type="button"
        className="primary-button"
        disabled={
            blocked ||
            busy ||
            loading ||
            (uncertainOutcome !== null &&
            uncertainOutcome !== 'APPROVED')
        }
        onClick={() => handleSimulate('APPROVED')}
        >
        {busy && (
            <LoaderCircle
            size={17}
            className="spinner"
            aria-hidden="true"
            />
        )}

        {uncertainOutcome === 'APPROVED'
            ? 'Reintentar aprobación'
            : 'Simular pago aprobado'}
        </button>

        <button
        type="button"
        className="secondary-button"
        disabled={
            blocked ||
            busy ||
            loading ||
            (uncertainOutcome !== null &&
            uncertainOutcome !== 'DECLINED')
        }
        onClick={() => handleSimulate('DECLINED')}
        >
        {uncertainOutcome === 'DECLINED'
            ? 'Reintentar rechazo'
            : 'Simular pago rechazado'}
        </button>
    </div>
    )}

      <div className="payment-attempts">
        <h3>Historial de intentos</h3>

        {loaded && attempts.length === 0 && (
          <p>
            {amountDue === 0
              ? 'No se registraron intentos de pago monetario.'
              : 'Todavía no hay intentos registrados.'}
          </p>
        )}

        {attempts.map((attempt) => (
          <article
            className="payment-attempt"
            key={attempt.id}
          >
            <div>
              <strong>
                {attempt.status === 'APPROVED'
                  ? 'Aprobado'
                  : 'Rechazado'}
              </strong>

              <small>
                {attempt.environment === 'TEST'
                  ? 'PRUEBA'
                  : 'REAL'}
                {' · '}
                {new Date(attempt.createdAt).toLocaleString(
                  'es-PE',
                )}
              </small>
            </div>

            <span>
              {formatMoney(
                attempt.amount,
                attempt.currency,
              )}
            </span>
          </article>
        ))}
      </div>
    </section>
  )
}