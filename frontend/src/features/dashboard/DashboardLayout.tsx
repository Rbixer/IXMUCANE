import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  LayoutDashboard,
  Boxes,
  ShoppingCart,
  LogOut,
  ChevronDown,
  KeyRound,
  UserCircle,
  LogIn,
  Menu,
  Store,
  Server,
  Truck,
  ClipboardList,
  FolderInput,
  BarChart3,
  LineChart,
  Presentation,
  Package,
  FileText,
  Receipt,
  UserPlus,
  Users,
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
import { BrandLogoMark } from '../../shared/ui/BrandLogoMark'

const dashboardLink = { to: '/dashboard', label: 'Dashboard', Icon: LayoutDashboard }

const SIDEBAR_EXPANDED_KEY = 'boutique_sidebar_expanded'

function readSidebarExpanded(): boolean {
  if (typeof localStorage === 'undefined') return true
  return localStorage.getItem(SIDEBAR_EXPANDED_KEY) !== '0'
}

/** Título contextual en la barra superior (patrón Materially). */
function dashboardPageTitle(pathname: string): string {
  if (pathname === '/dashboard') return 'Dashboard'
  if (pathname.startsWith('/ventas')) return 'Ventas'
  if (pathname.startsWith('/proveedores')) return 'Proveedores'
  if (pathname.startsWith('/inventario/stock')) return 'Stock'
  if (pathname.startsWith('/inventario/categorias')) return 'Inventario · Categorías'
  if (pathname.startsWith('/inventario/pedidos')) return 'Inventario · Pedidos'
  if (pathname.startsWith('/inventario/productos')) return 'Inventario · Productos'
  if (pathname === '/inventario') return 'Inventario · Productos'
  if (pathname.startsWith('/inventario/ropa-dama')) return 'Inventario · Productos'
  if (pathname.startsWith('/inventario/ropa-caballero')) return 'Inventario · Productos'
  if (pathname.startsWith('/inventario')) return 'Inventario'
  if (pathname.startsWith('/estadisticas/metricas-ventas')) return 'Estadísticas · Métricas'
  if (pathname.startsWith('/estadisticas/graficos-ventas')) return 'Estadísticas · Gráficos'
  if (pathname.startsWith('/estadisticas/power-bi')) return 'Estadísticas · Power BI'
  if (pathname.startsWith('/estadisticas')) return 'Estadísticas'
  if (pathname.startsWith('/reportes/inventario')) return 'Reportes · Inventario general'
  if (pathname.startsWith('/reportes/sistema-pos')) return 'Reportes · Sistema POS'
  if (pathname.startsWith('/reportes')) return 'Reportes'
  if (pathname.startsWith('/pos/vender')) return 'POS · Vender'
  if (pathname.startsWith('/pos/facturas')) return 'POS · Facturas'
  if (pathname.startsWith('/pos')) return 'POS'
  if (pathname.startsWith('/usuario/crear')) return 'Usuario · Crear usuario'
  if (pathname.startsWith('/usuario')) return 'Usuario'
  if (pathname.startsWith('/carrito')) return 'Carrito'
  return 'Panel'
}

