import { csrfHeaders, request } from './auth'

export interface VisualCriterion {
  code: 'FRONT' | 'BACK' | 'LEFT' | 'RIGHT'
  label: string
  weight: number
}

export interface VisualPolicy {
  id: string
  name: string
  version: number
  instructions: string
  criteria: VisualCriterion[]
  active: boolean
  createdAt: string
}

export interface VisualPolicyPage {
  active: VisualPolicy | null
  history: VisualPolicy[]
}

export interface SaveVisualPolicyInput {
  expectedActiveId: string
  name: string
  instructions: string
  weights: {
    front: number
    back: number
    left: number
    right: number
  }
}

const path = '/api/v1/admin/ai/visual-policies'

export function getVisualPolicies(): Promise<VisualPolicyPage> {
  return request(path)
}

export async function saveVisualPolicy(
  input: SaveVisualPolicyInput,
): Promise<VisualPolicy> {
  const headers = new Headers(await csrfHeaders())
  headers.set('Content-Type', 'application/json')

  return request(path, {
    method: 'POST',
    headers,
    body: JSON.stringify(input),
  })
}