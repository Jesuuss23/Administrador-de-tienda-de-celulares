import { csrfHeaders, request } from './auth'

export interface VisualAngle {
  angle: 'FRONT' | 'BACK' | 'LEFT' | 'RIGHT'
  evaluable: boolean
  severity: number
  confidence: 'LOW' | 'MEDIUM' | 'HIGH'
  observations: string
}

export interface AppliedVisualPolicy {
  id: string
  name: string
  version: number
  instructions: string
  criteria: {
    code: string
    label: string
    weight: number
  }[]
}

export interface VisualAnalysis {
  id: string
  requestKey: string
  status: 'QUEUED' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED'
  model: string
  aestheticScore: number | null
  errorMessage: string | null
  createdAt: string
  policySnapshot: AppliedVisualPolicy | null
  result: {
    provider: string
    requestedModel: string
    modelVersion: string
    summary: string
    angles: VisualAngle[]
  } | null
}

function path(tradeInId: string): string {
  return `/api/v1/admin/trade-ins/${encodeURIComponent(tradeInId)}/visual-analyses`
}

export function getVisualAnalyses(
  tradeInId: string,
): Promise<VisualAnalysis[]> {
  return request(path(tradeInId))
}

export async function analyzeTradeInPhotos(
  tradeInId: string,
  requestKey: string,
): Promise<VisualAnalysis> {
  const headers = new Headers(await csrfHeaders())
  headers.set('Content-Type', 'application/json')

  return request(path(tradeInId), {
    method: 'POST',
    headers,
    body: JSON.stringify({ requestKey }),
  })
}
export interface VisualEvidencePhoto {
  angle: string
  sha256: string
  imageUrl: string
}

export function getVisualEvidencePhotos(
  tradeInId: string,
  analysisId: string,
): Promise<VisualEvidencePhoto[]> {
  return request(
    `/api/v1/admin/trade-ins/${encodeURIComponent(tradeInId)}` +
      `/visual-analyses/${encodeURIComponent(analysisId)}/photos`,
  )
}