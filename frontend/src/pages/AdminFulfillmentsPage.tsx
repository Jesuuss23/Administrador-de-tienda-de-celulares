import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router'
import { ArrowLeft, PackageCheck } from 'lucide-react'
import { ApiError } from '../lib/auth'
import { formatMoney } from '../lib/orders'
import {
  fulfillmentLabels,
  getAdminFulfillments,
  updateFulfillment,
} from '../lib/fulfillment'
import type {
  AdminFulfillment,
  FulfillmentUpdate,
} from '../lib/fulfillment'

export default function AdminFulfillmentsPage() {
  const [orders, setOrders] = useState<AdminFulfillment[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [accessError, setAccessError] = useState(false)
  const [retry, setRetry] = useState(0)

  const [selected, setSelected] = useState<AdminFulfillment | null>(null)

  useEffect(() => {
    let active = true

    setLoading(true)
    setError('')
    setAccessError(false)

    getAdminFulfillments()
      .then((result) => {
        if (active) setOrders(result)
      })
      .catch((err: unknown) => {
        if (!active) return

        if (
          err instanceof ApiError &&
          (err.status === 401 || err.status === 403)
        ) {
          setAccessError(true)
          setOrders([])
        }

        setError(
          err instanceof ApiError
            ? err.message
            : 'No pudimos consultar las entregas.',
        )
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [retry])

  async function execute(
    orderId: string,
    input: FulfillmentUpdate,
  ) {
    if (busy) return

    setBusy(true)
    setError('')
    setNotice('')

    try {
      await updateFulfillment(orderId, input)
      setSelected(null)
      setNotice('Estado de entrega actualizado.')
      setRetry((value) => value + 1)
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'No pudimos confirmar el cambio. Actualiza la lista antes de reintentar.',
      )
    } finally {
      setBusy(false)
    }
  }

  function handleDelivery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selected || busy) return

    const values = new FormData(event.currentTarget)

    void execute(selected.orderId, {
      action: 'DELIVER',
      recipientName: String(values.get('recipientName') ?? ''),
      deliveryReference: String(values.get('deliveryReference') ?? ''),
      confirmed: values.get('confirmed') === 'on',
    })
  }

  return (
    <div className="store-page">
      <main className="admin-content">
        <Link className="detail-back" to="/admin/productos">
          <ArrowLeft size={17} />
          Administración
        </Link>

        <div className="cart-heading">
          <span className="eyebrow">OPERACIONES</span>
          <h1>Preparación y entregas</h1>
          <p className="muted">
            Últimos 50 pedidos pagados. Los pagos de prueba están identificados.
          </p>
        </div>

        {notice && (
          <div className="alert success" role="status">{notice}</div>
        )}

        {error && (
          <div className="alert error" role="alert">
            <p>{error}</p>

            {accessError ? (
              <Link className="text-button" to="/cuenta">
                Iniciar sesión con una cuenta administradora
              </Link>
            ) : (
              <button
                className="text-button"
                disabled={busy}
                onClick={() => {
                  setSelected(null)
                  setRetry((value) => value + 1)
                }}
              >
                Actualizar lista
              </button>
            )}
          </div>
        )}

        {loading ? (
          <div className="catalog-empty" role="status">
            Cargando pedidos…
          </div>
        ) : !accessError && !error && orders.length === 0 ? (
          <div className="catalog-empty">
            <PackageCheck size={40} />
            <h2>No hay pedidos pagados</h2>
          </div>
        ) : !accessError ? (
          <div className="admin-table-card">
            <div className="admin-table-scroll">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th scope="col">Pedido</th>
                    <th scope="col">Cliente</th>
                    <th scope="col">Importe</th>
                    <th scope="col">Entrega</th>
                    <th scope="col">Acción</th>
                  </tr>
                </thead>

                <tbody>
                  {orders.map((order) => (
                    <tr key={order.orderId}>
                      <td>
                        <strong>#{order.orderNumber}</strong>
                        {order.testPayment && (
                          <small className="test-order-label">
                            PAGO DE PRUEBA
                          </small>
                        )}
                      </td>

                      <td>
                        <strong>{order.customerName}</strong>
                        <small>{order.customerEmail}</small>
                      </td>

                      <td>
                        {formatMoney(order.totalAmount, order.currency)}
                      </td>

                      <td>
                        <span className="badge">
                          {fulfillmentLabels[order.status] ?? order.status}
                        </span>

                        {order.deliveredAt && (
                          <>
                            <small>
                              {new Date(order.deliveredAt)
                                .toLocaleString('es-PE')}
                            </small>
                            <small>Recibió: {order.recipientName}</small>
                            <small>Ref.: {order.deliveryReference}</small>
                          </>
                        )}
                      </td>

                      <td>
                        {order.status === 'PENDING' && (
                          <button
                            className="secondary-button"
                            disabled={busy}
                            onClick={() => execute(order.orderId, {
                              action: 'PREPARE',
                            })}
                          >
                            Preparar
                          </button>
                        )}

                        {order.status === 'PREPARING' && (
                          <button
                            className="secondary-button"
                            disabled={busy}
                            onClick={() => execute(order.orderId, {
                              action: 'READY',
                            })}
                          >
                            Marcar listo
                          </button>
                        )}

                        {order.status === 'READY' && (
                          <button
                            className="secondary-button"
                            disabled={busy}
                            onClick={() => {
                              setSelected(order)
                              setError('')
                              setNotice('')
                            }}
                          >
                            Registrar entrega
                          </button>
                        )}

                        {order.status === 'DELIVERED' && (
                          <span className="availability">
                            Entrega registrada
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {selected && !accessError && (
          <section className="delivery-form-card">
            <h2>Entrega del pedido #{selected.orderNumber}</h2>

            {selected.testPayment && (
              <div className="alert">
                Pedido de demostración: registra una entrega de prueba,
                sin presentarla como una entrega comercial real.
              </div>
            )}

            <form onSubmit={handleDelivery}>
              <fieldset disabled={busy}>
                <div className="field">
                  <label htmlFor="recipientName">Nombre del receptor</label>
                  <input
                    id="recipientName"
                    name="recipientName"
                    maxLength={120}
                    required
                  />
                </div>

                <div className="field">
                  <label htmlFor="deliveryReference">
                    Referencia de entrega
                  </label>
                  <input
                    id="deliveryReference"
                    name="deliveryReference"
                    placeholder="Número de constancia o referencia verificable"
                    maxLength={200}
                    required
                  />
                </div>

                <label className="inspection-confirm">
                  <input type="checkbox" name="confirmed" required />
                  <span>
                    {selected.testPayment
                      ? 'Confirmo que esta es una simulación de entrega.'
                      : 'Confirmo que los equipos fueron entregados al receptor indicado.'}
                  </span>
                </label>

                <div className="inspection-actions">
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => setSelected(null)}
                  >
                    Cancelar
                  </button>

                  <button className="primary-button" type="submit">
                    {busy ? 'Registrando…' : 'Confirmar entrega'}
                  </button>
                </div>
              </fieldset>
            </form>
          </section>
        )}
      </main>
    </div>
  )
}