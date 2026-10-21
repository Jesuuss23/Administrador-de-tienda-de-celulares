import { csrfHeaders, request } from './auth'

export interface AdminProduct {
  id: string
  sku: string
  brand: string
  model: string
  storageGb: number
  color: string
  active: boolean
  createdAt: string
}

export interface AdminProductPage {
  items: AdminProduct[]
  page: number
  size: number
  total: number
}

export interface CreateProductInput {
  sku: string
  brand: string
  model: string
  storageGb: number
  color: string
  description: string
}

export function getAdminProducts(page = 0): Promise<AdminProductPage> {
  return request<AdminProductPage>(
    `/api/v1/admin/products?page=${page}&size=10`,
  )
}

export async function createProduct(
  input: CreateProductInput,
): Promise<{ id: string; message: string }> {
  return request('/api/v1/admin/products', {
    method: 'POST',
    headers: {
      ...(await csrfHeaders()),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  })
}
export function getAdminProduct(
  productId: string,
): Promise<AdminProduct> {
  return request<AdminProduct>(
    `/api/v1/admin/products/${encodeURIComponent(productId)}`,
  )
}