import { ReactNode, useEffect, useMemo, useState } from 'react'
import { defaultParkingSettings, mockMovements, mockPayments, mockVehicles, carCells, motoCells } from './data/mockParking'
import type { Module, Movement, NewVehicleForm, OpTab, ParkingSettings, Payment, Role, Vehicle, VehicleType } from './domain/parking'
import { displayDate, formatMoney, todayISO } from './shared/formatters'

function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const paths: Record<string, ReactNode> = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
    card: <><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20M6 15h3" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06-2.83 2.83-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21h-4v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06-2.83-2.83.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3v-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06 2.83-2.83.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3h4v.09A1.65 1.65 0 0 0 15 4.6a1.65 1.65 0 0 0 1.82-.33l.06-.06 2.83 2.83-.06.06A1.65 1.65 0 0 0 19.4 9c.12.37.2.75.2 1.14" /></>,
    search: <><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
    logout: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></>,
    chevron: <path d="m9 18 6-6-6-6" />,
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

function Modal({ title, subtitle, onClose, children, wide = false }: { title: string; subtitle?: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return <div className="modal-backdrop" onMouseDown={onClose}><div className={`modal ${wide ? 'modal-wide' : ''}`} onMouseDown={e => e.stopPropagation()}>
    <div className="modal-head"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button className="icon-btn" onClick={onClose} aria-label="Cerrar"><Icon name="x" /></button></div>
    {children}
  </div></div>
}

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <label className="field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>
}

function StatusBadge({ status }: { status: string }) {
  const tone = status === 'Vigente' || status === 'Activo' || status === 'Libre' ? 'green' : status === 'Alerta' || status === 'Por vencer' ? 'amber' : status === 'Finalizado' ? 'gray' : 'red'
  return <Badge tone={tone}>{status}</Badge>
}

