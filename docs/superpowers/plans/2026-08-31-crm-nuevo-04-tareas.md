# CRM nuevo — Plan 4: Módulo Tareas

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use `- [ ]` checkboxes.

**Goal:** El módulo Tareas unificado en `/crm/tareas` — lista agrupada por vencimiento, alta/edición modal, toggle done, badge en sidebar, pestaña en la ficha de cliente, aviso al entrar al CRM.

**Architecture:** Una tabla `crm.tareas` con RLS por rol. Servicios PostgREST + react-query + zustand. Componentes en `src/crm/**` reusando `common/*` y `.glass`. Sin migración (tablas legacy vacías).

**Tech Stack:** React 19, Vite 8, Tailwind v4, `@supabase/supabase-js` v2, `@tanstack/react-query` v5, `zustand`, `react-hook-form` + `zod`, `date-fns`, `lucide-react`, `sonner`, Vitest 2 + Testing Library, `pg` (scripts).

**Spec:** `docs/superpowers/specs/2026-08-31-crm-nuevo-tareas-design.md`

## Global Constraints

- Estética glass: `@/components/common/*`, tokens `--c-*` (`text-ink`, `text-ink-3`, `border-line`, `text-neifert`), `font-display` en títulos. base-nova solo `DropdownMenu` (menú de fila) dentro de `.crm-root`.
- Datos: schema `crm`. `id` uuid. RLS: `crm.es_usuario()` select/insert/update; `crm.mi_rol()='admin'` delete. Vendedor archiva (`archivado_en`).
- Auditoría: mutación de tarea registra `crm.eventos` **solo si** `cliente_id` o `vehiculo_id` presente (`registrar({ entidad, entidadId, tipo:'tarea', datos:{ titulo, done } })`).
- DDL por `pg` con `DATABASE_URL` de `.env`.
- ESM, alias `@`→`src`. Tests verdes con `npm test`.
- Commits: body cierra con `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`. Rama `feat/crm-legacy-clone`. No `main`.
- Español en columnas/copy.

---

## File Structure

| File | Responsabilidad |
|------|------------------|
| `supabase/crm_tareas_schema.sql` | enum `prioridad_tarea` + `crm.tareas` + triggers + RLS + grants. |
| `src/crm/lib/tareaSchema.js` | zod del form. |
| `src/crm/lib/agruparTareas.js` | `agrupar(tareas, hoy)` → `{ vencidas, hoy, semana, despues, hechas }`. |
| `src/crm/services/tareas.service.js` | CRUD + `toggleDone` + `contarPendientesHoy` + archivar/eliminar. |
| `src/crm/hooks/useTareas.js` | `useTareas(opts)`, `useTareaMutations()`, `useTareasPendientesHoy()`. |
| `src/crm/store/useTareasFiltros.js` | zustand. |
| `src/crm/components/TareaRow.jsx` | fila de tarea (checkbox, chips, menú). |
| `src/crm/components/TareaFormModal.jsx` | alta/edición (overlay, patrón `ClienteFormModal`). |
| `src/crm/components/TareaFilters.jsx` | panel de filtros. |
| `src/crm/components/TareasDeCliente.jsx` | lista + alta inline para la ficha del cliente. |
| `src/crm/pages/TareasListPage.jsx` | página principal. |
| `src/crm/components/CrmSidebar.jsx` | (modificar) ítem "Tareas" + badge. |
| `src/crm/components/CrmLayout.jsx` | (modificar) aviso al entrar (`useAvisoTareasHoy` o inline). |
| `src/crm/pages/ClienteDetallePage.jsx` | (modificar) pestaña "Tareas". |
| `src/crm/lib/textoEvento.js` | (modificar) `case 'tarea'`. |
| `src/routes/AppRouter.jsx` | (modificar) ruta `/crm/tareas`. |
| `scripts/verificar-crm-rls.mjs` | (modificar) checks de tareas. |

