import { FormEvent, ReactNode, useCallback, useEffect, useState } from 'react'
import { annulTicket, ApiError, checkHealth, getFreeCells, getHistory, getInside, getMe, getOccupancy, getToken, login, logout, lookupVehicle, registerEntry, registerExit, setUnauthorizedHandler } from './api/client'
import type { Cell, EntryResult, Occupancy, OpTab, Ticket, User, VehicleLookup } from './domain/parking'
import { formatDate, formatDateTime, initials, ticketCode, todayLong } from './shared/formatters'

const errorMessage = (error: unknown) => error instanceof ApiError ? error.message : 'Ocurrió un error inesperado'

function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const paths: Record<string, ReactNode> = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
    search: <><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></>,
    arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
    logout: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    alert: <><path d="M10.3 2.9 1.8 17a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 2.9a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4M12 17h.01" /></>,
    x: <path d="M18 6 6 18M6 6l12 12" />,
    car: <><path d="m3 11 2-5h14l2 5" /><path d="M5 11h14a2 2 0 0 1 2 2v4H3v-4a2 2 0 0 1 2-2ZM5 17v2M19 17v2" /><circle cx="7" cy="14" r="1" /><circle cx="17" cy="14" r="1" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  }
  return <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{paths[name]}</svg>
}

function Button({ children, variant = 'primary', icon, onClick, type = 'button', disabled = false, className = '' }: { children: ReactNode; variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; icon?: string; onClick?: () => void; type?: 'button' | 'submit'; disabled?: boolean; className?: string }) {
  return <button className={`btn btn-${variant} ${className}`} onClick={onClick} type={type} disabled={disabled}>{icon && <Icon name={icon} size={16} />}{children}</button>
}

function Badge({ tone, children }: { tone: 'green' | 'amber' | 'red' | 'gray' | 'blue'; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}><span className="badge-dot" />{children}</span>
}

function Modal({ title, subtitle, onClose, children }: { title: string; subtitle?: string; onClose: () => void; children: ReactNode }) {
  return <div className="modal-backdrop" onMouseDown={onClose}><div className="modal" onMouseDown={e => e.stopPropagation()}>
    <div className="modal-head"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button className="icon-btn" onClick={onClose} aria-label="Cerrar"><Icon name="x" /></button></div>
    {children}
  </div></div>
}

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <label className="field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>
}

function StatusBadge({ status }: { status: string }) {
  const tone = status === 'Vigente' || status === 'Activo' ? 'green' : status === 'Por vencer' ? 'amber' : status === 'Finalizado' ? 'gray' : 'red'
  return <Badge tone={tone}>{status}</Badge>
}

const roleLabel = (user: User) => user.rol === 'Administrador' ? 'Administrador' : 'Operario'

export default function App() {
  const [user, setUser] = useState<User | null>(null)
  const [checkingSession, setCheckingSession] = useState(() => !!getToken())

  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null))
    if (!getToken()) return
    getMe().then(setUser).catch(() => logout()).finally(() => setCheckingSession(false))
  }, [])

  if (checkingSession) return null
  if (!user) return <Login onLogin={setUser} />
  return <Operations user={user} onLogout={() => { logout(); setUser(null) }} />
}

