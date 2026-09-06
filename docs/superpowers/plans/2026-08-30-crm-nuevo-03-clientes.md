# CRM nuevo — Plan 3: Módulo Clientes

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El módulo Clientes en `/crm/clientes` — lista con filtros, alta/edición, ficha con pestañas (Datos · Intereses · Autos en entrega · Seguimiento · Historial), cierre de venta cliente↔vehículo, sobre el schema `crm` y con la estética glass del sitio. Migra los 175 clientes de `crm_legacy`.

**Architecture:** Mismo patrón que el módulo Vehículos (Planes 1–2): tablas en `crm` con RLS por rol, servicios contra PostgREST (`supabase.schema('crm')`), react-query + zustand, componentes en `src/crm/**` reusando `src/components/common/*` y `.glass`. Migración de datos vía función SQL idempotente ejecutada por conexión Postgres directa.

**Tech Stack:** React 19, Vite 8, Tailwind v4 (glass), `@supabase/supabase-js` v2, `@tanstack/react-query` v5, `zustand`, `react-hook-form` + `zod`, `date-fns`, `lucide-react`, `sonner`, Vitest 2 + Testing Library, `pg` (solo scripts).

**Spec:** `docs/superpowers/specs/2026-08-30-crm-nuevo-clientes-design.md`

## Global Constraints

- **Estética:** reusar `@/components/common/*` (Button/Input/Select/Badge/Modal/GlassCard/Pagination/Spinner) y clases glass. Tokens `--c-*` (`text-ink`, `text-ink-3`, `border-line`, `text-neifert`). Títulos `font-display`. base-nova solo `Tabs`/`DropdownMenu`/`Sheet` dentro de `.crm-root`.
- **Datos:** schema `crm`. `id` uuid propio + `id_legacy text unique`. Toda tabla lleva `archivado_en`. RLS: `crm.es_usuario()` para select/insert/update; `crm.mi_rol()='admin'` para delete.
- **Auditoría:** toda mutación registra `crm.eventos` (`registrar({entidad,entidadId,tipo,datos,usuarioId})`). `creado_por`/`editado_por` = `useCrmPerfil().id`.
- **Migración/DDL:** aplicar por `pg` con `DATABASE_URL` de `.env` (ya está), patrón de `scripts/migrate-legacy-to-crm.mjs`. Pass de RLS: `service_role` ya tiene grants por `alter default privileges`; correr igual los `grant on all tables` por las nuevas.
- **ESM**, alias `@` → `src`. Todo en `src/crm/**`. Tests verdes con `npm test`.
- **Commits:** body cierra con `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`. Rama `feat/crm-legacy-clone` (todo ahí). No commitear a `main`.
- **Español** en columnas, copy y nombres de dominio.

---

## File Structure

| File | Responsabilidad |
|------|------------------|
| `supabase/crm_clientes_schema.sql` | enum `estado_cliente` + `crm.clientes` + `cliente_intereses` + `cliente_autos_entrega` + `venta_cliente_id`/`fecha_venta` en `vehiculos` + trigger + RLS + grants. |
| `supabase/crm_clientes_migracion.sql` | `crm.migrar_clientes_desde_legacy()`. |
| `scripts/migrate-clientes-to-crm.mjs` | corre la migración por `pg` + conteos. |
| `src/crm/lib/clienteSchema.js` | `zod` del form. |
| `src/crm/lib/formatCliente.js` | `lineaInteres(c)`, `statusVariant(status)`, `CANAL_OPCIONES`. |
| `src/crm/services/clientes.service.js` | CRUD + `registrarVenta` + intereses/autos-entrega/contactos. |
| `src/crm/services/eventos.service.js` | (modificar) `listarDeEntidad(entidad, id)` + wrapper `listarDeVehiculo`. |
| `src/crm/hooks/useEventos.js` | (nuevo) `useEventos(entidad, id)`; `useEventosVehiculo` pasa a wrapper. |
| `src/crm/hooks/useClientes.js` | `useClientes(opts)`, `useCliente(id)`, `useClienteMutations()`, `useClienteRelacionados(id)`. |
| `src/crm/store/useClientesFiltros.js` | zustand (patrón `useVehiculosFiltros`). |
| `src/crm/components/ClienteFilters.jsx` | panel de filtros (glass, oculto por defecto en la page). |
| `src/crm/components/ClienteTable.jsx` / `ClienteCard.jsx` | lista. |
| `src/crm/components/ClienteForm.jsx` | alta/edición (RHF + zod). |
| `src/crm/components/FichaCliente.jsx` | tab Datos + acciones. |
| `src/crm/components/InteresesCliente.jsx` | lista editable de `cliente_intereses`. |
| `src/crm/components/AutosEntregaCliente.jsx` | lista editable de `cliente_autos_entrega`. |
| `src/crm/components/SeguimientoCliente.jsx` | compositor + lista de contactos. |
| `src/crm/components/RegistrarVentaModal.jsx` | elegir vehículo disponible → cerrar venta. |
| `src/crm/components/HistorialTimeline.jsx` | (modificar) prop `entidad` (default `'vehiculo'`). |
| `src/crm/lib/textoEvento.js` | (modificar) casos `contacto` y `venta`. |
| `src/crm/pages/ClientesListPage.jsx` / `ClienteNuevoPage.jsx` / `ClienteDetallePage.jsx` / `ClienteEditarPage.jsx` | páginas. |
| `src/crm/components/CrmSidebar.jsx` | (modificar) ítem "Clientes". |
| `src/routes/AppRouter.jsx` | (modificar) rutas `/crm/clientes/*`. |
| `scripts/verificar-crm-rls.mjs` | (modificar) checks de clientes. |

