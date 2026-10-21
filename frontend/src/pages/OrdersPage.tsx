import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { ArrowLeft, ArrowRight, Package } from 'lucide-react'
import { ApiError } from '../lib/auth'
import {
  formatMoney,
  getOrders,
  orderStatusLabels,
} from '../lib/orders'
import type { OrderSummary } from '../lib/orders'

export default function OrdersPage() {
  const [orders, setOrders] = useState<OrderSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [loginRequired, setLoginRequired] = useState(false)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    let active = true

    setLoading(true)
    setError('')
    setLoginRequired(false)

    getOrders()
      .then((result) => {
        if (active) setOrders(result)
      })
      .catch((err: unknown) => {
        if (!active) return

        if (err instanceof ApiError && err.status === 401) {
          setLoginRequired(true)
        } else {
          setError(
            err instanceof ApiError
              ? err.message
              : 'No pudimos consultar tus pedidos.',
          )
        }
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [retry])

  return (
    <div className="store-page">
      <main className="store-content">
        <Link className="detail-back" to="/cuenta">
          <ArrowLeft size={17} />
          Mi cuenta
        </Link>

        <div className="cart-heading">
          <span className="eyebrow">HISTORIAL DE COMPRAS</span>
          <h1>Mis pedidos</h1>
          <p className="muted">
            Consulta tus 20 pedidos más recientes.
          </p>
        </div>

        {loading ? (
          <div className="catalog-empty" role="status">
            Cargando pedidos…
          </div>
        ) : loginRequired ? (
          <div className="catalog-empty">
            <h2>Inicia sesión para continuar</h2>
            <Link className="secondary-button" to="/cuenta">
              Ir a mi cuenta
            </Link>
          </div>
        ) : error ? (
          <div className="catalog-empty">
            <p role="alert">{error}</p>
            <button
              className="secondary-button"
              onClick={() => setRetry((value) => value + 1)}
            >
              Reintentar
            </button>
          </div>
        ) : orders.length === 0 ? (
          <div className="catalog-empty">
            <Package size={40} />
            <h2>Todavía no tienes pedidos</h2>
            <p>Tu próxima renovación puede empezar en el catálogo.</p>
            <Link className="secondary-button" to="/">
              Explorar equipos
            </Link>
          </div>
        ) : (
          <div className="orders-list">
            {orders.map((order) => (
              <Link
                className="order-list-card"
                key={order.id}
                to={`/pedidos/${order.id}`}
              >
                <span className="order-list-icon">
                  <Package size={23} />
                </span>

                <div className="order-list-information">
                  <h2>Pedido #{order.orderNumber}</h2>
                  <p>
                    {new Date(order.createdAt).toLocaleString('es-PE')}
                  </p>
                  <span className="badge">
                    {orderStatusLabels[order.status] ?? order.status}
                  </span>
                </div>

                <strong>
                  {formatMoney(order.totalAmount, order.currency)}
                </strong>

                <ArrowRight size={20} />
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}