import { useEffect, useRef, useState } from 'react'
import { recordCatalogSearch } from '../lib/searchDemand'
import type { FormEvent } from 'react'
import { Link } from 'react-router'
import {
  ArrowRight,
  ArrowRightLeft,
  ChevronLeft,
  ChevronRight,
  Search,
  Smartphone,
  UserRound,
} from 'lucide-react'

interface CatalogItem {
  id: string
  brand: string
  model: string
  storageGb: number
  color: string
  imageUrl: string | null
  condition: string
  priceFrom: number
  currency: string
  availableUnits: number
}

interface CatalogResponse {
  items: CatalogItem[]
  page: number
  size: number
  total: number
}
interface SearchIntent {
  eventId: string
  term: string
  condition: string
}
const conditionLabels: Record<string, string> = {
  NEW: 'Nuevo',
  USED: 'Usado',
  REFURBISHED: 'Reacondicionado',
}

function ProductImage({ item }: { item: CatalogItem }) {
  const [failed, setFailed] = useState(false)

  if (!item.imageUrl || failed) {
    return <Smartphone size={76} strokeWidth={1.2} aria-hidden="true" />
  }

  return (
    <img
      src={item.imageUrl}
      alt={`${item.brand} ${item.model}, ${item.color}`}
      onError={() => setFailed(true)}
      loading="lazy"
    />
  )
}