---

## Task 1: Schema `crm.tareas`

**Files:** Create `supabase/crm_tareas_schema.sql`; Test `src/crm/__tests__/crmTareasSchema.test.js`.

- [ ] **Step 1: Test de drift (falla primero)** — el SQL contiene: `create type crm.prioridad_tarea as enum ('baja','normal','alta')`, `table if not exists crm.tareas`, `before update on crm.tareas`, `create policy` de delete que menciona `admin`, columnas `completada_en` y `archivado_en`.

- [ ] **Step 2: Escribir el SQL** (idempotente):

```sql
do $$ begin
  create type crm.prioridad_tarea as enum ('baja','normal','alta');
exception when duplicate_object then null; end $$;

create table if not exists crm.tareas (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  descripcion text,
  fecha date not null,
  hora text,
  done boolean not null default false,
  prioridad crm.prioridad_tarea not null default 'normal',
  asignado_a uuid references crm.usuarios(id),
  cliente_id uuid references crm.clientes(id) on delete set null,
  vehiculo_id uuid references crm.vehiculos(id) on delete set null,
  creado_por uuid references crm.usuarios(id),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  completada_en timestamptz,
  archivado_en timestamptz
);
create index if not exists idx_crm_tar_done_fecha on crm.tareas(done, fecha);
create index if not exists idx_crm_tar_asignado on crm.tareas(asignado_a);
create index if not exists idx_crm_tar_cliente on crm.tareas(cliente_id);
create index if not exists idx_crm_tar_vehiculo on crm.tareas(vehiculo_id);

create or replace function crm.tarea_completada() returns trigger
  language plpgsql as $$
begin
  new.actualizado_en := now();
  if new.done and (old.done is distinct from new.done) then
    new.completada_en := now();
  elsif not new.done then
    new.completada_en := null;
  end if;
  return new;
end $$;

drop trigger if exists trg_tarea_completada on crm.tareas;
create trigger trg_tarea_completada before update on crm.tareas
  for each row execute function crm.tarea_completada();

alter table crm.tareas enable row level security;
drop policy if exists tareas_select on crm.tareas;
create policy tareas_select on crm.tareas for select using (crm.es_usuario());
drop policy if exists tareas_insert on crm.tareas;
create policy tareas_insert on crm.tareas for insert with check (crm.es_usuario());
drop policy if exists tareas_update on crm.tareas;
create policy tareas_update on crm.tareas for update using (crm.es_usuario());
drop policy if exists tareas_delete_admin on crm.tareas;
create policy tareas_delete_admin on crm.tareas for delete using (crm.mi_rol() = 'admin');

grant select, insert, update, delete on all tables in schema crm to authenticated;
grant all privileges on all tables in schema crm to service_role;
```

- [ ] **Step 3: Test verde.**
- [ ] **Step 4: Aplicar por pg** (`node --env-file=.env -e "...readFileSync('supabase/crm_tareas_schema.sql')..."`).
- [ ] **Step 5: Commit** `feat(crm): schema tareas`.

---

## Task 2: `tareaSchema` + `agruparTareas`

**Files:** Create `src/crm/lib/tareaSchema.js`, `src/crm/lib/agruparTareas.js`; Test `src/crm/__tests__/tareaSchema.test.js`, `src/crm/__tests__/agruparTareas.test.js`.

**Interfaces:**
- `tareaSchema` (zod): `titulo` `min(1,'El título es obligatorio')`; `fecha` string `min(1)`; `prioridad` `enum(['baja','normal','alta']).default('normal')`; `descripcion`/`hora`/`asignado_a`/`cliente_id`/`vehiculo_id` opcionales (preprocess `''→undefined`).
- `agrupar(tareas, hoy = new Date())` → `{ vencidas, hoy: hoyArr, semana, despues, hechas }`. Reglas: `done` → `hechas`. Si no: `fecha < hoy` (por día) → `vencidas`; `fecha === hoy` → `hoy`; `fecha <= hoy + 7d` → `semana`; resto → `despues`. Cada grupo ordenado por `fecha` asc, luego `hora` asc (nulls last).

