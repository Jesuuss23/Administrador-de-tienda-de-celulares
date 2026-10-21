import { csrfHeaders, request } from './auth'

export interface CartItem {
  unitId: string
  productId: string
  brand: string
  model: string
  storageGb: number
  color: string
  condition: string
  imageUrl: string | null
  price: number
  currency: string
  available: boolean
}

export interface CartResponse {
  items: CartItem[]
  availableSubtotal: number
  currency: string
  hasUnavailableItems: boolean
}

export function getCart(): Promise<CartResponse> {
  return request('/api/v1/cart')
}

export async function addCartItem(unitId: string): Promise<CartResponse> {
  return request('/api/v1/cart/items', {
    method: 'POST',
    headers: {
      ...(await csrfHeaders()),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ unitId }),
  })
}

export async function removeCartItem(
  unitId: string,
): Promise<CartResponse> {
  return request(`/api/v1/cart/items/${unitId}`, {
    method: 'DELETE',
    headers: await csrfHeaders(),
  })
}