export default function App() {
  const [loggedIn, setLoggedIn] = useState(false)
  const [role, setRole] = useState<Role>('operator')
  const [module, setModule] = useState<Module>('operations')
  const [opTab, setOpTab] = useState<OpTab>('console')
  const [vehicles, setVehicles] = useState(mockVehicles)
  const [movements, setMovements] = useState(mockMovements)
  const [payments, setPayments] = useState(mockPayments)
  const [mode, setMode] = useState<'entry' | 'exit'>('entry')
  const [plate, setPlate] = useState('')
  const [incident, setIncident] = useState('')
  const [selectedCell, setSelectedCell] = useState('')
  const [toast, setToast] = useState('')
  const [annulId, setAnnulId] = useState<string | null>(null)
  const [annulReason, setAnnulReason] = useState('')
  const [userModal, setUserModal] = useState(false)
  const [paymentModal, setPaymentModal] = useState(false)
  const [cellModal, setCellModal] = useState<string | null>(null)
  const [historySearch, setHistorySearch] = useState('')
  const [insideSearch, setInsideSearch] = useState('')
  const [profileOpen, setProfileOpen] = useState(false)
  const [params, setParams] = useState<ParkingSettings>(defaultParkingSettings)

  const selectedVehicle = vehicles.find(v => v.plate === plate.trim().toUpperCase())
  const occupiedCells = new Set(vehicles.filter(v => v.inside && v.cell).map(v => v.cell!))
  const availableCells = (selectedVehicle?.type === 'Moto' ? motoCells : carCells).filter(c => !occupiedCells.has(c))
  const assignedCell = selectedCell || availableCells[0] || ''
  const knownPlate = plate.trim().length >= 5
  let blockReason = ''
  if (knownPlate && !selectedVehicle) blockReason = 'La placa no está registrada en el sistema (RF-02).'
  else if (selectedVehicle && mode === 'entry' && selectedVehicle.status === 'Vencida') blockReason = 'Mensualidad vencida. El ingreso está denegado (RN-05).'
  else if (selectedVehicle && mode === 'entry' && selectedVehicle.inside) blockReason = `Doble ingreso bloqueado: el vehículo ya está en ${selectedVehicle.cell} (RN-03).`
  else if (selectedVehicle && mode === 'exit' && !selectedVehicle.inside) blockReason = 'No hay un ingreso activo para este vehículo (RF-09).'
  const canSubmit = !!selectedVehicle && !blockReason

  const insideVehicles = vehicles.filter(v => v.inside)
  const filteredInside = insideVehicles.filter(v => `${v.plate} ${v.owner} ${v.cell}`.toLowerCase().includes(insideSearch.toLowerCase()))
  const filteredMovements = movements.filter(m => `${m.id} ${m.plate} ${m.cell} ${m.operator}`.toLowerCase().includes(historySearch.toLowerCase()))
  const occupiedCars = 52 + vehicles.filter(v => v.inside && v.type === 'Carro' && !['KLM407', 'JPR221'].includes(v.plate)).length
  const occupiedMotos = 8 + vehicles.filter(v => v.inside && v.type === 'Moto').length

  const notify = (message: string) => {
    setToast(message)
    window.setTimeout(() => setToast(''), 3200)
  }

  const registerMovement = () => {
    if (!selectedVehicle || !canSubmit) return
    if (mode === 'entry') {
      const time = new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
      setVehicles(prev => prev.map(v => v.plate === selectedVehicle.plate ? { ...v, inside: true, cell: assignedCell, entryTime: `Hoy, ${time}`, operator: 'Andrea M.', incident: incident || 'Sin novedades' } : v))
      setMovements(prev => [{ id: `MOV-${1049 + prev.length - mockMovements.length}`, entered: `Hoy, ${time}`, plate: selectedVehicle.plate, cell: assignedCell, operator: 'Andrea M.', note: incident || 'Sin novedades', status: 'Activo' }, ...prev])
      notify(`Entrada confirmada · ${selectedVehicle.plate} asignado a ${assignedCell}`)
    } else {
      setVehicles(prev => prev.map(v => v.plate === selectedVehicle.plate ? { ...v, inside: false, cell: undefined, entryTime: undefined } : v))
      setMovements(prev => prev.map(m => m.plate === selectedVehicle.plate && m.status === 'Activo' ? { ...m, exited: 'Hoy, ahora', status: 'Finalizado' } : m))
      notify(`Salida registrada · ${selectedVehicle.plate}`)
    }
    setPlate(''); setIncident(''); setSelectedCell('')
  }

  const quickExit = (vehicle: Vehicle) => {
    setVehicles(prev => prev.map(v => v.plate === vehicle.plate ? { ...v, inside: false, cell: undefined, entryTime: undefined } : v))
    setMovements(prev => prev.map(m => m.plate === vehicle.plate && m.status === 'Activo' ? { ...m, exited: 'Hoy, ahora', status: 'Finalizado' } : m))
    notify(`Salida registrada · ${vehicle.plate}`)
  }

  const navigation = [
    { id: 'operations' as Module, label: 'Operaciones', icon: 'grid' },
    { id: 'people' as Module, label: 'Usuarios y celdas', icon: 'users' },
    { id: 'payments' as Module, label: 'Pagos', icon: 'card', admin: true },
  ]

  return <div className="app-shell canvas-shell">
    {!loggedIn && <Login onLogin={(nextRole) => { setRole(nextRole); setLoggedIn(true) }} />}
    <div className="canvas-identity">
      <div className="brand-mark">P</div>
      <div><strong>PARQUEATE</strong><span>Medellín</span></div>
    </div>
    <div className="occupancy-hud">
      <div className="hud-pill"><i className="hud-light green" /><span>Carros</span><strong>{occupiedCars}<small>/70</small></strong></div>
      <div className="hud-pill"><i className="hud-light amber" /><span>Motos</span><strong>{occupiedMotos}<small>/10</small></strong></div>
    </div>

    <main className="main canvas-main">

      {module === 'operations' && <OperationsHeader tab={opTab} setTab={setOpTab} totalInside={occupiedCars + occupiedMotos} />}
      <div className="content">
        {module === 'operations' && opTab === 'console' && <Console mode={mode} setMode={setMode} plate={plate} setPlate={(p) => { setPlate(p.toUpperCase().replace(/[^A-Z0-9]/g, '')); setSelectedCell('') }} vehicle={selectedVehicle} knownPlate={knownPlate} blockReason={blockReason} availableCells={availableCells} assignedCell={assignedCell} setSelectedCell={setSelectedCell} incident={incident} setIncident={setIncident} onSubmit={registerMovement} canSubmit={canSubmit} />}
        {module === 'operations' && opTab === 'inside' && <InsideTable vehicles={filteredInside} search={insideSearch} setSearch={setInsideSearch} onExit={quickExit} />}
        {module === 'operations' && opTab === 'history' && <HistoryTable movements={filteredMovements} role={role} search={historySearch} setSearch={setHistorySearch} onAnnul={setAnnulId} />}
        {module === 'people' && <PeopleModule vehicles={vehicles} occupiedCells={occupiedCells} setCellModal={setCellModal} role={role} onNew={() => setUserModal(true)} />}
        {module === 'payments' && role === 'admin' && <PaymentsModule payments={payments} onNew={() => setPaymentModal(true)} />}
        {module === 'settings' && role === 'admin' && <SettingsModule params={params} setParams={setParams} onSave={() => notify('Configuración guardada correctamente')} />}
      </div>
    </main>

    <div className="floating-dock-wrap">
      {profileOpen && <div className="profile-popover">
        <div className="profile-popover-head"><div className="avatar">AM</div><div><strong>Andrea Muñoz</strong><span>{role === 'admin' ? 'Administrador' : 'Operario'}</span></div></div>
        <span className="popover-label">CAMBIAR VISTA</span>
        <div className="role-switch popover-switch">
          <button className={role === 'operator' ? 'active' : ''} onClick={() => { setRole('operator'); if (module === 'payments' || module === 'settings') setModule('operations') }}>Operario</button>
          <button className={role === 'admin' ? 'active' : ''} onClick={() => setRole('admin')}>Admin</button>
        </div>
        <button className="popover-logout" onClick={() => setLoggedIn(false)}><Icon name="logout" size={16} />Cerrar sesión</button>
      </div>}
      <nav className="floating-dock" aria-label="Navegación principal">
        <button className="dock-logo" onClick={() => setModule('operations')} aria-label="Inicio">P</button>
        <span className="dock-divider" />
        <div className="dock-navigation">
          {navigation.map(item => <button key={item.id} title={item.admin && role !== 'admin' ? 'Disponible para administradores' : item.label} className={`dock-item ${module === item.id ? 'active' : ''} ${item.admin && role !== 'admin' ? 'locked' : ''}`} onClick={() => { if (!item.admin || role === 'admin') setModule(item.id) }}>
            <Icon name={item.icon} size={17} /><span>{item.label}</span>
          </button>)}
          <button title={role !== 'admin' ? 'Disponible para administradores' : 'Configuración'} className={`dock-item ${module === 'settings' ? 'active' : ''} ${role !== 'admin' ? 'locked' : ''}`} onClick={() => role === 'admin' && setModule('settings')}><Icon name="settings" size={17} /><span>Configuración</span></button>
        </div>
        <span className="dock-divider" />
        <button className={`dock-profile ${profileOpen ? 'active' : ''}`} onClick={() => setProfileOpen(!profileOpen)} aria-label="Perfil y rol"><div className="avatar">AM</div><span className={`role-indicator ${role}`} /></button>
      </nav>
    </div>

    {annulId && <AnnulModal reason={annulReason} setReason={setAnnulReason} onClose={() => { setAnnulId(null); setAnnulReason('') }} onConfirm={() => { setMovements(prev => prev.map(m => m.id === annulId ? { ...m, status: 'Anulado', annulReason } : m)); setAnnulId(null); setAnnulReason(''); notify(`Registro ${annulId} anulado con trazabilidad`) }} />}
    {userModal && <NewUserModal onClose={() => setUserModal(false)} onCreate={(vehicle) => { setVehicles(prev => [...prev, vehicle]); setUserModal(false); notify(`${vehicle.owner} y ${vehicle.plate} registrados`) }} />}
    {paymentModal && <PaymentModal vehicles={vehicles} fees={params} onClose={() => setPaymentModal(false)} onCreate={(payment, paidPlate) => { setPayments(prev => [payment, ...prev]); setVehicles(prev => prev.map(v => v.plate === paidPlate ? { ...v, status: 'Vigente', statusDetail: undefined } : v)); setPaymentModal(false); notify(`Pago registrado · ${paidPlate}`) }} />}
    {cellModal && <CellModal cell={cellModal} occupant={vehicles.find(v => v.cell === cellModal)} role={role} onClose={() => setCellModal(null)} onSave={() => { setCellModal(null); notify(`Configuración de ${cellModal} actualizada`) }} />}
    {toast && <div className="toast"><span className="toast-check"><Icon name="check" size={15} /></span>{toast}</div>}
  </div>
}

