import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  LayoutDashboard,
  Boxes,
  ShoppingCart,
  LogOut,
  ChevronDown,
  KeyRound,
  LogIn,
  Menu,
  Store,
  Truck,
  TrendingUp,
  FileText,
  Receipt,
  UserPlus,
  Users,
  ContactRound,
  X,
  ChevronRight,
  Bell,
} from 'lucide-react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { authStorage } from '../../shared/lib/auth'
import { cartStorage } from '../../shared/lib/cart'
import {
  esModoPanelSoloSeleccion,
  setPanelModulesDesdePerfil,
  setStaffFlagDesdePerfil,
} from '../../shared/lib/accesoSesion'
import { changePasswordRequest, fetchProfile } from '../auth/auth.service'
import { formatApiError } from '../../shared/lib/apiError'
import { pathRequiresModule, type PanelModuleId } from '../../shared/lib/panelModules'

const SIDEBAR_WIDE_KEY = 'boutique_sidebar_wide'

function readSidebarWide(): boolean {
  if (typeof localStorage === 'undefined') return true
  return localStorage.getItem(SIDEBAR_WIDE_KEY) !== '0'
}

function dashboardPageTitle(pathname: string): string {
  if (pathname === '/dashboard') return 'Dashboard'
  if (pathname.startsWith('/ventas')) return 'Ventas'
  if (pathname.startsWith('/proveedores')) return 'Proveedores'
  if (pathname.startsWith('/inventario/stock')) return 'Stock'
  if (pathname.startsWith('/inventario/categorias')) return 'Inventario · Categorías'
  if (pathname.startsWith('/inventario/pedidos')) return 'Inventario · Pedidos'
  if (pathname.startsWith('/inventario/bodegas')) return 'Inventario · Bodegas'
  if (pathname.startsWith('/inventario/productos')) return 'Inventario · Productos'
  if (pathname === '/inventario') return 'Inventario · Productos'
  if (pathname.startsWith('/inventario')) return 'Inventario'
  if (pathname.startsWith('/estadisticas')) return 'Estadísticas'
  if (pathname.startsWith('/reportes')) return 'Reportes'
  if (pathname.startsWith('/pos/vender')) return 'POS · Vender'
  if (pathname.startsWith('/pos/facturas')) return 'POS · Facturas'
  if (pathname.startsWith('/pos/cotizaciones')) return 'POS · Cotizaciones'
  if (pathname.startsWith('/pos/clientes')) return 'POS · Clientes'
  if (pathname.startsWith('/pos')) return 'POS'
  if (pathname.startsWith('/usuario/crear')) return 'Crear usuario'
  if (pathname.startsWith('/usuario')) return 'Usuario'
  if (pathname.startsWith('/carrito')) return 'Carrito'
  return 'Panel'
}

/* ── Componente de ítem de nav ─────────────────────────────────────────────── */
function SideNavItem({
  to,
  Icon,
  label,
  wide,
  exact = false,
  isActive: forceActive,
}: {
  to: string
  Icon: React.ElementType
  label: string
  wide: boolean
  exact?: boolean
  isActive?: boolean
}) {
  return (
    <NavLink
      to={to}
      end={exact}
      title={!wide ? label : undefined}
      className={({ isActive }) => {
        const active = forceActive !== undefined ? forceActive : isActive
        return [
          'group relative flex items-center rounded-xl transition-all duration-150',
          wide ? 'gap-3 px-3 py-2.5' : 'justify-center py-2.5',
          active
            ? 'bg-red-50 text-red-700 font-semibold before:absolute before:left-0 before:top-[15%] before:h-[70%] before:w-[3px] before:rounded-full before:bg-red-500'
            : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900',
        ].join(' ')
      }}
    >
      <Icon size={17} strokeWidth={1.75} className="shrink-0" aria-hidden />
      {wide ? <span className="truncate text-sm">{label}</span> : null}
    </NavLink>
  )
}

