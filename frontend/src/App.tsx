import { FormEvent, ReactNode, useCallback, useEffect, useState } from 'react'
import {
  annulTicket,
  ApiError,
  buildInitialCells,
  checkHealth,
  getFreeCells,
  getHistory,
  getInside,
  getMe,
  getOccupancy,
  getToken,
  loadStoredCells,
  loadStoredUsers,
  login,
  logout,
  lookupVehicle,
  registerEntry,
  registerExit,
  saveStoredCells,
  saveStoredUsers,
  setUnauthorizedHandler,
  syncCellsWithTickets,
} from './api/client'
import type { Cell, EntryResult, Occupancy, OpTab, Ticket, User, VehicleLookup, VehicleType } from './domain/parking'
import type { AuditEntry, CellRecord, CellStatus, UserRecord, UserStatus, UserVehicle } from './api/client'
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
  const [cells, setCells] = useState<CellRecord[]>(() => loadStoredCells())
  const [users, setUsers] = useState<UserRecord[]>(() => loadStoredUsers())

  useEffect(() => {
    saveStoredCells(cells)
  }, [cells])

  useEffect(() => {
    saveStoredUsers(users)
  }, [users])

  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null))
    if (!getToken()) return
    getMe().then(setUser).catch(() => logout()).finally(() => setCheckingSession(false))
  }, [])

  if (checkingSession) return null
  if (!user) return <Login onLogin={setUser} />
  return (
    <Operations
      user={user}
      cells={cells}
      setCells={setCells}
      users={users}
      setUsers={setUsers}
      onLogout={() => { logout(); setUser(null) }}
    />
  )
}

type UsersSubView = 'directory' | 'map' | 'register'
type CellTypeFilterOption = 'Todas' | 'Carros' | 'Motos'
type CellStateFilterOption = 'Todos' | 'Libre' | 'Ocupada' | 'Fuera de servicio'

