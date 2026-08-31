# CRM nuevo — Plan 6: Módulo Usuarios / Roles

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development o superpowers:executing-plans. Steps `- [ ]`.

**Goal:** RBAC por vistas gestionado desde la UI — 3 roles (`admin`/`dueno`/`vendedor`), `crm.roles.vistas_default`, `crm.usuarios.vistas_override`, `/crm/usuarios` y `/crm/roles`, sidebar y guard filtrados por vistas efectivas, alta/reset de usuarios desde el CRM.

**Architecture:** Permisos por **vistas top-level** (`panel/clientes/vehiculos/tareas/usuarios/roles`), no por datos. Vistas efectivas = `usuario.vistas_override ?? rol.vistas_default`, resuelto client-side. Edición de usuarios/roles por PostgREST (RLS `admin`/`dueno`); crear usuario + reset password por serverless con service role validando el rol del llamador.

**Tech Stack:** React 19, Vite 8, Tailwind v4, `@supabase/supabase-js`, `@tanstack/react-query`, `lucide-react`, `sonner`, Vitest + Testing Library, `pg` (scripts).

**Spec:** `docs/superpowers/specs/2026-08-31-crm-nuevo-usuarios-roles-design.md`

## Global Constraints

- Estética glass: `@/components/common/*`, tokens `--c-*`, `font-display` en títulos. base-nova solo lo ya usado.
- Datos: schema `crm`. RLS: `crm.roles` update = `mi_rol() in ('admin','dueno')`; `crm.usuarios` insert/update/delete = `mi_rol() in ('admin','dueno')`; select = `es_usuario()`.
- DDL por `pg` con `DATABASE_URL` de `.env`. `alter type ... add value` va suelto (no en transacción).
- Auth email sintético: reusar `emailDeUsuario` de `src/crm/lib/authEmail.js`.
- ESM, alias `@`→`src`, todo en `src/crm/**` salvo `api/crm/usuarios.js`. Tests verdes con `npm test`.
- Commits: body cierra con `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`. Rama `feat/crm-legacy-clone`. No `main`.
- Español.

---

## File Structure

| File | Responsabilidad |
|------|------------------|
| `supabase/crm_roles_schema.sql` | `alter type crm.rol add 'dueno'` + `crm.roles` + `crm.usuarios.vistas_override` + seed roles + RLS. |
| `src/crm/lib/vistas.js` | `VISTAS`, `ROL_LABEL`, `vistaDeRuta(pathname)`, `vistasEfectivas(usuario, rolesMap)`. |
| `src/crm/services/usuarios.service.js` | `listar`, `roles`, `actualizarUsuario`, `guardarRol`, `crearUsuario`, `resetPassword`. |
| `src/crm/hooks/useUsuarios.js` | `useUsuarios`, `useRolesCrm`, `useUsuarioMutations`. |
| `src/crm/hooks/useMisVistas.js` | `useMisVistas()` → `{ vistas, cargando }`. |
| `src/crm/routes/VistaGuard.jsx` | guard por vista, envuelve el grupo `CrmLayout`. |
| `src/crm/components/VistasChecklist.jsx` | 6 checkboxes. |
| `src/crm/components/UsuarioRow.jsx` | acordeón de usuario. |
| `src/crm/components/RolRow.jsx` | acordeón de rol. |
| `src/crm/components/UsuarioFormModal.jsx` | alta de usuario. |
| `src/crm/components/ResetPasswordModal.jsx` | reset de contraseña. |
| `src/crm/pages/UsuariosPage.jsx` / `RolesPage.jsx` | páginas. |
| `api/crm/usuarios.js` | serverless: `crear` + `reset_password`, valida rol del llamador. |
| `src/plugins/crmProxy.js` | (modificar) ruta dev `/api/crm/usuarios`. |
| `src/crm/components/CrmSidebar.jsx` | (modificar) ítems Usuarios/Roles + filtro por vistas. |
| `src/routes/AppRouter.jsx` | (modificar) rutas `/crm/usuarios`, `/crm/roles` + envolver el grupo en `VistaGuard`. |
| `scripts/verificar-crm-rls.mjs` | (modificar) checks de roles/usuarios. |

---

