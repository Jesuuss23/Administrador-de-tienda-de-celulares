export interface User {
  id: string
  fullName: string
  email: string
  emailVerified: boolean
  roles: string[]
  createdAt: string
}

interface CsrfResponse {
  headerName: string
  token: string
}

interface ApiProblem {
  message?: string
  detail?: string
  errors?: Record<string, string>
}

interface RegisterInput {
  fullName: string
  email: string
  password: string
}

export class ApiError extends Error {
  readonly status: number
  readonly fields: Record<string, string>

  constructor(
    message: string,
    status: number,
    fields: Record<string, string> = {},
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.fields = fields
  }
}

export async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers)
  headers.set('Accept', 'application/json')

  const response = await fetch(path, {
    ...options,
    headers,
    credentials: 'same-origin',
    cache: 'no-store',
  })

  const text = await response.text()
  let data: unknown = null

  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      throw new ApiError(
        'El servidor no devolvió una respuesta válida. Comprueba el backend.',
        response.status,
      )
    }
  }

  if (!response.ok) {
    const problem = (data ?? {}) as ApiProblem

    throw new ApiError(
      problem.detail ??
        problem.message ??
        'No se pudo completar la solicitud.',
      response.status,
      problem.errors ?? {},
    )
  }

  return data as T
}

export async function csrfHeaders(): Promise<Record<string, string>> {
  const csrf = await request<CsrfResponse>('/api/v1/auth/csrf')

  return {
    [csrf.headerName]: csrf.token,
  }
}

export async function getCurrentUser(): Promise<User | null> {
  try {
    return await request<User>('/api/v1/auth/me')
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      return null
    }

    throw error
  }
}

export async function register(input: RegisterInput): Promise<User> {
  return request<User>('/api/v1/auth/register', {
    method: 'POST',
    headers: {
      ...(await csrfHeaders()),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  })
}

export async function login(
  email: string,
  password: string,
): Promise<User> {
  await request<{ message: string }>('/api/v1/auth/login', {
    method: 'POST',
    headers: {
      ...(await csrfHeaders()),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ email, password }),
  })

  const user = await getCurrentUser()

  if (!user) {
    throw new Error('No se pudo recuperar la sesión iniciada.')
  }

  return user
}

export async function logout(): Promise<void> {
  await request<{ message: string }>('/api/v1/auth/logout', {
    method: 'POST',
    headers: await csrfHeaders(),
  })
}