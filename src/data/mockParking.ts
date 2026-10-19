import type { Movement, ParkingSettings, Payment, Vehicle } from '../domain/parking'

export const mockVehicles: Vehicle[] = [
  { plate: 'ABC123', owner: 'Carlos Ruiz', type: 'Carro', phone: '300 412 9081', id: '1.037.612.845', status: 'Alerta', statusDetail: 'Su mensualidad vence hoy', inside: false },
  { plate: 'XYZ789', owner: 'Laura Gómez', type: 'Carro', phone: '315 832 7740', id: '43.921.706', status: 'Vencida', statusDetail: 'Vencida el 11/11/2026', inside: false },
  { plate: 'MOT12A', owner: 'Mateo Ospina', type: 'Moto', phone: '301 668 1204', id: '1.128.950.221', status: 'Vigente', inside: true, cell: 'M-04', entryTime: 'Hoy, 07:42', operator: 'Andrea M.', incident: 'Sin novedades' },
  { plate: 'KLM407', owner: 'Sofía Vélez', type: 'Carro', phone: '314 509 1884', id: '1.020.398.562', status: 'Vigente', inside: true, cell: 'C-18', entryTime: 'Hoy, 08:16', operator: 'Andrea M.', incident: 'Rayón leve costado derecho' },
  { plate: 'JPR221', owner: 'Andrés Gil', type: 'Carro', phone: '300 708 3371', id: '71.405.286', status: 'Vigente', inside: true, cell: 'C-33', entryTime: 'Hoy, 09:03', operator: 'Felipe R.', incident: 'Sin novedades' },
]

export const mockMovements: Movement[] = [
  { id: 'MOV-1048', entered: '14 nov, 07:42', plate: 'MOT12A', cell: 'M-04', operator: 'Andrea M.', note: 'Sin novedades', status: 'Activo' },
  { id: 'MOV-1047', entered: '14 nov, 08:16', plate: 'KLM407', cell: 'C-18', operator: 'Andrea M.', note: 'Rayón leve costado derecho', status: 'Activo' },
  { id: 'MOV-1046', entered: '14 nov, 09:03', plate: 'JPR221', cell: 'C-33', operator: 'Felipe R.', note: 'Sin novedades', status: 'Activo' },
  { id: 'MOV-1045', entered: '13 nov, 18:21', exited: '13 nov, 20:04', plate: 'ABC123', cell: 'C-12', operator: 'Felipe R.', note: 'Sin novedades', status: 'Finalizado' },
  { id: 'MOV-1044', entered: '13 nov, 11:09', exited: '13 nov, 15:32', plate: 'HGT809', cell: 'C-41', operator: 'Andrea M.', note: 'Golpe previo en parachoques', status: 'Finalizado' },
]

export const mockPayments: Payment[] = [
  { id: 'PAG-0381', plate: 'ABC123', owner: 'Carlos Ruiz', amount: 250000, start: '16 oct 2026', end: '14 nov 2026', days: 0, status: 'Por vencer' },
  { id: 'PAG-0380', plate: 'XYZ789', owner: 'Laura Gómez', amount: 250000, start: '13 oct 2026', end: '11 nov 2026', days: -3, status: 'Vencida' },
  { id: 'PAG-0379', plate: 'MOT12A', owner: 'Mateo Ospina', amount: 100000, start: '01 nov 2026', end: '30 nov 2026', days: 16, status: 'Vigente' },
  { id: 'PAG-0378', plate: 'KLM407', owner: 'Sofía Vélez', amount: 250000, start: '28 oct 2026', end: '26 nov 2026', days: 12, status: 'Vigente' },
]

export const defaultParkingSettings: ParkingSettings = {
  cars: 70,
  motos: 10,
  carFee: 250000,
  motoFee: 100000,
  validity: 30,
  alert: 3,
}

export const carCells = Array.from({ length: 70 }, (_, index) => `C-${String(index + 1).padStart(2, '0')}`)
export const motoCells = Array.from({ length: 10 }, (_, index) => `M-${String(index + 1).padStart(2, '0')}`)