function Operations({
  user,
  cells,
  setCells,
  users,
  setUsers,
  onLogout,
}: {
  user: User
  cells: CellRecord[]
  setCells: React.Dispatch<React.SetStateAction<CellRecord[]>>
  users: UserRecord[]
  setUsers: React.Dispatch<React.SetStateAction<UserRecord[]>>
  onLogout: () => void
}) {
  const [opTab, setOpTab] = useState<OpTab>('console')
  const [occupancy, setOccupancy] = useState<Occupancy[]>([])
  const [openTickets, setOpenTickets] = useState<Ticket[]>([])
  // Se incrementa después de cada movimiento para que las vistas vuelvan a consultar la API.
  const [version, setVersion] = useState(0)
  const [toast, setToast] = useState('')
  const [profileOpen, setProfileOpen] = useState(false)
  const [roleMode, setRoleMode] = useState<'Operario' | 'Administrador'>(user.rol === 'Administrador' ? 'Administrador' : 'Operario')
  const [usersSubView, setUsersSubView] = useState<UsersSubView>('directory')
  const [cellTypeFilter, setCellTypeFilter] = useState<CellTypeFilterOption>('Todas')
  const [cellStateFilter, setCellStateFilter] = useState<CellStateFilterOption>('Todos')

  const refreshOperationalState = useCallback(() => {
    getOccupancy().then(setOccupancy).catch(() => {})
    getInside()
      .then((tickets) => {
        setOpenTickets(tickets)
        setCells((prev) => syncCellsWithTickets(prev, tickets))
      })
      .catch(() => {})
  }, [setCells])

  // RF-10: ocupación y tiquetes abiertos en tiempo real; se actualizan tras cada movimiento y cada 15 segundos.
  useEffect(() => {
    refreshOperationalState()
    const timer = window.setInterval(refreshOperationalState, 15000)
    return () => window.clearInterval(timer)
  }, [refreshOperationalState, version])

  const notify = (message: string) => {
    setToast(message)
    window.setTimeout(() => setToast(''), 3200)
  }
  const onChanged = (message: string) => { setVersion(v => v + 1); notify(message) }

  const totalInside = cells.length > 0
    ? cells.filter((c) => c.estado === 'Ocupada').length
    : occupancy.reduce((sum, o) => sum + o.ocupadas, 0)

  // RF-06: si un tipo configurado se queda sin celdas libres, la barra de ocupación lo alerta.
  const fullTypes: VehicleType[] = (['Carro', 'Moto'] as const).filter((tipo) => {
    const typeCells = cells.filter((c) => c.tipo === tipo)
    if (typeCells.length > 0) {
      return typeCells.filter((c) => c.estado === 'Libre').length === 0
    }
    const occ = occupancy.find((o) => o.tipo_vehiculo === tipo)
    return occ ? occ.total > 0 && occ.disponibles === 0 : false
  })

  const openCellsMapForType = (tipo: VehicleType) => {
    setOpTab('users')
    setUsersSubView('map')
    setCellTypeFilter(tipo === 'Carro' ? 'Carros' : 'Motos')
    setCellStateFilter('Todos')
  }

  return <div className="app-shell canvas-shell">
    <div className="canvas-identity">
      <img className="canvas-logo" src="/logo.svg" alt="" />
      <div><strong>PARQUEATE</strong><span>Medellín</span></div>
    </div>

    <main className="main canvas-main">
      <OperationsHeader
        tab={opTab}
        setTab={setOpTab}
        totalInside={totalInside}
        cells={cells}
        onSelectVehicleType={openCellsMapForType}
      />
      {fullTypes.length > 0 && <div className="capacity-alert notice-red"><Icon name="alert" size={17} /><span><strong>Sin celdas libres de {fullTypes.map(t => t === 'Carro' ? 'carro' : 'moto').join(' ni de ')}.</strong> {user.rol === 'Administrador' ? 'Con el cupo garantizado esto indica un error de datos: revisa las celdas fuera de servicio y las mensualidades vigentes.' : 'Avisa al administrador.'}</span></div>}
      <div className="content">
        {opTab === 'console' && <Console cells={cells} onChanged={onChanged} />}
        {opTab === 'inside' && <InsideTable version={version} onChanged={onChanged} />}
        {opTab === 'history' && <HistoryTable version={version} user={user} onChanged={onChanged} />}
        {opTab === 'users' && (
          <UsersModule
            roleMode={roleMode}
            user={user}
            cells={cells}
            setCells={setCells}
            users={users}
            setUsers={setUsers}
            openTickets={openTickets}
            subView={usersSubView}
            setSubView={setUsersSubView}
            cellTypeFilter={cellTypeFilter}
            setCellTypeFilter={setCellTypeFilter}
            cellStateFilter={cellStateFilter}
            setCellStateFilter={setCellStateFilter}
          />
        )}
        {opTab === 'payments' && <ModulePlaceholder title="Pagos y mensualidades" description="Gestión de pagos, vigencias, vencimientos y alertas de renovación." />}
        {opTab === 'config' && <ModulePlaceholder title="Configuración" description="Parámetros del sistema, celdas, acceso y reglas operativas." />}
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
          <button aria-label="Operaciones" className={`dock-item ${opTab === 'console' || opTab === 'inside' || opTab === 'history' ? 'active' : ''}`} onClick={() => setOpTab('console')}><Icon name="grid" size={18} /><span>Operaciones</span></button>
          <button aria-label="Usuarios y celdas" className={`dock-item ${opTab === 'users' ? 'active' : ''}`} onClick={() => setOpTab('users')}><Icon name="car" size={18} /><span>Usuarios y celdas</span></button>
          <button aria-label="Pagos" className={`dock-item ${opTab === 'payments' ? 'active' : ''}`} onClick={() => setOpTab('payments')}><Icon name="check" size={18} /><span>Pagos</span></button>
          <button aria-label="Configuración" className={`dock-item ${opTab === 'config' ? 'active' : ''}`} onClick={() => setOpTab('config')}><Icon name="alert" size={18} /><span>Configuración</span></button>
        </div>
        <div className="dock-role-switch" aria-label="Cambio de rol">
          <button className={roleMode === 'Operario' ? 'active' : ''} onClick={() => setRoleMode('Operario')} type="button">Operario</button>
          <button className={roleMode === 'Administrador' ? 'active' : ''} onClick={() => setRoleMode('Administrador')} type="button">Administrador</button>
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

function OperationsHeader({
  tab,
  setTab,
  totalInside,
  cells,
  onSelectVehicleType,
}: {
  tab: OpTab
  setTab: (t: OpTab) => void
  totalInside: number
  cells: CellRecord[]
  onSelectVehicleType: (tipo: VehicleType) => void
}) {
  const pageTitle = tab === 'console' ? '¿Qué vehículo quieres registrar?' : tab === 'inside' ? 'Vehículos dentro' : tab === 'history' ? 'Historial y trazabilidad' : tab === 'users' ? 'Usuarios y celdas' : tab === 'payments' ? 'Pagos y mensualidades' : 'Configuración del sistema'
  const pageSubtitle = tab === 'console' ? 'Valida una placa y completa el movimiento en segundos.' : tab === 'inside' || tab === 'history' ? 'Consulta la operación sin salir de la estación.' : tab === 'users' ? 'Gestiona acceso, usuarios y disponibilidad del parqueadero.' : tab === 'payments' ? 'Administra pagos, vigencias y recordatorios del servicio.' : 'Configura celdas, roles y reglas operativas del sistema.'

  const renderOccupancyHud = () => (
    <div className="occupancy-hud" role="region" aria-label="Resumen de celdas en vivo">
      {(['Carro', 'Moto'] as const).map((tipo) => {
        const label = tipo === 'Carro' ? 'Carros' : 'Motos'
        const typeCells = cells.filter((c) => c.tipo === tipo)
        const total = typeCells.length
        const ocupadas = typeCells.filter((c) => c.estado === 'Ocupada').length
        const libres = typeCells.filter((c) => c.estado === 'Libre').length
        const fueraDeServicio = typeCells.filter((c) => c.estado === 'Fuera de servicio').length
        const isFull = total > 0 && libres === 0
        const lightTone = total === 0 ? 'gray' : isFull ? 'red' : tipo === 'Carro' ? 'green' : 'amber'
        const tooltip = `Ocupadas: ${ocupadas} | Libres: ${libres} | Fuera de servicio: ${fueraDeServicio}`

        return (
          <button
            key={tipo}
            type="button"
            className={`hud-pill ${isFull ? 'hud-full' : ''}`}
            title={tooltip}
            onClick={() => onSelectVehicleType(tipo)}
          >
            <i className={`hud-light ${lightTone}`} />
            <span>{label}:</span>
            {total > 0 ? (
              <strong>
                {ocupadas} ocupadas · {libres} libres <small>/ {total}</small>
              </strong>
            ) : (
              <strong>
                0 <small>/ 0</small>
              </strong>
            )}
            {fueraDeServicio > 0 && (
              <span className="hud-maint-badge">· ⚠️ {fueraDeServicio} fuera de servicio</span>
            )}
          </button>
        )
      })}
    </div>
  )

  if (tab === 'users') {
    return (
      <>
        {renderOccupancyHud()}
        <div className="page-head spotlight-head compact">
          <div className="title-row">
            <div><span className="eyebrow">ESTACIÓN DE ACCESO · MEDELLÍN</span><h1>{pageTitle}</h1><p>{pageSubtitle}</p></div>
            <div className="date-chip"><Icon name="clock" size={16} /><span><small>HOY</small>{todayLong()}</span></div>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      {renderOccupancyHud()}
      <div className={`page-head spotlight-head ${tab !== 'console' ? 'compact' : ''}`}>
        <div className="title-row">
          <div><span className="eyebrow">ESTACIÓN DE ACCESO · MEDELLÍN</span><h1>{pageTitle}</h1><p>{pageSubtitle}</p></div>
          <div className="date-chip"><Icon name="clock" size={16} /><span><small>HOY</small>{todayLong()}</span></div>
        </div>
        <div className="tabs view-orbit" role="group" aria-label="Vistas de operaciones">
          <button type="button" aria-pressed={tab === 'console'} className={tab === 'console' ? 'active' : ''} onClick={() => setTab('console')}><Icon name="search" size={18} />Registro</button>
          <button type="button" aria-pressed={tab === 'inside'} className={tab === 'inside' ? 'active' : ''} onClick={() => setTab('inside')}><Icon name="car" size={18} />Dentro <span>{totalInside}</span></button>
          <button type="button" aria-pressed={tab === 'history'} className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}><Icon name="clock" size={18} />Historial</button>
        </div>
      </div>
    </>
  )
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

function Console({ cells: moduleCells, onChanged }: { cells: CellRecord[]; onChanged: (message: string) => void }) {
  const [mode, setMode] = useState<'entry' | 'exit'>('entry')
  const [plate, setPlate] = useState('')
  const [vehicle, setVehicle] = useState<VehicleLookup | null>(null)
  const [lookupError, setLookupError] = useState('')
  const [loading, setLoading] = useState(false)
  const [apiFreeCells, setApiFreeCells] = useState<Cell[]>([])
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
    if (mode !== 'entry' || !vehicle || blockReason) { setApiFreeCells([]); return }
    getFreeCells(vehicle.tipo_vehiculo).then(setApiFreeCells).catch(() => setApiFreeCells([]))
  }, [mode, vehicle, blockReason])

  // Excluye en vivo cualquier celda puesta como "Fuera de servicio" en el Módulo 2
  const disabledCodes = new Set(
    moduleCells.filter((c) => c.estado === 'Fuera de servicio').map((c) => c.codigo)
  )
  const cells = apiFreeCells.filter((c) => !disabledCodes.has(c.numero_espacio))

  const canSubmit = !!vehicle && !blockReason && !submitting && (mode === 'exit' || cells.length > 0)
  const notice = vehicle ? monthlyNotice(vehicle) : null

  const changePlate = (value: string) => { setPlate(value.toUpperCase().replace(/[^A-Z0-9]/g, '')); setResult(null) }

  const submit = async () => {
    if (!vehicle || !canSubmit) return
    setSubmitting(true); setSubmitError('')
    const novedad = incident.trim() || null
    try {
      if (mode === 'entry') {
        const chosenCellId = selectedCell ? Number(selectedCell) : (disabledCodes.size > 0 && cells[0] ? cells[0].id_espacio : null)
        const entry: EntryResult = await registerEntry(vehicle.placa, novedad, chosenCellId)
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

function UsersModule({
  roleMode,
  user,
  cells,
  setCells,
  users,
  setUsers,
  openTickets,
  subView,
  setSubView,
  cellTypeFilter,
  setCellTypeFilter,
  cellStateFilter,
  setCellStateFilter,
}: {
  roleMode: 'Operario' | 'Administrador'
  user: User
  cells: CellRecord[]
  setCells: React.Dispatch<React.SetStateAction<CellRecord[]>>
  users: UserRecord[]
  setUsers: React.Dispatch<React.SetStateAction<UserRecord[]>>
  openTickets: Ticket[]
  subView: UsersSubView
  setSubView: React.Dispatch<React.SetStateAction<UsersSubView>>
  cellTypeFilter: CellTypeFilterOption
  setCellTypeFilter: React.Dispatch<React.SetStateAction<CellTypeFilterOption>>
  cellStateFilter: CellStateFilterOption
  setCellStateFilter: React.Dispatch<React.SetStateAction<CellStateFilterOption>>
}) {
  const isAdmin = roleMode === 'Administrador'
  const currentOperatorName = user.nombre || (isAdmin ? 'Administrador' : 'Operario')
  const [search, setSearch] = useState('')
  const [estadoFilter, setEstadoFilter] = useState<'Todos' | 'Activos' | 'Inactivos'>('Todos')
  const [vehiculoFilter, setVehiculoFilter] = useState<'Todos' | 'Carros' | 'Motos'>('Todos')
  const [selectedCellCode, setSelectedCellCode] = useState<string | null>(cells[0]?.codigo ?? null)
  const [newCellOpen, setNewCellOpen] = useState(false)
  const [newCellForm, setNewCellForm] = useState({ codigo: '', tipo: 'Carro' as VehicleType })
  const [newCellError, setNewCellError] = useState('')
  const [cellReason, setCellReason] = useState('')
  const [cellActionError, setCellActionError] = useState('')
  const [cellNewType, setCellNewType] = useState<VehicleType>('Carro')
  const [registerForm, setRegisterForm] = useState({ documentoTipo: 'CC' as UserRecord['documentoTipo'], documento: '', nombres: '', apellidos: '', celular: '', correo: '', tipo: 'Carro' as VehicleType, placa: '', marca: '', color: '', habeas: false })
  const [registerError, setRegisterError] = useState('')
  const [registerSuccess, setRegisterSuccess] = useState('')
  const [editingUser, setEditingUser] = useState<UserRecord | null>(null)
  const [editingVehicleId, setEditingVehicleId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState({ celular: '', correo: '', marca: '', color: '' })
  const [editError, setEditError] = useState('')
  const [modalUserAction, setModalUserAction] = useState<{ userId: number; kind: 'user' | 'vehicle'; vehicleId?: number } | null>(null)
  const [modalReason, setModalReason] = useState('')
  const [modalError, setModalError] = useState('')
  const [vehicleModalUser, setVehicleModalUser] = useState<UserRecord | null>(null)
  const [vehicleModalForm, setVehicleModalForm] = useState({ placa: '', tipo: 'Carro' as VehicleType, marca: '', color: '' })
  const [auditModalUser, setAuditModalUser] = useState<UserRecord | null>(null)

  const initializeCells = () => {
    const nextCells = buildInitialCells(currentOperatorName, openTickets)
    setCells(nextCells)
    setSelectedCellCode(nextCells[0]?.codigo ?? null)
  }

  // Busca si una placa tiene una entrada abierta en el parqueadero (Módulo 1 o celda ocupada en el mapa)
  const findOpenEntryForPlate = (placa: string): { placa: string; celda: string } | null => {
    const normalized = placa.trim().toUpperCase()
    const fromTicket = openTickets.find((t) => t.placa.toUpperCase() === normalized)
    if (fromTicket) return { placa: fromTicket.placa, celda: fromTicket.numero_espacio }
    const fromCell = cells.find((c) => c.estado === 'Ocupada' && c.placa?.toUpperCase() === normalized)
    if (fromCell) return { placa: normalized, celda: fromCell.codigo }
    return null
  }

  const filteredUsers = users.filter((u) => {
    const text = `${u.documentoTipo} ${u.documento} ${u.nombres} ${u.apellidos} ${u.vehiculos.map(v => v.placa).join(' ')}`.toLowerCase()
    const stateOk = estadoFilter === 'Todos' || (estadoFilter === 'Activos' ? u.estado === 'Activo' : u.estado === 'Inactivo')
    const typeOk = vehiculoFilter === 'Todos' || u.vehiculos.some(v => (vehiculoFilter === 'Carros' ? v.tipo === 'Carro' : v.tipo === 'Moto'))
    return (!search || text.includes(search.toLowerCase())) && stateOk && typeOk
  })

  const selectedCell = cells.find((cell) => cell.codigo === selectedCellCode) ?? null
  const userCount = users.filter((u) => u.estado === 'Activo').length

  const filteredCells = cells.filter((cell) => {
    const typeOk = cellTypeFilter === 'Todas' || (cellTypeFilter === 'Carros' ? cell.tipo === 'Carro' : cell.tipo === 'Moto')
    const stateOk = cellStateFilter === 'Todos' || cell.estado === cellStateFilter
    return typeOk && stateOk
  })

  // Conteo de mensualidades/vehículos activos por tipo para garantizar el cupo
  const activeCarVehiclesCount = users
    .filter((u) => u.estado === 'Activo')
    .reduce((acc, u) => acc + u.vehiculos.filter((v) => v.estado === 'Activo' && v.tipo === 'Carro').length, 0)
  const activeMotoVehiclesCount = users
    .filter((u) => u.estado === 'Activo')
    .reduce((acc, u) => acc + u.vehiculos.filter((v) => v.estado === 'Activo' && v.tipo === 'Moto').length, 0)

  const carOccupiedCount = cells.filter((c) => c.tipo === 'Carro' && c.estado === 'Ocupada').length
  const motoOccupiedCount = cells.filter((c) => c.tipo === 'Moto' && c.estado === 'Ocupada').length

  const carActiveSubscriptions = Math.max(activeCarVehiclesCount, carOccupiedCount)
  const motoActiveSubscriptions = Math.max(activeMotoVehiclesCount, motoOccupiedCount)

  const createUser = () => {
    const { documentoTipo, documento, nombres, apellidos, celular, correo, tipo, placa, marca, color, habeas } = registerForm
    const trimmedDoc = documento.trim()
    const trimmedNames = nombres.trim()
    const trimmedLast = apellidos.trim()
    if (!trimmedDoc || !trimmedNames || !trimmedLast || !celular.trim() || !placa.trim() || !marca.trim() || !color.trim()) {
      setRegisterError('Completa todos los campos obligatorios antes de guardar.')
      return
    }
    if (!habeas) {
      setRegisterError('Debes autorizar el tratamiento de datos personales (Ley 1581 de 2012) para continuar.')
      return
    }
    const plate = placa.trim().toUpperCase()
    const regex = tipo === 'Carro' ? /^[A-Z]{3}[0-9]{3}$/ : /^[A-Z]{3}[0-9]{2}[A-Z]{1}$/
    if (!regex.test(plate)) {
      setRegisterError(tipo === 'Carro' ? 'La placa no corresponde al formato de carro (ej. ABC123)' : 'La placa no corresponde al formato de moto (ej. ABC12D)')
      return
    }
    const duplicatedDocument = users.find((u) => u.documento === trimmedDoc)
    if (duplicatedDocument) {
      setRegisterError(`El documento ${duplicatedDocument.documentoTipo} ${trimmedDoc} ya está registrado para ${duplicatedDocument.nombres} ${duplicatedDocument.apellidos}.`)
      return
    }
    const duplicatedPlate = users.some((u) => u.vehiculos.some((vehicle) => vehicle.placa === plate))
    if (duplicatedPlate) {
      setRegisterError(`La placa ${plate} ya está registrada en otro usuario del sistema.`)
      return
    }

    const nowIso = new Date().toISOString()
    const newUser: UserRecord = {
      id: Date.now(),
      documentoTipo,
      documento: trimmedDoc,
      nombres: trimmedNames,
      apellidos: trimmedLast,
      celular: celular.trim(),
      correo: correo.trim(),
      estado: 'Activo',
      fechaRegistro: nowIso,
      operario: currentOperatorName,
      autorizacionHabeasData: true,
      vehiculos: [{ id: Date.now() + 1, placa: plate, tipo, marca: marca.trim(), color: color.trim(), estado: 'Activo' }],
      auditLogs: [{
        id: Date.now() + 2,
        fecha: nowIso,
        usuario: currentOperatorName,
        campo: 'Registro inicial (Usuario + Vehículo + Habeas Data)',
        valorAnterior: 'Sin registro',
        valorNuevo: `${documentoTipo} ${trimmedDoc} · ${trimmedNames} ${trimmedLast} · Vehículo ${plate} (${tipo})`,
      }],
    }
    setUsers((prev) => [newUser, ...prev])
    setSubView('directory')
    setRegisterForm({ documentoTipo: 'CC', documento: '', nombres: '', apellidos: '', celular: '', correo: '', tipo: 'Carro', placa: '', marca: '', color: '', habeas: false })
    setRegisterError('')
    setRegisterSuccess('Usuario y vehículo registrados satisfactoriamente.')
    setTimeout(() => setRegisterSuccess(''), 2600)
  }

  const saveUserEdits = () => {
    if (!editingUser || editingVehicleId === null) return
    const currentVehicle = editingUser.vehiculos.find((item) => item.id === editingVehicleId)
    if (!currentVehicle) return

    const nextCelular = editForm.celular.trim()
    const nextCorreo = editForm.correo.trim()
    const nextMarca = editForm.marca.trim()
    const nextColor = editForm.color.trim()

    if (!nextCelular || !nextMarca || !nextColor) {
      setEditError('El celular, la marca y el color del vehículo son obligatorios.')
      return
    }

    const prevCelular = editingUser.celular
    const prevCorreo = editingUser.correo || 'Sin correo'
    const prevMarca = currentVehicle.marca
    const prevColor = currentVehicle.color

    const newLogs: AuditEntry[] = []
    const nowIso = new Date().toISOString()

    if (prevCelular !== nextCelular || editingUser.correo !== nextCorreo) {
      newLogs.push({
        id: Date.now() + 1,
        fecha: nowIso,
        usuario: currentOperatorName,
        campo: 'Datos de contacto (Celular / Correo)',
        valorAnterior: `${prevCelular} / ${prevCorreo}`,
        valorNuevo: `${nextCelular} / ${nextCorreo || 'Sin correo'}`,
      })
    }

    if (prevMarca !== nextMarca || prevColor !== nextColor) {
      newLogs.push({
        id: Date.now() + 2,
        fecha: nowIso,
        usuario: currentOperatorName,
        campo: `Vehículo ${currentVehicle.placa} (Marca / Color)`,
        valorAnterior: `${prevMarca} · ${prevColor}`,
        valorNuevo: `${nextMarca} · ${nextColor}`,
      })
    }

    if (newLogs.length === 0) {
      setEditingUser(null)
      setEditingVehicleId(null)
      setEditError('')
      return
    }

    const updatedUser: UserRecord = {
      ...editingUser,
      celular: nextCelular,
      correo: nextCorreo,
      vehiculos: editingUser.vehiculos.map((v) =>
        v.id === editingVehicleId ? { ...v, marca: nextMarca, color: nextColor } : v
      ),
      auditLogs: [...newLogs, ...editingUser.auditLogs],
    }

    setUsers((prev) => prev.map((u) => (u.id === updatedUser.id ? updatedUser : u)))
    setEditingUser(null)
    setEditingVehicleId(null)
    setEditForm({ celular: '', correo: '', marca: '', color: '' })
    setEditError('')
  }

  const addVehicleToUser = () => {
    if (!vehicleModalUser) return
    const plate = vehicleModalForm.placa.trim().toUpperCase()
    const marca = vehicleModalForm.marca.trim()
    const color = vehicleModalForm.color.trim()

    if (!plate || !marca || !color) {
      setModalError('Completa la placa, marca y color del vehículo.')
      return
    }
    const regex = vehicleModalForm.tipo === 'Carro' ? /^[A-Z]{3}[0-9]{3}$/ : /^[A-Z]{3}[0-9]{2}[A-Z]{1}$/
    if (!regex.test(plate)) {
      setModalError(vehicleModalForm.tipo === 'Carro' ? 'La placa no corresponde al formato de carro (ej. ABC123)' : 'La placa no corresponde al formato de moto (ej. ABC12D)')
      return
    }
    if (users.some((u) => u.vehiculos.some((vehicle) => vehicle.placa === plate))) {
      setModalError(`La placa ${plate} ya está registrada en el sistema.`)
      return
    }
    const nowIso = new Date().toISOString()
    const newVehicle: UserVehicle = {
      id: Date.now(),
      placa: plate,
      tipo: vehicleModalForm.tipo,
      marca,
      color,
      estado: 'Activo',
    }
    const newAudit: AuditEntry = {
      id: Date.now() + 1,
      fecha: nowIso,
      usuario: currentOperatorName,
      campo: `Asociación de vehículo (${plate})`,
      valorAnterior: 'Sin registro',
      valorNuevo: `${plate} · ${vehicleModalForm.tipo} · ${marca} · ${color}`,
    }
    setUsers((prev) =>
      prev.map((u) =>
        u.id === vehicleModalUser.id
          ? { ...u, vehiculos: [...u.vehiculos, newVehicle], auditLogs: [newAudit, ...u.auditLogs] }
          : u
      )
    )
    setVehicleModalUser(null)
    setVehicleModalForm({ placa: '', tipo: 'Carro', marca: '', color: '' })
    setModalError('')
  }

  const toggleUserState = () => {
    if (!modalUserAction) return
    const targetUser = users.find((u) => u.id === modalUserAction.userId)
    if (!targetUser) return

    const reason = modalReason.trim()
    if (!reason) {
      setModalError('Es obligatorio indicar un motivo para realizar este cambio de estado.')
      return
    }

    const nowIso = new Date().toISOString()

    if (modalUserAction.kind === 'user') {
      const nextState: UserStatus = targetUser.estado === 'Activo' ? 'Inactivo' : 'Activo'
      if (nextState === 'Inactivo') {
        for (const v of targetUser.vehiculos) {
          const openEntry = findOpenEntryForPlate(v.placa)
          if (openEntry) {
            setModalError(`No se puede inactivar al usuario porque el vehículo ${openEntry.placa} tiene una entrada abierta en la celda ${openEntry.celda}.`)
            return
          }
        }
      }
      setUsers((prev) =>
        prev.map((u) =>
          u.id === modalUserAction.userId
            ? {
                ...u,
                estado: nextState,
                auditLogs: [
                  {
                    id: Date.now(),
                    fecha: nowIso,
                    usuario: currentOperatorName,
                    campo: 'Estado de usuario',
                    valorAnterior: u.estado,
                    valorNuevo: `${nextState} (Motivo: ${reason})`,
                  },
                  ...u.auditLogs,
                ],
              }
            : u
        )
      )
    } else {
      const targetVehicle = targetUser.vehiculos.find((vehicle) => vehicle.id === modalUserAction.vehicleId)
      if (!targetVehicle) return
      const updatedVehicleState: UserStatus = targetVehicle.estado === 'Activo' ? 'Inactivo' : 'Activo'
      if (updatedVehicleState === 'Inactivo') {
        const openEntry = findOpenEntryForPlate(targetVehicle.placa)
        if (openEntry) {
          setModalError(`No se puede inactivar el vehículo ${openEntry.placa} porque tiene una entrada abierta en la celda ${openEntry.celda}.`)
          return
        }
      }
      setUsers((prev) =>
        prev.map((u) =>
          u.id === targetUser.id
            ? {
                ...u,
                vehiculos: u.vehiculos.map((vehicle) =>
                  vehicle.id === modalUserAction.vehicleId ? { ...vehicle, estado: updatedVehicleState } : vehicle
                ),
                auditLogs: [
                  {
                    id: Date.now(),
                    fecha: nowIso,
                    usuario: currentOperatorName,
                    campo: `Estado de vehículo ${targetVehicle.placa}`,
                    valorAnterior: targetVehicle.estado,
                    valorNuevo: `${updatedVehicleState} (Motivo: ${reason})`,
                  },
                  ...u.auditLogs,
                ],
              }
            : u
        )
      )
    }

    setModalUserAction(null)
    setModalReason('')
    setModalError('')
  }

  const handleCellStatusChange = () => {
    if (!selectedCell) return
    if (!isAdmin) {
      setCellActionError('Solo el administrador puede cambiar el estado operativo de una celda.')
      return
    }
    const reason = cellReason.trim()
    if (!reason) {
      setCellActionError('El motivo es obligatorio para cambiar el estado de la celda.')
      return
    }
    if (selectedCell.estado === 'Ocupada') {
      setCellActionError(`No se puede modificar la celda ${selectedCell.codigo} porque está ocupada actualmente por el vehículo de placa ${selectedCell.placa}.`)
      return
    }
    if (selectedCell.estado === 'Libre') {
      const currentAvailable = cells.filter((c) => c.tipo === selectedCell.tipo && c.estado !== 'Fuera de servicio').length
      const requiredQuota = selectedCell.tipo === 'Carro' ? carActiveSubscriptions : motoActiveSubscriptions
      if (currentAvailable - 1 < requiredQuota) {
        setCellActionError(
          `Cupo garantizado: no se puede poner la celda ${selectedCell.codigo} en Fuera de servicio porque quedarían ${currentAvailable - 1} celdas disponibles de ${selectedCell.tipo.toLowerCase()} para ${requiredQuota} mensualidades vigentes.`
        )
        return
      }
      setCells((prev) =>
        prev.map((cell) =>
          cell.codigo === selectedCell.codigo
            ? {
                ...cell,
                estado: 'Fuera de servicio',
                motivo: reason,
                historial: [
                  {
                    id: Date.now(),
                    momento: new Date().toISOString(),
                    usuario: currentOperatorName,
                    accion: 'Cambio de Libre → Fuera de servicio',
                    motivo: reason,
                  },
                  ...cell.historial,
                ],
              }
            : cell
        )
      )
      setCellReason('')
      setCellActionError('')
      return
    }
    setCells((prev) =>
      prev.map((cell) =>
        cell.codigo === selectedCell.codigo
          ? {
              ...cell,
              estado: 'Libre',
              motivo: null,
              historial: [
                {
                  id: Date.now(),
                  momento: new Date().toISOString(),
                  usuario: currentOperatorName,
                  accion: 'Restablecimiento Fuera de servicio → Libre',
                  motivo: reason,
                },
                ...cell.historial,
              ],
            }
          : cell
      )
    )
    setCellReason('')
    setCellActionError('')
  }

  const handleCellTypeChange = () => {
    if (!selectedCell) return
    if (!isAdmin) {
      setCellActionError('Solo el administrador puede cambiar el tipo de vehículo de una celda.')
      return
    }
    const reason = cellReason.trim()
    if (!reason) {
      setCellActionError('Debes indicar el motivo obligatorio para cambiar el tipo de celda.')
      return
    }
    if (selectedCell.estado === 'Ocupada') {
      setCellActionError(`No se puede modificar la celda ${selectedCell.codigo} porque está ocupada actualmente por el vehículo de placa ${selectedCell.placa}.`)
      return
    }
    if (cellNewType === selectedCell.tipo) {
      setCellActionError(`La celda ${selectedCell.codigo} ya está configurada para ${selectedCell.tipo}.`)
      return
    }
    if (selectedCell.estado !== 'Fuera de servicio') {
      const currentAvailable = cells.filter((c) => c.tipo === selectedCell.tipo && c.estado !== 'Fuera de servicio').length
      const requiredQuota = selectedCell.tipo === 'Carro' ? carActiveSubscriptions : motoActiveSubscriptions
      if (currentAvailable - 1 < requiredQuota) {
        setCellActionError(
          `Cupo garantizado: no se puede cambiar el tipo de ${selectedCell.codigo} porque quedarían ${currentAvailable - 1} celdas disponibles de ${selectedCell.tipo.toLowerCase()} para ${requiredQuota} mensualidades vigentes.`
        )
        return
      }
    }
    const previousType = selectedCell.tipo
    setCells((prev) =>
      prev.map((cell) =>
        cell.codigo === selectedCell.codigo
          ? {
              ...cell,
              tipo: cellNewType,
              historial: [
                {
                  id: Date.now(),
                  momento: new Date().toISOString(),
                  usuario: currentOperatorName,
                  accion: `Cambio de tipo (${previousType} → ${cellNewType})`,
                  motivo: reason,
                },
                ...cell.historial,
              ],
            }
          : cell
      )
    )
    setCellReason('')
    setCellActionError('')
  }

  const renderDirectory = () => (
    <div className="module-panel">
      <div className="module-panel-head">
        <h2>Usuarios y vehículos registrados</h2>
        <button className="primary-btn" onClick={() => setSubView('register')}>+ Nuevo Usuario y Vehículo</button>
      </div>
      <div className="module-toolbar">
        <div className="search-box wide">
          <Icon name="search" size={14} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por documento, nombre o placa (ej. 1020304050, Laura Gómez, XYZ789)" />
        </div>
        <div className="filter-stack">
          <div className="filter-group"><span>Estado</span><div className="filter-pills">{(['Todos', 'Activos', 'Inactivos'] as const).map((option) => <button key={option} type="button" className={`filter-pill ${estadoFilter === option ? 'active' : ''}`} onClick={() => setEstadoFilter(option)}>{option}</button>)}</div></div>
          <div className="filter-group"><span>Vehículo</span><div className="filter-pills">{(['Todos', 'Carros', 'Motos'] as const).map((option) => <button key={option} type="button" className={`filter-pill ${vehiculoFilter === option ? 'active' : ''}`} onClick={() => setVehiculoFilter(option)}>{option}</button>)}</div></div>
        </div>
      </div>
      {registerSuccess && <div className="notice notice-green"><Icon name="check" size={16} /><span>{registerSuccess}</span></div>}
      {filteredUsers.length === 0 ? (
        <div className="module-empty">
          <div className="empty-icon"><Icon name="search" size={22} /></div>
          <h3>{users.length === 0 ? 'No hay usuarios registrados aún' : 'Sin resultados para este filtro'}</h3>
          <p>{users.length === 0 ? 'El directorio está vacío y listo para registrar el primer usuario y su primer vehículo.' : 'Prueba ajustando el texto de búsqueda o los filtros de estado y tipo de vehículo.'}</p>
          {users.length === 0 && <button className="primary-btn" onClick={() => setSubView('register')}>+ Registrar primer usuario y vehículo</button>}
        </div>
      ) : (
        <div className="module-table-wrap">
          <table className="module-table">
            <thead>
              <tr>
                <th>DOCUMENTO</th>
                <th>USUARIO</th>
                <th>CONTACTO</th>
                <th>VEHÍCULOS ASOCIADOS</th>
                <th>ESTADO</th>
                <th>ACCIONES</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((u) => (
                <tr key={u.id}>
                  <td><div className="doc-pill">{u.documentoTipo} {u.documento}</div></td>
                  <td>
                    <div className="user-meta">
                      <div className="avatar avatar-light">{`${u.nombres.slice(0, 1)}${u.apellidos.slice(0, 1)}`.toUpperCase()}</div>
                      <div>
                        <strong>{`${u.nombres} ${u.apellidos}`}</strong>
                        <small>Registrado {new Date(u.fechaRegistro).toLocaleDateString('es-CO')} · {u.operario}</small>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div className="contact-stack">
                      <span>{u.celular}</span>
                      <span>{u.correo || 'Sin correo'}</span>
                    </div>
                  </td>
                  <td>
                    <div className="vehicle-list">
                      {u.vehiculos.map((vehicle) => (
                        <div key={vehicle.id} className="vehicle-badge-wrap">
                          <span className="vehicle-badge"><strong>{vehicle.placa}</strong><small>{vehicle.tipo}</small></span>
                          <span className="vehicle-meta">{vehicle.marca} · {vehicle.color}</span>
                          <span className={`mini-badge ${vehicle.estado === 'Activo' ? 'success' : 'muted'}`}>{vehicle.estado}</span>
                          {isAdmin && (
                            <button
                              className={`secondary-btn tiny ${vehicle.estado === 'Activo' ? 'danger' : ''}`}
                              onClick={() => {
                                setModalUserAction({ userId: u.id, kind: 'vehicle', vehicleId: vehicle.id })
                                setModalReason('')
                                setModalError('')
                              }}
                            >
                              {vehicle.estado === 'Activo' ? 'Inactivar' : 'Reactivar'}
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </td>
                  <td><span className={`status-pill ${u.estado === 'Activo' ? 'success' : 'muted'}`}>{u.estado}</span></td>
                  <td>
                    <div className="action-stack">
                      <button
                        className="secondary-btn tiny"
                        onClick={() => {
                          const firstVeh = u.vehiculos[0]
                          setEditingUser(u)
                          setEditingVehicleId(firstVeh?.id ?? null)
                          setEditForm({ celular: u.celular, correo: u.correo, marca: firstVeh?.marca ?? '', color: firstVeh?.color ?? '' })
                          setEditError('')
                        }}
                      >
                        Editar datos
                      </button>
                      <button
                        className="secondary-btn tiny"
                        onClick={() => {
                          setVehicleModalUser(u)
                          setVehicleModalForm({ placa: '', tipo: 'Carro', marca: '', color: '' })
                          setModalError('')
                        }}
                      >
                        + Agregar vehículo
                      </button>
                      <button
                        className="secondary-btn tiny"
                        onClick={() => setAuditModalUser(u)}
                      >
                        Historial ({u.auditLogs.length})
                      </button>
                      {isAdmin && (
                        <button
                          className={`secondary-btn tiny ${u.estado === 'Activo' ? 'danger' : ''}`}
                          onClick={() => {
                            setModalUserAction({ userId: u.id, kind: 'user' })
                            setModalReason('')
                            setModalError('')
                          }}
                        >
                          {u.estado === 'Activo' ? 'Inactivar' : 'Reactivar'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )

  const renderRegister = () => (
    <div className="module-panel">
      <div className="module-panel-head"><h2>Registrar usuario y vehículo</h2></div>
      <form className="register-form" onSubmit={(e) => { e.preventDefault(); createUser() }}>
        {registerError && <div className="notice notice-red"><Icon name="alert" size={16} /><span>{registerError}</span></div>}
        {registerSuccess && <div className="notice notice-green"><Icon name="check" size={16} /><span>{registerSuccess}</span></div>}
        <div className="form-grid">
          <div className="form-column">
            <div className="field"><label>Tipo de documento</label><select value={registerForm.documentoTipo} onChange={(e) => setRegisterForm((prev) => ({ ...prev, documentoTipo: e.target.value as typeof prev.documentoTipo }))}><option value="CC">CC</option><option value="CE">CE</option><option value="TI">TI</option><option value="PAS">PAS</option></select></div>
            <div className="field"><label>Número de documento (único e ineditable)</label><input value={registerForm.documento} onChange={(e) => setRegisterForm((prev) => ({ ...prev, documento: e.target.value }))} placeholder="1020304050" /></div>
            <div className="field"><label>Nombres</label><input value={registerForm.nombres} onChange={(e) => setRegisterForm((prev) => ({ ...prev, nombres: e.target.value }))} placeholder="Laura" /></div>
            <div className="field"><label>Apellidos</label><input value={registerForm.apellidos} onChange={(e) => setRegisterForm((prev) => ({ ...prev, apellidos: e.target.value }))} placeholder="Gómez" /></div>
            <div className="field"><label>Celular</label><input value={registerForm.celular} onChange={(e) => setRegisterForm((prev) => ({ ...prev, celular: e.target.value }))} placeholder="3014567890" /></div>
            <div className="field"><label>Correo electrónico</label><input value={registerForm.correo} onChange={(e) => setRegisterForm((prev) => ({ ...prev, correo: e.target.value }))} placeholder="correo@ejemplo.com" /></div>
          </div>
          <div className="form-column">
            <div className="field"><label>Tipo de vehículo</label><div className="segmented pills-inline"><button type="button" className={registerForm.tipo === 'Carro' ? 'active' : ''} onClick={() => setRegisterForm((prev) => ({ ...prev, tipo: 'Carro' }))}>Carro</button><button type="button" className={registerForm.tipo === 'Moto' ? 'active' : ''} onClick={() => setRegisterForm((prev) => ({ ...prev, tipo: 'Moto' }))}>Moto</button></div></div>
            <div className="field">
              <label>Placa (única e ineditable)</label>
              <input value={registerForm.placa} maxLength={6} onChange={(e) => setRegisterForm((prev) => ({ ...prev, placa: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') }))} placeholder={registerForm.tipo === 'Carro' ? 'ABC123' : 'ABC12D'} />
              {registerForm.placa && !new RegExp(registerForm.tipo === 'Carro' ? /^[A-Z]{3}[0-9]{3}$/ : /^[A-Z]{3}[0-9]{2}[A-Z]{1}$/).test(registerForm.placa) && (
                <small className="field-error">La placa no corresponde al formato de {registerForm.tipo === 'Carro' ? 'carro (ej. ABC123)' : 'moto (ej. ABC12D)'}</small>
              )}
            </div>
            <div className="field"><label>Marca</label><input value={registerForm.marca} onChange={(e) => setRegisterForm((prev) => ({ ...prev, marca: e.target.value }))} placeholder="Renault" /></div>
            <div className="field"><label>Color</label><input value={registerForm.color} onChange={(e) => setRegisterForm((prev) => ({ ...prev, color: e.target.value }))} placeholder="Blanco" /></div>
          </div>
        </div>
        <label className="check-row"><input type="checkbox" checked={registerForm.habeas} onChange={(e) => setRegisterForm((prev) => ({ ...prev, habeas: e.target.checked }))} /> Autorizo el tratamiento de mis datos personales conforme a la Ley 1581 de 2012 (Habeas Data).</label>
        <div className="register-actions"><button className="primary-btn" type="submit">Guardar Usuario y Vehículo</button></div>
      </form>
    </div>
  )

  const renderMap = () => {
    if (cells.length === 0) {
      return (
        <div className="module-panel">
          <div className="module-panel-head">
            <h2>Mapa de celdas (80)</h2>
            {isAdmin && <button className="primary-btn" onClick={initializeCells}>Configuración inicial (70 Carros / 10 Motos)</button>}
          </div>
          <div className="module-empty">
            <div className="empty-icon"><Icon name="grid" size={22} /></div>
            <h3>No se han configurado las celdas del parqueadero</h3>
            <p>Ejecuta la configuración inicial para crear el inventario completo de 70 carros (C-01 a C-70) y 10 motos (M-01 a M-10).</p>
            {isAdmin ? (
              <button className="primary-btn" onClick={initializeCells}>Ejecutar configuración inicial (70 Carros / 10 Motos)</button>
            ) : (
              <small>Cambia al modo Administrador en el dock inferior para ejecutar la configuración inicial.</small>
            )}
          </div>
        </div>
      )
    }

    const carCells = filteredCells.filter((cell) => cell.tipo === 'Carro')
    const motoCells = filteredCells.filter((cell) => cell.tipo === 'Moto')
    const carTotal = cells.filter((cell) => cell.tipo === 'Carro').length
    const motoTotal = cells.filter((cell) => cell.tipo === 'Moto').length
    const carAvailable = cells.filter((cell) => cell.tipo === 'Carro' && cell.estado !== 'Fuera de servicio').length
    const motoAvailable = cells.filter((cell) => cell.tipo === 'Moto' && cell.estado !== 'Fuera de servicio').length

    const statusClassFor = (estado: CellStatus) =>
      estado === 'Libre' ? 'free libre' : estado === 'Ocupada' ? 'occupied ocupada' : 'disabled fueradeservicio'

    return (
      <div className="module-panel">
        <div className="module-panel-head">
          <h2>Mapa de celdas ({cells.length})</h2>
          {isAdmin && <button className="primary-btn" onClick={() => { setNewCellOpen(true); setNewCellError('') }}>+ Crear celda</button>}
        </div>
        <div className="module-summary-grid">
          <div className="module-summary-card">
            <div className="module-summary-icon green" />
            <div className="module-summary-copy">
              <strong>
                Carros: {cells.filter((cell) => cell.tipo === 'Carro' && cell.estado === 'Ocupada').length} ocupadas, {cells.filter((cell) => cell.tipo === 'Carro' && cell.estado === 'Libre').length} libres, {cells.filter((cell) => cell.tipo === 'Carro' && cell.estado === 'Fuera de servicio').length} fuera de servicio de {carTotal || 70}
              </strong>
              <small>Mensualidades vigentes: {carActiveSubscriptions} · Celdas disponibles (cupo activo): {carAvailable} de {carTotal || 70}</small>
            </div>
          </div>
          <div className="module-summary-card">
            <div className="module-summary-icon amber" />
            <div className="module-summary-copy">
              <strong>
                Motos: {cells.filter((cell) => cell.tipo === 'Moto' && cell.estado === 'Ocupada').length} ocupadas, {cells.filter((cell) => cell.tipo === 'Moto' && cell.estado === 'Libre').length} libres, {cells.filter((cell) => cell.tipo === 'Moto' && cell.estado === 'Fuera de servicio').length} fuera de servicio de {motoTotal || 10}
              </strong>
              <small>Mensualidades vigentes: {motoActiveSubscriptions} · Celdas disponibles (cupo activo): {motoAvailable} de {motoTotal || 10}</small>
            </div>
          </div>
        </div>

        <div className="module-toolbar compact">
          <div className="filter-group">
            <span>Tipo</span>
            <div className="filter-pills">
              {(['Todas', 'Carros', 'Motos'] as const).map((option) => (
                <button key={option} type="button" className={`filter-pill ${cellTypeFilter === option ? 'active' : ''}`} onClick={() => setCellTypeFilter(option)}>
                  {option === 'Todas' ? `Todas (${cells.length})` : option === 'Carros' ? `Carros (${carTotal})` : `Motos (${motoTotal})`}
                </button>
              ))}
            </div>
          </div>
          <div className="filter-group">
            <span>Estado</span>
            <div className="filter-pills">
              {(['Todos', 'Libre', 'Ocupada', 'Fuera de servicio'] as const).map((option) => (
                <button key={option} type="button" className={`filter-pill ${cellStateFilter === option ? 'active' : ''}`} onClick={() => setCellStateFilter(option)}>
                  {option}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="cell-layout">
          {carCells.length > 0 && (
            <div className="cell-group">
              <h3>CARROS / C-01 — C-70 ({carCells.length})</h3>
              <div className="cell-grid">
                {carCells.map((cell) => (
                  <button
                    key={cell.codigo}
                    type="button"
                    className={`cell-card ${statusClassFor(cell.estado)} ${selectedCell?.codigo === cell.codigo ? 'selected' : ''}`}
                    onClick={() => {
                      setSelectedCellCode(cell.codigo)
                      setCellNewType(cell.tipo === 'Carro' ? 'Moto' : 'Carro')
                      setCellActionError('')
                    }}
                  >
                    <span className="cell-code">{cell.codigo}</span>
                    <span className="cell-status-label">{cell.estado}</span>
                    {cell.estado === 'Ocupada' ? (
                      <small>{cell.placa}{cell.hora ? ` · ${cell.hora}` : ''}</small>
                    ) : cell.estado === 'Fuera de servicio' ? (
                      <small>{cell.motivo ?? 'En mantenimiento'}</small>
                    ) : (
                      <small>Disponible</small>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {motoCells.length > 0 && (
            <div className="cell-group">
              <h3>MOTOS / M-01 — M-10 ({motoCells.length})</h3>
              <div className="cell-grid small-grid">
                {motoCells.map((cell) => (
                  <button
                    key={cell.codigo}
                    type="button"
                    className={`cell-card ${statusClassFor(cell.estado)} ${selectedCell?.codigo === cell.codigo ? 'selected' : ''}`}
                    onClick={() => {
                      setSelectedCellCode(cell.codigo)
                      setCellNewType(cell.tipo === 'Carro' ? 'Moto' : 'Carro')
                      setCellActionError('')
                    }}
                  >
                    <span className="cell-code">{cell.codigo}</span>
                    <span className="cell-status-label">{cell.estado}</span>
                    {cell.estado === 'Ocupada' ? (
                      <small>{cell.placa}{cell.hora ? ` · ${cell.hora}` : ''}</small>
                    ) : cell.estado === 'Fuera de servicio' ? (
                      <small>{cell.motivo ?? 'En mantenimiento'}</small>
                    ) : (
                      <small>Disponible</small>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {selectedCell ? (
          <div className="cell-detail-card">
            <div className="detail-meta">
              <span className="detail-tag">{selectedCell.codigo}</span>
              <span className="detail-tag muted">{selectedCell.tipo}</span>
              <span className={`detail-tag ${selectedCell.estado === 'Libre' ? 'green' : selectedCell.estado === 'Ocupada' ? 'amber' : 'gray'}`}>{selectedCell.estado}</span>
              {selectedCell.placa && <span className="detail-tag muted">Placa: {selectedCell.placa}</span>}
              {selectedCell.hora && <span className="detail-tag muted">Ingreso: {selectedCell.hora}</span>}
              {selectedCell.estado === 'Fuera de servicio' && selectedCell.motivo && <span className="detail-tag muted">Motivo actual: {selectedCell.motivo}</span>}
            </div>

            {cellActionError && <div className="notice notice-red"><Icon name="alert" size={16} /><span>{cellActionError}</span></div>}

            {selectedCell.estado === 'Ocupada' ? (
              <div className="notice notice-amber">
                <Icon name="alert" size={16} />
                <span>La celda {selectedCell.codigo} está ocupada por {selectedCell.placa} y no puede pasar a Fuera de servicio ni cambiar de tipo hasta que se registre la salida en Operaciones.</span>
              </div>
            ) : !isAdmin ? (
              <div className="permission-note">Solo el perfil de Administrador puede inhabilitar celdas, restablecerlas a Libre o cambiar su tipo.</div>
            ) : (
              <>
                <div className="cell-detail-grid">
                  <div className="field">
                    <label>Motivo obligatorio ({selectedCell.estado === 'Fuera de servicio' ? 'para restablecer o cambiar tipo' : 'para fuera de servicio o cambio de tipo'})</label>
                    <input value={cellReason} onChange={(e) => { setCellReason(e.target.value); setCellActionError('') }} placeholder={selectedCell.estado === 'Fuera de servicio' ? 'Ej. Reparación completada, celda habilitada...' : 'Ej. Piso en reparación, mantenimiento de luminaria...'} />
                  </div>
                  <div className="field">
                    <label>Cambiar tipo de celda</label>
                    <select value={cellNewType} onChange={(e) => setCellNewType(e.target.value as VehicleType)}>
                      <option value="Carro">Carro</option>
                      <option value="Moto">Moto</option>
                    </select>
                  </div>
                </div>
                <div className="detail-actions">
                  <button className={selectedCell.estado === 'Libre' ? 'secondary-btn danger' : 'primary-btn'} onClick={handleCellStatusChange}>
                    {selectedCell.estado === 'Libre' ? 'Pasar a Fuera de servicio' : 'Restablecer / Habilitar a Libre'}
                  </button>
                  <button className="secondary-btn" onClick={handleCellTypeChange}>
                    Guardar cambio de tipo ({selectedCell.tipo} → {cellNewType})
                  </button>
                </div>
              </>
            )}

            <div className="history-list">
              <h4>Historial de trazabilidad de la celda {selectedCell.codigo}</h4>
              <div className="history-scroll">
                {selectedCell.historial.map((entry) => (
                  <div key={entry.id} className="history-item">
                    <div>
                      <strong>{entry.accion}</strong>
                      <small>{new Date(entry.momento).toLocaleString('es-CO')}</small>
                    </div>
                    <div className="history-meta">
                      <span>Responsable: {entry.usuario}</span>
                      <p>{entry.motivo}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="module-empty compact">
            <div className="empty-icon"><Icon name="grid" size={22} /></div>
            <p>Selecciona una celda del mapa para consultar su estado, gestionar mantenimiento o revisar su historial.</p>
          </div>
        )}
      </div>
    )
  }

  // Datos derivados para el modal de Inactivar / Reactivar
  const actionTargetUser = modalUserAction ? users.find((u) => u.id === modalUserAction.userId) ?? null : null
  const actionTargetVehicle = modalUserAction?.kind === 'vehicle' && actionTargetUser
    ? actionTargetUser.vehiculos.find((v) => v.id === modalUserAction.vehicleId) ?? null
    : null
  const isDeactivating = modalUserAction?.kind === 'user'
    ? actionTargetUser?.estado === 'Activo'
    : actionTargetVehicle?.estado === 'Activo'

  const openEntryBlockingAction = (() => {
    if (!modalUserAction || !actionTargetUser || !isDeactivating) return null
    if (modalUserAction.kind === 'vehicle' && actionTargetVehicle) {
      return findOpenEntryForPlate(actionTargetVehicle.placa)
    }
    for (const v of actionTargetUser.vehiculos) {
      const open = findOpenEntryForPlate(v.placa)
      if (open) return open
    }
    return null
  })()

  return (
    <section className="module-shell module-users">
      <div className="module-subnav" role="tablist" aria-label="Sub-vistas del módulo 2">
        <button type="button" className={subView === 'directory' ? 'active' : ''} onClick={() => setSubView('directory')}>👥 Directorio de Usuarios {userCount > 0 && <span>{userCount}</span>}</button>
        <button type="button" className={subView === 'map' ? 'active' : ''} onClick={() => setSubView('map')}>🗺️ Mapa de Celdas (80)</button>
        <button type="button" className={subView === 'register' ? 'active' : ''} onClick={() => setSubView('register')}>➕ Registrar Usuario y Vehículo</button>
      </div>

      <div className="module-card">
        {subView === 'directory' ? renderDirectory() : subView === 'map' ? renderMap() : renderRegister()}
      </div>

      {/* Modal a) Editar contacto y vehículo (Documento y Placa ineditables) */}
      {editingUser && (
        <div className="modal-backdrop" onMouseDown={() => { setEditingUser(null); setEditError('') }}>
          <div className="modal-card" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <h2>Editar datos de contacto y vehículo</h2>
                <p>El documento y la placa son únicos e ineditables tras su creación. Todo cambio queda en el historial.</p>
              </div>
              <button className="icon-btn" onClick={() => { setEditingUser(null); setEditError('') }} aria-label="Cerrar"><Icon name="x" /></button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <div className="field">
                  <label>Documento (Ineditable)</label>
                  <input value={`${editingUser.documentoTipo} ${editingUser.documento}`} disabled />
                </div>
                <div className="field">
                  <label>Titular</label>
                  <input value={`${editingUser.nombres} ${editingUser.apellidos}`} disabled />
                </div>
                <div className="field">
                  <label>Celular</label>
                  <input value={editForm.celular} onChange={(e) => setEditForm((prev) => ({ ...prev, celular: e.target.value }))} placeholder="3014567890" />
                </div>
                <div className="field">
                  <label>Correo electrónico</label>
                  <input value={editForm.correo} onChange={(e) => setEditForm((prev) => ({ ...prev, correo: e.target.value }))} placeholder="correo@ejemplo.com" />
                </div>
              </div>

              {editingUser.vehiculos.length > 1 && (
                <div className="field">
                  <label>Seleccionar vehículo a editar</label>
                  <select
                    value={editingVehicleId ?? ''}
                    onChange={(e) => {
                      const nextId = Number(e.target.value)
                      const veh = editingUser.vehiculos.find((v) => v.id === nextId)
                      setEditingVehicleId(nextId)
                      if (veh) {
                        setEditForm((prev) => ({ ...prev, marca: veh.marca, color: veh.color }))
                      }
                    }}
                  >
                    {editingUser.vehiculos.map((v) => (
                      <option key={v.id} value={v.id}>{v.placa} ({v.tipo} · {v.marca})</option>
                    ))}
                  </select>
                </div>
              )}

              {(() => {
                const selectedVeh = editingUser.vehiculos.find((v) => v.id === editingVehicleId)
                if (!selectedVeh) return null
                return (
                  <div className="form-grid">
                    <div className="field">
                      <label>Placa (Ineditable)</label>
                      <input value={selectedVeh.placa} disabled />
                    </div>
                    <div className="field">
                      <label>Tipo de vehículo</label>
                      <input value={selectedVeh.tipo} disabled />
                    </div>
                    <div className="field">
                      <label>Marca</label>
                      <input value={editForm.marca} onChange={(e) => setEditForm((prev) => ({ ...prev, marca: e.target.value }))} placeholder="Renault" />
                    </div>
                    <div className="field">
                      <label>Color</label>
                      <input value={editForm.color} onChange={(e) => setEditForm((prev) => ({ ...prev, color: e.target.value }))} placeholder="Blanco" />
                    </div>
                  </div>
                )
              })()}

              {editError && <div className="notice notice-red"><Icon name="alert" size={16} /><span>{editError}</span></div>}
            </div>
            <div className="modal-actions">
              <button className="secondary-btn" onClick={() => { setEditingUser(null); setEditError('') }}>Cancelar</button>
              <button className="primary-btn" onClick={saveUserEdits}>Guardar cambios</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal b) Agregar vehículo adicional (Relación 1 a N) */}
      {vehicleModalUser && (
        <div className="modal-backdrop" onMouseDown={() => { setVehicleModalUser(null); setModalError('') }}>
          <div className="modal-card" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <h2>+ Asociar vehículo adicional</h2>
                <p>Titular: {vehicleModalUser.nombres} {vehicleModalUser.apellidos} ({vehicleModalUser.documentoTipo} {vehicleModalUser.documento})</p>
              </div>
              <button className="icon-btn" onClick={() => { setVehicleModalUser(null); setModalError('') }} aria-label="Cerrar"><Icon name="x" /></button>
            </div>
            <div className="modal-body">
              <div className="field">
                <label>Tipo de vehículo</label>
                <div className="segmented pills-inline">
                  <button type="button" className={vehicleModalForm.tipo === 'Carro' ? 'active' : ''} onClick={() => { setVehicleModalForm((prev) => ({ ...prev, tipo: 'Carro' })); setModalError('') }}>Carro</button>
                  <button type="button" className={vehicleModalForm.tipo === 'Moto' ? 'active' : ''} onClick={() => { setVehicleModalForm((prev) => ({ ...prev, tipo: 'Moto' })); setModalError('') }}>Moto</button>
                </div>
              </div>
              <div className="field">
                <label>Placa (única e ineditable)</label>
                <input
                  value={vehicleModalForm.placa}
                  maxLength={6}
                  onChange={(e) => {
                    setVehicleModalForm((prev) => ({ ...prev, placa: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') }))
                    setModalError('')
                  }}
                  placeholder={vehicleModalForm.tipo === 'Carro' ? 'ABC123' : 'ABC12D'}
                />
                {vehicleModalForm.placa && !new RegExp(vehicleModalForm.tipo === 'Carro' ? /^[A-Z]{3}[0-9]{3}$/ : /^[A-Z]{3}[0-9]{2}[A-Z]{1}$/).test(vehicleModalForm.placa) && (
                  <small className="field-error">Formato inválido para {vehicleModalForm.tipo === 'Carro' ? 'carro (ej. ABC123)' : 'moto (ej. ABC12D)'}</small>
                )}
              </div>
              <div className="form-grid">
                <div className="field">
                  <label>Marca</label>
                  <input value={vehicleModalForm.marca} onChange={(e) => setVehicleModalForm((prev) => ({ ...prev, marca: e.target.value }))} placeholder="Mazda" />
                </div>
                <div className="field">
                  <label>Color</label>
                  <input value={vehicleModalForm.color} onChange={(e) => setVehicleModalForm((prev) => ({ ...prev, color: e.target.value }))} placeholder="Gris" />
                </div>
              </div>
              {modalError && <div className="notice notice-red"><Icon name="alert" size={16} /><span>{modalError}</span></div>}
            </div>
            <div className="modal-actions">
              <button className="secondary-btn" onClick={() => { setVehicleModalUser(null); setModalError('') }}>Cancelar</button>
              <button className="primary-btn" onClick={addVehicleToUser}>Guardar vehículo</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal c) Inactivar / Reactivar usuario o vehículo con motivo obligatorio y bloqueo de entrada abierta */}
      {modalUserAction && actionTargetUser && (
        <div className="modal-backdrop" onMouseDown={() => { setModalUserAction(null); setModalError('') }}>
          <div className="modal-card" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <h2>
                  {isDeactivating ? 'Inactivar' : 'Reactivar'}{' '}
                  {modalUserAction.kind === 'user'
                    ? `usuario ${actionTargetUser.nombres} ${actionTargetUser.apellidos}`
                    : `vehículo ${actionTargetVehicle?.placa ?? ''}`}
                </h2>
                <p>Ningún registro se elimina físicamente. Esta acción requiere motivo obligatorio y queda en la bitácora.</p>
              </div>
              <button className="icon-btn" onClick={() => { setModalUserAction(null); setModalError('') }} aria-label="Cerrar"><Icon name="x" /></button>
            </div>
            <div className="modal-body">
              {openEntryBlockingAction && (
                <div className="notice notice-red">
                  <Icon name="alert" size={18} />
                  <span>
                    <strong>Inactivación bloqueada:</strong> El vehículo de placa <strong>{openEntryBlockingAction.placa}</strong> tiene actualmente una entrada abierta en la celda <strong>{openEntryBlockingAction.celda}</strong>. Registra primero su salida antes de inactivar.
                  </span>
                </div>
              )}
              <div className="field">
                <label>Motivo obligatorio ({isDeactivating ? 'de inactivación' : 'de reactivación'})</label>
                <textarea
                  value={modalReason}
                  onChange={(e) => { setModalReason(e.target.value); setModalError('') }}
                  placeholder={isDeactivating ? 'Ej. Solicitud del titular, fin de contrato, cambio de vehículo...' : 'Ej. Renovación de servicio autorizada por administración...'}
                  rows={3}
                  autoFocus
                />
              </div>
              {modalError && <div className="notice notice-red"><Icon name="alert" size={16} /><span>{modalError}</span></div>}
            </div>
            <div className="modal-actions">
              <button className="secondary-btn" onClick={() => { setModalUserAction(null); setModalError('') }}>Cancelar</button>
              <button
                className={isDeactivating ? 'secondary-btn danger' : 'primary-btn'}
                onClick={toggleUserState}
                disabled={!!openEntryBlockingAction}
              >
                Confirmar {isDeactivating ? 'inactivación' : 'reactivación'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal d) Historial de auditoría (auditLogs) del usuario y sus vehículos */}
      {auditModalUser && (
        <div className="modal-backdrop" onMouseDown={() => setAuditModalUser(null)}>
          <div className="modal-card wide" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <h2>Historial de trazabilidad · {auditModalUser.nombres} {auditModalUser.apellidos}</h2>
                <p>{auditModalUser.documentoTipo} {auditModalUser.documento} · Registro inalterable de creaciones, ediciones y cambios de estado.</p>
              </div>
              <button className="icon-btn" onClick={() => setAuditModalUser(null)} aria-label="Cerrar"><Icon name="x" /></button>
            </div>
            <div className="modal-body">
              <div className="history-scroll">
                {auditModalUser.auditLogs.map((log) => (
                  <div key={log.id} className="history-item" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                      <strong>{log.campo}</strong>
                      <small>{new Date(log.fecha).toLocaleString('es-CO')} · Responsable: {log.usuario}</small>
                    </div>
                    <div className="audit-diff">
                      <div>
                        <span>Valor anterior</span>
                        <strong>{log.valorAnterior}</strong>
                      </div>
                      <div>
                        <span>Valor nuevo / Motivo</span>
                        <strong>{log.valorNuevo}</strong>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="modal-actions">
              <button className="primary-btn" onClick={() => setAuditModalUser(null)}>Cerrar historial</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal e) + Crear celda */}
      {newCellOpen && (
        <div className="modal-backdrop" onMouseDown={() => setNewCellOpen(false)}>
          <div className="modal-card" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <h2>+ Crear celda</h2>
                <p>Agrega una celda nueva con código único a la capacidad del parqueadero.</p>
              </div>
              <button className="icon-btn" onClick={() => setNewCellOpen(false)} aria-label="Cerrar"><Icon name="x" /></button>
            </div>
            <div className="modal-body">
              <div className="field">
                <label>Código de celda (único)</label>
                <input value={newCellForm.codigo} onChange={(e) => { setNewCellForm((prev) => ({ ...prev, codigo: e.target.value.toUpperCase() })); setNewCellError('') }} placeholder="Ej. C-71 o M-11" />
              </div>
              <div className="field">
                <label>Tipo de vehículo permitido</label>
                <select value={newCellForm.tipo} onChange={(e) => setNewCellForm((prev) => ({ ...prev, tipo: e.target.value as VehicleType }))}>
                  <option value="Carro">Carro</option>
                  <option value="Moto">Moto</option>
                </select>
              </div>
              {newCellError && <div className="notice notice-red"><Icon name="alert" size={16} /><span>{newCellError}</span></div>}
            </div>
            <div className="modal-actions">
              <button className="secondary-btn" onClick={() => setNewCellOpen(false)}>Cancelar</button>
              <button
                className="primary-btn"
                onClick={() => {
                  const trimmedCode = newCellForm.codigo.trim().toUpperCase()
                  if (!trimmedCode) {
                    setNewCellError('Debes ingresar un código para la celda (ej. C-71).')
                    return
                  }
                  const exists = cells.some((cell) => cell.codigo.toUpperCase() === trimmedCode)
                  if (exists) {
                    setNewCellError(`El código de celda ${trimmedCode} ya existe en el mapa.`)
                    return
                  }
                  const next: CellRecord = {
                    id: Date.now(),
                    codigo: trimmedCode,
                    tipo: newCellForm.tipo,
                    estado: 'Libre',
                    placa: null,
                    hora: null,
                    motivo: null,
                    historial: [{ id: Date.now() + 1, momento: new Date().toISOString(), usuario: currentOperatorName, accion: 'Creación de celda', motivo: `Celda ${trimmedCode} (${newCellForm.tipo}) creada por administración.` }],
                  }
                  setCells((prev) => [...prev, next])
                  setSelectedCellCode(next.codigo)
                  setNewCellOpen(false)
                  setNewCellForm({ codigo: '', tipo: 'Carro' })
                  setNewCellError('')
                }}
              >
                Guardar celda
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

function ModulePlaceholder({ title, description }: { title: string; description: string }) {
  return <section className="table-page"><div className="table-title"><div><span className="eyebrow">MÓDULO</span><h1>{title}</h1></div></div><div className="card table-card"><div className="module-placeholder">
    <div className="placeholder-icon"><Icon name="grid" size={28} /></div>
    <h2>{title}</h2>
    <p>{description}</p>
    <span>Se mantiene con la misma lógica del backend y listo para conectarse con la API en la siguiente etapa.</span>
  </div></div></section>
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
