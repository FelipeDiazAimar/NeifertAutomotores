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
const LoginPage = lazy(() => import('@/pages/auth/LoginPage'))
const CrmPage = lazy(() => import('@/pages/admin/CrmPage'))
const LeadDetailPage = lazy(() => import('@/pages/admin/LeadDetailPage'))
const StatsPage = lazy(() => import('@/pages/admin/StatsPage'))
const AdminCatalogPage = lazy(() => import('@/pages/admin/AdminCatalogPage'))
const AdminContentPage = lazy(() => import('@/pages/admin/AdminContentPage'))
const AdminUsersPage = lazy(() => import('@/pages/admin/AdminUsersPage'))
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
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
