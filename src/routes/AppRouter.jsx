import { lazy } from 'react'
import { Routes, Route } from 'react-router-dom'
import PublicLayout from '@/components/layout/PublicLayout'
import AdminLayout from '@/components/layout/AdminLayout'
import ProtectedRoute from './ProtectedRoute'

// Páginas cargadas bajo demanda (code-splitting por ruta)
const HomePage = lazy(() => import('@/pages/public/HomePage'))
const CatalogPage = lazy(() => import('@/pages/public/CatalogPage'))
const VehicleDetailPage = lazy(() => import('@/pages/public/VehicleDetailPage'))
const InstagramPage = lazy(() => import('@/pages/public/InstagramPage'))
const AppointmentPage = lazy(() => import('@/pages/public/AppointmentPage'))
const LegalPage = lazy(() => import('@/pages/public/LegalPage'))
const ContactPage = lazy(() => import('@/pages/public/ContactPage'))
const LoginPage = lazy(() => import('@/pages/auth/LoginPage'))
const StatsPage = lazy(() => import('@/pages/admin/StatsPage'))
const AdminCatalogPage = lazy(() => import('@/pages/admin/AdminCatalogPage'))
const AdminContentPage = lazy(() => import('@/pages/admin/AdminContentPage'))
const AdminUsersPage = lazy(() => import('@/pages/admin/AdminUsersPage'))
const StoragePage = lazy(() => import('@/pages/admin/StoragePage'))
const AdminLogErrorsPage = lazy(() => import('@/pages/admin/AdminLogErrorsPage'))
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'))

export default function AppRouter() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/catalogo" element={<CatalogPage />} />
        <Route path="/catalogo/:id" element={<VehicleDetailPage />} />
        <Route path="/instagram" element={<InstagramPage />} />
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
        <Route path="/admin/catalogo" element={<AdminCatalogPage />} />
        <Route path="/admin/contenido" element={<AdminContentPage />} />
        <Route path="/admin/estadisticas" element={<StatsPage />} />
        <Route path="/admin/usuarios" element={<AdminUsersPage />} />
        <Route path="/admin/almacenamiento" element={<StoragePage />} />
        <Route path="/admin/logerrors" element={<AdminLogErrorsPage />} />
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
