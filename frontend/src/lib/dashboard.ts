import { request } from './auth'

export interface DashboardSummary {
  tradeInsToReview: number
  tradeInsToStock: number
  unitsToInspect: number
  availableUnits: number
  ordersToPrepare: number
  ordersReady: number
}

export function getDashboardSummary(): Promise<DashboardSummary> {
  return request('/api/v1/admin/dashboard')
}