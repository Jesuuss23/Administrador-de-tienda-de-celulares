import { csrfHeaders, request } from './auth'

export type VisualReviewDecision =
  | 'AGREE'
  | 'DISAGREE'
  | 'NEEDS_MORE_EVIDENCE'

export interface VisualReview {
  id: string
  analysisId: string
  requestKey: string
  decision: VisualReviewDecision
  notes: string
  reviewedBy: string
  reviewerName: string
  reviewedAt: string
}

export interface VisualReviewResponse {
  review: VisualReview | null
}

export interface SaveVisualReviewInput {
  requestKey: string
  decision: VisualReviewDecision
  notes: string
}

export const reviewDecisionLabels: Record<VisualReviewDecision, string> = {
  AGREE: 'Coincido con el informe',
  DISAGREE: 'Discrepo del informe',
  NEEDS_MORE_EVIDENCE: 'Necesito más evidencia',
}

function path(tradeInId: string, analysisId: string): string {
  return (
    `/api/v1/admin/trade-ins/${encodeURIComponent(tradeInId)}` +
    `/visual-analyses/${encodeURIComponent(analysisId)}/review`
  )
}

export function getVisualReview(
  tradeInId: string,
  analysisId: string,
): Promise<VisualReviewResponse> {
  return request(path(tradeInId, analysisId))
}

export async function saveVisualReview(
  tradeInId: string,
  analysisId: string,
  input: SaveVisualReviewInput,
): Promise<VisualReviewResponse> {
  const headers = new Headers(await csrfHeaders())
  headers.set('Content-Type', 'application/json')

  return request(path(tradeInId, analysisId), {
    method: 'POST',
    headers,
    body: JSON.stringify(input),
  })
}