function Login({ onLogin }: { onLogin: (role: Role) => void }) {
  const [selected, setSelected] = useState<'andrea' | 'carlos' | null>(null)
  const [rememberedProfiles, setRememberedProfiles] = useState<Array<'andrea' | 'carlos'>>(['andrea', 'carlos'])
  const [pin, setPin] = useState('')
  const [manualMode, setManualMode] = useState(false)
  const [manualStep, setManualStep] = useState<1 | 2>(1)
  const [manualUser, setManualUser] = useState('')
  const [manualRole, setManualRole] = useState<Role>('operator')
  const [rememberManual, setRememberManual] = useState(true)
  const [leaving, setLeaving] = useState(false)
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(timer)
  }, [])
  const profiles = {
    andrea: { initials: 'AM', name: 'Andrea Muñoz', role: 'Operario de Cabina', access: 'operator' as Role },
    carlos: { initials: 'CM', name: 'Carlos Mendoza', role: 'Administrador General', access: 'admin' as Role },
  }
  const activeRole = selected ? profiles[selected].access : manualRole
  const canEnter = pin.length > 0 && (!!selected || (manualMode && manualStep === 2 && manualUser.trim().length > 2))
  const manualInitials = manualUser.trim().split(/[\s._-]+/).filter(Boolean).map(part => part[0]?.toUpperCase()).join('').slice(0, 2) || 'US'
  const unlock = () => {
    if (!canEnter) return
    setLeaving(true)
    window.setTimeout(() => onLogin(activeRole), 420)
  }
  const medellinTime = new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit', hour12: false }).format(now)
  const medellinDate = new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', weekday: 'long', day: 'numeric', month: 'long' }).format(now)
  return <div className={`station-lock ${leaving ? 'unlocking' : ''}`}>
    <div className="lock-backdrop" aria-hidden>
      <div className="parking-blueprint">
        <div className="blueprint-head"><span>PLANO OPERATIVO · NIVEL 01</span><span>PARQUEATE / MEDELLÍN</span></div>
        <div className="blueprint-zone"><span className="zone-label">CARROS · 70 CELDAS</span><div className="blueprint-grid cars">{carCells.map((cell, i) => <div key={cell} className={i < 52 ? 'occupied' : 'free'}><span>{cell}</span><i /></div>)}</div></div>
        <div className="blueprint-zone moto-zone"><span className="zone-label">MOTOS · 10 CELDAS</span><div className="blueprint-grid motos">{motoCells.map((cell, i) => <div key={cell} className={i < 9 ? 'occupied' : 'free'}><span>{cell}</span><i /></div>)}</div></div>
      </div>
    </div>

    <div className="lock-status">
      <div className="lock-brand"><span>P</span><strong>PARQUEATE</strong></div>
      <div className="lock-clock"><strong>{medellinTime}</strong><span>{medellinDate} · Medellín</span></div>
      <div className="system-pill"><i />Sistema en línea <span>·</span> 61 vehículos dentro <span>·</span> 19 celdas libres</div>
    </div>

    <form className={`shift-pod ${manualMode ? 'manual-flow' : ''}`} onSubmit={e => { e.preventDefault(); if (manualMode && manualStep === 1) { if (manualUser.trim().length > 2) setManualStep(2) } else unlock() }}>
      <div className="shift-pod-head"><span className="eyebrow">{manualMode ? `IDENTIFICACIÓN · PASO ${manualStep} DE 2` : 'DESBLOQUEAR ESTACIÓN'}</span><h1>{manualMode ? 'Vincular turno en terminal' : '¿Quién toma el turno?'}</h1><p>{manualMode ? (manualStep === 1 ? 'Identifica tu cuenta para continuar en esta estación.' : 'Confirma el nivel de acceso y verifica tu identidad.') : 'Selecciona tu perfil para acceder al espacio operativo.'}</p></div>
      {!manualMode ? <div className="remembered-section">
        <span className="remembered-label">SESIONES RECORDADAS EN ESTA TERMINAL</span>
        <div className="profile-selector">
        {rememberedProfiles.map(key => {
          const profile = profiles[key]
          return <div key={key} className={`shift-profile ${selected === key ? 'selected' : ''}`}>
            <button type="button" className="shift-profile-main" onClick={() => { setSelected(key); setPin('') }}>
              <span className={`profile-avatar ${key}`}>{profile.initials}<i><Icon name="check" size={10} /></i></span>
              <span className="profile-copy"><strong>{profile.name}</strong><small>{profile.role}</small></span>
            </button>
            <button type="button" className="forget-profile" title={`Olvidar la cuenta de ${profile.name} en este equipo`} aria-label={`Olvidar cuenta de ${profile.name}`} onClick={() => { setRememberedProfiles(current => current.filter(item => item !== key)); if (selected === key) { setSelected(null); setPin('') } }}>×</button>
          </div>
        })}
        </div>
        {rememberedProfiles.length === 0 && <div className="no-profiles"><Icon name="users" size={19} /><span>No hay sesiones recordadas en esta terminal.</span></div>}
      </div> : <div className="progressive-access">
        {manualStep === 1 ? <div className="identity-step">
          <label><span>USUARIO O DOCUMENTO DE IDENTIDAD</span><div className="identity-command"><Icon name="search" size={18} /><input value={manualUser} onChange={e => setManualUser(e.target.value)} placeholder="mateo.ospina o 1037612845" autoFocus /><button type="submit" disabled={manualUser.trim().length < 3}>Continuar <Icon name="arrow" size={15} /></button></div></label>
          <small>Usa cualquier usuario para probar el flujo de identificación.</small>
        </div> : <div className="verification-step">
          <div className="generated-identity"><span className="generated-avatar">{manualInitials}</span><div><small>CUENTA IDENTIFICADA</small><strong>{manualUser}</strong></div><button type="button" onClick={() => { setManualStep(1); setPin('') }}>Cambiar</button></div>
          <div className="verification-role"><span>ROL PARA ESTA SESIÓN</span><div className="manual-role"><button type="button" className={manualRole === 'operator' ? 'active' : ''} onClick={() => setManualRole('operator')}>Operario de Cabina</button><button type="button" className={manualRole === 'admin' ? 'active' : ''} onClick={() => setManualRole('admin')}>Administrador General</button></div></div>
        </div>}
      </div>}

      <div className={`pin-unlock ${selected || (manualMode && manualStep === 2) ? 'visible' : ''}`}>
        <label><span>PIN / CONTRASEÑA</span><input type="password" value={pin} onChange={e => setPin(e.target.value)} placeholder="••••••" aria-label="PIN o contraseña" /></label>
        <button type="submit" className="unlock-button" disabled={!canEnter}><span>Iniciar turno</span><Icon name="arrow" size={18} /></button>
      </div>
      {manualMode && manualStep === 2 && <label className="remember-terminal"><input type="checkbox" checked={rememberManual} onChange={e => setRememberManual(e.target.checked)} /><span>Recordar mi perfil en esta terminal para cambios rápidos de turno</span></label>}
      <button type="button" className="manual-link" onClick={() => { setManualMode(!manualMode); setManualStep(1); setSelected(null); setPin('') }}>{manualMode ? '← Volver a perfiles del turno' : 'Ingresar con otra cuenta manual'}</button>
      <span className="prototype-note">Acceso de demostración · Usa cualquier PIN</span>
    </form>
  </div>
}