- [ ] **Step 1: Tests (fallan primero)**
  - `tareaSchema.test.js`: `{titulo:'x', fecha:'2026-09-01'}` ok; título vacío error; fecha vacía error.
  - `agruparTareas.test.js`: con `hoy = 2026-08-31`, tareas de fecha 08-29 (vencida), 08-31 (hoy), 09-03 (semana), 09-20 (después), y una `done` → cada una cae en su grupo.

- [ ] **Step 2: Implementar** (usar `date-fns`: `parseISO`, `isBefore`, `isSameDay`, `addDays`, `startOfDay`).
- [ ] **Step 3: Tests verde + commit** `feat(crm): tareaSchema + agrupamiento por vencimiento`.

---

## Task 3: `tareas.service` + hooks + store

**Files:** Create `src/crm/services/tareas.service.js`, `src/crm/hooks/useTareas.js`, `src/crm/store/useTareasFiltros.js`; modify `src/crm/lib/textoEvento.js`; Test `src/crm/__tests__/tareas.service.test.js`.

**Interfaces:**
- `listar({ filtros = {}, incluirHechas = false, incluirArchivadas = false })` → array. `select('*, asignado:usuarios!tareas_asignado_a_fkey(nombre), cliente:clientes(nombre), vehiculo:vehiculos(marca,modelo)')` — **verificar los nombres de FK** con `\d crm.tareas` o usar la sintaxis `asignado:asignado_a(nombre)` si PostgREST la resuelve. `filtros`: `asignadoA` (`eq`), `mias` (`eq('asignado_a', usuarioActual)` — el hook pasa el id), `prioridad[]` (`in`), `soloConCliente` (`not('cliente_id','is',null)`), `clienteId` (`eq`). `incluirHechas=false` → `.eq('done', false)`. `incluirArchivadas=false` → `.is('archivado_en', null)`. `.order('fecha').order('hora', { nullsFirst: false })`.
- `contarPendientesHoy(usuarioId)` → `select('id', { count:'exact', head:true }).eq('done', false).lte('fecha', hoyISO).eq('asignado_a', usuarioId)` → devuelve `count`.
- `crear(data, autorId)` → insert `{ ...data, creado_por: autorId }` + `select()`. Si `fila.cliente_id` o `fila.vehiculo_id` → `registrar({ entidad: fila.cliente_id ? 'cliente' : 'vehiculo', entidadId: fila.cliente_id ?? fila.vehiculo_id, tipo:'tarea', datos:{ titulo: fila.titulo, done:false }, usuarioId: autorId })`.
- `actualizar(id, data, autorId)` → update + (mismo criterio de evento con `datos:{ titulo, done }`).
- `toggleDone(id, done, autorId)` → `update({ done })` (el trigger setea `completada_en`) + evento si corresponde (necesita releer la fila para el `cliente_id`/`vehiculo_id`/`titulo` — hacer `.select()` en el update).
- `archivar(id, autorId)` / `desarchivar(id, autorId)` / `eliminar(id)`.
- `useTareas(opts)` (`['crm','tareas', opts]`), `useTareaMutations()` (`{ crear, actualizar, toggleDone, archivar, desarchivar, eliminar }`, invalidan `['crm','tareas']` + `['crm','tareas','pendientes-hoy']` + toast), `useTareasPendientesHoy()` (`['crm','tareas','pendientes-hoy', perfil.id]`, `enabled: !!perfil.id`).
- `useTareasFiltros`: `{ filtros:{ asignadoA:'todos', prioridad:[], soloConCliente:false }, incluirHechas:false, incluirArchivadas:false, setters, contarFiltrosActivos }`.
- `textoEvento`: `case 'tarea': return \`${quien} ${d.done ? 'completó' : 'creó'} una tarea: ${d.titulo}\``.

