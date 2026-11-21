import type { Cell, EntryResult, HistoryFilters, Occupancy, Ticket, User, VehicleLookup, VehicleType } from '../domain/parking'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'
const TOKEN_KEY = 'parqueate.token'
const CELLS_STORAGE_KEY = 'parqueate.module2.cells'
const USERS_STORAGE_KEY = 'parqueate.module2.users'
const PAYMENTS_STORAGE_KEY = 'parqueate.module3.payments'
const TARIFFS_STORAGE_KEY = 'parqueate.module3.tariffs'

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
const del = <T,>(path: string, data?: unknown) =>
  request<T>(path, data === undefined ? { method: 'DELETE' } : { method: 'DELETE', body: JSON.stringify(data) })

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
  // Celdas resultantes de una conversión: espacio original donde están (p. ej. "C-20" o "M-05 y M-06").
  id_conversion?: number | null
  espacio_original?: string | null
  tipo_original?: VehicleType | null
  // Moto original: código de su pareja fija (M-05 -> M-06); null si no puede convertirse a carro.
  pareja?: string | null
  // Conteo real de mensualidades vigentes ("Al día" + "Por vencer") para el tipo de esta celda (RN-P05/RN-C05).
  mensualidades_vigentes?: number | null
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

// HU-U08: solo administrador, con motivo obligatorio; se rechaza si el vehículo tiene movimientos.
export const deleteModule2Vehicle = (placa: string, motivo: string) =>
  del<UserRecord>(`/api/vehiculos/${encodeURIComponent(placa)}`, { motivo })

// HU-U08: solo administrador, con motivo obligatorio; se rechaza si sus vehículos tienen movimientos.
export const deleteModule2User = (userId: number, motivo: string) =>
  del<{ id: number; detail: string }>(`/api/usuarios/${userId}`, { motivo })

export const getModule2Cells = () => request<CellRecord[]>('/api/celdas')

export const initializeModule2Cells = () => post<CellRecord[]>('/api/celdas/inicializar', {})

export const createModule2Cell = (data: { codigo: string; tipo: VehicleType }) =>
  post<CellRecord>('/api/celdas', data)

export const updateModule2Cell = (
  codigo: string,
  data: { estado?: 'Libre' | 'Fuera de servicio'; motivo: string },
) => patch<CellRecord>(`/api/celdas/${encodeURIComponent(codigo)}`, data)

// Convierte una celda de carro en 2 de moto, o la pareja de una moto original en 1 de carro. Devuelve el mapa completo.
export const convertModule2Cell = (codigo: string, motivo: string) =>
  post<CellRecord[]>(`/api/celdas/${encodeURIComponent(codigo)}/convertir`, { motivo })

// Deshace la conversión a la que pertenece la celda. Devuelve el mapa completo.
export const restoreModule2Cell = (codigo: string, motivo: string) =>
  post<CellRecord[]>(`/api/celdas/${encodeURIComponent(codigo)}/restablecer`, { motivo })

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

// ============================================================================
// MÓDULO 3: GESTIÓN DE PAGOS DE MENSUALIDADES Y TARIFAS (HU-P01 a HU-P12)
// ============================================================================

export type PaymentMethod = 'Efectivo'
export type PaymentStatus = 'Registrado' | 'Anulado'
export type SubscriptionState = 'Al día' | 'Por vencer' | 'Vencida' | 'Sin mensualidad'

export type PaymentRecord = {
  id: number
  consecutivo: string
  userId: number
  documentoTipo: UserRecord['documentoTipo']
  documento: string
  nombreTitular: string
  celularTitular: string
  placa: string
  tipoVehiculo: VehicleType
  marcaVehiculo: string
  colorVehiculo: string
  meses: 1 | 2 | 3
  tarifaMensualAplicada: number
  totalPagado: number
  fechaInicio: string // YYYY-MM-DD
  fechaVencimiento: string // YYYY-MM-DD (vence 23:59)
  fechaVencimientoAnterior: string | null
  formaPago: PaymentMethod
  valorRecibidoEfectivo: number | null
  cambioDevueltoEfectivo: number | null
  referenciaPago: string | null
  fechaHoraPago: string // ISO string
  operario: string
  estado: PaymentStatus
  motivoAnulacion: string | null
  usuarioAnulacion: string | null
  fechaHoraAnulacion: string | null
  esUltimoActivo?: boolean
}