---

## Task 1: Schema `crm` — clientes + relaciones

**Files:**
- Create: `supabase/crm_clientes_schema.sql`
- Test: `src/crm/__tests__/crmClientesSchema.test.js`

**Interfaces:** produce `crm.clientes`, `crm.cliente_intereses`, `crm.cliente_autos_entrega`, enum `crm.estado_cliente`, columnas `crm.vehiculos.venta_cliente_id` + `fecha_venta`, RLS.

- [ ] **Step 1: Test de drift (falla primero)**

```js
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
const sql = readFileSync(resolve('supabase/crm_clientes_schema.sql'), 'utf8').toLowerCase()

describe('crm_clientes_schema.sql', () => {
  it('enum estado_cliente con 4 valores', () => {
    expect(sql).toContain("create type crm.estado_cliente as enum ('activo','en_seguimiento','vendido','perdido')")
  })
  it('3 tablas + columnas de venta en vehiculos', () => {
    for (const t of ['crm.clientes', 'crm.cliente_intereses', 'crm.cliente_autos_entrega']) {
      expect(sql).toContain(`table if not exists ${t}`)
    }
    expect(sql).toContain('add column if not exists venta_cliente_id')
    expect(sql).toContain('add column if not exists fecha_venta')
  })
  it('RLS: delete solo admin en clientes', () => {
    expect(sql).toMatch(/create policy[^;]+on crm\.clientes[^;]+for delete[^;]+admin/s)
  })
  it('trigger actualizado_en en clientes', () => {
    expect(sql).toContain('before update on crm.clientes')
  })
})
```

Run: `npm test -- crmClientesSchema` → FAIL.

- [ ] **Step 2: Escribir `supabase/crm_clientes_schema.sql`** (idempotente)

```sql
-- CRM nuevo — módulo Clientes. Ejecutar en SQL Editor o por pg. Idempotente.
do $$ begin
  create type crm.estado_cliente as enum ('activo','en_seguimiento','vendido','perdido');
exception when duplicate_object then null; end $$;

create table if not exists crm.clientes (
  id uuid primary key default gen_random_uuid(),
  id_legacy text unique,
  nombre text not null,
  telefono text,
  localidad text,
  fecha_cumple date,
  status crm.estado_cliente not null default 'activo',
  canal text,
  presupuesto numeric,
  marca_interes text,
  modelo_interes text,
  tipo_interes text,
  trans_interes text,
  anio_min int,
  anio_max int,
  notas text,
  interes_cero_km boolean not null default false,
  cero_km jsonb,
  tiene_auto_entrega boolean not null default false,
  venta_vehiculo_id uuid references crm.vehiculos(id) on delete set null,
  fecha_venta date,
  creado_por uuid references crm.usuarios(id),
  editado_por uuid references crm.usuarios(id),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  archivado_en timestamptz
);
create index if not exists idx_crm_cli_status on crm.clientes(status);
create index if not exists idx_crm_cli_canal on crm.clientes(canal);
create index if not exists idx_crm_cli_archivado on crm.clientes(archivado_en);
create index if not exists idx_crm_cli_marca on crm.clientes(marca_interes);

create table if not exists crm.cliente_intereses (
  id bigserial primary key,
  cliente_id uuid not null references crm.clientes(id) on delete cascade,
  marca text,
  modelo text
);
create index if not exists idx_crm_cli_int on crm.cliente_intereses(cliente_id);

create table if not exists crm.cliente_autos_entrega (
  id bigserial primary key,
  cliente_id uuid not null references crm.clientes(id) on delete cascade,
  marca text, modelo text, version text, anio int, km int, color text, trans text, notas text
);
create index if not exists idx_crm_cli_ae on crm.cliente_autos_entrega(cliente_id);

alter table crm.vehiculos add column if not exists venta_cliente_id uuid references crm.clientes(id) on delete set null;
alter table crm.vehiculos add column if not exists fecha_venta date;

drop trigger if exists trg_cli_actualizado on crm.clientes;
create trigger trg_cli_actualizado before update on crm.clientes
  for each row execute function crm.set_actualizado_en();

alter table crm.clientes enable row level security;
alter table crm.cliente_intereses enable row level security;
alter table crm.cliente_autos_entrega enable row level security;

-- por cada tabla: select/insert/update es_usuario(); delete admin (solo clientes;
-- las hijas delete es_usuario() porque se reconstruyen). Escribir explícitas:
drop policy if exists clientes_select on crm.clientes;
create policy clientes_select on crm.clientes for select using (crm.es_usuario());
drop policy if exists clientes_insert on crm.clientes;
create policy clientes_insert on crm.clientes for insert with check (crm.es_usuario());
drop policy if exists clientes_update on crm.clientes;
create policy clientes_update on crm.clientes for update using (crm.es_usuario());
drop policy if exists clientes_delete_admin on crm.clientes;
create policy clientes_delete_admin on crm.clientes for delete using (crm.mi_rol() = 'admin');

drop policy if exists cli_int_all on crm.cliente_intereses;
create policy cli_int_all on crm.cliente_intereses for all using (crm.es_usuario()) with check (crm.es_usuario());
drop policy if exists cli_ae_all on crm.cliente_autos_entrega;
create policy cli_ae_all on crm.cliente_autos_entrega for all using (crm.es_usuario()) with check (crm.es_usuario());

grant select, insert, update, delete on all tables in schema crm to authenticated;
grant all privileges on all tables in schema crm to service_role;
grant usage, select on all sequences in schema crm to authenticated, service_role;
```