- [ ] **Step 1: Test (falla primero)** — `listar` con `incluirHechas:false` aplica `eq('done', false)` y `is('archivado_en', null)`; `crear` con `cliente_id` llama `registrar` con `entidad:'cliente'`; `crear` sin cliente/vehículo NO llama `registrar`; `toggleDone(id, true)` hace `update({done:true})`; `contarPendientesHoy` arma los filtros.

- [ ] **Step 2: Implementar.** Mock `eventos.service` en el test.
- [ ] **Step 3: `npm test` + commit** `feat(crm): servicio/hooks/store de tareas`.

---

## Task 4: `TareaRow` + `TareaFilters` + `TareaFormModal`

**Files:** Create los 3 componentes; Test `src/crm/__tests__/TareaRow.test.jsx`, `src/crm/__tests__/TareaFormModal.test.jsx`, `src/crm/__tests__/TareaFilters.test.jsx`.

**Interfaces:**
- `TareaRow({ tarea, onToggle, onEditar, onArchivar, onEliminar, puedeEliminar })` — `<div className="glass rounded-2xl">`: checkbox (`onToggle(tarea, !tarea.done)`), título (tachado si `done`), chips (`prioridad==='alta'` → Badge rojo; `cliente` → `<Link to={/crm/clientes/:id}>` Badge neutro; `vehiculo` → Badge neutro), `fecha` (+ `hora`), iniciales de `asignado`, `DropdownMenu` (Editar, Archivar; si `puedeEliminar` → Eliminar con confirm `Modal`).
- `TareaFilters()` — controlado por `useTareasFiltros`: `Select` asignado a (`useCrmUsuarios` + "Todos" + "Mías"), chips de prioridad, checkbox "solo con cliente", "incluir hechas", "incluir archivadas", botón "Limpiar".
- `TareaFormModal({ open, onClose, tarea, clienteFijo, onGuardado })` — overlay (copiar de `ClienteFormModal`). RHF + `zodResolver(tareaSchema)`. Campos: `titulo*`, `descripcion` (textarea), `fecha*` (`type=date`, default hoy), `hora` (`type=time`), `prioridad` (`Select`), `asignado_a` (`Select` de `useCrmUsuarios`, default = `useCrmPerfil().id`), `cliente_id` (`Select` de `useClientes({ pageSize: 500 }).data.filas` mapeado a `{id,label:nombre}`, con opción vacía; si `clienteFijo` → valor fijo + campo deshabilitado/oculto), `vehiculo_id` (`Select` de vehículos `disponible`, opcional). Si `tarea` → modo edición (`useTareaMutations().actualizar`), si no → `crear`. Éxito → `onClose()` + `onGuardado?.()`.

- [ ] **Step 1: Tests (fallan primero)**
  - `TareaFormModal`: título vacío → error, no guarda; con `clienteFijo='c1'` el submit incluye `cliente_id:'c1'` y el select de cliente no es editable. (Mockear `useTareaMutations`, `useCrmUsuarios`, `useClientes`, `useCrmPerfil`.)
  - `TareaRow`: click en el checkbox llama `onToggle(tarea, true)`; sin `puedeEliminar` no hay opción Eliminar.
  - `TareaFilters`: toggle chip prioridad; "Limpiar" resetea.

- [ ] **Step 2: Implementar.**
- [ ] **Step 3: `npm test` + `npm run build` + commit** `feat(crm): fila, filtros y form modal de tareas`.

---

## Task 5: `TareasListPage` + ruta + sidebar (ítem + badge) + aviso al entrar

**Files:** Create `src/crm/pages/TareasListPage.jsx`; modify `src/crm/components/CrmSidebar.jsx`, `src/crm/components/CrmLayout.jsx`, `src/routes/AppRouter.jsx`; Test `src/crm/__tests__/TareasListPage.test.jsx`, `src/crm/__tests__/CrmSidebar.test.jsx` (badge).

