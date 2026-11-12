import type { Cell, EntryResult, HistoryFilters, Occupancy, Ticket, User, VehicleLookup, VehicleType } from '../domain/parking'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'
const TOKEN_KEY = 'parqueate.token'
const CELLS_STORAGE_KEY = 'parqueate.module2.cells'
const USERS_STORAGE_KEY = 'parqueate.module2.users'

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
const put = <T,>(path: string, data: unknown) => request<T>(path, { method: 'PUT', body: JSON.stringify(data) })
const patch = <T,>(path: string, data: unknown) => request<T>(path, { method: 'PATCH', body: JSON.stringify(data) })
const del = <T,>(path: string) => request<T>(path, { method: 'DELETE' })

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

export type UserStatus = 'Activo' | 'Inactivo'
export type CellStatus = 'Libre' | 'Ocupada' | 'Fuera de servicio'

export type UserVehicle = {
  id: number
  placa: string
  tipo: VehicleType
  marca: string
  color: string
  estado: UserStatus
  tieneEntradaAbierta?: boolean
  celdaOcupada?: string | null
}

export type AuditEntry = {
  id: number
  fecha: string
  usuario: string
  campo: string
  valorAnterior: string
  valorNuevo: string
  motivo?: string | null
  placa?: string | null
}

export type UserRecord = {
  id: number
  documentoTipo: 'CC' | 'CE' | 'TI' | 'PAS'
  documento: string
  nombres: string
  apellidos: string
  celular: string
  correo: string
  estado: UserStatus
  fechaRegistro: string
  operario: string
  autorizacionHabeasData: boolean
  tieneEntradaAbierta?: boolean
  vehiculos: UserVehicle[]
  auditLogs: AuditEntry[]
}

export type CellRecord = {
  id: number
  codigo: string
  tipo: VehicleType
  estado: CellStatus
  placa: string | null
  hora: string | null
  motivo: string | null
  historial: Array<{ id: number; momento: string; usuario: string; accion: string; motivo: string }>
}

export type UserModuleVehicle = {
  id?: number
  placa: string
  tipo: 'Carro' | 'Moto'
  marca: string
  color: string
  estado: 'Activo' | 'Inactivo'
}

export type UserModuleUser = {
  id: number
  documento: string
  nombres: string
  apellidos: string
  estado: 'Activo' | 'Inactivo'
  celular: string
  correo: string
  autorizacionHabeasData: boolean
  fechaRegistro: string
  operario: string
  vehiculos: UserModuleVehicle[]
}

export type ParkingCell = {
  id: number
  codigo: string
  tipo: 'Carro' | 'Moto'
  estado: 'Libre' | 'Ocupada' | 'Fuera de servicio'
  placa: string | null
  hora: string | null
  motivo: string | null
  historial: Array<{
    id: string
    fecha: string
    usuario: string
    accion: string
    motivo: string
  }>
}

// ============================================================================
// ENDPOINTS REALES DEL MÓDULO 2 (USUARIOS Y CELDAS)
// ============================================================================

export const getModule2Users = () => request<UserRecord[]>('/api/usuarios')

export const createModule2User = (data: {
  documentoTipo: UserRecord['documentoTipo']
  documento: string
  nombres: string
  apellidos: string
  celular: string
  correo: string
  tipo: VehicleType
  placa: string
  marca: string
  color: string
  autorizacionHabeasData: boolean
}) => post<UserRecord>('/api/usuarios', data)

export const updateModule2User = (
  id: number,
  data: {
    celular: string
    correo: string
    id_vehiculo?: number | null
    placa_vehiculo?: string
    marca?: string
    color?: string
  },
) => put<UserRecord>(`/api/usuarios/${id}`, data)

export const addModule2Vehicle = (
  userId: number,
  data: { placa: string; tipo: VehicleType; marca: string; color: string },
) => post<UserRecord>(`/api/usuarios/${userId}/vehiculos`, data)

export const toggleModule2UserStatus = (
  userId: number,
  data: { estado?: UserStatus; motivo: string },
) => patch<UserRecord>(`/api/usuarios/${userId}/estado`, data)