- [ ] **Step 3: Test verde** — `npm test -- crmClientesSchema` → PASS.

- [ ] **Step 4: Aplicar por pg**

```bash
node --env-file=.env -e "const {Client}=require('pg');const fs=require('fs');(async()=>{const c=new Client({connectionString:process.env.DATABASE_URL});await c.connect();await c.query(fs.readFileSync('supabase/crm_clientes_schema.sql','utf8'));console.log('OK');await c.end()})().catch(e=>{console.error(e.message);process.exit(1)})"
```

- [ ] **Step 5: Commit**

```bash
git add supabase/crm_clientes_schema.sql src/crm/__tests__/crmClientesSchema.test.js
git commit -m "$(printf 'feat(crm): schema clientes (+ intereses, autos entrega, venta)\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>')"
```

---

## Task 2: Migración de clientes

**Files:**
- Create: `supabase/crm_clientes_migracion.sql`, `scripts/migrate-clientes-to-crm.mjs`
- Test: `src/crm/__tests__/crmClientesMigracion.test.js`

**Interfaces:** `crm.migrar_clientes_desde_legacy()` → `table(entidad text, filas bigint)`.

- [ ] **Step 1: Test de forma (falla primero)** — el SQL contiene `function crm.migrar_clientes_desde_legacy`, `from crm_legacy.clientes`, `into crm.clientes`, `on conflict (id_legacy) do update`, y referencias a `crm_legacy.cliente_intereses` / `crm_legacy.cliente_autos_entrega`.

- [ ] **Step 2: Escribir `supabase/crm_clientes_migracion.sql`**

`crm.migrar_clientes_desde_legacy()` plpgsql security definer:
- `insert into crm.clientes (id_legacy, nombre, telefono, localidad, fecha_cumple, status, canal, presupuesto, marca_interes, modelo_interes, tipo_interes, trans_interes, anio_min, anio_max, notas, interes_cero_km, cero_km, tiene_auto_entrega, venta_vehiculo_id, fecha_venta, creado_en, actualizado_en) select l.id_legacy, coalesce(nullif(trim(l.nombre),''),'S/N'), l.telefono, l.localidad, l.fecha_cumple, (case lower(coalesce(l.status,'')) when 'vendido' then 'vendido' when 'perdido' then 'perdido' else 'activo' end)::crm.estado_cliente, l.canal, l.presupuesto, l.marca_interes, l.modelo_interes, l.tipo_interes, l.trans_interes, l.anio_min, l.anio_max, l.notas, coalesce(l.interes_cero_km,false), l.cero_km, coalesce(l.tiene_auto_entrega,false), (select v.id from crm.vehiculos v where v.id_legacy = l.venta_vehiculo_id), l.fecha_venta, coalesce(l.created_at, now()), coalesce(l.updated_at, now()) from crm_legacy.clientes l on conflict (id_legacy) do update set nombre=excluded.nombre, telefono=excluded.telefono, localidad=excluded.localidad, fecha_cumple=excluded.fecha_cumple, status=excluded.status, canal=excluded.canal, presupuesto=excluded.presupuesto, marca_interes=excluded.marca_interes, modelo_interes=excluded.modelo_interes, tipo_interes=excluded.tipo_interes, trans_interes=excluded.trans_interes, anio_min=excluded.anio_min, anio_max=excluded.anio_max, notas=excluded.notas, interes_cero_km=excluded.interes_cero_km, cero_km=excluded.cero_km, tiene_auto_entrega=excluded.tiene_auto_entrega, venta_vehiculo_id=excluded.venta_vehiculo_id, fecha_venta=excluded.fecha_venta, actualizado_en=excluded.actualizado_en;`
  - **Nota columnas del clon:** `crm_legacy.clientes` tiene `nombre, telefono, localidad, fecha_cumple, status, canal, presupuesto, marca_interes, modelo_interes, tipo_interes, trans_interes, anio_min, anio_max, notas, interes_cero_km, cero_km, tiene_auto_entrega, venta_vehiculo_id, fecha_venta, created_at, updated_at, id` (ver `transformCliente` en `src/server/legacyTransform.js`). Confirmar con `\d crm_legacy.clientes` (o `select column_name from information_schema.columns where table_schema='crm_legacy' and table_name='clientes'`) antes de escribir el select.