function OperationsHeader({ tab, setTab, totalInside }: { tab: OpTab; setTab: (t: OpTab) => void; totalInside: number }) {
  return <div className={`page-head spotlight-head ${tab !== 'console' ? 'compact' : ''}`}><div className="title-row"><div><span className="eyebrow">ESTACIÓN DE ACCESO · MEDELLÍN</span><h1>{tab === 'console' ? '¿Qué vehículo quieres registrar?' : tab === 'inside' ? 'Vehículos dentro' : 'Historial y trazabilidad'}</h1><p>{tab === 'console' ? 'Valida una placa y completa el movimiento en segundos.' : 'Consulta la operación sin salir de la estación.'}</p></div><div className="date-chip"><Icon name="clock" size={16} /><span><small>HOY</small>14 de noviembre, 2026</span></div></div>
    <div className="tabs view-orbit"><button className={tab === 'console' ? 'active' : ''} onClick={() => setTab('console')}><Icon name="search" size={14} />Registro</button><button className={tab === 'inside' ? 'active' : ''} onClick={() => setTab('inside')}><Icon name="car" size={14} />Dentro <span>{totalInside}</span></button><button className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}><Icon name="clock" size={14} />Historial</button></div>
  </div>
}

function Console({ mode, setMode, plate, setPlate, vehicle, knownPlate, blockReason, availableCells, assignedCell, setSelectedCell, incident, setIncident, onSubmit, canSubmit }: {
  mode: 'entry' | 'exit'
  setMode: (mode: 'entry' | 'exit') => void
  plate: string
  setPlate: (plate: string) => void
  vehicle?: Vehicle
  knownPlate: boolean
  blockReason: string
  availableCells: string[]
  assignedCell: string
  setSelectedCell: (cell: string) => void
  incident: string
  setIncident: (incident: string) => void
  onSubmit: () => void
  canSubmit: boolean
}) {
  const validationEmpty = !knownPlate
  return <div className="console-layout spotlight-layout">
    <section className={`card register-card spotlight-card ${knownPlate ? 'expanded' : ''}`}>
      <div className="section-head spotlight-mode"><div className="segmented"><button className={mode === 'entry' ? 'active' : ''} onClick={() => setMode('entry')}>Entrada</button><button className={mode === 'exit' ? 'active' : ''} onClick={() => setMode('exit')}>Salida</button></div></div>
      <div className="plate-section spotlight-plate"><span className="command-hint">PLACA DEL VEHÍCULO</span><div className="plate-input"><Icon name="search" size={23} /><input value={plate} onChange={e => setPlate(e.target.value)} placeholder="EJ. ABC123" maxLength={6} autoFocus />{plate && <button onClick={() => setPlate('')}><Icon name="x" size={16} /></button>}<kbd>↵</kbd></div><p className="helper">Prueba con ABC123, XYZ789 o MOT12A</p></div>
      {validationEmpty ? <div className="validation-empty"><div className="scan-icon"><Icon name="car" size={26} /></div><h3>Esperando una placa</h3><p>La validación del usuario y la mensualidad aparecerá aquí.</p></div> :
        vehicle ? <div className={`validation-card ${blockReason ? 'invalid' : ''}`}>
          <div className="validation-top"><div className="person"><div className="avatar avatar-light">{vehicle.owner.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}</div><div><strong>{vehicle.owner}</strong><span>{vehicle.type} · {vehicle.plate}</span></div></div><StatusBadge status={vehicle.status} /></div>
          {vehicle.statusDetail && <div className={`notice ${vehicle.status === 'Vencida' ? 'notice-red' : 'notice-amber'}`}><Icon name="alert" size={17} /><span><strong>{vehicle.statusDetail}</strong>{vehicle.status === 'Alerta' ? ' · Renueva para evitar interrupciones.' : ' · Debe registrar un pago antes de ingresar.'}</span></div>}
          {blockReason ? <div className="blocked"><Icon name="x" size={18} /><div><strong>Movimiento no permitido</strong><p>{blockReason}</p></div></div> :
            mode === 'entry' ? <div className="cell-selector"><Field label="Celda asignada automáticamente"><select value={assignedCell} onChange={e => setSelectedCell(e.target.value)}>{availableCells.map((c: string) => <option key={c}>{c}</option>)}</select></Field><span className="auto-tag"><Icon name="check" size={14} /> Mejor ubicación disponible</span></div> :
              <div className="exit-detail"><span>Celda a liberar</span><strong>{vehicle.cell}</strong></div>}
        </div> : <div className="blocked standalone"><Icon name="x" size={18} /><div><strong>Placa no registrada</strong><p>{blockReason}</p></div></div>}
      <div className="step-three"><span className="step">PASO 3 DE 3 · OPCIONAL</span><Field label="Adjuntar novedad"><textarea value={incident} onChange={e => setIncident(e.target.value)} placeholder="Rayón, golpe u otra observación del vehículo..." rows={2} /></Field></div>
      <div className="card-footer"><span>{canSubmit ? 'Validación completada' : 'Completa la validación para continuar'}</span><Button onClick={onSubmit} disabled={!canSubmit}>{mode === 'entry' ? 'Confirmar entrada' : 'Registrar salida'} <Icon name="arrow" size={16} /></Button></div>
    </section>
  </div>
}

