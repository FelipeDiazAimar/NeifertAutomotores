# Unificación /admin + /crm y fotos de gestoría — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un solo panel (menú, layout, login, guard) para `/admin/*` y `/crm/*`; `crm.vehiculos` como única fuente de vehículos (admin y web pública); fotos 4:3 de seguro y título en Gestoría.

**Architecture:** Se reemplazan los dos sidebars/layouts/guards por versiones únicas compartidas; se agregan columnas de marketing a `crm.vehiculos` y un flag `publicado`; la web pública migra sus queries de `public.vehiculos` a un servicio público nuevo sobre `crm.vehiculos`; se agregan 3 columnas de fotos a `crm.gestoria` con un uploader de un solo archivo reutilizando el mecanismo R2 existente.

**Tech Stack:** React 18 + Vite, React Router v6, TanStack Query, Supabase (Postgres + Auth + Storage vía R2 presign), Vitest.

**Spec:** `docs/superpowers/specs/2026-09-13-admin-crm-unificacion-design.md`

## Global Constraints

- No commitear a git salvo que el usuario lo pida explícitamente (trabajo local, sin push).
- DDL sobre Supabase se aplica por conexión directa Postgres: `node --env-file=.env -e "...pg..."` (`DATABASE_URL` en `.env`). `alter type ... add value` va fuera de transacción (no aplica en este plan, no se tocan enums).
- Nunca exponer en queries públicas (`anon`/web) las columnas privadas de `crm.vehiculos`: `patente, duenio_nombre, duenio_apellido, duenio_contacto, itv, itv_venc, consignacion, tipo_consignacion, carpeta_completa, carpeta_con_oficio, carpeta_entregada, tiene_iva, nota, creado_por, editado_por`. Los selects públicos listan columnas explícitas, nunca `select('*')`.
- Email sintético de auth: `emailDeUsuario()` en `src/crm/lib/authEmail.js` — no diverge del server (`crmShadowEmail` en `src/server/crmCore.js`).
- Tests con `npm test` (vitest run). Cada task que toque lógica (no solo JSX de layout) lleva su test.

---

## Grupo A — Menú, layout, login y guard únicos

### Task A1: Migración SQL — columnas nuevas en `crm.vehiculos` y `crm.gestoria`

**Files:**
- Create: `scripts/migrations/2026-09-13-unificacion-admin-crm.sql`
- Create: `scripts/run-migration-unificacion.mjs`

**Interfaces:**
- Produces: columnas `crm.vehiculos.categoria/descripcion/es_nuevo/precio_usd/combustible/publicado` y `crm.gestoria.foto_seguro_url/foto_titulo_frente_url/foto_titulo_dorso_url`, usadas por todos los tasks siguientes de los Grupos B y C.

- [ ] **Step 1: Escribir el SQL de la migración**

`scripts/migrations/2026-09-13-unificacion-admin-crm.sql`:

```sql
alter table crm.vehiculos
  add column if not exists categoria text,
  add column if not exists descripcion text,
  add column if not exists es_nuevo boolean not null default false,
  add column if not exists precio_usd numeric,
  add column if not exists combustible text,
  add column if not exists publicado boolean not null default false;

alter table crm.gestoria
  add column if not exists foto_seguro_url text,
  add column if not exists foto_titulo_frente_url text,
  add column if not exists foto_titulo_dorso_url text;

-- Lectura pública (web sin sesión) de vehículos publicados y sus fotos.
drop policy if exists vehiculos_publico_select on crm.vehiculos;
create policy vehiculos_publico_select on crm.vehiculos
  for select to anon
  using (estado = 'disponible' and publicado = true);

drop policy if exists vehiculo_fotos_publico_select on crm.vehiculo_fotos;
create policy vehiculo_fotos_publico_select on crm.vehiculo_fotos
  for select to anon
  using (
    exists (
      select 1 from crm.vehiculos v
      where v.id = vehiculo_id and v.estado = 'disponible' and v.publicado = true
    )
  );

grant usage on schema crm to anon;
grant select on crm.vehiculos, crm.vehiculo_fotos to anon;
```

- [ ] **Step 2: Escribir el runner**

`scripts/run-migration-unificacion.mjs`:

```js
import pg from 'pg'
import { readFileSync } from 'node:fs'

const sql = readFileSync(new URL('./migrations/2026-09-13-unificacion-admin-crm.sql', import.meta.url), 'utf8')
const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
await client.connect()
await client.query(sql)
await client.end()
console.log('Migración aplicada.')
```

- [ ] **Step 3: Correr la migración**

Run: `node --env-file=.env scripts/run-migration-unificacion.mjs`
Expected: `Migración aplicada.` sin errores.

- [ ] **Step 4: Verificar columnas**

Run: `node --env-file=.env -e "import('pg').then(async ({default:pg})=>{const c=new pg.Client({connectionString:process.env.DATABASE_URL});await c.connect();const r=await c.query(\"select column_name from information_schema.columns where table_schema='crm' and table_name in ('vehiculos','gestoria') and column_name in ('categoria','descripcion','es_nuevo','precio_usd','combustible','publicado','foto_seguro_url','foto_titulo_frente_url','foto_titulo_dorso_url')\");console.log(r.rows.map(x=>x.column_name));await c.end()})"`
Expected: array con las 9 columnas.

No commit (paso de infraestructura, no se pide commitear).

---

### Task A2: Guard único `AppProtectedRoute`

**Files:**
- Create: `src/routes/AppProtectedRoute.jsx`
- Test: `src/routes/__tests__/AppProtectedRoute.test.jsx`
- Reference (no modificar todavía): `src/crm/routes/CrmProtectedRoute.jsx` (patrón a replicar), `src/crm/hooks/useCrmPerfil.js`

**Interfaces:**
- Consumes: `useAuth()` (`src/hooks/useAuth.js`) → `{ session, loading }`; `useCrmPerfil()` (`src/crm/hooks/useCrmPerfil.js`) → `{ activo, cargando }`.
- Produces: `export default function AppProtectedRoute()` — componente de ruta (usa `<Outlet/>`), sin children prop (a diferencia del viejo `ProtectedRoute`), para usarse como `<Route element={<AppProtectedRoute />}>`.

