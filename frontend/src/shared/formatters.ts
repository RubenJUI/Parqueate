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

// Hora oficial del parqueadero: Medellín usa la zona America/Bogota sin importar la zona del equipo.
const horaMedellin = new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', hour: 'numeric', minute: '2-digit', hour12: true })
const fechaMedellin = new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', weekday: 'long', day: 'numeric', month: 'long' })

// Hora en formato de 12 horas, separada del periodo ("a. m." / "p. m.") para mostrarlo aparte.
export const medellinTime = (date: Date) => {
  const partes = horaMedellin.formatToParts(date)
  const valor = (tipo: Intl.DateTimeFormatPartTypes) => partes.find(p => p.type === tipo)?.value ?? ''
  // "a. m." -> "AM": etiqueta compacta, convención habitual en relojes digitales.
  const periodo = valor('dayPeriod').replace(/[.\s]/g, '').toUpperCase()
  return { hora: `${valor('hour')}:${valor('minute')}`, periodo }
}
// Solo la primera letra en mayúscula ("Sábado, 14 de noviembre"), como se escribe en español.
export const medellinDate = (date: Date) => {
  const texto = fechaMedellin.format(date)
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}