- Intereses: `delete from crm.cliente_intereses ci using crm.clientes c where ci.cliente_id = c.id and c.id_legacy is not null;` luego `insert into crm.cliente_intereses (cliente_id, marca, modelo) select c.id, li.marca, li.modelo from crm_legacy.cliente_intereses li join crm.clientes c on c.id_legacy = li.cliente_id;`
- Autos entrega: idéntico patrón (`crm_legacy.cliente_autos_entrega` tiene `cliente_id, marca, modelo, version, anio, km, color, trans, notas`).
- `return query select 'clientes', count(*) from crm.clientes where id_legacy is not null union all select 'intereses', count(*) from crm.cliente_intereses union all select 'autos_entrega', count(*) from crm.cliente_autos_entrega;`

- [ ] **Step 3: Test verde.**

- [ ] **Step 4: `scripts/migrate-clientes-to-crm.mjs`** — `pg`: aplica el `.sql` (crea la función), `select * from crm.migrar_clientes_desde_legacy()`, imprime filas.

- [ ] **Step 5: Correr** — `node --env-file=.env scripts/migrate-clientes-to-crm.mjs`. Esperado: ~175 clientes. Verificar con `select count(*) from crm.clientes;`.

- [ ] **Step 6: Commit**

```bash
git add supabase/crm_clientes_migracion.sql scripts/migrate-clientes-to-crm.mjs src/crm/__tests__/crmClientesMigracion.test.js
git commit -m "$(printf 'feat(crm): migracion de clientes crm_legacy -> crm\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>')"
```

---

## Task 3: `eventos.service` genérico + `HistorialTimeline` con `entidad`

**Files:**
- Modify: `src/crm/services/eventos.service.js`, `src/crm/components/HistorialTimeline.jsx`, `src/crm/lib/textoEvento.js`, `src/crm/hooks/useEventosVehiculo.js`
- Create: `src/crm/hooks/useEventos.js`
- Test: `src/crm/__tests__/eventos.service.test.js` (extender)

**Interfaces:**
- `listarDeEntidad(entidad, id)` — `select(...).eq('entidad', entidad).eq('entidad_id', String(id)).order('creado_en', desc)`. `listarDeVehiculo(id) = listarDeEntidad('vehiculo', id)` (wrapper, se mantiene).
- `useEventos(entidad, id)` → `['crm','eventos',entidad,id]`. `useEventosVehiculo(id) = useEventos('vehiculo', id)`.
- `HistorialTimeline({ entidad = 'vehiculo', entidadId })` — usa `useEventos(entidad, entidadId)`. (Actualizar los 2 call-sites en `VehiculoDetallePage`: `entidadId={id}`.)
- `textoEvento`: agregar `case 'contacto': return \`${quien}: ${d.texto ?? 'contacto'}\`` y `case 'venta': return \`${quien} registró la venta\``.

- [ ] **Step 1: Actualizar el test de `eventos.service`** — agregar caso `listarDeEntidad('cliente', 'c1')` filtra por `entidad='cliente'`. `listarDeVehiculo` sigue pasando.

- [ ] **Step 2: Implementar** los cambios. `useEventosVehiculo.js` queda como `export const useEventosVehiculo = (id) => useEventos('vehiculo', id)`.

- [ ] **Step 3: Ajustar `HistorialTimeline` + `VehiculoDetallePage`** (prop `entidadId`). Correr `npm test -- HistorialTimeline VehiculoDetallePage eventos` → verde.

- [ ] **Step 4: `npm test` + `npm run build` + commit**

```bash
git add src/crm/services/eventos.service.js src/crm/hooks/useEventos.js src/crm/hooks/useEventosVehiculo.js src/crm/components/HistorialTimeline.jsx src/crm/lib/textoEvento.js src/crm/pages/VehiculoDetallePage.jsx src/crm/__tests__/eventos.service.test.js
git commit -m "$(printf 'refactor(crm): eventos genericos por entidad + HistorialTimeline reusable\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>')"
```

---

## Task 4: `clientes.service` + hooks + store + lib

**Files:**
- Create: `src/crm/lib/clienteSchema.js`, `src/crm/lib/formatCliente.js`, `src/crm/services/clientes.service.js`, `src/crm/hooks/useClientes.js`, `src/crm/store/useClientesFiltros.js`
- Test: `src/crm/__tests__/clienteSchema.test.js`, `src/crm/__tests__/formatCliente.test.js`, `src/crm/__tests__/clientes.service.test.js`