/* ── Subítem de nav ─────────────────────────────────────────────────────────── */
function SideSubItem({
  to,
  Icon,
  label,
  exact = false,
}: {
  to: string
  Icon: React.ElementType
  label: string
  exact?: boolean
}) {
  return (
    <NavLink
      to={to}
      end={exact}
      className={({ isActive }) =>
        [
          'flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium transition-all duration-150',
          isActive
            ? 'bg-red-50 text-red-700 font-semibold'
            : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900',
        ].join(' ')
      }
    >
      <Icon size={14} strokeWidth={1.75} className="shrink-0" aria-hidden />
      <span className="truncate">{label}</span>
    </NavLink>
  )
}

/* ── Etiqueta de sección ────────────────────────────────────────────────────── */
function NavSection({ label, wide }: { label: string; wide: boolean }) {
  if (!wide) return <div className="my-2 h-px mx-2" style={{ background: '#E4E8F2' }} />
  return (
    <p className="mb-1 mt-5 px-3 text-[10px] font-bold uppercase tracking-[0.13em] text-gray-500 first:mt-2">
      {label}
    </p>
  )
}

/* ── Menú colapsable ────────────────────────────────────────────────────────── */
function SideCollapsible({
  Icon,
  label,
  wide,
  open,
  onToggle,
  isActive,
  onCollapsedClick,
  children,
}: {
  Icon: React.ElementType
  label: string
  wide: boolean
  open: boolean
  onToggle: () => void
  isActive: boolean
  onCollapsedClick: () => void
  children: React.ReactNode
}) {
  if (!wide) {
    return (
      <button
        type="button"
        title={label}
        onClick={onCollapsedClick}
        className={[
          'group flex w-full items-center justify-center rounded-xl py-2.5 transition-all duration-150',
          isActive ? 'bg-red-50 text-red-700 font-semibold' : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900',
        ].join(' ')}
      >
        <Icon size={17} strokeWidth={1.75} aria-hidden />
      </button>
    )
  }
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className={[
          'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 transition-all duration-150',
          isActive ? 'bg-red-50 text-red-700 font-semibold' : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900',
        ].join(' ')}
      >
        <Icon size={17} strokeWidth={1.75} className="shrink-0" aria-hidden />
        <span className="flex-1 truncate text-left text-sm font-medium">{label}</span>
        <ChevronDown
          size={14}
          className={`shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>
      {open ? (
        <div className="mt-1 space-y-0.5 pl-8 pr-1">
          {children}
        </div>
      ) : null}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════ */
export function DashboardLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()

  const [posOpen, setPosOpen] = useState(() => location.pathname.startsWith('/pos'))
  const [usuarioOpen, setUsuarioOpen] = useState(() => location.pathname.startsWith('/usuario'))

  const modoPanel = esModoPanelSoloSeleccion()

  const profileQuery = useQuery({
    queryKey: ['auth', 'profile'],
    queryFn: fetchProfile,
    staleTime: 60_000,
    retry: 1,
  })
  const profile = profileQuery.data

  const modulosPanelSet = useMemo(() => {
    if (!modoPanel) return null
    const raw = profile?.panel_allowed_modules
    if (!Array.isArray(raw)) return new Set<PanelModuleId>(['dashboard'])
    const ids = new Set<PanelModuleId>()
    for (const x of raw) {
      if (typeof x === 'string' && x) ids.add(x as PanelModuleId)
    }
    ids.add('dashboard')
    return ids
  }, [modoPanel, profile?.panel_allowed_modules])

  const can = useMemo(() => {
    return (id: PanelModuleId): boolean => {
      if (!modoPanel) return true
      if (!profileQuery.isSuccess) return true
      return modulosPanelSet?.has(id) ?? false
    }
  }, [modoPanel, profileQuery.isSuccess, modulosPanelSet])

  useEffect(() => {
    if (profile?.is_staff == null) return
    setStaffFlagDesdePerfil(Boolean(profile.is_staff))
  }, [profile?.is_staff])

  useEffect(() => {
    if (!profile) return
    if (profile.is_staff || profile.is_superuser) {
      setPanelModulesDesdePerfil(null)
    } else {
      setPanelModulesDesdePerfil(profile.panel_allowed_modules ?? undefined)
    }
  }, [profile])

  useEffect(() => {
    document.title = `${dashboardPageTitle(location.pathname)} · IXMUCANE`
  }, [location.pathname])

  useEffect(() => { if (location.pathname.startsWith('/pos')) setPosOpen(true) }, [location.pathname])
  useEffect(() => { if (location.pathname.startsWith('/usuario')) setUsuarioOpen(true) }, [location.pathname])

  useEffect(() => {
    if (!modoPanel) return
    if (location.pathname.startsWith('/usuario')) {
      navigate('/dashboard', { replace: true })
      return
    }
    if (!profileQuery.isSuccess) return
    const req = pathRequiresModule(location.pathname, location.search)
    const hasReq =
      req == null
        ? true
        : (modulosPanelSet?.has(req) ?? false) ||
          (req.startsWith('inventario_bodega_') && (modulosPanelSet?.has('inventario') ?? false))
    if (!hasReq) navigate('/dashboard', { replace: true })
  }, [location.pathname, location.search, modoPanel, profileQuery.isSuccess, modulosPanelSet, navigate])

  const logout = () => {
    authStorage.clear()
    void queryClient.removeQueries({ queryKey: ['auth', 'profile'] })
    navigate('/login')
  }

  const [cartTick, setCartTick] = useState(0)
  useEffect(() => {
    const onCart = () => setCartTick((n) => n + 1)
    window.addEventListener('boutique-cart-changed', onCart)
    return () => window.removeEventListener('boutique-cart-changed', onCart)
  }, [])

  const unidadesCarrito = useMemo(() => {
    if (!modoPanel) return 0
    return cartStorage.list().reduce((acc, line) => acc + line.quantity, 0)
  }, [modoPanel, cartTick])

  /* User menu */
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const userMenuRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!userMenuOpen) return
    const onDoc = (e: MouseEvent) => {
      if (userMenuRef.current?.contains(e.target as Node)) return
      setUserMenuOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [userMenuOpen])

  /* Password modal */
  const [pwdModalOpen, setPwdModalOpen] = useState(false)
  const [pwdOld, setPwdOld] = useState('')
  const [pwdNew, setPwdNew] = useState('')
  const [pwdConfirm, setPwdConfirm] = useState('')
  const [pwdError, setPwdError] = useState('')

  const changePasswordMutation = useMutation({
    mutationFn: () => changePasswordRequest({ old_password: pwdOld, new_password: pwdNew, new_password_confirm: pwdConfirm }),
    onSuccess: () => {
      setPwdModalOpen(false); setPwdOld(''); setPwdNew(''); setPwdConfirm(''); setPwdError('')
    },
    onError: (err: unknown) => setPwdError(formatApiError(err)),
  })

  const openPasswordModal = () => {
    setUserMenuOpen(false); setPwdError(''); setPwdOld(''); setPwdNew(''); setPwdConfirm(''); setPwdModalOpen(true)
  }

  const submitPasswordChange = (e: FormEvent) => {
    e.preventDefault(); setPwdError('')
    if (pwdNew.length < 8) { setPwdError('La nueva contraseña debe tener al menos 8 caracteres.'); return }
    if (pwdNew !== pwdConfirm) { setPwdError('La confirmación no coincide.'); return }
    changePasswordMutation.mutate()
  }

  /* Sidebar */
  const [sidebarWide, setSidebarWide] = useState(readSidebarWide)
  const toggleSidebarWide = () => {
    setSidebarWide((prev) => {
      const next = !prev
      if (typeof localStorage !== 'undefined') localStorage.setItem(SIDEBAR_WIDE_KEY, next ? '1' : '0')
      return next
    })
  }

  /* Nav helpers */
  const navInventarioActivo = location.pathname.startsWith('/inventario')
  const navEstadisticasActivo = location.pathname.startsWith('/estadisticas')
  const navReportesActivo = location.pathname.startsWith('/reportes')
  const navPosActivo  = location.pathname.startsWith('/pos')
  const navUsuarioActivo = location.pathname.startsWith('/usuario')

  const inventarioDefaultTo = useMemo(() => {
    if (!modoPanel) return '/inventario'
    if (can('inventario')) return '/inventario'
    const bodegasPermitidas: Array<1 | 2 | 3> = []
    if (can('inventario_bodega_1')) bodegasPermitidas.push(1)
    if (can('inventario_bodega_2')) bodegasPermitidas.push(2)
    if (can('inventario_bodega_3')) bodegasPermitidas.push(3)
    if (bodegasPermitidas.length === 1) return `/inventario/productos?bodega=${bodegasPermitidas[0]}`
    if (bodegasPermitidas.length > 1) return '/inventario/bodegas'
    return '/inventario'
  }, [modoPanel, can])

  const enInventarioProductos = location.pathname.startsWith('/inventario') && !location.pathname.includes('/inventario/stock')
  const mostrarCarritoFlotante = enInventarioProductos && !modoPanel

  /* Initials avatar */
  const initials = useMemo(() => {
    const name = profile?.personnel_nombre_completo?.trim() || profile?.username?.trim() || '?'
    return name
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? '')
      .join('')
  }, [profile])

  const pageTitle = dashboardPageTitle(location.pathname)

  /* ── Render ─────────────────────────────────────────────────────────────── */
  return (
    <div className="flex min-h-screen bg-app-bg text-app-text antialiased">

      {/* ══ SIDEBAR ════════════════════════════════════════════════════════ */}
      <aside
        className={[
          'fixed bottom-0 left-0 top-0 z-[50] flex flex-col',
          'border-r transition-[width] duration-200 ease-out',
          sidebarWide ? 'w-[17rem]' : 'w-[3.75rem]',
        ].join(' ')}
        style={{ background: '#FFFFFF', borderColor: '#E4E8F2' }}
      >

        {/* ── Logo / header sidebar ─────────────────────────────────────────── */}
        <div
          className={[
            'flex shrink-0 items-center border-b border-sidebar-border',
            sidebarWide ? 'h-[4.2rem] px-3 gap-2.5' : 'h-[4.2rem] justify-center px-0',
          ].join(' ')}
        >
          <img
            src="/logo-ixmucane.png"
            alt="Aluminios Ixmucane"
            className="shrink-0 object-contain select-none"
            style={{ height: sidebarWide ? 52 : 40, width: sidebarWide ? 52 : 40 }}
            draggable={false}
          />
          {sidebarWide ? (
            <div style={{ lineHeight: 1.25 }}>
              <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#8A95AA' }}>Aluminios</p>
              <p style={{ fontSize: 15, fontWeight: 900, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#B91C1C' }}>IXMUCANE</p>
            </div>
          ) : null}
        </div>

        {/* ── Scroll nav ───────────────────────────────────────────────────── */}
        <div className="flex flex-1 flex-col gap-0.5 overflow-y-auto overflow-x-hidden px-2 py-3">

          {/* — Principal — */}
          <NavSection label="Principal" wide={sidebarWide} />
          <SideNavItem to="/dashboard" Icon={LayoutDashboard} label="Dashboard" wide={sidebarWide} exact />

          {/* — Comercial — */}
          {can('proveedores') ? (
            <>
              <NavSection label="Comercial" wide={sidebarWide} />
              <SideNavItem to="/proveedores" Icon={Truck} label="Proveedores" wide={sidebarWide} />
            </>
          ) : null}

          {/* — Inventario — */}
          {(can('inventario') || can('inventario_bodega_1') || can('inventario_bodega_2') || can('inventario_bodega_3')) ? (
            <>
              <NavSection label="Inventario" wide={sidebarWide} />
              <SideNavItem
                to={inventarioDefaultTo}
                Icon={Boxes}
                label="Inventario"
                wide={sidebarWide}
                isActive={navInventarioActivo}
              />
            </>
          ) : null}

          {/* — Ventas POS — */}
          {can('pos') ? (
            <>
              <NavSection label="Ventas" wide={sidebarWide} />
              <SideCollapsible
                Icon={Store}
                label="Punto de Venta"
                wide={sidebarWide}
                open={posOpen}
                onToggle={() => setPosOpen((o) => !o)}
                isActive={navPosActivo}
                onCollapsedClick={() => navigate('/pos/vender')}
              >
                <SideSubItem to="/pos/vender" Icon={ShoppingCart} label="Vender" exact />
                <SideSubItem to="/pos/facturas" Icon={Receipt} label="Facturas" />
                <SideSubItem to="/pos/cotizaciones" Icon={FileText} label="Cotizaciones" />
                <SideSubItem to="/pos/clientes" Icon={ContactRound} label="Clientes" />
              </SideCollapsible>
            </>
          ) : null}

          {/* — Análisis — */}
          {(can('estadisticas') || can('reportes')) ? (
            <>
              <NavSection label="Análisis" wide={sidebarWide} />
              {can('estadisticas') ? (
                <SideNavItem
                  to="/estadisticas"
                  Icon={TrendingUp}
                  label="Estadísticas"
                  wide={sidebarWide}
                  isActive={navEstadisticasActivo}
                />
              ) : null}
              {can('reportes') ? (
                <SideNavItem
                  to="/reportes"
                  Icon={FileText}
                  label="Reportes"
                  wide={sidebarWide}
                  isActive={navReportesActivo}
                />
              ) : null}
            </>
          ) : null}

          {/* — Configuración — */}
          {!modoPanel ? (
            <>
              <NavSection label="Configuración" wide={sidebarWide} />
              <SideCollapsible
                Icon={Users}
                label="Usuario"
                wide={sidebarWide}
                open={usuarioOpen}
                onToggle={() => setUsuarioOpen((o) => !o)}
                isActive={navUsuarioActivo}
                onCollapsedClick={() => navigate('/usuario/crear')}
              >
                <SideSubItem to="/usuario/crear" Icon={UserPlus} label="Crear usuario" />
              </SideCollapsible>
            </>
          ) : null}

          {/* Spacer */}
          <div className="flex-1" />

          {/* Cerrar sesión */}
          <button
            type="button"
            onClick={logout}
            title="Cerrar sesión"
            className={[
              'relative z-10 mt-2 flex items-center gap-3 rounded-xl transition-all duration-150',
              'text-gray-600 hover:bg-red-50 hover:text-red-600',
              sidebarWide ? 'px-3 py-2.5' : 'justify-center py-2.5',
            ].join(' ')}
          >
            <LogOut size={17} strokeWidth={1.75} className="shrink-0" aria-hidden />
            {sidebarWide ? <span className="text-sm font-medium">Cerrar sesión</span> : null}
          </button>
        </div>

        {/* ── Perfil de usuario (pie del sidebar) ──────────────────────────── */}
        {sidebarWide ? (
          <div className="shrink-0 px-3 py-3" style={{ borderTop: '1px solid #E4E8F2' }}>
            <div className="flex items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-gray-50">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-red-600 to-red-900 text-[12px] font-bold text-white">
                {initials}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px] font-semibold text-gray-800">
                  {profile?.personnel_nombre_completo?.trim() || profile?.username || '—'}
                </p>
                <p className="truncate text-[10px] text-gray-500">
                  {modoPanel ? 'Panel tienda' : profile?.is_superuser ? 'Superusuario' : profile?.is_staff ? 'Staff' : 'Usuario'}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="shrink-0 flex justify-center py-3" style={{ borderTop: '1px solid #E4E8F2' }}>
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-red-600 to-red-900 text-[12px] font-bold text-white">
              {initials}
            </div>
          </div>
        )}
      </aside>

      {/* ══ WRAPPER DERECHO ════════════════════════════════════════════════ */}
      <div
        className="flex min-h-screen flex-1 flex-col transition-[padding-left] duration-200 ease-out"
        style={{ paddingLeft: sidebarWide ? '17rem' : '3.75rem' }}
      >

        {/* ══ HEADER ═════════════════════════════════════════════════════════ */}
        <header className="sticky top-0 z-[40] flex h-[3.75rem] shrink-0 items-center gap-3 border-b border-app-border bg-white/85 px-4 shadow-nav backdrop-blur-md sm:px-5">

          {/* Toggle sidebar */}
          <button
            type="button"
            onClick={toggleSidebarWide}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-app-border text-app-muted transition hover:bg-app-bg hover:text-app-text"
            aria-expanded={sidebarWide}
            aria-label={sidebarWide ? 'Contraer menú' : 'Expandir menú'}
          >
            <Menu size={18} strokeWidth={1.75} aria-hidden />
          </button>

          {/* Breadcrumb / título */}
          <div className="flex min-w-0 flex-1 items-center gap-2 text-sm">
            <span className="hidden text-app-subtle sm:inline">IXMUCANE</span>
            <ChevronRight size={14} className="hidden shrink-0 text-app-subtle sm:block" aria-hidden />
            <span className="truncate font-semibold text-app-text">{pageTitle}</span>
          </div>

          {/* Carrito (modo panel) */}
          {modoPanel && can('inventario') ? (
            <button
              type="button"
              onClick={() => navigate('/carrito')}
              className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-app-border text-app-muted transition hover:bg-app-bg hover:text-app-text"
              aria-label={`Carrito${unidadesCarrito > 0 ? ` · ${unidadesCarrito} uds` : ''}`}
            >
              <ShoppingCart size={17} strokeWidth={1.75} aria-hidden />
              {unidadesCarrito > 0 ? (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-500 px-0.5 text-[9px] font-bold text-white">
                  {unidadesCarrito > 99 ? '99+' : unidadesCarrito}
                </span>
              ) : null}
            </button>
          ) : null}

          {/* Acceso rápido al POS */}
          {can('pos') && !modoPanel ? (
            <button
              type="button"
              onClick={() => navigate('/pos/vender')}
              className="flex h-9 items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 text-xs font-bold text-red-700 transition hover:bg-red-100"
              aria-label="Abrir POS"
            >
              <Store size={15} strokeWidth={2} aria-hidden />
              <span className="hidden sm:inline">POS</span>
            </button>
          ) : null}

          {/* Campana notificaciones (placeholder visual) */}
          <button
            type="button"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-app-border text-app-muted transition hover:bg-app-bg hover:text-app-text"
            aria-label="Notificaciones"
          >
            <Bell size={17} strokeWidth={1.75} aria-hidden />
          </button>

          {/* Avatar de usuario con dropdown */}
          <div className="relative shrink-0" ref={userMenuRef}>
            <button
              type="button"
              onClick={() => setUserMenuOpen((o) => !o)}
              className="flex h-9 items-center gap-2 rounded-xl border border-app-border bg-app-surface px-2.5 shadow-sm transition hover:border-app-border-strong hover:bg-app-bg"
              aria-expanded={userMenuOpen}
              aria-haspopup="menu"
            >
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-800 text-[10px] font-bold text-white">
                {initials}
              </div>
              <span className="hidden max-w-[9rem] truncate text-xs font-medium text-app-text sm:block">
                {profile?.username ?? '—'}
              </span>
              <ChevronDown
                size={13}
                className={`shrink-0 text-app-muted transition-transform duration-200 ${userMenuOpen ? 'rotate-180' : ''}`}
                aria-hidden
              />
            </button>

            {userMenuOpen ? (
              <div
                role="menu"
                className="absolute right-0 top-full z-[50] mt-2 w-52 animate-slide-up overflow-hidden rounded-2xl border border-app-border bg-white shadow-modal"
              >
                <div className="border-b border-app-border px-3 py-2.5">
                  <p className="text-[11px] font-semibold text-app-text">
                    {profile?.personnel_nombre_completo?.trim() || profile?.username || '—'}
                  </p>
                  <p className="text-[10px] text-app-muted">{profile?.username ?? ''}</p>
                </div>
                <div className="p-1">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={openPasswordModal}
                    className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm text-app-text transition hover:bg-app-bg"
                  >
                    <KeyRound size={15} className="shrink-0 text-app-muted" aria-hidden />
                    Cambiar contraseña
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => { setUserMenuOpen(false); logout() }}
                    className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm text-app-text transition hover:bg-red-50"
                  >
                    <LogOut size={15} className="shrink-0 text-red-500" aria-hidden />
                    Cerrar sesión
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => { setUserMenuOpen(false); logout() }}
                    className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm text-app-text transition hover:bg-app-bg"
                  >
                    <LogIn size={15} className="shrink-0 text-app-muted" aria-hidden />
                    Cambiar usuario
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </header>

        {/* ══ CONTENIDO ══════════════════════════════════════════════════════ */}
        <main className="flex min-h-0 flex-1 flex-col">
          <div className="flex flex-1 flex-col gap-4 p-4 sm:p-5 lg:p-6">
            <Outlet />
          </div>
        </main>
      </div>

      {/* Carrito flotante en inventario */}
      {mostrarCarritoFlotante && modoPanel ? (
        <button
          type="button"
          onClick={() => navigate('/carrito')}
          className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-brand-500 text-white shadow-brand-glow transition hover:bg-brand-600"
          aria-label="Ir al carrito"
        >
          <ShoppingCart size={22} strokeWidth={2} aria-hidden />
        </button>
      ) : null}

      {/* ══ MODAL CAMBIAR CONTRASEÑA ════════════════════════════════════════ */}
      {pwdModalOpen ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pwd-modal-title"
        >
          <form
            onSubmit={submitPasswordChange}
            className="w-full max-w-sm animate-slide-up overflow-hidden rounded-2xl border border-app-border bg-white shadow-modal"
          >
            {/* Barra de acento */}
            <div
              className="h-[3px]"
              style={{ background: 'linear-gradient(90deg, #DC2626 0%, #F59E0B 100%)' }}
              aria-hidden
            />
            <div className="flex items-center justify-between border-b border-app-border px-5 py-4">
              <div>
                <h2 id="pwd-modal-title" className="text-sm font-semibold text-app-text">Cambiar contraseña</h2>
                <p className="text-xs text-app-muted">Mínimo 8 caracteres</p>
              </div>
              <button
                type="button"
                onClick={() => { setPwdModalOpen(false); setPwdError('') }}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-app-muted transition hover:bg-app-bg hover:text-app-text"
              >
                <X size={15} />
              </button>
            </div>
            <div className="space-y-3 px-5 py-4">
              {(['Contraseña actual', 'Nueva contraseña', 'Confirmar nueva'] as const).map((label, i) => (
                <div key={label}>
                  <label className="mb-1.5 block text-xs font-semibold text-app-muted">{label}</label>
                  <input
                    type="password"
                    autoComplete={i === 0 ? 'current-password' : 'new-password'}
                    value={i === 0 ? pwdOld : i === 1 ? pwdNew : pwdConfirm}
                    onChange={(e) => {
                      const v = e.target.value
                      if (i === 0) setPwdOld(v)
                      else if (i === 1) setPwdNew(v)
                      else setPwdConfirm(v)
                    }}
                    className="input-base"
                    required
                    minLength={i === 0 ? undefined : 8}
                  />
                </div>
              ))}
              {pwdError ? <p className="text-xs font-medium text-brand-600">{pwdError}</p> : null}
            </div>
            <div className="flex justify-end gap-2 border-t border-app-border px-5 py-3">
              <button
                type="button"
                onClick={() => { setPwdModalOpen(false); setPwdError('') }}
                className="btn-ghost py-2 text-xs"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={changePasswordMutation.isPending}
                className="btn-primary py-2 text-xs disabled:opacity-60"
              >
                {changePasswordMutation.isPending ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  )
}
