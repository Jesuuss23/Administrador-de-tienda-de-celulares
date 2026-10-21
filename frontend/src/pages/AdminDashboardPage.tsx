import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import {
  ArrowRight,
  ArrowRightLeft,
  ClipboardCheck,
  Package,
  PackageCheck,
  RefreshCw,
  Truck,
} from 'lucide-react'

import { ApiError } from '../lib/auth'
import { getDashboardSummary } from '../lib/dashboard'
import type { DashboardSummary } from '../lib/dashboard'

const cards = [
  {
    key: 'tradeInsToReview',
    title: 'Canjes por revisar',
    description: 'Solicitudes enviadas o en revisión.',
    to: '/admin/canjes',
    action: 'Abrir solicitudes',
    icon: ArrowRightLeft,
  },
  {
    key: 'tradeInsToStock',
    title: 'Canjes pendientes de ingreso',
    description: 'Confirmados, con crédito válido y sin unidad registrada.',
    to: '/admin/canjes',
    action: 'Consultar canjes',
    icon: Package,
  },
  {
    key: 'unitsToInspect',
    title: 'Equipos por inspeccionar',
    description: 'Unidades que requieren revisión antes de venderse.',
    to: '/admin/productos',
    action: 'Abrir inventario',
    icon: ClipboardCheck,
  },
  {
    key: 'availableUnits',
    title: 'Equipos disponibles',
    description: 'Unidades disponibles, incluso en productos no publicados.',
    to: '/admin/productos',
    action: 'Consultar productos',
    icon: PackageCheck,
  },
  {
    key: 'ordersToPrepare',
    title: 'Pedidos por preparar',
    description: 'Pedidos pagados cuya preparación no ha comenzado.',
    to: '/admin/entregas',
    action: 'Abrir entregas',
    icon: Package,
  },
  {
    key: 'ordersReady',
    title: 'Pedidos listos para entregar',
    description: 'Pedidos pagados con preparación finalizada.',
    to: '/admin/entregas',
    action: 'Consultar entregas',
    icon: Truck,
  },
] satisfies Array<{
  key: keyof DashboardSummary
  title: string
  description: string
  to: string
  action: string
  icon: typeof Package
}>

export default function AdminDashboardPage() {
  const [data, setData] = useState<DashboardSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [accessError, setAccessError] = useState(false)
  const [revision, setRevision] = useState(0)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)

  useEffect(() => {
    let active = true

    setLoading(true)
    setError('')
    setAccessError(false)

    getDashboardSummary()
      .then((result) => {
        if (!active) return

        setData(result)
        setUpdatedAt(new Date())
      })
      .catch((cause: unknown) => {
        if (!active) return

        if (
          cause instanceof ApiError &&
          (cause.status === 401 || cause.status === 403)
        ) {
          setData(null)
          setUpdatedAt(null)
          setAccessError(true)
          setError('Necesitas una sesión con permisos de administración.')
          return
        }

        setError(
          cause instanceof Error
            ? cause.message
            : 'No pudimos actualizar el resumen.',
        )
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [revision])

  return (
    <main className="admin-content operations-dashboard">
      <div className="operations-dashboard-heading">
        <div>
          <span className="eyebrow">CELU-CANJE · ADMINISTRACIÓN</span>
          <h1>Resumen de operaciones</h1>
          <p className="muted">
            Consulta las tareas pendientes de canjes, inventario y entregas.
          </p>
        </div>

        <button
          type="button"
          className="secondary-button"
          disabled={loading}
          onClick={() => setRevision((value) => value + 1)}
        >
          <RefreshCw
            size={18}
            className={loading ? 'spinner' : undefined}
            aria-hidden="true"
          />
          {loading ? 'Actualizando…' : 'Actualizar'}
        </button>
      </div>

      {error && (
        <div className="alert error" role="alert">
          <p>{error}</p>
          {accessError ? (
            <Link to="/cuenta" className="text-button">
              Ir a mi cuenta
            </Link>
          ) : data ? (
            <p>Se mantienen los datos de la última consulta correcta.</p>
          ) : null}
        </div>
      )}

      {loading && !data && (
        <p role="status">Consultando operaciones…</p>
      )}

      {data && (
        <>
          <p className="muted">
            Última consulta correcta:{' '}
            {updatedAt?.toLocaleString('es-PE', {
              timeZone: 'America/Lima',
            })}
          </p>

          <div className="operations-grid" aria-busy={loading}>
            {cards.map((card) => {
              const Icon = card.icon

              return (
                <article className="operation-card" key={card.key}>
                  <span className="operation-card-icon">
                    <Icon size={23} aria-hidden="true" />
                  </span>

                  <h2>{card.title}</h2>

                  <strong className="operation-card-value">
                    {data[card.key].toLocaleString('es-PE')}
                  </strong>

                  <p>{card.description}</p>

                  <Link to={card.to}>
                    {card.action}
                    <ArrowRight size={17} aria-hidden="true" />
                  </Link>
                </article>
              )
            })}
          </div>

          <p className="muted">
            Los conteos incluyen operaciones de prueba. Los enlaces abren
            cada módulo; sus listados mantienen sus filtros y límites actuales.
          </p>
        </>
      )}
    </main>
  )
}