import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import {
  ArrowLeft,
  BarChart3,
  RefreshCw,
  Search,
  SearchX,
} from 'lucide-react'

import { ApiError } from '../lib/auth'
import { getSearchDemand } from '../lib/searchDemand'
import AdminProductDemandPanel from '../components/AdminProductDemandPanel'

import type {
  DemandPeriod,
  SearchDemandReport,
} from '../lib/searchDemand'

import '../styles/admin-demand.css'

const periods: DemandPeriod[] = [7, 30, 90]

const conditionLabels: Record<string, string> = {
  ALL: 'Todas',
  NEW: 'Nuevo',
  USED: 'Usado',
  REFURBISHED: 'Reacondicionado',
}

const numberFormat = new Intl.NumberFormat('es-PE')

export default function AdminDemandPage() {
  const [days, setDays] = useState<DemandPeriod>(30)
  const [report, setReport] = useState<SearchDemandReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [accessStatus, setAccessStatus] = useState<number | null>(null)
  const [revision, setRevision] = useState(0)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)

  useEffect(() => {
    let active = true

    setLoading(true)
    setError('')
    setAccessStatus(null)
    setReport(null)
    setUpdatedAt(null)

    getSearchDemand(days)
      .then((result) => {
        if (!active) return

        setReport(result)
        setUpdatedAt(new Date())
      })
      .catch((cause: unknown) => {
        if (!active) return

        if (
          cause instanceof ApiError &&
          (cause.status === 401 || cause.status === 403)
        ) {
          setAccessStatus(cause.status)
        }

        setError(
          cause instanceof Error
            ? cause.message
            : 'No pudimos consultar el reporte de demanda.',
        )
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [days, revision])

  const withoutResultsRate =
    report && report.totalSearches > 0
      ? (report.searchesWithoutResults / report.totalSearches) * 100
      : null

  const highestCount = Math.max(
    1,
    ...(report?.topTerms.map((item) => item.searches) ?? []),
  )

  return (
    <div className="store-page">
      <main className="store-content demand-page">
        <Link className="detail-back" to="/admin/resumen">
          <ArrowLeft size={17} aria-hidden="true" />
          Resumen administrativo
        </Link>

        <header className="demand-heading">
          <div>
            <span className="eyebrow">INTERÉS EN EL CATÁLOGO</span>
            <h1>Demanda de celulares</h1>
            <p>
              Consulta qué buscan los visitantes y qué búsquedas no
              encuentran opciones.
            </p>
          </div>

          <button
            type="button"
            className="secondary-button"
            disabled={loading}
            onClick={() => setRevision((value) => value + 1)}
          >
            <RefreshCw size={17} aria-hidden="true" />
            {loading ? 'Consultando…' : 'Actualizar'}
          </button>
        </header>

        <div className="demand-toolbar">
          <div className="demand-periods" role="group" aria-label="Período">
            {periods.map((period) => (
              <button
                key={period}
                type="button"
                aria-pressed={days === period}
                className={days === period ? 'is-active' : ''}
                onClick={() => setDays(period)}
              >
                {period} días
              </button>
            ))}
          </div>

          {updatedAt && !loading && (
            <span className="demand-muted">
              Consultado a las{' '}
              {updatedAt.toLocaleTimeString('es-PE', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          )}
        </div>

        {loading ? (
          <div className="catalog-empty" role="status">
            Preparando el reporte…
          </div>
        ) : error ? (
          <div className="alert error" role="alert">
            <p>
              {accessStatus === 401
                ? 'Inicia sesión como administrador para consultar la demanda.'
                : accessStatus === 403
                  ? 'Tu cuenta no tiene permiso para consultar este reporte.'
                  : error}
            </p>

            {accessStatus === 401 && (
              <Link className="secondary-button" to="/cuenta">
                Iniciar sesión
              </Link>
            )}

            {accessStatus === null && (
              <button
                type="button"
                className="text-button"
                onClick={() => setRevision((value) => value + 1)}
              >
                Volver a consultar
              </button>
            )}
          </div>
        ) : report ? (
          <>
            <section className="demand-metrics" aria-label="Indicadores">
              <article className="demand-metric">
                <span className="demand-metric-icon">
                  <Search size={22} aria-hidden="true" />
                </span>
                <span>Búsquedas registradas</span>
                <strong>
                  {numberFormat.format(report.totalSearches)}
                </strong>
                <small>Durante los últimos {report.days} días</small>
              </article>

              <article className="demand-metric">
                <span className="demand-metric-icon warning">
                  <SearchX size={22} aria-hidden="true" />
                </span>
                <span>Sin resultados</span>
                <strong>
                  {numberFormat.format(report.searchesWithoutResults)}
                </strong>
                <small>El catálogo devolvió cero opciones</small>
              </article>

              <article className="demand-metric">
                <span className="demand-metric-icon">
                  <BarChart3 size={22} aria-hidden="true" />
                </span>
                <span>Porcentaje sin resultados</span>
                <strong>
                  {withoutResultsRate === null
                    ? '—'
                    : `${withoutResultsRate.toLocaleString('es-PE', {
                        minimumFractionDigits: 1,
                        maximumFractionDigits: 1,
                      })}%`}
                </strong>
                <small>
                  {withoutResultsRate === null
                    ? 'Todavía no hay búsquedas para calcularlo'
                    : 'Respecto del total de búsquedas registradas'}
                </small>
              </article>
            </section>

            <section className="demand-ranking">
              <div className="demand-ranking-heading">
                <div>
                  <h2>Búsquedas más frecuentes</h2>
                  <p>
                    Hasta 20 combinaciones de término y condición del equipo.
                  </p>
                </div>
              </div>

              {report.topTerms.length === 0 ? (
                <div className="catalog-empty">
                  <Search size={32} aria-hidden="true" />
                  <h3>Aún no hay búsquedas en este período</h3>
                  <p>
                    Los registros aparecerán cuando se utilice el buscador
                    del catálogo.
                  </p>
                  <Link className="secondary-button" to="/">
                    Abrir catálogo
                  </Link>
                </div>
              ) : (
                <div
                  className="demand-table-scroll"
                  role="region"
                  aria-label="Tabla de búsquedas"
                  tabIndex={0}
                >
                  <table className="demand-table">
                    <caption>
                      Búsquedas registradas durante los últimos{' '}
                      {report.days} días
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col">Término buscado</th>
                        <th scope="col">Condición</th>
                        <th scope="col">Búsquedas</th>
                        <th scope="col">Sin resultados</th>
                        <th scope="col">% sin resultados</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.topTerms.map((item) => {
                        const percentage =
                          item.searches > 0
                            ? (item.withoutResults / item.searches) * 100
                            : 0

                        return (
                          <tr key={`${item.condition}:${item.term}`}>
                            <th scope="row">
                              <span className="demand-term">
                                {item.term}
                              </span>
                              <div
                                className="demand-bar"
                                aria-hidden="true"
                              >
                                <span
                                  style={{
                                    width: `${
                                      (item.searches / highestCount) * 100
                                    }%`,
                                  }}
                                />
                              </div>
                            </th>
                            <td>
                              <span className="badge">
                                {conditionLabels[item.condition] ??
                                  item.condition}
                              </span>
                            </td>
                            <td>{numberFormat.format(item.searches)}</td>
                            <td>
                              {numberFormat.format(item.withoutResults)}
                            </td>
                            <td>
                              {percentage.toLocaleString('es-PE', {
                                maximumFractionDigits: 1,
                              })}
                              %
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
            <AdminProductDemandPanel
            days={days}
            revision={revision}
            />
            <aside className="demand-note">
              <strong>Cómo interpretar estos datos</strong>
              <p>
                Son eventos reportados por el navegador, no personas únicas
                ni ventas. Una búsqueda sin resultados puede deberse a
                disponibilidad, filtros o al texto introducido; conviene
                revisar el catálogo antes de decidir una compra de stock.
              </p>
              <p>
                Los indicadores superiores incluyen todos los eventos del
                período. La tabla muestra únicamente las 20 combinaciones
                más frecuentes.
              </p>
            </aside>
          </>
        ) : null}
      </main>
    </div>
  )
}