export type PlateSubscriptionStatusOut = {
  placa: string
  tipo_vehiculo: VehicleType
  estado: 'Vigente' | 'Por vencer' | 'Vencida' | 'Sin mensualidad'
  estado_ui: SubscriptionState
  fecha_inicio_vigencia: string | null
  fecha_fin_vigencia: string | null
  dias_restantes: number | null
  dias_mora: number
  usuario_activo: boolean
  vehiculo_activo: boolean
  puede_ingresar: boolean
}

export type ExpiringItemOut = {
  id_propietario: number
  userId: number
  documentoTipo: UserRecord['documentoTipo']
  documento: string
  nombreTitular: string
  celularTitular: string
  placa: string
  tipoVehiculo: VehicleType
  marcaVehiculo: string
  colorVehiculo: string
  fechaInicio: string
  fechaVencimiento: string
  estado: 'Por vencer' | 'Vencida'
  diasRestantes: number
  diasMora: number
}

export type CashboxSummaryOut = {
  fecha: string
  operario_filtro: string
  total_recaudado_cop: number
  cantidad_pagos_validos: number
  cantidad_pagos_anulados: number
  total_anulado_cop: number
  por_metodo_pago: Array<{ metodo: PaymentMethod; cantidad: number; total_cop: number }>
  por_tipo_vehiculo: Array<{ tipo: VehicleType; cantidad: number; total_cop: number }>
  operarios_disponibles: string[]
}

export type CollectionReportOut = {
  fecha_inicio: string
  fecha_fin: string
  total_recaudado_cop: number
  cantidad_pagos_validos: number
  ticket_promedio_cop: number
  cantidad_pagos_anulados: number
  total_anulado_cop: number
  por_dia: Array<{ fecha: string; cantidad: number; total_cop: number }>
  por_tipo_vehiculo: Array<{ tipo: VehicleType; cantidad: number; total_cop: number }>
  por_metodo_pago: Array<{ metodo: PaymentMethod; cantidad: number; total_cop: number }>
  por_operario: Array<{ operario: string; cantidad: number; total_cop: number }>
  pagos: PaymentRecord[]
}

export const getModule3PlateStatus = (placa: string) =>
  request<PlateSubscriptionStatusOut>(`/api/pagos/estado/${encodeURIComponent(placa)}`)

export function getModule3Payments(filters?: {
  q?: string
  fecha_desde?: string
  fecha_hasta?: string
  metodo_pago?: string
  estado?: string
}) {
  const params = new URLSearchParams()
  if (filters?.q) params.set('q', filters.q)
  if (filters?.fecha_desde) params.set('fecha_desde', filters.fecha_desde)
  if (filters?.fecha_hasta) params.set('fecha_hasta', filters.fecha_hasta)
  if (filters?.metodo_pago && filters.metodo_pago !== 'Todas') params.set('metodo_pago', filters.metodo_pago)
  if (filters?.estado && filters.estado !== 'Todos') params.set('estado', filters.estado)
  const qs = params.toString()
  return request<PaymentRecord[]>(`/api/pagos${qs ? `?${qs}` : ''}`)
}

export const createModule3Payment = (data: {
  placa: string
  meses_pagados: 1 | 2 | 3
  metodo_pago: PaymentMethod
  valor_recibido_cop?: number | null
  referencia_pago?: string | null
}) => post<PaymentRecord>('/api/pagos', data)

export const annulModule3Payment = (id: number, motivo: string) =>
  patch<PaymentRecord>(`/api/pagos/${id}/anular`, { motivo })

