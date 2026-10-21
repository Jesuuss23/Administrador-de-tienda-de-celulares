import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import ProductInventoryPanel from '../components/ProductInventoryPanel'
import type { AdminProduct } from '../lib/admin'
import { Link, useSearchParams } from 'react-router'
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
  Package,
  Plus,
  ShieldCheck,
} from 'lucide-react'

import { ApiError, getCurrentUser } from '../lib/auth'
import { createProduct, getAdminProduct, getAdminProducts,} from '../lib/admin'
import type { AdminProductPage } from '../lib/admin'

export default function AdminProductsPage() {
const [searchParams, setSearchParams] = useSearchParams()
const targetProductId = searchParams.get('productId') ?? ''

const [openingInventory, setOpeningInventory] = useState(false)
const [inventoryOpenError, setInventoryOpenError] = useState('')
const [inventoryOpenAttempt, setInventoryOpenAttempt] = useState(0)
  const [access, setAccess] = useState<
    'checking' | 'allowed' | 'login' | 'denied' | 'error'
  >('checking')
  const [accessAttempt, setAccessAttempt] = useState(0)

  const [data, setData] = useState<AdminProductPage | null>(null)
  const [page, setPage] = useState(0)
  const [refresh, setRefresh] = useState(0)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [listError, setListError] = useState('')
  const [formError, setFormError] = useState('')
  const [notice, setNotice] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [selectedProduct, setSelectedProduct] = useState<AdminProduct | null>(null)

  useEffect(() => {
    let active = true
    setAccess('checking')

    getCurrentUser()
      .then((user) => {
        if (!active) return

        if (!user) {
          setAccess('login')
        } else {
          setAccess(user.roles.includes('ADMIN') ? 'allowed' : 'denied')
        }
      })
      .catch(() => {
        if (active) setAccess('error')
      })

    return () => {
      active = false
    }
  }, [accessAttempt])

  useEffect(() => {
    if (access !== 'allowed') return

    let active = true
    setLoading(true)
    setListError('')

    getAdminProducts(page)
      .then((result) => {
        if (active) setData(result)
      })
      .catch((error: unknown) => {
        if (!active) return

        setListError(
          error instanceof ApiError
            ? error.message
            : 'No pudimos cargar los productos.',
        )
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [access, page, refresh])


useEffect(() => {
  let active = true

  setSelectedProduct(null)
  setInventoryOpenError('')
  setOpeningInventory(false)

  if (access !== 'allowed' || !targetProductId) {
    return
  }

  const validUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

  if (!validUuid.test(targetProductId)) {
    setInventoryOpenError(
      'El enlace contiene un identificador de producto no válido.',
    )
    return
  }

  setOpeningInventory(true)

  async function openRequestedProduct() {
    try {
      const product = await getAdminProduct(targetProductId)

      if (!active) return

      setSelectedProduct(product)
    } catch (cause: unknown) {
      if (!active) return

      setInventoryOpenError(
        cause instanceof Error
          ? cause.message
          : 'No pudimos abrir el inventario del producto.',
      )
    } finally {
      if (active) setOpeningInventory(false)
    }
  }

  void openRequestedProduct()

  return () => {
    active = false
  }
}, [access, targetProductId, inventoryOpenAttempt])


    function openInventory(product: AdminProduct) {
    setSearchParams((current) => {
        const next = new URLSearchParams(current)

        next.set('productId', product.id)

        // La selección manual abre el producto completo.
        next.delete('unitId')

        // Conservamos tradeInId cuando venimos a ingresar un canje.
        return next
    })

    // Permite reabrir el mismo producto después de un error.
    if (targetProductId === product.id && !selectedProduct) {
        setInventoryOpenAttempt((value) => value + 1)
    }
    }

    function closeInventory() {
    setSelectedProduct(null)
    setInventoryOpenError('')

    setSearchParams(
        (current) => {
        const next = new URLSearchParams(current)

        next.delete('productId')
        next.delete('unitId')

        return next
        },
        { replace: true },
    )
    }
  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return

    const form = event.currentTarget
    const values = new FormData(form)

    setSaving(true)
    setFormError('')
    setNotice('')
    setFieldErrors({})

    try {
      await createProduct({
        sku: String(values.get('sku') ?? ''),
        brand: String(values.get('brand') ?? ''),
        model: String(values.get('model') ?? ''),
        storageGb: Number(values.get('storageGb')),
        color: String(values.get('color') ?? ''),
        description: String(values.get('description') ?? ''),
      })

      form.reset()
      setNotice('Producto guardado como borrador.')
      setPage(0)
      setRefresh((value) => value + 1)
    } catch (error) {
      setFormError(
        error instanceof ApiError
          ? error.message
          : 'No pudimos guardar el producto.',
      )

      if (error instanceof ApiError) {
        setFieldErrors(error.fields)
      }
    } finally {
      setSaving(false)
    }
  }

  if (access !== 'allowed') {
    const messages = {
      checking: 'Comprobando tus permisos…',
      login: 'Inicia sesión con una cuenta administradora.',
      denied: 'Tu cuenta no tiene permisos de administración.',
      error: 'No pudimos comprobar tu sesión.',
    }

    return (
      <main className="status-screen">
        <div className="status-card">
          <h1>Administración</h1>
          <p role="status">{messages[access]}</p>

          {access === 'error' ? (
            <button
              className="primary-button"
              onClick={() => setAccessAttempt((value) => value + 1)}
            >
              Reintentar
            </button>
          ) : access !== 'checking' ? (
            <Link className="primary-button" to="/cuenta">
              Ir a mi cuenta
            </Link>
          ) : null}
        </div>
      </main>
    )
  }

  const totalPages = data ? Math.ceil(data.total / data.size) : 0

  return (
    <div className="admin-page">
      <header className="store-header">
        <div className="brand">
          <span className="brand-icon">
            <ShieldCheck size={23} />
          </span>
          CELU-CANJE
          <span className="badge">Administración</span>
        </div>

        <Link className="secondary-button" to="/cuenta">
          <ArrowLeft size={17} />
          Mi cuenta
        </Link>
        <Link className="secondary-button" to="/carrito">
            Mi carrito
            </Link>
            <Link className="secondary-button" to="/admin/entregas">
            Pedidos y entregas
            </Link>
            <Link to="/admin/garantias">
            Atención de garantías
            </Link>
            <Link to="/admin/canjes">
            Solicitudes de canje
            </Link>
            <Link className="secondary-button" to="/admin/resumen">
            Resumen de operaciones
            </Link>
      </header>

      <main className="admin-content">
        <div className="admin-heading">
          <span className="eyebrow">GESTIÓN DEL CATÁLOGO</span>
          <h1>Productos y variantes</h1>
        </div>

        <div className="admin-columns">
          <section className="admin-form-card">
            <div className="admin-card-title">
              <Plus size={20} />
              <h2>Nuevo producto</h2>
            </div>

            <p className="muted admin-intro">
              Registra la marca, el modelo y su variante. Las unidades
              físicas y sus precios se gestionarán por separado.
            </p>

            {notice && (
              <div className="alert success" role="status">
                {notice}
              </div>
            )}

            {formError && (
              <div className="alert error" role="alert">
                <p>{formError}</p>
                {Object.entries(fieldErrors).map(([field, message]) => (
                  <p key={field}>{message}</p>
                ))}
              </div>
            )}

            <form onSubmit={handleCreate}>
              <fieldset disabled={saving}>
                <div className="field">
                  <label htmlFor="sku">SKU</label>
                  <input
                    id="sku"
                    name="sku"
                    placeholder="SAMSUNG-S23-256-BLACK"
                    maxLength={60}
                    required
                  />
                </div>

                <div className="admin-form-row">
                  <div className="field">
                    <label htmlFor="brand">Marca</label>
                    <input
                      id="brand"
                      name="brand"
                      placeholder="Samsung"
                      maxLength={80}
                      required
                    />
                  </div>

                  <div className="field">
                    <label htmlFor="model">Modelo</label>
                    <input
                      id="model"
                      name="model"
                      placeholder="Galaxy S23"
                      maxLength={120}
                      required
                    />
                  </div>
                </div>

                <div className="admin-form-row">
                  <div className="field">
                    <label htmlFor="storageGb">Capacidad en GB</label>
                    <input
                      id="storageGb"
                      name="storageGb"
                      type="number"
                      min={1}
                      max={8192}
                      step={1}
                      placeholder="256"
                      required
                    />
                  </div>

                  <div className="field">
                    <label htmlFor="color">Color</label>
                    <input
                      id="color"
                      name="color"
                      placeholder="Negro"
                      maxLength={60}
                      required
                    />
                  </div>
                </div>

                <div className="field">
                  <label htmlFor="description">Descripción</label>
                  <textarea
                    id="description"
                    name="description"
                    rows={4}
                    maxLength={5000}
                    placeholder="Características generales del modelo"
                  />
                </div>

                <button className="primary-button" type="submit">
                  {saving ? (
                    <LoaderCircle size={18} className="spinner" />
                  ) : (
                    <Plus size={18} />
                  )}
                  {saving ? 'Guardando…' : 'Guardar borrador'}
                </button>
              </fieldset>
            </form>
          </section>

          <section className="admin-table-card">
            <div className="admin-card-title">
              <Package size={20} />
              <h2>Productos registrados</h2>
              {data && <span className="badge">{data.total}</span>}
            </div>

            {loading ? (
              <p className="admin-table-message" role="status">
                Cargando productos…
              </p>
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
            ) : !data || data.items.length === 0 ? (
              <p className="admin-table-message">
                Todavía no hay productos en esta página.
              </p>
            ) : (
              <>
                <div className="admin-table-scroll">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th scope="col">Producto</th>
                        <th scope="col">Variante</th>
                        <th scope="col">Publicación</th>
                        <th scope="col">Acciones</th>
                      </tr>
                    </thead>

                    <tbody>
                      {data.items.map((product) => (
                        <tr key={product.id}>
                          <td>
                            <strong>
                              {product.brand} {product.model}
                            </strong>
                            <small>{product.sku}</small>
                          </td>
                          <td>
                            {product.storageGb} GB
                            <small>{product.color}</small>
                          </td>
                          <td>
                            <span
                              className={
                                product.active
                                  ? 'badge admin-published'
                                  : 'badge'
                              }
                            >
                              {product.active ? 'Publicado' : 'Borrador'}
                            </span>
                          </td>
                          <td>
                            <button
                            type="button"
                            className="secondary-button"
                            disabled={openingInventory}
                            onClick={() => openInventory(product)}
                            >
                            Gestionar unidades
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
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

                    <span>{page + 1} / {totalPages}</span>

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
        </div>
            {openingInventory && (
            <div className="alert" role="status">
                <LoaderCircle
                size={18}
                className="spinner"
                aria-hidden="true"
                />
                {' '}Buscando el producto y abriendo su inventario…
            </div>
            )}

            {inventoryOpenError && (
            <div className="alert error" role="alert">
                <p>{inventoryOpenError}</p>

                <button
                type="button"
                className="text-button"
                onClick={() => setInventoryOpenAttempt((value) => value + 1)}
                >
                Reintentar apertura
                </button>

                <button
                type="button"
                className="text-button"
                onClick={closeInventory}
                >
                Cerrar aviso
                </button>
            </div>
            )}

            {selectedProduct && (
            <ProductInventoryPanel
                key={selectedProduct.id}
                product={selectedProduct}
                onClose={closeInventory}
                onChanged={() => setRefresh((value) => value + 1)}
            />
            )}
      </main>
    </div>
  )
}