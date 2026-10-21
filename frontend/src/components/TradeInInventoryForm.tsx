import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useSearchParams } from 'react-router'
import { ArrowDownToLine, LoaderCircle } from 'lucide-react'

import { ApiError } from '../lib/auth'
import { getAdminTradeIns } from '../lib/adminTradeIns'
import type { AdminTradeIn } from '../lib/adminTradeIns'

import { createUnitFromTradeIn, getTradeInInventoryStatuses,
  inventoryStatusLabels } from '../lib/inventory'
import type { TradeInUnitResult, TradeInInventoryStatus } from '../lib/inventory'
import { formatMoney } from '../lib/orders'

interface Props {
  productId: string
  disabled: boolean
  onBusyChange: (busy: boolean) => void
  onRegistered: (result: TradeInUnitResult) => void
}
type InventoryCandidate = AdminTradeIn & {
  inventory: TradeInInventoryStatus
}
function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    const details = Object.values(error.fields ?? {})
    return details.length ? details.join(' ') : error.message
  }

  return error instanceof Error
    ? error.message
    : 'No pudimos completar la operación.'
}

export default function TradeInInventoryForm({
  productId,
  disabled,
  onBusyChange,
  onRegistered,
}: Props) {
  const [searchParams] = useSearchParams()
  const requestedId = searchParams.get('tradeInId') ?? ''

  const [requests, setRequests] = useState<InventoryCandidate[]>([])
  const [selectedId, setSelectedId] = useState(requestedId)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [revision, setRevision] = useState(0)
  const [registered, setRegistered] =
    useState<TradeInUnitResult | null>(null)

  const inFlight = useRef(false)

  useEffect(() => {
    setSelectedId(requestedId)
    setRegistered(null)
    setError('')
  }, [requestedId])

  useEffect(() => {
    let active = true

    setLoading(true)
    setLoadError('')

    getAdminTradeIns()
    .then(async (items) => {
        if (!active) return

        const confirmed = items.filter(
        (item) => item.status === 'CONFIRMED',
        )

        const statuses = await getTradeInInventoryStatuses(
        confirmed.map((item) => item.id),
        )

        if (!active) return

        const byId = new Map(
        statuses.map((item) => [item.tradeInId, item]),
        )

        const candidates: InventoryCandidate[] = []

        for (const item of confirmed) {
        const inventory = byId.get(item.id)

        if (!inventory) {
            throw new Error(
            'Una solicitud cambió durante la consulta. Actualiza los canjes.',
            )
        }

        candidates.push({ ...item, inventory })
        }

        setRequests(candidates)
    })
      .catch((cause: unknown) => {
        if (active) setLoadError(describeError(cause))
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [revision])

  const selected =
    requests.find((item) => item.id === selectedId) ?? null

  const query = search.trim().toLocaleLowerCase('es')

    const visibleRequests = requests.filter((item) => {
    if (item.id === selectedId) return true

    if (!item.inventory.eligible) return false

    const text = [
        item.id,
        item.customerName,
        item.brand,
        item.model,
        item.storageGb,
        item.color,
        item.imei,
    ]
        .join(' ')
        .toLocaleLowerCase('es')

    return !query || text.includes(query)
    })

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (
    disabled ||
    inFlight.current ||
    loading ||
    loadError ||
    !selected ||
    !selected.inventory.eligible ||
    registered
    ) {
    return
    }

    const form = event.currentTarget
    const values = new FormData(form)

    const input = {
      productId,
      internalCode: String(values.get('internalCode') ?? '')
        .trim()
        .toUpperCase(),
      sellingPrice: String(values.get('sellingPrice') ?? '').trim(),
      conditionNotes: String(values.get('conditionNotes') ?? '').trim(),
    }

    inFlight.current = true
    setSubmitting(true)
    setError('')
    onBusyChange(true)

    let result: TradeInUnitResult

    try {
      result = await createUnitFromTradeIn(selected.id, input)
    } catch (cause) {
      setError(
        `${describeError(cause)} Si no se confirmó el resultado, ` +
          'reintenta conservando los mismos datos.',
      )
      return
    } finally {
      inFlight.current = false
      setSubmitting(false)
      onBusyChange(false)
    }

    setRegistered(result)
    setRevision((value) => value + 1)
    onRegistered(result)
  }

  return (
    <section className="trade-in-intake">
      <div className="trade-in-intake-heading">
        <ArrowDownToLine size={22} aria-hidden="true" />

        <div>
          <h3 className="inventory-subtitle">
            Ingresar desde un canje confirmado
          </h3>
          <p className="muted">
            Selecciona el equipo recibido. Se asociará al producto
            abierto en este panel.
          </p>
        </div>
      </div>

      <p className="muted">
        Se consultan los canjes confirmados de las 100 solicitudes
        más recientes. El IMEI y el costo se obtienen del canje.
      </p>

      {loading && <p role="status">Consultando canjes…</p>}

      {loadError && (
        <div className="alert error" role="alert">
          <p>{loadError}</p>
          <button
            type="button"
            className="text-button"
            disabled={disabled || submitting}
            onClick={() => setRevision((value) => value + 1)}
          >
            Reintentar consulta
          </button>
        </div>
      )}

      {!loading && !loadError && (
        <>
          {selectedId && !selected && (
            <div className="alert error" role="alert">
              La solicitud seleccionada no aparece entre los canjes
              confirmados cargados. Actualiza la consulta o selecciona
              otro equipo.
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <fieldset disabled={disabled || submitting}>
              <div className="field">
                <label htmlFor="tradeInInventorySearch">
                  Buscar equipo recibido
                </label>
                <input
                  id="tradeInInventorySearch"
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Cliente, modelo, IMEI o identificador"
                />
              </div>

              <div className="field">
                <label htmlFor="tradeInInventorySelection">
                  Canje confirmado
                </label>
                <select
                  id="tradeInInventorySelection"
                  value={selected?.id ?? ''}
                  onChange={(event) => {
                    setSelectedId(event.target.value)
                    setRegistered(null)
                    setError('')
                  }}
                  required
                >
                  <option value="">Selecciona un equipo recibido</option>

                  {visibleRequests.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.brand} {item.model} · {item.storageGb} GB ·{' '}
                      {item.color} · {item.customerName} · IMEI{' '}
                      {item.imei}
                      {item.inventory.unitId ? ' · Ya ingresado' : ''}
                    </option>
                  ))}
                </select>
              </div>

              {requests.length === 0 && (
                <p className="muted">
                  No hay canjes confirmados en la lista cargada.
                </p>
              )}

              {selected && (
                <dl className="trade-in-intake-summary">
                  <div>
                    <dt>Equipo recibido</dt>
                    <dd>
                      {selected.brand} {selected.model} ·{' '}
                      {selected.storageGb} GB · {selected.color}
                    </dd>
                  </div>
                  <div>
                    <dt>Cliente</dt>
                    <dd>{selected.customerName}</dd>
                  </div>
                  <div>
                    <dt>IMEI</dt>
                    <dd><code>{selected.imei}</code></dd>
                  </div>
                  <div>
                    <dt>Identificador del canje</dt>
                    <dd><code>{selected.id}</code></dd>
                  </div>
                  <div>
                    <dt>Estado del canje</dt>
                    <dd>Confirmado</dd>
                  </div>
                  <div>
                    <dt>Valor confirmado del canje</dt>
                    <dd>
                        {selected.inventory.confirmedAmount !== null &&
                        selected.inventory.currency
                        ? formatMoney(
                            selected.inventory.confirmedAmount,
                            selected.inventory.currency,
                            )
                        : 'Sin crédito emitido'}
                    </dd>
                    </div>

                    {selected.inventory.unitId && (
                    <>
                        <div>
                        <dt>Código de inventario</dt>
                        <dd>{selected.inventory.internalCode}</dd>
                        </div>

                        <div>
                        <dt>Estado de inventario</dt>
                        <dd>
                            {inventoryStatusLabels[selected.inventory.unitStatus ?? ''] ??
                            selected.inventory.unitStatus}
                        </dd>
                        </div>
                    </>
                    )}
                </dl>
                
              )}

              {registered ? (
                <div className="alert success" role="status">
                  <p>
                    {registered.created
                      ? 'Equipo ingresado al inventario.'
                      : 'Este canje ya estaba ingresado al inventario.'}
                  </p>
                  <p>
                    Unidad: <code>{registered.unitId}</code>
                  </p>
                  <p>
                    Estado:{' '}
                    {registered.status === 'PENDING_INSPECTION'
                      ? 'Pendiente de inspección'
                      : registered.status}
                  </p>
                </div>
                ) : selected && !selected.inventory.eligible ? (
                <div className="alert" role="status">
                    {selected.inventory.reason}
                </div>
                ) : selected ? (
                <div key={selected.id}>
                  <div className="admin-form-row">
                    <div className="field">
                      <label htmlFor="tradeInInventoryCode">
                        Código interno
                      </label>
                      <input
                        id="tradeInInventoryCode"
                        name="internalCode"
                        placeholder="CANJE-0001"
                        pattern={"[A-Za-z0-9_\\-]+"}
                        title="Usa letras, números, guiones o guiones bajos."
                        maxLength={60}
                        required
                      />
                    </div>

                    <div className="field">
                      <label htmlFor="tradeInInventoryPrice">
                        Precio de venta · S/
                      </label>
                      <input
                        id="tradeInInventoryPrice"
                        name="sellingPrice"
                        type="number"
                        min="0.01"
                        max="9999999999.99"
                        step="0.01"
                        required
                      />
                    </div>
                  </div>

                  <div className="field">
                    <label htmlFor="tradeInInventoryNotes">
                      Estado y observaciones
                    </label>
                    <textarea
                      id="tradeInInventoryNotes"
                      name="conditionNotes"
                      rows={3}
                      maxLength={2000}
                      placeholder="Describe el estado del equipo recibido."
                    />
                  </div>

                  {error && (
                    <div className="alert error" role="alert">
                      {error}
                    </div>
                  )}

                  <p className="muted">
                    Verifica que el producto abierto corresponda a
                    la marca, modelo, capacidad y color del equipo.
                    El backend comprobará esa coincidencia.
                  </p>

                  <button className="primary-button" type="submit">
                    {submitting ? (
                      <LoaderCircle size={18} className="spinner" />
                    ) : (
                      <ArrowDownToLine size={18} />
                    )}

                    {submitting
                      ? 'Registrando…'
                      : 'Ingresar equipo al inventario'}
                  </button>
                </div>
              ) : null}
            </fieldset>
          </form>

          <button
            type="button"
            className="text-button"
            disabled={disabled || submitting}
            onClick={() => setRevision((value) => value + 1)}
          >
            Actualizar canjes
          </button>
        </>
      )}
    </section>
  )
}