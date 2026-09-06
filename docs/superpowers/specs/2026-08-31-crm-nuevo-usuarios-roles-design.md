# CRM nuevo — Módulo Usuarios / Roles

**Fecha:** 2026-08-31
**Estado:** aprobado
**Depende de:** módulos previos (schema `crm`, auth con email sintético, shell, `useCrmPerfil`, `api/crm/seed-usuarios.js`).

## 1. Objetivo

RBAC por **vistas** (pantallas), gestionado desde la UI. 3 roles; cada rol define
las vistas habilitadas **por defecto**; cada usuario puede tener un **override**
de vistas; botón para volver a las del rol. Alta de usuario, cambio de rol,
activar/desactivar y reset de contraseña desde `/crm/usuarios` (reemplaza el
script de seed — permite crear a Juani y Victor desde el CRM).

### Decisiones (brainstorming)

| Tema | Decisión |
|---|---|
| Roles | `admin`, `dueno` (label "Dueño"), `vendedor`. El enum `crm.rol` ya tiene `admin`/`vendedor` → se agrega `dueno`. |
| Modelo de permisos | Por **vistas** top-level, no por datos. Catálogo: `panel · clientes · vehiculos · tareas · usuarios · roles`. |
| Vistas efectivas | `usuario.vistas_override ?? rol.vistas_default`. |
| Acceso a la config | `/crm/usuarios` y `/crm/roles` solo para `admin` y `dueno` (gate por rol **y** por vista). |
| Bloqueo por URL directa | Pantalla **"No tenés acceso a esta sección"** (no redirect). `/crm/cambiar-password` siempre permitida. |
| Gestión | Editar `nombre/rol/activo/vistas_override` y `vistas_default` → PostgREST directo (RLS admin/dueno). Crear usuario + reset password → serverless con service role, validando el rol del llamador. |
| Plan | Uno solo. |

## 2. Schema `crm`

- `alter type crm.rol add value if not exists 'dueno';` (fuera de transacción).
- **`crm.roles`**
  ```
  rol            crm.rol primary key
  vistas_default text[] not null default '{}'
  actualizado_en timestamptz not null default now()
  ```
  Seed (idempotente, `on conflict (rol) do nothing` para no pisar ediciones):
  - `admin`   → `{panel,clientes,vehiculos,tareas,usuarios,roles}`
  - `dueno`   → `{panel,clientes,vehiculos,tareas,usuarios,roles}`
  - `vendedor`→ `{panel,clientes,vehiculos,tareas}`
- **`crm.usuarios`** `add column if not exists vistas_override text[]` (nullable; `null` = usar las del rol).
- **RLS**:
  - `crm.roles`: `select` con `crm.es_usuario()`; `insert/update` con `crm.mi_rol() in ('admin','dueno')`.
  - `crm.usuarios`: reemplazar las policies de `insert/update/delete` (hoy solo `admin`) por `crm.mi_rol() in ('admin','dueno')`. `select` sigue `crm.es_usuario()`.
- Grants a `authenticated` + `service_role` (idempotente).

## 3. Backend — `api/crm/usuarios.js`

Serverless. `POST` con `Authorization: Bearer <access token del usuario>`, body
`{ accion, ...datos }`.

1. Valida el token: `createClient(url, anonKey).auth.getUser(token)` → `uid`. Si
   falla → 401.
2. Con service role: `select rol, activo from crm.usuarios where id = uid`. Si
   `rol not in ('admin','dueno')` o `!activo` → 403.
3. Acciones:
   - `crear` `{ usuario, nombre, rol, password }` → `admin.createUser({ email: emailDeUsuario(usuario), password, email_confirm:true, user_metadata:{nombre,rol} })` + `upsert crm.usuarios { id, usuario, nombre, rol, activo:true }` (id_legacy: match contra `crm_legacy.usuarios` por usuario si existe). Idempotente por `usuario` (si ya existe el auth user, error claro "ya existe").
   - `reset_password` `{ id, password }` → `admin.updateUserById(id, { password })`.
4. Respuesta `{ ok, ... }`.

- Ruta dev en `src/plugins/crmProxy.js` (`/api/crm/usuarios`), patrón del resto.
- `scripts/seed-crm-usuarios.mjs` sigue funcionando (ahora hay UI, pero el script
  queda para bootstrap). `api/crm/seed-usuarios.js` puede quedar o reusar la
  lógica de `usuarios.js` — v1: dejar `seed-usuarios.js` como está.

## 4. Frontend

### lib / hooks / services

- `src/crm/lib/vistas.js`:
  ```js
  export const VISTAS = [
    { key: 'panel',     label: 'Panel',     ruta: '/crm' },
    { key: 'clientes',  label: 'Clientes',  ruta: '/crm/clientes' },
    { key: 'vehiculos', label: 'Vehículos', ruta: '/crm/vehiculos' },
    { key: 'tareas',    label: 'Tareas',    ruta: '/crm/tareas' },
    { key: 'usuarios',  label: 'Usuarios',  ruta: '/crm/usuarios' },
    { key: 'roles',     label: 'Roles',     ruta: '/crm/roles' },
  ]
  export const ROL_LABEL = { admin: 'Admin', dueno: 'Dueño', vendedor: 'Vendedor' }
  export function vistaDeRuta(pathname) { /* '/crm' → 'panel'; startsWith de las demás; null si no matchea (rutas sin gate, ej. cambiar-password) */ }
  ```
