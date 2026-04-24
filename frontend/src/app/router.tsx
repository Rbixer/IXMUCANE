import { Navigate, createBrowserRouter } from 'react-router-dom'
import { LoginPage } from '../features/auth/LoginPage'
import { DashboardLayout } from '../features/dashboard/DashboardLayout'
import { DashboardHomePage } from '../features/dashboard/DashboardHomePage'
import { InventoryPage } from '../features/inventory/InventoryPage'
import { StockPage } from '../features/stock/StockPage'
import { CartPage } from '../features/cart/CartPage'
import { ProveedoresPage } from '../features/suppliers/ProveedoresPage'
import { CategoriasPage } from '../features/inventory/CategoriasPage'
import { PedidosPage } from '../features/inventory/PedidosPage'
import { MetricasVentasPage } from '../features/estadisticas/MetricasVentasPage'
import { GraficosVentasPage } from '../features/estadisticas/GraficosVentasPage'
import { PowerBiPage } from '../features/estadisticas/PowerBiPage'
import { ReportesInventarioPage } from '../features/reportes/ReportesInventarioPage'
import { ReportesSistemaPosPage } from '../features/reportes/ReportesSistemaPosPage'
import { PosVenderPage } from '../features/pos/PosVenderPage'
import { PosFacturasPage } from '../features/pos/PosFacturasPage'
import { CreadorUsuariosPage } from '../features/hr/CreadorUsuariosPage'
import { ProtectedRoute } from './ProtectedRoute'

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <DashboardLayout />,
        children: [
          { path: '/dashboard', element: <DashboardHomePage /> },
          { path: '/ventas', element: <Navigate to="/pos/vender" replace /> },
          { path: '/proveedores', element: <ProveedoresPage /> },
          { path: '/inventario/stock', element: <StockPage /> },
          { path: '/inventario/categorias', element: <CategoriasPage /> },
          { path: '/inventario/pedidos', element: <PedidosPage /> },
          { path: '/inventario/productos', element: <InventoryPage /> },
          { path: '/inventario/ropa-dama', element: <Navigate to="/inventario/productos" replace /> },
          { path: '/inventario/ropa-caballero', element: <Navigate to="/inventario/productos" replace /> },
          { path: '/inventario/:linea', element: <Navigate to="/inventario/productos" replace /> },
          { path: '/inventario', element: <Navigate to="/inventario/productos" replace /> },
          { path: '/estadisticas/metricas-ventas', element: <MetricasVentasPage /> },
          { path: '/estadisticas/graficos-ventas', element: <GraficosVentasPage /> },
          { path: '/estadisticas/power-bi', element: <PowerBiPage /> },
          { path: '/estadisticas', element: <Navigate to="/estadisticas/metricas-ventas" replace /> },
          { path: '/reportes/inventario', element: <ReportesInventarioPage /> },
          { path: '/reportes/sistema-pos', element: <ReportesSistemaPosPage /> },
          { path: '/reportes', element: <Navigate to="/reportes/inventario" replace /> },
          { path: '/pos/vender', element: <PosVenderPage /> },
          { path: '/pos/facturas', element: <PosFacturasPage /> },
          { path: '/pos', element: <Navigate to="/pos/vender" replace /> },
          { path: '/usuario/crear', element: <CreadorUsuariosPage /> },
          { path: '/usuario', element: <Navigate to="/usuario/crear" replace /> },
          { path: '/stock', element: <Navigate to="/inventario/stock" replace /> },
          { path: '/carrito', element: <CartPage /> },
          { path: '/recursos-humanos/*', element: <Navigate to="/dashboard" replace /> },
          { path: '/sistema-pos', element: <Navigate to="/pos/vender" replace /> },
          { path: '/', element: <Navigate to="/dashboard" replace /> },
        ],
      },
    ],
  },
])
