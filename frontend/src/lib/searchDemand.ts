import { csrfHeaders, request } from './auth'

export interface SearchDemandEvent {
  eventId: string
  searchTerm: string
  condition: string
  reportedResultCount: number
}

export async function recordCatalogSearch(
  input: SearchDemandEvent,
): Promise<void> {
  const headers = new Headers(await csrfHeaders())
  headers.set('Content-Type', 'application/json')

  await request<{ received: boolean }>('/api/v1/catalog/search-events', {
    method: 'POST',
    headers,
    body: JSON.stringify(input),
  })
}
export type DemandPeriod = 7 | 30 | 90

export interface SearchDemandTerm {
  term: string
  condition: string
  searches: number
  withoutResults: number
}

export interface SearchDemandReport {
  days: number
  totalSearches: number
  searchesWithoutResults: number
  topTerms: SearchDemandTerm[]
}

export function getSearchDemand(
  days: DemandPeriod,
): Promise<SearchDemandReport> {
  return request(`/api/v1/admin/demand/searches?days=${days}`)
}