function Capacity({ label, value, total, icon, warning }: { label: string; value: number; total: number; icon: string; warning?: boolean }) {
  const percent = Math.min(100, (value / total) * 100)
  return <div className="capacity-item"><div className="capacity-meta"><div className="capacity-icon">{icon}</div><div><strong>{label}</strong><span>{total - value} disponibles</span></div><div className="capacity-number"><strong>{value}</strong><span>/ {total}</span></div></div><div className="progress"><div className={warning ? 'warning' : ''} style={{ width: `${percent}%` }} /></div></div>
}

function TableShell({ title, eyebrow, actions, children }: { title: string; eyebrow: string; actions: ReactNode; children: ReactNode }) {
  return <section className="table-page"><div className="table-title"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1></div>{actions}</div><div className="card table-card">{children}</div></section>
}

function SearchInput({ value, setValue, placeholder }: { value: string; setValue: (v: string) => void; placeholder: string }) {
  return <div className="search-input"><Icon name="search" size={16} /><input value={value} onChange={e => setValue(e.target.value)} placeholder={placeholder} /></div>
}

function InsideTable({ vehicles, search, setSearch, onExit }: { vehicles: Vehicle[]; search: string; setSearch: (s: string) => void; onExit: (v: Vehicle) => void }) {
  return <TableShell title="Vehículos dentro" eyebrow="OCUPACIÓN EN VIVO" actions={<SearchInput value={search} setValue={setSearch} placeholder="Buscar placa o celda" />}>
    <table><thead><tr><th>Vehículo</th><th>Tipo</th><th>Celda</th><th>Hora de entrada</th><th>Operario</th><th>Novedad</th><th /></tr></thead><tbody>{vehicles.map(v => <tr key={v.plate}><td><strong>{v.plate}</strong><span>{v.owner}</span></td><td>{v.type}</td><td><span className="cell-code">{v.cell}</span></td><td>{v.entryTime}</td><td>{v.operator}</td><td className="note-cell">{v.incident}</td><td><Button variant="secondary" onClick={() => onExit(v)}>Dar salida</Button></td></tr>)}</tbody></table>
  </TableShell>
}

