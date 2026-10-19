export const formatMoney = (amount: number) => `$${amount.toLocaleString('es-CO')} COP`

export const todayISO = () => new Date().toISOString().slice(0, 10)

export const displayDate = (date: Date) =>
  date.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }).replace('.', '')