export function DashboardLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const DashboardNavIcon = dashboardLink.Icon

  const [posOpen, setPosOpen] = useState(() => location.pathname.startsWith('/pos'))
  const [usuarioOpen, setUsuarioOpen] = useState(() => location.pathname.startsWith('/usuario'))
  const [inventarioOpen, setInventarioOpen] = useState(() => location.pathname.startsWith('/inventario'))
  const [estadisticasOpen, setEstadisticasOpen] = useState(() => location.pathname.startsWith('/estadisticas'))
  const [reportesOpen, setReportesOpen] = useState(() => location.pathname.startsWith('/reportes'))
  const mostrarEncabezadoPanel = location.pathname === '/dashboard'
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
    document.title = `${dashboardPageTitle(location.pathname)} · ALUMINIOS IXMUCANE`
  }, [location.pathname])

  const textoNombreCompleto = profile?.personnel_nombre_completo?.trim() || '—'
  const textoCodigo = profile?.personnel_codigo?.trim() || '—'
  const textoUsuario = profile?.username ?? '—'
  const enInventarioProductos =
    location.pathname.startsWith('/inventario') &&
    !location.pathname.includes('/inventario/stock')
  const mostrarCarritoFlotante =
    enInventarioProductos && !mostrarEncabezadoPanel && !modoPanel

  const proveedoresNavActivo = location.pathname.startsWith('/proveedores')

  useEffect(() => {
    if (location.pathname.startsWith('/pos')) setPosOpen(true)
  }, [location.pathname])

  useEffect(() => {
    if (location.pathname.startsWith('/usuario')) setUsuarioOpen(true)
  }, [location.pathname])

  useEffect(() => {
    if (location.pathname.startsWith('/inventario')) setInventarioOpen(true)
  }, [location.pathname])

  useEffect(() => {
    if (location.pathname.startsWith('/estadisticas')) setEstadisticasOpen(true)
  }, [location.pathname])

  useEffect(() => {
    if (location.pathname.startsWith('/reportes')) setReportesOpen(true)
  }, [location.pathname])

  useEffect(() => {
    if (!modoPanel) return
    if (location.pathname.startsWith('/usuario')) {
      navigate('/dashboard', { replace: true })
      return
    }
    if (!profileQuery.isSuccess) return
    const req = pathRequiresModule(location.pathname)
    if (req != null && !modulosPanelSet?.has(req)) {
      navigate('/dashboard', { replace: true })
    }
  }, [location.pathname, modoPanel, profileQuery.isSuccess, modulosPanelSet, navigate])

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

  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const userMenuRef = useRef<HTMLDivElement>(null)
  const [pwdModalOpen, setPwdModalOpen] = useState(false)
  const [pwdOld, setPwdOld] = useState('')
  const [pwdNew, setPwdNew] = useState('')
  const [pwdConfirm, setPwdConfirm] = useState('')
  const [pwdError, setPwdError] = useState('')

  useEffect(() => {
    if (!userMenuOpen) return
    const onDoc = (e: MouseEvent) => {
      if (userMenuRef.current?.contains(e.target as Node)) return
      setUserMenuOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [userMenuOpen])

  const changePasswordMutation = useMutation({
    mutationFn: () =>
      changePasswordRequest({
        old_password: pwdOld,
        new_password: pwdNew,
        new_password_confirm: pwdConfirm,
      }),
    onSuccess: () => {
      setPwdModalOpen(false)
      setPwdOld('')
      setPwdNew('')
      setPwdConfirm('')
      setPwdError('')
    },
    onError: (err: unknown) => setPwdError(formatApiError(err)),
  })

  const openPasswordModal = () => {
    setUserMenuOpen(false)
    setPwdError('')
    setPwdOld('')
    setPwdNew('')
    setPwdConfirm('')
    setPwdModalOpen(true)
  }

  const submitPasswordChange = (e: FormEvent) => {
    e.preventDefault()
    setPwdError('')
    if (pwdNew.length < 8) {
      setPwdError('La nueva contraseña debe tener al menos 8 caracteres.')
      return
    }
    if (pwdNew !== pwdConfirm) {
      setPwdError('La confirmación no coincide con la nueva contraseña.')
      return
    }
    changePasswordMutation.mutate()
  }

  const irOtroUsuario = () => {
    setUserMenuOpen(false)
    logout()
  }

  const [sidebarExpanded, setSidebarExpanded] = useState(readSidebarExpanded)
  const toggleSidebarExpanded = () => {
    setSidebarExpanded((prev) => {
      const next = !prev
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(SIDEBAR_EXPANDED_KEY, next ? '1' : '0')
      }
      return next
    })
  }

  const navInventarioActivo = location.pathname.startsWith('/inventario')
  const navEstadisticasActivo = location.pathname.startsWith('/estadisticas')
  const navReportesActivo = location.pathname.startsWith('/reportes')
  const navPosActivo = location.pathname.startsWith('/pos')
  const navUsuarioActivo = location.pathname.startsWith('/usuario')
  const defaultInventarioTo = '/inventario/productos'

  const reportesSub = useMemo(
    () =>
      [
        { to: '/reportes/inventario', label: 'Inventario general', Icon: Boxes },
        { to: '/reportes/sistema-pos', label: 'Sistema POS', Icon: Server },
      ] as const,
    [],
  )
  const defaultReportesTo = reportesSub[0]?.to ?? '/reportes/inventario'

  const posMenuSub = useMemo(
    () =>
      [
        { to: '/pos/vender', label: 'Vender', Icon: ShoppingCart },
        { to: '/pos/facturas', label: 'Facturas', Icon: Receipt },
      ] as const,
    [],
  )
  const defaultPosTo = posMenuSub[0]?.to ?? '/pos/vender'

  const usuarioMenuSub = useMemo(
    () => [{ to: '/usuario/crear', label: 'Crear usuario', Icon: UserPlus }] as const,
    [],
  )
  const defaultUsuarioTo = usuarioMenuSub[0]?.to ?? '/usuario/crear'

  const inventarioSub = useMemo(
    () =>
      [
        { to: '/inventario/productos', label: 'Productos', Icon: Package },
        { to: '/inventario/pedidos', label: 'Pedidos', Icon: ClipboardList },
        { to: '/inventario/categorias', label: 'Categorías', Icon: FolderInput },
      ] as const,
    [],
  )

  const estadisticasSub = useMemo(
    () =>
      [
        { to: '/estadisticas/metricas-ventas', label: 'Métricas ventas', Icon: BarChart3 },
        { to: '/estadisticas/graficos-ventas', label: 'Gráficos ventas', Icon: LineChart },
        { to: '/estadisticas/power-bi', label: 'Power BI', Icon: Presentation },
      ] as const,
    [],
  )
  const defaultEstadisticasTo = estadisticasSub[0]?.to ?? '/estadisticas/metricas-ventas'

  const inicioActivo = location.pathname === '/dashboard'
  const btnHeaderBase =
    'inline-flex shrink-0 items-center justify-center rounded-md border border-material-outline-strong bg-material-surface px-2.5 py-1 text-xs font-semibold text-material-emphasis shadow-sm transition hover:bg-material-surface-variant sm:px-3 sm:text-sm'

  /** Activo estilo Materially: tinte suave del color primario (boutique). */
  const navActiveFill = 'bg-boutique-50 text-boutique-700 font-semibold'
  const navInactive = 'text-material-muted hover:bg-material-surface-variant'

  return (
    <div className="flex min-h-screen flex-row bg-material-canvas text-material-emphasis antialiased">
      <div
        className={`flex shrink-0 flex-col border-r border-material-outline-strong transition-[width] duration-200 ease-out ${
          sidebarExpanded ? 'w-[min(100%,18rem)] sm:w-72' : 'w-14'
        }`}
      >
        <aside
          className="min-h-screen w-full overflow-y-auto overflow-x-hidden border-y-0 border-l-0 border-r border-material-outline bg-material-surface text-material-emphasis shadow-[2px_0_12px_rgba(15,23,42,0.05)]"
        >
            <div
              className={`border-b border-material-outline bg-material-surface py-2 ${sidebarExpanded ? 'pl-2 pr-2' : 'pl-1.5 pr-1.5'}`}
            >
              <div className="flex w-full min-w-0 items-center justify-start gap-2">
                <BrandLogoMark size="xs" className="shrink-0" />
                {sidebarExpanded ? (
                  <div className="min-w-0 flex-1 leading-tight">
                    <p className="truncate text-xs font-bold uppercase tracking-wide text-neutral-900 sm:text-[13px]">
                      ALUMINIOS IXMUCANE
                    </p>
                    <p className="truncate text-[11px] font-semibold text-boutique-500 sm:text-xs">
                      {modoPanel ? 'Consulta' : 'Administración'}
                    </p>
                  </div>
                ) : null}
              </div>
              {modoPanel && sidebarExpanded ? (
                <div className="mt-2 space-y-1 border-t border-material-outline pt-2 text-[11px] leading-snug text-material-emphasis sm:text-xs">
                  <p className="truncate">
                    <span className="font-semibold">Nombre:</span> {textoNombreCompleto}
                  </p>
                  <p className="truncate">
                    <span className="font-semibold">Código:</span> {textoCodigo}{' '}
                    <span className="text-material-outline-strong">|</span>{' '}
                    <span className="font-semibold">Usuario:</span> {textoUsuario}
                  </p>
                  {profile?.personnel_branch_name?.trim() ? (
                    <p className="truncate">
                      <span className="font-semibold">Asignado:</span>{' '}
                      {profile.personnel_branch_name.trim()}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
            {sidebarExpanded ? (
              <div className="border-b border-material-outline bg-material-surface-variant px-2 py-1.5">
                <p className="text-center text-[10px] font-medium leading-snug text-material-muted">
                  {modoPanel ? 'Inventario en consulta y carrito' : 'Inventario, stock y POS.'}
                </p>
              </div>
            ) : (
              <div className="h-0.5 shrink-0 bg-boutique-500/85 lg:block" aria-hidden />
            )}
            <div className={sidebarExpanded ? 'p-3' : 'p-1.5 lg:px-1 lg:py-2'}>
              <nav className="space-y-1">
                <NavLink
                  to={dashboardLink.to}
                  title={dashboardLink.label}
                  className={({ isActive }) =>
                    `flex items-center rounded-lg py-2 text-sm ${
                      sidebarExpanded ? 'justify-start gap-2 px-3' : 'justify-center px-0 lg:px-0'
                    } ${isActive ? navActiveFill : navInactive}`
                  }
                >
                  <DashboardNavIcon size={16} className="shrink-0" />
                  {sidebarExpanded ? dashboardLink.label : null}
                </NavLink>

                {can('proveedores') ? (
                  <div className="pt-1">
                    <NavLink
                      to="/proveedores"
                      title="Proveedores"
                      className={({ isActive }) =>
                        `flex items-center rounded-lg py-2 text-sm font-medium ${
                          sidebarExpanded ? 'justify-start gap-2 px-3' : 'justify-center px-0'
                        } ${isActive ? navActiveFill : navInactive}`
                      }
                    >
                      <Truck size={16} className="shrink-0" aria-hidden />
                      {sidebarExpanded ? <span className="truncate">Proveedores</span> : null}
                    </NavLink>
                  </div>
                ) : null}

                {can('inventario') ? (
                  <div className="pt-1">
                    {sidebarExpanded ? (
                      <button
                        type="button"
                        onClick={() => setInventarioOpen((o) => !o)}
                        aria-expanded={inventarioOpen}
                        className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium ${
                          navInventarioActivo ? navActiveFill : navInactive
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          <Boxes size={16} aria-hidden />
                          Inventario
                        </span>
                        <ChevronDown
                          size={16}
                          className={`shrink-0 transition-transform ${inventarioOpen ? 'rotate-180' : ''}`}
                          aria-hidden
                        />
                      </button>
                    ) : (
                      <button
                        type="button"
                        title="Inventario"
                        onClick={() => navigate(defaultInventarioTo)}
                        className={`flex w-full items-center justify-center rounded-lg py-2 ${
                          navInventarioActivo ? navActiveFill : navInactive
                        }`}
                      >
                        <Boxes size={16} aria-hidden />
                      </button>
                    )}
                    {sidebarExpanded && inventarioOpen ? (
                      <div className="mt-1 space-y-0.5 border-l-2 border-material-outline-strong pl-2" aria-label="Inventario">
                        {inventarioSub.map(({ to, label, Icon }) => {
                          let subActive = false
                          if (label === 'Productos') {
                            subActive =
                              location.pathname === '/inventario/productos' || location.pathname === '/inventario'
                          } else if (label === 'Pedidos') {
                            subActive = location.pathname.startsWith('/inventario/pedidos')
                          } else if (label === 'Categorías') {
                            subActive = location.pathname.startsWith('/inventario/categorias')
                          }
                          return (
                            <NavLink
                              key={to}
                              to={to}
                              title={label}
                              className={`flex items-center gap-2 rounded-lg px-2 py-2 text-xs font-medium ${
                                subActive ? 'bg-boutique-50 text-boutique-600' : 'text-material-muted hover:bg-material-surface-variant'
                              }`}
                            >
                              <Icon size={15} className="shrink-0" aria-hidden />
                              {label}
                            </NavLink>
                          )
                        })}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {can('estadisticas') ? (
                  <div className="pt-1">
                    {sidebarExpanded ? (
                      <button
                        type="button"
                        onClick={() => setEstadisticasOpen((o) => !o)}
                        aria-expanded={estadisticasOpen}
                        className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium ${
                          navEstadisticasActivo ? navActiveFill : navInactive
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          <BarChart3 size={16} aria-hidden />
                          Estadísticas
                        </span>
                        <ChevronDown
                          size={16}
                          className={`shrink-0 transition-transform ${estadisticasOpen ? 'rotate-180' : ''}`}
                          aria-hidden
                        />
                      </button>
                    ) : (
                      <button
                        type="button"
                        title="Estadísticas"
                        onClick={() => navigate(defaultEstadisticasTo)}
                        className={`flex w-full items-center justify-center rounded-lg py-2 ${
                          navEstadisticasActivo ? navActiveFill : navInactive
                        }`}
                      >
                        <BarChart3 size={16} aria-hidden />
                      </button>
                    )}
                    {sidebarExpanded && estadisticasOpen ? (
                      <div className="mt-1 space-y-0.5 border-l-2 border-material-outline-strong pl-2" aria-label="Estadísticas">
                        {estadisticasSub.map(({ to, label, Icon }) => (
                          <NavLink
                            key={to}
                            to={to}
                            end
                            title={label}
                            className={({ isActive }) =>
                              `flex items-center gap-2 rounded-lg px-2 py-2 text-xs font-medium ${
                                isActive ? 'bg-boutique-50 text-boutique-600' : 'text-material-muted hover:bg-material-surface-variant'
                              }`
                            }
                          >
                            <Icon size={15} className="shrink-0" aria-hidden />
                            {label}
                          </NavLink>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {can('reportes') ? (
                    <div className="pt-1">
                      {sidebarExpanded ? (
                        <button
                          type="button"
                          onClick={() => setReportesOpen((o) => !o)}
                          aria-expanded={reportesOpen}
                          className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium ${
                            navReportesActivo ? navActiveFill : navInactive
                          }`}
                        >
                          <span className="flex items-center gap-2">
                            <FileText size={16} aria-hidden />
                            Reportes
                          </span>
                          <ChevronDown
                            size={16}
                            className={`shrink-0 transition-transform ${reportesOpen ? 'rotate-180' : ''}`}
                            aria-hidden
                          />
                        </button>
                      ) : (
                        <button
                          type="button"
                          title="Reportes"
                          onClick={() => navigate(defaultReportesTo)}
                          className={`flex w-full items-center justify-center rounded-lg py-2 ${
                            navReportesActivo ? navActiveFill : navInactive
                          }`}
                        >
                          <FileText size={16} aria-hidden />
                        </button>
                      )}
                      {sidebarExpanded && reportesOpen ? (
                        <div className="mt-1 space-y-0.5 border-l-2 border-material-outline-strong pl-2" aria-label="Reportes">
                          {reportesSub.map(({ to, label, Icon }) => (
                            <NavLink
                              key={to}
                              to={to}
                              end
                              title={label}
                              className={({ isActive }) =>
                                `flex items-center gap-2 rounded-lg px-2 py-2 text-xs font-medium ${
                                  isActive ? 'bg-boutique-50 text-boutique-600' : 'text-material-muted hover:bg-material-surface-variant'
                                }`
                              }
                            >
                              <Icon size={15} className="shrink-0" aria-hidden />
                              {label}
                            </NavLink>
                          ))}
                        </div>
                      ) : null}
                    </div>
                ) : null}

                {can('pos') ? (
                    <div className="pt-1">
                      {sidebarExpanded ? (
                        <button
                          type="button"
                          onClick={() => setPosOpen((o) => !o)}
                          aria-expanded={posOpen}
                          className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium ${
                            navPosActivo ? navActiveFill : navInactive
                          }`}
                        >
                          <span className="flex items-center gap-2">
                            <Store size={16} aria-hidden />
                            POS
                          </span>
                          <ChevronDown
                            size={16}
                            className={`shrink-0 transition-transform ${posOpen ? 'rotate-180' : ''}`}
                            aria-hidden
                          />
                        </button>
                      ) : (
                        <button
                          type="button"
                          title="POS"
                          onClick={() => navigate(defaultPosTo)}
                          className={`flex w-full items-center justify-center rounded-lg py-2 ${
                            navPosActivo ? navActiveFill : navInactive
                          }`}
                        >
                          <Store size={16} aria-hidden />
                        </button>
                      )}
                      {sidebarExpanded && posOpen ? (
                        <div className="mt-1 space-y-0.5 border-l-2 border-material-outline-strong pl-2" aria-label="POS">
                          {posMenuSub.map(({ to, label, Icon }) => (
                            <NavLink
                              key={to}
                              to={to}
                              end={to === '/pos/vender'}
                              title={label}
                              className={({ isActive }) =>
                                `flex items-center gap-2 rounded-lg px-2 py-2 text-xs font-medium ${
                                  isActive ? 'bg-boutique-50 text-boutique-600' : 'text-material-muted hover:bg-material-surface-variant'
                                }`
                              }
                            >
                              <Icon size={15} className="shrink-0" aria-hidden />
                              {label}
                            </NavLink>
                          ))}
                        </div>
                      ) : null}
                    </div>
                ) : null}

                {!modoPanel ? (
                    <div className="pt-1">
                      {sidebarExpanded ? (
                        <button
                          type="button"
                          onClick={() => setUsuarioOpen((o) => !o)}
                          aria-expanded={usuarioOpen}
                          className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium ${
                            navUsuarioActivo ? navActiveFill : navInactive
                          }`}
                        >
                          <span className="flex items-center gap-2">
                            <Users size={16} aria-hidden />
                            Usuario
                          </span>
                          <ChevronDown
                            size={16}
                            className={`shrink-0 transition-transform ${usuarioOpen ? 'rotate-180' : ''}`}
                            aria-hidden
                          />
                        </button>
                      ) : (
                        <button
                          type="button"
                          title="Usuario"
                          onClick={() => navigate(defaultUsuarioTo)}
                          className={`flex w-full items-center justify-center rounded-lg py-2 ${
                            navUsuarioActivo ? navActiveFill : navInactive
                          }`}
                        >
                          <Users size={16} aria-hidden />
                        </button>
                      )}
                      {sidebarExpanded && usuarioOpen ? (
                        <div
                          className="mt-1 space-y-0.5 border-l-2 border-material-outline-strong pl-2"
                          aria-label="Usuario"
                        >
                          {usuarioMenuSub.map(({ to, label, Icon }) => (
                            <NavLink
                              key={to}
                              to={to}
                              title={label}
                              className={({ isActive }) =>
                                `flex items-center gap-2 rounded-lg px-2 py-2 text-xs font-medium ${
                                  isActive ? 'bg-boutique-50 text-boutique-600' : 'text-material-muted hover:bg-material-surface-variant'
                                }`
                              }
                            >
                              <Icon size={15} className="shrink-0" aria-hidden />
                              {label}
                            </NavLink>
                          ))}
                        </div>
                      ) : null}
                    </div>
                ) : null}
              </nav>
            </div>
          </aside>
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-material-canvas">
        <header className="sticky top-0 z-40 flex h-10 shrink-0 items-stretch border-b border-material-outline bg-material-surface shadow-material-nav sm:h-11">
          <button
            type="button"
            onClick={toggleSidebarExpanded}
            className="flex w-10 shrink-0 items-center justify-center border-r border-material-outline bg-material-surface text-boutique-500 transition hover:bg-material-surface-variant sm:w-11"
            aria-expanded={sidebarExpanded}
            aria-label={sidebarExpanded ? 'Reducir menú lateral' : 'Ampliar menú lateral'}
            title={sidebarExpanded ? 'Solo iconos' : 'Mostrar nombres'}
          >
            <Menu size={22} strokeWidth={2.25} aria-hidden />
          </button>
            <div className="flex min-w-0 flex-1 items-center justify-between gap-2 px-2 sm:px-3">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5 sm:gap-2">
              <button
                type="button"
                onClick={() => navigate('/dashboard')}
                className={`${btnHeaderBase} ${
                  inicioActivo
                    ? 'border-boutique-500 bg-boutique-500 text-white shadow-sm hover:bg-boutique-600'
                    : ''
                }`}
              >
                Inicio
              </button>
              {can('proveedores') ? (
                <button
                  type="button"
                  onClick={() => navigate('/proveedores')}
                  className={`${btnHeaderBase} ${
                    proveedoresNavActivo
                      ? 'border-boutique-500 bg-boutique-500 text-white shadow-sm hover:bg-boutique-600'
                      : ''
                  }`}
                >
                  Proveedores
                </button>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
              {modoPanel && can('inventario') ? (
                <button
                  type="button"
                  onClick={() => navigate('/carrito')}
                  className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-boutique-100 bg-material-surface text-boutique-500 shadow-sm transition hover:bg-boutique-50 sm:h-9 sm:w-9"
                  aria-label={`Carrito${unidadesCarrito > 0 ? `, ${unidadesCarrito} unidades` : ''}`}
                  title="Carrito"
                >
                  <ShoppingCart size={18} strokeWidth={2.25} aria-hidden />
                  {unidadesCarrito > 0 ? (
                    <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-boutique-500 px-0.5 text-[9px] font-bold text-white">
                      {unidadesCarrito > 99 ? '99+' : unidadesCarrito}
                    </span>
                  ) : null}
                </button>
              ) : null}
              <div className="relative shrink-0" ref={userMenuRef}>
              <button
                type="button"
                onClick={() => setUserMenuOpen((o) => !o)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-boutique-100 bg-material-surface text-boutique-500 shadow-sm transition hover:bg-boutique-50 sm:h-9 sm:w-9"
                aria-expanded={userMenuOpen}
                aria-haspopup="menu"
                aria-label="Menú de usuario"
              >
                <UserCircle size={20} strokeWidth={2} aria-hidden />
              </button>
              {userMenuOpen ? (
                <div
                  role="menu"
                  className="absolute right-0 top-full z-50 mt-1 w-[min(100vw-1rem,13.5rem)] rounded-lg border border-material-outline bg-material-surface py-1 text-sm shadow-lg"
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={openPasswordModal}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-material-emphasis hover:bg-boutique-50"
                  >
                    <KeyRound size={16} className="shrink-0 text-boutique-500" aria-hidden />
                    Cambiar contraseña
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setUserMenuOpen(false)
                      logout()
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-material-emphasis hover:bg-boutique-50"
                  >
                    <LogOut size={16} className="shrink-0 text-boutique-500" aria-hidden />
                    Cerrar sesión
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={irOtroUsuario}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-material-emphasis hover:bg-boutique-50"
                  >
                    <LogIn size={16} className="shrink-0 text-boutique-500" aria-hidden />
                    Cambiar de usuario
                  </button>
                </div>
              ) : null}
              </div>
            </div>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 py-4 sm:gap-4 sm:px-4 lg:px-5 lg:py-5">
        <div className={`min-w-0 flex-1 ${mostrarEncabezadoPanel ? 'space-y-6' : ''}`}>
          {mostrarEncabezadoPanel ? (
            <header className="flex items-center justify-between rounded-xl border border-material-outline bg-material-surface px-5 py-4 shadow-material">
              <div className="min-w-0">
                <h1 className="text-xl font-semibold text-material-emphasis">
                  {modoPanel ? 'Panel de tienda' : 'Panel Administrativo'}
                </h1>
                <p className="text-sm text-material-muted">
                  {modoPanel
                    ? 'Consulte inventario y use el carrito si aplica.'
                    : 'Gestion centralizada de inventario y stock.'}
                </p>
              </div>
            </header>
          ) : null}
          <Outlet />
        </div>

        {mostrarCarritoFlotante ? (
          <button
            type="button"
            onClick={() => navigate('/carrito')}
            className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full border border-boutique-100 bg-material-surface text-boutique-500 shadow-lg transition hover:bg-boutique-50"
            aria-label="Ir al carrito"
          >
            <ShoppingCart size={22} strokeWidth={2.25} aria-hidden />
          </button>
        ) : null}
      </div>
      </div>

      {pwdModalOpen ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pwd-modal-title"
        >
          <form
            onSubmit={submitPasswordChange}
            className="w-full max-w-sm rounded-xl border border-material-outline bg-material-surface p-4 shadow-xl"
          >
            <h2 id="pwd-modal-title" className="text-base font-semibold text-material-emphasis">
              Cambiar contraseña
            </h2>
            <p className="mt-1 text-xs text-material-muted">Mínimo 8 caracteres para la nueva contraseña.</p>
            <div className="mt-3 space-y-2">
              <label className="block text-xs font-semibold text-material-emphasis">Contraseña actual</label>
              <input
                type="password"
                autoComplete="current-password"
                value={pwdOld}
                onChange={(e) => setPwdOld(e.target.value)}
                className="w-full rounded-lg border border-material-outline px-2 py-1.5 text-sm"
                required
              />
              <label className="block text-xs font-semibold text-material-emphasis">Nueva contraseña</label>
              <input
                type="password"
                autoComplete="new-password"
                value={pwdNew}
                onChange={(e) => setPwdNew(e.target.value)}
                className="w-full rounded-lg border border-material-outline px-2 py-1.5 text-sm"
                required
                minLength={8}
              />
              <label className="block text-xs font-semibold text-material-emphasis">Confirmar nueva</label>
              <input
                type="password"
                autoComplete="new-password"
                value={pwdConfirm}
                onChange={(e) => setPwdConfirm(e.target.value)}
                className="w-full rounded-lg border border-material-outline px-2 py-1.5 text-sm"
                required
                minLength={8}
              />
            </div>
            {pwdError ? <p className="mt-2 text-xs text-red-600">{pwdError}</p> : null}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setPwdModalOpen(false)
                  setPwdError('')
                }}
                className="rounded-lg border border-material-outline px-3 py-1.5 text-sm font-medium text-material-emphasis hover:bg-material-surface-variant"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={changePasswordMutation.isPending}
                className="rounded-lg bg-boutique-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-boutique-600 disabled:opacity-60"
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