function HistoryTable({ movements, role, search, setSearch, onAnnul }: { movements: Movement[]; role: Role; search: string; setSearch: (s: string) => void; onAnnul: (id: string) => void }) {
  return <TableShell title="Historial y trazabilidad" eyebrow="REGISTRO INALTERABLE" actions={<div className="filter-row"><SearchInput value={search} setValue={setSearch} placeholder="Placa, usuario o celda" /><input type="date" aria-label="Fecha inicial" /><input type="date" aria-label="Fecha final" /></div>}>
    <table><thead><tr><th>ID</th><th>Entrada</th><th>Salida</th><th>Placa</th><th>Celda</th><th>Operario responsable</th><th>Novedades</th><th>Estado</th>{role === 'admin' && <th />}</tr></thead><tbody>{movements.map(m => <tr key={m.id}><td className="mono">{m.id}</td><td>{m.entered}</td><td>{m.exited || '—'}</td><td><strong>{m.plate}</strong></td><td><span className="cell-code">{m.cell}</span></td><td>{m.operator}</td><td className="note-cell">{m.note}</td><td><StatusBadge status={m.status} /></td>{role === 'admin' && <td>{m.status !== 'Anulado' && <Button variant="ghost" onClick={() => onAnnul(m.id)}>Anular</Button>}</td>}</tr>)}</tbody></table>
    {role !== 'admin' && <div className="permission-note">La anulación de registros está disponible únicamente en Vista Administrador.</div>}
  </TableShell>
}

function PeopleModule({ vehicles, occupiedCells, setCellModal, role, onNew }: { vehicles: Vehicle[]; occupiedCells: Set<string>; setCellModal: (c: string) => void; role: Role; onNew: () => void }) {
  const [cellType, setCellType] = useState<'cars' | 'motos'>('cars')
  const cells = cellType === 'cars' ? carCells : motoCells
  return <div className="module-page"><div className="table-title"><div><span className="eyebrow">ADMINISTRACIÓN</span><h1>Usuarios y celdas</h1><p>Gestiona clientes, vehículos y la distribución del parqueadero.</p></div>{role === 'admin' && <Button icon="plus" onClick={onNew}>Nuevo usuario y vehículo</Button>}</div>
    <section className="card cell-section"><div className="section-head"><div><h2>Matriz de celdas</h2><p>Selecciona una celda para consultar o modificar su estado.</p></div><div className="segmented"><button className={cellType === 'cars' ? 'active' : ''} onClick={() => setCellType('cars')}>Carros · 70</button><button className={cellType === 'motos' ? 'active' : ''} onClick={() => setCellType('motos')}>Motos · 10</button></div></div><div className="cell-legend"><span><i className="free" />Libre</span><span><i className="occupied" />Ocupada</span><span><i className="disabled" />Deshabilitada</span></div><div className={`cell-grid ${cellType}`}>{cells.map((c, i) => { const occupied = occupiedCells.has(c) || (cellType === 'cars' ? i < 52 : i < 9); const disabled = (c === 'C-56'); return <button key={c} className={`${occupied ? 'occupied' : 'free'} ${disabled ? 'disabled' : ''}`} onClick={() => setCellModal(c)}><span>{c}</span>{occupied && !disabled && <small>{vehicles.find(v => v.cell === c)?.plate || 'Ocupada'}</small>}</button> })}</div></section>
    <section className="card table-card user-table"><div className="inner-title"><div><h2>Usuarios registrados</h2><p>{vehicles.length} clientes en esta vista</p></div><SearchInput value="" setValue={() => {}} placeholder="Buscar usuario" /></div><table><thead><tr><th>Cliente</th><th>Identificación</th><th>Contacto</th><th>Placa</th><th>Tipo</th><th>Mensualidad</th></tr></thead><tbody>{vehicles.map(v => <tr key={v.plate}><td><strong>{v.owner}</strong></td><td>{v.id}</td><td>{v.phone}</td><td><strong>{v.plate}</strong></td><td>{v.type}</td><td><StatusBadge status={v.status} /></td></tr>)}</tbody></table></section>
  </div>
}