function Operations({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [opTab, setOpTab] = useState<OpTab>('console')
  const [occupancy, setOccupancy] = useState<Occupancy[]>([])
  // Se incrementa después de cada movimiento para que las vistas vuelvan a consultar la API.
  const [version, setVersion] = useState(0)
  const [toast, setToast] = useState('')
  const [profileOpen, setProfileOpen] = useState(false)

  const refreshOccupancy = useCallback(() => { getOccupancy().then(setOccupancy).catch(() => {}) }, [])

  // RF-10: ocupación en tiempo real; se actualiza tras cada movimiento y cada 15 segundos.
  useEffect(() => {
    refreshOccupancy()
    const timer = window.setInterval(refreshOccupancy, 15000)
    return () => window.clearInterval(timer)
  }, [refreshOccupancy, version])

  const notify = (message: string) => {
    setToast(message)
    window.setTimeout(() => setToast(''), 3200)
  }
  const onChanged = (message: string) => { setVersion(v => v + 1); notify(message) }

  const totalInside = occupancy.reduce((sum, o) => sum + o.ocupadas, 0)
  // RF-06: si un tipo se queda sin celdas libres, la barra de ocupación lo alerta en todas las sesiones.
  const full = occupancy.filter(o => o.disponibles === 0)

  return <div className="app-shell canvas-shell">
    <div className="canvas-identity">
      <img className="canvas-logo" src="/logo.svg" alt="" />
      <div><strong>PARQUEATE</strong><span>Medellín</span></div>
    </div>
    <div className="occupancy-hud">
      {occupancy.map(o => <div key={o.tipo_vehiculo} className={`hud-pill ${o.disponibles === 0 ? 'hud-full' : ''}`} title={o.disponibles === 0 ? 'Sin celdas libres: avise al administrador' : `${o.disponibles} celdas libres`}>
        <i className={`hud-light ${o.disponibles === 0 ? 'red' : o.tipo_vehiculo === 'Carro' ? 'green' : 'amber'}`} /><span>{o.tipo_vehiculo === 'Carro' ? 'Carros' : 'Motos'}</span><strong>{o.ocupadas}<small>/{o.total}</small></strong>
      </div>)}
    </div>

    <main className="main canvas-main">
      <OperationsHeader tab={opTab} setTab={setOpTab} totalInside={totalInside} />
      {full.length > 0 && <div className="capacity-alert notice-red"><Icon name="alert" size={17} /><span><strong>Sin celdas libres de {full.map(o => o.tipo_vehiculo === 'Carro' ? 'carro' : 'moto').join(' ni de ')}.</strong> {user.rol === 'Administrador' ? 'Con el cupo garantizado esto indica un error de datos: revisa las celdas en mantenimiento y las mensualidades vigentes.' : 'Avisa al administrador.'}</span></div>}
      <div className="content">
        {opTab === 'console' && <Console onChanged={onChanged} />}
        {opTab === 'inside' && <InsideTable version={version} onChanged={onChanged} />}
        {opTab === 'history' && <HistoryTable version={version} user={user} onChanged={onChanged} />}
      </div>
    </main>

    <div className="floating-dock-wrap">
      {profileOpen && <div className="profile-popover">
        <div className="profile-popover-head"><div className="avatar">{initials(user.nombre)}</div><div><strong>{user.nombre}</strong><span>{roleLabel(user)}</span></div></div>
        <button className="popover-logout" onClick={onLogout}><Icon name="logout" size={16} />Cerrar sesión</button>
      </div>}
      <nav className="floating-dock" aria-label="Navegación principal">
        <button className="dock-logo" onClick={() => setOpTab('console')} aria-label="Inicio"><img src="/logo.svg" alt="" /></button>
        <span className="dock-divider" />
        <div className="dock-navigation">
          <button aria-label="Operaciones" aria-current="page" className="dock-item active" onClick={() => setOpTab('console')}><Icon name="grid" size={18} /><span>Operaciones</span></button>
        </div>
        <span className="dock-divider" />
        <button className={`dock-profile ${profileOpen ? 'active' : ''}`} onClick={() => setProfileOpen(!profileOpen)} aria-label="Perfil"><div className="avatar">{initials(user.nombre)}</div><span className={`role-indicator ${user.rol === 'Administrador' ? 'admin' : 'operator'}`} /></button>
      </nav>
    </div>

    {toast && <div className="toast"><span className="toast-check"><Icon name="check" size={15} /></span>{toast}</div>}
  </div>
}

function Login({ onLogin }: { onLogin: (user: User) => void }) {
  const [correo, setCorreo] = useState('')
  const [contrasena, setContrasena] = useState('')
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [online, setOnline] = useState<boolean | null>(null)
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000)
    checkHealth().then(() => setOnline(true)).catch(() => setOnline(false))
    return () => window.clearInterval(timer)
  }, [])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setSending(true)
    setError('')
    try {
      const user = await login(correo.trim(), contrasena)
      setLeaving(true)
      window.setTimeout(() => onLogin(user), 420)
    } catch (err) {
      setError(err instanceof ApiError && err.status === 401 ? 'Correo o contraseña incorrectos' : errorMessage(err))
      setSending(false)
    }
  }

  const medellinTime = new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit', hour12: false }).format(now)
  const medellinDate = new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', weekday: 'long', day: 'numeric', month: 'long' }).format(now)
  const carCells = Array.from({ length: 70 }, (_, i) => `C-${String(i + 1).padStart(2, '0')}`)
  const motoCells = Array.from({ length: 10 }, (_, i) => `M-${String(i + 1).padStart(2, '0')}`)

  return <div className={`station-lock ${leaving ? 'unlocking' : ''}`}>
    <div className="lock-backdrop" aria-hidden>
      <div className="parking-blueprint">
        <div className="blueprint-head"><span>PLANO OPERATIVO · NIVEL 01</span><span>PARQUEATE / MEDELLÍN</span></div>
        <div className="blueprint-zone"><span className="zone-label">CARROS · 70 CELDAS</span><div className="blueprint-grid cars">{carCells.map(cell => <div key={cell} className="free"><span>{cell}</span><i /></div>)}</div></div>
        <div className="blueprint-zone moto-zone"><span className="zone-label">MOTOS · 10 CELDAS</span><div className="blueprint-grid motos">{motoCells.map(cell => <div key={cell} className="free"><span>{cell}</span><i /></div>)}</div></div>
      </div>
    </div>

    <div className="lock-status">
      <div className="lock-brand"><img src="/logo.svg" alt="" /><strong>PARQUEATE</strong></div>
      <div className="lock-clock"><strong>{medellinTime}</strong><span>{medellinDate} · Medellín</span></div>
      {online !== null && <div className={`system-pill ${online ? '' : 'offline'}`}><i />{online ? 'Sistema en línea' : 'Sin conexión con el servidor'}</div>}
    </div>

    <form className="shift-pod" onSubmit={submit}>
      <div className="shift-pod-head"><img className="login-logo" src="/logo.svg" alt="PARQUEATE" /><span className="eyebrow">INICIAR TURNO</span><h1>Ingresa a la estación</h1><p>Usa la cuenta de operario o administrador asignada por el parqueadero.</p></div>
      <div className="login-fields">
        <label><span>CORREO</span><input type="email" value={correo} onChange={e => setCorreo(e.target.value)} placeholder="operario@autoscolombia.co" autoComplete="username" autoFocus required /></label>
        <label><span>CONTRASEÑA</span><input type="password" value={contrasena} onChange={e => setContrasena(e.target.value)} placeholder="••••••" autoComplete="current-password" required /></label>
      </div>
      {error && <div className="notice notice-red login-error"><Icon name="alert" size={16} /><span>{error}</span></div>}
      <button type="submit" className="unlock-button login-submit" disabled={sending || !correo.trim() || !contrasena}><span>{sending ? 'Verificando…' : 'Iniciar turno'}</span><Icon name="arrow" size={18} /></button>
    </form>
  </div>
}