**Interfaces:**
- `clienteSchema` (zod): `nombre` `min(1)`; `presupuesto`/`anio_min`/`anio_max` `>= 0` opcionales; `canal` string opcional; `interes_cero_km` bool; resto opcional. Preprocess `''→undefined` para numéricos (copiar helpers de `vehiculoSchema.js`).
- `formatCliente.js`: `lineaInteres(c)` → `"Nissan Kicks · SUV · 2017–2020 · hasta $30.000.000"` (omite ausentes); `statusVariant(status)` → `activo`→`green`, `en_seguimiento`→`amber`, `vendido`→`neutral`, `perdido`→`red`; `CANAL_OPCIONES = [{id,label}]` (`salon`→"Salón", `whatsapp`→"WhatsApp", `instagram`→"Instagram", `ya_cliente`→"Ya cliente", `web`→"Web", `otro`→"Otro").
- `clientes.service.js`:
  - `listar({ busqueda, filtros, orden, pagina, pageSize=20, incluirArchivados=false })` → `{ filas, total }`. Búsqueda `or('nombre.ilike.%q%,telefono.ilike.%q%,localidad.ilike.%q%')`. Filtros: `status` (`in`), `canal` (`in`), `conAutoEntrega` (`eq('tiene_auto_entrega', true)`), `interesCeroKm` (`eq`). `select('*, intereses:cliente_intereses(marca,modelo)', { count:'exact' })`.
  - `obtener(id)` → `select('*, intereses:cliente_intereses(*), autos_entrega:cliente_autos_entrega(*)')`.
  - `crear(data, autorId)` / `actualizar(id, data, autorId)` → evento `alta`/`edicion`.
  - `cambiarStatus(id, de, a, autorId)` → evento `cambio_estado {de,a}`.
  - `archivar/desarchivar/eliminar`.
  - `registrarVenta(clienteId, vehiculoId, autorId)` — 2 updates (cliente `status='vendido'` + `venta_vehiculo_id` + `fecha_venta`; vehículo `estado='vendido'` + `venta_cliente_id` + `fecha_venta`) + 2 eventos (`registrar({entidad:'cliente', tipo:'venta', datos:{vehiculo_id}})`, `registrar({entidad:'vehiculo', tipo:'cambio_estado', datos:{de,a:'vendido',cliente_id}})`).
  - `agregarInteres(clienteId, {marca,modelo})` / `quitarInteres(id)`.
  - `agregarAutoEntrega(clienteId, data)` / `quitarAutoEntrega(id)`.
  - `agregarContacto(clienteId, texto, autorId)` → `registrar({entidad:'cliente', entidadId:clienteId, tipo:'contacto', datos:{texto}, usuarioId:autorId})`.
- `useClientes.js`: `useClientes(opts)` (`['crm','clientes',opts]`), `useCliente(id)`, `useClienteMutations()` (`{crear,actualizar,cambiarStatus,archivar,desarchivar,eliminar,registrarVenta,agregarInteres,quitarInteres,agregarAutoEntrega,quitarAutoEntrega,agregarContacto}` — cada uno `useMutation` invalidando `['crm','clientes']` + `['crm','cliente',id]` + `['crm','eventos','cliente',id]` + toast).
- `useClientesFiltros.js`: `{ busqueda, filtros:{status:[],canal:[],conAutoEntrega:false,interesCeroKm:false,incluirArchivados:false}, orden:{campo:'creado_en',dir:'desc'}, pagina, setters..., contarFiltrosActivos }`.

- [ ] **Step 1: Tests (fallan primero)**
  - `clienteSchema.test.js`: nombre vacío → error; payload `{nombre:'Ana'}` → ok; presupuesto negativo → error.
  - `formatCliente.test.js`: `lineaInteres` con/ sin campos; `statusVariant` 4 casos.
  - `clientes.service.test.js` (mock `_supabaseMock` + mock `eventos.service`): `listar` filtra archivados + arma `or`; `crear` inyecta `creado_por` + evento `alta`; `registrarVenta` hace 2 updates (clientes + vehiculos) y 2 `registrar`; `agregarContacto` llama `registrar` con `tipo:'contacto'` y `datos.texto`.

- [ ] **Step 2: Implementar** los 5 archivos (copiar estructura de `vehiculos.service.js` / `useVehiculos.js` / `useVehiculosFiltros.js` / `formatVehiculo.js` / `vehiculoSchema.js`).

- [ ] **Step 3: Tests verde + `npm test` + commit**

```bash
git add src/crm/lib/cliente{Schema,}.js src/crm/lib/formatCliente.js src/crm/services/clientes.service.js src/crm/hooks/useClientes.js src/crm/store/useClientesFiltros.js src/crm/__tests__/cliente*.test.js src/crm/__tests__/clientes.service.test.js src/crm/__tests__/formatCliente.test.js
git commit -m "$(printf 'feat(crm): servicio/hooks/store de clientes + lib\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>')"
```