export function getModule3Expiring(filters?: {
  estado?: string
  tipo_vehiculo?: string
  q?: string
}) {
  const params = new URLSearchParams()
  if (filters?.estado && filters.estado !== 'Todas') params.set('estado', filters.estado)
  if (filters?.tipo_vehiculo && filters.tipo_vehiculo !== 'Todos') params.set('tipo_vehiculo', filters.tipo_vehiculo)
  if (filters?.q) params.set('q', filters.q)
  const qs = params.toString()
  return request<ExpiringItemOut[]>(`/api/pagos/vencimientos${qs ? `?${qs}` : ''}`)
}

export function getModule3Cashbox(operario?: string) {
  const params = new URLSearchParams()
  if (operario && operario !== 'Todos') params.set('operario', operario)
  const qs = params.toString()
  return request<CashboxSummaryOut>(`/api/pagos/caja${qs ? `?${qs}` : ''}`)
}

export function getModule3Report(filters: {
  fecha_inicio: string
  fecha_fin: string
  tipo_vehiculo?: string
  metodo_pago?: string
  operario?: string
}) {
  const params = new URLSearchParams({
    fecha_inicio: filters.fecha_inicio,
    fecha_fin: filters.fecha_fin,
  })
  if (filters.tipo_vehiculo && filters.tipo_vehiculo !== 'Todos') params.set('tipo_vehiculo', filters.tipo_vehiculo)
  if (filters.metodo_pago && filters.metodo_pago !== 'Todas') params.set('metodo_pago', filters.metodo_pago)
  if (filters.operario && filters.operario !== 'Todos') params.set('operario', filters.operario)
  return request<CollectionReportOut>(`/api/pagos/reporte?${params.toString()}`)
}

export const getModule3Tariffs = () => request<TariffsState>('/api/tarifas')

export const createModule3Tariff = (data: {
  tipo_vehiculo: VehicleType
  valor_cop: number
  fecha_inicio: string
  motivo: string
}) => post<TariffsState>('/api/tarifas', data)

export type TariffHistoryEntry = {
  id: number
  tipo: VehicleType
  valorAnterior: number
  valorNuevo: number
  fechaInicioVigencia: string // YYYY-MM-DD
  motivo: string
  usuarioResponsable: string
  fechaRegistro: string // ISO string
}

export type TariffsState = {
  Carro: number
  Moto: number
  historial: TariffHistoryEntry[]
}

export type VehicleSubscriptionInfo = {
  placa: string
  estado: SubscriptionState
  fechaInicio: string | null
  fechaVencimiento: string | null
  diasRestantes: number | null
  diasMora: number
  ultimoPagoId: number | null
}

export const DEFAULT_TARIFF_CARRO = 120000
export const DEFAULT_TARIFF_MOTO = 65000

export function todayColombiaYMD(now: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  return formatter.format(now)
}

export function isoToColombiaYMD(isoString: string): string {
  try {
    const d = new Date(isoString)
    if (Number.isNaN(d.getTime())) return isoString.slice(0, 10)
    return todayColombiaYMD(d)
  } catch {
    return isoString.slice(0, 10)
  }
}

export function addCalendarDaysYMD(ymd: string, daysToAdd: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const utc = Date.UTC(y, (m || 1) - 1, (d || 1) + daysToAdd, 12, 0, 0)
  const next = new Date(utc)
  const ny = next.getUTCFullYear()
  const nm = String(next.getUTCMonth() + 1).padStart(2, '0')
  const nd = String(next.getUTCDate()).padStart(2, '0')
  return `${ny}-${nm}-${nd}`
}

export function diffCalendarDaysYMD(targetYMD: string, baseYMD: string = todayColombiaYMD()): number {
  const [ty, tm, td] = targetYMD.split('-').map(Number)
  const [by, bm, bd] = baseYMD.split('-').map(Number)
  const targetUtc = Date.UTC(ty, (tm || 1) - 1, td || 1, 12, 0, 0)
  const baseUtc = Date.UTC(by, (bm || 1) - 1, bd || 1, 12, 0, 0)
  return Math.round((targetUtc - baseUtc) / 86400000)
}

export function formatCOP(amount: number): string {
  return `$${Math.round(amount).toLocaleString('es-CO')} COP`
}