**Interfaces:**
- `TareasListPage` — header `h1` "Tareas" + `Button` "Nueva tarea" (abre `TareaFormModal`). Buscador NO (poco volumen) — o sí, filtro por texto del título client-side (opcional). Botón "Filtros" (oculto por defecto, badge de activos) → `{mostrarFiltros && <TareaFilters/>}`. `useTareas({ ...store })` → `agrupar(tareas)`. Render de los 5 grupos con encabezado (`Vencidas` en `text-neifert`, resto `text-ink-3`) y `TareaRow` por item; `Hechas` colapsado (toggle). `useCrmRealtime('tareas', ['crm','tareas'])`. Empty state. `useTareaMutations` para `toggleDone`/`archivar`/`eliminar`; editar → abre el modal con `tarea`.
- `CrmSidebar` NAV: agregar `{ to:'/crm/tareas', label:'Tareas', icon: ListTodo }` (entre Clientes y Vehículos). Junto al label, si `useTareasPendientesHoy().data > 0` → `<span>` badge rojo con el número.
- `CrmLayout`: montar `useAvisoTareasHoy()` (hook nuevo en `src/crm/hooks/` o inline): si `isSupabaseConfigured` && `crmPerfil` && `sessionStorage.getItem('nf-aviso-tareas') !== hoyISO` && `useTareasPendientesHoy().data > 0` → `toast(\`Tenés N tareas que vencen hoy\`, { action: { label: 'Ver', onClick: () => navigate('/crm/tareas') } })` y set `sessionStorage`. Un solo efecto, guardas para no repetir.
- `AppRouter`: `const TareasListPage = lazy(...)`; `<Route path="/crm/tareas" element={<TareasListPage />} />` dentro del grupo `CrmLayout`.

- [ ] **Step 1: Tests (fallan primero)**
  - `TareasListPage`: con `useTareas` mockeado devolviendo 1 vencida + 1 de hoy + 1 hecha, renderiza los encabezados "Vencidas" y "Hoy" y los títulos; "Nueva tarea" abre el modal (aparece "Título").
  - `CrmSidebar.test.jsx`: con `useTareasPendientesHoy` → `{ data: 3 }`, el ítem Tareas muestra "3". (Mockear los hooks; `CrmSidebar` ya usa `useCrmPerfil`.)

- [ ] **Step 2: Implementar** los cambios.
- [ ] **Step 3: `npm test` + `npm run build` + `npm run lint` (sin errores nuevos en `src/crm`) + commit** `feat(crm): pagina de tareas + ruta + sidebar con badge + aviso al entrar`.

---

## Task 6: Pestaña "Tareas" en la ficha del cliente

**Files:** Create `src/crm/components/TareasDeCliente.jsx`; modify `src/crm/pages/ClienteDetallePage.jsx`; Test `src/crm/__tests__/TareasDeCliente.test.jsx`.

**Interfaces:**
- `TareasDeCliente({ clienteId })` — `useTareas({ filtros:{ clienteId }, incluirHechas:true })`; lista de `TareaRow` (sin agrupar, orden por fecha); botón "Nueva tarea" → `TareaFormModal` con `clienteFijo={clienteId}`. `useTareaMutations` para toggle/editar/archivar.
- `ClienteDetallePage`: agregar `<TabsTrigger value="tareas">Tareas</TabsTrigger>` y `<TabsContent value="tareas"><TareasDeCliente clienteId={id} /></TabsContent>` (entre "Seguimiento" e "Historial").

- [ ] **Step 1: Test (falla primero)** — `TareasDeCliente` con `useTareas` → 1 tarea, la muestra; "Nueva tarea" abre el modal. `ClienteDetallePage.test.jsx` (extender): ahora hay 6 pestañas incluida "Tareas".
- [ ] **Step 2: Implementar.**
- [ ] **Step 3: `npm test` + commit** `feat(crm): pestana Tareas en la ficha del cliente`.