function OperationsHeader({ tab, setTab, totalInside }: { tab: OpTab; setTab: (t: OpTab) => void; totalInside: number }) {
  return <div className={`page-head spotlight-head ${tab !== 'console' ? 'compact' : ''}`}><div className="title-row"><div><span className="eyebrow">ESTACIÓN DE ACCESO · MEDELLÍN</span><h1>{tab === 'console' ? '¿Qué vehículo quieres registrar?' : tab === 'inside' ? 'Vehículos dentro' : 'Historial y trazabilidad'}</h1><p>{tab === 'console' ? 'Valida una placa y completa el movimiento en segundos.' : 'Consulta la operación sin salir de la estación.'}</p></div><div className="date-chip"><Icon name="clock" size={16} /><span><small>HOY</small>{todayLong()}</span></div></div>
    <div className="tabs view-orbit" role="group" aria-label="Vistas de operaciones"><button type="button" aria-pressed={tab === 'console'} className={tab === 'console' ? 'active' : ''} onClick={() => setTab('console')}><Icon name="search" size={18} />Registro</button><button type="button" aria-pressed={tab === 'inside'} className={tab === 'inside' ? 'active' : ''} onClick={() => setTab('inside')}><Icon name="car" size={18} />Dentro <span>{totalInside}</span></button><button type="button" aria-pressed={tab === 'history'} className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}><Icon name="clock" size={18} />Historial</button></div>
  </div>
}