- [ ] **Step 1: Leer `CrmProtectedRoute.jsx` para replicar el patrón exacto**

Confirmar cómo resuelve `session`/`activo`/loading y qué pantalla muestra en cada caso (login redirect vs. "no tenés acceso").

- [ ] **Step 2: Escribir el test**

```jsx
// src/routes/__tests__/AppProtectedRoute.test.jsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import AppProtectedRoute from '../AppProtectedRoute'

vi.mock('@/hooks/useAuth', () => ({ useAuth: vi.fn() }))
vi.mock('@/crm/hooks/useCrmPerfil', () => ({ useCrmPerfil: vi.fn() }))

import { useAuth } from '@/hooks/useAuth'
import { useCrmPerfil } from '@/crm/hooks/useCrmPerfil'

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/crm/login" element={<div>login page</div>} />
        <Route element={<AppProtectedRoute />}>
          <Route path="/admin/x" element={<div>contenido protegido</div>} />
        </Route>
      </Routes>
    </MemoryRouter>
  )
}

describe('AppProtectedRoute', () => {
  it('sin sesión, redirige a /crm/login', () => {
    useAuth.mockReturnValue({ session: null, loading: false })
    useCrmPerfil.mockReturnValue({ activo: false, cargando: false })
    renderAt('/admin/x')
    expect(screen.getByText('login page')).toBeInTheDocument()
  })

  it('con sesión pero sin crm.usuarios activo, muestra "no tenés acceso"', () => {
    useAuth.mockReturnValue({ session: { user: { id: '1' } }, loading: false })
    useCrmPerfil.mockReturnValue({ activo: false, cargando: false })
    renderAt('/admin/x')
    expect(screen.getByText(/no tenés acceso/i)).toBeInTheDocument()
  })

  it('con sesión y activo, renderiza el contenido', () => {
    useAuth.mockReturnValue({ session: { user: { id: '1' } }, loading: false })
    useCrmPerfil.mockReturnValue({ activo: true, cargando: false })
    renderAt('/admin/x')
    expect(screen.getByText('contenido protegido')).toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Correr el test y confirmar que falla**

Run: `npx vitest run src/routes/__tests__/AppProtectedRoute.test.jsx`
Expected: FAIL (`AppProtectedRoute` no existe todavía).

- [ ] **Step 4: Implementar `AppProtectedRoute.jsx`**

Copiar la estructura de `CrmProtectedRoute.jsx` (spinner en loading, `<Navigate to="/crm/login" replace />` sin sesión, pantalla "No tenés acceso a esta sección" si `!activo`, `<Outlet/>` si todo ok).

- [ ] **Step 5: Correr el test y confirmar que pasa**

Run: `npx vitest run src/routes/__tests__/AppProtectedRoute.test.jsx`
Expected: 3 tests PASS.

---

### Task A3: Sidebar y layout únicos (`AppSidebar`, `AppLayout`)

**Files:**
- Create: `src/components/layout/AppSidebar.jsx` (desktop, fusiona `AdminSidebar.jsx` + `CrmSidebar.jsx`)
- Create: `src/components/layout/AppMobileSidebar.jsx` (fusiona `AdminMobileSidebar.jsx` + el `Sheet` móvil de `CrmLayout.jsx`)
- Create: `src/components/layout/AppLayout.jsx` (fusiona `AdminLayout.jsx` + `CrmLayout.jsx`)
- Test: `src/components/layout/__tests__/AppSidebar.test.jsx`
- Reference: `src/crm/lib/vistas.js` (array `VISTAS`, `vistaDeRuta`), `src/crm/hooks/useMisVistas.js`, `src/crm/hooks/useTareas.js` (`useTareasPendientesHoy`)

**Interfaces:**
- Consumes: `useMisVistas()` → `{ vistas: string[], cargando: boolean }`; `useTareasPendientesHoy()` → `{ data: number }`; `useAuth()` → `{ profile, signOut }`.
- Produces: `export default function AppSidebar()`, `export default function AppMobileSidebar({ open, onClose })`, `export default function AppLayout()` (monta ambos + `<Outlet/>`).

- [ ] **Step 1: Extender el catálogo de vistas**

En `src/crm/lib/vistas.js`, agregar a `VISTAS`:

```js
{ key: 'leads', label: 'Carga Leads', ruta: '/admin/crm' },
{ key: 'contenido', label: 'Administración Contenido Web', ruta: '/admin/contenido' },
{ key: 'estadisticas', label: 'Estadísticas', ruta: '/admin/estadisticas' },
{ key: 'admin', label: 'Admin', ruta: '/admin/admin' },
```

y actualizar `vistaDeRuta()` para que reconozca esos prefijos (mismo `startsWith` que ya usa para `/crm/*`).

- [ ] **Step 2: Migración de `crm.roles.vistas_default`**

Agregar a `scripts/migrations/2026-09-13-unificacion-admin-crm.sql` (antes de correrlo si Task A1 no se corrió todavía; si ya se corrió, agregar un segundo archivo `2026-09-13b-vistas-admin.sql` y correrlo aparte):

```sql
update crm.roles set vistas_default = vistas_default || array['leads','contenido','estadisticas','admin']
where not (vistas_default @> array['leads','contenido','estadisticas','admin']);
```

Correr con el mismo runner de Task A1 (`node --env-file=.env scripts/run-migration-unificacion.mjs`, apuntando al archivo nuevo si se separó).

- [ ] **Step 3: Escribir el test de `AppSidebar`**

```jsx
// src/components/layout/__tests__/AppSidebar.test.jsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import AppSidebar from '../AppSidebar'

vi.mock('@/crm/hooks/useMisVistas', () => ({
  useMisVistas: () => ({ vistas: ['leads', 'vehiculos', 'clientes'], cargando: false }),
}))
vi.mock('@/crm/hooks/useTareas', () => ({ useTareasPendientesHoy: () => ({ data: 0 }) }))
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ profile: { full_name: 'Test' }, signOut: vi.fn() }) }))

describe('AppSidebar', () => {
  it('muestra solo los ítems de las vistas permitidas', () => {
    render(<MemoryRouter><AppSidebar /></MemoryRouter>)
    expect(screen.getByText('Carga Leads')).toBeInTheDocument()
    expect(screen.getByText('Clientes')).toBeInTheDocument()
    expect(screen.queryByText('Tareas')).not.toBeInTheDocument()
    expect(screen.queryByText('Peritaje')).not.toBeInTheDocument()
  })

  it('etiqueta Catálogo aparece y apunta a /crm/vehiculos', () => {
    render(<MemoryRouter><AppSidebar /></MemoryRouter>)
    const link = screen.getByText('Catálogo').closest('a')
    expect(link).toHaveAttribute('href', '/crm/vehiculos')
  })
})
```

- [ ] **Step 4: Correr el test y confirmar que falla**

Run: `npx vitest run src/components/layout/__tests__/AppSidebar.test.jsx`
Expected: FAIL (`AppSidebar` no existe).

- [ ] **Step 5: Implementar `AppSidebar.jsx`**

Basarse en `CrmSidebar.jsx` (ya filtra por vistas) y agregarle el `NAV` completo:

```js
const NAV = [
  { to: '/admin/crm', label: 'Carga Leads', icon: Users, vista: 'leads' },
  { to: '/crm/vehiculos', label: 'Catálogo', icon: Car, vista: 'vehiculos' },
  { to: '/crm/clientes', label: 'Clientes', icon: Users, vista: 'clientes' },
  { to: '/crm/tareas', label: 'Tareas', icon: ListTodo, badge: 'tareas', vista: 'tareas' },
  { to: '/crm/peritaje', label: 'Peritaje', icon: ClipboardCheck, vista: 'peritaje' },
  { to: '/crm/gestoria', label: 'Gestoría', icon: FileStack, vista: 'gestoria' },
  { to: '/admin/estadisticas', label: 'Estadísticas', icon: BarChart3, vista: 'estadisticas' },
  { to: '/admin/contenido', label: 'Administración Contenido Web', icon: LayoutTemplate, vista: 'contenido' },
  { to: '/admin/admin', label: 'Admin', icon: UserCog, vista: 'admin' },
  { to: '/', label: 'Ver sitio', icon: Home, end: true },
]
```

(`'Ver sitio'` sin `vista` → siempre visible, igual que hoy en `AdminSidebar`; ajustar el filtro `items = cargando ? NAV : NAV.filter(n => !n.vista || vistas.includes(n.vista))`).

- [ ] **Step 6: Correr el test y confirmar que pasa**

Run: `npx vitest run src/components/layout/__tests__/AppSidebar.test.jsx`
Expected: 2 tests PASS.

- [ ] **Step 7: Implementar `AppMobileSidebar.jsx` y `AppLayout.jsx`**

`AppMobileSidebar`: mismo `NAV` que `AppSidebar`, estructura de `Sheet` tomada de `CrmLayout.jsx` (móvil). `AppLayout`: estructura de `AdminLayout.jsx` (sticky sidebar desktop + botón hamburguesa + `AnimatedOutlet`), reemplazando `AdminSidebar`/`AdminMobileSidebar` por `AppSidebar`/`AppMobileSidebar`.

- [ ] **Step 8: Smoke visual manual**

Run: `npm run dev`, entrar a `/admin/crm` logueado, confirmar que el sidebar muestra todos los ítems nuevos y que "Catálogo"/"Clientes"/"Tareas"/"Peritaje"/"Gestoría" navegan a sus URLs `/crm/*` sin perder el sidebar (porque todavía no está montado ahí — se confirma recién en Task A4).

---

### Task A4: Reemplazar layouts/guards en `AppRouter.jsx` y borrar login viejo

**Files:**
- Modify: `src/routes/AppRouter.jsx`
- Delete: `src/pages/auth/LoginPage.jsx`, `src/routes/ProtectedRoute.jsx`, `src/crm/routes/CrmProtectedRoute.jsx`, `src/components/layout/AdminSidebar.jsx`, `src/components/layout/AdminMobileSidebar.jsx`, `src/components/layout/AdminLayout.jsx`, `src/crm/components/CrmSidebar.jsx`, `src/crm/components/CrmLayout.jsx`
- Modify: `src/context/AuthProvider.jsx` — quitar `signIn`/`loginWithCrmCredentials`/bridge
- Modify/Delete: `src/services/crmAuth.service.js` (borrar `loginWithCrmCredentials`), `src/server/crmCore.js` (borrar `bridgeCrmSession`, mantener el resto usado por Grupo B si aplica)

**Interfaces:**
- Consumes: `AppProtectedRoute` (Task A2), `AppLayout` (Task A3).
- Produces: rutas `/admin/*` y `/crm/*` ambas envueltas por `<AppProtectedRoute><AppLayout/></AppProtectedRoute>`; ruta única de login `/crm/login`.

- [ ] **Step 1: Reescribir el bloque de rutas protegidas en `AppRouter.jsx`**

```jsx
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
```

Quitar los imports/rutas de `LoginPage`, `AdminCatalogPage`, `AdminUsersPage`, `StoragePage`, `AdminLogErrorsPage`, `UsuariosPage`, `RolesPage`, y quitar `/login` y `/admin/usuarios`/`/admin/almacenamiento`/`/admin/logerrors`/`/admin/catalogo` (Catálogo se retira del todo en Task B4; si B4 no se hizo aún, dejar `/admin/catalogo` momentáneamente comentado — pero seguir el orden del plan evita esto). Agregar import de `AdminPage` (Task A5) y `AppProtectedRoute`/`AppLayout`.

- [ ] **Step 2: Borrar los archivos viejos listados arriba**

Confirmar antes con `grep -rn "AdminSidebar\|AdminMobileSidebar\|AdminLayout\b\|CrmSidebar\|CrmLayout\b\|ProtectedRoute\b\|LoginPage" src --include=*.jsx -l` que ningún otro archivo los importa fuera de `AppRouter.jsx` (que ya se actualizó); si aparece alguno, actualizarlo también antes de borrar.

- [ ] **Step 3: Limpiar `AuthProvider.jsx`, `crmAuth.service.js`, `crmCore.js`**

Quitar `signIn`/`loginWithCrmCredentials`/`bridgeCrmSession` y cualquier código muerto que solo ellos usaban (endpoint `/api/crm/bridge-session` si existe como archivo propio en `api/crm/`, borrarlo).

- [ ] **Step 4: Smoke test manual completo**

Run: `npm run dev`. Logout total (borrar sesión de Supabase en devtools o usar ventana incógnita). Entrar a `/crm/login`, loguearse con un usuario real de `crm.usuarios`. Confirmar: redirige al panel, el sidebar único aparece, todos los links (Carga Leads, Catálogo, Clientes, Tareas, Peritaje, Gestoría, Estadísticas, Administración Contenido Web, Admin) navegan sin perder el sidebar ni pedir login de nuevo. Confirmar que `/login` y `/admin/catalogo` devuelven 404 (`NotFoundPage`).

- [ ] **Step 5: Correr toda la suite**

Run: `npm test`
Expected: todos los tests pasan (los que referenciaban `CrmProtectedRoute`/`CrmLayout`/`AdminSidebar` directamente deben migrarse o borrarse si ya no aplican — revisar output y ajustar).

---

### Task A5: Renombres de título y página "Admin" (4 secciones)

**Files:**
- Modify: `src/pages/admin/CrmPage.jsx` (header, si en algún lado dice "CRM"/"Gestión de Salón" y se quiere alinear al nombre de menú "Carga Leads" — opcional, el label del menú ya cambió en Task A3; dejar el header de la página como está salvo que el usuario pida lo contrario)
- Modify: `src/pages/admin/AdminContentPage.jsx:715` — cambiar `<h1>Contenido</h1>` a `<h1>Administración Contenido Web</h1>`
- Create: `src/pages/admin/AdminPage.jsx`
- Create: `src/components/admin/UsuariosCrmSection.jsx` (contenido extraído de `src/crm/pages/UsuariosPage.jsx`)
- Create: `src/components/admin/RolesCrmSection.jsx` (contenido extraído de `src/crm/pages/RolesPage.jsx`)
- Create: `src/components/admin/AccesosPanelSection.jsx` (contenido extraído de `src/pages/admin/AdminUsersPage.jsx`)
- Create: `src/components/admin/AlmacenamientoSection.jsx` (contenido extraído de `src/pages/admin/StoragePage.jsx`)
- Delete: `src/crm/pages/UsuariosPage.jsx`, `src/crm/pages/RolesPage.jsx`, `src/pages/admin/AdminUsersPage.jsx`, `src/pages/admin/StoragePage.jsx`, `src/pages/admin/AdminLogErrorsPage.jsx`, `src/lib/logCapture.js` (si nada más lo usa)

**Interfaces:**
- Produces: `export default function AdminPage()` con 4 `<section>` (títulos "Usuarios", "Roles", "Accesos del panel", "Almacenamiento"), montada en `/admin/admin` (ya cableada en Task A4).

- [ ] **Step 1: Cambiar el título de Contenido**

`src/pages/admin/AdminContentPage.jsx:715`: `<h1 ...>Contenido</h1>` → `<h1 ...>Administración Contenido Web</h1>`.

- [ ] **Step 2: Extraer las 4 secciones a componentes**

Mover el JSX+lógica de cada página fuente a su componente nuevo tal cual (misma lógica, mismos hooks internos), quitando el wrapper de página (header propio, `<h1>` de nivel superior) — cada sección lleva su propio `<h2>` con el título de sección.

- [ ] **Step 3: Escribir `AdminPage.jsx`**

```jsx
import UsuariosCrmSection from '@/components/admin/UsuariosCrmSection'
import RolesCrmSection from '@/components/admin/RolesCrmSection'
import AccesosPanelSection from '@/components/admin/AccesosPanelSection'
import AlmacenamientoSection from '@/components/admin/AlmacenamientoSection'

export default function AdminPage() {
  return (
    <div className="space-y-10">
      <h1 className="font-display text-3xl font-extrabold text-ink">Admin</h1>
      <section><h2 className="mb-4 text-xl font-bold text-ink">Usuarios</h2><UsuariosCrmSection /></section>
      <section><h2 className="mb-4 text-xl font-bold text-ink">Roles</h2><RolesCrmSection /></section>
      <section><h2 className="mb-4 text-xl font-bold text-ink">Accesos del panel</h2><AccesosPanelSection /></section>
      <section><h2 className="mb-4 text-xl font-bold text-ink">Almacenamiento</h2><AlmacenamientoSection /></section>
    </div>
  )
}
```

- [ ] **Step 4: Borrar las páginas/rutas viejas**

Confirmar que `AppRouter.jsx` (Task A4) ya no las importa. Borrar los 5 archivos listados arriba. `grep -rn "AdminLogErrorsPage\|logCapture" src` para confirmar que nada más depende de `logCapture.js` antes de borrarlo.

- [ ] **Step 5: Smoke test manual**

Run: `npm run dev`, entrar a `/admin/admin`, confirmar que las 4 secciones renderizan y funcionan igual que sus páginas originales (crear/editar usuario CRM, guardar rol, ver accesos del panel viejo, ver stats de almacenamiento).

- [ ] **Step 6: Correr toda la suite**

Run: `npm test`
Expected: PASS (ajustar tests que importaban las páginas viejas por sus nuevos componentes de sección).

---

## Grupo B — Vehículos: fuente única

### Task B1: Servicio público de vehículos sobre `crm.vehiculos`

**Files:**
- Create: `src/crm/services/vehiculosPublico.service.js`
- Test: `src/crm/__tests__/vehiculosPublico.service.test.js`
- Reference: `src/crm/services/vehiculos.service.js` (patrón de queries existente), `src/services/vehicles.service.js:105-142` (shape de objeto que hoy consume la UI pública — `fetchVehicles`)

**Interfaces:**
- Produces:
  - `listarPublicos({ categoria, sort } = {})` → `Promise<Array<{ id, marca, modelo, version, anio, km, transmision, color, moneda, precio_contado, precio_usd, categoria, descripcion, es_nuevo, combustible, estado, fotos: Array<{ url, es_portada }> }>>`
  - `obtenerPublicoPorId(id)` → mismo shape, un solo objeto o `null`.

- [ ] **Step 1: Escribir el test**

```js
// src/crm/__tests__/vehiculosPublico.service.test.js
import { describe, it, expect, vi } from 'vitest'

const selectMock = vi.fn()
vi.mock('@/services/supabaseClient', () => ({
  supabase: { schema: () => ({ from: () => ({ select: selectMock }) }) },
}))

import { listarPublicos } from '../services/vehiculosPublico.service'

describe('vehiculosPublico.service listarPublicos', () => {
  it('selecciona solo columnas públicas, nunca privadas', async () => {
    const eqChain = { eq: vi.fn().mockReturnThis(), order: vi.fn().mockResolvedValue({ data: [], error: null }) }
    selectMock.mockReturnValue(eqChain)
    await listarPublicos()
    const columnasSeleccionadas = selectMock.mock.calls[0][0]
    for (const privada of ['duenio_nombre', 'itv', 'patente', 'nota', 'consignacion']) {
      expect(columnasSeleccionadas).not.toContain(privada)
    }
    expect(columnasSeleccionadas).toContain('precio_usd')
  })
})
```

- [ ] **Step 2: Correr el test y confirmar que falla**

Run: `npx vitest run src/crm/__tests__/vehiculosPublico.service.test.js`
Expected: FAIL (módulo no existe).

- [ ] **Step 3: Implementar el servicio**

```js
// src/crm/services/vehiculosPublico.service.js
import { supabase } from '@/services/supabaseClient'

const db = () => supabase.schema('crm')

const COLUMNAS_PUBLICAS = `id, marca, modelo, version, anio, km, transmision, color, moneda,
  precio_contado, precio_usd, categoria, descripcion, es_nuevo, combustible, estado,
  vehiculo_fotos ( url, es_portada )`

export async function listarPublicos({ categoria, sort = 'creado_en.desc' } = {}) {
  let q = db().from('vehiculos').select(COLUMNAS_PUBLICAS).eq('estado', 'disponible').eq('publicado', true)
  if (categoria && categoria !== 'todos') q = q.eq('categoria', categoria)
  const [col, dir] = sort.split('.')
  q = q.order(col, { ascending: dir !== 'desc' })
  const { data, error } = await q
  if (error) throw error
  return (data ?? []).map(mapear)
}

export async function obtenerPublicoPorId(id) {
  const { data, error } = await db().from('vehiculos').select(COLUMNAS_PUBLICAS).eq('id', id)
    .eq('estado', 'disponible').eq('publicado', true).maybeSingle()
  if (error) throw error
  return data ? mapear(data) : null
}

function mapear(v) {
  return { ...v, fotos: v.vehiculo_fotos ?? [] }
}
```

- [ ] **Step 4: Correr el test y confirmar que pasa**

Run: `npx vitest run src/crm/__tests__/vehiculosPublico.service.test.js`
Expected: PASS.

---

### Task B2: Rewire de la web pública a `vehiculosPublico.service`

**Files:**
- Modify: `src/hooks/useVehicles.js`
- Modify: `src/components/catalog/RelatedVehicles.jsx`
- Modify: `src/components/search/AiSearchOverlay.jsx`
- Test: `src/hooks/__tests__/useVehicles.test.js` (crear si no existe, o extender el existente)

**Interfaces:**
- Consumes: `listarPublicos`, `obtenerPublicoPorId` (Task B1).
- Produces: `useVehicles(filtros)` y `useVehicle(id)` mantienen su firma pública (mismo shape hacia `CatalogPage`/`VehicleDetailPage`), ahora resueltos vía `crm.vehiculos`.

- [ ] **Step 1: Mapear campos español→shape esperado por la UI**

Revisar qué propiedades leen hoy `CatalogPage.jsx`/`VehicleDetailPage.jsx`/`VehicleCard` (ej. `brand`, `model`, `price`, `year`, `image`) contra los nombres en español del nuevo servicio (`marca`, `modelo`, `precio_contado`, `anio`, `fotos[0].url`). Escribir un mapeador `mapVehiculoCrmAPublico(v)` en `vehiculosPublico.service.js` que devuelva las claves que la UI ya espera (mismas que devolvía `fetchVehicles` de `vehicles.service.js` — copiar esa lista de claves de `vehicles.service.js:105-142`).

- [ ] **Step 2: Escribir/extender el test de `useVehicles`**

```js
// src/hooks/__tests__/useVehicles.test.js
import { describe, it, expect, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('@/crm/services/vehiculosPublico.service', () => ({
  listarPublicos: vi.fn().mockResolvedValue([{ id: '1', marca: 'Ford' }]),
}))

import { useVehicles } from '../useVehicles'

const wrapper = ({ children }) => {
  const qc = new QueryClient()
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

describe('useVehicles', () => {
  it('resuelve con datos de vehiculosPublico.service', async () => {
    const { result } = renderHook(() => useVehicles(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data[0].marca).toBe('Ford')
  })
})
```

- [ ] **Step 3: Correr el test y confirmar que falla**

Run: `npx vitest run src/hooks/__tests__/useVehicles.test.js`
Expected: FAIL (todavía importa `vehicles.service.js`).

- [ ] **Step 4: Reemplazar el import en `useVehicles.js`**

Cambiar `fetchVehicles`/`fetchVehicleById` de `@/services/vehicles.service` por `listarPublicos`/`obtenerPublicoPorId` de `@/crm/services/vehiculosPublico.service`, manteniendo la firma de `useVehicles(filtros)`/`useVehicle(id)`.

- [ ] **Step 5: Correr el test y confirmar que pasa**

Run: `npx vitest run src/hooks/__tests__/useVehicles.test.js`
Expected: PASS.

- [ ] **Step 6: Actualizar `RelatedVehicles.jsx` y `AiSearchOverlay.jsx`**

Reemplazar sus llamadas directas a `fetchVehicles` (de `vehicles.service.js`) por `listarPublicos` del nuevo servicio, mismo shape de filtros (`{ categoria, sort }`).

- [ ] **Step 7: Smoke test manual**

Run: `npm run dev`. Marcar un vehículo como `publicado=true` (vía CRM, Task B3) y confirmar que aparece en `/catalogo`, en su detalle, en relacionados y en el buscador IA.

---

### Task B3: Campos de marketing en `VehiculoForm.jsx` (CRM)

**Files:**
- Modify: `src/crm/components/VehiculoForm.jsx`
- Modify: `src/crm/services/vehiculos.service.js` (incluir las columnas nuevas en `crear`/`actualizar`/`listar`)
- Test: `src/crm/__tests__/VehiculoForm.test.jsx` (extender si existe)

**Interfaces:**
- Consumes: columnas de Task A1.
- Produces: el form guarda `categoria, descripcion, es_nuevo, combustible, precio_usd, publicado` junto al resto de campos existentes.

- [ ] **Step 1: Localizar el bloque de campos del form y agregar los nuevos**

Agregar inputs: `categoria` (select, reusar lista de categorías de `src/lib/mockData.js` o donde estén definidas hoy para `public.vehiculos`), `descripcion` (textarea), `es_nuevo` (checkbox/switch "Es nuevo"), `combustible` (select), `precio_usd` (input numérico), `publicado` (switch "Publicado en la web").

- [ ] **Step 2: Extender `vehiculos.service.js`**

Agregar las 6 columnas nuevas al objeto que arma `crear(datos)`/`actualizar(id, datos)`, y a la lista de columnas de `listar()` (select).

- [ ] **Step 3: Test del form (si existe un test previo, extenderlo; si no, uno mínimo)**

```jsx
it('incluye el switch Publicado en la web y lo manda en el submit', async () => {
  const onSubmit = vi.fn()
  render(<VehiculoForm onSubmit={onSubmit} />)
  await userEvent.click(screen.getByLabelText(/publicado en la web/i))
  await userEvent.click(screen.getByRole('button', { name: /guardar/i }))
  expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ publicado: true }))
})
```

- [ ] **Step 4: Correr el test**

Run: `npx vitest run src/crm/__tests__/VehiculoForm.test.jsx`
Expected: PASS.

- [ ] **Step 5: Smoke test manual**

Run: `npm run dev`, editar un vehículo en `/crm/vehiculos/:id/editar`, tildar "Publicado en la web", guardar, confirmar en la base (o repitiendo Task B2 smoke) que aparece en la web pública.

---

### Task B4: Script de migración de datos + retiro de `AdminCatalogPage` y del sync viejo

**Files:**
- Create: `scripts/migrate-public-vehiculos-to-crm.mjs`
- Delete: `src/pages/admin/AdminCatalogPage.jsx`, `src/services/crmVehicles.service.js`, `src/services/vehicles.service.js` (dejar de usarse desde código — confirmar que nada más lo importa antes de borrar)
- Modify: `src/routes/AppRouter.jsx` (ya sin `/admin/catalogo`, confirmado en Task A4 — verificar acá si se hizo en orden)

**Interfaces:**
- Consumes: `crm.vehiculos`, `crm.vehiculo_fotos` (destino), `public.vehiculos` (origen, solo lectura).
- Produces: filas nuevas/actualizadas en `crm.vehiculos` con `publicado=true` para todo lo que estaba visible en la web vieja.

- [ ] **Step 1: Escribir el script de migración**

```js
// scripts/migrate-public-vehiculos-to-crm.mjs
import pg from 'pg'

const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
await client.connect()

const { rows: publicos } = await client.query(
  `select * from public.vehiculos where estado = 'disponible' and coalesce(oculto, false) = false`
)

let migrados = 0
for (const v of publicos) {
  const { rows: existentes } = await client.query(
    `select id from crm.vehiculos where lower(marca) = lower($1) and lower(modelo) = lower($2)
     and coalesce(patente,'') = '' limit 1`,
    [v.marca, v.modelo]
  )
  let vehiculoId = existentes[0]?.id
  if (!vehiculoId) {
    const { rows: ins } = await client.query(
      `insert into crm.vehiculos (marca, modelo, version, anio, km, transmision, color, moneda,
         precio_contado, precio_usd, categoria, descripcion, es_nuevo, combustible, estado, publicado)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'disponible', true)
       returning id`,
      [v.marca, v.modelo, v.version, v.anio, v.km, v.transmision, v.color, v.moneda,
       v.precio, v.precio_usd, v.categoria, v.descripcion, v.es_nuevo, v.combustible]
    )
    vehiculoId = ins[0].id
  } else {
    await client.query(
      `update crm.vehiculos set categoria=$1, descripcion=$2, es_nuevo=$3, combustible=$4, precio_usd=$5, publicado=true
       where id=$6`,
      [v.categoria, v.descripcion, v.es_nuevo, v.combustible, v.precio_usd, vehiculoId]
    )
  }

  const imagenes = [v.imagen_principal, ...(Array.isArray(v.imagenes) ? v.imagenes : [])].filter(Boolean)
  for (const [i, url] of imagenes.entries()) {
    await client.query(
      `insert into crm.vehiculo_fotos (vehiculo_id, url, orden, es_portada)
       values ($1, $2, $3, $4)
       on conflict do nothing`,
      [vehiculoId, url, i, i === 0]
    )
  }
  migrados++
}

console.log(`Migrados/actualizados ${migrados} vehículos.`)
await client.end()
```

- [ ] **Step 2: Correr el script**

Run: `node --env-file=.env scripts/migrate-public-vehiculos-to-crm.mjs`
Expected: `Migrados/actualizados N vehículos.` sin errores.

- [ ] **Step 3: Verificar en la web**

Run: `npm run dev`, entrar a `/catalogo`, confirmar que aparecen los mismos autos que antes de la migración (mismo conteo aproximado).

- [ ] **Step 4: Confirmar que nada más importa los archivos a borrar**

Run: `grep -rn "AdminCatalogPage\|crmVehicles.service\|services/vehicles.service" src`
Expected: solo apariciones dentro de los archivos que se van a borrar (y `AppRouter.jsx`, ya limpiado en Task A4 — si no se limpió, hacerlo ahora quitando la ruta `/admin/catalogo` y el import de `AdminCatalogPage`).

- [ ] **Step 5: Borrar los archivos**

Borrar `AdminCatalogPage.jsx`, `crmVehicles.service.js`, `vehicles.service.js` y su hook `useVehicles.js` viejo si quedó separado del de Task B2 (confirmar que Task B2 ya dejó `src/hooks/useVehicles.js` sin depender de `vehicles.service.js` antes de este borrado).

- [ ] **Step 6: Correr toda la suite**

Run: `npm test`
Expected: PASS (borrar/ajustar tests que apuntaban a los archivos eliminados).

---

## Grupo C — Fotos de Gestoría (seguro y título 4:3)

### Task C1: `subirArchivoUnico` en `fotos.service.js`

**Files:**
- Modify: `src/crm/services/fotos.service.js`
- Test: `src/crm/__tests__/fotos.service.test.js` (extender si existe, crear si no)

**Interfaces:**
- Produces: `subirArchivoUnico(carpeta, file)` → `Promise<string>` (URL pública), sin tocar `crm.vehiculo_fotos`.

- [ ] **Step 1: Escribir el test**

```js
// src/crm/__tests__/fotos.service.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest'

global.fetch = vi.fn()

import { subirArchivoUnico } from '../services/fotos.service'

describe('subirArchivoUnico', () => {
  beforeEach(() => fetch.mockReset())

  it('presigna, sube el archivo y devuelve la URL pública', async () => {
    fetch
      .mockResolvedValueOnce({ json: async () => ({ ok: true, uploadUrl: 'https://r2/put', publicUrl: 'https://r2/pub.jpg' }) })
      .mockResolvedValueOnce({ ok: true })

    const file = new File(['x'], 'seguro.jpg', { type: 'image/jpeg' })
    const url = await subirArchivoUnico('crm/gestoria/1', file)

    expect(url).toBe('https://r2/pub.jpg')
    expect(fetch).toHaveBeenNthCalledWith(2, 'https://r2/put', expect.objectContaining({ method: 'PUT' }))
  })
})
```

- [ ] **Step 2: Correr el test y confirmar que falla**

Run: `npx vitest run src/crm/__tests__/fotos.service.test.js`
Expected: FAIL (`subirArchivoUnico` no exportado).

- [ ] **Step 3: Implementar**

```js
// agregar a src/crm/services/fotos.service.js
export async function subirArchivoUnico(carpeta, file) {
  const nombre = `${carpeta}/${Date.now()}-${file.name.replace(/[^\w.-]/g, '_')}`
  const pre = await fetch('/api/r2/presign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename: nombre, contentType: file.type }),
  })
  const json = await pre.json()
  if (!json?.ok) throw new Error(json?.error || 'No se pudo preparar la subida.')

  const put = await fetch(json.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
    body: file,
  })
  if (!put.ok) throw new Error('Falló la subida del archivo.')
  return json.publicUrl
}
```

- [ ] **Step 4: Correr el test y confirmar que pasa**

Run: `npx vitest run src/crm/__tests__/fotos.service.test.js`
Expected: PASS.

---

### Task C2: Componente `FotoSlot` (4:3)

**Files:**
- Create: `src/crm/components/FotoSlot.jsx`
- Test: `src/crm/__tests__/FotoSlot.test.jsx`

**Interfaces:**
- Consumes: `subirArchivoUnico` (Task C1).
- Produces: `export default function FotoSlot({ label, url, carpeta, onChange })` — `onChange(nuevaUrlOrNull)` se llama tras subir (con la URL) o borrar (con `null`).

- [ ] **Step 1: Escribir el test**

```jsx
// src/crm/__tests__/FotoSlot.test.jsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('@/crm/services/fotos.service', () => ({ subirArchivoUnico: vi.fn().mockResolvedValue('https://r2/x.jpg') }))

import FotoSlot from '../FotoSlot'

describe('FotoSlot', () => {
  it('sin foto, muestra el botón de subir; al elegir archivo, llama onChange con la URL', async () => {
    const onChange = vi.fn()
    render(<FotoSlot label="Foto del seguro" url={null} carpeta="crm/gestoria/1" onChange={onChange} />)
    const input = screen.getByLabelText(/foto del seguro/i)
    const file = new File(['x'], 'seguro.jpg', { type: 'image/jpeg' })
    fireEvent.change(input, { target: { files: [file] } })
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('https://r2/x.jpg'))
  })

  it('con foto cargada, muestra la imagen en 4:3 y un botón borrar que llama onChange(null)', () => {
    const onChange = vi.fn()
    render(<FotoSlot label="Título — frente" url="https://r2/y.jpg" carpeta="crm/gestoria/1" onChange={onChange} />)
    expect(screen.getByRole('img')).toHaveAttribute('src', 'https://r2/y.jpg')
    fireEvent.click(screen.getByRole('button', { name: /borrar/i }))
    expect(onChange).toHaveBeenCalledWith(null)
  })
})
```

- [ ] **Step 2: Correr el test y confirmar que falla**

Run: `npx vitest run src/crm/__tests__/FotoSlot.test.jsx`
Expected: FAIL (`FotoSlot` no existe).

- [ ] **Step 3: Implementar `FotoSlot.jsx`**

```jsx
import { useRef, useState } from 'react'
import { Loader2, ImagePlus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import * as fotos from '@/crm/services/fotos.service'

export default function FotoSlot({ label, url, carpeta, onChange }) {
  const inputRef = useRef(null)
  const [subiendo, setSubiendo] = useState(false)
  const inputId = `foto-slot-${label.replace(/\s+/g, '-').toLowerCase()}`

  async function onArchivo(e) {
    const file = e.target.files[0]
    e.target.value = ''
    if (!file) return
    setSubiendo(true)
    try {
      const nuevaUrl = await fotos.subirArchivoUnico(carpeta, file)
      onChange(nuevaUrl)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSubiendo(false)
    }
  }

  return (
    <div className="space-y-2">
      <label htmlFor={inputId} className="text-sm font-medium text-ink">{label}</label>
      <div className="relative aspect-[4/3] w-full max-w-xs overflow-hidden rounded-2xl border border-line">
        {url ? (
          <>
            <img src={url} alt={label} className="h-full w-full object-cover" />
            <button
              type="button"
              onClick={() => onChange(null)}
              aria-label={`Borrar ${label}`}
              className="absolute right-2 top-2 rounded-full bg-white/90 p-1.5 text-neifert"
            >
              <Trash2 size={14} />
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={subiendo}
            className="glass grid h-full w-full place-items-center text-ink-3 hover:text-ink"
          >
            {subiendo ? <Loader2 size={20} className="animate-spin" /> : <ImagePlus size={20} />}
          </button>
        )}
      </div>
      <input id={inputId} ref={inputRef} type="file" accept="image/*" hidden onChange={onArchivo} aria-label={label} />
    </div>
  )
}
```

- [ ] **Step 4: Correr el test y confirmar que pasa**

Run: `npx vitest run src/crm/__tests__/FotoSlot.test.jsx`
Expected: PASS.

---

### Task C3: Sección "Documentación" en `GestoriaChecklist.jsx`

**Files:**
- Modify: `src/crm/components/GestoriaChecklist.jsx`
- Test: `src/crm/__tests__/GestoriaChecklist.test.jsx` (extender si existe)

**Interfaces:**
- Consumes: `FotoSlot` (Task C2), `useGestoriaMutations(vehiculoId).guardarCampos` (ya existente, acepta patch arbitrario).

- [ ] **Step 1: Escribir el test**

```jsx
it('la sección Documentación tiene 3 FotoSlot y persiste con guardarCampos', async () => {
  const guardarCampos = { mutate: vi.fn() }
  vi.mocked(useGestoriaMutations).mockReturnValue({ guardarCampos })
  vi.mocked(useGestoria).mockReturnValue({ data: { foto_seguro_url: null }, isLoading: false })

  render(<GestoriaChecklist vehiculoId="v1" />)
  expect(screen.getByText('Foto del seguro')).toBeInTheDocument()
  expect(screen.getByText('Título — frente')).toBeInTheDocument()
  expect(screen.getByText('Título — dorso')).toBeInTheDocument()

  const input = screen.getByLabelText('Foto del seguro')
  fireEvent.change(input, { target: { files: [new File(['x'], 'a.jpg', { type: 'image/jpeg' })] } })
  await waitFor(() => expect(guardarCampos.mutate).toHaveBeenCalledWith({ foto_seguro_url: 'https://r2/x.jpg' }))
})
```

(Este test asume que `fotos.service` sigue mockeado a `subirArchivoUnico` → `'https://r2/x.jpg'` como en Task C2; ajustar el mock en el archivo real de test según cómo estén mockeados los hooks de Gestoría existentes en `GestoriaChecklist.test.jsx` si ya existe uno.)

- [ ] **Step 2: Correr el test y confirmar que falla**

Run: `npx vitest run src/crm/__tests__/GestoriaChecklist.test.jsx`
Expected: FAIL (la sección Documentación no existe todavía).

- [ ] **Step 3: Agregar la sección al componente**

En `GestoriaChecklist.jsx`, antes del bloque `<ul>` de trámites, agregar:

```jsx
<div className="space-y-3">
  <h3 className="text-sm font-semibold text-ink">Documentación</h3>
  <div className="flex flex-wrap gap-4">
    <FotoSlot
      label="Foto del seguro"
      url={g?.foto_seguro_url ?? null}
      carpeta={`crm/gestoria/${vehiculoId}`}
      onChange={(url) => guardarCampos.mutate({ foto_seguro_url: url })}
    />
    <FotoSlot
      label="Título — frente"
      url={g?.foto_titulo_frente_url ?? null}
      carpeta={`crm/gestoria/${vehiculoId}`}
      onChange={(url) => guardarCampos.mutate({ foto_titulo_frente_url: url })}
    />
    <FotoSlot
      label="Título — dorso"
      url={g?.foto_titulo_dorso_url ?? null}
      carpeta={`crm/gestoria/${vehiculoId}`}
      onChange={(url) => guardarCampos.mutate({ foto_titulo_dorso_url: url })}
    />
  </div>
</div>
```

Importar `FotoSlot` desde `@/crm/components/FotoSlot`.

- [ ] **Step 4: Correr el test y confirmar que pasa**

Run: `npx vitest run src/crm/__tests__/GestoriaChecklist.test.jsx`
Expected: PASS.

- [ ] **Step 5: Smoke test manual**

Run: `npm run dev`, entrar a `/crm/vehiculos/:id?tab=gestoria`, subir una foto en cada uno de los 3 slots, refrescar la página y confirmar que persisten (quedaron guardadas en `crm.gestoria`).

- [ ] **Step 6: Correr toda la suite completa del proyecto**

Run: `npm test`
Expected: todos los tests PASS.

---

## Cierre

- [ ] **Verificación final end-to-end**: `npm run build` sin errores; recorrido manual completo logueado como cada uno de los 3 roles (`admin`, `dueno`, `vendedor`) confirmando que el sidebar único muestra lo que corresponde a cada uno y que Catálogo/Gestoría/fotos funcionan de punta a punta.
- No se commitea nada de este plan salvo pedido explícito del usuario.
