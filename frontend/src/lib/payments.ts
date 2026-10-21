import { csrfHeaders, request } from './auth'

export type TestOutcome = 'APPROVED' | 'DECLINED'

export interface PaymentAttempt {
  id: string
  orderId: string
  environment: 'TEST' | 'LIVE'
  status: TestOutcome
  amount: number
  currency: string
  createdAt: string
}

export function getPaymentAttempts(
  orderId: string,
): Promise<PaymentAttempt[]> {
  return request(`/api/v1/orders/${orderId}/test-payments`)
}

export async function simulatePayment(
  orderId: string,
  requestKey: string,
  outcome: TestOutcome,
): Promise<PaymentAttempt> {
  return request(`/api/v1/orders/${orderId}/test-payments`, {
    method: 'POST',
    headers: {
      ...(await csrfHeaders()),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ requestKey, outcome }),
  })
}