## Task 1: Schema — `dueno` + `crm.roles` + `vistas_override`

**Files:** Create `supabase/crm_roles_schema.sql`; Test `src/crm/__tests__/crmRolesSchema.test.js`.

- [ ] **Step 1: Test de drift (falla primero)** — el SQL contiene: `add value if not exists 'dueno'`, `table if not exists crm.roles`, `vistas_default text[]`, `add column if not exists vistas_override`, `create policy` de update en `crm.roles` que menciona `dueno`, seed de los 3 roles.

- [ ] **Step 2: Escribir el SQL**

```sql
-- dueno al enum (fuera de transacción)
alter type crm.rol add value if not exists 'dueno';

create table if not exists crm.roles (
  rol crm.rol primary key,
  vistas_default text[] not null default '{}',
  actualizado_en timestamptz not null default now()
);

alter table crm.usuarios add column if not exists vistas_override text[];

insert into crm.roles (rol, vistas_default) values
  ('admin',    '{panel,clientes,vehiculos,tareas,usuarios,roles}'),
  ('vendedor', '{panel,clientes,vehiculos,tareas}')
on conflict (rol) do nothing;
-- 'dueno' se inserta en un statement aparte porque el enum recién se amplió
insert into crm.roles (rol, vistas_default) values
  ('dueno', '{panel,clientes,vehiculos,tareas,usuarios,roles}')
on conflict (rol) do nothing;

alter table crm.roles enable row level security;
drop policy if exists roles_select on crm.roles;
create policy roles_select on crm.roles for select using (crm.es_usuario());
drop policy if exists roles_write on crm.roles;
create policy roles_write on crm.roles for all
  using (crm.mi_rol() in ('admin','dueno')) with check (crm.mi_rol() in ('admin','dueno'));

-- crm.usuarios: insert/update/delete ahora admin O dueno
drop policy if exists usuarios_admin_insert on crm.usuarios;
create policy usuarios_admin_insert on crm.usuarios for insert with check (crm.mi_rol() in ('admin','dueno'));
drop policy if exists usuarios_admin_update on crm.usuarios;
create policy usuarios_admin_update on crm.usuarios for update using (crm.mi_rol() in ('admin','dueno'));
drop policy if exists usuarios_admin_delete on crm.usuarios;
create policy usuarios_admin_delete on crm.usuarios for delete using (crm.mi_rol() in ('admin','dueno'));

grant select, insert, update, delete on all tables in schema crm to authenticated;
grant all privileges on all tables in schema crm to service_role;
```

> **Nota de ejecución:** `alter type ... add value` no puede correr en el mismo
> bloque transaccional que un `insert` que use el valor nuevo. El script `pg`
> debe mandar el `alter type` **en un `query()` separado** del resto, o el
> archivo debe dividirse en dos. En Task 1 Step 4 aplicar así.

- [ ] **Step 3: Test verde.**
- [ ] **Step 4: Aplicar por pg** — 2 queries: primero `alter type crm.rol add value if not exists 'dueno';`, después el resto del archivo.

```bash
node --env-file=.env -e "const {Client}=require('pg');const fs=require('fs');(async()=>{const c=new Client({connectionString:process.env.DATABASE_URL});await c.connect();const sql=fs.readFileSync('supabase/crm_roles_schema.sql','utf8');const [alterLine,...rest]=sql.split('\n');await c.query(\"alter type crm.rol add value if not exists 'dueno'\");await c.query(rest.join('\n'));console.log('OK');await c.end()})().catch(e=>{console.error(e.message);process.exit(1)})"
```

- [ ] **Step 5: Commit** `feat(crm): rol dueno + crm.roles + vistas_override`.

---

## Task 2: `vistas.js`

**Files:** Create `src/crm/lib/vistas.js`; Test `src/crm/__tests__/vistas.test.js`.

**Interfaces:**
- `VISTAS: [{ key, label, ruta }]` — panel, clientes, vehiculos, tareas, usuarios, roles.
- `ROL_LABEL: { admin, dueno, vendedor }`.
- `vistaDeRuta(pathname)` → `'/crm'` exacto → `'panel'`; `startsWith('/crm/clientes')` → `'clientes'`; idem vehiculos/tareas/usuarios/roles; cualquier otra (`/crm/cambiar-password`, `/crm/login`) → `null`.
- `vistasEfectivas(usuario, rolesMap)` → `usuario.vistas_override ?? (rolesMap[usuario.rol]?.vistas_default ?? [])`. `rolesMap` = `{ [rol]: { vistas_default } }`.

