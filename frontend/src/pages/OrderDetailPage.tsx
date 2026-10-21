import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { ArrowLeft, Clock3, PackageCheck } from 'lucide-react'

import TestPaymentPanel from '../components/TestPaymentPanel'
import DeliveryStatus from '../components/DeliveryStatus'
import OrderWarranties from '../components/OrderWarranties'

import { ApiError } from '../lib/auth'
import {
  cancelPendingOrder,
  formatMoney,
  getOrder,
  orderStatusLabels,
} from '../lib/orders'

import type { Order } from '../lib/orders'

import '../styles/order-credit.css'

const conditionLabels: Record<string, string> = {
  NEW: 'Nuevo',
  USED: 'Usado',
  REFURBISHED: 'Reacondicionado',
}

export default function OrderDetailPage() {
  const { orderId } = useParams()

  if (!orderId) {
    return (
      <main className="store-content">
        <div className="catalog-empty">
          <h1>No se indicó un pedido</h1>
          <Link className="secondary-button" to="/pedidos">
            Ver mis pedidos
          </Link>
        </div>
      </main>
    )
  }

  return <OrderDetailContent key={orderId} orderId={orderId} />
}

function OrderDetailContent({ orderId }: { orderId: string }) {
  const [order, setOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [loginRequired, setLoginRequired] = useState(false)
  const [retry, setRetry] = useState(0)
  const [now, setNow] = useState(Date.now())

    const [confirmCancel, setConfirmCancel] = useState(false)
    const [cancelling, setCancelling] = useState(false)
    const [cancelError, setCancelError] = useState('')
    const [paymentBusy, setPaymentBusy] = useState(false)

  useEffect(() => {
    const timer = window.setInterval(
      () => setNow(Date.now()),
      1000,
    )

    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    let active = true
    let timer: ReturnType<typeof setTimeout> | undefined

    setLoading(true)
    setError('')
    setLoginRequired(false)

    async function load() {
      let shouldPoll = false

      try {
        const result = await getOrder(orderId)

        if (!active) return

        setOrder(result)
        setError('')
        shouldPoll = result.status === 'PENDING_PAYMENT'
      } catch (err) {
        if (!active) return

        if (err instanceof ApiError && err.status === 401) {
          setLoginRequired(true)
          setOrder(null)
        } else {
          if (err instanceof ApiError && err.status === 404) {
            setOrder(null)
          }

          setError(
            err instanceof ApiError
              ? err.message
              : 'No pudimos actualizar el pedido.',
          )

          shouldPoll =
            !(err instanceof ApiError) || err.status >= 500
        }
      } finally {
        if (active) {
          setLoading(false)

          if (shouldPoll) {
            timer = setTimeout(() => {
              void load()
            }, 10000)
          }
        }
      }
    }

    void load()

    return () => {
      active = false
      if (timer) clearTimeout(timer)
    }
  }, [orderId, retry])

  function refreshOrder() {
    setRetry((value) => value + 1)
  }
    async function handleCancelOrder() {
    if (
        !order ||
        order.status !== 'PENDING_PAYMENT' ||
        cancelling ||
        paymentBusy ||
        loading
    ) {
        return
    }

    setCancelling(true)
    setCancelError('')

    try {
        const updatedOrder = await cancelPendingOrder(order.id)

        setOrder(updatedOrder)
        setConfirmCancel(false)

        // Renueva la consulta y cancela el ciclo anterior de actualización.
        refreshOrder()
    } catch (err) {
        setCancelError(
        err instanceof ApiError
            ? err.message
            : 'No se pudo confirmar la cancelación. ' +
            'Actualiza el pedido o reintenta.',
        )

        // El pedido pudo cambiar mientras se solicitaba la cancelación.
        refreshOrder()
    } finally {
        setCancelling(false)
    }
    }
  const remainingSeconds = order
    ? Math.max(
        0,
        Math.ceil(
          (new Date(order.expiresAt).getTime() - now) / 1000,
        ),
      )
    : 0

  const minutes = Math.floor(remainingSeconds / 60)
  const seconds = remainingSeconds % 60

  const countdown =
    `${String(minutes).padStart(2, '0')}:` +
    String(seconds).padStart(2, '0')

  const paid = order?.status === 'PAID'

  const released =
    order?.status === 'EXPIRED' ||
    order?.status === 'CANCELLED'

  const hasCredit = (order?.creditApplied ?? 0) > 0

  const creditLabel = released
    ? 'Crédito liberado'
    : paid
      ? 'Crédito utilizado'
      : 'Crédito reservado'

  const differenceLabel = released
    ? 'Diferencia no cobrada'
    : paid
      ? order?.settlementEnvironment === 'TEST'
        ? 'Pago adicional simulado'
        : 'Pago adicional registrado'
      : 'Diferencia por pagar'

  return (
    <div className="store-page">
      <main className="store-content">
        <Link className="detail-back" to="/pedidos">
          <ArrowLeft size={17} />
          Mis pedidos
        </Link>

        {loading && !order ? (
          <div className="catalog-empty" role="status">
            Consultando tu pedido…
          </div>
        ) : loginRequired ? (
          <div className="catalog-empty">
            <h1>Inicia sesión para consultar este pedido</h1>

            <Link className="secondary-button" to="/cuenta">
              Iniciar sesión
            </Link>
          </div>
        ) : (
          <>
            {error && (
              <div className="alert error" role="alert">
                <p>{error}</p>

                <button
                  type="button"
                  className="text-button"
                  disabled={loading}
                  onClick={refreshOrder}
                >
                  Volver a consultar
                </button>
              </div>
            )}

            {order && (
              <>
                <div className="cart-heading">
                  <span className="eyebrow">
                    RESUMEN DE TU OPERACIÓN
                  </span>

                  <h1>Pedido #{order.orderNumber}</h1>

                  <span className="badge">
                    {orderStatusLabels[order.status] ?? order.status}
                  </span>

                  {order.settlementEnvironment === 'TEST' && (
                    <p className="cart-summary-note">
                      Operación de prueba · TEST
                    </p>
                  )}
                </div>

                {order.status === 'PENDING_PAYMENT' && (
                  <section className="reservation-banner">
                    <Clock3 size={28} aria-hidden="true" />

                    <div>
                      <h2>
                        {remainingSeconds > 0
                          ? hasCredit
                            ? 'Tus equipos y tu crédito están reservados'
                            : 'Tus equipos están reservados'
                          : 'El plazo de reserva terminó'}
                      </h2>

                      <p>
                        {remainingSeconds > 0
                          ? 'Tiempo aproximado restante para completar la operación.'
                          : 'Esperando la actualización del estado en el servidor.'}
                      </p>
                    </div>

                    <strong className="reservation-countdown">
                      {countdown}
                    </strong>
                  </section>
                )}

                {order.status === 'EXPIRED' && (
                  <div className="alert error">
                    <p>
                      La reserva venció sin completar la compra.
                      Consulta el catálogo para comprobar la
                      disponibilidad actual.
                    </p>

                    {hasCredit && (
                      <p>
                        Se liberaron{' '}
                        {formatMoney(
                          order.creditApplied,
                          order.currency,
                        )}{' '}
                        del crédito reservado para este pedido.
                      </p>
                    )}
                  </div>
                )}

                {order.status === 'CANCELLED' && (
                  <div className="alert">
                    <p>Este pedido está cancelado.</p>

                    {hasCredit && (
                      <p>
                        El crédito reservado para este pedido
                        fue liberado.
                      </p>
                    )}
                  </div>
                )}

                {paid && (
                  <div className="alert success" role="status">
                    <p>
                      {order.amountDue === 0
                        ? 'Compra completada con tu crédito de canje. No se generó un pago adicional.'
                        : hasCredit
                          ? 'Compra completada. Se utilizó el crédito de canje y se aprobó el pago de la diferencia.'
                          : 'Compra completada con pago aprobado.'}
                    </p>

                    {order.settlementEnvironment === 'TEST' && (
                      <p>
                        Operación realizada en el entorno de
                        demostración. No se efectuó un cobro
                        monetario real.
                      </p>
                    )}
                  </div>
                )}

                {paid && <DeliveryStatus orderId={order.id} />}

                <div className="cart-layout">
                  <section className="order-items-panel">
                    <h2>Equipos del pedido</h2>

                    {order.items.map((item) => (
                      <article
                        className="order-detail-item"
                        key={item.unitId}
                      >
                        <span className="order-list-icon">
                          <PackageCheck size={24} />
                        </span>

                        <div>
                          <h3>{item.productName}</h3>

                          <p>
                            {item.storageGb} GB · {item.color} ·{' '}
                            {conditionLabels[item.condition] ??
                              item.condition}
                          </p>

                          <small>Cantidad: 1</small>
                        </div>

                        <strong>
                          {formatMoney(
                            item.unitPrice,
                            order.currency,
                          )}
                        </strong>
                      </article>
                    ))}
                  </section>

                  <aside className="cart-summary">
                    <h2>Importes del pedido</h2>

                    <div className="cart-summary-line">
                      <span>Equipos</span>
                      <strong>{order.items.length}</strong>
                    </div>

                    <div className="cart-summary-line">
                      <span>Total de la compra</span>
                      <strong>
                        {formatMoney(
                          order.totalAmount,
                          order.currency,
                        )}
                      </strong>
                    </div>

                    {hasCredit && (
                      <div className="credit-box">
                        <div className="cart-summary-line">
                          <span>{creditLabel}</span>

                          <strong className="credit-applied-value">
                            {formatMoney(
                              order.creditApplied,
                              order.currency,
                            )}
                          </strong>
                        </div>

                        <p>
                          {released
                            ? 'Este importe volvió a estar disponible al cerrarse el pedido.'
                            : paid
                              ? 'Este importe de tu crédito se utilizó para completar la compra.'
                              : 'Este importe permanece reservado mientras el pedido esté pendiente.'}
                        </p>
                      </div>
                    )}

                    <div className="credit-payment-total">
                      <span>{differenceLabel}</span>

                      <strong>
                        {formatMoney(
                          order.amountDue,
                          order.currency,
                        )}
                      </strong>
                    </div>

                    {paid && order.amountDue === 0 && (
                      <p className="cart-summary-note">
                        La compra quedó cubierta totalmente con
                        crédito. No necesitas realizar otro pago.
                      </p>
                    )}

                    <p className="cart-summary-note">
                      Creado el{' '}
                      {new Date(order.createdAt).toLocaleString(
                        'es-PE',
                      )}.
                    </p>

                    <TestPaymentPanel
                    key={order.id}
                    orderId={order.id}
                    amountDue={order.amountDue}
                    currency={order.currency}
                    canPay={
                        order.status === 'PENDING_PAYMENT' &&
                        remainingSeconds > 0 &&
                        order.amountDue > 0 &&
                        !loading &&
                        !error &&
                        !cancelling &&
                        !confirmCancel
                    }
                    blocked={cancelling || confirmCancel}
                    onBusyChange={setPaymentBusy}
                    onProcessed={refreshOrder}
                    />
                    {cancelError && (
                    <div className="alert error" role="alert">
                        <p>{cancelError}</p>
                    </div>
                    )}

                    {order.status === 'PENDING_PAYMENT' && (
                    <section
                        className="order-cancel-panel"
                        aria-label="Cancelación del pedido"
                    >
                        {confirmCancel ? (
                        <>
                            <h3>¿Cancelar este pedido?</h3>

                            <p>
                            Los equipos volverán a estar disponibles.
                            {order.creditApplied > 0 && (
                                <>
                                {' '}
                                También se liberarán{' '}
                                <strong>
                                    {formatMoney(
                                    order.creditApplied,
                                    order.currency,
                                    )}
                                </strong>{' '}
                                de tu crédito de canje.
                                </>
                            )}
                            </p>

                            <div className="order-cancel-actions">
                            <button
                                type="button"
                                className="order-cancel-confirm"
                                disabled={cancelling || paymentBusy || loading}
                                onClick={handleCancelOrder}
                            >
                                {cancelling
                                ? 'Cancelando…'
                                : 'Sí, cancelar pedido'}
                            </button>

                            <button
                                type="button"
                                className="secondary-button"
                                disabled={cancelling}
                                onClick={() => {
                                setConfirmCancel(false)
                                setCancelError('')
                                }}
                            >
                                Conservar pedido
                            </button>
                            </div>
                        </>
                        ) : (
                        <button
                            type="button"
                            className="text-button"
                            disabled={paymentBusy || loading || cancelling}
                            onClick={() => {
                            setCancelError('')
                            setConfirmCancel(true)
                            }}
                        >
                            Cancelar pedido
                        </button>
                        )}
                    </section>
                    )}
                    <button
                      type="button"
                      className="text-button"
                      disabled={loading}
                      onClick={refreshOrder}
                    >
                      {loading
                        ? 'Actualizando…'
                        : 'Actualizar pedido'}
                    </button>
                    <Link className="secondary-button" to="/mis-creditos">
                    Consultar mis créditos
                    </Link>
                    <Link className="secondary-button" to="/">
                      Volver al catálogo
                    </Link>
                  </aside>
                </div>

                {paid && (
                  <OrderWarranties
                    key={order.id}
                    orderId={order.id}
                  />
                )}
              </>
            )}
          </>
        )}
      </main>
    </div>
  )
}