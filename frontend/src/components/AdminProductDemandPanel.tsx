import { useEffect, useState } from 'react'
import { Link } from 'react-router'

import { getProductDemand } from '../lib/productDemand'
import type { ProductDemandReport } from '../lib/productDemand'
import type { DemandPeriod } from '../lib/searchDemand'

interface Props {
  days: DemandPeriod
  revision: number
}

const numbers = new Intl.NumberFormat('es-PE')

export default function AdminProductDemandPanel({
  days,
  revision,
}: Props) {
  const [report, setReport] = useState<ProductDemandReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    let active = true

    setLoading(true)
    setError('')
    setReport(null)

    getProductDemand(days)
      .then((result) => {
        if (active) setReport(result)
      })
      .catch((cause: unknown) => {
        if (!active) return

        setError(
          cause instanceof Error
            ? cause.message
            : 'No pudimos consultar las visitas a productos.',
        )
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [days, revision, retry])

  return (
    <section className="demand-ranking demand-products">
      <div className="demand-ranking-heading">
        <h2>Productos más visitados</h2>
        <p>
          Visitas registradas en los últimos {days} días.
          El stock corresponde a la disponibilidad actual.
        </p>
      </div>

      {loading ? (
        <div className="catalog-empty" role="status">
          Consultando visitas…
        </div>
      ) : error ? (
        <div className="alert error" role="alert">
          <p>{error}</p>
          <button
            type="button"
            className="text-button"
            onClick={() => setRetry((value) => value + 1)}
          >
            Volver a consultar
          </button>
        </div>
      ) : report ? (
        <>
          <div className="demand-product-summary">
            <span>
              <strong>{numbers.format(report.totalViews)}</strong>{' '}
              visitas registradas
            </span>
            <span>
              <strong>{numbers.format(report.productsViewed)}</strong>{' '}
              productos diferentes visitados
            </span>
          </div>

          {report.products.length === 0 ? (
            <div className="catalog-empty">
              Todavía no hay visitas registradas en este período.
            </div>
          ) : (
            <div
              className="demand-table-scroll"
              role="region"
              aria-label="Productos más visitados"
              tabIndex={0}
            >
              <table className="demand-table">
                <caption>
                  Hasta 20 productos, ordenados por visitas.
                  Se incluyen las visitas de prueba.
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Producto</th>
                    <th scope="col">Visitas</th>
                    <th scope="col">Stock disponible</th>
                    <th scope="col">Publicación</th>
                    <th scope="col">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {report.products.map((item) => (
                    <tr key={item.productId}>
                      <th scope="row">
                        <span className="demand-term">
                          {item.brand} {item.model}
                        </span>
                        <small className="demand-muted">
                          {item.storageGb} GB · {item.color}
                        </small>
                      </th>
                      <td>{numbers.format(item.views)}</td>
                      <td>
                        <span
                          className={
                            item.availableUnits === 0
                              ? 'demand-stock-empty'
                              : ''
                          }
                        >
                          {numbers.format(item.availableUnits)}
                        </span>
                      </td>
                      <td>
                        {item.active ? 'Publicado' : 'No publicado'}
                      </td>
                      <td>
                        <Link
                          className="text-button"
                          to={
                            '/admin/productos?productId=' +
                            encodeURIComponent(item.productId)
                          }
                        >
                          Ver inventario
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="demand-product-note">
            El registro limita repeticiones del mismo producto en una
            pestaña durante 30 minutos. No representa personas únicas
            ni confirma intención de compra.
          </p>
        </>
      ) : null}
    </section>
  )
}