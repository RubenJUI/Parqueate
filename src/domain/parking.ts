export type Role = 'operator' | 'admin'
export type Module = 'operations' | 'people' | 'payments' | 'settings'
export type OpTab = 'console' | 'inside' | 'history'
export type VehicleType = 'Carro' | 'Moto'

export type Vehicle = {
  plate: string
  owner: string
  type: VehicleType
  phone: string
  id: string
  status: 'Vigente' | 'Alerta' | 'Vencida'
  statusDetail?: string
  inside: boolean
  cell?: string
  entryTime?: string
  operator?: string
  incident?: string
}

export type Movement = {
  id: string
  entered: string
  exited?: string
  plate: string
  cell: string
  operator: string
  note: string
  status: 'Activo' | 'Finalizado' | 'Anulado'
  annulReason?: string
}

export type Payment = {
  id: string
  plate: string
  owner: string
  amount: number
  start: string
  end: string
  days: number
  status: 'Vigente' | 'Por vencer' | 'Vencida'
}

export type ParkingSettings = {
  cars: number
  motos: number
  carFee: number
  motoFee: number
  validity: number
  alert: number
}

export type NewVehicleForm = Pick<Vehicle, 'owner' | 'id' | 'phone' | 'plate' | 'type'> & {
  consent: boolean
}