// Motivo por el que la consulta de la placa ya permite saber que el movimiento no procede.
// La API valida de nuevo al registrar, así que esto solo adelanta el aviso al operario.
function blockReasonFor(mode: 'entry' | 'exit', vehicle: VehicleLookup) {
  if (mode === 'exit') return vehicle.id_tiquete_abierto ? '' : 'El vehículo no tiene entrada registrada (RF-09).'
  if (vehicle.id_tiquete_abierto) return `El vehículo ya se encuentra dentro del parqueadero en la celda ${vehicle.numero_espacio} (RN-03).`
  if (!vehicle.mensualidad) return 'El vehículo no tiene una mensualidad registrada.'
  if (vehicle.mensualidad.estado === 'Vencida') return `Mensualidad vencida el ${formatDate(vehicle.mensualidad.fecha_vencimiento)} (RN-05).`
  return ''
}

function monthlyNotice(vehicle: VehicleLookup) {
  const m = vehicle.mensualidad
  if (!m || m.estado === 'Vigente') return null
  if (m.estado === 'Vencida') return { tone: 'notice-red', text: `Vencida el ${formatDate(m.fecha_vencimiento)}` }
  return { tone: 'notice-amber', text: m.dias_restantes === 0 ? 'Su mensualidad vence hoy' : `Su mensualidad vence en ${m.dias_restantes} día${m.dias_restantes === 1 ? '' : 's'}` }
}

