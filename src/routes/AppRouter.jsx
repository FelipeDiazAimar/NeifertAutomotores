import { lazy } from 'react'
import { Routes, Route } from 'react-router-dom'
import PublicLayout from '@/components/layout/PublicLayout'
import AppLayout from '@/components/layout/AppLayout'
import ScrollToTop from '@/components/common/ScrollToTop'
import AppProtectedRoute from './AppProtectedRoute'

// Páginas cargadas bajo demanda (code-splitting por ruta)
const HomePage = lazy(() => import('@/pages/public/HomePage'))
const CatalogPage = lazy(() => import('@/pages/public/CatalogPage'))
const VehicleDetailPage = lazy(() => import('@/pages/public/VehicleDetailPage'))
const InstagramPage = lazy(() => import('@/pages/public/InstagramPage'))
const SobreNosotrosPage = lazy(() => import('@/pages/public/SobreNosotrosPage'))
const AppointmentPage = lazy(() => import('@/pages/public/AppointmentPage'))
const LegalPage = lazy(() => import('@/pages/public/LegalPage'))
const ContactPage = lazy(() => import('@/pages/public/ContactPage'))
const StatsPage = lazy(() => import('@/pages/admin/StatsPage'))
const CrmPage = lazy(() => import('@/pages/admin/CrmPage'))
const LeadDetailPage = lazy(() => import('@/pages/admin/LeadDetailPage'))
const AdminContentPage = lazy(() => import('@/pages/admin/AdminContentPage'))
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'))

// CRM nuevo (route group /crm)
const CrmLoginPage = lazy(() => import('@/crm/pages/CrmLoginPage'))
const VehiculosListPage = lazy(() => import('@/crm/pages/VehiculosListPage'))
const VehiculoDetallePage = lazy(() => import('@/crm/pages/VehiculoDetallePage'))
const VehiculoEditarPage = lazy(() => import('@/crm/pages/VehiculoEditarPage'))
const ClientesListPage = lazy(() => import('@/crm/pages/ClientesListPage'))
const ClienteDetallePage = lazy(() => import('@/crm/pages/ClienteDetallePage'))
const ClienteEditarPage = lazy(() => import('@/crm/pages/ClienteEditarPage'))
const TareasListPage = lazy(() => import('@/crm/pages/TareasListPage'))
const PeritajesListPage = lazy(() => import('@/crm/pages/PeritajesListPage'))
const GestoriaListPage = lazy(() => import('@/crm/pages/GestoriaListPage'))
const DashboardPage = lazy(() => import('@/crm/pages/DashboardPage'))
const AdminPage = lazy(() => import('@/pages/admin/AdminPage'))
const CambiarPasswordPage = lazy(() => import('@/crm/pages/CambiarPasswordPage'))
const VistaGuard = lazy(() => import('@/crm/routes/VistaGuard'))

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

      <Route path="/crm/login" element={<CrmLoginPage />} />
      <Route element={<AppProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/admin/crm" element={<CrmPage />} />
          <Route path="/admin/crm/:id" element={<LeadDetailPage />} />
          <Route path="/admin/contenido" element={<AdminContentPage />} />
          <Route path="/admin/estadisticas" element={<StatsPage />} />
          <Route path="/admin/admin" element={<AdminPage />} />
          <Route element={<VistaGuard />}>
            <Route path="/crm" element={<DashboardPage />} />
            <Route path="/crm/clientes" element={<ClientesListPage />} />
            <Route path="/crm/clientes/:id" element={<ClienteDetallePage />} />
            <Route path="/crm/clientes/:id/editar" element={<ClienteEditarPage />} />
            <Route path="/crm/tareas" element={<TareasListPage />} />
            <Route path="/crm/peritaje" element={<PeritajesListPage />} />
            <Route path="/crm/gestoria" element={<GestoriaListPage />} />
            <Route path="/crm/vehiculos" element={<VehiculosListPage />} />
            <Route path="/crm/vehiculos/:id" element={<VehiculoDetallePage />} />
            <Route path="/crm/vehiculos/:id/editar" element={<VehiculoEditarPage />} />
            <Route path="/crm/cambiar-password" element={<CambiarPasswordPage />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
    </>
  )
}