export function loadStoredTariffs(): TariffsState {
  const today = todayColombiaYMD()
  const fallback: TariffsState = {
    Carro: DEFAULT_TARIFF_CARRO,
    Moto: DEFAULT_TARIFF_MOTO,
    historial: [
      {
        id: 1,
        tipo: 'Carro',
        valorAnterior: DEFAULT_TARIFF_CARRO,
        valorNuevo: DEFAULT_TARIFF_CARRO,
        fechaInicioVigencia: today,
        motivo: 'Tarifa mensual base inicial para automóviles',
        usuarioResponsable: 'Administrador',
        fechaRegistro: new Date().toISOString(),
      },
      {
        id: 2,
        tipo: 'Moto',
        valorAnterior: DEFAULT_TARIFF_MOTO,
        valorNuevo: DEFAULT_TARIFF_MOTO,
        fechaInicioVigencia: today,
        motivo: 'Tarifa mensual base inicial para motocicletas',
        usuarioResponsable: 'Administrador',
        fechaRegistro: new Date().toISOString(),
      },
    ],
  }
  try {
    const raw = localStorage.getItem(TARIFFS_STORAGE_KEY)
    if (!raw) return fallback
    const parsed = JSON.parse(raw)
    if (
      parsed &&
      typeof parsed.Carro === 'number' &&
      typeof parsed.Moto === 'number' &&
      Array.isArray(parsed.historial)
    ) {
      return parsed
    }
    return fallback
  } catch {
    return fallback
  }
}

export function saveStoredTariffs(tariffs: TariffsState): void {
  try {
    localStorage.setItem(TARIFFS_STORAGE_KEY, JSON.stringify(tariffs))
  } catch {
    // Si localStorage no está disponible, se mantiene en memoria.
  }
}

export function getEffectiveTariffForType(tipo: VehicleType, tariffs: TariffsState): number {
  const today = todayColombiaYMD()
  const applicable = tariffs.historial
    .filter((entry) => entry.tipo === tipo && entry.fechaInicioVigencia <= today)
    .sort((a, b) => b.id - a.id)
  if (applicable.length > 0) return applicable[0].valorNuevo
  return tipo === 'Carro' ? tariffs.Carro : tariffs.Moto
}

