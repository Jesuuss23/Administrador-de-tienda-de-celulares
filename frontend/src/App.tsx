import { Link, Route, Routes } from 'react-router'
import AccountPage from './pages/AccountPage'
import CatalogPage from './pages/CatalogPage'
import AdminProductsPage from './pages/AdminProductsPage'
import ProductDetailPage from './pages/ProductDetailPage'
import OrdersPage from './pages/OrdersPage'
import OrderDetailPage from './pages/OrderDetailPage'
import AdminFulfillmentsPage from './pages/AdminFulfillmentsPage'
import CartPage from './pages/CartPage'
import AdminWarrantyClaimsPage from "./pages/AdminWarrantyClaimsPage";
import TradeInsPage from "./pages/TradeInsPage";
import AdminTradeInsPage from "./pages/AdminTradeInsPage";
import CreditBalancePage from './pages/CreditBalancePage'
import AdminDashboardPage from './pages/AdminDashboardPage'
import AdminDemandPage from './pages/AdminDemandPage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<CatalogPage />} />
      <Route path="/cuenta" element={<AccountPage />} />
      <Route path="/admin/productos" element={<AdminProductsPage />} />
      <Route path="/productos/:productId" element={<ProductDetailPage />} />
      <Route path="/carrito" element={<CartPage />} />
      <Route path="/pedidos" element={<OrdersPage />} />
      <Route path="/pedidos/:orderId" element={<OrderDetailPage />} />
      <Route path="/admin/entregas" element={<AdminFulfillmentsPage />} />
      <Route path="/admin/garantias" element={<AdminWarrantyClaimsPage />} />
      <Route path="/canjes" element={<TradeInsPage />} />
      <Route path="/admin/canjes" element={<AdminTradeInsPage />} />
      <Route path="/mis-creditos" element={<CreditBalancePage />} />
      <Route path="/admin/resumen" element={<AdminDashboardPage />} />
      <Route path="/admin/demanda" element={<AdminDemandPage />} />
     
      <Route
        path="*"
        element={
          <main className="status-screen">
            <div className="status-card">
              <h1>Esta página no existe</h1>
              <p>Vuelve al catálogo para continuar.</p>
              <Link className="primary-button" to="/">
                Ir al catálogo
              </Link>
            </div>
          </main>
        }
      />
    </Routes>
  )
}