function Console({ onChanged }: { onChanged: (message: string) => void }) {
  const [mode, setMode] = useState<'entry' | 'exit'>('entry')
  const [plate, setPlate] = useState('')
  const [vehicle, setVehicle] = useState<VehicleLookup | null>(null)
  const [lookupError, setLookupError] = useState('')
  const [loading, setLoading] = useState(false)
  const [cells, setCells] = useState<Cell[]>([])
  const [selectedCell, setSelectedCell] = useState('')
  const [incident, setIncident] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [result, setResult] = useState<{ title: string; detail?: string; alert?: string } | null>(null)

  const knownPlate = plate.length >= 5

  // RNF-02: la placa se valida mientras se escribe, sin pasos extra.
  useEffect(() => {
    setVehicle(null); setLookupError(''); setSubmitError(''); setSelectedCell('')
    if (!knownPlate) return
    let cancelled = false
    setLoading(true)
    const timer = window.setTimeout(() => {
      lookupVehicle(plate)
        .then(found => { if (!cancelled) setVehicle(found) })
        .catch(err => { if (!cancelled) setLookupError(errorMessage(err)) })
        .finally(() => { if (!cancelled) setLoading(false) })
    }, 300)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [plate, knownPlate])

  const blockReason = vehicle ? blockReasonFor(mode, vehicle) : ''

  useEffect(() => {
    if (mode !== 'entry' || !vehicle || blockReason) { setCells([]); return }
    getFreeCells(vehicle.tipo_vehiculo).then(setCells).catch(() => setCells([]))
  }, [mode, vehicle, blockReason])

  const canSubmit = !!vehicle && !blockReason && !submitting
  const notice = vehicle ? monthlyNotice(vehicle) : null

  const changePlate = (value: string) => { setPlate(value.toUpperCase().replace(/[^A-Z0-9]/g, '')); setResult(null) }

  const submit = async () => {
    if (!vehicle || !canSubmit) return
    setSubmitting(true); setSubmitError('')
    const novedad = incident.trim() || null
    try {
      if (mode === 'entry') {
        const entry: EntryResult = await registerEntry(vehicle.placa, novedad, selectedCell ? Number(selectedCell) : null)
        setResult({ title: `Entrada registrada · ${entry.placa} en la celda ${entry.numero_espacio}`, detail: `Vigente hasta el ${formatDate(entry.fecha_vencimiento)}`, alert: entry.alerta ?? undefined })
        onChanged(`Entrada confirmada · ${entry.placa} asignado a ${entry.numero_espacio}`)
      } else {
        const exit = await registerExit(vehicle.placa, novedad)
        setResult({ title: `Salida registrada · ${exit.placa}`, detail: `Celda ${exit.numero_espacio} liberada` })
        onChanged(`Salida registrada · ${exit.placa}`)
      }
      setPlate(''); setIncident('')
    } catch (err) {
      setSubmitError(errorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  return <div className="console-layout spotlight-layout">
    <section className={`card register-card spotlight-card ${knownPlate || result ? 'expanded' : ''}`}>
      <div className="section-head spotlight-mode"><div className="segmented"><button className={mode === 'entry' ? 'active' : ''} onClick={() => { setMode('entry'); setResult(null); setSubmitError('') }}>Entrada</button><button className={mode === 'exit' ? 'active' : ''} onClick={() => { setMode('exit'); setResult(null); setSubmitError('') }}>Salida</button></div></div>
      <form className="plate-section spotlight-plate" onSubmit={e => { e.preventDefault(); submit() }}><span className="command-hint">PLACA DEL VEHÍCULO</span><div className="plate-input"><Icon name="search" size={23} /><input value={plate} onChange={e => changePlate(e.target.value)} placeholder="EJ. ABC123" maxLength={6} autoFocus />{plate && <button type="button" onClick={() => changePlate('')}><Icon name="x" size={16} /></button>}<kbd>↵</kbd></div></form>

      {result && !knownPlate ? <div className="validation-card entry-result">
        <div className="validation-top"><div className="person"><div className="avatar avatar-light"><Icon name="check" size={18} /></div><div><strong>{result.title}</strong>{result.detail && <span>{result.detail}</span>}</div></div></div>
        {result.alert && <div className="notice notice-amber"><Icon name="alert" size={17} /><span><strong>{result.alert}</strong> · Recuérdale renovar para evitar que se le niegue la entrada.</span></div>}
      </div> : !knownPlate ? <div className="validation-empty"><div className="scan-icon"><Icon name="car" size={26} /></div><h3>Esperando una placa</h3><p>La validación del usuario y la mensualidad aparecerá aquí.</p></div> :
        loading ? <div className="validation-empty"><h3>Validando placa…</h3></div> :
        lookupError ? <div className="blocked standalone"><Icon name="x" size={18} /><div><strong>{lookupError.includes('no está asociado') ? 'Placa no registrada' : 'No se pudo validar la placa'}</strong><p>{lookupError}{lookupError.includes('no está asociado') ? ' (RF-02).' : ''}</p></div></div> :
        vehicle && <div className={`validation-card ${blockReason ? 'invalid' : ''}`}>
          <div className="validation-top"><div className="person"><div className="avatar avatar-light">{initials(vehicle.propietario)}</div><div><strong>{vehicle.propietario}</strong><span>{vehicle.tipo_vehiculo} · {vehicle.placa}</span></div></div><StatusBadge status={vehicle.mensualidad?.estado ?? 'Sin mensualidad'} /></div>
          {notice && <div className={`notice ${notice.tone}`}><Icon name="alert" size={17} /><span><strong>{notice.text}</strong>{notice.tone === 'notice-amber' ? ' · Renueva para evitar interrupciones.' : ' · Debe registrar un pago antes de ingresar.'}</span></div>}
          {blockReason ? <div className="blocked"><Icon name="x" size={18} /><div><strong>Movimiento no permitido</strong><p>{blockReason}</p></div></div> :
            mode === 'entry' ? <div className="cell-selector"><Field label="Celda"><select value={selectedCell} onChange={e => setSelectedCell(e.target.value)}><option value="">Asignación automática{cells[0] ? ` (${cells[0].numero_espacio})` : ''}</option>{cells.map(c => <option key={c.id_espacio} value={c.id_espacio}>{c.numero_espacio}</option>)}</select></Field><span className="auto-tag"><Icon name={cells.length ? 'check' : 'alert'} size={14} /> {cells.length ? `${cells.length} celdas libres de ${vehicle.tipo_vehiculo.toLowerCase()}` : `Sin celdas libres de ${vehicle.tipo_vehiculo.toLowerCase()}`}</span></div> :
              <div className="exit-detail"><span>Celda a liberar</span><strong>{vehicle.numero_espacio}</strong></div>}
          {submitError && <div className="blocked"><Icon name="x" size={18} /><div><strong>No se registró el movimiento</strong><p>{submitError}</p></div></div>}
        </div>}
      <div className="step-three"><span className="step">PASO 3 DE 3 · OPCIONAL</span><Field label="Adjuntar novedad"><textarea value={incident} onChange={e => setIncident(e.target.value)} placeholder="Rayón, golpe u otra observación del vehículo..." rows={2} maxLength={255} /></Field></div>
      <div className="card-footer"><span>{canSubmit ? 'Validación completada' : 'Completa la validación para continuar'}</span><Button onClick={submit} disabled={!canSubmit}>{submitting ? 'Registrando…' : mode === 'entry' ? 'Confirmar entrada' : 'Registrar salida'} <Icon name="arrow" size={16} /></Button></div>
    </section>
  </div>
}

function TableShell({ title, eyebrow, actions, children }: { title: string; eyebrow: string; actions: ReactNode; children: ReactNode }) {
  return <section className="table-page"><div className="table-title"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1></div>{actions}</div><div className="card table-card">{children}</div></section>
}

function SearchInput({ value, setValue, placeholder }: { value: string; setValue: (v: string) => void; placeholder: string }) {
  return <div className="search-input"><Icon name="search" size={16} /><input value={value} onChange={e => setValue(e.target.value)} placeholder={placeholder} /></div>
}

function TableMessage({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return <tr><td colSpan={colSpan} className="table-message">{children}</td></tr>
}

// Carga una lista de la API y la vuelve a pedir cuando cambian sus dependencias.
function useApiList<T>(load: () => Promise<T[]>, deps: unknown[]) {
  const [items, setItems] = useState<T[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    load()
      .then(rows => { if (!cancelled) { setItems(rows); setError('') } })
      .catch(err => { if (!cancelled) setError(errorMessage(err)) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, deps)
  return { items, loading, error }
}

const matches = (search: string, ...values: (string | null)[]) => values.join(' ').toLowerCase().includes(search.trim().toLowerCase())

function InsideTable({ version, onChanged }: { version: number; onChanged: (message: string) => void }) {
  const [search, setSearch] = useState('')
  const [exiting, setExiting] = useState<string | null>(null)
  const [actionError, setActionError] = useState('')
  const { items, loading, error } = useApiList(getInside, [version])
  const rows = items.filter(t => matches(search, t.placa, t.propietario, t.numero_espacio))

  const exit = async (ticket: Ticket) => {
    setExiting(ticket.placa); setActionError('')
    try {
      await registerExit(ticket.placa, null)
      onChanged(`Salida registrada · ${ticket.placa}`)
    } catch (err) {
      setActionError(errorMessage(err))
    } finally {
      setExiting(null)
    }
  }

  return <TableShell title="Vehículos dentro" eyebrow="OCUPACIÓN EN VIVO" actions={<SearchInput value={search} setValue={setSearch} placeholder="Buscar placa, usuario o celda" />}>
    {actionError && <div className="notice notice-red table-notice"><Icon name="alert" size={16} /><span>{actionError}</span></div>}
    <table className="inside-table"><thead><tr><th>Placa</th><th>Usuario</th><th>Tipo</th><th>Celda</th><th>Hora de entrada</th><th>Operario</th><th>Novedad</th><th>Acción</th></tr></thead><tbody>
      {loading && !items.length ? <TableMessage colSpan={8}>Cargando…</TableMessage> : error ? <TableMessage colSpan={8}>{error}</TableMessage> : !rows.length ? <TableMessage colSpan={8}>{search ? 'Ningún vehículo coincide con la búsqueda.' : 'No hay vehículos dentro del parqueadero.'}</TableMessage> :
        rows.map(t => <tr key={t.id_tiquete}><td><strong>{t.placa}</strong></td><td className="owner-cell">{t.propietario}</td><td>{t.tipo_vehiculo}</td><td><span className="cell-code">{t.numero_espacio}</span></td><td>{formatDateTime(t.fecha_hora_entrada)}</td><td>{t.usuario_entrada}</td><td className="note-cell">{t.novedad_entrada || 'Sin novedades'}</td><td><Button variant="secondary" onClick={() => exit(t)} disabled={exiting === t.placa}>{exiting === t.placa ? 'Registrando…' : 'Dar salida'}</Button></td></tr>)}
    </tbody></table>
  </TableShell>
}

function HistoryTable({ version, user, onChanged }: { version: number; user: User; onChanged: (message: string) => void }) {
  const [search, setSearch] = useState('')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [annulling, setAnnulling] = useState<Ticket | null>(null)
  const isAdmin = user.rol === 'Administrador'
  const { items, loading, error } = useApiList(() => getHistory({ desde, hasta }), [version, desde, hasta])
  const rows = items.filter(t => matches(search, ticketCode(t.id_tiquete), t.placa, t.propietario, t.numero_espacio, t.usuario_entrada))
  const colSpan = isAdmin ? 9 : 8

  const notes = (t: Ticket) => [t.novedad_entrada && `Entrada: ${t.novedad_entrada}`, t.novedad_salida && `Salida: ${t.novedad_salida}`, t.motivo_anulacion && `Anulado por ${t.usuario_anulacion}: ${t.motivo_anulacion}`].filter(Boolean).join(' · ') || 'Sin novedades'

  return <TableShell title="Historial y trazabilidad" eyebrow="REGISTRO INALTERABLE" actions={<div className="filter-row"><SearchInput value={search} setValue={setSearch} placeholder="Placa, usuario o celda" /><input type="date" aria-label="Fecha inicial" value={desde} max={hasta || undefined} onChange={e => setDesde(e.target.value)} /><input type="date" aria-label="Fecha final" value={hasta} min={desde || undefined} onChange={e => setHasta(e.target.value)} /></div>}>
    <table><thead><tr><th>ID</th><th>Entrada</th><th>Salida</th><th>Placa</th><th>Celda</th><th>Operario responsable</th><th>Novedades</th><th>Estado</th>{isAdmin && <th />}</tr></thead><tbody>
      {loading && !items.length ? <TableMessage colSpan={colSpan}>Cargando…</TableMessage> : error ? <TableMessage colSpan={colSpan}>{error}</TableMessage> : !rows.length ? <TableMessage colSpan={colSpan}>No hay movimientos con estos filtros.</TableMessage> :
        rows.map(t => <tr key={t.id_tiquete}><td className="mono">{ticketCode(t.id_tiquete)}</td><td>{formatDateTime(t.fecha_hora_entrada)}</td><td>{t.fecha_hora_salida ? formatDateTime(t.fecha_hora_salida) : '—'}</td><td><strong>{t.placa}</strong></td><td><span className="cell-code">{t.numero_espacio}</span></td><td>{t.usuario_salida && t.usuario_salida !== t.usuario_entrada ? `${t.usuario_entrada} / ${t.usuario_salida}` : t.usuario_entrada}</td><td className="note-cell">{notes(t)}</td><td><StatusBadge status={t.estado} /></td>{isAdmin && <td>{t.estado !== 'Anulado' && <Button variant="ghost" onClick={() => setAnnulling(t)}>Anular</Button>}</td>}</tr>)}
    </tbody></table>
    {!isAdmin && <div className="permission-note">La anulación de registros está disponible únicamente para administradores.</div>}
    {annulling && <AnnulModal ticket={annulling} onClose={() => setAnnulling(null)} onDone={() => { setAnnulling(null); onChanged(`Registro ${ticketCode(annulling.id_tiquete)} anulado con trazabilidad`) }} />}
  </TableShell>
}

function AnnulModal({ ticket, onClose, onDone }: { ticket: Ticket; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const confirm = async () => {
    setSending(true); setError('')
    try {
      await annulTicket(ticket.id_tiquete, reason.trim())
      onDone()
    } catch (err) {
      setError(errorMessage(err))
      setSending(false)
    }
  }
  return <Modal title={`Anular ${ticketCode(ticket.id_tiquete)}`} subtitle="Esta acción no elimina el movimiento y quedará en la trazabilidad." onClose={onClose}><div className="modal-body"><div className="notice notice-red"><Icon name="alert" size={18} /><span>La anulación requiere una justificación obligatoria (RNF-05).{ticket.estado === 'Activo' ? ` La celda ${ticket.numero_espacio} quedará libre.` : ''}</span></div><Field label="Justificación"><textarea value={reason} onChange={e => setReason(e.target.value)} rows={4} maxLength={255} placeholder="Explica el motivo de la anulación..." autoFocus /></Field>{error && <div className="notice notice-red"><Icon name="alert" size={16} /><span>{error}</span></div>}</div><div className="modal-actions"><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button variant="danger" onClick={confirm} disabled={sending || reason.trim().length < 8}>{sending ? 'Anulando…' : 'Anular registro'}</Button></div></Modal>
}