function PaymentsModule({ payments, onNew }: { payments: Payment[]; onNew: () => void }) {
  const revenue = payments.filter(p => p.status !== 'Vencida').reduce((a, p) => a + p.amount, 0)
  return <div className="module-page"><div className="table-title"><div><span className="eyebrow">FACTURACIÓN</span><h1>Pagos y mensualidades</h1><p>Controla la vigencia y registra renovaciones de tus clientes.</p></div><Button icon="plus" onClick={onNew}>Registrar pago</Button></div>
    <div className="kpi-grid"><Kpi label="Suscripciones activas" value="76" note="+4 este mes" tone="green" /><Kpi label="Próximas a vencer" value="8" note="En ≤ 3 días" tone="amber" /><Kpi label="Vencidas" value="3" note="Requieren atención" tone="red" /><Kpi label="Ingresos del mes" value={formatMoney(revenue)} note="Noviembre 2026" tone="gray" /></div>
    <section className="card table-card"><div className="inner-title"><div><h2>Historial de pagos</h2><p>Últimos movimientos registrados</p></div><SearchInput value="" setValue={() => {}} placeholder="Buscar placa o cliente" /></div><table><thead><tr><th>Comprobante</th><th>Cliente</th><th>Placa</th><th>Valor</th><th>Inicio</th><th>Vencimiento</th><th>Días restantes</th><th>Estado</th></tr></thead><tbody>{payments.map(p => <tr key={p.id}><td className="mono">{p.id}</td><td><strong>{p.owner}</strong></td><td>{p.plate}</td><td><strong>{formatMoney(p.amount)}</strong></td><td>{p.start}</td><td>{p.end}</td><td><span className={`days ${p.days < 0 ? 'red' : p.days <= 3 ? 'amber' : ''}`}>{p.days < 0 ? `${Math.abs(p.days)} días vencida` : p.days === 0 ? 'Vence hoy' : `${p.days} días`}</span></td><td><StatusBadge status={p.status} /></td></tr>)}</tbody></table></section>
  </div>
}

function Kpi({ label, value, note, tone }: { label: string; value: string; note: string; tone: string }) {
  return <div className="card kpi"><div className={`kpi-signal ${tone}`} /><span>{label}</span><strong>{value}</strong><small>{note}</small></div>
}

function SettingsModule({ params, setParams, onSave }: { params: ParkingSettings; setParams: (p: ParkingSettings) => void; onSave: () => void }) {
  const update = (key: keyof ParkingSettings, value: number) => setParams({ ...params, [key]: value })
  return <div className="module-page settings-page"><div className="table-title"><div><span className="eyebrow">RNF-08 · SOLO ADMINISTRADOR</span><h1>Configuración del sistema</h1><p>Actualiza parámetros globales sin modificar el código.</p></div><Button onClick={onSave}>Guardar cambios</Button></div>
    <div className="settings-grid"><section className="card settings-card"><div className="settings-icon"><Icon name="grid" /></div><div><h2>Capacidad del parqueadero</h2><p>Define el inventario total de espacios por tipo.</p></div><div className="form-grid"><Field label="Total celdas carros"><input type="number" value={params.cars} onChange={e => update('cars', +e.target.value)} /></Field><Field label="Total celdas motos"><input type="number" value={params.motos} onChange={e => update('motos', +e.target.value)} /></Field></div></section>
      <section className="card settings-card"><div className="settings-icon"><Icon name="card" /></div><div><h2>Tarifas mensuales</h2><p>Valores aplicados automáticamente al registrar pagos.</p></div><div className="form-grid"><Field label="Tarifa mensual carro"><input type="number" value={params.carFee} onChange={e => update('carFee', +e.target.value)} /></Field><Field label="Tarifa mensual moto"><input type="number" value={params.motoFee} onChange={e => update('motoFee', +e.target.value)} /></Field></div></section>
      <section className="card settings-card"><div className="settings-icon"><Icon name="clock" /></div><div><h2>Vigencia y alertas</h2><p>Reglas de calendario para todas las mensualidades.</p></div><div className="form-grid"><Field label="Días de vigencia"><input type="number" value={params.validity} onChange={e => update('validity', +e.target.value)} /></Field><Field label="Días de alerta previa"><input type="number" value={params.alert} onChange={e => update('alert', +e.target.value)} /></Field></div></section>
      <section className="card settings-card team-card"><div className="settings-icon"><Icon name="users" /></div><div><h2>Usuarios internos</h2><p>Cuentas con acceso al sistema y sus permisos.</p></div><div className="team-list"><div><div className="avatar">AM</div><span><strong>Andrea Muñoz</strong><small>Operario · Activo</small></span><Button variant="secondary">Editar</Button></div><div><div className="avatar">JG</div><span><strong>Julián García</strong><small>Administrador · Activo</small></span><Button variant="secondary">Editar</Button></div></div><Button variant="secondary" icon="plus">Crear cuenta interna</Button></section>
    </div>
  </div>
}

function AnnulModal({ reason, setReason, onClose, onConfirm }: { reason: string; setReason: (s: string) => void; onClose: () => void; onConfirm: () => void }) {
  return <Modal title="Anular registro" subtitle="Esta acción no elimina el movimiento y quedará en la trazabilidad." onClose={onClose}><div className="modal-body"><div className="notice notice-red"><Icon name="alert" size={18} /><span>La anulación requiere una justificación obligatoria (RNF-05).</span></div><Field label="Justificación"><textarea value={reason} onChange={e => setReason(e.target.value)} rows={4} placeholder="Explica el motivo de la anulación..." autoFocus /></Field></div><div className="modal-actions"><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button variant="danger" onClick={onConfirm} disabled={reason.trim().length < 8}>Anular registro</Button></div></Modal>
}

