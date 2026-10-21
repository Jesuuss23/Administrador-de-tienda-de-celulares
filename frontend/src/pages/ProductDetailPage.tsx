import { useEffect, useState } from 'react'
import { ApiError } from '../lib/auth'
import { addCartItem } from '../lib/cart'
import { recordProductView } from '../lib/productDemand'
import { Link, useParams, useSearchParams } from 'react-router'
import {
  ArrowLeft,
  Check,
  PackageOpen,
  Smartphone,
  UserRound,
} from 'lucide-react'

interface AvailableUnit {
  id: string
  condition: string
  sellingPrice: number
  currency: string
}

interface ProductDetail {
  id: string
  brand: string
  model: string
  storageGb: number
  color: string
  description: string | null
  imageUrl: string | null
  units: AvailableUnit[]
}

const conditionLabels: Record<string, string> = {
  NEW: 'Nuevo',
  USED: 'Usado',
  REFURBISHED: 'Reacondicionado',
}

function money(value: number, currency: string) {
  return new Intl.NumberFormat('es-PE', {
    style: 'currency',
    currency,
  }).format(value)
}

export default function ProductDetailPage() {
  const { productId } = useParams()
  const [searchParams] = useSearchParams()
  const preferredCondition = searchParams.get('condition') ?? ''

  const [product, setProduct] = useState<ProductDetail | null>(null)
  const [selectedId, setSelectedId] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notFound, setNotFound] = useState(false)
  const [imageFailed, setImageFailed] = useState(false)
  const [retry, setRetry] = useState(0)
  const [adding, setAdding] = useState(false)
  const [cartError, setCartError] = useState('')
  const [cartNotice, setCartNotice] = useState('')
  const [loginRequired, setLoginRequired] = useState(false)

  useEffect(() => {
    const controller = new AbortController()

    async function loadProduct() {
      setLoading(true)
      setError('')
      setNotFound(false)
      setProduct(null)
      setSelectedId('')
      setImageFailed(false)

      try {
        const response = await fetch(
          `/api/v1/catalog/products/${encodeURIComponent(productId ?? '')}`,
          {
            signal: controller.signal,
            credentials: 'same-origin',
            cache: 'no-store',
            headers: { Accept: 'application/json' },
          },
        )

        if (response.status === 404) {
          if (!controller.signal.aborted) {
            setNotFound(true)
          }
          return
        }

        if (!response.ok) {
          throw new Error('No se pudo consultar el producto.')
        }

        const result = (await response.json()) as ProductDetail

        if (!controller.signal.aborted) {
          setProduct(result)

          const initialUnit =
            result.units.find(
              (unit) => unit.condition === preferredCondition,
            ) ?? result.units[0]

          setSelectedId(initialUnit?.id ?? '')
          void recordProductView(result.id).catch(() => {
            // Una falla de métricas no impide mostrar ni comprar el producto.
            })
        }
      } catch {
        if (!controller.signal.aborted) {
          setError(
            'No pudimos cargar este producto. Revisa la conexión e inténtalo otra vez.',
          )
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false)
        }
      }
    }

    void loadProduct()

    return () => controller.abort()
  }, [productId, preferredCondition, retry])

  // NUEVO: limpia los mensajes del carrito al cambiar de producto
  useEffect(() => {
    setCartError('')
    setCartNotice('')
    setLoginRequired(false)
  }, [productId])

  const selectedUnit = product?.units.find(
    (unit) => unit.id === selectedId,
  )

  // NUEVO: handler para agregar al carrito
  async function handleAddToCart() {
    if (!selectedUnit || adding) return

    setAdding(true)
    setCartError('')
    setCartNotice('')
    setLoginRequired(false)

    try {
      await addCartItem(selectedUnit.id)
      setCartNotice('El equipo está en tu carrito.')
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setLoginRequired(true)
        setCartError('Inicia sesión para guardar este equipo en tu carrito.')
      } else {
        setCartError(
          error instanceof ApiError
            ? error.message
            : 'No pudimos agregar el equipo. Inténtalo otra vez.',
        )
      }
    } finally {
      setAdding(false)
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
          Volver al catálogo
        </Link>

        {loading ? (
          <div className="catalog-empty" role="status">
            Cargando el producto…
          </div>
        ) : notFound ? (
          <div className="catalog-empty">
            <PackageOpen size={40} />
            <h1>Producto no disponible</h1>
            <p>
              Puede que haya sido retirado del catálogo o que el enlace
              no sea correcto.
            </p>
            <Link className="secondary-button" to="/">
              Explorar otros equipos
            </Link>
          </div>
        ) : error ? (
          <div className="catalog-empty">
            <p role="alert">{error}</p>
            <button
              className="secondary-button"
              onClick={() => setRetry((value) => value + 1)}
            >
              Volver a intentar
            </button>
          </div>
        ) : product ? (
          <>
            <div className="product-detail-layout">
              <section
                className="detail-gallery"
                aria-label="Imagen del producto"
              >
                <span className="detail-brand-tag">{product.brand}</span>

                {product.imageUrl && !imageFailed ? (
                  <img
                    src={product.imageUrl}
                    alt={`${product.brand} ${product.model}, ${product.color}`}
                    onError={() => setImageFailed(true)}
                  />
                ) : (
                  <div className="detail-image-placeholder">
                    <Smartphone size={160} strokeWidth={1} />
                    <span>Imagen pendiente</span>
                  </div>
                )}
              </section>

              <section className="detail-information">
                <span className="eyebrow">{product.brand}</span>
                <h1>{product.model}</h1>

                <div className="detail-specs">
                  <span>{product.storageGb} GB</span>
                  <span>{product.color}</span>
                </div>

                {selectedUnit ? (
                  <div className="detail-price">
                    <span>Precio de la unidad seleccionada</span>
                    <strong>
                      {money(
                        selectedUnit.sellingPrice,
                        selectedUnit.currency,
                      )}
                    </strong>
                  </div>
                ) : (
                  <div className="alert">
                    Actualmente no hay unidades disponibles.
                  </div>
                )}

                {product.units.length > 0 && (
                  <fieldset className="unit-picker">
                    <legend>Elige tu equipo</legend>
                    <p className="muted">
                      Cada opción corresponde a una unidad física.
                    </p>

                    <div className="unit-options">
                      {product.units.map((unit, index) => (
                        <label
                          className={`unit-option ${
                            selectedId === unit.id ? 'selected' : ''
                          }`}
                          key={unit.id}
                        >
                          <input
                            type="radio"
                            name="selectedUnit"
                            value={unit.id}
                            checked={selectedId === unit.id}
                            disabled={adding}
                            onChange={() => {
                              setSelectedId(unit.id)
                              setCartError('')
                              setCartNotice('')
                              setLoginRequired(false)
                            }}
                          />

                          <div className="unit-option-info">
                            <strong>
                              {conditionLabels[unit.condition] ??
                                unit.condition}
                            </strong>
                            <span>Opción {index + 1}</span>
                          </div>

                          <strong>
                            {money(unit.sellingPrice, unit.currency)}
                          </strong>

                          {selectedId === unit.id && (
                            <Check size={18} aria-hidden="true" />
                          )}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                )}

                {selectedUnit && (
                  <div className="selection-summary" role="status">
                    <Check size={19} />
                    <div>
                      <strong>Equipo seleccionado</strong>
                      <p>
                        {conditionLabels[selectedUnit.condition]} ·{' '}
                        {product.storageGb} GB · {product.color}
                      </p>
                    </div>
                  </div>
                )}

                {/* NUEVO: botón de agregar al carrito */}
                {selectedUnit && (
                  <button
                    type="button"
                    className="primary-button detail-cart-button"
                    onClick={handleAddToCart}
                    disabled={adding}
                  >
                    {adding ? 'Agregando…' : 'Agregar al carrito'}
                  </button>
                )}

                {/* NUEVO: error del carrito con enlace a login */}
                {cartError && (
                  <div className="alert error" role="alert">
                    <p>{cartError}</p>
                    {loginRequired && (
                      <Link className="text-button" to="/cuenta">
                        Iniciar sesión
                      </Link>
                    )}
                  </div>
                )}

                {/* NUEVO: confirmación con enlace al carrito */}
                {cartNotice && (
                  <div className="alert success" role="status">
                    <p>{cartNotice}</p>
                    <Link className="text-button" to="/carrito">
                      Ver mi carrito
                    </Link>
                  </div>
                )}

                <p className="availability-note">
                  La selección no reserva el equipo. La disponibilidad
                  y el precio se comprobarán nuevamente al confirmar
                  una compra.
                </p>
              </section>
            </div>

            <section className="detail-description">
              <span className="eyebrow">CONOCE EL MODELO</span>
              <h2>Descripción del producto</h2>
              <p>
                {product.description?.trim() ||
                  'Todavía no se ha agregado una descripción para este modelo.'}
              </p>
            </section>
          </>
        ) : null}
      </main>

      <footer className="store-footer">
        CELU-CANJE · Una nueva vida para cada equipo.
      </footer>
    </div>
  )
}