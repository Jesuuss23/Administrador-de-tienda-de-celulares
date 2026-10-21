import { csrfHeaders, request } from './auth'

export const fulfillmentLabels: Record<string, string> = {
  AWAITING_PAYMENT: 'Pendiente de pago',
  PENDING: 'Pendiente de preparación',
  PREPARING: 'En preparación',
  READY: 'Listo para entregar',
  DELIVERED: 'Entregado',
}

export interface AdminFulfillment {
  orderId: string
  orderNumber: number
  customerName: string
  customerEmail: string
  totalAmount: number
  currency: string
  status: string
  recipientName: string | null
  deliveryReference: string | null
  deliveredAt: string | null
  testPayment: boolean
}

export interface CustomerFulfillment {
  orderId: string
  status: string
  recipientName: string | null
  deliveredAt: string | null
}

export interface FulfillmentUpdate {
  action: 'PREPARE' | 'READY' | 'DELIVER'
  recipientName?: string
  deliveryReference?: string
  confirmed?: boolean
}

export function getAdminFulfillments(): Promise<AdminFulfillment[]> {
  return request('/api/v1/admin/fulfillments')
}

export async function updateFulfillment(
  orderId: string,
  input: FulfillmentUpdate,
): Promise<{ message: string }> {
  return request(`/api/v1/admin/fulfillments/${orderId}`, {
    method: 'POST',
    headers: {
      ...(await csrfHeaders()),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  })
}

export function getCustomerFulfillment(
  orderId: string,
): Promise<CustomerFulfillment> {
  return request(`/api/v1/orders/${orderId}/fulfillment`)
}