---

## Task 5: Lista de clientes (`ClienteFilters` + `ClienteTable` + `ClienteCard` + `ClientesListPage` + sidebar)

**Files:**
- Create: `src/crm/components/ClienteFilters.jsx`, `ClienteTable.jsx`, `ClienteCard.jsx`, `src/crm/pages/ClientesListPage.jsx`
- Modify: `src/crm/components/CrmSidebar.jsx` (ítem "Clientes", icono `Users`)
- Test: `src/crm/__tests__/ClienteFilters.test.jsx`, `src/crm/__tests__/ClienteTable.test.jsx`

**Interfaces:**
- `ClienteFilters` — controlado por `useClientesFiltros`: chips de status (`activo/en_seguimiento/vendido/perdido`), chips de canal (`CANAL_OPCIONES`), checkboxes "con auto en entrega" / "interés 0km" / "incluir archivados", botón "Limpiar".
- `ClienteTable` (≥md) / `ClienteCard` (<md): Nombre, Teléfono, Localidad, Interés (`lineaInteres`), Presupuesto, Canal (`Badge`), Status (`Badge` + `DropdownMenu` cambio rápido → `onCambiarStatus(cliente, nuevo)`). Fila → `/crm/clientes/:id`.
- `ClientesListPage` — header (`h1` + "Cargar cliente"), buscador + botón "Filtros" (oculto por defecto, badge de activos) idéntico a `VehiculosListPage`, `{mostrarFiltros && <ClienteFilters/>}`, `useClientes`, tabla/cards por `useIsDesktop`, `Pagination`, `useCrmRealtime('clientes', ['crm','clientes'])`, empty state.
- `CrmSidebar` NAV: `[{ to:'/crm/clientes', label:'Clientes', icon: Users }, { to:'/crm/vehiculos', label:'Vehículos', icon: Car }]`.

- [ ] **Step 1: Tests (fallan primero)** — `ClienteFilters`: toggle chip status agrega a `filtros.status`; "Limpiar" resetea. `ClienteTable`: muestra nombre/teléfono/interés de una fila; menú de status con 4 opciones → `onCambiarStatus`.

- [ ] **Step 2: Implementar** (copiar de `VehiculoFilters/Table/Card` + `VehiculosListPage`).

- [ ] **Step 3: `npm test` + `npm run build` + commit**

```bash
git add src/crm/components/Cliente{Filters,Table,Card}.jsx src/crm/pages/ClientesListPage.jsx src/crm/components/CrmSidebar.jsx src/crm/__tests__/Cliente{Filters,Table}.test.jsx
git commit -m "$(printf 'feat(crm): lista de clientes con filtros + sidebar\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>')"
```

---

## Task 6: Alta/edición (`ClienteForm` + páginas)

**Files:**
- Create: `src/crm/components/ClienteForm.jsx`, `src/crm/pages/ClienteNuevoPage.jsx`, `src/crm/pages/ClienteEditarPage.jsx`
- Test: `src/crm/__tests__/ClienteForm.test.jsx`

**Interfaces:**
- `ClienteForm({ inicial?, onGuardar, guardando })` — RHF + `zodResolver(clienteSchema)`. Secciones: **Datos** (nombre*, teléfono, localidad, cumpleaños `type=date`, canal `Select` de `CANAL_OPCIONES`) · **Interés** (marca, modelo, tipo, transmisión, año min, año max, presupuesto, checkbox "interés 0 km") · **Notas** (`textarea`). (Intereses múltiples y autos en entrega NO acá — se editan en la ficha.)
- `ClienteNuevoPage` — `useClienteMutations().crear`; éxito → `/crm/clientes/:id`.
- `ClienteEditarPage` — `useCliente(id)` para `inicial` (solo los campos del form, patrón `CAMPOS` de `VehiculoEditarPage`); `actualizar`; éxito → ficha.

- [ ] **Step 1: Test (falla primero)** — render con `inicial`, cambiar nombre, submit → `onGuardar` con el nombre nuevo; nombre vacío → error, no envía.

- [ ] **Step 2: Implementar** (copiar de `VehiculoForm` + páginas).

- [ ] **Step 3: `npm test` + build + commit**

```bash
git add src/crm/components/ClienteForm.jsx src/crm/pages/ClienteNuevoPage.jsx src/crm/pages/ClienteEditarPage.jsx src/crm/__tests__/ClienteForm.test.jsx
git commit -m "$(printf 'feat(crm): alta y edicion de clientes\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>')"
```

---

## Task 7: `FichaCliente` + intereses + autos en entrega

**Files:**
- Create: `src/crm/components/FichaCliente.jsx`, `InteresesCliente.jsx`, `AutosEntregaCliente.jsx`
- Test: `src/crm/__tests__/FichaCliente.test.jsx`, `src/crm/__tests__/InteresesCliente.test.jsx`

