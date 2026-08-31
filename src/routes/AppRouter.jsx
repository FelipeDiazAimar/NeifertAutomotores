import { lazy } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import PublicLayout from '@/components/layout/PublicLayout'
import AdminLayout from '@/components/layout/AdminLayout'
import ScrollToTop from '@/components/common/ScrollToTop'
import ProtectedRoute from './ProtectedRoute'
import CrmProtectedRoute from '@/crm/routes/CrmProtectedRoute'

// Páginas cargadas bajo demanda (code-splitting por ruta)
const HomePage = lazy(() => import('@/pages/public/HomePage'))
const CatalogPage = lazy(() => import('@/pages/public/CatalogPage'))
const VehicleDetailPage = lazy(() => import('@/pages/public/VehicleDetailPage'))
const InstagramPage = lazy(() => import('@/pages/public/InstagramPage'))
const SobreNosotrosPage = lazy(() => import('@/pages/public/SobreNosotrosPage'))
const AppointmentPage = lazy(() => import('@/pages/public/AppointmentPage'))
const LegalPage = lazy(() => import('@/pages/public/LegalPage'))
const ContactPage = lazy(() => import('@/pages/public/ContactPage'))
const LoginPage = lazy(() => import('@/pages/auth/LoginPage'))
const StatsPage = lazy(() => import('@/pages/admin/StatsPage'))
const CrmPage = lazy(() => import('@/pages/admin/CrmPage'))
const LeadDetailPage = lazy(() => import('@/pages/admin/LeadDetailPage'))
const AdminCatalogPage = lazy(() => import('@/pages/admin/AdminCatalogPage'))
const AdminContentPage = lazy(() => import('@/pages/admin/AdminContentPage'))
const AdminUsersPage = lazy(() => import('@/pages/admin/AdminUsersPage'))
const StoragePage = lazy(() => import('@/pages/admin/StoragePage'))
const AdminLogErrorsPage = lazy(() => import('@/pages/admin/AdminLogErrorsPage'))
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'))

// CRM nuevo (route group /crm)
const CrmLoginPage = lazy(() => import('@/crm/pages/CrmLoginPage'))
const CrmLayout = lazy(() => import('@/crm/components/CrmLayout'))
const VehiculosListPage = lazy(() => import('@/crm/pages/VehiculosListPage'))
const VehiculoDetallePage = lazy(() => import('@/crm/pages/VehiculoDetallePage'))
const VehiculoEditarPage = lazy(() => import('@/crm/pages/VehiculoEditarPage'))
const ClientesListPage = lazy(() => import('@/crm/pages/ClientesListPage'))
const ClienteDetallePage = lazy(() => import('@/crm/pages/ClienteDetallePage'))
const ClienteEditarPage = lazy(() => import('@/crm/pages/ClienteEditarPage'))
const CambiarPasswordPage = lazy(() => import('@/crm/pages/CambiarPasswordPage'))

export default function AppRouter() {
  return (
    <>
      <ScrollToTop />
      <Routes>
      <Route element={<PublicLayout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/catalogo" element={<CatalogPage />} />
        <Route path="/catalogo/:id" element={<VehicleDetailPage />} />
        <Route path="/instagram" element={<InstagramPage />} />
        <Route path="/sobre-nosotros" element={<SobreNosotrosPage />} />
        <Route path="/cita" element={<AppointmentPage />} />
        <Route path="/terminos" element={<LegalPage type="terms" />} />
        <Route path="/privacidad" element={<LegalPage type="privacy" />} />
        <Route path="/cookies" element={<LegalPage type="cookies" />} />
        <Route path="/contacto" element={<ContactPage />} />
      </Route>

      <Route path="/login" element={<LoginPage />} />

      <Route
        element={
          <ProtectedRoute>
            <AdminLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/admin/crm" element={<CrmPage />} />
        <Route path="/admin/crm/:id" element={<LeadDetailPage />} />
        <Route path="/admin/catalogo" element={<AdminCatalogPage />} />
        <Route path="/admin/contenido" element={<AdminContentPage />} />
        <Route path="/admin/estadisticas" element={<StatsPage />} />
        <Route path="/admin/usuarios" element={<AdminUsersPage />} />
        <Route path="/admin/almacenamiento" element={<StoragePage />} />
        <Route path="/admin/logerrors" element={<AdminLogErrorsPage />} />
      </Route>

      <Route path="/crm/login" element={<CrmLoginPage />} />
      <Route element={<CrmProtectedRoute />}>
        <Route element={<CrmLayout />}>
          <Route path="/crm" element={<Navigate to="/crm/clientes" replace />} />
          <Route path="/crm/clientes" element={<ClientesListPage />} />
          <Route path="/crm/clientes/:id" element={<ClienteDetallePage />} />
          <Route path="/crm/clientes/:id/editar" element={<ClienteEditarPage />} />
          <Route path="/crm/vehiculos" element={<VehiculosListPage />} />
          <Route path="/crm/vehiculos/:id" element={<VehiculoDetallePage />} />
          <Route path="/crm/vehiculos/:id/editar" element={<VehiculoEditarPage />} />
          <Route path="/crm/cambiar-password" element={<CambiarPasswordPage />} />
        </Route>
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
    </>
  )
}