- [ ] **Step 1: Test (falla primero)** — `vistaDeRuta('/crm')==='panel'`, `vistaDeRuta('/crm/clientes/abc')==='clientes'`, `vistaDeRuta('/crm/roles')==='roles'`, `vistaDeRuta('/crm/cambiar-password')===null`. `vistasEfectivas({rol:'vendedor'}, map)` → default del rol; `vistasEfectivas({rol:'vendedor', vistas_override:['panel']}, map)` → `['panel']`.

- [ ] **Step 2: Implementar.**
- [ ] **Step 3: Test verde + commit** `feat(crm): catalogo de vistas y resolucion de permisos`.

---

## Task 3: `usuarios.service` + hooks

**Files:** Create `src/crm/services/usuarios.service.js`, `src/crm/hooks/useUsuarios.js`, `src/crm/hooks/useMisVistas.js`; Test `src/crm/__tests__/usuarios.service.test.js`.

**Interfaces:**
- `listar()` → `supabase.schema('crm').from('usuarios').select('id, usuario, nombre, rol, activo, vistas_override, creado_en').order('nombre')`.
- `roles()` → `from('roles').select('rol, vistas_default')`.
- `actualizarUsuario(id, parche)` → `update(parche).eq('id', id)` (parche puede tener `nombre`, `rol`, `activo`, `vistas_override` (array | null)).
- `guardarRol(rol, vistas_default)` → `from('roles').upsert({ rol, vistas_default, actualizado_en: new Date().toISOString() }, { onConflict:'rol' })`.
- `tokenActual()` → `(await supabase.auth.getSession()).data.session?.access_token`.
- `crearUsuario({ usuario, nombre, rol, password })` → `fetch('/api/crm/usuarios', { method:'POST', headers:{ 'Content-Type':'application/json', Authorization:'Bearer '+token }, body: JSON.stringify({ accion:'crear', usuario, nombre, rol, password }) })` → json; throw si `!ok`.
- `resetPassword(id, password)` → `fetch(... { accion:'reset_password', id, password })`.
- `useUsuarios()` (`['crm','usuarios']`), `useRolesCrm()` (`['crm','roles']`), `useUsuarioMutations()` (`{ actualizarUsuario, guardarRol, crearUsuario, resetPassword }` — invalidan `['crm','usuarios']`/`['crm','roles']`/`['crm','mis-vistas']` + toast).
- `useMisVistas()` — `useCrmPerfil()` da `id`+`rol`; `useQuery(['crm','mis-vistas', id])` que hace `from('usuarios').select('rol, vistas_override').eq('id', id).single()` + `roles()`; devuelve `{ vistas: vistasEfectivas(fila, rolesMap), cargando }`. `enabled: !!id`.

- [ ] **Step 1: Test (falla primero)** — mock `_supabaseMock` + `fetch`. `actualizarUsuario('u1', { rol:'dueno' })` → `update` con ese payload y `eq('id','u1')`. `guardarRol('vendedor', ['panel'])` → `upsert` con `onConflict:'rol'`. `crearUsuario({usuario:'Juani',...})` → `fetch` a `/api/crm/usuarios` con `Authorization` y body `accion:'crear'`.

- [ ] **Step 2: Implementar.**
- [ ] **Step 3: `npm test` + commit** `feat(crm): servicio y hooks de usuarios/roles + useMisVistas`.

---

## Task 4: `api/crm/usuarios.js` + ruta dev

**Files:** Create `api/crm/usuarios.js`; modify `src/plugins/crmProxy.js`; Test `src/crm/__tests__/usuariosEndpoint.test.js`.

