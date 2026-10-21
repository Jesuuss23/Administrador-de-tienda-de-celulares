import { csrfHeaders, request } from './auth'

export interface OrderSummary {
  id: string
  orderNumber: number
  status: string
  totalAmount: number
  currency: string
  expiresAt: string
  createdAt: string
  creditId: string | null
  creditApplied: number
  amountDue: number
  settlementEnvironment: 'TEST' | 'LIVE' | null
}

export interface OrderItem {
  unitId: string
  productName: string
  storageGb: number
  color: string
  condition: string
  unitPrice: number
}

export interface Order extends OrderSummary {
  items: OrderItem[]
}

export interface CheckoutInput {
  requestKey: string
  unitIds: string[]
  expectedSubtotal: number
  creditId?: string | null
  expectedCreditApplied?: number
}

export interface CreditBalance {
  id: string
  amount: number
  reservedAmount: number
  usedAmount: number
  availableAmount: number
  currency: string
  status: string
}

export const orderStatusLabels: Record<string, string> = {
  PENDING_PAYMENT: 'Pendiente de pago',
  PAID: 'Pagado',
  EXPIRED: 'Reserva vencida',
  CANCELLED: 'Cancelado',
}

export function getOrders(): Promise<OrderSummary[]> {
  return request('/api/v1/orders')
}

export function getOrder(orderId: string): Promise<Order> {
  return request(`/api/v1/orders/${orderId}`)
}

export function getCreditBalances(): Promise<CreditBalance[]> {
  return request('/api/v1/orders/credit-balances')
}

export async function checkout(input: CheckoutInput): Promise<Order> {
  return request('/api/v1/orders/checkout', {
    method: 'POST',
    headers: {
      ...(await csrfHeaders()),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  })
}

export function formatMoney(
  value: number,
  currency: string,
): string {
  return new Intl.NumberFormat('es-PE', {
    style: 'currency',
    currency,
  }).format(value)
}
export async function cancelPendingOrder(
  orderId: string,
): Promise<Order> {
  return request(`/api/v1/orders/${orderId}/cancel-pending`, {
    method: 'POST',
    headers: {
      ...(await csrfHeaders()),
    },
  })
}