---

## Task 7: Verificación

**Files:** modify `scripts/verificar-crm-rls.mjs`.

- [ ] **Step 1:** agregar checks: vendedor `POST crm.tareas` (`{titulo:'TEST', fecha:'2026-09-01'}`) → 201; `PATCH` → 200; `DELETE` → 0 filas (RLS); admin `DELETE` → 1 fila (limpieza).
- [ ] **Step 2:** `node --env-file=.env scripts/verificar-crm-rls.mjs` → todos PASS.
- [ ] **Step 3: Smoke manual** — `npm run dev` → `/crm/tareas`: crear tareas con y sin cliente/vehículo; ver agrupación por vencimiento; marcar done (pasa a "Hechas", el badge de sidebar baja); abrir la ficha de un cliente con una tarea linkeada → pestaña Tareas la muestra + su historial tiene el evento; recargar el CRM → aviso "Tenés N tareas que vencen hoy".
- [ ] **Step 4: Commit** `test(crm): verificacion RLS del modulo tareas`.

---

## Self-Review

**Cobertura del spec:**

| Spec | Task |
|---|---|
| §2 schema (enum + tabla + triggers + RLS) | Task 1 |
| §3 lista agrupada por vencimiento | Task 2 (`agruparTareas`), Task 5 |
| §3 alta/edición modal | Task 4 (`TareaFormModal`) |
| §3 filtros (asignado, prioridad, con cliente, hechas, archivadas) | Task 3 (store/servicio), Task 4 (`TareaFilters`) |
| §3 sidebar ítem + badge pendientes-hoy | Task 5 |
| §3 pestaña Tareas en ficha de cliente | Task 6 |
| §3 aviso `toast` al entrar (1×/sesión) | Task 5 (`useAvisoTareasHoy` en `CrmLayout`) |
| §4 servicios/hooks/lib | Tasks 2, 3 |
| §4 auditoría condicional (evento solo si cliente/vehículo) | Task 3 |
| §4 `textoEvento` case `tarea` | Task 3 |
| §5 testing (unit, servicio, componentes, RLS) | cada task + Task 7 |
| §6 fuera de alcance | respetado (sin recurrencia/push/calendario) |

**Placeholders:** Task 3 marca "verificar nombres de FK de `crm.tareas` con `\d`" — verificación previa explícita (los embeds PostgREST `asignado:asignado_a(nombre)` requieren el nombre de constraint o la columna; se confirma al implementar). No hay steps de código sin implementación.

**Consistencia de tipos:**
- `agrupar(tareas, hoy) → { vencidas, hoy, semana, despues, hechas }` (Task 2) — consumido por `TareasListPage` (Task 5) con esas 5 keys.
- `useTareaMutations()` → `{ crear, actualizar, toggleDone, archivar, desarchivar, eliminar }` (Task 3) — `TareaRow` usa `onToggle`/`onEditar`/`onArchivar`/`onEliminar` que la page/lista cablean a esas mutations (Tasks 5, 6).
- `TareaFormModal({ open, onClose, tarea, clienteFijo, onGuardado })` (Task 4) — usado por `TareasListPage` (sin `clienteFijo`) y `TareasDeCliente` (con `clienteFijo`).
- `contarPendientesHoy(usuarioId) → number` (Task 3) — `useTareasPendientesHoy` lo expone como `data` (número), consumido por el badge de sidebar y `useAvisoTareasHoy` (Task 5).
- `registrar({ entidad, entidadId, tipo:'tarea', datos:{ titulo, done } })` (Task 3) — `HistorialTimeline` + `textoEvento` (Task 3) manejan `tipo:'tarea'`; `entidad` es `'cliente'` o `'vehiculo'`, que `listarDeEntidad` (ya genérico) resuelve.