export function loadStoredPayments(): PaymentRecord[] {
  try {
    const raw = localStorage.getItem(PAYMENTS_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveStoredPayments(payments: PaymentRecord[]): void {
  try {
    localStorage.setItem(PAYMENTS_STORAGE_KEY, JSON.stringify(payments))
  } catch {
    // Si localStorage no está disponible, se mantiene en memoria.
  }
}

export function getVehicleSubscriptionInfo(
  placa: string,
  payments: PaymentRecord[],
  today: string = todayColombiaYMD(),
): VehicleSubscriptionInfo {
  const norm = placa.trim().toUpperCase()
  const activePayments = payments
    .filter((p) => p.placa.toUpperCase() === norm && p.estado === 'Registrado')
    .sort((a, b) => b.id - a.id)

  if (activePayments.length === 0) {
    return {
      placa: norm,
      estado: 'Sin mensualidad',
      fechaInicio: null,
      fechaVencimiento: null,
      diasRestantes: null,
      diasMora: 0,
      ultimoPagoId: null,
    }
  }

  const latest = activePayments[0]
  const diff = diffCalendarDaysYMD(latest.fechaVencimiento, today)

  if (diff < 0) {
    return {
      placa: norm,
      estado: 'Vencida',
      fechaInicio: latest.fechaInicio,
      fechaVencimiento: latest.fechaVencimiento,
      diasRestantes: diff,
      diasMora: Math.abs(diff),
      ultimoPagoId: latest.id,
    }
  }

  if (diff <= 5) {
    return {
      placa: norm,
      estado: 'Por vencer',
      fechaInicio: latest.fechaInicio,
      fechaVencimiento: latest.fechaVencimiento,
      diasRestantes: diff,
      diasMora: 0,
      ultimoPagoId: latest.id,
    }
  }

  return {
    placa: norm,
    estado: 'Al día',
    fechaInicio: latest.fechaInicio,
    fechaVencimiento: latest.fechaVencimiento,
    diasRestantes: diff,
    diasMora: 0,
    ultimoPagoId: latest.id,
  }
}

export function calculatePaymentPeriod(
  currentInfo: VehicleSubscriptionInfo,
  meses: 1 | 2 | 3,
  today: string = todayColombiaYMD(),
): { fechaInicio: string; fechaVencimiento: string; diasTotales: number } {
  const diasTotales = 30 * meses
  // RN-P03: Si está Al día o Por vencer, inicia el día siguiente al vencimiento actual.
  // Si está Vencida o Sin mensualidad, inicia hoy.
  const fechaInicio =
    (currentInfo.estado === 'Al día' || currentInfo.estado === 'Por vencer') && currentInfo.fechaVencimiento
      ? addCalendarDaysYMD(currentInfo.fechaVencimiento, 1)
      : today
  const fechaVencimiento = addCalendarDaysYMD(fechaInicio, diasTotales - 1)
  return { fechaInicio, fechaVencimiento, diasTotales }
}

export function buildSeedPaymentsFromUsers(users: UserRecord[], tariffs: TariffsState): PaymentRecord[] {
  if (users.length === 0) return []
  const today = todayColombiaYMD()
  const seed: PaymentRecord[] = []
  let seq = 1

  const allActivePairs: Array<{ user: UserRecord; veh: UserVehicle }> = []
  for (const u of users) {
    for (const v of u.vehiculos) {
      allActivePairs.push({ user: u, veh: v })
    }
  }

  // Semilla realista para los primeros vehículos registrados:
  // 1) Al día (+22 días), 2) Por vencer (+3 días), 3) Vencida (-4 días), 4) Al día (+18 días)
  const presets: Array<{ startOffset: number; method: PaymentMethod; ref: string | null }> = [
    { startOffset: -7, method: 'Efectivo', ref: null }, // Vence en +22 días (Al día)
    { startOffset: -26, method: 'Efectivo', ref: null }, // Vence en +3 días (Por vencer)
    { startOffset: -33, method: 'Efectivo', ref: null }, // Venció hace 4 días (Vencida)
    { startOffset: -11, method: 'Efectivo', ref: null }, // Vence en +18 días (Al día)
  ]

  allActivePairs.slice(0, presets.length).forEach(({ user, veh }, idx) => {
    const preset = presets[idx]
    const tarifa = veh.tipo === 'Carro' ? tariffs.Carro : tariffs.Moto
    const fechaInicio = addCalendarDaysYMD(today, preset.startOffset)
    const fechaVencimiento = addCalendarDaysYMD(fechaInicio, 29)
    const pagoDate = new Date(`${fechaInicio}T09:${String(15 + idx * 7).padStart(2, '0')}:00`)
    seed.push({
      id: seq,
      consecutivo: `REC-${String(seq).padStart(4, '0')}`,
      userId: user.id,
      documentoTipo: user.documentoTipo,
      documento: user.documento,
      nombreTitular: `${user.nombres} ${user.apellidos}`.trim(),
      celularTitular: user.celular,
      placa: veh.placa.toUpperCase(),
      tipoVehiculo: veh.tipo,
      marcaVehiculo: veh.marca,
      colorVehiculo: veh.color,
      meses: 1,
      tarifaMensualAplicada: tarifa,
      totalPagado: tarifa,
      fechaInicio,
      fechaVencimiento,
      fechaVencimientoAnterior: null,
      formaPago: preset.method,
      valorRecibidoEfectivo: preset.method === 'Efectivo' ? tarifa : null,
      cambioDevueltoEfectivo: preset.method === 'Efectivo' ? 0 : null,
      referenciaPago: preset.ref,
      fechaHoraPago: pagoDate.toISOString(),
      operario: user.operario || 'Administrador',
      estado: 'Registrado',
      motivoAnulacion: null,
      usuarioAnulacion: null,
      fechaHoraAnulacion: null,
    })
    seq += 1
  })

  return seed
}