**Interfaces:**
- `handleUsuarios(req, res, { env, deps })` — `deps.makeAnon` (para `auth.getUser`), `deps.makeAdmin` (service role). Flujo del spec §3.
  - 405 si no POST. 401 si sin token o `getUser` falla. 403 si `rol not in ('admin','dueno')` o `!activo`.
  - `accion:'crear'` → `admin.auth.admin.createUser({ email: emailDeUsuario(usuario), password, email_confirm:true, user_metadata:{nombre,rol} })`; si error "already been registered" → 409 `{ ok:false, error:'Ese usuario ya existe' }`. Luego `admin.schema('crm').from('usuarios').upsert({ id: authUser.id, usuario, nombre, rol, activo:true }, { onConflict:'id' })`. `{ ok:true, id }`.
  - `accion:'reset_password'` → `admin.auth.admin.updateUserById(id, { password })` → `{ ok:true }`.
- `export default (req,res) => handleUsuarios(req,res)`.

- [ ] **Step 1: Test (falla primero)**

```js
// mockRes como en syncEndpoint.test.js
const env = { VITE_SUPABASE_URL:'u', VITE_SUPABASE_ANON_KEY:'a', SUPABASE_SERVICE_ROLE_KEY:'k' }
// deps.makeAnon → { auth:{ getUser: vi.fn().mockResolvedValue({ data:{ user:{ id:'caller' } }, error:null }) } }
// deps.makeAdmin → fake con schema().from().select().eq().single() → { data:{ rol:'admin', activo:true } }
//                  + auth.admin.createUser / updateUserById spies + schema().from().upsert()...
```
Casos: 405 GET; 401 sin `Authorization`; 403 si el caller tiene `rol:'vendedor'`;
`crear` llama `createUser` con `email:'juani@crm-viejo.neifert.local'`;
`reset_password` llama `updateUserById('u9', { password:'x' })`.

- [ ] **Step 2: Implementar** + ruta dev en `crmProxy.js` (patrón `sync-legacy`/`seed-usuarios`, con `readJsonBody`).
- [ ] **Step 3: `npm test` + commit** `feat(crm): endpoint de alta/reset de usuarios`.

---

## Task 5: `VistasChecklist` + `UsuarioRow` + `RolRow`

**Files:** Create los 3; Test `src/crm/__tests__/VistasChecklist.test.jsx`, `src/crm/__tests__/UsuarioRow.test.jsx`.

**Interfaces:**
- `VistasChecklist({ value, onChange, disabled })` — `value: string[]`; 6 checkboxes de `VISTAS`; togglear uno llama `onChange(nuevoArray)`.
- `UsuarioRow({ usuario, rolesMap, onCambiar, onResetPassword })` — `<details>` glass:
  - Summary: `nombre`, `@usuario`, `Badge` `ROL_LABEL[rol]`, `Badge` (activo → verde "Activo" / gris "Inactivo").
  - Body: `Select` rol (`ROL_LABEL`) → `onCambiar(id, { rol })`; toggle "Activo" → `onCambiar(id, { activo })`;
    `<VistasChecklist value={vistasEfectivas(usuario, rolesMap)} onChange={(v) => onCambiar(id, { vistas_override: v })} />`;
    si `usuario.vistas_override == null` → texto "Usando las vistas del rol";
    botón "Restablecer a las del rol" → `onCambiar(id, { vistas_override: null })` (visible solo si hay override);
    botón "Resetear contraseña" → `onResetPassword(usuario)`.
- `RolRow({ rol, vistasDefault, onGuardar })` — `<details>` glass: `VistasChecklist` con estado local sobre `vistasDefault`; botón "Guardar" → `onGuardar(rol, estadoLocal)`; nota "Afecta a los usuarios de este rol sin override".

- [ ] **Step 1: Tests (fallan primero)** — `VistasChecklist`: click en "Clientes" con `value=['panel']` → `onChange(['panel','clientes'])`. `UsuarioRow`: togglear una vista llama `onCambiar(id, { vistas_override: [...] })`; "Restablecer a las del rol" llama `onCambiar(id, { vistas_override: null })`; sin override, el botón "Restablecer" no aparece y se ve "Usando las vistas del rol".

- [ ] **Step 2: Implementar.**
- [ ] **Step 3: `npm test` + commit** `feat(crm): checklist de vistas + filas de usuario y rol`.

---

## Task 6: `UsuarioFormModal` + `ResetPasswordModal` + páginas + rutas + sidebar

