// La API envía fechas sin zona horaria en la hora local del parqueadero (Medellín).
const parse = (value: string) => new Date(value.length === 10 ? `${value}T12:00:00` : value)

export const formatDate = (value: string) =>
  parse(value).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' })

export const formatDateTime = (value: string) => {
  const date = parse(value)
  const time = date.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: false })
  const isToday = date.toDateString() === new Date().toDateString()
  return isToday ? `Hoy, ${time}` : `${date.toLocaleDateString('es-CO', { day: '2-digit', month: 'short' }).replace('.', '')}, ${time}`
}

export const todayLong = () => new Date().toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })

export const initials = (name: string) => name.split(/\s+/).filter(Boolean).map(part => part[0]).join('').slice(0, 2).toUpperCase()

export const ticketCode = (id: number) => `MOV-${String(id).padStart(4, '0')}`