export default function CatalogPage() {
  const [searchIntent, setSearchIntent] = useState<SearchIntent | null>(null)
  const recordedSearchId = useRef<string | null>(null)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [condition, setCondition] = useState('')
  const [page, setPage] = useState(0)
  const [data, setData] = useState<CatalogResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    const controller = new AbortController()

    async function loadProducts() {
      setLoading(true)
      setError('')

      const params = new URLSearchParams({
        search,
        condition,
        page: String(page),
        size: '12',
      })

      try {
        const response = await fetch(`/api/v1/catalog/products?${params}`, {
          signal: controller.signal,
          credentials: 'same-origin',
          cache: 'no-store',
          headers: { Accept: 'application/json' },
        })

        if (!response.ok) {
          throw new Error('No se pudo consultar el catálogo.')
        }

        const result = (await response.json()) as CatalogResponse

        if (!controller.signal.aborted) {
        setData(result)

        const shouldRecord =
            page === 0 &&
            searchIntent !== null &&
            searchIntent.term === search &&
            searchIntent.condition === condition &&
            recordedSearchId.current !== searchIntent.eventId

        if (shouldRecord && searchIntent) {
            recordedSearchId.current = searchIntent.eventId

            void recordCatalogSearch({
            eventId: searchIntent.eventId,
            searchTerm: searchIntent.term,
            condition: searchIntent.condition || 'ALL',
            reportedResultCount: result.total,
            }).catch(() => {
            // Una falla de métricas no debe impedir consultar el catálogo.
            // No se reenvía automáticamente.
            })
        }
        }
      } catch {
        if (!controller.signal.aborted) {
          setError(
            'No pudimos cargar los equipos. Comprueba la conexión e inténtalo otra vez.',
          )
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false)
        }
      }
    }

    void loadProducts()

    return () => controller.abort()
  }, [search, condition, page, retry, searchIntent])

    function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (loading) return

    const term = searchInput.trim().replace(/\s+/g, ' ')

    setPage(0)
    setSearch(term)

    setSearchIntent(
        term
        ? {
            eventId: crypto.randomUUID(),
            term,
            condition,
            }
        : null,
    )
    }

  const totalPages = data ? Math.ceil(data.total / data.size) : 0

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
        <section className="catalog-hero">
          <div>
            <span className="brand-tag">TU PRÓXIMO PASO</span>
            <h1>Encuentra tu próximo celular.</h1>
            <p>
              Explora equipos nuevos, usados y reacondicionados.
              Una nueva historia empieza con una buena elección.
            </p>

            <a className="hero-link" href="#equipos">
              Explorar catálogo
              <ArrowRight size={18} />
            </a>
          </div>

          <div className="hero-symbol" aria-hidden="true">
            <Smartphone size={112} strokeWidth={1} />
            <span>
              <ArrowRightLeft size={24} />
            </span>
          </div>
        </section>

        <section id="equipos" className="catalog-section">
          <div className="catalog-heading">
            <div>
              <span className="eyebrow">EXPLORA EL CATÁLOGO</span>
              <h2>Equipos disponibles</h2>
            </div>

            {!loading && !error && data && (
              <span className="muted">
                {data.total} {data.total === 1 ? 'opción' : 'opciones'}
              </span>
            )}
          </div>

          <form className="catalog-filters" onSubmit={handleSearch}>
            <div className="catalog-search">
              <Search size={19} aria-hidden="true" />

              <input
                aria-label="Buscar por marca, modelo o color"
                placeholder="Busca por marca, modelo o color"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                maxLength={100}
              />
            </div>

            <select
              aria-label="Condición del equipo"
              value={condition}
              onChange={(event) => {
                setSearchIntent(null)
                setCondition(event.target.value)
                setPage(0)
              }}
            >
              <option value="">Todas las condiciones</option>
              <option value="NEW">Nuevos</option>
              <option value="USED">Usados</option>
              <option value="REFURBISHED">Reacondicionados</option>
            </select>

            <button
            className="primary-button search-button"
            type="submit"
            disabled={loading}
            >
            Buscar
            </button>
          </form>

          {loading ? (
            <div className="catalog-empty" role="status">
              Consultando equipos…
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
          ) : !data || data.items.length === 0 ? (
            <div className="catalog-empty">
              <span className="empty-symbol">
                <Smartphone size={34} />
              </span>
              <h3>
                {search || condition
                  ? 'No encontramos equipos con esos filtros'
                  : 'Estamos preparando nuestro catálogo'}
              </h3>
              <p>
                {search || condition
                  ? 'Prueba con otra búsqueda o cambia la condición.'
                  : 'Los equipos aparecerán aquí cuando estén publicados y disponibles.'}
              </p>

              {(search || condition || page > 0) && (
                <button
                  className="secondary-button"
                    onClick={() => {
                    setSearchIntent(null)
                    setSearchInput('')
                    setSearch('')
                    setCondition('')
                    setPage(0)
                    }}
                >
                  Ver todos
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="product-grid">
                {data.items.map((item) => (
                  <article
                    className="product-card"
                    key={`${item.id}-${item.condition}`}
                  >
                    <div className="product-visual">
                      <span className="product-condition">
                        {conditionLabels[item.condition] ?? item.condition}
                      </span>

                      <ProductImage
                        key={`${item.id}-${item.imageUrl}`}
                        item={item}
                      />
                    </div>

                    <div className="product-info">
                      <span className="product-brand">{item.brand}</span>
                      <h3>{item.model}</h3>
                      <p>{item.storageGb} GB · {item.color}</p>

                      <div className="product-price">
                        <span>Desde</span>
                        <strong>
                          {new Intl.NumberFormat('es-PE', {
                            style: 'currency',
                            currency: item.currency,
                          }).format(item.priceFrom)}
                        </strong>
                      </div>

                      <span className="availability">
                        {item.availableUnits}{' '}
                        {item.availableUnits === 1
                          ? 'unidad disponible'
                          : 'unidades disponibles'}
                      </span>
                      <Link
                        className="product-detail-link"
                        to={`/productos/${item.id}?condition=${encodeURIComponent(item.condition)}`}
                        >
                        Ver equipo
                        <ArrowRight size={17} />
                        </Link>
                    </div>
                  </article>
                ))}
              </div>

              {totalPages > 1 && (
                <nav className="catalog-pagination" aria-label="Paginación">
                  <button
                    className="secondary-button"
                    disabled={page === 0}
                    onClick={() => setPage((value) => value - 1)}
                    aria-label="Página anterior"
                  >
                    <ChevronLeft size={18} />
                  </button>

                  <span>Página {page + 1} de {totalPages}</span>

                  <button
                    className="secondary-button"
                    disabled={page + 1 >= totalPages}
                    onClick={() => setPage((value) => value + 1)}
                    aria-label="Página siguiente"
                  >
                    <ChevronRight size={18} />
                  </button>
                </nav>
              )}
            </>
          )}
        </section>
      </main>

      <footer className="store-footer">
        CELU-CANJE · Una nueva vida para cada equipo.
      </footer>
    </div>
  )
}