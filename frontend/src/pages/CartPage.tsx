import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'

import {
  ArrowLeft,
  ShoppingBag,
  Smartphone,
  Trash2,
  UserRound,
  Wallet,
} from 'lucide-react'

import { ApiError } from '../lib/auth'
import { getCart, removeCartItem } from '../lib/cart'
import type { CartItem, CartResponse } from '../lib/cart'

import {
  checkout,
  formatMoney,
  getCreditBalances,
} from '../lib/orders'

import type { CreditBalance } from '../lib/orders'

import '../styles/order-credit.css'

const conditions: Record<string, string> = {
  NEW: 'Nuevo',
  USED: 'Usado',
  REFURBISHED: 'Reacondicionado',
}

function CartImage({ item }: { item: CartItem }) {
  const [failed, setFailed] = useState(false)

  if (!item.imageUrl || failed) {
    return (
      <Smartphone
        size={45}
        strokeWidth={1.3}
        aria-hidden="true"
      />
    )
  }

  return (
    <img
      src={item.imageUrl}
      alt={`${item.brand} ${item.model}`}
      onError={() => setFailed(true)}
    />
  )
}

export default function CartPage() {
  const navigate = useNavigate()

  const [cart, setCart] = useState<CartResponse | null>(null)
  const [credits, setCredits] = useState<CreditBalance[]>([])
  const [creditId, setCreditId] = useState('')

  const [loading, setLoading] = useState(true)
  const [loginRequired, setLoginRequired] = useState(false)

  const [error, setError] = useState('')
  const [creditError, setCreditError] = useState('')
  const [notice, setNotice] = useState('')

  const [removingId, setRemovingId] = useState<string | null>(null)
  const [checkingOut, setCheckingOut] = useState(false)
  const [uncertain, setUncertain] = useState(false)
  const [refresh, setRefresh] = useState(0)

  const checkoutAttempt = useRef<{
    fingerprint: string
    requestKey: string
  } | null>(null)

  const availableCredits = credits.filter(
    (credit) =>
      credit.availableAmount > 0 &&
      credit.currency === cart?.currency,
  )

  const selectedCredit = availableCredits.find(
    (credit) => credit.id === creditId,
  )

  // Calculamos la vista previa en céntimos.
  // El backend vuelve a calcular y validar todos los importes.
  const subtotalCents = Math.round(
    (cart?.availableSubtotal ?? 0) * 100,
  )

  const balanceCents = Math.round(
    (selectedCredit?.availableAmount ?? 0) * 100,
  )

  const appliedCents = Math.min(subtotalCents, balanceCents)

  const creditApplied = appliedCents / 100
  const amountDue = (subtotalCents - appliedCents) / 100
  const creditRemaining = (balanceCents - appliedCents) / 100

  const editingDisabled =
    checkingOut ||
    Boolean(removingId) ||
    loading ||
    uncertain

  useEffect(() => {
    let active = true

    setLoading(true)
    setError('')
    setCreditError('')
    setLoginRequired(false)

    const balancesPromise = getCreditBalances().catch(() => {
      if (active) {
        setCreditError(
          'No pudimos consultar tus créditos. ' +
          'Puedes actualizar o continuar sin aplicar crédito.',
        )
      }

      return [] as CreditBalance[]
    })

    Promise.all([getCart(), balancesPromise])
      .then(([loadedCart, loadedCredits]) => {
        if (!active) return

        setCart(loadedCart)
        setCredits(loadedCredits)

        setCreditId((previous) => {
          const stillAvailable = loadedCredits.some(
            (credit) =>
              credit.id === previous &&
              credit.availableAmount > 0 &&
              credit.currency === loadedCart.currency,
          )

          return stillAvailable ? previous : ''
        })
      })
      .catch((err: unknown) => {
        if (!active) return

        setCart(null)

        if (err instanceof ApiError && err.status === 401) {
          setLoginRequired(true)
        } else {
          setError(
            err instanceof ApiError
              ? err.message
              : 'No pudimos cargar tu carrito.',
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

  function refreshCart() {
    if (editingDisabled) return

    setNotice('')
    setRefresh((value) => value + 1)
  }

  async function handleRemove(unitId: string) {
    if (editingDisabled) return

    setRemovingId(unitId)
    setError('')
    setNotice('')

    try {
      const result = await removeCartItem(unitId)

      setCart(result)
      setNotice('Equipo retirado del carrito.')
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setLoginRequired(true)
        setCart(null)
      } else {
        setError(
          err instanceof ApiError
            ? err.message
            : 'No pudimos retirar el equipo.',
        )
      }
    } finally {
      setRemovingId(null)
    }
  }

  async function handleCheckout() {
    if (
      !cart ||
      cart.items.length === 0 ||
      cart.hasUnavailableItems ||
      removingId ||
      checkingOut ||
      loading
    ) {
      return
    }

    if (creditId && !selectedCredit) {
      setError(
        'El crédito seleccionado ya no está disponible. Actualiza el carrito.',
      )
      return
    }

    const unitIds = cart.items
      .map((item) => item.unitId)
      .sort()

    const payload = {
      unitIds,
      expectedSubtotal: cart.availableSubtotal,
      creditId: selectedCredit?.id ?? null,
      expectedCreditApplied: creditApplied,
    }

    const fingerprint = JSON.stringify(payload)

    if (checkoutAttempt.current?.fingerprint !== fingerprint) {
      checkoutAttempt.current = {
        fingerprint,
        requestKey: crypto.randomUUID(),
      }
    }

    setCheckingOut(true)
    setError('')
    setNotice('')

    try {
      const order = await checkout({
        requestKey: checkoutAttempt.current.requestKey,
        ...payload,
      })

      setUncertain(false)
      navigate(`/pedidos/${order.id}`)
    } catch (err) {
      // Ante un resultado incierto, conservamos los datos y la clave
      // para que el usuario pueda reintentar la misma solicitud.
      setUncertain(
        !(err instanceof ApiError) || err.status >= 500,
      )

      if (err instanceof ApiError && err.status === 401) {
        setLoginRequired(true)
        setCart(null)
      } else {
        setError(
          err instanceof ApiError
            ? err.message
            : 'No pudimos confirmar el resultado. ' +
              'Reintenta con los mismos datos o revisa Mis pedidos.',
        )
      }
    } finally {
      setCheckingOut(false)
    }
  }

  return (
    <div className="store-page">
      <header className="store-header">
        <Link to="/" className="brand">
          <span className="brand-icon">
            <Smartphone size={24} />
          </span>
          CELU-CANJE
        </Link>

        <Link className="secondary-button" to="/cuenta">
          <UserRound size={17} />
          Mi cuenta
        </Link>
      </header>

      <main className="store-content">
        <Link className="detail-back" to="/">
          <ArrowLeft size={17} />
          Seguir explorando
        </Link>

        <div className="cart-heading">
          <span className="eyebrow">
            TU PRÓXIMA RENOVACIÓN
          </span>

          <h1>Mi carrito</h1>

          <p className="muted">
            Revisa tus equipos y aplica el crédito de tu canje.
          </p>
        </div>

        {notice && (
          <div className="alert success" role="status">
            {notice}
          </div>
        )}

        {error && (
          <div className="alert error" role="alert">
            <p>{error}</p>

            <button
              type="button"
              className="text-button"
              disabled={editingDisabled}
              onClick={refreshCart}
            >
              Actualizar carrito
            </button>
          </div>
        )}

        {uncertain && (
          <div className="alert error" role="alert">
            <p>
              La respuesta de la compra no se confirmó.
              Puedes reintentar con los mismos datos.
              Si sales de esta página, revisa Mis pedidos
              antes de iniciar otra compra.
            </p>

            <Link className="text-button" to="/pedidos">
              Revisar mis pedidos
            </Link>
          </div>
        )}

        {loading ? (
          <div className="catalog-empty" role="status">
            Cargando tu carrito…
          </div>
        ) : loginRequired ? (
          <div className="catalog-empty">
            <UserRound size={36} />

            <h2>Tu carrito te espera</h2>

            <p>
              Inicia sesión para consultar tus equipos y créditos.
            </p>

            <Link className="secondary-button" to="/cuenta">
              Iniciar sesión
            </Link>
          </div>
        ) : cart && cart.items.length === 0 ? (
          <div className="catalog-empty">
            <ShoppingBag size={40} />

            <h2>Tu carrito está vacío</h2>

            <p>
              Explora el catálogo y encuentra tu próximo celular.
            </p>

            <Link className="secondary-button" to="/">
              Explorar equipos
            </Link>
          </div>
        ) : cart ? (
          <div className="cart-layout">
            <section
              className="cart-items"
              aria-label="Equipos del carrito"
            >
              {cart.items.map((item, index) => (
                <article
                  className="cart-item"
                  key={item.unitId}
                >
                  <div className="cart-item-image">
                    <CartImage
                      key={`${item.unitId}-${item.imageUrl}`}
                      item={item}
                    />
                  </div>

                  <div className="cart-item-information">
                    <span className="product-brand">
                      {item.brand}
                    </span>

                    <h2>
                      <Link to={`/productos/${item.productId}`}>
                        {item.model}
                      </Link>
                    </h2>

                    <p>
                      {item.storageGb} GB · {item.color}
                    </p>

                    <span className="badge">
                      {conditions[item.condition] ?? item.condition}
                    </span>

                    <small>
                      Equipo {index + 1} · Cantidad: 1
                    </small>

                    {!item.available && (
                      <p className="cart-unavailable">
                        Este equipo ya no está disponible.
                      </p>
                    )}
                  </div>

                  <div className="cart-item-actions">
                    <strong>
                      {formatMoney(item.price, item.currency)}
                    </strong>

                    <button
                      type="button"
                      className="cart-remove-button"
                      disabled={editingDisabled}
                      onClick={() => handleRemove(item.unitId)}
                      aria-label={
                        `Retirar ${item.brand} ${item.model}, ` +
                        `equipo ${index + 1}`
                      }
                    >
                      <Trash2 size={16} />

                      {removingId === item.unitId
                        ? 'Retirando…'
                        : 'Retirar'}
                    </button>
                  </div>
                </article>
              ))}
            </section>

            <aside className="cart-summary">
              <h2>Resumen del carrito</h2>

              <div className="cart-summary-line">
                <span>Equipos guardados</span>
                <strong>{cart.items.length}</strong>
              </div>

              <div className="cart-summary-line">
                <span>Disponibles</span>
                <strong>
                  {cart.items.filter((item) => item.available).length}
                </strong>
              </div>

              <div className="cart-summary-line">
                <span>Subtotal disponible</span>
                <strong>
                  {formatMoney(
                    cart.availableSubtotal,
                    cart.currency,
                  )}
                </strong>
              </div>

              <div className="credit-box">
                <div className="credit-box-heading">
                  <Wallet size={20} aria-hidden="true" />

                  <label htmlFor="checkout-credit">
                    Tu crédito de canje
                  </label>
                </div>

                <select
                  id="checkout-credit"
                  value={creditId}
                  disabled={editingDisabled}
                  onChange={(event) => {
                    setCreditId(event.target.value)
                    setError('')
                  }}
                >
                  <option value="">
                    Comprar sin aplicar crédito
                  </option>

                  {availableCredits.map((credit) => (
                    <option
                      key={credit.id}
                      value={credit.id}
                    >
                      {formatMoney(
                        credit.availableAmount,
                        credit.currency,
                      )}
                      {' disponibles · '}
                      {credit.id.slice(0, 8)}
                    </option>
                  ))}
                </select>

                {creditError && (
                  <p role="status">{creditError}</p>
                )}

                {!creditError && availableCredits.length === 0 && (
                  <p>
                    No tienes saldo de canje disponible para esta compra.
                  </p>
                )}

                {selectedCredit && (
                  <>
                    <div className="cart-summary-line">
                      <span>Crédito aplicado</span>
                      <strong className="credit-applied-value">
                        −{formatMoney(creditApplied, cart.currency)}
                      </strong>
                    </div>

                    <div className="cart-summary-line">
                      <span>Saldo que conservarás</span>
                      <strong>
                        {formatMoney(creditRemaining, cart.currency)}
                      </strong>
                    </div>

                    <p>
                      Aplicaremos el crédito necesario para esta compra.
                      El saldo restante quedará disponible.
                    </p>

                    <span className="credit-test-label">
                      OPERACIÓN DE PRUEBA · TEST
                    </span>
                  </>
                )}
              </div>

              <div
                className="credit-payment-total"
                aria-live="polite"
              >
                <span>Diferencia por pagar</span>

                <strong>
                  {formatMoney(amountDue, cart.currency)}
                </strong>
              </div>

              {cart.hasUnavailableItems && (
                <div className="alert error">
                  Retira los equipos no disponibles para continuar.
                  No se incluyen en el subtotal.
                </div>
              )}

              <button
                type="button"
                className="primary-button checkout-button"
                onClick={handleCheckout}
                disabled={
                  checkingOut ||
                  Boolean(removingId) ||
                  loading ||
                  cart.hasUnavailableItems ||
                  cart.items.length === 0
                }
              >
                {checkingOut
                  ? 'Confirmando…'
                  : uncertain
                    ? 'Reintentar confirmación'
                    : amountDue === 0
                      ? 'Confirmar compra con crédito'
                      : 'Confirmar y reservar'}
              </button>

              <p className="cart-summary-note">
                {amountDue === 0
                  ? 'Al confirmar se utilizará el crédito aplicado y el pedido quedará pagado en modo TEST. No se realizará ningún cobro monetario.'
                  : 'Al confirmar reservaremos los equipos y el crédito seleccionado. Después pagarás únicamente la diferencia.'}
              </p>

              <Link className="text-button" to="/pedidos">
                Ver mis pedidos
              </Link>

              <p className="cart-summary-note">
                Los precios y el saldo se validan al confirmar.
                Guardar un equipo en el carrito todavía no lo reserva.
              </p>

              <button
                type="button"
                className="secondary-button"
                disabled={editingDisabled}
                onClick={refreshCart}
              >
                Actualizar disponibilidad y saldo
              </button>
            </aside>
          </div>
        ) : null}
      </main>
    </div>
  )
}