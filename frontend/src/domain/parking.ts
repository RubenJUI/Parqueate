// Tipos de los datos que devuelve la API del módulo de entrada y salida.

export type OpTab = 'console' | 'inside' | 'history'
export type VehicleType = 'Carro' | 'Moto'
export type Role = 'Administrador' | 'Operador'
export type MonthlyStatus = 'Vigente' | 'Por vencer' | 'Vencida'
export type TicketStatus = 'Activo' | 'Finalizado' | 'Anulado'

export type User = {
  id_usuario: number
  nombre: string
  correo: string
  rol: Role
  estado: boolean
}

export type Monthly = {
  fecha_pago: string
  fecha_vencimiento: string
  dias_restantes: number
  estado: MonthlyStatus
}

// Resultado de buscar una placa en la consola de registro.
export type VehicleLookup = {
  placa: string
  tipo_vehiculo: VehicleType
  id_propietario: number
  propietario: string
  documento: string
  telefono: string | null
  mensualidad: Monthly | null
  id_tiquete_abierto: number | null
  numero_espacio: string | null
}

export type Cell = {
  id_espacio: number
  numero_espacio: string
  tipo_permitido: VehicleType
  estado: 'Disponible' | 'Ocupado' | 'Mantenimiento'
}

export type Occupancy = {
  tipo_vehiculo: VehicleType
  total: number
  ocupadas: number
  disponibles: number
  mantenimiento: number
}

export type Ticket = {
  id_tiquete: number
  placa: string
  tipo_vehiculo: VehicleType
  id_propietario: number
  propietario: string
  id_espacio: number
  numero_espacio: string
  id_usuario_entrada: number
  usuario_entrada: string
  id_usuario_salida: number | null
  usuario_salida: string | null
  fecha_hora_entrada: string
  fecha_hora_salida: string | null
  novedad_entrada: string | null
  novedad_salida: string | null
  estado: TicketStatus
  motivo_anulacion: string | null
  usuario_anulacion: string | null
  fecha_hora_anulacion: string | null
}

// La entrada devuelve el tiquete más la vigencia y la alerta de vencimiento próximo (RF-04).
export type EntryResult = Ticket & {
  fecha_vencimiento: string
  dias_restantes: number
  alerta: string | null
}

export type HistoryFilters = {
  desde?: string
  hasta?: string
}
