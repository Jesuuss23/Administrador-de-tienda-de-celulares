import { csrfHeaders, request } from './auth'

export interface InventoryUnit {
  id: string
  internalCode: string
  condition: string
  status: string
  acquisitionCost: number
  sellingPrice: number
  currency: string
  imei: string | null
  conditionNotes: string | null
  createdAt: string
}

export interface CreateUnitInput {
  internalCode: string
  condition: string
  acquisitionCost: string
  sellingPrice: string
  imei: string
  conditionNotes: string
}

async function post<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, {
    method: 'POST',
    headers: {
      ...(await csrfHeaders()),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
}

export function getUnits(productId: string): Promise<InventoryUnit[]> {
  return request(`/api/v1/admin/products/${productId}/units`)
}

export function createUnit(
  productId: string,
  input: CreateUnitInput,
): Promise<{ id: string }> {
  return post(`/api/v1/admin/products/${productId}/units`, input)
}

export function approveInspection(
  unitId: string,
  notes: string,
  confirmed: boolean,
): Promise<{ message: string }> {
  return post(`/api/v1/admin/units/${unitId}/approve-inspection`, {
    notes,
    confirmed,
  })
}

export function setPublication(
  productId: string,
  active: boolean,
): Promise<{ message: string }> {
  return post(`/api/v1/admin/products/${productId}/publication`, {
    active,
  })
}
export interface CreateTradeInUnitInput {
  productId: string
  internalCode: string
  sellingPrice: string
  conditionNotes: string
}

export interface TradeInUnitResult {
  unitId: string
  productId: string
  tradeInId: string
  status: string
  created: boolean
}

export function createUnitFromTradeIn(
  tradeInId: string,
  input: CreateTradeInUnitInput,
): Promise<TradeInUnitResult> {
  return post(
    `/api/v1/admin/trade-ins/${encodeURIComponent(tradeInId)}/inventory-unit`,
    input,
  )
}
export interface TradeInInventoryStatus {
  tradeInId: string
  confirmedAmount: number | null
  currency: string | null
  creditStatus: string | null
  unitId: string | null
  productId: string | null
  internalCode: string | null
  unitStatus: string | null
  acquisitionCost: number | null
  eligible: boolean
  reason: string | null
}

export const inventoryStatusLabels: Record<string, string> = {
  PENDING_INSPECTION: 'Pendiente de inspección',
  REFURBISHING: 'En acondicionamiento',
  AVAILABLE: 'Disponible para venta',
  RESERVED: 'Reservado',
  SOLD: 'Vendido',
  WRITTEN_OFF: 'Dado de baja',
}

export function getTradeInInventoryStatus(
  tradeInId: string,
): Promise<TradeInInventoryStatus> {
  return request(
    `/api/v1/admin/trade-ins/${encodeURIComponent(tradeInId)}/inventory-status`,
  )
}

export function getTradeInInventoryStatuses(
  tradeInIds: string[],
): Promise<TradeInInventoryStatus[]> {
  const ids = [...new Set(tradeInIds)]

  if (ids.length === 0) return Promise.resolve([])

  if (ids.length > 100) {
    return Promise.reject(
      new Error('Se pueden consultar hasta 100 canjes por petición.'),
    )
  }

  const params = new URLSearchParams({
    ids: ids.join(','),
  })

  return request(
    `/api/v1/admin/trade-ins/inventory-status?${params.toString()}`,
  )
}
export function getUnit(
  productId: string,
  unitId: string,
): Promise<InventoryUnit> {
  return request(
    `/api/v1/admin/products/${encodeURIComponent(productId)}` +
      `/units/${encodeURIComponent(unitId)}`,
  )
}