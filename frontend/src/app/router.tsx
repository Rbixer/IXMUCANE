import { Navigate, createBrowserRouter } from 'react-router-dom'
import { LoginPage } from '../features/auth/LoginPage'
import { DashboardLayout } from '../features/dashboard/DashboardLayout'
import { DashboardHomePage } from '../features/dashboard/DashboardHomePage'
import { InventoryPage } from '../features/inventory/InventoryPage'
import { InventarioHomePage } from '../features/inventory/InventarioHomePage'
import { BodegasPage } from '../features/inventory/BodegasPage'
import { StockPage } from '../features/stock/StockPage'
import { CartPage } from '../features/cart/CartPage'
import { ProveedoresPage } from '../features/suppliers/ProveedoresPage'
import { CategoriasPage } from '../features/inventory/CategoriasPage'
import { PedidosPage } from '../features/inventory/PedidosPage'
import { EstadisticasPage } from '../features/estadisticas/EstadisticasPage'
import { ReportesPage } from '../features/reportes/ReportesPage'
import { PosVenderPage } from '../features/pos/PosVenderPage'
import { PosFacturasPage } from '../features/pos/PosFacturasPage'
import { PosCotizacionesPage } from '../features/pos/PosCotizacionesPage'
import { PosClientesPage } from '../features/pos/PosClientesPage'
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
          { path: '/inventario/bodegas', element: <BodegasPage /> },
          { path: '/inventario/ropa-dama', element: <Navigate to="/inventario/productos" replace /> },
          { path: '/inventario/ropa-caballero', element: <Navigate to="/inventario/productos" replace /> },
          { path: '/inventario/:linea', element: <Navigate to="/inventario/productos" replace /> },
          { path: '/inventario', element: <InventarioHomePage /> },
          { path: '/estadisticas', element: <EstadisticasPage /> },
          { path: '/estadisticas/*', element: <Navigate to="/estadisticas" replace /> },
          { path: '/reportes', element: <ReportesPage /> },
          { path: '/reportes/*', element: <Navigate to="/reportes" replace /> },
          { path: '/pos/vender', element: <PosVenderPage /> },
          { path: '/pos/facturas', element: <PosFacturasPage /> },
          { path: '/pos/cotizaciones', element: <PosCotizacionesPage /> },
          { path: '/pos/clientes', element: <PosClientesPage /> },
          { path: '/pos', element: <Navigate to="/pos/vender" replace /> },
          { path: '/usuario/crear', element: <CreadorUsuariosPage /> },
          { path: '/usuario', element: <Navigate to="/usuario/crear" replace /> },
          { path: '/recursos-humanos', element: <Navigate to="/dashboard" replace /> },
          { path: '/recursos-humanos/*', element: <Navigate to="/dashboard" replace /> },
          { path: '/stock', element: <Navigate to="/inventario/stock" replace /> },
          { path: '/carrito', element: <CartPage /> },
          { path: '/sistema-pos', element: <Navigate to="/pos/vender" replace /> },
          { path: '/', element: <Navigate to="/dashboard" replace /> },
        ],
      },
    ],
  },
])
