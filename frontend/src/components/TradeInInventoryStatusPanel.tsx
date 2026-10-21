import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import {
  getTradeInInventoryStatus,
  inventoryStatusLabels,
} from '../lib/inventory'
import type { TradeInInventoryStatus } from '../lib/inventory'
import { formatMoney } from '../lib/orders'

interface Props {
  tradeInId: string
}

export default function TradeInInventoryStatusPanel({
  tradeInId,
}: Props) {
  const [data, setData] = useState<TradeInInventoryStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    let active = true

    setLoading(true)
    setError('')
    setData(null)

    getTradeInInventoryStatus(tradeInId)
      .then((result) => {
        if (active) setData(result)
      })
      .catch((cause: unknown) => {
        if (!active) return

        setError(
          cause instanceof Error
            ? cause.message
            : 'No pudimos consultar el ingreso al inventario.',
        )
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [tradeInId, revision])

  return (
    <section className="trade-in-intake">
      <h3 className="inventory-subtitle">
        Trazabilidad del equipo recibido
      </h3>

      {loading && <p role="status">Consultando inventario…</p>}

      {error && (
        <div className="alert error" role="alert">
          {error}
        </div>
      )}

      {data && (
        <>
          <span className="badge">
            {data.unitId
              ? 'Ingresado al inventario'
              : data.eligible
                ? 'Pendiente de ingreso'
                : 'Ingreso no habilitado'}
          </span>

          <dl className="trade-in-intake-summary">
            <div>
              <dt>Valor confirmado del canje</dt>
              <dd>
                {data.confirmedAmount !== null && data.currency
                  ? formatMoney(data.confirmedAmount, data.currency)
                  : 'Sin crédito emitido'}
              </dd>
            </div>

            <div>
              <dt>Crédito</dt>
              <dd>
                {data.creditStatus === 'VOID'
                  ? 'Anulado'
                  : data.creditStatus
                    ? 'Emitido'
                    : 'No emitido'}
              </dd>
            </div>

            {data.unitId && (
              <>
                <div>
                  <dt>Código interno</dt>
                  <dd>{data.internalCode}</dd>
                </div>

                <div>
                  <dt>Estado de inventario</dt>
                  <dd>
                    {inventoryStatusLabels[data.unitStatus ?? ''] ??
                      data.unitStatus ??
                      'Sin estado'}
                  </dd>
                </div>

                <div>
                  <dt>Costo registrado al ingresar</dt>
                  <dd>
                    {data.acquisitionCost !== null
                      ? formatMoney(data.acquisitionCost, 'PEN')
                      : 'Sin información'}
                  </dd>
                </div>

                <div>
                  <dt>Identificador de la unidad</dt>
                  <dd><code>{data.unitId}</code></dd>
                </div>
              </>
            )}
          </dl>
            {data.unitId && data.productId ? (
            <Link
                className="primary-button"
                to={
                `/admin/productos?productId=${encodeURIComponent(data.productId)}` +
                `&unitId=${encodeURIComponent(data.unitId)}`
                }
            >
                Ver unidad en inventario
            </Link>
            ) : data.eligible ? (
            <Link
                className="primary-button"
                to={`/admin/productos?tradeInId=${encodeURIComponent(data.tradeInId)}`}
            >
                Ingresar al inventario
            </Link>
            ) : null}
          {!data.unitId && data.reason && (
            <p className="muted">{data.reason}</p>
          )}

          <p className="muted">
            El valor del canje corresponde al importe original emitido.
            El uso del crédito por el cliente no cambia el costo
            registrado del equipo.
          </p>
        </>
      )}

      <button
        type="button"
        className="text-button"
        disabled={loading}
        onClick={() => setRevision((value) => value + 1)}
      >
        Actualizar estado de inventario
      </button>
    </section>
  )
}