import { useEffect, useState } from 'react'
import { Link } from 'react-router'

import {
  ArrowLeft,
  RefreshCw,
  ShoppingBag,
  Wallet,
} from 'lucide-react'

import { ApiError } from '../lib/auth'
import {
  formatMoney,
  getCreditBalances,
} from '../lib/orders'

import type { CreditBalance } from '../lib/orders'

import '../styles/credit-balance.css'

const statusLabels: Record<string, string> = {
  AVAILABLE: 'Con saldo disponible',
  RESERVED: 'Saldo reservado',
  USED: 'Crédito utilizado',
}

export default function CreditBalancePage() {
  const [credits, setCredits] = useState<CreditBalance[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [loginRequired, setLoginRequired] = useState(false)
  const [refresh, setRefresh] = useState(0)

  useEffect(() => {
    let active = true

    setLoading(true)
    setError('')
    setLoginRequired(false)
    setCredits([])

    getCreditBalances()
      .then((result) => {
        if (active) setCredits(result)
      })
      .catch((err: unknown) => {
        if (!active) return

        if (err instanceof ApiError && err.status === 401) {
          setLoginRequired(true)
        } else {
          setError(
            err instanceof ApiError
              ? err.message
              : 'No pudimos consultar tus créditos.',
          )
        }
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [refresh])

  // Agrupamos por moneda para no sumar importes de monedas distintas.
  const totals = credits.reduce<
    Record<
      string,
      {
        available: number
        reserved: number
        used: number
      }
    >
  >((result, credit) => {
    const current = result[credit.currency] ?? {
      available: 0,
      reserved: 0,
      used: 0,
    }

    current.available += Math.round(credit.availableAmount * 100)
    current.reserved += Math.round(credit.reservedAmount * 100)
    current.used += Math.round(credit.usedAmount * 100)

    result[credit.currency] = current

    return result
  }, {})

  return (
    <div className="store-page">
      <main className="store-content">
        <Link className="detail-back" to="/cuenta">
          <ArrowLeft size={17} />
          Mi cuenta
        </Link>

        <div className="credit-page-heading">
          <div>
            <span className="eyebrow">
              EL VALOR DE TU RENOVACIÓN
            </span>

            <h1>Mis créditos</h1>

            <p className="muted">
              Consulta el saldo de tus canjes y úsalo
              en tu próxima compra.
            </p>
          </div>

          <button
            type="button"
            className="secondary-button"
            disabled={loading}
            onClick={() => setRefresh((value) => value + 1)}
          >
            <RefreshCw size={17} />
            {loading ? 'Actualizando…' : 'Actualizar saldo'}
          </button>
        </div>

        {loading ? (
          <div className="catalog-empty" role="status">
            Consultando tus créditos…
          </div>
        ) : loginRequired ? (
          <div className="catalog-empty">
            <Wallet size={40} />

            <h2>Inicia sesión para consultar tu saldo</h2>

            <Link className="secondary-button" to="/cuenta">
              Iniciar sesión
            </Link>
          </div>
        ) : error ? (
          <div className="alert error" role="alert">
            <p>{error}</p>

            <button
              type="button"
              className="text-button"
              onClick={() => setRefresh((value) => value + 1)}
            >
              Volver a consultar
            </button>
          </div>
        ) : credits.length === 0 ? (
          <div className="catalog-empty">
            <Wallet size={42} />

            <h2>Todavía no tienes créditos registrados</h2>

            <p>
              Cuando se confirme tu canje, podrás consultar
              aquí el crédito emitido.
            </p>

            <Link className="secondary-button" to="/cuenta">
              Volver a mi cuenta
            </Link>
          </div>
        ) : (
          <>
            {Object.entries(totals).map(([currency, total]) => (
              <section
                key={currency}
                className="credit-overview"
                aria-label={`Resumen de créditos en ${currency}`}
              >
                <article className="credit-metric credit-metric-main">
                  <Wallet size={25} aria-hidden="true" />
                  <span>Disponible para comprar</span>

                  <strong>
                    {formatMoney(total.available / 100, currency)}
                  </strong>
                </article>

                <article className="credit-metric">
                  <span>Reservado en pedidos</span>

                  <strong>
                    {formatMoney(total.reserved / 100, currency)}
                  </strong>

                  <small>
                    Se libera si el pedido vence o se cancela.
                  </small>
                </article>

                <article className="credit-metric">
                  <span>Utilizado en compras</span>

                  <strong>
                    {formatMoney(total.used / 100, currency)}
                  </strong>

                  <small>
                    Crédito consumido en pedidos completados.
                  </small>
                </article>
              </section>
            ))}

            <div className="credit-page-note">
              <p>
                Al comprar podrás seleccionar un crédito.
                Aplicaremos el importe necesario y conservarás
                el saldo restante.
              </p>

              <Link className="secondary-button" to="/">
                <ShoppingBag size={17} />
                Explorar equipos
              </Link>
            </div>

            <section
              className="credit-card-grid"
              aria-label="Detalle de tus créditos"
            >
              {credits.map((credit) => (
                <article className="credit-card" key={credit.id}>
                  <div className="credit-card-heading">
                    <div>
                      <span className="eyebrow">
                        CRÉDITO DE CANJE
                      </span>

                      <h2>{credit.id.slice(0, 8).toUpperCase()}</h2>
                    </div>

                    <span className="badge">
                      {statusLabels[credit.status] ?? credit.status}
                    </span>
                  </div>

                  <dl className="credit-breakdown">
                    <div>
                      <dt>Importe original</dt>
                      <dd>
                        {formatMoney(credit.amount, credit.currency)}
                      </dd>
                    </div>

                    <div>
                      <dt>Reservado</dt>
                      <dd>
                        {formatMoney(
                          credit.reservedAmount,
                          credit.currency,
                        )}
                      </dd>
                    </div>

                    <div>
                      <dt>Utilizado</dt>
                      <dd>
                        {formatMoney(
                          credit.usedAmount,
                          credit.currency,
                        )}
                      </dd>
                    </div>

                    <div className="credit-balance-row">
                      <dt>Disponible</dt>
                      <dd>
                        {formatMoney(
                          credit.availableAmount,
                          credit.currency,
                        )}
                      </dd>
                    </div>
                  </dl>
                </article>
              ))}
            </section>
          </>
        )}
      </main>
    </div>
  )
}