- `src/crm/services/usuarios.service.js`:
  - `listar()` → `crm.usuarios` (`id, usuario, nombre, rol, activo, vistas_override, creado_en`) ordenado por nombre.
  - `roles()` → `crm.roles` (`rol, vistas_default`).
  - `actualizarUsuario(id, parche)` → update `crm.usuarios` (`nombre?`, `rol?`, `activo?`, `vistas_override?` (array | null)).
  - `guardarRol(rol, vistas_default)` → `upsert crm.roles`.
  - `crearUsuario({ usuario, nombre, rol, password })` → `fetch('/api/crm/usuarios', { accion:'crear', ... }, Authorization con la sesión actual)`.
  - `resetPassword(id, password)` → `fetch(... accion:'reset_password')`.
  - helper `tokenActual()` → `supabase.auth.getSession()` → `access_token`.
- `src/crm/hooks/useUsuarios.js`: `useUsuarios()`, `useRolesCrm()`, `useUsuarioMutations()` (`actualizarUsuario`, `guardarRol`, `crearUsuario`, `resetPassword` — invalidan `['crm','usuarios']`/`['crm','roles']` + toast).
- `src/crm/hooks/useMisVistas.js`: `useMisVistas()` → `{ vistas: string[], cargando }`.
  Lee `crm.usuarios` propio (`rol, vistas_override`) + `crm.roles`; resuelve
  `vistas_override ?? roles[rol].vistas_default`. `queryKey ['crm','mis-vistas', perfil.id]`.
  (Se puede exponer también desde `useCrmPerfil` extendiendo el AuthProvider — v1: hook aparte, más simple.)

### Guard de vistas

`src/crm/routes/VistaGuard.jsx` — envuelve el `<Outlet/>` (o cada ruta):
`const vista = vistaDeRuta(useLocation().pathname)`. Si `vista === null` → pasa.
Si `useMisVistas().cargando` → spinner. Si `vista` no está en `misVistas` → pantalla
"No tenés acceso a esta sección" (`GlassCard` centrado + botón "Volver al panel"
que navega a la primera vista permitida, o a `/crm/cambiar-password` si no tiene ninguna).
Se monta dentro de `CrmProtectedRoute` (que ya valida sesión + `crm.usuarios` activo),
envolviendo el grupo de `CrmLayout`.

### Sidebar

`CrmSidebar` filtra `NAV` por `useMisVistas().vistas` (comparando `vista.key`).
Los ítems "Usuarios" y "Roles" se agregan al `NAV` con sus keys; aparecen solo si
están en las vistas efectivas.

### Páginas

**`/crm/usuarios` — `UsuariosPage`** (gate: vista `usuarios` + rol admin/dueno):
- Header + "Nuevo usuario" (`UsuarioФормModal` → `crearUsuario`).
- Lista: cada usuario un `<details>`/acordeón (`UsuarioRow`):
  - Cerrado: nombre, `@usuario`, `Badge` del rol, `Badge` activo/inactivo.
  - Abierto: `Select` rol · toggle "Activo" · **checklist de las 6 vistas**
    (`VistasChecklist`): cada checkbox refleja `vistasEfectivas(usuario)`; togglear
    setea/actualiza `vistas_override` (array completo). Indicador "Usando las vistas
    del rol" cuando `vistas_override == null`. Botón **"Restablecer a las del rol"**
    (`actualizarUsuario(id, { vistas_override: null })`). Botón "Resetear contraseña"
    (`ResetPasswordModal`).
  - Cambios de rol/activo se guardan al toque (autosave + toast).
- No podés desactivarte a vos mismo ni bajarte de admin/dueno si sos el último (validación suave client-side + el backend igualmente lo permite; v1: solo warning).

**`/crm/roles` — `RolesPage`** (mismo gate):
- 3 roles, cada uno un acordeón (`RolRow`): `VistasChecklist` sobre `vistas_default`;
  botón "Guardar" por rol (`guardarRol`). Nota: cambiar un rol afecta a todos los
  usuarios de ese rol **sin override**.

**Componentes**: `VistasChecklist` (6 checkboxes, `value: string[]`, `onChange`),
`UsuarioRow`, `RolRow`, `UsuarioFormModal`, `ResetPasswordModal`.

## 5. Testing

Unit: `vistas.js` (`vistaDeRuta` para `/crm`, `/crm/clientes/123`, `/crm/roles`,
`/crm/cambiar-password`→null), `vistasEfectivas(usuario, roles)`.
Servicios (mock supabase + mock fetch): `actualizarUsuario` arma el update;
`guardarRol` upsert; `crearUsuario`/`resetPassword` pegan a `/api/crm/usuarios`
con el bearer.
Backend: `handleUsuarios` — 401 sin token, 403 si el rol del llamador no es
admin/dueno, `crear` llama `createUser` con el email sintético, `reset_password`
llama `updateUserById`.
Componentes (jsdom): `VistasChecklist` (toggle emite el array nuevo), `UsuarioRow`
(togglear una vista llama `actualizarUsuario` con `vistas_override`; "Restablecer"
llama con `null`), `VistaGuard` (vista no permitida → mensaje; permitida → children;
ruta sin gate → children), `CrmSidebar` (oculta ítems fuera de las vistas).
RLS/integración: extender `scripts/verificar-crm-rls.mjs` — `vendedor` no puede
`PATCH crm.roles` ni `PATCH crm.usuarios` (0 filas); `admin` sí.

## 6. Fuera de alcance

Permisos finos por acción (ya se decidió: solo vistas top-level) · auditoría de
cambios de permisos · invitación por email real · 2FA · organigrama "reporta a".

## 7. Entregables

`dueno` agregado · `crm.roles` + `vistas_override` aplicados · `api/crm/usuarios.js`
+ ruta dev · `/crm/usuarios` y `/crm/roles` funcionando · sidebar y guard por
vistas · Juani y Victor creables desde la UI · tests verdes · `verificar-crm-rls.mjs`
extendido.