**Interfaces:**
- `FichaCliente({ cliente, puedeEliminar, onCambiarStatus, onArchivar, onEliminar, onRegistrarVenta })` — `GlassCard`: nombre `font-display`, chips (status, canal, "0 km" si `interes_cero_km`, "Auto en entrega" si `tiene_auto_entrega`), `presupuesto` formateado, `lineaInteres`, localidad, cumpleaños, notas. Acciones: `Link` "Editar", `DropdownMenu` "Cambiar status" (4), `Button` "Archivar", `Button` "Registrar venta" (si `status !== 'vendido'`), y si `puedeEliminar` → "Eliminar" con `Modal` de confirmación.
- `InteresesCliente({ clienteId, intereses })` — lista de chips `marca modelo` con ✕ (`quitarInteres`); fila de alta (2 inputs + botón "Agregar" → `agregarInteres`). Usa `useClienteMutations(clienteId)`.
- `AutosEntregaCliente({ clienteId, autos })` — lista de cards (marca/modelo/versión/año/km/color/trans/notas) con borrar; `Modal` o form inline para agregar (`agregarAutoEntrega`).

- [ ] **Step 1: Tests (fallan primero)** — `FichaCliente`: sin `puedeEliminar` no muestra "Eliminar"; con `status='vendido'` no muestra "Registrar venta"; click en opción de status → `onCambiarStatus(nuevo)`. `InteresesCliente`: escribir marca+modelo y "Agregar" → llama `agregarInteres` con `{marca,modelo}` (mockear `useClienteMutations`).

- [ ] **Step 2: Implementar.**

- [ ] **Step 3: `npm test` + commit**

```bash
git add src/crm/components/FichaCliente.jsx src/crm/components/InteresesCliente.jsx src/crm/components/AutosEntregaCliente.jsx src/crm/__tests__/FichaCliente.test.jsx src/crm/__tests__/InteresesCliente.test.jsx
git commit -m "$(printf 'feat(crm): ficha de cliente + intereses + autos en entrega\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>')"
```

---

## Task 8: Seguimiento + Registrar venta

**Files:**
- Create: `src/crm/components/SeguimientoCliente.jsx`, `src/crm/components/RegistrarVentaModal.jsx`
- Test: `src/crm/__tests__/SeguimientoCliente.test.jsx`, `src/crm/__tests__/RegistrarVentaModal.test.jsx`

**Interfaces:**
- `SeguimientoCliente({ clienteId })` — `useEventos('cliente', clienteId)` filtrado a `tipo==='contacto'` (o todos, mostrando `textoEvento`); arriba un `textarea` + `Button` "Agregar contacto" → `useClienteMutations(clienteId).agregarContacto.mutate(texto)`; limpia al éxito. Lista con fecha relativa (`date-fns`).
- `RegistrarVentaModal({ clienteId, open, onClose })` — `Modal`; `useVehiculos({ filtros:{ estado:['disponible'] }, pageSize:100 })` para el `Select`/lista buscable; elegir uno + confirmar → `useClienteMutations(clienteId).registrarVenta.mutate({ vehiculoId })` → `onClose` + toast.

- [ ] **Step 1: Tests (fallan primero)**
  - `SeguimientoCliente`: escribir texto + "Agregar contacto" → `agregarContacto.mutate` con el texto (mock hooks).
  - `RegistrarVentaModal`: con 1 vehículo disponible mockeado, elegirlo + "Confirmar" → `registrarVenta.mutate({ vehiculoId })`.

- [ ] **Step 2: Implementar.**

- [ ] **Step 3: `npm test` + commit**

```bash
git add src/crm/components/SeguimientoCliente.jsx src/crm/components/RegistrarVentaModal.jsx src/crm/__tests__/SeguimientoCliente.test.jsx src/crm/__tests__/RegistrarVentaModal.test.jsx
git commit -m "$(printf 'feat(crm): seguimiento de contactos + registrar venta\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>')"
```

---

## Task 9: `ClienteDetallePage` + rutas

**Files:**
- Create: `src/crm/pages/ClienteDetallePage.jsx`
- Modify: `src/routes/AppRouter.jsx`
- Test: `src/crm/__tests__/ClienteDetallePage.test.jsx`

**Interfaces:**
- `ClienteDetallePage` — `useParams().id`, `useCliente(id)`, `useClienteMutations()`, `useCrmPerfil().esAdmin`. Header (volver + nombre). `Tabs` (base-nova, `.crm-root`): **Datos** (`FichaCliente` + estado `abrirVenta` para `RegistrarVentaModal`), **Intereses** (`InteresesCliente` con `cliente.intereses`), **Autos en entrega** (`AutosEntregaCliente` con `cliente.autos_entrega`), **Seguimiento** (`SeguimientoCliente`), **Historial** (`<HistorialTimeline entidad="cliente" entidadId={id} />`).
- Rutas en `AppRouter.jsx` (grupo `CrmLayout`): `lazy` de `ClientesListPage`, `ClienteNuevoPage`, `ClienteDetallePage`, `ClienteEditarPage`; `<Route path="/crm/clientes" ...>` etc.

