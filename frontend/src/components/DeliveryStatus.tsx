import { useEffect, useState } from 'react'
import { Truck } from 'lucide-react'
import { ApiError } from '../lib/auth'
import {
  fulfillmentLabels,
  getCustomerFulfillment,
} from '../lib/fulfillment'
import type { CustomerFulfillment } from '../lib/fulfillment'

export default function DeliveryStatus({
  orderId,
}: {
  orderId: string
}) {
  const [delivery, setDelivery] = useState<CustomerFulfillment | null>(null)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    let active = true
    let timer: ReturnType<typeof setTimeout> | undefined

    setDelivery(null)
    setError('')

    async function load() {
      let shouldPoll = false

      try {
        const result = await getCustomerFulfillment(orderId)
        if (!active) return

        setDelivery(result)
        setError('')
        shouldPoll = result.status !== 'DELIVERED'
      } catch (err) {
        if (!active) return

        setError(
          err instanceof ApiError
            ? err.message
            : 'No pudimos actualizar el estado de entrega.',
        )

        shouldPoll = !(err instanceof ApiError) || err.status >= 500
      } finally {
        if (active && shouldPoll) {
          timer = setTimeout(() => {
            void load()
          }, 15000)
        }
      }
    }

    void load()

    return () => {
      active = false
      if (timer) clearTimeout(timer)
    }
  }, [orderId, retry])

  return (
    <section className="delivery-status-card">
      <div className="admin-card-title">
        <Truck size={22} />
        <h2>Entrega de tu pedido</h2>
      </div>

      {error ? (
        <div role="alert">
          <p>{error}</p>
          <button
            className="text-button"
            onClick={() => setRetry((value) => value + 1)}
          >
            Reintentar
          </button>
        </div>
      ) : delivery ? (
        <>
          <span className="badge">
            {fulfillmentLabels[delivery.status] ?? delivery.status}
          </span>

          {delivery.deliveredAt ? (
            <p>
              Entregado a <strong>{delivery.recipientName}</strong> el{' '}
              {new Date(delivery.deliveredAt).toLocaleString('es-PE')}.
            </p>
          ) : (
            <p>
              Aquí verás las actualizaciones de preparación y entrega.
            </p>
          )}
        </>
      ) : (
        <p role="status">Consultando entrega…</p>
      )}
    </section>
  )
}