**Files:** Create `src/crm/components/UsuarioFormModal.jsx`, `ResetPasswordModal.jsx`, `src/crm/pages/UsuariosPage.jsx`, `src/crm/pages/RolesPage.jsx`; modify `src/crm/components/CrmSidebar.jsx`, `src/routes/AppRouter.jsx`; Test `src/crm/__tests__/UsuariosPage.test.jsx`, `src/crm/__tests__/RolesPage.test.jsx`.

**Interfaces:**
- `UsuarioFormModal({ open, onClose })` — overlay (patrón `TareaFormModal` sin RHF necesario, o con `zod` mínimo): `usuario*`, `nombre*`, `rol` (`Select`), `contraseña*` (min 8). Submit → `useUsuarioMutations().crearUsuario.mutate({ usuario, nombre, rol, password }, { onSuccess: onClose })`.
- `ResetPasswordModal({ open, onClose, usuario })` — `Modal`: `contraseña nueva*` (min 8) + repetir; submit → `resetPassword.mutate({ id: usuario.id, password })`.
- `UsuariosPage` — gate: `useMisVistas().vistas.includes('usuarios')` (el `VistaGuard` ya lo cubre, pero doble-check ok); `useUsuarios()` + `useRolesCrm()` → `rolesMap`; lista de `UsuarioRow`; "Nuevo usuario" → `UsuarioFormModal`. `onCambiar` = `actualizarUsuario.mutate({ id, ...parche })`.
- `RolesPage` — `useRolesCrm()`; un `RolRow` por rol (orden admin, dueno, vendedor); `onGuardar` = `guardarRol.mutate({ rol, vistas_default })`.
- `CrmSidebar`: `NAV` += `{ to:'/crm/usuarios', label:'Usuarios', icon: UserCog, vista:'usuarios' }` y `{ to:'/crm/roles', label:'Roles', icon: ShieldCheck, vista:'roles' }`. Filtrar **todo** el `NAV` por `useMisVistas().vistas` (cada item con su `vista`; el logo/panel siempre). Mientras `cargando`, no romper (mostrar todo o nada — mostrar los que ya están).
- `AppRouter`: `lazy` de `UsuariosPage`/`RolesPage`; rutas `/crm/usuarios` y `/crm/roles` dentro del grupo. **Envolver el grupo `CrmLayout`** con `VistaGuard` (ver Task 7) — o poner `<VistaGuard>` como layout intermedio: `<Route element={<CrmProtectedRoute />}><Route element={<VistaGuard />}><Route element={<CrmLayout />}>...`.

- [ ] **Step 1: Tests (fallan primero)** — `UsuariosPage` (mock hooks): renderiza un `UsuarioRow` por usuario y "Nuevo usuario" abre el modal. `RolesPage`: 3 `RolRow`; "Guardar" en uno llama `guardarRol`.

- [ ] **Step 2: Implementar.**
- [ ] **Step 3: `npm test` + `npm run build` + commit** `feat(crm): paginas Usuarios y Roles + rutas + sidebar`.

---

## Task 7: `VistaGuard` + integración en la sidebar

**Files:** Create `src/crm/routes/VistaGuard.jsx`; modify `src/routes/AppRouter.jsx` (si no se hizo en Task 6); Test `src/crm/__tests__/VistaGuard.test.jsx`.

**Interfaces:**
- `VistaGuard()` — `const vista = vistaDeRuta(useLocation().pathname)`. Si `vista == null` → `<Outlet/>`. `const { vistas, cargando } = useMisVistas()`. Si `cargando` → spinner. Si `!vistas.includes(vista)` → `GlassCard` centrado "No tenés acceso a esta sección" + `Button` "Volver" → `navigate(primeraRutaPermitida(vistas) ?? '/crm/cambiar-password')`. Si ok → `<Outlet/>`.
- `primeraRutaPermitida(vistas)` (helper en `vistas.js`): la `ruta` de la primera `VISTAS` cuya `key` esté en `vistas`.

- [ ] **Step 1: Test (falla primero)** — con `useMisVistas` → `{ vistas:['panel','clientes'], cargando:false }`: en `/crm/roles` muestra "No tenés acceso"; en `/crm/clientes` muestra el `<Outlet/>` (un hijo de prueba); en `/crm/cambiar-password` (vista null) muestra el hijo.

