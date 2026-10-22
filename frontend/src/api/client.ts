import type { Cell, EntryResult, HistoryFilters, Occupancy, Ticket, User, VehicleLookup, VehicleType } from '../domain/parking'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'
const TOKEN_KEY = 'parqueate.token'

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

export const getToken = () => {
  try {
    return sessionStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

const setToken = (token: string | null) => {
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token)
    else sessionStorage.removeItem(TOKEN_KEY)
  } catch {
    // Sin almacenamiento disponible la sesión dura lo que la pestaña abierta.
  }
}

// Se llama cuando el token vence o es inválido para devolver al operario a la pantalla de login.
let onUnauthorized: () => void = () => {}
export const setUnauthorizedHandler = (handler: () => void) => { onUnauthorized = handler }

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken()
  let response: Response
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: {
        ...(init.body && !(init.body instanceof URLSearchParams) ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
    })
  } catch {
    throw new ApiError(0, 'No hay conexión con el servidor')
  }

  const body = response.status === 204 ? null : await response.json().catch(() => null)
  if (!response.ok) {
    if (response.status === 401 && token) {
      setToken(null)
      onUnauthorized()
    }
    const detail = typeof body?.detail === 'string' ? body.detail : 'No se pudo completar la operación'
    throw new ApiError(response.status, detail)
  }
  return body as T
}

const post = <T,>(path: string, data: unknown) => request<T>(path, { method: 'POST', body: JSON.stringify(data) })

export async function login(correo: string, contrasena: string): Promise<User> {
  const form = new URLSearchParams({ username: correo, password: contrasena })
  const { access_token } = await request<{ access_token: string }>('/auth/token', { method: 'POST', body: form })
  setToken(access_token)
  return getMe()
}

export const logout = () => setToken(null)

export const checkHealth = () => request<{ status: string }>('/')
export const getMe = () => request<User>('/api/usuarios/me')
export const lookupVehicle = (placa: string) => request<VehicleLookup>(`/api/vehiculos/${encodeURIComponent(placa)}`)
export const getFreeCells = (tipo: VehicleType) => request<Cell[]>(`/api/espacios?estado=Disponible&tipo_permitido=${tipo}`)
export const getOccupancy = () => request<Occupancy[]>('/api/ocupacion')
export const getInside = () => request<Ticket[]>('/api/tiquetes?abiertos=true')

export function getHistory(filters: HistoryFilters) {
  const params = new URLSearchParams()
  if (filters.desde) params.set('desde', filters.desde)
  if (filters.hasta) params.set('hasta', filters.hasta)
  const query = params.toString()
  return request<Ticket[]>(`/api/tiquetes${query ? `?${query}` : ''}`)
}

export const registerEntry = (placa: string, novedad: string | null, id_espacio: number | null) =>
  post<EntryResult>('/api/tiquetes/entrada', { placa, novedad, id_espacio })

export const registerExit = (placa: string, novedad: string | null) =>
  post<Ticket>('/api/tiquetes/salida', { placa, novedad })

export const annulTicket = (id: number, motivo: string) => post<Ticket>(`/api/tiquetes/${id}/anular`, { motivo })
