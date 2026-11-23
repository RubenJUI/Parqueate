import { FormEvent, ReactNode, useCallback, useEffect, useState } from 'react'
import {
  addModule2Vehicle,
  annulModule3Payment,
  annulTicket,
  ApiError,
  buildInitialCells,
  calculatePaymentPeriod,
  checkHealth,
  convertModule2Cell,
  createModule2Cell,
  createModule2User,
  createModule3Payment,
  createModule3Tariff,
  createStaffAccount,
  deleteModule2Cell,
  deleteModule2User,
  deleteModule2Vehicle,
  formatCOP,
  getEffectiveTariffForType,
  getFreeCells,
  getHistory,
  getInside,
  getMe,
  getModule2Cells,
  getModule2Users,
  getModule3Cashbox,
  getModule3Expiring,
  getModule3Payments,
  getModule3Report,
  getModule3Tariffs,
  getOccupancy,
  getStaffAccounts,
  getToken,
  getVehicleSubscriptionInfo,
  initializeModule2Cells,
  isoToColombiaYMD,
  loadStoredCells,
  loadStoredPayments,
  loadStoredTariffs,
  loadStoredUsers,
  login,
  logout,
  lookupVehicle,
  registerEntry,
  registerExit,
  restoreModule2Cell,
  saveStoredCells,
  saveStoredPayments,
  saveStoredTariffs,
  saveStoredUsers,
  setUnauthorizedHandler,
  syncCellsWithTickets,
  todayColombiaYMD,
  toggleModule2UserStatus,
  toggleModule2VehicleStatus,
  toggleStaffAccountStatus,
  updateModule2Cell,
  updateModule2User,
  updateStaffAccount,
} from './api/client'
import type { Cell, EntryResult, Occupancy, Ticket, User, VehicleLookup, VehicleType } from './domain/parking'
import type {
  CellRecord,
  CellStatus,
  PaymentMethod,
  PaymentRecord,
  PaymentStatus,
  StaffAccount,
  StaffRole,
  StaffStatus,
  SubscriptionState,
  TariffsState,
  UserRecord,
  UserStatus,
} from './api/client'
import { formatDate, formatDateTime, initials, medellinDate, medellinTime, ticketCode, todayLong } from './shared/formatters'

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
    // Moto de perfil: dos ruedas, chasis, manubrio y asiento. Se distingue del carro por la silueta.
    moto: <><circle cx="5" cy="16" r="3" /><circle cx="19" cy="16" r="3" /><path d="m5 16 4-5h5l2 3" /><path d="M19 16 16 7h2.5" /><path d="M9 11 8 9H5.5" /><path d="M14 11h2.7" /></>,
    // Personas: módulo de usuarios. El carro queda reservado para el tipo de vehículo (un ícono, un significado).
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
    // Íconos de acciones y pestañas (reemplazan emojis para mantener un solo estilo visual).
    edit: <><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></>,
    plus: <path d="M12 5v14M5 12h14" />,
    history: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5M12 7v5l4 2" /></>,
    ban: <><circle cx="12" cy="12" r="9" /><path d="m5.7 5.7 12.6 12.6" /></>,
    checkCircle: <><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></>,
    trash: <><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6" /></>,
    map: <><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Z" /><path d="M9 4v14M15 6v14" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    // Tarjeta de pago: módulo de pagos y mensualidades.
    card: <><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20M6 15h4" /></>,
    printer: <><path d="M6 9V2h12v7" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="8" rx="1" /></>,
    download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m7 10 5 5 5-5" /><path d="M12 15V3" /></>,
    calendar: <><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>,
    receipt: <><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z" /><path d="M8 9h8M8 13h8M8 17h5" /></>,
    dollar: <><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></>,
    shield: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="m9 12 2 2 4-4" /></>,
  }
  return <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{paths[name]}</svg>
}

// Ícono del tipo de vehículo. Siempre acompaña al texto "Carro"/"Moto" (refuerzo visual, no reemplazo),
// así el significado no depende solo del dibujo y los lectores de pantalla leen el texto.
function VehicleIcon({ tipo, size = 16 }: { tipo: string; size?: number }) {
  return <Icon name={tipo === 'Moto' ? 'moto' : 'car'} size={size} />
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

// Fecha y hora actuales, renovadas cada segundo mientras el componente esté montado.
function useNow() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(timer)
  }, [])
  return now
}

// Reloj en vivo de la estación con la hora de Medellín. Tiene su propio estado para que
// el tic de cada segundo no vuelva a renderizar la pantalla que lo contiene.
function LiveClock({ className }: { className: string }) {
  const now = useNow()
  const { hora, periodo } = medellinTime(now)
  return <time className={className} dateTime={now.toISOString()}>
    <strong>{hora}<small>{periodo}</small></strong>
    <span>{medellinDate(now)} · Medellín</span>
  </time>
}

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === 'Vigente' || status === 'Al día' || status === 'Activo' || status === 'Registrado'
      ? 'green'
      : status === 'Por vencer'
        ? 'amber'
        : status === 'Finalizado' || status === 'Sin mensualidad'
          ? 'gray'
          : 'red'
  return <Badge tone={tone}>{status}</Badge>
}

const roleLabel = (user: User) => user.rol === 'Administrador' ? 'Administrador' : 'Operario'

export type PaymentsSubView = 'charge' | 'expiring' | 'history' | 'tariffs'

export default function App() {
  const [user, setUser] = useState<User | null>(null)
  const [checkingSession, setCheckingSession] = useState(() => !!getToken())
  const [cells, setCells] = useState<CellRecord[]>(() => loadStoredCells())
  const [users, setUsers] = useState<UserRecord[]>(() => loadStoredUsers())
  const [payments, setPayments] = useState<PaymentRecord[]>(() => loadStoredPayments())
  const [tariffs, setTariffs] = useState<TariffsState>(() => loadStoredTariffs())

  useEffect(() => {
    saveStoredCells(cells)
  }, [cells])

  useEffect(() => {
    saveStoredUsers(users)
  }, [users])

  useEffect(() => {
    saveStoredPayments(payments)
  }, [payments])

  useEffect(() => {
    saveStoredTariffs(tariffs)
  }, [tariffs])

  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null))
    if (!getToken()) return
    getMe().then(setUser).catch(() => logout()).finally(() => setCheckingSession(false))
  }, [])

  // RNF-A01: Expiración automática de sesión tras 30 minutos de inactividad.
  useEffect(() => {
    if (!user) return
    const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000
    let timeoutId = window.setTimeout(() => {
      logout()
      setUser(null)
    }, INACTIVITY_TIMEOUT_MS)

    const resetTimer = () => {
      window.clearTimeout(timeoutId)
      timeoutId = window.setTimeout(() => {
        logout()
        setUser(null)
      }, INACTIVITY_TIMEOUT_MS)
    }

    const events: Array<keyof WindowEventMap> = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll']
    events.forEach((evt) => window.addEventListener(evt, resetTimer, { passive: true }))
    return () => {
      window.clearTimeout(timeoutId)
      events.forEach((evt) => window.removeEventListener(evt, resetTimer))
    }
  }, [user])

  if (checkingSession) return null
  if (!user) return <Login onLogin={setUser} />
  return (
    <Operations
      user={user}
      cells={cells}
      setCells={setCells}
      users={users}
      setUsers={setUsers}
      payments={payments}
      setPayments={setPayments}
      tariffs={tariffs}
      setTariffs={setTariffs}
      onLogout={() => { logout(); setUser(null) }}
    />
  )
}

type ActiveTab = 'console' | 'inside' | 'history' | 'users' | 'payments' | 'personal'
type UsersSubView = 'directory' | 'map' | 'register'
type CellTypeFilterOption = 'Todas' | 'Carros' | 'Motos'
type CellStateFilterOption = 'Todos' | 'Libre' | 'Ocupada' | 'Fuera de servicio'