function NewUserModal({ onClose, onCreate }: { onClose: () => void; onCreate: (v: Vehicle) => void }) {
  const [form, setForm] = useState<NewVehicleForm>({ owner: '', id: '', phone: '', plate: '', type: 'Carro', consent: false })
  const field = <K extends keyof NewVehicleForm,>(key: K, value: NewVehicleForm[K]) => setForm(current => ({ ...current, [key]: value }))
  return <Modal title="Nuevo usuario y vehículo" subtitle="Registra al titular y su vehículo asociado." onClose={onClose} wide><form onSubmit={e => { e.preventDefault(); onCreate({ ...form, plate: form.plate.toUpperCase(), status: 'Vencida', statusDetail: 'Pendiente de primer pago', inside: false }) }}><div className="modal-body form-grid"><Field label="Nombre completo"><input value={form.owner} onChange={e => field('owner', e.target.value)} required /></Field><Field label="Documento de identidad"><input value={form.id} onChange={e => field('id', e.target.value)} required /></Field><Field label="Teléfono / contacto"><input value={form.phone} onChange={e => field('phone', e.target.value)} required /></Field><Field label="Placa"><input value={form.plate} onChange={e => field('plate', e.target.value.toUpperCase())} maxLength={6} required /></Field><Field label="Tipo de vehículo"><select value={form.type} onChange={e => { if (e.target.value === 'Carro' || e.target.value === 'Moto') field('type', e.target.value) }}><option>Carro</option><option>Moto</option></select></Field><label className="checkbox-field"><input type="checkbox" checked={form.consent} onChange={e => field('consent', e.target.checked)} required /><span><strong>Autorización de tratamiento de datos</strong><small>El usuario acepta el tratamiento de sus datos personales según la Ley 1581 (Habeas Data).</small></span></label></div><div className="modal-actions"><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button type="submit" disabled={!form.consent}>Crear registro</Button></div></form></Modal>
}

function PaymentModal({ vehicles, fees, onClose, onCreate }: { vehicles: Vehicle[]; fees: ParkingSettings; onClose: () => void; onCreate: (p: Payment, plate: string) => void }) {
  const [plate, setPlate] = useState(vehicles[0].plate)
  const [date, setDate] = useState(todayISO())
  const vehicle = vehicles.find(v => v.plate === plate)!
  const amount = vehicle.type === 'Carro' ? fees.carFee : fees.motoFee
  const end = useMemo(() => { const d = new Date(`${date}T12:00:00`); d.setDate(d.getDate() + fees.validity - 1); return d }, [date, fees.validity])
  return <Modal title="Registrar pago" subtitle="La vigencia se calculará automáticamente por 30 días calendario." onClose={onClose}><div className="modal-body"><Field label="Usuario / placa"><select value={plate} onChange={e => setPlate(e.target.value)}>{vehicles.map(v => <option key={v.plate} value={v.plate}>{v.plate} · {v.owner}</option>)}</select></Field><div className="form-grid"><Field label="Fecha de pago"><input type="date" value={date} onChange={e => setDate(e.target.value)} /></Field><Field label="Tarifa aplicada"><input value={formatMoney(amount)} readOnly /></Field></div><div className="payment-summary"><div><span>Inicio de vigencia</span><strong>{displayDate(new Date(`${date}T12:00:00`))}</strong></div><Icon name="arrow" /><div><span>Fin de vigencia</span><strong>{displayDate(end)}</strong></div></div></div><div className="modal-actions"><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button onClick={() => onCreate({ id: `PAG-${382 + Math.floor(Math.random() * 20)}`, plate, owner: vehicle.owner, amount, start: displayDate(new Date(`${date}T12:00:00`)), end: displayDate(end), days: fees.validity - 1, status: 'Vigente' }, plate)}>Confirmar pago</Button></div></Modal>
}

function CellModal({ cell, occupant, role, onClose, onSave }: { cell: string; occupant?: Vehicle; role: Role; onClose: () => void; onSave: () => void }) {
  return <Modal title={`Celda ${cell}`} subtitle="Detalle y configuración del espacio." onClose={onClose}><div className="modal-body"><div className="cell-status-large"><div className={occupant ? 'occupied' : 'free'}><Icon name={occupant ? 'car' : 'check'} /></div><span><small>ESTADO ACTUAL</small><strong>{occupant ? `Ocupada por ${occupant.plate}` : 'Libre'}</strong>{occupant && <p>{occupant.owner} · Ingresó {occupant.entryTime}</p>}</span></div>{role === 'admin' ? <><Field label="Tipo de celda"><select defaultValue={cell.startsWith('C') ? 'Carro' : 'Moto'}><option>Carro</option><option>Moto</option></select></Field><label className="toggle-field"><span><strong>Celda habilitada</strong><small>Permite asignaciones automáticas</small></span><input type="checkbox" defaultChecked /></label></> : <div className="permission-note">Cambia a Vista Administrador para editar esta celda.</div>}</div><div className="modal-actions"><Button variant="secondary" onClick={onClose}>Cerrar</Button>{role === 'admin' && <Button onClick={onSave}>Guardar cambios</Button>}</div></Modal>
}