export const toggleModule2VehicleStatus = (
  placa: string,
  data: { estado?: UserStatus; motivo: string },
) => patch<UserRecord>(`/api/vehiculos/${encodeURIComponent(placa)}/estado`, data)

export const deleteModule2Vehicle = (placa: string) =>
  del<UserRecord>(`/api/vehiculos/${encodeURIComponent(placa)}`)

export const deleteModule2User = (userId: number) =>
  del<{ id: number; eliminado: boolean; detalle: string }>(`/api/usuarios/${userId}`)

export const getModule2Cells = () => request<CellRecord[]>('/api/celdas')

export const initializeModule2Cells = () => post<CellRecord[]>('/api/celdas/inicializar', {})

export const createModule2Cell = (data: { codigo: string; tipo: VehicleType }) =>
  post<CellRecord>('/api/celdas', data)

export const updateModule2Cell = (
  codigo: string,
  data: { estado?: 'Libre' | 'Fuera de servicio'; tipo?: VehicleType; motivo: string },
) => patch<CellRecord>(`/api/celdas/${encodeURIComponent(codigo)}`, data)

export const deleteModule2Cell = (codigo: string) =>
  del<{ codigo: string; eliminado: boolean; detalle: string }>(`/api/celdas/${encodeURIComponent(codigo)}`)

// Helpers de respaldo local
export function loadStoredCells(): CellRecord[] {
  try {
    const raw = localStorage.getItem(CELLS_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveStoredCells(cells: CellRecord[]): void {
  try {
    localStorage.setItem(CELLS_STORAGE_KEY, JSON.stringify(cells))
  } catch {
    // Si localStorage no está disponible, se mantiene en memoria.
  }
}

export function loadStoredUsers(): UserRecord[] {
  try {
    const raw = localStorage.getItem(USERS_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveStoredUsers(users: UserRecord[]): void {
  try {
    localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users))
  } catch {
    // Si localStorage no está disponible, se mantiene en memoria.
  }
}

export function syncCellsWithTickets(cells: CellRecord[], openTickets: Ticket[]): CellRecord[] {
  if (cells.length === 0) return cells
  return cells.map((cell) => {
    const ticket = openTickets.find((t) => t.numero_espacio === cell.codigo)
    if (ticket) {
      const horaIngreso = new Date(ticket.fecha_hora_entrada).toLocaleTimeString('es-CO', {
        hour: '2-digit',
        minute: '2-digit',
      })
      return {
        ...cell,
        estado: 'Ocupada' as const,
        placa: ticket.placa,
        hora: horaIngreso,
      }
    }
    if (cell.estado === 'Ocupada') {
      return {
        ...cell,
        estado: 'Libre' as const,
        placa: null,
        hora: null,
      }
    }
    return cell
  })
}

export function buildInitialCells(operatorName: string, openTickets: Ticket[] = []): CellRecord[] {
  const nowIso = new Date().toISOString()
  const baseCells: CellRecord[] = []
  for (let i = 1; i <= 70; i += 1) {
    const codigo = `C-${String(i).padStart(2, '0')}`
    baseCells.push({
      id: i,
      codigo,
      tipo: 'Carro',
      estado: 'Libre',
      placa: null,
      hora: null,
      motivo: null,
      historial: [{ id: Date.now() + i, momento: nowIso, usuario: operatorName, accion: 'Configuración inicial', motivo: 'Celda creada y habilitada.' }],
    })
  }
  for (let i = 1; i <= 10; i += 1) {
    const codigo = `M-${String(i).padStart(2, '0')}`
    baseCells.push({
      id: 100 + i,
      codigo,
      tipo: 'Moto',
      estado: 'Libre',
      placa: null,
      hora: null,
      motivo: null,
      historial: [{ id: Date.now() + 100 + i, momento: nowIso, usuario: operatorName, accion: 'Configuración inicial', motivo: 'Celda creada y habilitada.' }],
    })
  }
  return syncCellsWithTickets(baseCells, openTickets)
}