function Operations({
  user,
  cells,
  setCells,
  users,
  setUsers,
  payments,
  setPayments,
  tariffs,
  setTariffs,
  onLogout,
}: {
  user: User
  cells: CellRecord[]
  setCells: React.Dispatch<React.SetStateAction<CellRecord[]>>
  users: UserRecord[]
  setUsers: React.Dispatch<React.SetStateAction<UserRecord[]>>
  payments: PaymentRecord[]
  setPayments: React.Dispatch<React.SetStateAction<PaymentRecord[]>>
  tariffs: TariffsState
  setTariffs: React.Dispatch<React.SetStateAction<TariffsState>>
  onLogout: () => void
}) {
  const [opTab, setOpTab] = useState<ActiveTab>('console')
  const [occupancy, setOccupancy] = useState<Occupancy[]>([])
  const [openTickets, setOpenTickets] = useState<Ticket[]>([])
  // Se incrementa después de cada movimiento para que las vistas vuelvan a consultar la API.
  const [version, setVersion] = useState(0)
  const [toast, setToast] = useState('')
  const roleMode: 'Operario' | 'Administrador' = user.rol === 'Administrador' ? 'Administrador' : 'Operario'
  const [usersSubView, setUsersSubView] = useState<UsersSubView>('directory')
  const [paymentsSubView, setPaymentsSubView] = useState<PaymentsSubView>('charge')
  const [cellTypeFilter, setCellTypeFilter] = useState<CellTypeFilterOption>('Todas')
  const [cellStateFilter, setCellStateFilter] = useState<CellStateFilterOption>('Todos')

  // RF-A02: Si el usuario autenticado es Operario, nunca puede permanecer en el módulo Personal.
  useEffect(() => {
    if (user.rol !== 'Administrador' && opTab === 'personal') {
      setOpTab('console')
    }
  }, [user.rol, opTab])

  const refreshOperationalState = useCallback(() => {
    getOccupancy().then(setOccupancy).catch(() => {})
    getModule2Users().then(setUsers).catch(() => {})
    getModule3Payments().then(setPayments).catch(() => {})
    getModule3Tariffs().then(setTariffs).catch(() => {})
    Promise.all([getInside(), getModule2Cells().catch(() => null)])
      .then(([tickets, apiCells]) => {
        setOpenTickets(tickets)
        if (apiCells) {
          setCells(syncCellsWithTickets(apiCells, tickets))
        } else {
          setCells((prev) => syncCellsWithTickets(prev, tickets))
        }
      })
      .catch(() => {})
  }, [setCells, setPayments, setTariffs, setUsers])

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

  // Contador dinámico para el badge de "Por Vencer y Vencidas" (HU-P08)
  const expiringOrExpiredCount = users
    .filter((u) => u.estado === 'Activo')
    .reduce((acc, u) => {
      return (
        acc +
        u.vehiculos.filter((v) => {
          if (v.estado !== 'Activo') return false
          const sub = getVehicleSubscriptionInfo(v.placa, payments)
          return sub.estado === 'Por vencer' || sub.estado === 'Vencida'
        }).length
      )
    }, 0)

  return <div className="app-shell canvas-shell">
    <div className="canvas-identity">
      <img className="canvas-logo" src="/logo.svg" alt="" />
      <div><strong>PARQUEATE</strong><span>Medellín</span></div>
      <LiveClock className="canvas-clock" />
    </div>

    <main className="main canvas-main">
      <OperationsHeader
        tab={opTab}
        setTab={setOpTab}
        totalInside={totalInside}
        cells={cells}
        onSelectVehicleType={openCellsMapForType}
      />
      {fullTypes.length > 0 && <div className="capacity-alert notice-red"><Icon name="alert" size={17} /><span><strong>Sin celdas libres de {fullTypes.map(t => t === 'Carro' ? 'carro' : 'moto').join(' ni de ')}.</strong> {user.rol === 'Administrador' ? 'Con el cupo garantizado esto indica un error de datos: revisa las celdas fuera de servicio y los vehículos activos.' : 'Avisa al administrador.'}</span></div>}
      <div className="content">
        {opTab === 'console' && <Console cells={cells} payments={payments} onChanged={onChanged} />}
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
            payments={payments}
            openTickets={openTickets}
            subView={usersSubView}
            setSubView={setUsersSubView}
            cellTypeFilter={cellTypeFilter}
            setCellTypeFilter={setCellTypeFilter}
            cellStateFilter={cellStateFilter}
            setCellStateFilter={setCellStateFilter}
          />
        )}
        {opTab === 'payments' && (
          <PaymentsModule
            roleMode={roleMode}
            user={user}
            users={users}
            cells={cells}
            payments={payments}
            setPayments={setPayments}
            tariffs={tariffs}
            setTariffs={setTariffs}
            subView={paymentsSubView}
            setSubView={setPaymentsSubView}
            expiringCount={expiringOrExpiredCount}
            onNotify={notify}
          />
        )}
        {opTab === 'personal' && user.rol === 'Administrador' && (
          <PersonalModule currentUser={user} onNotify={notify} />
        )}
      </div>
    </main>

    <div className="floating-dock-wrap">
      <nav className="floating-dock" aria-label="Navegación principal">
        <button className="dock-logo" onClick={() => setOpTab('console')} aria-label="Inicio"><img src="/logo.svg" alt="" /></button>
        <span className="dock-divider" />
        <div className="dock-navigation">
          <button aria-label="Operaciones" className={`dock-item ${opTab === 'console' || opTab === 'inside' || opTab === 'history' ? 'active' : ''}`} onClick={() => setOpTab('console')}><Icon name="grid" size={18} /><span>Operaciones</span></button>
          <button aria-label="Usuarios y celdas" className={`dock-item ${opTab === 'users' ? 'active' : ''}`} onClick={() => setOpTab('users')}><Icon name="users" size={18} /><span>Usuarios y celdas</span></button>
          <button aria-label="Pagos" className={`dock-item ${opTab === 'payments' ? 'active' : ''}`} onClick={() => setOpTab('payments')}><Icon name="card" size={18} /><span>Pagos</span></button>
          {user.rol === 'Administrador' && (
            <button aria-label="Personal" className={`dock-item ${opTab === 'personal' ? 'active' : ''}`} onClick={() => setOpTab('personal')}><Icon name="shield" size={18} /><span>Personal</span></button>
          )}
        </div>
        <span className="dock-divider" />
        <div className="dock-user-chip" aria-label="Usuario autenticado">
          <div className="avatar">{initials(user.nombre)}</div>
          <div className="dock-user-meta">
            <strong>{user.nombre}</strong>
            <span className={`dock-role-badge ${user.rol === 'Administrador' ? 'admin' : 'operator'}`}>
              {roleLabel(user)}
            </span>
          </div>
        </div>
        <button type="button" className="dock-logout-btn" onClick={onLogout} aria-label="Cerrar sesión">
          <Icon name="logout" size={15} />
          <span>Cerrar sesión</span>
        </button>
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

  useEffect(() => {
    checkHealth().then(() => setOnline(true)).catch(() => setOnline(false))
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
      if (err instanceof ApiError && err.status === 401) {
        setError('Correo o contraseña incorrectos.')
      } else if (err instanceof ApiError && err.status === 403) {
        setError(err.message || 'Tu cuenta se encuentra inactiva. Contacta al Administrador.')
      } else {
        setError(errorMessage(err))
      }
      setSending(false)
    }
  }

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
      <LiveClock className="lock-clock" />
      {online !== null && <div className={`system-pill ${online ? '' : 'offline'}`}><i />{online ? 'Sistema en línea' : 'Sin conexión con el servidor'}</div>}
    </div>

    <form className="shift-pod" onSubmit={submit}>
      <div className="shift-pod-head"><img className="login-logo" src="/logo.svg" alt="PARQUEATE" /><span className="eyebrow">PARQUEATE · MEDELLÍN</span><h1>Iniciar sesión</h1><p>Ingresa con tu cuenta de administrador u operario para acceder al sistema.</p></div>
      <div className="login-fields">
        <label><span>CORREO ELECTRÓNICO</span><input type="email" value={correo} onChange={e => setCorreo(e.target.value)} placeholder="admin@parqueate.co" autoComplete="username" autoFocus required /></label>
        <label><span>CONTRASEÑA</span><input type="password" value={contrasena} onChange={e => setContrasena(e.target.value)} placeholder="••••••••" autoComplete="current-password" required /></label>
      </div>
      {error && <div className="notice notice-red login-error"><Icon name="alert" size={16} /><span>{error}</span></div>}
      <button type="submit" className="unlock-button login-submit" disabled={sending || !correo.trim() || !contrasena}><span>{sending ? 'Verificando…' : 'Iniciar sesión'}</span><Icon name="arrow" size={18} /></button>
      <div className="login-seed-note">
        <span className="login-seed-note-title">Credenciales de prueba</span>
        <div className="login-seed-item">
          <span>Administrador:</span>
          <code>admin@parqueate.co / Admin123*</code>
        </div>
        <div className="login-seed-item">
          <span>Operario:</span>
          <code>operario@parqueate.co / Operario123*</code>
        </div>
      </div>
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
  tab: ActiveTab
  setTab: (t: ActiveTab) => void
  totalInside: number
  cells: CellRecord[]
  onSelectVehicleType: (tipo: VehicleType) => void
}) {
  const pageTitle =
    tab === 'console'
      ? '¿Qué vehículo quieres registrar?'
      : tab === 'inside'
        ? 'Vehículos dentro'
        : tab === 'history'
          ? 'Historial y trazabilidad'
          : tab === 'users'
            ? 'Usuarios y celdas'
            : tab === 'personal'
              ? 'Personal del sistema'
              : 'Pagos y mensualidades'
  const pageSubtitle =
    tab === 'console'
      ? 'Valida una placa y completa el movimiento en segundos.'
      : tab === 'inside' || tab === 'history'
        ? 'Consulta la operación sin salir de la estación.'
        : tab === 'users'
          ? 'Gestiona acceso, usuarios y disponibilidad del parqueadero.'
          : tab === 'personal'
            ? 'Administra las cuentas de administradores y operarios con acceso a PARQUEATE.'
            : 'Administra pagos, vigencias y recordatorios del servicio.'
  const pageEyebrow = tab === 'personal' ? 'CONTROL DE ACCESO · MEDELLÍN' : 'ESTACIÓN DE ACCESO · MEDELLÍN'

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
            aria-label={`${label}: ${tooltip}`}
            onClick={() => onSelectVehicleType(tipo)}
          >
            <i className={`hud-light ${lightTone}`} />
            <VehicleIcon tipo={tipo} size={15} />
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
              <span className="hud-maint-badge">· <Icon name="alert" size={12} /> {fueraDeServicio} fuera de servicio</span>
            )}
          </button>
        )
      })}
    </div>
  )

  if (tab === 'users' || tab === 'payments' || tab === 'personal') {
    return (
      <>
        {renderOccupancyHud()}
        <div className="page-head spotlight-head compact">
          <div className="title-row">
            <div><span className="eyebrow">{pageEyebrow}</span><h1>{pageTitle}</h1><p>{pageSubtitle}</p></div>
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
  if (mode === 'exit') return vehicle.id_tiquete_abierto ? '' : 'El vehículo no tiene entrada registrada.'
  if (vehicle.id_tiquete_abierto) return `El vehículo ya se encuentra dentro del parqueadero en la celda ${vehicle.numero_espacio}.`
  const conMotivo = (motivo: string | null) => (motivo ? ` (motivo: ${motivo})` : '')
  if (vehicle.estado_usuario === 'Inactivo') return `El usuario ${vehicle.propietario} está inactivo${conMotivo(vehicle.motivo_inactivacion_usuario)}. No puede registrar entrada; avise al administrador.`
  if (vehicle.estado_vehiculo === 'Inactivo') return `El vehículo ${vehicle.placa} está inactivo${conMotivo(vehicle.motivo_inactivacion_vehiculo)}. No puede registrar entrada; avise al administrador.`
  if (!vehicle.mensualidad) return 'El vehículo no tiene una mensualidad registrada.'
  if (vehicle.mensualidad.estado === 'Vencida') return `Mensualidad vencida el ${formatDate(vehicle.mensualidad.fecha_vencimiento)}.`
  return ''
}

function monthlyNotice(vehicle: VehicleLookup) {
  const m = vehicle.mensualidad
  if (!m || m.estado === 'Vigente') return null
  if (m.estado === 'Vencida') return { tone: 'notice-red', text: `Vencida el ${formatDate(m.fecha_vencimiento)}` }
  return { tone: 'notice-amber', text: m.dias_restantes === 0 ? 'Su mensualidad vence hoy' : `Su mensualidad vence en ${m.dias_restantes} día${m.dias_restantes === 1 ? '' : 's'}` }
}

function Console({
  cells: moduleCells,
  payments,
  onChanged,
}: {
  cells: CellRecord[]
  payments: PaymentRecord[]
  onChanged: (message: string) => void
}) {
  const [mode, setMode] = useState<'entry' | 'exit'>('entry')
  const [plate, setPlate] = useState('')
  const [rawVehicle, setRawVehicle] = useState<VehicleLookup | null>(null)
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
    setRawVehicle(null); setLookupError(''); setSubmitError(''); setSelectedCell('')
    if (!knownPlate) return
    let cancelled = false
    setLoading(true)
    const timer = window.setTimeout(() => {
      lookupVehicle(plate)
        .then(found => { if (!cancelled) setRawVehicle(found) })
        .catch(err => { if (!cancelled) setLookupError(errorMessage(err)) })
        .finally(() => { if (!cancelled) setLoading(false) })
    }, 300)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [plate, knownPlate])

  // HU-P06: Cruce en vivo con los pagos del Módulo 3 para reflejar al instante pagos o anulaciones
  const vehicle: VehicleLookup | null = (() => {
    if (!rawVehicle) return null
    const hasMod3History = payments.some((p) => p.placa.toUpperCase() === rawVehicle.placa.toUpperCase())
    if (!hasMod3History) return rawVehicle
    const subInfo = getVehicleSubscriptionInfo(rawVehicle.placa, payments)
    if (subInfo.estado === 'Sin mensualidad' || !subInfo.fechaVencimiento || !subInfo.fechaInicio) {
      return { ...rawVehicle, mensualidad: null }
    }
    return {
      ...rawVehicle,
      mensualidad: {
        fecha_pago: subInfo.fechaInicio,
        fecha_vencimiento: subInfo.fechaVencimiento,
        dias_restantes: subInfo.diasRestantes ?? 0,
        estado: subInfo.estado === 'Al día' ? 'Vigente' : subInfo.estado,
      },
    }
  })()

  const liveSubscriptionBadgeLabel = (() => {
    if (!vehicle || !vehicle.mensualidad) return 'Sin mensualidad'
    if (vehicle.mensualidad.estado === 'Vigente') return 'Al día'
    return vehicle.mensualidad.estado
  })()

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
        lookupError ? <div className="blocked standalone"><Icon name="x" size={18} /><div><strong>{lookupError.includes('no está asociado') ? 'Placa no registrada' : 'No se pudo validar la placa'}</strong><p>{lookupError}</p></div></div> :
        vehicle && <div className={`validation-card ${blockReason ? 'invalid' : ''}`}>
          <div className="validation-top">
            <div className="person">
              <div className="avatar avatar-light">{initials(vehicle.propietario)}</div>
              <div>
                <strong>{vehicle.propietario}</strong>
                <span className="type-line">
                  <VehicleIcon tipo={vehicle.tipo_vehiculo} size={13} />
                  {vehicle.tipo_vehiculo} · {vehicle.placa}
                  {vehicle.mensualidad && ` · Vence: ${formatDate(vehicle.mensualidad.fecha_vencimiento)}`}
                </span>
              </div>
            </div>
            <StatusBadge status={liveSubscriptionBadgeLabel} />
          </div>
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
  payments,
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
  payments: PaymentRecord[]
  openTickets: Ticket[]
  subView: UsersSubView
  setSubView: React.Dispatch<React.SetStateAction<UsersSubView>>
  cellTypeFilter: CellTypeFilterOption
  setCellTypeFilter: React.Dispatch<React.SetStateAction<CellTypeFilterOption>>
  cellStateFilter: CellStateFilterOption
  setCellStateFilter: React.Dispatch<React.SetStateAction<CellStateFilterOption>>
}) {
  // El selector de vista solo puede restar permisos: sin el rol real de administrador nunca se habilitan sus acciones.
  const isAdmin = user.rol === 'Administrador' && roleMode === 'Administrador'
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
  const [openActionsUserId, setOpenActionsUserId] = useState<number | null>(null)
  const [confirmDeleteModal, setConfirmDeleteModal] = useState<{
    kind: 'user' | 'vehicle' | 'cell'
    targetId: number | string
    title: string
    description: string
    // HU-U08: si la eliminación se rechaza por movimientos, se ofrece inactivar (solo si está activo).
    inactivate?: { userId: number; kind: 'user' | 'vehicle'; vehicleId?: number }
  } | null>(null)
  const [deleteModalError, setDeleteModalError] = useState('')
  const [deleteReason, setDeleteReason] = useState('')
  const [deleteBlockedByHistory, setDeleteBlockedByHistory] = useState(false)
  const closeDeleteModal = () => {
    setConfirmDeleteModal(null)
    setDeleteModalError('')
    setDeleteReason('')
    setDeleteBlockedByHistory(false)
  }
  const openDeleteModal = (modal: NonNullable<typeof confirmDeleteModal>) => {
    setDeleteModalError('')
    setDeleteReason('')
    setDeleteBlockedByHistory(false)
    setConfirmDeleteModal(modal)
  }

  useEffect(() => {
    if (openActionsUserId === null) return
    const closeMenu = () => setOpenActionsUserId(null)
    document.addEventListener('mousedown', closeMenu)
    return () => document.removeEventListener('mousedown', closeMenu)
  }, [openActionsUserId])

  const initializeCells = async () => {
    try {
      const apiCells = await initializeModule2Cells()
      const synced = syncCellsWithTickets(apiCells, openTickets)
      setCells(synced)
      setSelectedCellCode(synced[0]?.codigo ?? null)
    } catch {
      const nextCells = buildInitialCells(currentOperatorName, openTickets)
      setCells(nextCells)
      setSelectedCellCode(nextCells[0]?.codigo ?? null)
    }
  }

  useEffect(() => {
    getModule2Users().then(setUsers).catch(() => {})
    getModule2Cells()
      .then((apiCells) => setCells(syncCellsWithTickets(apiCells, openTickets)))
      .catch(() => {})
  }, [subView, openTickets, setCells, setUsers])

  // Busca si una placa tiene una entrada abierta en el parqueadero (Módulo 1 o celda ocupada en el mapa)
  const findOpenEntryForPlate = (placa: string): { placa: string; celda: string } | null => {
    const normalized = placa.trim().toUpperCase()
    const fromTicket = openTickets.find((t) => t.placa.toUpperCase() === normalized)
    if (fromTicket) return { placa: fromTicket.placa, celda: fromTicket.numero_espacio }
    const fromCell = cells.find((c) => c.estado === 'Ocupada' && c.placa?.toUpperCase() === normalized)
    if (fromCell) return { placa: normalized, celda: fromCell.codigo }
    for (const u of users) {
      const veh = u.vehiculos.find((v) => v.placa.toUpperCase() === normalized && v.tieneEntradaAbierta && v.celdaOcupada)
      if (veh && veh.celdaOcupada) return { placa: veh.placa, celda: veh.celdaOcupada }
    }
    return null
  }

  const filteredUsers = users.filter((u) => {
    const text = `${u.documentoTipo} ${u.documento} ${u.nombres} ${u.apellidos} ${u.vehiculos.map(v => v.placa).join(' ')}`.toLowerCase()
    const hasInactiveVehicle = u.vehiculos.some((v) => v.estado === 'Inactivo')
    const stateOk =
      estadoFilter === 'Todos' ||
      (estadoFilter === 'Activos'
        ? u.estado === 'Activo'
        : u.estado === 'Inactivo' || hasInactiveVehicle)
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

  // Conteo de vehículos activos por tipo de vehículo para cupo garantizado (RN-P05 y RN-C05)
  const activeCarVehiclesCount = users
    .filter((u) => u.estado === 'Activo')
    .reduce((acc, u) => {
      return acc + u.vehiculos.filter((v) => v.estado === 'Activo' && v.tipo === 'Carro').length
    }, 0)
  const activeMotoVehiclesCount = users
    .filter((u) => u.estado === 'Activo')
    .reduce((acc, u) => {
      return acc + u.vehiculos.filter((v) => v.estado === 'Activo' && v.tipo === 'Moto').length
    }, 0)

  const carOccupiedCount = cells.filter((c) => c.tipo === 'Carro' && c.estado === 'Ocupada').length
  const motoOccupiedCount = cells.filter((c) => c.tipo === 'Moto' && c.estado === 'Ocupada').length

  const carActiveSubscriptions = Math.max(activeCarVehiclesCount, carOccupiedCount)
  const motoActiveSubscriptions = Math.max(activeMotoVehiclesCount, motoOccupiedCount)

  const createUser = async () => {
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

    try {
      const created = await createModule2User({
        documentoTipo,
        documento: trimmedDoc,
        nombres: trimmedNames,
        apellidos: trimmedLast,
        celular: celular.trim(),
        correo: correo.trim(),
        tipo,
        placa: plate,
        marca: marca.trim(),
        color: color.trim(),
        autorizacionHabeasData: true,
      })
      setUsers((prev) => [created, ...prev.filter((u) => u.id !== created.id)])
      setSubView('directory')
      setRegisterForm({ documentoTipo: 'CC', documento: '', nombres: '', apellidos: '', celular: '', correo: '', tipo: 'Carro', placa: '', marca: '', color: '', habeas: false })
      setRegisterError('')
      setRegisterSuccess('Usuario y vehículo registrados satisfactoriamente.')
      setTimeout(() => setRegisterSuccess(''), 2600)
    } catch (err) {
      setRegisterError(errorMessage(err))
    }
  }

  const saveUserEdits = async () => {
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

    try {
      const updatedUser = await updateModule2User(editingUser.id, {
        celular: nextCelular,
        correo: nextCorreo,
        id_vehiculo: currentVehicle.id,
        placa_vehiculo: currentVehicle.placa,
        marca: nextMarca,
        color: nextColor,
      })
      setUsers((prev) => prev.map((u) => (u.id === updatedUser.id ? updatedUser : u)))
      setEditingUser(null)
      setEditingVehicleId(null)
      setEditForm({ celular: '', correo: '', marca: '', color: '' })
      setEditError('')
    } catch (err) {
      setEditError(errorMessage(err))
    }
  }

  const addVehicleToUser = async () => {
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

    try {
      const updatedUser = await addModule2Vehicle(vehicleModalUser.id, {
        placa: plate,
        tipo: vehicleModalForm.tipo,
        marca,
        color,
      })
      setUsers((prev) => prev.map((u) => (u.id === updatedUser.id ? updatedUser : u)))
      setVehicleModalUser(null)
      setVehicleModalForm({ placa: '', tipo: 'Carro', marca: '', color: '' })
      setModalError('')
    } catch (err) {
      setModalError(errorMessage(err))
    }
  }

  const toggleUserState = async () => {
    if (!modalUserAction) return
    const targetUser = users.find((u) => u.id === modalUserAction.userId)
    if (!targetUser) return

    const reason = modalReason.trim()
    if (!reason) {
      setModalError('Es obligatorio indicar un motivo para realizar este cambio de estado.')
      return
    }

    try {
      if (modalUserAction.kind === 'user') {
        const nextState: UserStatus = targetUser.estado === 'Activo' ? 'Inactivo' : 'Activo'
        const updatedUser = await toggleModule2UserStatus(targetUser.id, {
          estado: nextState,
          motivo: reason,
        })
        setUsers((prev) => prev.map((u) => (u.id === updatedUser.id ? updatedUser : u)))
      } else {
        const targetVehicle = targetUser.vehiculos.find((vehicle) => vehicle.id === modalUserAction.vehicleId)
        if (!targetVehicle) return
        const updatedVehicleState: UserStatus = targetVehicle.estado === 'Activo' ? 'Inactivo' : 'Activo'
        const updatedUser = await toggleModule2VehicleStatus(targetVehicle.placa, {
          estado: updatedVehicleState,
          motivo: reason,
        })
        setUsers((prev) => prev.map((u) => (u.id === updatedUser.id ? updatedUser : u)))
      }
      setModalUserAction(null)
      setModalReason('')
      setModalError('')
    } catch (err) {
      setModalError(errorMessage(err))
    }
  }

  const handleCellStatusChange = async () => {
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

    const nextStatus = selectedCell.estado === 'Libre' ? 'Fuera de servicio' : 'Libre'
    try {
      const updatedCell = await updateModule2Cell(selectedCell.codigo, {
        estado: nextStatus,
        motivo: reason,
      })
      setCells((prev) =>
        syncCellsWithTickets(
          prev.map((cell) => (cell.codigo === updatedCell.codigo ? updatedCell : cell)),
          openTickets,
        ),
      )
      setCellReason('')
      setCellActionError('')
    } catch (err) {
      setCellActionError(errorMessage(err))
    }
  }

  // Convierte la celda seleccionada (carro -> 2 motos, o pareja de motos -> carro) o restablece
  // su conversión. El servidor valida estado, cupo garantizado y reglas; aquí solo se pide el motivo.
  const handleCellConversion = async (accion: 'convertir' | 'restablecer') => {
    if (!selectedCell) return
    if (!isAdmin) {
      setCellActionError('Solo el administrador puede convertir o restablecer celdas.')
      return
    }
    const reason = cellReason.trim()
    if (!reason) {
      setCellActionError(`Debes indicar el motivo para ${accion} la celda.`)
      return
    }
    try {
      const mapa = accion === 'convertir'
        ? await convertModule2Cell(selectedCell.codigo, reason)
        : await restoreModule2Cell(selectedCell.codigo, reason)
      setCells(syncCellsWithTickets(mapa, openTickets))
      // La celda seleccionada deja de existir: se selecciona la primera celda resultante.
      const destino = accion === 'convertir'
        ? mapa.find((c) => c.espacio_original?.split(' y ').includes(selectedCell.codigo))
        : mapa.find((c) => selectedCell.espacio_original?.split(' y ').includes(c.codigo))
      setSelectedCellCode(destino?.codigo ?? null)
      setCellReason('')
      setCellActionError('')
    } catch (err) {
      setCellActionError(errorMessage(err))
    }
  }

  const handleConfirmDelete = async () => {
    if (!confirmDeleteModal) return
    setDeleteModalError('')
    const reason = deleteReason.trim()
    if (confirmDeleteModal.kind !== 'cell' && !reason) {
      setDeleteModalError('Es obligatorio indicar el motivo de la eliminación.')
      return
    }
    try {
      if (confirmDeleteModal.kind === 'user') {
        const userId = Number(confirmDeleteModal.targetId)
        await deleteModule2User(userId, reason)
        setUsers((prev) => prev.filter((u) => u.id !== userId))
        setRegisterSuccess('Usuario eliminado correctamente del directorio.')
        setTimeout(() => setRegisterSuccess(''), 2800)
      } else if (confirmDeleteModal.kind === 'vehicle') {
        const placa = String(confirmDeleteModal.targetId)
        const updatedUser = await deleteModule2Vehicle(placa, reason)
        setUsers((prev) => prev.map((u) => (u.id === updatedUser.id ? updatedUser : u)))
        setRegisterSuccess(`Vehículo ${placa} retirado del usuario satisfactoriamente.`)
        setTimeout(() => setRegisterSuccess(''), 2800)
      } else if (confirmDeleteModal.kind === 'cell') {
        const codigo = String(confirmDeleteModal.targetId)
        await deleteModule2Cell(codigo)
        setCells((prev) => {
          const remaining = prev.filter((c) => c.codigo !== codigo)
          setSelectedCellCode(remaining[0]?.codigo ?? null)
          return remaining
        })
        setCellReason('')
        setCellActionError('')
      }
      closeDeleteModal()
    } catch (err) {
      setDeleteBlockedByHistory(confirmDeleteModal.kind !== 'cell' && err instanceof ApiError && err.status === 409)
      setDeleteModalError(errorMessage(err))
    }
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
          <div className="filter-group"><span>Vehículo</span><div className="filter-pills">{(['Todos', 'Carros', 'Motos'] as const).map((option) => <button key={option} type="button" className={`filter-pill ${vehiculoFilter === option ? 'active' : ''}`} onClick={() => setVehiculoFilter(option)}>{option !== 'Todos' && <VehicleIcon tipo={option === 'Carros' ? 'Carro' : 'Moto'} size={14} />}{option}</button>)}</div></div>
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
              {filteredUsers.map((u) => {
                const hasVehicleInside = u.vehiculos.some((v) => !!findOpenEntryForPlate(v.placa))
                return (
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
                        {u.vehiculos.map((vehicle) => {
                          const openEntry = findOpenEntryForPlate(vehicle.placa)
                          return (
                            <div key={vehicle.id} className="vehicle-badge-wrap">
                              <span className="vehicle-badge"><VehicleIcon tipo={vehicle.tipo} size={14} /><strong>{vehicle.placa}</strong><small>{vehicle.tipo}</small></span>
                              <span className="vehicle-meta">{vehicle.marca} · {vehicle.color}</span>
                              <span className={`mini-badge ${vehicle.estado === 'Activo' ? 'success' : 'muted'}`}>{vehicle.estado}</span>
                              {isAdmin && (
                                <button
                                  type="button"
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
                              {isAdmin && (
                                <button
                                  type="button"
                                  className="vehicle-delete-btn"
                                  disabled={!!openEntry}
                                  title={openEntry ? `El vehículo ${vehicle.placa} está actualmente en la celda ${openEntry.celda}` : `Eliminar el vehículo ${vehicle.placa} registrado por error`}
                                  onClick={() => openDeleteModal({
                                    kind: 'vehicle',
                                    targetId: vehicle.placa,
                                    title: `Eliminar vehículo ${vehicle.placa}`,
                                    description: `Elimina el vehículo ${vehicle.placa} (${vehicle.tipo} · ${vehicle.marca} ${vehicle.color}) de ${u.nombres} ${u.apellidos} solo si se registró por error. Si ya tiene entradas, salidas o pagos no se puede eliminar: debes inactivarlo para conservar su historial.`,
                                    inactivate: vehicle.estado === 'Activo' ? { userId: u.id, kind: 'vehicle', vehicleId: vehicle.id } : undefined,
                                  })}
                                >
                                  Eliminar
                                </button>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </td>
                    <td><span className={`status-pill ${u.estado === 'Activo' ? 'success' : 'muted'}`}>{u.estado}</span></td>
                    <td>
                      <div className="actions-dropdown-wrap" onMouseDown={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          className={`actions-dropdown-trigger ${openActionsUserId === u.id ? 'open' : ''}`}
                          onClick={() => setOpenActionsUserId((prev) => (prev === u.id ? null : u.id))}
                        >
                          Acciones ▾
                        </button>
                        {openActionsUserId === u.id && (
                          <div className="actions-dropdown-menu">
                            <button
                              type="button"
                              className="actions-dropdown-item"
                              onClick={() => {
                                const firstVeh = u.vehiculos[0]
                                setEditingUser(u)
                                setEditingVehicleId(firstVeh?.id ?? null)
                                setEditForm({ celular: u.celular, correo: u.correo, marca: firstVeh?.marca ?? '', color: firstVeh?.color ?? '' })
                                setEditError('')
                                setOpenActionsUserId(null)
                              }}
                            >
                              <Icon name="edit" size={15} />Editar datos
                            </button>
                            <button
                              type="button"
                              className="actions-dropdown-item"
                              onClick={() => {
                                setVehicleModalUser(u)
                                setVehicleModalForm({ placa: '', tipo: 'Carro', marca: '', color: '' })
                                setModalError('')
                                setOpenActionsUserId(null)
                              }}
                            >
                              <Icon name="plus" size={15} />Agregar vehículo
                            </button>
                            <button
                              type="button"
                              className="actions-dropdown-item"
                              onClick={() => {
                                setAuditModalUser(u)
                                setOpenActionsUserId(null)
                              }}
                            >
                              <Icon name="history" size={15} />Ver historial ({u.auditLogs.length})
                            </button>
                            {isAdmin && (
                              <button
                                type="button"
                                className={`actions-dropdown-item ${u.estado === 'Activo' ? 'danger' : ''}`}
                                onClick={() => {
                                  setModalUserAction({ userId: u.id, kind: 'user' })
                                  setModalReason('')
                                  setModalError('')
                                  setOpenActionsUserId(null)
                                }}
                              >
                                {u.estado === 'Activo' ? <><Icon name="ban" size={15} />Inactivar usuario</> : <><Icon name="checkCircle" size={15} />Reactivar usuario</>}
                              </button>
                            )}
                            {isAdmin && !hasVehicleInside && (
                              <>
                                <div className="actions-dropdown-divider" />
                                <button
                                  type="button"
                                  className="actions-dropdown-item danger"
                                  onClick={() => {
                                    setOpenActionsUserId(null)
                                    openDeleteModal({
                                      kind: 'user',
                                      targetId: u.id,
                                      title: `Eliminar usuario ${u.nombres} ${u.apellidos}`,
                                      description: `Elimina a ${u.nombres} ${u.apellidos} (${u.documentoTipo} ${u.documento}) y sus vehículos solo si se registró por error. Si alguno de sus vehículos ya tiene entradas, salidas o pagos no se puede eliminar: debes inactivarlo para conservar su historial.`,
                                      inactivate: u.estado === 'Activo' ? { userId: u.id, kind: 'user' } : undefined,
                                    })
                                  }}
                                >
                                  <Icon name="trash" size={15} />Eliminar usuario
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
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
            <div className="field"><label>Tipo de vehículo</label><div className="segmented pills-inline"><button type="button" className={registerForm.tipo === 'Carro' ? 'active' : ''} onClick={() => setRegisterForm((prev) => ({ ...prev, tipo: 'Carro' }))}><VehicleIcon tipo="Carro" />Carro</button><button type="button" className={registerForm.tipo === 'Moto' ? 'active' : ''} onClick={() => setRegisterForm((prev) => ({ ...prev, tipo: 'Moto' }))}><VehicleIcon tipo="Moto" />Moto</button></div></div>
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
            <h2>Mapa de celdas ({cells.length})</h2>
            {isAdmin && <button className="primary-btn" onClick={initializeCells}>Configuración inicial (70 Carros / 10 Motos)</button>}
          </div>
          <div className="module-empty">
            <div className="empty-icon"><Icon name="grid" size={22} /></div>
            <h3>No se han configurado las celdas del parqueadero</h3>
            <p>Ejecuta la configuración inicial para crear el inventario completo de 70 carros (C-01 a C-70) y 10 motos (M-01 a M-10).</p>
            {isAdmin ? (
              <button className="primary-btn" onClick={initializeCells}>Ejecutar configuración inicial (70 Carros / 10 Motos)</button>
            ) : (
              <small>{user.rol === 'Administrador' ? 'Cambia al modo Administrador en el dock inferior para ejecutar la configuración inicial.' : 'Solicita al administrador que ejecute la configuración inicial.'}</small>
            )}
          </div>
        </div>
      )
    }

    const carTotal = cells.filter((cell) => cell.tipo === 'Carro').length
    const motoTotal = cells.filter((cell) => cell.tipo === 'Moto').length
    const carAvailable = cells.filter((cell) => cell.tipo === 'Carro' && cell.estado !== 'Fuera de servicio').length
    const motoAvailable = cells.filter((cell) => cell.tipo === 'Moto' && cell.estado !== 'Fuera de servicio').length

    // HU-C01: cada celda aparece en la sección de su tipo actual (C-72 con los carros, M-11 con las motos).
    // Las que resultan de una conversión van agrupadas en un recuadro que indica su espacio original
    // (M-11 y M-12 en el espacio C-20) y se ordenan por su propio código.
    type MapItem =
      | { kind: 'cell'; codigo: string; cell: CellRecord }
      | { kind: 'space'; codigo: string; espacio: string; cells: CellRecord[] }
    const compararCodigos = (a: string, b: string) => a.localeCompare(b, 'es', { numeric: true })
    const buildSection = (tipo: VehicleType) => {
      const items: MapItem[] = []
      const espacios = new Map<string, CellRecord[]>()
      for (const cell of filteredCells) {
        if (cell.espacio_original) {
          if (cell.tipo !== tipo) continue
          espacios.set(cell.espacio_original, [...(espacios.get(cell.espacio_original) ?? []), cell])
        } else if (cell.tipo === tipo) {
          items.push({ kind: 'cell', codigo: cell.codigo, cell })
        }
      }
      espacios.forEach((grupo, espacio) => {
        const ordenadas = grupo.sort((a, b) => compararCodigos(a.codigo, b.codigo))
        items.push({ kind: 'space', codigo: ordenadas[0].codigo, espacio, cells: ordenadas })
      })
      items.sort((a, b) => compararCodigos(a.codigo, b.codigo))
      const total = items.reduce((acc, item) => acc + (item.kind === 'cell' ? 1 : item.cells.length), 0)
      const last = items[items.length - 1]
      return { items, total, first: items[0]?.codigo, last: last?.kind === 'space' ? last.cells[last.cells.length - 1].codigo : last?.codigo }
    }
    const carSection = buildSection('Carro')
    const motoSection = buildSection('Moto')

    const statusClassFor = (estado: CellStatus) =>
      estado === 'Libre' ? 'free libre' : estado === 'Ocupada' ? 'occupied ocupada' : 'disabled fueradeservicio'

    const renderCellCard = (cell: CellRecord) => (
      <button
        key={cell.codigo}
        type="button"
        className={`cell-card ${statusClassFor(cell.estado)} ${selectedCell?.codigo === cell.codigo ? 'selected' : ''}`}
        onClick={() => {
          setSelectedCellCode(cell.codigo)
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
    )

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
              <small>Vehículos activos: {carActiveSubscriptions} · Celdas disponibles (cupo activo): {carAvailable} de {carTotal || 70}</small>
            </div>
          </div>
          <div className="module-summary-card">
            <div className="module-summary-icon amber" />
            <div className="module-summary-copy">
              <strong>
                Motos: {cells.filter((cell) => cell.tipo === 'Moto' && cell.estado === 'Ocupada').length} ocupadas, {cells.filter((cell) => cell.tipo === 'Moto' && cell.estado === 'Libre').length} libres, {cells.filter((cell) => cell.tipo === 'Moto' && cell.estado === 'Fuera de servicio').length} fuera de servicio de {motoTotal || 10}
              </strong>
              <small>Vehículos activos: {motoActiveSubscriptions} · Celdas disponibles (cupo activo): {motoAvailable} de {motoTotal || 10}</small>
            </div>
          </div>
        </div>

        <div className="module-toolbar compact">
          <div className="filter-group">
            <span>Tipo</span>
            <div className="filter-pills">
              {(['Todas', 'Carros', 'Motos'] as const).map((option) => (
                <button key={option} type="button" className={`filter-pill ${cellTypeFilter === option ? 'active' : ''}`} onClick={() => setCellTypeFilter(option)}>
                  {option !== 'Todas' && <VehicleIcon tipo={option === 'Carros' ? 'Carro' : 'Moto'} size={14} />}
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
          {([['Carro', carSection], ['Moto', motoSection]] as const).map(([tipo, section]) => section.items.length > 0 && (
            <div key={tipo} className="cell-group">
              <h3><VehicleIcon tipo={tipo} />{tipo === 'Carro' ? 'CARROS' : 'MOTOS'} / {section.first} — {section.last} ({section.total})</h3>
              <div className={`cell-grid ${tipo === 'Moto' ? 'small-grid' : ''}`}>
                {section.items.map((item) => item.kind === 'cell' ? renderCellCard(item.cell) : (
                  // Ocupa una columna por cada celda que contiene, así cada celda mide igual que las demás de su tipo.
                  <div key={item.espacio} className={`cell-space ${item.cells.length === 1 ? 'single' : ''}`} title={`Celda convertida: antes ${item.espacio}`} style={{ gridColumn: `span ${item.cells.length}` }} role="group" aria-label={`Espacio ${item.espacio} convertido: ${item.cells.map((c) => c.codigo).join(' y ')}`}>
                    <div className="cell-space-head">
                      <span>Antes {item.cells.length === 1 ? item.espacio.replace(' y ', '/') : item.espacio}</span>
                      <em>Convertido</em>
                    </div>
                    <div className="cell-space-cells">{item.cells.map(renderCellCard)}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
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
              {selectedCell.espacio_original && <span className="detail-tag indigo">En el espacio {selectedCell.espacio_original} (convertido)</span>}
            </div>

            {cellActionError && <div className="notice notice-red"><Icon name="alert" size={16} /><span>{cellActionError}</span></div>}

            {selectedCell.estado === 'Ocupada' ? (
              <div className="notice notice-amber">
                <Icon name="alert" size={16} />
                <span>La celda {selectedCell.codigo} está ocupada por {selectedCell.placa} y no puede pasar a Fuera de servicio, convertirse ni restablecerse hasta que se registre la salida en Operaciones.</span>
              </div>
            ) : !isAdmin ? (
              <div className="permission-note">Solo el perfil de Administrador puede poner celdas fuera de servicio, habilitarlas, convertirlas, restablecerlas o eliminarlas.</div>
            ) : (
              <>
                <div className="field">
                  <label>Motivo (obligatorio)</label>
                  <input value={cellReason} onChange={(e) => { setCellReason(e.target.value); setCellActionError('') }} placeholder={selectedCell.estado === 'Fuera de servicio' ? 'Ej. Reparación completada, celda habilitada...' : 'Ej. Piso en reparación, más demanda de motos...'} />
                </div>
                <div className="detail-actions">
                  <button className={selectedCell.estado === 'Libre' ? 'secondary-btn danger' : 'primary-btn'} onClick={handleCellStatusChange}>
                    {selectedCell.estado === 'Libre' ? 'Pasar a Fuera de servicio' : 'Restablecer / Habilitar a Libre'}
                  </button>
                  {selectedCell.espacio_original ? (
                    <button className="secondary-btn" onClick={() => handleCellConversion('restablecer')}>
                      <Icon name="history" size={15} />Restablecer espacio {selectedCell.espacio_original}
                    </button>
                  ) : selectedCell.tipo === 'Carro' ? (
                    <button className="secondary-btn" disabled={selectedCell.estado !== 'Libre'} title={selectedCell.estado !== 'Libre' ? 'La celda debe estar libre para convertirla.' : undefined} onClick={() => handleCellConversion('convertir')}>
                      <VehicleIcon tipo="Moto" size={15} />Convertir en 2 celdas de moto
                    </button>
                  ) : selectedCell.pareja ? (
                    <button className="secondary-btn" disabled={selectedCell.estado !== 'Libre'} title={selectedCell.estado !== 'Libre' ? 'La celda debe estar libre para convertirla.' : undefined} onClick={() => handleCellConversion('convertir')}>
                      <VehicleIcon tipo="Carro" size={15} />Convertir {[selectedCell.codigo, selectedCell.pareja].sort().join(' y ')} en 1 celda de carro
                    </button>
                  ) : null}
                  {!selectedCell.espacio_original && <button
                    type="button"
                    className="secondary-btn danger"
                    onClick={() => {
                      setDeleteModalError('')
                      setConfirmDeleteModal({
                        kind: 'cell',
                        targetId: selectedCell.codigo,
                        title: `Eliminar celda ${selectedCell.codigo}`,
                        description: `¿Confirmas que deseas eliminar la celda ${selectedCell.codigo} (${selectedCell.tipo}) del inventario del parqueadero? Se validará automáticamente el cupo mínimo garantizado para los vehículos activos.`,
                      })
                    }}
                  >
                    <Icon name="trash" size={15} />Eliminar celda
                  </button>}
                </div>
                <p className="detail-hint">
                  {selectedCell.espacio_original
                    ? `Restablecer devuelve el espacio a ${selectedCell.espacio_original}. Todas sus celdas deben estar libres.`
                    : selectedCell.tipo === 'Carro'
                      ? 'Convertir crea 2 celdas de moto con los siguientes códigos disponibles; la celda debe estar libre.'
                      : selectedCell.pareja
                        ? `Convertir une ${selectedCell.codigo} con su pareja ${selectedCell.pareja} en 1 celda de carro; ambas deben estar libres.`
                        : 'Solo las parejas fijas de motos originales (M-01 con M-02 … M-09 con M-10) se pueden convertir a carro.'}
                </p>
              </>
            )}

            <div className="history-list">
              <h4>Historial de trazabilidad de la celda {selectedCell.codigo}</h4>
              <div className="history-scroll">
                {selectedCell.historial.length === 0 && <p className="detail-hint">Sin cambios registrados para esta celda.</p>}
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
        <button type="button" className={subView === 'directory' ? 'active' : ''} onClick={() => setSubView('directory')}><Icon name="users" size={16} />Directorio de Usuarios {userCount > 0 && <span>{userCount}</span>}</button>
        <button type="button" className={subView === 'map' ? 'active' : ''} onClick={() => setSubView('map')}><Icon name="map" size={16} />Mapa de Celdas ({cells.length})</button>
        <button type="button" className={subView === 'register' ? 'active' : ''} onClick={() => setSubView('register')}><Icon name="plus" size={16} />Registrar Usuario y Vehículo</button>
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
                  <button type="button" className={vehicleModalForm.tipo === 'Carro' ? 'active' : ''} onClick={() => { setVehicleModalForm((prev) => ({ ...prev, tipo: 'Carro' })); setModalError('') }}><VehicleIcon tipo="Carro" />Carro</button>
                  <button type="button" className={vehicleModalForm.tipo === 'Moto' ? 'active' : ''} onClick={() => { setVehicleModalForm((prev) => ({ ...prev, tipo: 'Moto' })); setModalError('') }}><VehicleIcon tipo="Moto" />Moto</button>
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
      {auditModalUser && (() => {
        const activeAuditUser = users.find((u) => u.id === auditModalUser.id) ?? auditModalUser
        return (
          <div className="modal-backdrop" onMouseDown={() => setAuditModalUser(null)}>
            <div className="modal-card wide" onMouseDown={(e) => e.stopPropagation()}>
              <div className="modal-head">
                <div>
                  <h2>Historial de trazabilidad · {activeAuditUser.nombres} {activeAuditUser.apellidos}</h2>
                  <p>{activeAuditUser.documentoTipo} {activeAuditUser.documento} · Registro inalterable de creaciones, ediciones y cambios de estado.</p>
                </div>
                <button className="icon-btn" onClick={() => setAuditModalUser(null)} aria-label="Cerrar"><Icon name="x" /></button>
              </div>
              <div className="modal-body">
                <div className="history-scroll">
                  {activeAuditUser.auditLogs.map((log) => (
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
        )
      })()}

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
                onClick={async () => {
                  const trimmedCode = newCellForm.codigo.trim().toUpperCase()
                  if (!trimmedCode) {
                    setNewCellError('Debes ingresar un código para la celda (ej. C-71).')
                    return
                  }
                  try {
                    const createdCell = await createModule2Cell({
                      codigo: trimmedCode,
                      tipo: newCellForm.tipo,
                    })
                    setCells((prev) => [...prev, createdCell])
                    setSelectedCellCode(createdCell.codigo)
                    setNewCellOpen(false)
                    setNewCellForm({ codigo: '', tipo: 'Carro' })
                    setNewCellError('')
                  } catch (err) {
                    setNewCellError(errorMessage(err))
                  }
                }}
              >
                Guardar celda
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal f) Confirmación de eliminación (Usuario / Vehículo / Celda) */}
      {confirmDeleteModal && (
        <div className="modal-backdrop" onMouseDown={closeDeleteModal}>
          <div className="modal-card" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <h2>{confirmDeleteModal.title}</h2>
                <p>Confirma esta acción para aplicarla en la base de datos.</p>
              </div>
              <button className="icon-btn" onClick={closeDeleteModal} aria-label="Cerrar"><Icon name="x" /></button>
            </div>
            <div className="modal-body">
              <div className="notice notice-amber">
                <Icon name="alert" size={18} />
                <span>{confirmDeleteModal.description}</span>
              </div>
              {confirmDeleteModal.kind !== 'cell' && !deleteBlockedByHistory && (
                <div className="field">
                  <label>Motivo obligatorio</label>
                  <input
                    value={deleteReason}
                    onChange={(e) => { setDeleteReason(e.target.value); setDeleteModalError('') }}
                    placeholder="Ej. Documento digitado con error al registrar"
                    autoFocus
                  />
                  <small>Queda registrado quién eliminó, cuándo y por qué.</small>
                </div>
              )}
              {deleteModalError && (
                <div className="notice notice-red">
                  <Icon name="alert" size={16} />
                  <span>{deleteModalError}</span>
                </div>
              )}
            </div>
            <div className="modal-actions">
              <button className="secondary-btn" onClick={closeDeleteModal}>{deleteBlockedByHistory ? 'Cerrar' : 'Cancelar'}</button>
              {deleteBlockedByHistory ? (
                confirmDeleteModal.inactivate && (
                  <button
                    className="primary-btn"
                    onClick={() => {
                      const target = confirmDeleteModal.inactivate
                      closeDeleteModal()
                      if (!target) return
                      setModalUserAction(target)
                      setModalReason('')
                      setModalError('')
                    }}
                  >
                    Inactivar en su lugar
                  </button>
                )
              ) : (
                <button className="secondary-btn danger" onClick={handleConfirmDelete} disabled={confirmDeleteModal.kind !== 'cell' && !deleteReason.trim()}>
                  Confirmar eliminación
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

function SubscriptionPill({ state }: { state: SubscriptionState }) {
  const cls =
    state === 'Al día'
      ? 'al-dia'
      : state === 'Por vencer'
        ? 'por-vencer'
        : state === 'Vencida'
          ? 'vencida'
          : 'sin-mensualidad'
  return <span className={`sub-badge ${cls}`}>{state}</span>
}

function PaymentsModule({
  roleMode,
  user,
  users,
  cells,
  payments,
  setPayments,
  tariffs,
  setTariffs,
  subView,
  setSubView,
  expiringCount,
  onNotify,
}: {
  roleMode: 'Operario' | 'Administrador'
  user: User
  users: UserRecord[]
  cells: CellRecord[]
  payments: PaymentRecord[]
  setPayments: React.Dispatch<React.SetStateAction<PaymentRecord[]>>
  tariffs: TariffsState
  setTariffs: React.Dispatch<React.SetStateAction<TariffsState>>
  subView: PaymentsSubView
  setSubView: React.Dispatch<React.SetStateAction<PaymentsSubView>>
  expiringCount: number
  onNotify: (msg: string) => void
}) {
  const isAdmin = user.rol === 'Administrador' && roleMode === 'Administrador'
  const currentOperatorName = user.nombre || (isAdmin ? 'Administrador' : 'Operario')
  const todayYMD = todayColombiaYMD()

  // Estado de Sub-vista 1: Cobrar Mensualidad (exclusivamente en Efectivo)
  const [chargeSearch, setChargeSearch] = useState('')
  const [selectedUserId, setSelectedUserId] = useState<number | null>(() => users[0]?.id ?? null)
  const [selectedPlate, setSelectedPlate] = useState<string>(() => users[0]?.vehiculos[0]?.placa ?? '')
  const [monthsToPay, setMonthsToPay] = useState<1 | 2 | 3>(1)
  const [cashReceivedInput, setCashReceivedInput] = useState('')
  const [chargeError, setChargeError] = useState('')
  const [submittingPayment, setSubmittingPayment] = useState(false)

  // Estado de Sub-vista 2: Por Vencer y Vencidas
  const [expiringSearch, setExpiringSearch] = useState('')
  const [expiringStateFilter, setExpiringStateFilter] = useState<'Todas' | 'Por vencer' | 'Vencida'>('Todas')
  const [expiringTypeFilter, setExpiringTypeFilter] = useState<'Todos' | VehicleType>('Todos')

  // Estado de Sub-vista 3: Historial y Caja del Día
  const [cashboxOperatorFilter, setCashboxOperatorFilter] = useState<string>('Todos')
  const [historySearch, setHistorySearch] = useState('')
  const [historyDesde, setHistoryDesde] = useState('')
  const [historyHasta, setHistoryHasta] = useState('')
  const [historyStatusFilter, setHistoryStatusFilter] = useState<'Todos' | PaymentStatus>('Todos')

  // Estado de Sub-vista 4: Tarifas y Recaudo
  const [tariffForm, setTariffForm] = useState<{
    tipo: VehicleType
    nuevoValor: string
    fechaInicio: string
    motivo: string
  }>({
    tipo: 'Carro',
    nuevoValor: '',
    fechaInicio: todayYMD,
    motivo: '',
  })
  const [tariffError, setTariffError] = useState('')
  const [tariffSuccess, setTariffSuccess] = useState('')

  const [reportDesde, setReportDesde] = useState(() => {
    const [y, m] = todayYMD.split('-')
    return `${y}-${m}-01`
  })
  const [reportHasta, setReportHasta] = useState(todayYMD)
  const [reportTypeFilter, setReportTypeFilter] = useState<'Todos' | VehicleType>('Todos')
  const [reportOperatorFilter, setReportOperatorFilter] = useState<string>('Todos')

  // Modales: Comprobante (HU-P04), Anulación (HU-P09) y Cierre de Caja Imprimible (HU-P11)
  const [receiptModal, setReceiptModal] = useState<{
    payment: PaymentRecord
    isCopy: boolean
  } | null>(null)
  const [annulModalPayment, setAnnulModalPayment] = useState<PaymentRecord | null>(null)
  const [annulReason, setAnnulReason] = useState('')
  const [annulError, setAnnulError] = useState('')
  const [cashboxPrintOpen, setCashboxPrintOpen] = useState(false)

  // Sincroniza pagos, tarifas, caja y vencimientos desde el backend FastAPI al cambiar de sub-vista
  useEffect(() => {
    getModule3Payments().then(setPayments).catch(() => {})
    getModule3Tariffs().then(setTariffs).catch(() => {})
    if (subView === 'expiring') {
      getModule3Expiring().catch(() => {})
    } else if (subView === 'history') {
      getModule3Cashbox(cashboxOperatorFilter).catch(() => {})
    }
  }, [subView, cashboxOperatorFilter, setPayments, setTariffs])

  // Sincroniza selección inicial cuando llegan usuarios (sin disparar re-renders innecesarios)
  useEffect(() => {
    if (users.length === 0) return
    const current = users.find((u) => u.id === selectedUserId)
    if (!current) {
      const nextId = users[0].id
      const nextPlate = users[0].vehiculos[0]?.placa ?? ''
      if (selectedUserId !== nextId) setSelectedUserId(nextId)
      if (selectedPlate !== nextPlate) setSelectedPlate(nextPlate)
    } else if (!current.vehiculos.some((v) => v.placa === selectedPlate)) {
      const nextPlate = current.vehiculos[0]?.placa ?? ''
      if (selectedPlate !== nextPlate) setSelectedPlate(nextPlate)
    }
  }, [users, selectedUserId, selectedPlate])

  // Tarifas efectivas vigentes
  const effectiveCarTariff = getEffectiveTariffForType('Carro', tariffs)
  const effectiveMotoTariff = getEffectiveTariffForType('Moto', tariffs)

  // Cupo garantizado por tipo de vehículo (RN-P05 y RN-C05):
  // Las celdas utilizables (Libre + Ocupada, sin contar Fuera de servicio) deben alcanzar para todos los vehículos activos de ese tipo.
  const getActivePaidCountForType = (tipo: VehicleType): number => {
    const fromUsers = users
      .filter((u) => u.estado === 'Activo')
      .reduce((acc, u) => {
        return acc + u.vehiculos.filter((v) => v.estado === 'Activo' && v.tipo === tipo).length
      }, 0)
    const occupied = cells.filter((c) => c.tipo === tipo && c.estado === 'Ocupada').length
    return Math.max(fromUsers, occupied)
  }

  const getUsableCellsCountForType = (tipo: VehicleType): number => {
    const typeCells = cells.filter((c) => c.tipo === tipo)
    if (typeCells.length === 0) return tipo === 'Carro' ? 70 : 10
    return typeCells.filter((c) => c.estado !== 'Fuera de servicio').length
  }

  // Selección actual en Sub-vista 1
  const matchingUsersForCharge = users.filter((u) => {
    if (!chargeSearch.trim()) return true
    const q = chargeSearch.trim().toLowerCase()
    const hay = `${u.documentoTipo} ${u.documento} ${u.nombres} ${u.apellidos} ${u.vehiculos.map((v) => v.placa).join(' ')}`.toLowerCase()
    return hay.includes(q)
  })

  const selectedUser = users.find((u) => u.id === selectedUserId) ?? matchingUsersForCharge[0] ?? null
  const selectedVehicle =
    selectedUser?.vehiculos.find((v) => v.placa === selectedPlate) ?? selectedUser?.vehiculos[0] ?? null

  const selectedSubInfo = selectedVehicle
    ? getVehicleSubscriptionInfo(selectedVehicle.placa, payments, todayYMD)
    : null

  const applicableTariff = selectedVehicle
    ? selectedVehicle.tipo === 'Carro'
      ? effectiveCarTariff
      : effectiveMotoTariff
    : 0
  const totalToPay = applicableTariff * monthsToPay
  const calculatedPeriod = selectedSubInfo
    ? calculatePaymentPeriod(selectedSubInfo, monthsToPay, todayYMD)
    : null

  const parsedCashReceived = Number(cashReceivedInput.replace(/[^0-9]/g, '')) || 0
  const cashChange = parsedCashReceived - totalToPay

  // Validaciones de bloqueo en Cobrar Mensualidad (RN-P01 y RN-P05)
  const chargeBlockReason = (() => {
    if (!selectedUser || !selectedVehicle || !selectedSubInfo) return ''
    if (selectedUser.estado === 'Inactivo') {
      return `El titular ${selectedUser.nombres} ${selectedUser.apellidos} se encuentra en estado Inactivo. El Administrador debe activarlo primero en Usuarios y celdas antes de registrar un pago (RN-P01).`
    }
    if (selectedVehicle.estado === 'Inactivo') {
      return `El vehículo de placa ${selectedVehicle.placa} se encuentra en estado Inactivo. El Administrador debe activarlo primero en Usuarios y celdas antes de registrar un pago (RN-P01).`
    }
    // RN-P05: Las celdas utilizables del tipo deben alcanzar para todos los vehículos activos de ese tipo.
    const activosTipo = getActivePaidCountForType(selectedVehicle.tipo)
    const celdasUtilizables = getUsableCellsCountForType(selectedVehicle.tipo)
    if (activosTipo > celdasUtilizables) {
      return `No hay cupo garantizado de ${selectedVehicle.tipo} disponible: las celdas utilizables (${celdasUtilizables}) deben alcanzar para todos los vehículos activos (${activosTipo}).`
    }
    return ''
  })()

  const handleConfirmPayment = async () => {
    if (submittingPayment || !selectedUser || !selectedVehicle || !selectedSubInfo || !calculatedPeriod) return
    setChargeError('')

    if (chargeBlockReason) {
      setChargeError(chargeBlockReason)
      return
    }

    if (parsedCashReceived < totalToPay) {
      setChargeError(`El valor recibido en efectivo (${formatCOP(parsedCashReceived)}) es menor al total a pagar (${formatCOP(totalToPay)}).`)
      return
    }

    setSubmittingPayment(true)
    try {
      const createdPayment = await createModule3Payment({
        placa: selectedVehicle.placa.toUpperCase(),
        meses_pagados: monthsToPay,
        metodo_pago: 'Efectivo',
        valor_recibido_cop: parsedCashReceived,
        referencia_pago: null,
      })

      const freshList = await getModule3Payments().catch(() => [createdPayment, ...payments])
      setPayments(freshList)
      setCashReceivedInput('')
      setMonthsToPay(1)
      setReceiptModal({ payment: createdPayment, isCopy: false })
      onNotify(`Pago ${createdPayment.consecutivo} registrado · ${createdPayment.placa} al día hasta el ${formatDate(createdPayment.fechaVencimiento)}`)
    } catch (err) {
      setChargeError(errorMessage(err))
    } finally {
      setSubmittingPayment(false)
    }
  }

  // Determina si un pago es el último pago no anulado de ese vehículo (RN-P07)
  const isLatestActivePaymentForPlate = (payment: PaymentRecord): boolean => {
    if (payment.estado !== 'Registrado') return false
    if (typeof payment.esUltimoActivo === 'boolean') return payment.esUltimoActivo
    const activeForPlate = payments
      .filter((p) => p.placa.toUpperCase() === payment.placa.toUpperCase() && p.estado === 'Registrado')
      .sort((a, b) => b.id - a.id)
    return activeForPlate[0]?.id === payment.id
  }

  const handleConfirmAnnulPayment = async () => {
    if (!annulModalPayment) return
    if (!isAdmin) {
      setAnnulError('Solo el Administrador puede anular pagos registrados.')
      return
    }
    const reason = annulReason.trim()
    if (reason.length < 5) {
      setAnnulError('Debes ingresar un motivo obligatorio (mínimo 5 caracteres) para anular el pago.')
      return
    }
    if (!isLatestActivePaymentForPlate(annulModalPayment)) {
      setAnnulError('Solo se puede anular el último pago vigente de este vehículo (RN-P07).')
      return
    }

    try {
      const annulled = await annulModule3Payment(annulModalPayment.id, reason)
      const freshList = await getModule3Payments().catch(() =>
        payments.map((p) => (p.id === annulled.id ? annulled : p)),
      )
      setPayments(freshList)
      onNotify(`Comprobante ${annulled.consecutivo} (${annulled.placa}) anulado y vigencia revertida`)
      setAnnulModalPayment(null)
      setAnnulReason('')
      setAnnulError('')
    } catch (err) {
      setAnnulError(errorMessage(err))
    }
  }

  // Lista de operadores disponibles para filtros
  const allOperators = Array.from(
    new Set([currentOperatorName, 'Administrador', 'Operario', ...payments.map((p) => p.operario)]),
  ).filter(Boolean)

  // Render Sub-vista 1: Cobrar Mensualidad
  const renderChargeView = () => (
    <div className="module-panel">
      <div className="module-panel-head">
        <div>
          <h2>Cobrar mensualidad</h2>
          <p className="detail-hint">Busca un titular o placa, verifica el estado de su vigencia y liquida 1, 2 o 3 meses.</p>
        </div>
        <div className="detail-meta">
          <span className="detail-tag muted"><VehicleIcon tipo="Carro" size={14} /> Tarifa Carro: {formatCOP(effectiveCarTariff)}</span>
          <span className="detail-tag muted"><VehicleIcon tipo="Moto" size={14} /> Tarifa Moto: {formatCOP(effectiveMotoTariff)}</span>
        </div>
      </div>

      <div className="payment-charge-grid">
        {/* Columna Izquierda: Buscador y Ficha de Usuario y Vehículos */}
        <div className="payment-column-card">
          <h3>1. Buscar titular o vehículo</h3>
          <div className="search-box">
            <Icon name="search" size={16} />
            <input
              value={chargeSearch}
              onChange={(e) => {
                const val = e.target.value
                setChargeSearch(val)
                setChargeError('')
                const q = val.trim().toLowerCase()
                if (!q) return
                // Si coincide con una placa o documento exacto, preselecciona de inmediato
                for (const u of users) {
                  const vehMatch = u.vehiculos.find((v) => v.placa.toLowerCase().includes(q))
                  if (vehMatch) {
                    setSelectedUserId(u.id)
                    setSelectedPlate(vehMatch.placa)
                    return
                  }
                  if (
                    u.documento.toLowerCase().includes(q) ||
                    `${u.nombres} ${u.apellidos}`.toLowerCase().includes(q)
                  ) {
                    setSelectedUserId(u.id)
                    setSelectedPlate(u.vehiculos[0]?.placa ?? '')
                    return
                  }
                }
              }}
              placeholder="Documento, nombre o placa (ej. 1036000001, Laura, ABC123)..."
            />
            {chargeSearch && (
              <button type="button" className="icon-btn" onClick={() => setChargeSearch('')} aria-label="Limpiar búsqueda">
                <Icon name="x" size={15} />
              </button>
            )}
          </div>

          {matchingUsersForCharge.length === 0 ? (
            <div className="module-empty compact">
              <p>No se encontraron usuarios ni placas que coincidan con "{chargeSearch}".</p>
            </div>
          ) : (
            <div className="payment-user-results" role="listbox" aria-label="Usuarios encontrados">
              {matchingUsersForCharge.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  className={`payment-user-option ${selectedUser?.id === u.id ? 'selected' : ''}`}
                  onClick={() => {
                    setSelectedUserId(u.id)
                    setSelectedPlate(u.vehiculos[0]?.placa ?? '')
                    setChargeError('')
                  }}
                >
                  <div>
                    <strong>{u.nombres} {u.apellidos}</strong>
                    <small>{u.documentoTipo} {u.documento} · {u.celular}</small>
                  </div>
                  <div className="detail-meta">
                    <span className={`mini-badge ${u.estado === 'Activo' ? 'success' : 'muted'}`}>{u.estado}</span>
                    <span className="doc-pill">{u.vehiculos.length} {u.vehiculos.length === 1 ? 'vehículo' : 'vehículos'}</span>
                  </div>
                </button>
              ))}
            </div>
          )}

          {selectedUser && (
            <div className="payment-user-card">
              <div className="payment-user-header">
                <div className="user-meta">
                  <div className="avatar avatar-light">{initials(`${selectedUser.nombres} ${selectedUser.apellidos}`)}</div>
                  <div>
                    <strong>{selectedUser.nombres} {selectedUser.apellidos}</strong>
                    <small>{selectedUser.documentoTipo} {selectedUser.documento} · Cel: {selectedUser.celular} · {selectedUser.correo || 'Sin correo'}</small>
                  </div>
                </div>
                <span className={`status-pill ${selectedUser.estado === 'Activo' ? 'success' : 'muted'}`}>{selectedUser.estado}</span>
              </div>

              <span style={{ fontSize: '12px', fontWeight: 700, color: '#475569' }}>
                VEHÍCULOS ASOCIADOS (SELECCIONA EL VEHÍCULO A LIQUIDAR)
              </span>

              <div className="payment-vehicle-cards">
                {selectedUser.vehiculos.map((v) => {
                  const sub = getVehicleSubscriptionInfo(v.placa, payments, todayYMD)
                  const isSelected = selectedVehicle?.placa === v.placa
                  return (
                    <button
                      key={v.id}
                      type="button"
                      className={`payment-vehicle-card ${isSelected ? 'selected' : ''}`}
                      onClick={() => {
                        setSelectedPlate(v.placa)
                        setChargeError('')
                      }}
                    >
                      <div className="payment-vehicle-top">
                        <div className="detail-meta">
                          <span className="vehicle-badge">
                            <VehicleIcon tipo={v.tipo} size={14} />
                            <strong>{v.placa}</strong>
                            <small>{v.tipo}</small>
                          </span>
                          <span className="vehicle-meta">{v.marca} · {v.color}</span>
                          <span className={`mini-badge ${v.estado === 'Activo' ? 'success' : 'muted'}`}>{v.estado}</span>
                        </div>
                        <SubscriptionPill state={sub.estado} />
                      </div>
                      <div className="payment-vehicle-foot">
                        {sub.estado === 'Sin mensualidad' ? (
                          <span>Sin pagos vigentes registrados · Primer cobro de mensualidad</span>
                        ) : sub.estado === 'Vencida' ? (
                          <span>
                            Venció el <strong>{formatDate(sub.fechaVencimiento!)}</strong> ·{' '}
                            <strong style={{ color: '#991B1B' }}>{sub.diasMora} {sub.diasMora === 1 ? 'día' : 'días'} de mora</strong>
                          </span>
                        ) : (
                          <span>
                            Vence el <strong>{formatDate(sub.fechaVencimiento!)}</strong> ·{' '}
                            <strong>{sub.diasRestantes === 0 ? 'Vence hoy' : `${sub.diasRestantes} ${sub.diasRestantes === 1 ? 'día restante' : 'días restantes'}`}</strong>
                          </span>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Columna Derecha: Formulario de Liquidación */}
        <div className="payment-column-card">
          <h3>2. Liquidación y registro de pago</h3>

          {!selectedUser || !selectedVehicle || !selectedSubInfo || !calculatedPeriod ? (
            <div className="module-empty compact">
              <p>Selecciona un usuario y un vehículo en la columna izquierda para liquidar su mensualidad.</p>
            </div>
          ) : (
            <>
              {chargeBlockReason && (
                <div className="notice notice-red">
                  <Icon name="alert" size={18} />
                  <span><strong>Cobro bloqueado:</strong> {chargeBlockReason}</span>
                </div>
              )}

              <div className="field">
                <label>Meses a pagar (cada mes equivale a 30 días calendario)</label>
                <div className="segmented pills-inline">
                  {([1, 2, 3] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      className={monthsToPay === m ? 'active' : ''}
                      onClick={() => {
                        setMonthsToPay(m)
                        setChargeError('')
                      }}
                    >
                      {m} {m === 1 ? 'mes (30 días)' : `meses (${m * 30} días)`}
                    </button>
                  ))}
                </div>
              </div>

              <div className="settlement-summary">
                <div className="settlement-item">
                  <span>Vehículo seleccionado</span>
                  <strong className="type-line">
                    <VehicleIcon tipo={selectedVehicle.tipo} size={15} />
                    {selectedVehicle.placa} ({selectedVehicle.tipo})
                  </strong>
                  <small>{selectedVehicle.marca} · {selectedVehicle.color}</small>
                </div>
                <div className="settlement-item">
                  <span>Tarifa mensual vigente</span>
                  <strong>{formatCOP(applicableTariff)}</strong>
                  <small>Valor unitario por 30 días</small>
                </div>
                <div className="settlement-item total">
                  <span>Total a pagar ({monthsToPay} {monthsToPay === 1 ? 'mes' : 'meses'})</span>
                  <strong>{formatCOP(totalToPay)}</strong>
                  <small>Cálculo automático no editable</small>
                </div>
                <div className="settlement-item">
                  <span>Estado actual</span>
                  <div><SubscriptionPill state={selectedSubInfo.estado} /></div>
                  <small>
                    {selectedSubInfo.fechaVencimiento
                      ? `Vencimiento actual: ${formatDate(selectedSubInfo.fechaVencimiento)}`
                      : 'Sin vigencia previa'}
                  </small>
                </div>
                <div className="settlement-item full">
                  <span>Nuevo período cubierto ({calculatedPeriod.diasTotales} días calendario)</span>
                  <strong>
                    Del {formatDate(calculatedPeriod.fechaInicio)} al {formatDate(calculatedPeriod.fechaVencimiento)} (23:59)
                  </strong>
                  <small>
                    {selectedSubInfo.estado === 'Al día' || selectedSubInfo.estado === 'Por vencer'
                      ? 'Inicia el día siguiente al vencimiento actual para conservar todos sus días vigentes.'
                      : 'Inicia desde hoy por encontrarse vencida o sin mensualidad activa.'}
                  </small>
                </div>
              </div>

              <div className="field">
                <label>Forma de pago</label>
                <div className="segmented pills-inline">
                  <button type="button" className="active">
                    Efectivo
                  </button>
                </div>
              </div>

              <div className="field">
                <label>Valor recibido en efectivo (COP)</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={cashReceivedInput ? Number(cashReceivedInput.replace(/[^0-9]/g, '')).toLocaleString('es-CO') : ''}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/[^0-9]/g, '')
                    setCashReceivedInput(digits)
                    setChargeError('')
                  }}
                  placeholder={`Mínimo ${totalToPay.toLocaleString('es-CO')}`}
                />
                <div className="quick-cash-pills">
                  <button
                    type="button"
                    className="quick-cash-pill"
                    onClick={() => setCashReceivedInput(String(totalToPay))}
                  >
                    Exacto ({formatCOP(totalToPay)})
                  </button>
                  <button
                    type="button"
                    className="quick-cash-pill"
                    onClick={() => setCashReceivedInput(String(Math.ceil((totalToPay + 10000) / 10000) * 10000))}
                  >
                    {formatCOP(Math.ceil((totalToPay + 10000) / 10000) * 10000)}
                  </button>
                  <button
                    type="button"
                    className="quick-cash-pill"
                    onClick={() => setCashReceivedInput(String(Math.ceil((totalToPay + 50000) / 50000) * 50000))}
                  >
                    {formatCOP(Math.ceil((totalToPay + 50000) / 50000) * 50000)}
                  </button>
                </div>
              </div>
              <div className={`cash-change-box ${parsedCashReceived < totalToPay ? 'insufficient' : ''}`}>
                <span>{parsedCashReceived < totalToPay ? 'Faltante por cubrir' : 'Cambio a devolver al cliente'}</span>
                <strong>
                  {parsedCashReceived < totalToPay
                    ? formatCOP(totalToPay - parsedCashReceived)
                    : formatCOP(cashChange)}
                </strong>
              </div>

              {chargeError && (
                <div className="notice notice-red">
                  <Icon name="alert" size={16} />
                  <span>{chargeError}</span>
                </div>
              )}

              <button
                type="button"
                className="primary-btn"
                disabled={!!chargeBlockReason || submittingPayment}
                onClick={handleConfirmPayment}
                style={{ width: '100%', padding: '14px 20px', fontSize: '15px' }}
              >
                {submittingPayment ? 'Procesando pago…' : `Confirmar cobro por ${formatCOP(totalToPay)} y emitir recibo`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )

  // Construye las filas de Sub-vista 2: Por Vencer y Vencidas (HU-P08)
  const expiringRows = (() => {
    const list: Array<{
      user: UserRecord
      vehicle: UserRecord['vehiculos'][number]
      sub: ReturnType<typeof getVehicleSubscriptionInfo>
    }> = []
    for (const u of users) {
      if (u.estado !== 'Activo') continue
      for (const v of u.vehiculos) {
        if (v.estado !== 'Activo') continue
        const sub = getVehicleSubscriptionInfo(v.placa, payments, todayYMD)
        if (sub.estado !== 'Por vencer' && sub.estado !== 'Vencida') continue
        if (expiringStateFilter !== 'Todas' && sub.estado !== expiringStateFilter) continue
        if (expiringTypeFilter !== 'Todos' && v.tipo !== expiringTypeFilter) continue
        if (expiringSearch.trim()) {
          const q = expiringSearch.trim().toLowerCase()
          const hay = `${u.documentoTipo} ${u.documento} ${u.nombres} ${u.apellidos} ${u.celular} ${v.placa}`.toLowerCase()
          if (!hay.includes(q)) continue
        }
        list.push({ user: u, vehicle: v, sub })
      }
    }
    // Ordenados de la fecha de vencimiento más antigua a la más reciente
    return list.sort((a, b) => (a.sub.fechaVencimiento ?? '').localeCompare(b.sub.fechaVencimiento ?? ''))
  })()

  // Render Sub-vista 2: Por Vencer y Vencidas
  const renderExpiringView = () => (
    <div className="module-panel">
      <div className="module-panel-head">
        <div>
          <h2>Mensualidades por vencer y vencidas</h2>
          <p className="detail-hint">
            Vehículos activos con vencimiento próximo (5 días o menos) o en mora, ordenados desde la fecha de vencimiento más antigua.
          </p>
        </div>
      </div>

      <div className="module-toolbar">
        <div className="search-box wide">
          <Icon name="search" size={15} />
          <input
            value={expiringSearch}
            onChange={(e) => setExpiringSearch(e.target.value)}
            placeholder="Buscar por documento, nombre, celular o placa..."
          />
        </div>
        <div className="filter-stack">
          <div className="filter-group">
            <span>Estado</span>
            <div className="filter-pills">
              {(['Todas', 'Por vencer', 'Vencida'] as const).map((opt) => (
                <button
                  key={opt}
                  type="button"
                  className={`filter-pill ${expiringStateFilter === opt ? 'active' : ''}`}
                  onClick={() => setExpiringStateFilter(opt)}
                >
                  {opt === 'Vencida' ? 'Vencidas' : opt}
                </button>
              ))}
            </div>
          </div>
          <div className="filter-group">
            <span>Tipo</span>
            <div className="filter-pills">
              {(['Todos', 'Carro', 'Moto'] as const).map((opt) => (
                <button
                  key={opt}
                  type="button"
                  className={`filter-pill ${expiringTypeFilter === opt ? 'active' : ''}`}
                  onClick={() => setExpiringTypeFilter(opt)}
                >
                  {opt !== 'Todos' && <VehicleIcon tipo={opt} size={14} />}
                  {opt}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {expiringRows.length === 0 ? (
        <div className="module-empty">
          <div className="empty-icon"><Icon name="check" size={22} /></div>
          <h3>No hay mensualidades por vencer ni vencidas con estos filtros</h3>
          <p>Todos los vehículos activos consultados se encuentran al día o sin alertas pendientes.</p>
        </div>
      ) : (
        <div className="module-table-wrap">
          <table className="module-table">
            <thead>
              <tr>
                <th>DOCUMENTO</th>
                <th>NOMBRE</th>
                <th>CELULAR</th>
                <th>PLACA</th>
                <th>TIPO</th>
                <th>FECHA VENCIMIENTO</th>
                <th>DÍAS RESTANTES / MORA</th>
                <th>ACCIÓN</th>
              </tr>
            </thead>
            <tbody>
              {expiringRows.map(({ user: u, vehicle: v, sub }) => (
                <tr key={v.placa}>
                  <td><div className="doc-pill">{u.documentoTipo} {u.documento}</div></td>
                  <td><strong>{u.nombres} {u.apellidos}</strong></td>
                  <td><span className="doc-pill">{u.celular}</span></td>
                  <td><span className="vehicle-badge"><strong>{v.placa}</strong></span></td>
                  <td>
                    <span className="type-line">
                      <VehicleIcon tipo={v.tipo} size={15} />
                      {v.tipo}
                    </span>
                  </td>
                  <td><strong>{sub.fechaVencimiento ? formatDate(sub.fechaVencimiento) : '—'}</strong></td>
                  <td>
                    <div className="detail-meta">
                      <SubscriptionPill state={sub.estado} />
                      {sub.estado === 'Vencida' ? (
                        <strong style={{ color: '#991B1B', fontSize: '12px' }}>
                          {sub.diasMora} {sub.diasMora === 1 ? 'día de mora' : 'días de mora'}
                        </strong>
                      ) : (
                        <strong style={{ color: '#92400E', fontSize: '12px' }}>
                          {sub.diasRestantes === 0
                            ? 'Vence hoy'
                            : `${sub.diasRestantes} ${sub.diasRestantes === 1 ? 'día restante' : 'días restantes'}`}
                        </strong>
                      )}
                    </div>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="primary-btn tiny"
                      onClick={() => {
                        setSelectedUserId(u.id)
                        setSelectedPlate(v.placa)
                        setChargeSearch('')
                        setChargeError('')
                        setSubView('charge')
                      }}
                    >
                      Cobrar →
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )

  // Cálculos de Sub-vista 3: Caja del Día (HU-P11) e Historial General (HU-P07)
  const effectiveCashboxOperator = !isAdmin ? currentOperatorName : cashboxOperatorFilter
  const todayPayments = payments.filter((p) => {
    const payDay = isoToColombiaYMD(p.fechaHoraPago)
    if (payDay !== todayYMD) return false
    if (effectiveCashboxOperator !== 'Todos' && p.operario !== effectiveCashboxOperator) return false
    return true
  })

  const todayValidPayments = todayPayments.filter((p) => p.estado === 'Registrado')
  const todayAnnulledPayments = todayPayments.filter((p) => p.estado === 'Anulado')
  const todayTotalCollected = todayValidPayments.reduce((acc, p) => acc + p.totalPagado, 0)
  const todayTotalAnnulled = todayAnnulledPayments.reduce((acc, p) => acc + p.totalPagado, 0)

  const todayByType = (tipo: VehicleType) => {
    const items = todayValidPayments.filter((p) => p.tipoVehiculo === tipo)
    return { count: items.length, total: items.reduce((acc, p) => acc + p.totalPagado, 0) }
  }

  const filteredHistoryPayments = payments
    .filter((p) => {
      const payDay = isoToColombiaYMD(p.fechaHoraPago)
      if (historyDesde && payDay < historyDesde) return false
      if (historyHasta && payDay > historyHasta) return false
      if (historyStatusFilter !== 'Todos' && p.estado !== historyStatusFilter) return false
      if (historySearch.trim()) {
        const q = historySearch.trim().toLowerCase()
        const hay = `${p.consecutivo} ${p.documentoTipo} ${p.documento} ${p.nombreTitular} ${p.placa} ${p.operario}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
    .sort((a, b) => b.id - a.id)

  // Render Sub-vista 3: Historial y Caja del Día
  const renderHistoryAndCashboxView = () => (
    <div className="module-panel">
      {/* Bloque Superior: Resumen de Caja del Día (HU-P11) */}
      <div className="module-panel-head">
        <div>
          <h2>Resumen de caja del día ({formatDate(todayYMD)})</h2>
          <p className="detail-hint">
            {isAdmin
              ? 'Consolidado en vivo de los cobros realizados hoy. Puedes filtrar por operario o imprimir el cierre.'
              : `Arqueo en vivo de los cobros registrados hoy por el operario en turno (${currentOperatorName}).`}
          </p>
        </div>
        <div className="detail-actions">
          {isAdmin && (
            <select
              value={cashboxOperatorFilter}
              onChange={(e) => setCashboxOperatorFilter(e.target.value)}
              style={{ height: '40px', borderRadius: '999px', padding: '0 14px', border: '1px solid #CBD5E1', background: '#FFFFFF', fontWeight: 600 }}
            >
              <option value="Todos">Todos los operarios</option>
              {allOperators.map((op) => (
                <option key={op} value={op}>{op}</option>
              ))}
            </select>
          )}
          <button type="button" className="secondary-btn" onClick={() => setCashboxPrintOpen(true)}>
            <Icon name="printer" size={15} /> Imprimir cierre de caja
          </button>
        </div>
      </div>

      <div className="kpi-grid-4">
        <div className="kpi-card highlight">
          <span>Total recaudado hoy</span>
          <strong>{formatCOP(todayTotalCollected)}</strong>
          <small>{todayValidPayments.length} {todayValidPayments.length === 1 ? 'pago válido registrado' : 'pagos válidos registrados'}</small>
        </div>
        <div className="kpi-card">
          <span>Forma de pago</span>
          <strong>Efectivo: {formatCOP(todayTotalCollected)}</strong>
          <small>{todayValidPayments.length} {todayValidPayments.length === 1 ? 'cobro en efectivo' : 'cobros en efectivo'} en caja</small>
        </div>
        <div className="kpi-card">
          <span>Por tipo de vehículo</span>
          <strong>Carros: {formatCOP(todayByType('Carro').total)} ({todayByType('Carro').count})</strong>
          <small>Motos: {formatCOP(todayByType('Moto').total)} ({todayByType('Moto').count})</small>
        </div>
        <div className="kpi-card muted-danger">
          <span>Pagos anulados hoy (aparte)</span>
          <strong>{todayAnnulledPayments.length} {todayAnnulledPayments.length === 1 ? 'anulado' : 'anulados'}</strong>
          <small>{formatCOP(todayTotalAnnulled)} (No se suman al recaudo de caja)</small>
        </div>
      </div>

      <div className="section-divider" />

      {/* Bloque Inferior: Historial General de Pagos (HU-P07) */}
      <div className="module-panel-head">
        <div>
          <h2>Historial general de pagos</h2>
          <p className="detail-hint">
            Registro inalterable de mensualidades en efectivo (ningún pago se edita ni se elimina). Ordenado del más reciente al más antiguo.
          </p>
        </div>
      </div>

      <div className="module-toolbar">
        <div className="search-box wide">
          <Icon name="search" size={15} />
          <input
            value={historySearch}
            onChange={(e) => setHistorySearch(e.target.value)}
            placeholder="Buscar por recibo (REC-0001), documento, titular o placa..."
          />
        </div>
        <div className="filter-group">
          <span>Desde</span>
          <input
            type="date"
            value={historyDesde}
            max={historyHasta || undefined}
            onChange={(e) => setHistoryDesde(e.target.value)}
            style={{ height: '38px', padding: '0 10px', borderRadius: '10px', border: '1px solid #CBD5E1' }}
          />
          <span>Hasta</span>
          <input
            type="date"
            value={historyHasta}
            min={historyDesde || undefined}
            onChange={(e) => setHistoryHasta(e.target.value)}
            style={{ height: '38px', padding: '0 10px', borderRadius: '10px', border: '1px solid #CBD5E1' }}
          />
        </div>
        <div className="filter-group">
          <span>Estado</span>
          <div className="filter-pills">
            {(['Todos', 'Registrado', 'Anulado'] as const).map((st) => (
              <button
                key={st}
                type="button"
                className={`filter-pill ${historyStatusFilter === st ? 'active' : ''}`}
                onClick={() => setHistoryStatusFilter(st)}
              >
                {st}
              </button>
            ))}
          </div>
        </div>
      </div>

      {filteredHistoryPayments.length === 0 ? (
        <div className="module-empty compact">
          <p>No se encontraron pagos registrados con los filtros seleccionados.</p>
        </div>
      ) : (
        <div className="module-table-wrap">
          <table className="module-table">
            <thead>
              <tr>
                <th>RECIBO</th>
                <th>FECHA Y HORA</th>
                <th>TITULAR</th>
                <th>VEHÍCULO</th>
                <th>PERÍODO CUBIERTO</th>
                <th>FORMA PAGO</th>
                <th>TOTAL</th>
                <th>OPERARIO</th>
                <th>ESTADO</th>
                <th>ACCIONES</th>
              </tr>
            </thead>
            <tbody>
              {filteredHistoryPayments.map((p) => {
                const canAnnul = isLatestActivePaymentForPlate(p)
                return (
                  <tr key={p.id}>
                    <td><span className="doc-pill">{p.consecutivo}</span></td>
                    <td>{new Date(p.fechaHoraPago).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })}</td>
                    <td>
                      <strong>{p.nombreTitular}</strong>
                      <small style={{ display: 'block', color: '#64748B' }}>{p.documentoTipo} {p.documento}</small>
                    </td>
                    <td>
                      <span className="vehicle-badge">
                        <VehicleIcon tipo={p.tipoVehiculo} size={13} />
                        <strong>{p.placa}</strong>
                        <small>{p.tipoVehiculo}</small>
                      </span>
                    </td>
                    <td>
                      <strong>{formatDate(p.fechaInicio)} → {formatDate(p.fechaVencimiento)}</strong>
                      <small style={{ display: 'block', color: '#64748B' }}>{p.meses} {p.meses === 1 ? 'mes (30 días)' : `meses (${p.meses * 30} días)`}</small>
                    </td>
                    <td>
                      <strong>Efectivo</strong>
                    </td>
                    <td><strong>{formatCOP(p.totalPagado)}</strong></td>
                    <td>{p.operario}</td>
                    <td>
                      <StatusBadge status={p.estado} />
                      {p.estado === 'Anulado' && p.motivoAnulacion && (
                        <small style={{ display: 'block', color: '#991B1B', marginTop: '4px', maxWidth: '180px' }}>
                          Motivo: {p.motivoAnulacion}
                        </small>
                      )}
                    </td>
                    <td>
                      <div className="action-stack">
                        <button
                          type="button"
                          className="secondary-btn tiny"
                          onClick={() => setReceiptModal({ payment: p, isCopy: true })}
                        >
                          <Icon name="printer" size={13} /> Ver / Reimprimir
                        </button>
                        {isAdmin && p.estado === 'Registrado' && (
                          <button
                            type="button"
                            className="secondary-btn tiny danger"
                            disabled={!canAnnul}
                            title={
                              canAnnul
                                ? `Anular pago ${p.consecutivo} y revertir vigencia`
                                : 'Solo se puede anular el último pago no anulado de este vehículo (RN-P07)'
                            }
                            onClick={() => {
                              setAnnulModalPayment(p)
                              setAnnulReason('')
                              setAnnulError('')
                            }}
                          >
                            <Icon name="ban" size={13} /> Anular pago
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )

  // Lógica de Sub-vista 4: Cambio de tarifa (HU-P10) y Reporte de Recaudo (HU-P12)
  const handleSaveTariffChange = async (e: FormEvent) => {
    e.preventDefault()
    setTariffError('')
    setTariffSuccess('')
    if (!isAdmin) {
      setTariffError('Solo el Administrador puede modificar las tarifas de mensualidad.')
      return
    }
    const cleanValue = Number(tariffForm.nuevoValor.replace(/[^0-9]/g, ''))
    if (!Number.isInteger(cleanValue) || cleanValue <= 0) {
      setTariffError('El nuevo valor de la tarifa debe ser un número entero en COP mayor a 0.')
      return
    }
    if (!tariffForm.fechaInicio || tariffForm.fechaInicio < todayYMD) {
      setTariffError('La fecha de inicio de vigencia debe ser hoy o una fecha futura (nunca pasada).')
      return
    }
    if (!tariffForm.motivo.trim()) {
      setTariffError('El motivo del cambio de tarifa es obligatorio.')
      return
    }

    try {
      const updatedTariffs = await createModule3Tariff({
        tipo_vehiculo: tariffForm.tipo,
        valor_cop: cleanValue,
        fecha_inicio: tariffForm.fechaInicio,
        motivo: tariffForm.motivo.trim(),
      })
      setTariffs(updatedTariffs)
      setTariffForm((prev) => ({ ...prev, nuevoValor: '', motivo: '' }))
      setTariffSuccess(`Tarifa de ${tariffForm.tipo} actualizada a ${formatCOP(cleanValue)} con vigencia desde ${formatDate(tariffForm.fechaInicio)}.`)
      onNotify(`Tarifa de ${tariffForm.tipo} registrada: ${formatCOP(cleanValue)}`)
    } catch (err) {
      setTariffError(errorMessage(err))
    }
  }

  // Validación y datos del Reporte de Recaudo (HU-P12)
  const reportDateError = (() => {
    if (!reportDesde || !reportHasta) return 'Selecciona la fecha inicial y la fecha final del reporte.'
    if (reportHasta < reportDesde) return 'La fecha final no puede ser anterior a la fecha inicial.'
    if (reportHasta > todayYMD || reportDesde > todayYMD) return 'Las fechas del reporte no pueden ser futuras.'
    return ''
  })()

  // Registra la generación del reporte en auditoria_reporte del backend cuando el Administrador consulta el reporte
  useEffect(() => {
    if (subView !== 'tariffs' || !isAdmin || reportDateError) return
    getModule3Report({
      fecha_inicio: reportDesde,
      fecha_fin: reportHasta,
      tipo_vehiculo: reportTypeFilter,
      operario: reportOperatorFilter,
    }).catch(() => {})
  }, [subView, isAdmin, reportDateError, reportDesde, reportHasta, reportTypeFilter, reportOperatorFilter])

  const reportPayments = payments.filter((p) => {
    if (reportDateError) return false
    const day = isoToColombiaYMD(p.fechaHoraPago)
    if (day < reportDesde || day > reportHasta) return false
    if (reportTypeFilter !== 'Todos' && p.tipoVehiculo !== reportTypeFilter) return false
    if (reportOperatorFilter !== 'Todos' && p.operario !== reportOperatorFilter) return false
    return true
  })

  const reportValidPayments = reportPayments.filter((p) => p.estado === 'Registrado')
  const reportAnnulledPayments = reportPayments.filter((p) => p.estado === 'Anulado')
  const reportTotalCollected = reportValidPayments.reduce((acc, p) => acc + p.totalPagado, 0)
  const reportTotalAnnulled = reportAnnulledPayments.reduce((acc, p) => acc + p.totalPagado, 0)

  const summaryByDay = (() => {
    const map = new Map<string, { count: number; total: number }>()
    for (const p of reportValidPayments) {
      const day = isoToColombiaYMD(p.fechaHoraPago)
      const prev = map.get(day) ?? { count: 0, total: 0 }
      map.set(day, { count: prev.count + 1, total: prev.total + p.totalPagado })
    }
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]))
  })()

  const summaryByType = (['Carro', 'Moto'] as const).map((tipo) => {
    const items = reportValidPayments.filter((p) => p.tipoVehiculo === tipo)
    return { tipo, count: items.length, total: items.reduce((acc, p) => acc + p.totalPagado, 0) }
  })

  const summaryByMethod = [
    {
      forma: 'Efectivo' as const,
      count: reportValidPayments.length,
      total: reportTotalCollected,
    },
  ]

  const summaryByOperator = (() => {
    const map = new Map<string, { count: number; total: number }>()
    for (const p of reportValidPayments) {
      const prev = map.get(p.operario) ?? { count: 0, total: 0 }
      map.set(p.operario, { count: prev.count + 1, total: prev.total + p.totalPagado })
    }
    return Array.from(map.entries()).sort((a, b) => b[1].total - a[1].total)
  })()

  const handleExportCSV = () => {
    if (reportDateError) return
    const lines: string[] = [
      'REPORTE DE RECAUDO - PARQUEADERO AUTOS COLOMBIA (MEDELLIN)',
      `Periodo;${reportDesde};a;${reportHasta}`,
      `Total recaudado en Efectivo (COP);${reportTotalCollected};Pagos validos;${reportValidPayments.length};Pagos anulados (aparte);${reportAnnulledPayments.length}`,
      '',
      'RESUMEN POR TIPO DE VEHICULO',
      'Tipo;Cantidad de pagos;Total recaudado (COP)',
      ...summaryByType.map((r) => `${r.tipo};${r.count};${r.total}`),
      '',
      'RESUMEN POR FORMA DE PAGO',
      'Forma de pago;Cantidad de pagos;Total recaudado (COP)',
      ...summaryByMethod.map((r) => `${r.forma};${r.count};${r.total}`),
      '',
      'RESUMEN POR OPERARIO',
      'Operario;Cantidad de pagos;Total recaudado (COP)',
      ...summaryByOperator.map(([op, r]) => `${op};${r.count};${r.total}`),
      '',
      'DETALLE DE PAGOS DEL PERIODO',
      'Consecutivo;Fecha y Hora;Documento;Titular;Placa;Tipo;Meses;Inicio Vigencia;Fin Vigencia;Forma de Pago;Total (COP);Operario;Estado;Motivo Anulacion',
      ...reportPayments.map((p) =>
        [
          p.consecutivo,
          new Date(p.fechaHoraPago).toLocaleString('es-CO'),
          `${p.documentoTipo} ${p.documento}`,
          p.nombreTitular,
          p.placa,
          p.tipoVehiculo,
          p.meses,
          p.fechaInicio,
          p.fechaVencimiento,
          'Efectivo',
          p.totalPagado,
          p.operario,
          p.estado,
          p.motivoAnulacion ?? '',
        ].join(';'),
      ),
    ]
    const csvContent = '\uFEFF' + lines.join('\r\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `recaudo_parqueate_${reportDesde}_a_${reportHasta}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
    onNotify('Archivo Excel (.csv) exportado correctamente')
  }

  // Render Sub-vista 4: Tarifas y Recaudo
  const renderTariffsAndReportsView = () => (
    <div className="module-panel">
      {/* Bloque 1: Gestión de Tarifas (HU-P10) */}
      <div className="module-panel-head">
        <div>
          <h2>Tarifas vigentes de mensualidad</h2>
          <p className="detail-hint">
            Valores aplicados por cada período de 30 días calendario. Los cambios de tarifa nunca alteran pagos anteriores (RN-P09).
          </p>
        </div>
      </div>

      <div className="module-summary-grid">
        <div className="module-summary-card">
          <div className="module-summary-icon green" />
          <div className="module-summary-copy">
            <strong className="type-line"><VehicleIcon tipo="Carro" size={16} /> Tarifa Mensual Carro: {formatCOP(effectiveCarTariff)}</strong>
            <small>2 meses: {formatCOP(effectiveCarTariff * 2)} · 3 meses: {formatCOP(effectiveCarTariff * 3)}</small>
          </div>
        </div>
        <div className="module-summary-card">
          <div className="module-summary-icon amber" />
          <div className="module-summary-copy">
            <strong className="type-line"><VehicleIcon tipo="Moto" size={16} /> Tarifa Mensual Moto: {formatCOP(effectiveMotoTariff)}</strong>
            <small>2 meses: {formatCOP(effectiveMotoTariff * 2)} · 3 meses: {formatCOP(effectiveMotoTariff * 3)}</small>
          </div>
        </div>
      </div>

      {!isAdmin ? (
        <div className="permission-note">
          Modo solo lectura: Solo el perfil de Administrador puede actualizar las tarifas de mensualidad o consultar el reporte consolidado de recaudo.
        </div>
      ) : (
        <form className="payment-column-card" onSubmit={handleSaveTariffChange}>
          <h3>Actualizar tarifa mensual (Solo Administrador)</h3>
          {tariffError && <div className="notice notice-red"><Icon name="alert" size={16} /><span>{tariffError}</span></div>}
          {tariffSuccess && <div className="notice notice-green"><Icon name="check" size={16} /><span>{tariffSuccess}</span></div>}
          <div className="form-grid">
            <div className="field">
              <label>Tipo de vehículo</label>
              <select
                value={tariffForm.tipo}
                onChange={(e) => setTariffForm((prev) => ({ ...prev, tipo: e.target.value as VehicleType }))}
              >
                <option value="Carro">Carro (actual: {formatCOP(effectiveCarTariff)})</option>
                <option value="Moto">Moto (actual: {formatCOP(effectiveMotoTariff)})</option>
              </select>
            </div>
            <div className="field">
              <label>Nuevo valor mensual en COP (entero &gt; 0)</label>
              <input
                type="text"
                inputMode="numeric"
                value={tariffForm.nuevoValor ? Number(tariffForm.nuevoValor.replace(/[^0-9]/g, '')).toLocaleString('es-CO') : ''}
                onChange={(e) => setTariffForm((prev) => ({ ...prev, nuevoValor: e.target.value.replace(/[^0-9]/g, '') }))}
                placeholder="Ej. 130.000"
              />
            </div>
            <div className="field">
              <label>Fecha de inicio de vigencia (hoy o futura)</label>
              <input
                type="date"
                value={tariffForm.fechaInicio}
                min={todayYMD}
                onChange={(e) => setTariffForm((prev) => ({ ...prev, fechaInicio: e.target.value }))}
              />
            </div>
            <div className="field">
              <label>Motivo obligatorio del cambio</label>
              <input
                value={tariffForm.motivo}
                onChange={(e) => setTariffForm((prev) => ({ ...prev, motivo: e.target.value }))}
                placeholder="Ej. Ajuste anual de tarifa aprobado por gerencia"
              />
            </div>
          </div>
          <div>
            <button type="submit" className="primary-btn">Guardar nueva tarifa</button>
          </div>
        </form>
      )}

      <div className="history-list">
        <h4>Historial de cambios de tarifa</h4>
        <div className="history-scroll">
          {tariffs.historial.map((h) => (
            <div key={h.id} className="history-item">
              <div>
                <strong className="type-line">
                  <VehicleIcon tipo={h.tipo} size={14} /> {h.tipo}: {formatCOP(h.valorAnterior)} → {formatCOP(h.valorNuevo)}
                </strong>
                <small>Vigencia desde: {formatDate(h.fechaInicioVigencia)} · Registrado: {new Date(h.fechaRegistro).toLocaleString('es-CO')}</small>
              </div>
              <div className="history-meta">
                <span>Responsable: {h.usuarioResponsable}</span>
                <p>{h.motivo}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {isAdmin && (
        <>
          <div className="section-divider" />

          {/* Bloque 2: Reporte de Recaudo (HU-P12 — Solo Administrador) */}
          <div className="module-panel-head">
            <div>
              <h2>Reporte de recaudo por período</h2>
              <p className="detail-hint">
                Análisis financiero detallado por día, tipo de vehículo, medio de pago y operario.
              </p>
            </div>
            <div className="detail-actions">
              <button
                type="button"
                className="secondary-btn"
                disabled={!!reportDateError}
                onClick={handleExportCSV}
              >
                <Icon name="download" size={15} /> Exportar Excel (.csv)
              </button>
              <button
                type="button"
                className="primary-btn"
                disabled={!!reportDateError}
                onClick={() => window.print()}
              >
                <Icon name="printer" size={15} /> Exportar PDF / Imprimir
              </button>
            </div>
          </div>

          <div className="module-toolbar">
            <div className="filter-group">
              <span>Fecha inicial</span>
              <input
                type="date"
                value={reportDesde}
                max={todayYMD}
                onChange={(e) => setReportDesde(e.target.value)}
                style={{ height: '38px', padding: '0 10px', borderRadius: '10px', border: '1px solid #CBD5E1' }}
              />
              <span>Fecha final</span>
              <input
                type="date"
                value={reportHasta}
                min={reportDesde || undefined}
                max={todayYMD}
                onChange={(e) => setReportHasta(e.target.value)}
                style={{ height: '38px', padding: '0 10px', borderRadius: '10px', border: '1px solid #CBD5E1' }}
              />
            </div>
            <div className="filter-group">
              <span>Tipo</span>
              <select
                value={reportTypeFilter}
                onChange={(e) => setReportTypeFilter(e.target.value as 'Todos' | VehicleType)}
                style={{ height: '38px', borderRadius: '10px', padding: '0 12px', border: '1px solid #CBD5E1' }}
              >
                <option value="Todos">Todos</option>
                <option value="Carro">Carro</option>
                <option value="Moto">Moto</option>
              </select>
              <span>Operario</span>
              <select
                value={reportOperatorFilter}
                onChange={(e) => setReportOperatorFilter(e.target.value)}
                style={{ height: '38px', borderRadius: '10px', padding: '0 12px', border: '1px solid #CBD5E1' }}
              >
                <option value="Todos">Todos</option>
                {allOperators.map((op) => (
                  <option key={op} value={op}>{op}</option>
                ))}
              </select>
            </div>
          </div>

          {reportDateError ? (
            <div className="notice notice-red">
              <Icon name="alert" size={16} />
              <span>{reportDateError}</span>
            </div>
          ) : (
            <>
              <div className="kpi-grid-4">
                <div className="kpi-card highlight">
                  <span>Total recaudado en el período</span>
                  <strong>{formatCOP(reportTotalCollected)}</strong>
                  <small>Del {formatDate(reportDesde)} al {formatDate(reportHasta)}</small>
                </div>
                <div className="kpi-card">
                  <span>Cantidad de pagos válidos</span>
                  <strong>{reportValidPayments.length}</strong>
                  <small>Comprobantes en estado Registrado</small>
                </div>
                <div className="kpi-card">
                  <span>Promedio por transacción</span>
                  <strong>{formatCOP(reportValidPayments.length ? reportTotalCollected / reportValidPayments.length : 0)}</strong>
                  <small>Ticket promedio del período</small>
                </div>
                <div className="kpi-card muted-danger">
                  <span>Pagos anulados (aparte)</span>
                  <strong>{reportAnnulledPayments.length} anulados</strong>
                  <small>{formatCOP(reportTotalAnnulled)} excluidos del recaudo</small>
                </div>
              </div>

              <div className="reports-summary-grid">
                <div className="report-mini-card">
                  <h4>Resumen por día</h4>
                  <table className="module-table">
                    <thead><tr><th>FECHA</th><th>PAGOS</th><th>TOTAL RECAUDADO</th></tr></thead>
                    <tbody>
                      {summaryByDay.length === 0 ? (
                        <tr><td colSpan={3} className="table-message">Sin pagos en este rango</td></tr>
                      ) : (
                        summaryByDay.map(([day, info]) => (
                          <tr key={day}>
                            <td><strong>{formatDate(day)}</strong></td>
                            <td>{info.count}</td>
                            <td><strong>{formatCOP(info.total)}</strong></td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="report-mini-card">
                  <h4>Resumen por tipo de vehículo</h4>
                  <table className="module-table">
                    <thead><tr><th>TIPO</th><th>PAGOS</th><th>TOTAL RECAUDADO</th></tr></thead>
                    <tbody>
                      {summaryByType.map((row) => (
                        <tr key={row.tipo}>
                          <td><span className="type-line"><VehicleIcon tipo={row.tipo} size={14} /><strong>{row.tipo}</strong></span></td>
                          <td>{row.count}</td>
                          <td><strong>{formatCOP(row.total)}</strong></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="report-mini-card">
                  <h4>Resumen por forma de pago</h4>
                  <table className="module-table">
                    <thead><tr><th>FORMA DE PAGO</th><th>PAGOS</th><th>TOTAL RECAUDADO</th></tr></thead>
                    <tbody>
                      {summaryByMethod.map((row) => (
                        <tr key={row.forma}>
                          <td><strong>{row.forma}</strong></td>
                          <td>{row.count}</td>
                          <td><strong>{formatCOP(row.total)}</strong></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="report-mini-card">
                  <h4>Resumen por operario</h4>
                  <table className="module-table">
                    <thead><tr><th>OPERARIO</th><th>PAGOS</th><th>TOTAL RECAUDADO</th></tr></thead>
                    <tbody>
                      {summaryByOperator.length === 0 ? (
                        <tr><td colSpan={3} className="table-message">Sin registros</td></tr>
                      ) : (
                        summaryByOperator.map(([op, info]) => (
                          <tr key={op}>
                            <td><strong>{op}</strong></td>
                            <td>{info.count}</td>
                            <td><strong>{formatCOP(info.total)}</strong></td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )

  return (
    <section className="module-shell module-payments">
      <div className="module-subnav" role="tablist" aria-label="Sub-vistas del módulo de pagos">
        <button
          type="button"
          className={subView === 'charge' ? 'active' : ''}
          onClick={() => setSubView('charge')}
        >
          <Icon name="card" size={16} />Cobrar Mensualidad
        </button>
        <button
          type="button"
          className={subView === 'expiring' ? 'active' : ''}
          onClick={() => setSubView('expiring')}
        >
          <Icon name="alert" size={16} />Por Vencer y Vencidas {expiringCount > 0 && <span className="badge-warn">{expiringCount}</span>}
        </button>
        <button
          type="button"
          className={subView === 'history' ? 'active' : ''}
          onClick={() => setSubView('history')}
        >
          <Icon name="receipt" size={16} />Historial y Caja del Día
        </button>
        <button
          type="button"
          className={subView === 'tariffs' ? 'active' : ''}
          onClick={() => setSubView('tariffs')}
        >
          <Icon name="dollar" size={16} />Tarifas y Recaudo
        </button>
      </div>

      <div className="module-card">
        {subView === 'charge'
          ? renderChargeView()
          : subView === 'expiring'
            ? renderExpiringView()
            : subView === 'history'
              ? renderHistoryAndCashboxView()
              : renderTariffsAndReportsView()}
      </div>

      {/* Modal 1: Comprobante de Pago (HU-P04) */}
      {receiptModal && (
        <div className="modal-backdrop printable-modal-backdrop" onMouseDown={() => setReceiptModal(null)}>
          <div className="modal-card" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modal-head no-print">
              <div>
                <h2>Comprobante de pago {receiptModal.payment.consecutivo}</h2>
                <p>Recibo oficial de mensualidad · Parqueadero Autos Colombia</p>
              </div>
              <button className="icon-btn" onClick={() => setReceiptModal(null)} aria-label="Cerrar"><Icon name="x" /></button>
            </div>
            <div className="modal-body">
              <div className="receipt-card">
                <div className="receipt-header">
                  <strong>PARQUEADERO AUTOS COLOMBIA — MEDELLÍN</strong>
                  <span>Servicio de Estacionamiento por Mensualidad · Zona Horaria Colombia</span>
                  <span>Fecha y hora de emisión: {new Date(receiptModal.payment.fechaHoraPago).toLocaleString('es-CO')}</span>
                  <div className="receipt-consecutivo">{receiptModal.payment.consecutivo}</div>
                </div>

                {receiptModal.payment.estado === 'Anulado' ? (
                  <div className="receipt-banner anulado">
                    ANULADO · Motivo: {receiptModal.payment.motivoAnulacion} ({receiptModal.payment.usuarioAnulacion})
                  </div>
                ) : receiptModal.isCopy ? (
                  <div className="receipt-banner copia">COPIA — REIMPRESIÓN DE COMPROBANTE</div>
                ) : (
                  <div className="receipt-banner original">COMPROBANTE ORIGINAL DE PAGO</div>
                )}

                <div className="receipt-rows">
                  <div className="receipt-row">
                    <span>Titular</span>
                    <strong>{receiptModal.payment.nombreTitular}</strong>
                  </div>
                  <div className="receipt-row">
                    <span>Documento</span>
                    <strong>{receiptModal.payment.documentoTipo} {receiptModal.payment.documento}</strong>
                  </div>
                  <div className="receipt-row">
                    <span>Vehículo</span>
                    <strong>
                      {receiptModal.payment.placa} · {receiptModal.payment.tipoVehiculo} ({receiptModal.payment.marcaVehiculo} {receiptModal.payment.colorVehiculo})
                    </strong>
                  </div>
                  <div className="receipt-row">
                    <span>Meses pagados</span>
                    <strong>
                      {receiptModal.payment.meses} {receiptModal.payment.meses === 1 ? 'mes (30 días calendario)' : `meses (${receiptModal.payment.meses * 30} días calendario)`}
                    </strong>
                  </div>
                  <div className="receipt-row">
                    <span>Período cubierto</span>
                    <strong>
                      {formatDate(receiptModal.payment.fechaInicio)} al {formatDate(receiptModal.payment.fechaVencimiento)} (23:59)
                    </strong>
                  </div>
                  <div className="receipt-row">
                    <span>Tarifa mensual aplicada</span>
                    <strong>{formatCOP(receiptModal.payment.tarifaMensualAplicada)}</strong>
                  </div>
                  <div className="receipt-row">
                    <span>Forma de pago</span>
                    <strong>Efectivo</strong>
                  </div>
                  <div className="receipt-row">
                    <span>Valor recibido en efectivo</span>
                    <strong>{formatCOP(receiptModal.payment.valorRecibidoEfectivo ?? receiptModal.payment.totalPagado)}</strong>
                  </div>
                  <div className="receipt-row">
                    <span>Cambio devuelto</span>
                    <strong>{formatCOP(receiptModal.payment.cambioDevueltoEfectivo ?? 0)}</strong>
                  </div>
                  <div className="receipt-row">
                    <span>Operario que registró</span>
                    <strong>{receiptModal.payment.operario}</strong>
                  </div>
                </div>

                <div className="receipt-total-row">
                  <span>Total pagado</span>
                  <strong>{formatCOP(receiptModal.payment.totalPagado)}</strong>
                </div>

                <div className="receipt-footer">
                  Conserve este comprobante. Su mensualidad garantiza su cupo activo hasta el {formatDate(receiptModal.payment.fechaVencimiento)} a las 23:59.
                </div>
              </div>
            </div>
            <div className="modal-actions no-print">
              <button type="button" className="secondary-btn" onClick={() => setReceiptModal(null)}>Cerrar</button>
              <button type="button" className="primary-btn" onClick={() => window.print()}>
                <Icon name="printer" size={15} /> Imprimir comprobante
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 2: Anular Pago (HU-P09 — Solo Administrador y solo último pago vigente) */}
      {annulModalPayment && (
        <div className="modal-backdrop" onMouseDown={() => setAnnulModalPayment(null)}>
          <div className="modal-card" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <h2>Anular pago {annulModalPayment.consecutivo}</h2>
                <p>Vehículo {annulModalPayment.placa} · Titular: {annulModalPayment.nombreTitular}</p>
              </div>
              <button className="icon-btn" onClick={() => setAnnulModalPayment(null)} aria-label="Cerrar"><Icon name="x" /></button>
            </div>
            <div className="modal-body">
              <div className="notice notice-red">
                <Icon name="alert" size={18} />
                <span>
                  Esta acción marcará el recibo <strong>{annulModalPayment.consecutivo}</strong> por <strong>{formatCOP(annulModalPayment.totalPagado)}</strong> como <strong>Anulado</strong> y revertirá automáticamente la vigencia del vehículo{' '}
                  {annulModalPayment.fechaVencimientoAnterior
                    ? `a su fecha anterior (${formatDate(annulModalPayment.fechaVencimientoAnterior)})`
                    : 'a estado "Sin mensualidad"'}.
                </span>
              </div>
              <div className="field">
                <label>Motivo obligatorio de anulación</label>
                <textarea
                  rows={3}
                  value={annulReason}
                  onChange={(e) => {
                    setAnnulReason(e.target.value)
                    setAnnulError('')
                  }}
                  placeholder="Ej. Error en número de meses seleccionados al cobrar..."
                  autoFocus
                />
              </div>
              {annulError && (
                <div className="notice notice-red">
                  <Icon name="alert" size={16} />
                  <span>{annulError}</span>
                </div>
              )}
            </div>
            <div className="modal-actions">
              <button type="button" className="secondary-btn" onClick={() => setAnnulModalPayment(null)}>Cancelar</button>
              <button type="button" className="secondary-btn danger" onClick={handleConfirmAnnulPayment}>
                <Icon name="ban" size={15} /> Confirmar anulación
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 3: Impresión de Cierre de Caja del Día (HU-P11) */}
      {cashboxPrintOpen && (
        <div className="modal-backdrop printable-modal-backdrop" onMouseDown={() => setCashboxPrintOpen(false)}>
          <div className="modal-card" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modal-head no-print">
              <div>
                <h2>Cierre de caja del día</h2>
                <p>Resumen listo para impresión · {formatDate(todayYMD)}</p>
              </div>
              <button className="icon-btn" onClick={() => setCashboxPrintOpen(false)} aria-label="Cerrar"><Icon name="x" /></button>
            </div>
            <div className="modal-body">
              <div className="receipt-card">
                <div className="receipt-header">
                  <strong>PARQUEADERO AUTOS COLOMBIA — MEDELLÍN</strong>
                  <span>CIERRE DE CAJA DIARIO · {formatDate(todayYMD)}</span>
                  <span>Filtro de operario: {effectiveCashboxOperator}</span>
                </div>
                <div className="receipt-rows">
                  <div className="receipt-row">
                    <span>Pagos válidos registrados hoy</span>
                    <strong>{todayValidPayments.length}</strong>
                  </div>
                  <div className="receipt-row">
                    <span>Efectivo ({todayValidPayments.length})</span>
                    <strong>{formatCOP(todayTotalCollected)}</strong>
                  </div>
                  <div className="receipt-row">
                    <span>Recaudo Carros ({todayByType('Carro').count})</span>
                    <strong>{formatCOP(todayByType('Carro').total)}</strong>
                  </div>
                  <div className="receipt-row">
                    <span>Recaudo Motos ({todayByType('Moto').count})</span>
                    <strong>{formatCOP(todayByType('Moto').total)}</strong>
                  </div>
                  <div className="receipt-row">
                    <span>Pagos anulados hoy (excluidos)</span>
                    <strong>{todayAnnulledPayments.length} ({formatCOP(todayTotalAnnulled)})</strong>
                  </div>
                </div>
                <div className="receipt-total-row">
                  <span>Total neto recaudado hoy</span>
                  <strong>{formatCOP(todayTotalCollected)}</strong>
                </div>
                <div className="receipt-footer">
                  Generado por {currentOperatorName} el {new Date().toLocaleString('es-CO')}
                </div>
              </div>
            </div>
            <div className="modal-actions no-print">
              <button type="button" className="secondary-btn" onClick={() => setCashboxPrintOpen(false)}>Cerrar</button>
              <button type="button" className="primary-btn" onClick={() => window.print()}>
                <Icon name="printer" size={15} /> Imprimir cierre
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
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
  return <Modal title={`Anular ${ticketCode(ticket.id_tiquete)}`} subtitle="Esta acción no elimina el movimiento y quedará en la trazabilidad." onClose={onClose}><div className="modal-body"><div className="notice notice-red"><Icon name="alert" size={18} /><span>La anulación requiere una justificación obligatoria.{ticket.estado === 'Activo' ? ` La celda ${ticket.numero_espacio} quedará libre.` : ''}</span></div><Field label="Justificación"><textarea value={reason} onChange={e => setReason(e.target.value)} rows={4} maxLength={255} placeholder="Explica el motivo de la anulación..." autoFocus /></Field>{error && <div className="notice notice-red"><Icon name="alert" size={16} /><span>{error}</span></div>}</div><div className="modal-actions"><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button variant="danger" onClick={confirm} disabled={sending || reason.trim().length < 8}>{sending ? 'Anulando…' : 'Anular registro'}</Button></div></Modal>
}

// ==============================================================================
// MÓDULO INDEPENDIENTE: PERSONAL DEL SISTEMA (HU-P14 / RF-A02 — SOLO ADMINISTRADOR)
// ==============================================================================

function PersonalModule({
  currentUser,
  onNotify,
}: {
  currentUser: User
  onNotify: (msg: string) => void
}) {
  const [accounts, setAccounts] = useState<StaffAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<'Todos' | StaffRole>('Todos')
  const [statusFilter, setStatusFilter] = useState<'Todos' | 'Activos' | 'Inactivos'>('Todos')
  const [openMenuId, setOpenMenuId] = useState<number | null>(null)

  // Modal de Crear / Editar cuenta
  const [formOpen, setFormOpen] = useState(false)
  const [editingAccount, setEditingAccount] = useState<StaffAccount | null>(null)
  const [formNombre, setFormNombre] = useState('')
  const [formCorreo, setFormCorreo] = useState('')
  const [formRol, setFormRol] = useState<StaffRole>('Operario')
  const [formContrasena, setFormContrasena] = useState('')
  const [formError, setFormError] = useState('')
  const [formSending, setFormSending] = useState(false)

  // Modal de Activar / Inactivar cuenta con motivo obligatorio
  const [statusTarget, setStatusTarget] = useState<StaffAccount | null>(null)
  const [statusMotivo, setStatusMotivo] = useState('')
  const [statusError, setStatusError] = useState('')
  const [statusSending, setStatusSending] = useState(false)

  const loadAccounts = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const list = await getStaffAccounts()
      setAccounts(list)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadAccounts()
  }, [loadAccounts])

  useEffect(() => {
    const close = () => setOpenMenuId(null)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [])

  const activeAdminsCount = accounts.filter(
    (a) => a.rol === 'Administrador' && a.estado === 'Activo',
  ).length

  const filteredAccounts = accounts.filter((acc) => {
    if (roleFilter !== 'Todos' && acc.rol !== roleFilter) return false
    if (statusFilter === 'Activos' && acc.estado !== 'Activo') return false
    if (statusFilter === 'Inactivos' && acc.estado !== 'Inactivo') return false
    const q = search.trim().toLowerCase()
    if (!q) return true
    return (
      acc.nombre.toLowerCase().includes(q) ||
      acc.correo.toLowerCase().includes(q) ||
      acc.rol.toLowerCase().includes(q)
    )
  })

  const openCreateModal = () => {
    setEditingAccount(null)
    setFormNombre('')
    setFormCorreo('')
    setFormRol('Operario')
    setFormContrasena('')
    setFormError('')
    setFormOpen(true)
  }

  const openEditModal = (acc: StaffAccount) => {
    setEditingAccount(acc)
    setFormNombre(acc.nombre)
    setFormCorreo(acc.correo)
    setFormRol(acc.rol)
    setFormContrasena('')
    setFormError('')
    setFormOpen(true)
    setOpenMenuId(null)
  }

  const openStatusModal = (acc: StaffAccount) => {
    setStatusTarget(acc)
    setStatusMotivo('')
    setStatusError('')
    setOpenMenuId(null)
  }

  const handleSaveForm = async (e: FormEvent) => {
    e.preventDefault()
    const nombreLimpio = formNombre.trim()
    const correoLimpio = formCorreo.trim().toLowerCase()
    if (nombreLimpio.length < 3) {
      setFormError('El nombre completo debe tener al menos 3 caracteres.')
      return
    }
    if (!correoLimpio.includes('@') || !correoLimpio.includes('.')) {
      setFormError('Ingresa un correo electrónico válido.')
      return
    }
    if (!editingAccount && formContrasena.trim().length < 6) {
      setFormError('La contraseña debe tener al menos 6 caracteres.')
      return
    }
    if (editingAccount && formContrasena.trim().length > 0 && formContrasena.trim().length < 6) {
      setFormError('La nueva contraseña debe tener al menos 6 caracteres.')
      return
    }

    setFormSending(true)
    setFormError('')
    try {
      if (editingAccount) {
        const updated = await updateStaffAccount(editingAccount.id, {
          nombre: nombreLimpio,
          correo: correoLimpio,
          rol: formRol,
          contrasena: formContrasena.trim() ? formContrasena.trim() : null,
        })
        setAccounts((prev) => prev.map((a) => (a.id === updated.id ? updated : a)))
        onNotify(`Cuenta actualizada · ${updated.nombre}`)
      } else {
        const created = await createStaffAccount({
          nombre: nombreLimpio,
          correo: correoLimpio,
          rol: formRol,
          contrasena: formContrasena.trim(),
        })
        setAccounts((prev) => [...prev, created])
        onNotify(`Cuenta creada · ${created.nombre} (${created.rol})`)
      }
      setFormOpen(false)
    } catch (err) {
      setFormError(errorMessage(err))
    } finally {
      setFormSending(false)
    }
  }

  const handleConfirmStatus = async () => {
    if (!statusTarget) return
    const motivoLimpio = statusMotivo.trim()
    if (motivoLimpio.length < 5) {
      setStatusError('El motivo es obligatorio (mínimo 5 caracteres).')
      return
    }
    const nuevoEstado: StaffStatus = statusTarget.estado === 'Activo' ? 'Inactivo' : 'Activo'
    setStatusSending(true)
    setStatusError('')
    try {
      const updated = await toggleStaffAccountStatus(statusTarget.id, {
        estado: nuevoEstado,
        motivo: motivoLimpio,
      })
      setAccounts((prev) => prev.map((a) => (a.id === updated.id ? updated : a)))
      onNotify(
        `Cuenta ${nuevoEstado === 'Activo' ? 'activada' : 'inactivada'} · ${updated.nombre}`,
      )
      setStatusTarget(null)
    } catch (err) {
      setStatusError(errorMessage(err))
    } finally {
      setStatusSending(false)
    }
  }

  return (
    <section className="module-shell" aria-label="Gestión de cuentas del personal">
      <div className="module-card">
        <div className="module-panel">
          <div className="module-panel-head">
            <div>
              <h2>Cuentas del personal</h2>
              <p style={{ color: '#64748B', fontSize: 13, marginTop: 4 }}>
                Gestiona los accesos de administradores y operarios (independientes de los clientes del parqueadero).
              </p>
            </div>
            <Button variant="primary" icon="plus" onClick={openCreateModal}>
              + Nueva cuenta
            </Button>
          </div>

          <div className="personal-filters-bar">
            <div className="search-box wide" style={{ maxWidth: 420 }}>
              <Icon name="search" size={16} />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nombre o correo electrónico..."
                aria-label="Buscar cuenta del personal"
              />
            </div>

            <div className="personal-filter-group" role="group" aria-label="Filtrar por rol">
              <span className="personal-filter-label">Rol:</span>
              {(['Todos', 'Administrador', 'Operario'] as const).map((rolOption) => (
                <button
                  key={rolOption}
                  type="button"
                  className={`filter-pill ${roleFilter === rolOption ? 'active' : ''}`}
                  onClick={() => setRoleFilter(rolOption)}
                >
                  {rolOption}
                </button>
              ))}
            </div>

            <div className="personal-filter-group" role="group" aria-label="Filtrar por estado">
              <span className="personal-filter-label">Estado:</span>
              {(['Todos', 'Activos', 'Inactivos'] as const).map((stOption) => (
                <button
                  key={stOption}
                  type="button"
                  className={`filter-pill ${statusFilter === stOption ? 'active' : ''}`}
                  onClick={() => setStatusFilter(stOption)}
                >
                  {stOption}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="notice notice-red">
              <Icon name="alert" size={16} />
              <span>{error}</span>
            </div>
          )}

          <div className="module-table-wrap">
            <table className="module-table">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Correo</th>
                  <th>Rol</th>
                  <th>Estado</th>
                  <th>Fecha creación</th>
                  <th style={{ textAlign: 'right' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {loading && accounts.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="table-message">
                      Cargando cuentas del personal…
                    </td>
                  </tr>
                ) : filteredAccounts.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="table-message">
                      No se encontraron cuentas del personal con los filtros seleccionados.
                    </td>
                  </tr>
                ) : (
                  filteredAccounts.map((acc) => {
                    const isLastActiveAdmin =
                      acc.rol === 'Administrador' &&
                      acc.estado === 'Activo' &&
                      activeAdminsCount <= 1
                    const isMenuOpen = openMenuId === acc.id

                    return (
                      <tr key={acc.id}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div className="avatar">{initials(acc.nombre)}</div>
                            <div>
                              <strong style={{ fontSize: 13.5, color: '#0F172A' }}>
                                {acc.nombre}
                              </strong>
                              {acc.correo.toLowerCase() === currentUser.correo.toLowerCase() && (
                                <span
                                  style={{
                                    display: 'inline-block',
                                    marginLeft: 6,
                                    fontSize: 10,
                                    fontWeight: 700,
                                    color: '#047857',
                                    background: '#ECFDF5',
                                    padding: '2px 7px',
                                    borderRadius: 999,
                                  }}
                                >
                                  Sesión actual
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td style={{ fontFamily: 'monospace', fontSize: 12.5, color: '#334155' }}>
                          {acc.correo}
                        </td>
                        <td>
                          <span
                            className={`role-pill-badge ${
                              acc.rol === 'Administrador' ? 'admin' : 'operator'
                            }`}
                          >
                            <Icon
                              name={acc.rol === 'Administrador' ? 'shield' : 'users'}
                              size={13}
                            />
                            {acc.rol}
                          </span>
                        </td>
                        <td>
                          <Badge tone={acc.estado === 'Activo' ? 'green' : 'red'}>
                            {acc.estado}
                          </Badge>
                          {acc.estado === 'Inactivo' && acc.motivo_inactivacion && (
                            <small
                              style={{
                                display: 'block',
                                marginTop: 4,
                                fontSize: 11,
                                color: '#991B1B',
                              }}
                            >
                              Motivo: {acc.motivo_inactivacion}
                            </small>
                          )}
                        </td>
                        <td style={{ fontSize: 12.5, color: '#475569' }}>
                          {formatDateTime(acc.fecha_creacion)}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div
                            className="actions-dropdown-wrap"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              className={`actions-dropdown-trigger ${isMenuOpen ? 'open' : ''}`}
                              onClick={() => setOpenMenuId(isMenuOpen ? null : acc.id)}
                            >
                              Acciones ▾
                            </button>
                            {isMenuOpen && (
                              <div className="actions-dropdown-menu" role="menu">
                                <button
                                  type="button"
                                  className="actions-dropdown-item"
                                  onClick={() => openEditModal(acc)}
                                >
                                  <Icon name="edit" size={14} />
                                  Editar datos
                                </button>
                                <div className="actions-dropdown-divider" />
                                <button
                                  type="button"
                                  className={`actions-dropdown-item ${
                                    acc.estado === 'Activo' ? 'danger' : ''
                                  }`}
                                  onClick={() => openStatusModal(acc)}
                                  disabled={isLastActiveAdmin}
                                  title={
                                    isLastActiveAdmin
                                      ? 'No se puede inactivar al último Administrador activo del sistema.'
                                      : undefined
                                  }
                                >
                                  <Icon
                                    name={acc.estado === 'Activo' ? 'ban' : 'checkCircle'}
                                    size={14}
                                  />
                                  {acc.estado === 'Activo' ? 'Inactivar cuenta' : 'Activar cuenta'}
                                </button>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {formOpen && (
        <Modal
          title={editingAccount ? `Editar cuenta · ${editingAccount.nombre}` : 'Nueva cuenta de personal'}
          subtitle={
            editingAccount
              ? 'Actualiza los datos de acceso o asigna una nueva contraseña.'
              : 'Registra un nuevo administrador u operario con acceso al sistema PARQUEATE.'
          }
          onClose={() => setFormOpen(false)}
        >
          <form onSubmit={handleSaveForm}>
            <div className="modal-body">
              <Field label="Nombre completo">
                <input
                  type="text"
                  value={formNombre}
                  onChange={(e) => setFormNombre(e.target.value)}
                  placeholder="Ej. Carlos Andrés Gómez"
                  required
                  autoFocus
                />
              </Field>
              <Field label="Correo electrónico">
                <input
                  type="email"
                  value={formCorreo}
                  onChange={(e) => setFormCorreo(e.target.value)}
                  placeholder="usuario@parqueate.co"
                  required
                />
              </Field>
              <Field label="Rol en el sistema">
                <select
                  value={formRol}
                  onChange={(e) => setFormRol(e.target.value as StaffRole)}
                >
                  <option value="Operario">Operario</option>
                  <option value="Administrador">Administrador</option>
                </select>
              </Field>
              <Field
                label={editingAccount ? 'Nueva contraseña (opcional)' : 'Contraseña'}
                hint={
                  editingAccount
                    ? 'Déjala en blanco si deseas conservar la contraseña actual.'
                    : 'Mínimo 6 caracteres. Se almacena encriptada con PBKDF2-SHA256.'
                }
              >
                <input
                  type="password"
                  value={formContrasena}
                  onChange={(e) => setFormContrasena(e.target.value)}
                  placeholder={editingAccount ? 'Sin cambios' : 'Mínimo 6 caracteres'}
                  required={!editingAccount}
                />
              </Field>
              {formError && (
                <div className="notice notice-red">
                  <Icon name="alert" size={16} />
                  <span>{formError}</span>
                </div>
              )}
            </div>
            <div className="modal-actions">
              <Button variant="secondary" onClick={() => setFormOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" variant="primary" disabled={formSending}>
                {formSending
                  ? 'Guardando…'
                  : editingAccount
                    ? 'Guardar cambios'
                    : 'Crear cuenta'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {statusTarget && (
        <Modal
          title={`${statusTarget.estado === 'Activo' ? 'Inactivar' : 'Activar'} cuenta · ${statusTarget.nombre}`}
          subtitle={
            statusTarget.estado === 'Activo'
              ? 'Una cuenta inactiva no podrá iniciar sesión en PARQUEATE hasta ser reactivada.'
              : 'La cuenta recuperará el acceso inmediato al sistema con su rol asignado.'
          }
          onClose={() => setStatusTarget(null)}
        >
          <div className="modal-body">
            <div className={`notice ${statusTarget.estado === 'Activo' ? 'notice-red' : 'notice-amber'}`}>
              <Icon name="alert" size={18} />
              <span>
                {statusTarget.estado === 'Activo'
                  ? `Vas a inactivar la cuenta de ${statusTarget.nombre} (${statusTarget.correo}).`
                  : `Vas a reactivar la cuenta de ${statusTarget.nombre} (${statusTarget.correo}).`}
              </span>
            </div>
            <Field label="Motivo obligatorio">
              <textarea
                rows={3}
                maxLength={240}
                value={statusMotivo}
                onChange={(e) => setStatusMotivo(e.target.value)}
                placeholder={
                  statusTarget.estado === 'Activo'
                    ? 'Ej. Fin de turno temporal, vacaciones o retiro del cargo...'
                    : 'Ej. Reintegro a labores operativas...'
                }
                autoFocus
              />
            </Field>
            {statusError && (
              <div className="notice notice-red">
                <Icon name="alert" size={16} />
                <span>{statusError}</span>
              </div>
            )}
          </div>
          <div className="modal-actions">
            <Button variant="secondary" onClick={() => setStatusTarget(null)}>
              Cancelar
            </Button>
            <Button
              variant={statusTarget.estado === 'Activo' ? 'danger' : 'primary'}
              onClick={handleConfirmStatus}
              disabled={statusSending || statusMotivo.trim().length < 5}
            >
              {statusSending
                ? 'Procesando…'
                : statusTarget.estado === 'Activo'
                  ? 'Confirmar inactivación'
                  : 'Confirmar activación'}
            </Button>
          </div>
        </Modal>
      )}
    </section>
  )
}