- [ ] **Step 1: Test (falla primero)** — `useCliente` mockeado → renderiza las 5 pestañas; default muestra Datos (nombre visible); cambiar a "Historial" muestra el timeline.

- [ ] **Step 2: Implementar** + editar `AppRouter.jsx`.

- [ ] **Step 3: `npm test` + `npm run build` + `npm run lint` (sin errores nuevos en `src/crm`) + commit**

```bash
git add src/crm/pages/ClienteDetallePage.jsx src/routes/AppRouter.jsx src/crm/__tests__/ClienteDetallePage.test.jsx
git commit -m "$(printf 'feat(crm): detalle de cliente con pestanas + rutas\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>')"
```

---

## Task 10: Verificación end-to-end

**Files:**
- Modify: `scripts/verificar-crm-rls.mjs`

- [ ] **Step 1: Extender el script** — como `bruno` (vendedor): `POST crm.clientes` → 201; `PATCH` → 200; `DELETE` → 0 filas (RLS); como `cristian` (admin): `DELETE` el de prueba → 1 fila. Y un check de `registrarVenta` manual opcional (crear cliente + vehículo de prueba, registrar venta, verificar ambos `vendido`, limpiar).

- [ ] **Step 2: Correr** — `node --env-file=.env scripts/verificar-crm-rls.mjs` → todos PASS.

- [ ] **Step 3: Smoke manual** — `npm run dev` → `/crm/clientes` (login `Bruno`): ~175 clientes, filtros, abrir uno → 5 pestañas; agregar interés / auto en entrega / contacto; "Registrar venta" con un vehículo disponible → cliente y vehículo quedan `vendido` y enlazados; cambiar status desde la fila; como admin eliminar.

- [ ] **Step 4: Commit**

```bash
git add scripts/verificar-crm-rls.mjs
git commit -m "$(printf 'test(crm): verificacion RLS del modulo clientes\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>')"
```

---

## Self-Review

**1. Cobertura del spec:**

| Spec | Task |
|---|---|
| §2 schema (enum + 3 tablas + venta en vehiculos + RLS + trigger) | Task 1 |
| §3 migración (clientes + intereses + autos entrega) | Task 2 |
| §4 lista (búsqueda, filtros ocultos con botón, tabla/cards, realtime, cambio status) | Task 5 |
| §4 alta/edición | Task 6 |
| §4 ficha (Datos + acciones) | Task 7 |
| §4 intereses / autos en entrega editables | Task 7 |
| §4 seguimiento (compositor + lista) | Task 8 |
| §4 historial reusando `HistorialTimeline` con `entidad` | Task 3 + Task 9 |
| §4 Registrar venta (2 updates + 2 eventos) | Task 4 (`registrarVenta`) + Task 8 (`RegistrarVentaModal`) |
| §4 rutas + sidebar "Clientes" | Task 5 (sidebar), Task 9 (rutas) |
| §5 servicios/hooks/lib/store | Task 3 (eventos), Task 4 |
| §6 testing (unit, servicios, componentes, RLS) | cada task + Task 10 |

**2. Placeholders:** Task 2 Step 2 deja el `select` de la migración descrito con la nota de "confirmar nombres de columna de `crm_legacy.clientes` con `information_schema`" — es una verificación previa explícita, no un placeholder (los nombres salen de `transformCliente` en `src/server/legacyTransform.js`). El resto son implementaciones completas o "copiar de `<archivo equivalente de Vehículos>`" con el archivo nombrado.

**3. Consistencia de tipos:**
- `registrar({entidad,entidadId,tipo,datos,usuarioId})` (Plan 2 Task 2) — usado por `clientes.service` (Task 4) con `entidad:'cliente'|'vehiculo'`.
- `listarDeEntidad(entidad, id)` / `useEventos(entidad, id)` (Task 3) — consumidos por `SeguimientoCliente` y `HistorialTimeline` (Tasks 8, 9) y por `VehiculoDetallePage` vía el wrapper `useEventosVehiculo`.
- `useClienteMutations()` expone el set completo (Task 4) — `FichaCliente` usa `onCambiarStatus/onArchivar/onEliminar/onRegistrarVenta`; `InteresesCliente`/`AutosEntregaCliente` usan `agregar*/quitar*`; `SeguimientoCliente` usa `agregarContacto`; `RegistrarVentaModal` usa `registrarVenta`.
- `statusVariant(status)` (Task 4 `formatCliente`) → variant de `common/Badge` (`green|amber|neutral|red`), usado por Tasks 5 y 7.
- `crm.estado_cliente` enum (Task 1) — los 4 valores aparecen igual en `ClienteFilters` chips (Task 5), `DropdownMenu` de status (Tasks 5, 7) y `statusVariant` (Task 4).
- `clienteSchema` campos (Task 4) — `ClienteForm` (Task 6) registra exactamente esos; `ClienteEditarPage` arma `inicial` con la misma lista (`CAMPOS`).