- [ ] **Step 2: Implementar** + asegurar el wrap en `AppRouter`.
- [ ] **Step 3: `npm test` + `npm run build` + `npm run lint` (sin errores nuevos en `src/crm`) + commit** `feat(crm): guard de rutas por vista habilitada`.

---

## Task 8: Verificación + crear Juani y Victor

**Files:** modify `scripts/verificar-crm-rls.mjs`.

- [ ] **Step 1:** agregar checks: `vendedor` `PATCH crm.roles?rol=eq.vendedor` → 0 filas (RLS); `vendedor` `PATCH crm.usuarios?id=eq.<suyo>` con `{nombre:'x'}` → 0 filas; `admin` `PATCH crm.roles` → 1 fila (y revertir).
- [ ] **Step 2:** `node --env-file=.env scripts/verificar-crm-rls.mjs` → todos PASS.
- [ ] **Step 3: Smoke** — `npm run dev` → `/crm/usuarios` (login `Cristian`, admin): crear **Juani** (`vendedor`, `juani123`) y **Victor** (`vendedor`, su contraseña); editar el rol de uno a `dueno` y ver que gana Usuarios/Roles en la sidebar; a un vendedor quitarle la vista "Vehículos" → su sidebar la oculta y entrar por URL muestra "No tenés acceso"; "Restablecer a las del rol" vuelve todo. `/crm/roles`: cambiar `vendedor` y verificar el efecto en un vendedor sin override.
- [ ] **Step 4: Commit** `test(crm): verificacion RLS de roles/usuarios`.

---

## Self-Review

**Cobertura del spec:**

| Spec | Task |
|---|---|
| §2 `dueno` + `crm.roles` + `vistas_override` + RLS | Task 1 |
| §3 `api/crm/usuarios.js` (crear + reset, valida rol) + ruta dev | Task 4 |
| §4 `vistas.js` | Task 2 |
| §4 `usuarios.service` + `useUsuarios`/`useRolesCrm`/`useUsuarioMutations` | Task 3 |
| §4 `useMisVistas` | Task 3 |
| §4 `VistaGuard` (pantalla "sin acceso") | Task 7 |
| §4 sidebar filtrada + ítems Usuarios/Roles | Task 6 |
| §4 `/crm/usuarios` (acordeón, checklist, restablecer, reset pass, nuevo) | Tasks 5, 6 |
| §4 `/crm/roles` (acordeón por rol, guardar) | Tasks 5, 6 |
| §5 testing (unit, servicio, backend, componentes, RLS) | cada task + Task 8 |
| §7 Juani + Victor creables desde UI | Task 8 |

**Placeholders:** ninguno de lógica. Task 1 aclara la restricción de `alter type ... add value` fuera de transacción con la forma exacta de aplicarlo.

**Consistencia de tipos:**
- `vistasEfectivas(usuario, rolesMap)` (Task 2) — `useMisVistas` (Task 3), `UsuarioRow` (Task 5) y `VistaGuard` (Task 7) la usan con `rolesMap = { [rol]: { vistas_default } }` (forma de `useRolesCrm().data` mapeada).
- `actualizarUsuario(id, parche)` con `parche.vistas_override: string[] | null` (Task 3) — `UsuarioRow.onCambiar` (Task 5) lo llama con `{ vistas_override: [...] }` o `{ vistas_override: null }`.
- `crearUsuario({ usuario, nombre, rol, password })` (Task 3) → `fetch` a `/api/crm/usuarios` con `accion:'crear'` — `handleUsuarios` (Task 4) espera ese shape y usa `emailDeUsuario(usuario)`.
- `VISTAS[].key` ∈ `{panel,clientes,vehiculos,tareas,usuarios,roles}` (Task 2) — mismos strings en `crm.roles.vistas_default` seed (Task 1), en el filtro del `NAV` (Task 6) y en `vistaDeRuta` (Task 2).
- `useMisVistas() → { vistas: string[], cargando: boolean }` (Task 3) — consumido por `CrmSidebar` (Task 6) y `VistaGuard` (Task 7).
