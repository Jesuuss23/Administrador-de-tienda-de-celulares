import { csrfHeaders, request } from './auth'
import type { DemandPeriod } from './searchDemand'

const WINDOW_MS = 30 * 60 * 1000

interface VisitStamp {
  eventId: string
  startedAt: number
  sent: boolean
}

export interface ProductDemandItem {
  productId: string
  brand: string
  model: string
  storageGb: number
  color: string
  active: boolean
  views: number
  availableUnits: number
}

export interface ProductDemandReport {
  days: number
  totalViews: number
  productsViewed: number
  products: ProductDemandItem[]
}

const inFlight = new Map<string, Promise<void>>()

export function recordProductView(productId: string): Promise<void> {
  const existing = inFlight.get(productId)

  if (existing) return existing

  const operation = sendProductView(productId).finally(() => {
    inFlight.delete(productId)
  })

  inFlight.set(productId, operation)

  return operation
}

async function sendProductView(productId: string): Promise<void> {
  const storageKey = `celu-canje:product-view:${productId}`
  const now = Date.now()

  let stamp: VisitStamp | null = null

  try {
    const stored = sessionStorage.getItem(storageKey)

    if (stored) {
      try {
        const parsed = JSON.parse(stored) as Partial<VisitStamp>

        if (
          typeof parsed.eventId === 'string' &&
          typeof parsed.startedAt === 'number' &&
          typeof parsed.sent === 'boolean' &&
          now >= parsed.startedAt &&
          now - parsed.startedAt < WINDOW_MS
        ) {
          stamp = parsed as VisitStamp
        }
      } catch {
        // Un registro local inválido se reemplaza.
      }
    }

    if (stamp?.sent) return

    if (!stamp) {
      stamp = {
        eventId: crypto.randomUUID(),
        startedAt: now,
        sent: false,
      }
    }

    // Se guarda antes del envío para conservar la misma clave
    // si Google Chrome recarga la página o se pierde la respuesta.
    sessionStorage.setItem(storageKey, JSON.stringify(stamp))
  } catch {
    // Si el navegador bloquea el almacenamiento, omitimos la métrica.
    // La consulta del producto debe seguir funcionando.
    return
  }

  const headers = new Headers(await csrfHeaders())
  headers.set('Content-Type', 'application/json')

  await request<{ received: boolean }>(
    '/api/v1/catalog/product-view-events',
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        eventId: stamp.eventId,
        productId,
      }),
    },
  )

  try {
    sessionStorage.setItem(
      storageKey,
      JSON.stringify({ ...stamp, sent: true }),
    )
  } catch {
    // El backend ya recibió el evento.
  }
}

export function getProductDemand(
  days: DemandPeriod,
): Promise<ProductDemandReport> {
  return request(`/api/v1/admin/demand/products?days=${days}`)
}