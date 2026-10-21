import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import type { FormEvent } from 'react'
import { CheckCircle2, Plus, X } from 'lucide-react'
import { ApiError } from '../lib/auth'
import type { AdminProduct } from '../lib/admin'
import TradeInInventoryForm from './TradeInInventoryForm'
import {
  approveInspection,
  createUnit,
  getUnit,
  getUnits,
  setPublication,
} from '../lib/inventory'
import type { InventoryUnit } from '../lib/inventory'

interface Props {
  product: AdminProduct
  onClose: () => void
  onChanged: () => void
}

const conditionLabels: Record<string, string> = {
  NEW: 'Nuevo',
  USED: 'Usado',
  REFURBISHED: 'Reacondicionado',
}

const statusLabels: Record<string, string> = {
  PENDING_INSPECTION: 'Pendiente de inspección',
  REFURBISHING: 'En acondicionamiento',
  AVAILABLE: 'Disponible',
  RESERVED: 'Reservado',
  SOLD: 'Vendido',
  WRITTEN_OFF: 'Dado de baja',
}

function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    const details = Object.values(error.fields)
    return details.length ? details.join(' ') : error.message
  }

  return 'No pudimos completar la operación. Inténtalo otra vez.'
}

export default function ProductInventoryPanel({
  product,
  onClose,
  onChanged,
}: Props) {
    const [searchParams] = useSearchParams()
    const highlightedRow = useRef<HTMLTableRowElement | null>(null)

    const targetUnitId =
    searchParams.get('productId') === product.id
        ? searchParams.get('unitId')
        : null   
  const [units, setUnits] = useState<InventoryUnit[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [listError, setListError] = useState('')
  const [notice, setNotice] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [active, setActive] = useState(product.active)

  const [reviewId, setReviewId] = useState<string | null>(null)
  const [reviewNotes, setReviewNotes] = useState('')
  const [confirmed, setConfirmed] = useState(false)

useEffect(() => {
  let mounted = true

  setLoading(true)
  setListError('')
  setUnits([])

  async function loadUnits() {
    try {
      const result = await getUnits(product.id)

      if (!mounted) return

      let nextUnits = result

      if (
        targetUnitId &&
        !result.some((unit) => unit.id === targetUnitId)
      ) {
        const requestedUnit = await getUnit(product.id, targetUnitId)

        if (!mounted) return

        nextUnits = [requestedUnit, ...result]
      }

      setUnits(nextUnits)
    } catch (err: unknown) {
      if (mounted) {
        setListError(describeError(err))
      }
    } finally {
      if (mounted) {
        setLoading(false)
      }
    }
  }

  void loadUnits()

  return () => {
    mounted = false
  }
}, [product.id, targetUnitId, refresh])

    useEffect(() => {
    if (loading || listError || !targetUnitId) return

    const row = highlightedRow.current
    if (!row) return

    row.scrollIntoView({
        behavior: 'auto',
        block: 'center',
    })

    row.focus({ preventScroll: true })
    }, [loading, listError, targetUnitId, units])
  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return

    const form = event.currentTarget
    const values = new FormData(form)

    setBusy(true)
    setError('')
    setNotice('')

    try {
      await createUnit(product.id, {
        internalCode: String(values.get('internalCode') ?? ''),
        condition: String(values.get('condition') ?? ''),
        acquisitionCost: String(values.get('acquisitionCost') ?? ''),
        sellingPrice: String(values.get('sellingPrice') ?? ''),
        imei: String(values.get('imei') ?? ''),
        conditionNotes: String(values.get('conditionNotes') ?? ''),
      })

      form.reset()
      setNotice('Unidad registrada. Está pendiente de inspección.')
      setRefresh((value) => value + 1)
    } catch (err) {
      setError(describeError(err))
    } finally {
      setBusy(false)
    }
  }

  async function handleReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!reviewId || busy) return

    setBusy(true)
    setError('')
    setNotice('')

    try {
      await approveInspection(reviewId, reviewNotes, confirmed)
      setReviewId(null)
      setReviewNotes('')
      setConfirmed(false)
      setNotice('Revisión registrada. La unidad está disponible.')
      setRefresh((value) => value + 1)
    } catch (err) {
      setError(describeError(err))
    } finally {
      setBusy(false)
    }
  }

  async function handlePublication() {
    if (busy) return

    const nextActive = !active
    setBusy(true)
    setError('')
    setNotice('')

    try {
      await setPublication(product.id, nextActive)
      setActive(nextActive)
      setNotice(
        nextActive
          ? 'Producto publicado. Aparecerá en el catálogo si tiene unidades disponibles.'
          : 'Producto retirado del catálogo.',
      )
      onChanged()
    } catch (err) {
      setError(describeError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="inventory-panel">
      <div className="inventory-header">
        <div>
          <span className="eyebrow">INVENTARIO DEL PRODUCTO</span>
          <h2>{product.brand} {product.model}</h2>
          <p className="muted">
            {product.storageGb} GB · {product.color} · {product.sku}
          </p>
        </div>

        <button
          className="secondary-button"
          onClick={onClose}
          disabled={busy}
          aria-label="Cerrar panel de inventario"
        >
          <X size={18} />
        </button>
      </div>

      <div className="publication-bar">
        <div>
          <strong>{active ? 'Producto publicado' : 'Producto en borrador'}</strong>
          <p>Solo las unidades disponibles se mostrarán a los clientes.</p>
        </div>

        <button
          className="secondary-button"
          onClick={handlePublication}
          disabled={busy}
        >
          {active ? 'Retirar del catálogo' : 'Publicar producto'}
        </button>
      </div>

      {error && <div className="alert error" role="alert">{error}</div>}
      {notice && <div className="alert success" role="status">{notice}</div>}

        <TradeInInventoryForm
        key={product.id}
        productId={product.id}
        disabled={busy}
        onBusyChange={setBusy}
        onRegistered={(result) => {
            setError('')

            const currentStatus =
            statusLabels[result.status] ?? result.status

            setNotice(
            result.created
                ? 'Equipo del canje registrado. Está pendiente de inspección.'
                : `Este canje ya estaba ingresado. Estado actual: ${currentStatus}.`,
            )

            setRefresh((value) => value + 1)
        }}
        />
      <div className="admin-columns">
        <div className="admin-form-card">
          <h3 className="inventory-subtitle">Registrar una unidad</h3>

          <form onSubmit={handleCreate}>
            <fieldset disabled={busy}>
              <div className="field">
                <label htmlFor="unitCode">Código interno</label>
                <input
                  id="unitCode"
                  name="internalCode"
                  placeholder="UNIT-0002"
                  maxLength={60}
                  required
                />
              </div>

              <div className="field">
                <label htmlFor="unitImei">IMEI</label>
                <input
                  id="unitImei"
                  name="imei"
                  inputMode="numeric"
                  pattern="[0-9]{15}"
                  minLength={15}
                  maxLength={15}
                  placeholder="15 dígitos"
                  required
                />
              </div>

              <div className="field">
                <label htmlFor="unitCondition">Condición</label>
                <select id="unitCondition" name="condition" defaultValue="NEW">
                  <option value="NEW">Nuevo</option>
                  <option value="USED">Usado</option>
                  <option value="REFURBISHED">Reacondicionado</option>
                </select>
              </div>

              <div className="admin-form-row">
                <div className="field">
                  <label htmlFor="unitCost">Costo de adquisición · S/</label>
                  <input
                    id="unitCost"
                    name="acquisitionCost"
                    type="number"
                    min="0"
                    max="9999999999.99"
                    step="0.01"
                    required
                  />
                </div>

                <div className="field">
                  <label htmlFor="unitPrice">Precio de venta · S/</label>
                  <input
                    id="unitPrice"
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
                <label htmlFor="unitNotes">Estado y observaciones</label>
                <textarea
                  id="unitNotes"
                  name="conditionNotes"
                  rows={3}
                  maxLength={2000}
                  placeholder="Describe el estado físico y los detalles conocidos"
                />
              </div>

              <button className="primary-button" type="submit">
                <Plus size={18} />
                {busy ? 'Procesando…' : 'Registrar unidad'}
              </button>
            </fieldset>
          </form>
        </div>

        <div className="admin-table-card">
          <h3 className="inventory-subtitle">Unidades físicas</h3>
          <p className="muted inventory-caption">
            Hasta 100 unidades recientes y la unidad seleccionada, si es anterior.
            IMEI visible solo en administración.
          </p>

          {loading ? (
            <p role="status">Cargando unidades…</p>
          ) : listError ? (
            <div className="alert error" role="alert">
              <p>{listError}</p>
              <button
                className="text-button"
                onClick={() => setRefresh((value) => value + 1)}
              >
                Reintentar
              </button>
            </div>
          ) : units.length === 0 ? (
            <p className="admin-table-message">
              Este producto todavía no tiene unidades físicas.
            </p>
          ) : (
            <div className="admin-table-scroll">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th scope="col">Unidad</th>
                    <th scope="col">Precio</th>
                    <th scope="col">Estado</th>
                  </tr>
                </thead>

                <tbody>
                  {units.map((unit) => (
                    <tr
                        key={unit.id}
                        ref={unit.id === targetUnitId ? highlightedRow : undefined}
                        className={
                            unit.id === targetUnitId
                            ? 'inventory-unit-highlight'
                            : undefined
                        }
                        tabIndex={unit.id === targetUnitId ? -1 : undefined}
                        >
                      <td>
                        <strong>{unit.internalCode}</strong>
                        {unit.id === targetUnitId && (
                        <small className="inventory-unit-origin">
                            Equipo seleccionado desde el canje
                        </small>
                        )}
                        <small>{conditionLabels[unit.condition]}</small>
                        <small>IMEI: {unit.imei ?? 'Sin registrar'}</small>
                        {unit.conditionNotes && (
                          <small>{unit.conditionNotes}</small>
                        )}
                      </td>

                      <td>
                        {new Intl.NumberFormat('es-PE', {
                          style: 'currency',
                          currency: unit.currency,
                        }).format(unit.sellingPrice)}
                      </td>

                      <td>
                        <span className="badge">
                          {statusLabels[unit.status] ?? unit.status}
                        </span>

                        {unit.status === 'PENDING_INSPECTION' && (
                          <button
                            type="button"
                            className="text-button inventory-review-button"
                            disabled={busy}
                            onClick={() => {
                              setReviewId(unit.id)
                              setReviewNotes('')
                              setConfirmed(false)
                              setError('')
                              setNotice('')
                            }}
                          >
                            Registrar revisión
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {reviewId && (
            <form className="inspection-form" onSubmit={handleReview}>
              <fieldset disabled={busy}>
                <h3 className="inventory-subtitle">
                  Aprobar revisión: {
                    units.find((unit) => unit.id === reviewId)?.internalCode
                  }
                </h3>

                <div className="field">
                  <label htmlFor="inspectionNotes">Resultado y evidencia</label>
                  <textarea
                    id="inspectionNotes"
                    value={reviewNotes}
                    onChange={(event) => setReviewNotes(event.target.value)}
                    rows={4}
                    maxLength={2000}
                    placeholder="Registra pruebas, revisión de IMEI, fuente consultada y observaciones."
                    required
                  />
                </div>

                <label className="inspection-confirm">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(event) => setConfirmed(event.target.checked)}
                    required
                  />
                  <span>
                    Confirmo que revisé el equipo, su identificación y su
                    funcionamiento, y autorizo su disponibilidad para venta.
                  </span>
                </label>

                <div className="inspection-actions">
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => setReviewId(null)}
                  >
                    Cancelar
                  </button>

                  <button
                    className="primary-button"
                    type="submit"
                    disabled={!confirmed}
                  >
                    <CheckCircle2 size={18} />
                    Aprobar y habilitar
                  </button>
                </div>
              </fieldset>
            </form>
          )}
        </div>
      </div>
    </section>
  )
}