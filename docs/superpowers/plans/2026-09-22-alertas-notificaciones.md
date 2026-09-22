# Alertas con notificaciones (push + email) — Plan de implementación

> **Para ejecutores agénticos:** SUB-SKILL REQUERIDA: usar superpowers:subagent-driven-development (recomendado) o superpowers:executing-plans para ejecutar este plan tarea por tarea. Los pasos usan checkboxes (`- [ ]`) para trackear progreso.

**Objetivo:** recrear el concepto de "alerta" del CRM viejo (título, fecha,
hora, empleado asignado, referencia opcional a cliente/vehículo) en el CRM
nuevo, con avisos automáticos por notificación de escritorio (Web Push) y
email (Resend) 24hs y 3hs antes de la fecha+hora de cada alerta.

**Arquitectura:** tabla `crm.alertas` nueva (mismo patrón que `crm.tareas`),
página CRM nueva con lista/alta/edición (mismo patrón que
`TareasListPage`/`TareaFormModal`), un service worker + suscripción push por
navegador (`crm.push_subscriptions`), y un endpoint serverless
(`/api/crm/check-alertas`) que un cron externo gratuito (cron-job.org)
dispara cada 15-30 min — el cron nativo de Vercel (Hobby) no sirve para esto
porque solo corre 1 vez/día.

**Tech Stack:** React 18, Supabase (schema `crm`), TanStack Query, Zustand,
react-hook-form + zod, `web-push` (npm, VAPID), Resend (REST API vía
`fetch`, sin SDK).

**Spec:** `docs/superpowers/specs/2026-09-22-alertas-notificaciones-design.md`

## Global Constraints

- Todo gratuito: sin planes pagos de Vercel, Resend (free tier) y
  cron-job.org (free tier).
- Los endpoints serverless nuevos siguen el patrón ya establecido en
  `api/crm/sync-legacy.js`/`api/crm/usuarios.js`: `handleXxx(req, res, {env})`
  exportada + `export default function handler(req,res){ return handleXxx(req,res) }`,
  con un dev-proxy equivalente agregado a `src/plugins/crmProxy.js` (si no,
  el endpoint no funciona en `vite dev`, solo en producción).
- Cron-triggered endpoints deben aceptar **GET** (no solo POST) — ya
  aprendimos esta lección con `sync-legacy.js` (Vercel Cron pega por GET;
  cron-job.org deja elegir el método, así que igual conviene aceptar ambos
  por robustez).
- Nunca commitear secretos: `RESEND_API_KEY`, las VAPID keys y
  `CRON_SECRET` van solo en `.env` local (ya gitignoreado) y en Vercel →
  Environment Variables. Ningún script de un solo uso que imprima o loguee
  un secreto se commitea.
- Todas las tablas nuevas en schema `crm`, RLS habilitado, mismas policies
  que `crm.tareas` (select/insert/update para `crm.es_usuario()`, delete
  solo admin) salvo que se indique otra cosa.
- Seguir los patrones ya usados en el código para todo lo que se pueda
  (listados abajo en cada tarea) — no reinventar componentes/hooks que ya
  existen para Tareas.

---

### Task 1: Esquema de base de datos

**Files:**
- Create: `supabase/crm_alertas_schema.sql`
- Create: `scripts/migrations/2026-09-22-alertas-schema.mjs` (aplica el .sql
  con el mismo patrón que `scripts/run-migration-unificacion.mjs`)

**Interfaces:**
- Produce: tablas `crm.alertas`, `crm.push_subscriptions`, columna
  `crm.usuarios.email` — usadas por todas las tareas siguientes.

- [ ] **Paso 1: Escribir el SQL del schema**

```sql
-- supabase/crm_alertas_schema.sql
-- ============================================================================
--  CRM NUEVO — módulo Alertas (título/fecha/hora/asignado, con avisos por
--  push + email 24hs y 3hs antes). Ejecutar en SQL Editor o por pg.
--  Idempotente. crm_legacy.alertas está vacía, no hace falta migración.
-- ============================================================================

create table if not exists crm.alertas (
  id              bigserial primary key,
  titulo          text not null,
  descripcion     text,
  fecha           date not null,
  hora            text not null,
  hecha           boolean not null default false,
  asignado_a      uuid not null references crm.usuarios(id),
  cliente_id      uuid references crm.clientes(id) on delete set null,
  vehiculo_id     uuid references crm.vehiculos(id) on delete set null,
  notificado_24h  boolean not null default false,
  notificado_3h   boolean not null default false,
  creado_por      uuid references crm.usuarios(id),
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now(),
  hecha_en        timestamptz
);
create index if not exists idx_crm_alertas_asignado on crm.alertas(asignado_a, hecha);
create index if not exists idx_crm_alertas_pendientes on crm.alertas(fecha, hora) where not hecha;

create or replace function crm.alerta_actualizada() returns trigger
  language plpgsql as $$
begin
  new.actualizado_en := now();
  if new.hecha and (old.hecha is distinct from new.hecha) then
    new.hecha_en := now();
  elsif not new.hecha then
    new.hecha_en := null;
  end if;
  return new;
end $$;

drop trigger if exists trg_alerta_actualizada on crm.alertas;
create trigger trg_alerta_actualizada before update on crm.alertas
  for each row execute function crm.alerta_actualizada();

alter table crm.alertas enable row level security;
drop policy if exists alertas_select on crm.alertas;
create policy alertas_select on crm.alertas for select using (crm.es_usuario());
drop policy if exists alertas_insert on crm.alertas;
create policy alertas_insert on crm.alertas for insert with check (crm.es_usuario());
drop policy if exists alertas_update on crm.alertas;
create policy alertas_update on crm.alertas for update using (crm.es_usuario());
drop policy if exists alertas_delete_admin on crm.alertas;
create policy alertas_delete_admin on crm.alertas for delete using (crm.mi_rol() = 'admin');

create table if not exists crm.push_subscriptions (
  id          bigserial primary key,
  usuario_id  uuid not null references crm.usuarios(id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  creado_en   timestamptz not null default now()
);
create index if not exists idx_crm_push_usuario on crm.push_subscriptions(usuario_id);

alter table crm.push_subscriptions enable row level security;
drop policy if exists push_subs_select on crm.push_subscriptions;
create policy push_subs_select on crm.push_subscriptions for select using (crm.es_usuario());
drop policy if exists push_subs_insert on crm.push_subscriptions;
create policy push_subs_insert on crm.push_subscriptions for insert with check (crm.es_usuario());
drop policy if exists push_subs_delete on crm.push_subscriptions;
create policy push_subs_delete on crm.push_subscriptions for delete using (crm.es_usuario());

alter table crm.usuarios add column if not exists email text;

grant select, insert, update, delete on all tables in schema crm to authenticated;
grant all privileges on all tables in schema crm to service_role;
grant usage, select on all sequences in schema crm to authenticated, service_role;
```

- [ ] **Paso 2: Script para aplicarlo**

```js
// scripts/migrations/2026-09-22-alertas-schema.mjs
import pg from 'pg'
import { readFileSync } from 'node:fs'

const sql = readFileSync(new URL('../../supabase/crm_alertas_schema.sql', import.meta.url), 'utf8')
const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
await client.connect()
await client.query(sql)
await client.end()
console.log('Schema de alertas aplicado.')
```

- [ ] **Paso 3: Aplicar y verificar**

Correr: `node --env-file=.env scripts/migrations/2026-09-22-alertas-schema.mjs`
Verificar con una consulta rápida (`select * from crm.alertas limit 1;` vía
un script descartable con `pg`, o desde el SQL Editor de Supabase) que las
3 tablas/columna existen y no tiran error.

- [ ] **Paso 4: Commit**

```bash
git add supabase/crm_alertas_schema.sql scripts/migrations/2026-09-22-alertas-schema.mjs
git commit -m "feat(db): schema de crm.alertas, push_subscriptions y usuarios.email"
```

---

### Task 2: `alertas.service.js` + hooks

**Files:**
- Create: `src/crm/services/alertas.service.js`
- Create: `src/crm/hooks/useAlertas.js`
- Test: `src/crm/__tests__/alertas.service.test.js` (mismo mock `_supabaseMock.js` que `fotos.service.test.js`)

**Interfaces:**
- Consume: `_supabaseMock.js` (`makeSupabase`), patrón exacto de
  `src/crm/services/tareas.service.js` (leído como referencia — mismo
  `db()`, mismo estilo de `listar/crear/actualizar/eliminar`).
- Produce: `listar({filtros, incluirHechas})`, `contarPendientes(usuarioId)`,
  `crear(data, autorId)`, `actualizar(id, data)`, `toggleHecha(id, hecha)`,
  `eliminar(id)` — usados por `useAlertas.js` y por toda la UI de la Task 4/5.

- [ ] **Paso 1: Escribir el test del service (falla)**

```js
// src/crm/__tests__/alertas.service.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeSupabase } from './_supabaseMock.js'

const holder = vi.hoisted(() => ({ client: null }))
vi.mock('@/services/supabaseClient', () => ({
  isSupabaseConfigured: true,
  get supabase() { return holder.client },
}))

const { listar, crear, actualizar, toggleHecha, eliminar } = await import('../services/alertas.service.js')

beforeEach(() => { holder.client = null })

describe('alertas.service', () => {
  it('listar trae solo pendientes por defecto, ordenadas por fecha/hora', async () => {
    const { client, calls } = makeSupabase({
      'select:alertas': { data: [{ id: 1, titulo: 'ITV Cronos', fecha: '2026-10-01', hora: '10:00' }], error: null },
    })
    holder.client = client
    const filas = await listar()
    expect(filas).toHaveLength(1)
    const sel = calls.find((c) => c.table === 'alertas' && c.op === 'select')
    expect(sel.filters).toContainEqual(['eq', 'hecha', false])
  })

  it('crear inserta con creado_por', async () => {
    const { client, calls } = makeSupabase({
      'insert:alertas': (s) => ({ data: [{ id: 9, ...s.payload }], error: null }),
    })
    holder.client = client
    const fila = await crear({ titulo: 'Llamar a X', fecha: '2026-10-01', hora: '09:00', asignado_a: 'u1' }, 'autor1')
    expect(fila.id).toBe(9)
    const ins = calls.find((c) => c.op === 'insert')
    expect(ins.payload).toMatchObject({ titulo: 'Llamar a X', creado_por: 'autor1' })
  })

  it('toggleHecha actualiza el campo hecha', async () => {
    const { client, calls } = makeSupabase({ 'update:alertas': { data: [{ id: 1 }], error: null } })
    holder.client = client
    await toggleHecha(1, true)
    const upd = calls.find((c) => c.op === 'update')
    expect(upd.payload).toEqual({ hecha: true })
  })

  it('eliminar borra por id', async () => {
    const { client, calls } = makeSupabase({ 'delete:alertas': { data: null, error: null } })
    holder.client = client
    await eliminar(1)
    expect(calls.find((c) => c.op === 'delete')).toBeTruthy()
  })
})
```

- [ ] **Paso 2: Correr y verificar que falla**

`npx vitest run src/crm/__tests__/alertas.service.test.js` — falla porque
`../services/alertas.service.js` no existe todavía.

- [ ] **Paso 3: Implementar el service**

```js
// src/crm/services/alertas.service.js
import { supabase } from '@/services/supabaseClient'

const db = () => supabase.schema('crm')

const SELECT =
  '*, asignado:usuarios!alertas_asignado_a_fkey(nombre), cliente:clientes(nombre), vehiculo:vehiculos(marca,modelo)'

export async function listar({ filtros = {}, incluirHechas = false } = {}) {
  let q = db().from('alertas').select(SELECT)
  if (!incluirHechas) q = q.eq('hecha', false)
  if (filtros.asignadoA && filtros.asignadoA !== 'todos') q = q.eq('asignado_a', filtros.asignadoA)
  q = q.order('fecha', { ascending: true }).order('hora', { ascending: true })
  const { data, error } = await q
  if (error) throw error
  return data ?? []
}

export async function contarPendientes(usuarioId) {
  const { count, error } = await db()
    .from('alertas')
    .select('id', { count: 'exact', head: true })
    .eq('hecha', false)
    .eq('asignado_a', usuarioId)
  if (error) throw error
  return count ?? 0
}

export async function crear(data, autorId) {
  const { data: filas, error } = await db().from('alertas').insert({ ...data, creado_por: autorId }).select()
  if (error) throw error
  return filas[0]
}

export async function actualizar(id, data) {
  const { data: filas, error } = await db().from('alertas').update(data).eq('id', id).select()
  if (error) throw error
  return filas[0]
}

export async function toggleHecha(id, hecha) {
  const { error } = await db().from('alertas').update({ hecha }).eq('id', id)
  if (error) throw error
}

export async function eliminar(id) {
  const { error } = await db().from('alertas').delete().eq('id', id)
  if (error) throw error
}
```

- [ ] **Paso 4: Correr y verificar que pasa**

`npx vitest run src/crm/__tests__/alertas.service.test.js` — 4/4 verdes.

- [ ] **Paso 5: Hooks de React Query**

```js
// src/crm/hooks/useAlertas.js
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useCrmPerfil } from '@/crm/hooks/useCrmPerfil'
import * as svc from '@/crm/services/alertas.service'

export function useAlertas(opts) {
  return useQuery({ queryKey: ['crm', 'alertas', opts], queryFn: () => svc.listar(opts) })
}

export function useAlertasPendientes() {
  const { id } = useCrmPerfil()
  return useQuery({
    queryKey: ['crm', 'alertas', 'pendientes', id],
    queryFn: () => svc.contarPendientes(id),
    enabled: Boolean(id),
  })
}

export function useAlertaMutations() {
  const qc = useQueryClient()
  const { id: autorId } = useCrmPerfil()
  const invalidar = () => qc.invalidateQueries({ queryKey: ['crm', 'alertas'] })
  const fail = (e) => toast.error(e.message)

  const crear = useMutation({
    mutationFn: (data) => svc.crear(data, autorId),
    onSuccess: () => { invalidar(); toast.success('Alerta creada.') },
    onError: fail,
  })
  const actualizar = useMutation({
    mutationFn: ({ id, data }) => svc.actualizar(id, data),
    onSuccess: () => { invalidar(); toast.success('Alerta actualizada.') },
    onError: fail,
  })
  const toggleHecha = useMutation({
    mutationFn: ({ id, hecha }) => svc.toggleHecha(id, hecha),
    onSuccess: invalidar,
    onError: fail,
  })
  const eliminar = useMutation({
    mutationFn: (id) => svc.eliminar(id),
    onSuccess: () => { invalidar(); toast.success('Alerta eliminada.') },
    onError: fail,
  })

  return { crear, actualizar, toggleHecha, eliminar }
}
```

- [ ] **Paso 6: Commit**

```bash
git add src/crm/services/alertas.service.js src/crm/hooks/useAlertas.js src/crm/__tests__/alertas.service.test.js
git commit -m "feat(crm): service y hooks de alertas"
```

---

### Task 3: Schema de validación + store de filtros

**Files:**
- Create: `src/crm/lib/alertaSchema.js`
- Create: `src/crm/store/useAlertasFiltros.js`
- Test: `src/crm/__tests__/AlertaFilters.test.jsx` (se escribe en la Task 4
  junto con el componente de filtros, no acá — este paso es solo el store)

**Interfaces:**
- Produce: `alertaSchema` (zod), `useAlertasFiltros` (zustand) — usados por
  `AlertaFormModal` y `AlertasListPage` (Task 4/5).

- [ ] **Paso 1: Schema zod**

```js
// src/crm/lib/alertaSchema.js
import { z } from 'zod'

const textoOpc = z.preprocess((v) => (v === '' || v == null ? undefined : v), z.string().optional())

export const alertaSchema = z.object({
  titulo: z.string().trim().min(1, 'El título es obligatorio'),
  descripcion: textoOpc,
  fecha: z.string().min(1, 'La fecha es obligatoria'),
  hora: z.string().min(1, 'La hora es obligatoria'),
  asignado_a: z.string().min(1, 'Elegí a quién se le asigna'),
  cliente_id: textoOpc,
  vehiculo_id: textoOpc,
})
```

- [ ] **Paso 2: Store de filtros (mismo shape que `useTareasFiltros`)**

```js
// src/crm/store/useAlertasFiltros.js
import { create } from 'zustand'

export const FILTROS_VACIOS = { asignadoA: 'todos' }

export const useAlertasFiltros = create((set) => ({
  filtros: { ...FILTROS_VACIOS },
  incluirHechas: false,
  setFiltro: (clave, valor) => set((s) => ({ filtros: { ...s.filtros, [clave]: valor } })),
  setIncluirHechas: (v) => set({ incluirHechas: v }),
  resetFiltros: () => set({ filtros: { ...FILTROS_VACIOS }, incluirHechas: false }),
  contarFiltrosActivos: () => {
    const { filtros, incluirHechas } = useAlertasFiltros.getState()
    let n = 0
    if (filtros.asignadoA !== 'todos') n++
    if (incluirHechas) n++
    return n
  },
}))
```

- [ ] **Paso 3: Test rápido del store**

```js
// src/crm/__tests__/useAlertasFiltros.test.js
import { describe, it, expect, beforeEach } from 'vitest'
import { useAlertasFiltros, FILTROS_VACIOS } from '../store/useAlertasFiltros.js'

beforeEach(() => useAlertasFiltros.setState({ filtros: { ...FILTROS_VACIOS }, incluirHechas: false }))

describe('useAlertasFiltros', () => {
  it('setFiltro cambia un filtro y contarFiltrosActivos lo refleja', () => {
    expect(useAlertasFiltros.getState().contarFiltrosActivos()).toBe(0)
    useAlertasFiltros.getState().setFiltro('asignadoA', 'u1')
    expect(useAlertasFiltros.getState().contarFiltrosActivos()).toBe(1)
  })
  it('resetFiltros vuelve todo a blanco', () => {
    useAlertasFiltros.getState().setFiltro('asignadoA', 'u1')
    useAlertasFiltros.getState().setIncluirHechas(true)
    useAlertasFiltros.getState().resetFiltros()
    expect(useAlertasFiltros.getState().contarFiltrosActivos()).toBe(0)
  })
})
```

Correr `npx vitest run src/crm/__tests__/useAlertasFiltros.test.js` — 2/2 verdes.

- [ ] **Paso 4: Commit**

```bash
git add src/crm/lib/alertaSchema.js src/crm/store/useAlertasFiltros.js src/crm/__tests__/useAlertasFiltros.test.js
git commit -m "feat(crm): schema y store de filtros de alertas"
```

---

### Task 4: `AlertaRow.jsx` + `AlertaFormModal.jsx`

**Files:**
- Create: `src/crm/components/AlertaRow.jsx` (calcado de `TareaRow.jsx`, sin
  Archivar — las alertas no se archivan, se borran)
- Create: `src/crm/components/AlertaFormModal.jsx` (calcado de
  `TareaFormModal.jsx`, sin campo Prioridad, con `asignado_a` obligatorio)
- Test: `src/crm/__tests__/AlertaRow.test.jsx`, `src/crm/__tests__/AlertaFormModal.test.jsx`

**Interfaces:**
- Consume: `alertaSchema` (Task 3), `useAlertaMutations` (Task 2),
  `useCrmUsuarios`, `useClientes`, `useVehiculos` (hooks ya existentes,
  mismos que usa `TareaFormModal.jsx`).
- Produce: componentes usados por `AlertasListPage` (Task 5).

- [ ] **Paso 1: Escribir el test de `AlertaRow` (falla)**

```jsx
// src/crm/__tests__/AlertaRow.test.jsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import AlertaRow from '../components/AlertaRow'

const alerta = {
  id: 1, titulo: 'ITV Cronos', fecha: '2026-10-01', hora: '10:00', hecha: false,
  asignado: { nombre: 'Bruno' }, cliente: null, vehiculo: { marca: 'Fiat', modelo: 'Cronos' },
}

function renderRow(props = {}) {
  return render(
    <MemoryRouter>
      <AlertaRow alerta={alerta} onToggle={vi.fn()} onEditar={vi.fn()} onEliminar={vi.fn()} puedeEliminar {...props} />
    </MemoryRouter>,
  )
}

describe('AlertaRow', () => {
  it('muestra título, fecha/hora y a quién está asignada', () => {
    renderRow()
    expect(screen.getByText('ITV Cronos')).toBeInTheDocument()
    expect(screen.getByText(/2026-10-01/)).toBeInTheDocument()
    expect(screen.getByTitle('Bruno')).toBeInTheDocument()
  })

  it('click en el check llama onToggle con hecha=true', () => {
    const onToggle = vi.fn()
    renderRow({ onToggle })
    fireEvent.click(screen.getByRole('button', { name: /marcar hecha/i }))
    expect(onToggle).toHaveBeenCalledWith(alerta, true)
  })
})
```

- [ ] **Paso 2: Confirmar que falla** (`AlertaRow` no existe) y luego
  implementar:

```jsx
// src/crm/components/AlertaRow.jsx
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import Badge from '@/components/common/Badge'
import Modal from '@/components/common/Modal'
import Button from '@/components/common/Button'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/cn'

const iniciales = (n) => (n ?? '?').trim().slice(0, 2).toUpperCase()

export default function AlertaRow({ alerta: a, onToggle, onEditar, onEliminar, puedeEliminar }) {
  const [confirmar, setConfirmar] = useState(false)

  return (
    <div className="glass flex items-center gap-3 rounded-2xl p-3">
      <button
        onClick={() => onToggle(a, !a.hecha)}
        aria-label={a.hecha ? 'Marcar pendiente' : 'Marcar hecha'}
        className={cn(
          'grid h-6 w-6 shrink-0 place-items-center rounded-md border transition-colors',
          a.hecha ? 'border-success bg-success text-white' : 'border-ink/30 text-transparent hover:border-ink/50',
        )}
      >
        <Check size={14} />
      </button>

      <div className="min-w-0 flex-1">
        <p className={cn('truncate text-sm font-medium', a.hecha ? 'text-ink-3 line-through' : 'text-ink')}>
          {a.titulo}
        </p>
        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-ink-3">
          <span>{a.fecha} · {a.hora}</span>
          {a.cliente && (
            <Link to={`/crm/clientes/${a.cliente_id}`} onClick={(e) => e.stopPropagation()} className="hover:text-neifert">
              <Badge variant="neutral">{a.cliente.nombre}</Badge>
            </Link>
          )}
          {a.vehiculo && <Badge variant="neutral">{a.vehiculo.marca} {a.vehiculo.modelo}</Badge>}
        </div>
      </div>

      {a.asignado?.nombre && (
        <span title={a.asignado.nombre} className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-neifert/15 text-[10px] font-bold text-neifert">
          {iniciales(a.asignado.nombre)}
        </span>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger aria-label="Acciones" className="shrink-0 text-ink-3 hover:text-ink">
          <MoreHorizontal size={18} />
        </DropdownMenuTrigger>
        <DropdownMenuContent className="crm-root">
          <DropdownMenuItem onClick={() => onEditar(a)}>
            <Pencil size={14} /> Editar
          </DropdownMenuItem>
          {puedeEliminar && (
            <DropdownMenuItem onClick={() => setConfirmar(true)}>
              <Trash2 size={14} /> Eliminar
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Modal open={confirmar} onClose={() => setConfirmar(false)} title="Eliminar alerta">
        <p className="text-sm text-ink-2">Se borra "{a.titulo}". No se puede deshacer.</p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirmar(false)}>Cancelar</Button>
          <Button variant="primary" onClick={() => { setConfirmar(false); onEliminar(a.id) }}>Eliminar</Button>
        </div>
      </Modal>
    </div>
  )
}
```

- [ ] **Paso 3: Correr el test de `AlertaRow`** — 2/2 verdes.

- [ ] **Paso 4: `AlertaFormModal.jsx`** — copiar `TareaFormModal.jsx` completo
  y aplicar estos cambios: importar `alertaSchema` en vez de `tareaSchema`,
  `useAlertaMutations` en vez de `useTareaMutations`, sacar el campo
  `prioridad` (del `defaultValues`, del `useEffect` de reset, y del bloque
  `<Controller name="prioridad">`), y agregar `defaultValues.hora` sin
  default vacío (poner `'09:00'` en vez de `''`, ya que ahora es obligatoria
  por el schema). El resto (título/descripción/fecha/asignado/cliente/
  vehículo, `useLockScroll`, animación, portal) queda idéntico.

- [ ] **Paso 5: Test de `AlertaFormModal`** — calcar la estructura de
  cualquier test existente de `TareaFormModal.test.jsx` si existe, o si no
  existe, escribir uno mínimo:

```jsx
// src/crm/__tests__/AlertaFormModal.test.jsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const crear = vi.fn().mockResolvedValue({ id: 1 })
vi.mock('@/crm/services/alertas.service', () => ({
  crear: (...a) => crear(...a), actualizar: vi.fn(), listar: vi.fn().mockResolvedValue([]),
}))
vi.mock('@/crm/hooks/useCrmUsuarios', () => ({ useCrmUsuarios: () => ({ data: [{ id: 'u1', nombre: 'Bruno' }] }) }))
vi.mock('@/crm/hooks/useCrmPerfil', () => ({ useCrmPerfil: () => ({ id: 'u1' }) }))
vi.mock('@/crm/hooks/useClientes', () => ({ useClientes: () => ({ data: { filas: [] } }) }))
vi.mock('@/crm/hooks/useVehiculos', () => ({ useVehiculos: () => ({ data: { filas: [] } }) }))

import AlertaFormModal from '../components/AlertaFormModal'

function renderModal(props = {}) {
  const qc = new QueryClient()
  return render(
    <QueryClientProvider client={qc}>
      <AlertaFormModal open onClose={vi.fn()} alerta={null} {...props} />
    </QueryClientProvider>,
  )
}

describe('AlertaFormModal', () => {
  it('carga una alerta nueva con título/fecha/hora/asignado', async () => {
    renderModal()
    await userEvent.type(screen.getByLabelText('Título'), 'ITV Cronos')
    await userEvent.click(screen.getByRole('button', { name: /guardar/i }))
    await waitFor(() => expect(crear).toHaveBeenCalled())
    expect(crear.mock.calls[0][0]).toMatchObject({ titulo: 'ITV Cronos', asignado_a: 'u1' })
  })
})
```

- [ ] **Paso 6: Correr ambos tests, confirmar verdes, commit**

```bash
git add src/crm/components/AlertaRow.jsx src/crm/components/AlertaFormModal.jsx src/crm/__tests__/AlertaRow.test.jsx src/crm/__tests__/AlertaFormModal.test.jsx
git commit -m "feat(crm): AlertaRow y AlertaFormModal"
```

---

### Task 5: `AlertasListPage.jsx` + navegación

**Files:**
- Create: `src/crm/pages/AlertasListPage.jsx` (calco de `TareasListPage.jsx`,
  reusando `agrupar` de `src/crm/lib/agruparTareas.js` mapeando `hecha→done`
  antes de pasarle las filas)
- Modify: `src/crm/lib/vistas.js` (agregar `{ key: 'alertas', label: 'Alertas', ruta: '/crm/alertas' }`)
- Modify: `src/routes/AppRouter.jsx` (agregar `<Route path="/crm/alertas" element={<AlertasListPage />} />` dentro del bloque `VistaGuard`)
- Modify: `src/components/layout/AppSidebar.jsx` y `AppMobileSidebar.jsx`
  (agregar ítem de nav, ícono `Bell` de lucide-react, `vista: 'alertas'`)
- Test: `src/crm/__tests__/AlertasListPage.test.jsx`, actualizar
  `src/crm/__tests__/vistas.test.js`, `src/crm/__tests__/AppSidebar.test.jsx`
  (si asume una lista fija de vistas/ítems, agregar el caso)

**Interfaces:**
- Consume: Task 2 (`useAlertas`, `useAlertaMutations`), Task 3
  (`useAlertasFiltros`), Task 4 (`AlertaRow`, `AlertaFormModal`).

- [ ] **Paso 1: Página de lista**

```jsx
// src/crm/pages/AlertasListPage.jsx
import { useMemo, useState } from 'react'
import { Plus, SlidersHorizontal, ChevronDown } from 'lucide-react'
import Button from '@/components/common/Button'
import Spinner from '@/components/common/Spinner'
import GlassCard from '@/components/common/GlassCard'
import { useCrmPerfil } from '@/crm/hooks/useCrmPerfil'
import { useAlertas, useAlertaMutations } from '@/crm/hooks/useAlertas'
import { useCrmRealtime } from '@/crm/hooks/useCrmRealtime'
import { useAlertasFiltros } from '@/crm/store/useAlertasFiltros'
import { agrupar } from '@/crm/lib/agruparTareas'
import AlertaRow from '@/crm/components/AlertaRow'
import AlertaFormModal from '@/crm/components/AlertaFormModal'
import { cn } from '@/lib/cn'

const GRUPOS = [
  { key: 'vencidas', label: 'Vencidas', destacado: true },
  { key: 'hoy', label: 'Hoy' },
  { key: 'semana', label: 'Esta semana' },
  { key: 'despues', label: 'Más adelante' },
]

export default function AlertasListPage() {
  const { id: miId, esAdmin } = useCrmPerfil()
  const { filtros, incluirHechas } = useAlertasFiltros()
  const filtrosActivos = useAlertasFiltros((s) => s.contarFiltrosActivos())
  const [mostrarFiltros, setMostrarFiltros] = useState(false)
  const [modal, setModal] = useState({ open: false, alerta: null })
  const [verHechas, setVerHechas] = useState(false)
  const { toggleHecha, eliminar } = useAlertaMutations()

  useCrmRealtime('alertas', ['crm', 'alertas'])

  const opts = useMemo(() => {
    const f = { ...filtros }
    if (f.asignadoA === 'mias') f.asignadoA = miId
    return { filtros: f, incluirHechas }
  }, [filtros, incluirHechas, miId])

  const { data: alertas, isLoading } = useAlertas(opts)
  const g = useMemo(() => agrupar((alertas ?? []).map((a) => ({ ...a, done: a.hecha }))), [alertas])
  const total = alertas?.length ?? 0

  const filaProps = {
    onToggle: (a, hecha) => toggleHecha.mutate({ id: a.id, hecha }),
    onEditar: (a) => setModal({ open: true, alerta: a }),
    onEliminar: (id) => eliminar.mutate(id),
    puedeEliminar: esAdmin,
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold text-ink">Alertas</h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMostrarFiltros((v) => !v)}
            aria-expanded={mostrarFiltros}
            className={cn(
              'glass flex h-11 items-center gap-2 rounded-2xl px-4 text-sm font-semibold transition-colors',
              mostrarFiltros || filtrosActivos > 0 ? 'text-neifert' : 'text-ink-2 hover:text-ink',
            )}
          >
            <SlidersHorizontal size={16} />
            Filtros
            {filtrosActivos > 0 && (
              <span className="grid h-5 min-w-5 place-items-center rounded-full bg-neifert px-1 text-[11px] font-bold text-white">
                {filtrosActivos}
              </span>
            )}
          </button>
          <Button icon={Plus} onClick={() => setModal({ open: true, alerta: null })}>
            Nueva alerta
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid place-items-center py-16"><Spinner size={28} /></div>
      ) : total === 0 ? (
        <GlassCard className="p-10 text-center">
          <p className="font-display font-bold text-ink">No hay alertas</p>
          <p className="mt-1 text-sm text-ink-3">Creá una para avisarle a alguien antes de que venza algo.</p>
          <Button icon={Plus} className="mt-4" onClick={() => setModal({ open: true, alerta: null })}>
            Nueva alerta
          </Button>
        </GlassCard>
      ) : (
        <div className="space-y-5">
          {GRUPOS.map(({ key, label, destacado }) =>
            g[key].length ? (
              <section key={key}>
                <h2 className={cn('mb-2 text-xs font-semibold uppercase tracking-wide', destacado ? 'text-neifert' : 'text-ink-3')}>
                  {label} · {g[key].length}
                </h2>
                <div className="space-y-2">
                  {g[key].map((a) => <AlertaRow key={a.id} alerta={a} {...filaProps} />)}
                </div>
              </section>
            ) : null,
          )}

          {g.hechas.length > 0 && (
            <section>
              <button onClick={() => setVerHechas((v) => !v)} className="mb-2 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-ink-3">
                <ChevronDown size={14} className={cn('transition-transform', verHechas && 'rotate-180')} />
                Hechas · {g.hechas.length}
              </button>
              {verHechas && (
                <div className="space-y-2">
                  {g.hechas.map((a) => <AlertaRow key={a.id} alerta={a} {...filaProps} />)}
                </div>
              )}
            </section>
          )}
        </div>
      )}

      <AlertaFormModal open={modal.open} alerta={modal.alerta} onClose={() => setModal({ open: false, alerta: null })} />
    </div>
  )
}
```

- [ ] **Paso 2: Vista + ruta + sidebar**

En `src/crm/lib/vistas.js`, agregar a `VISTAS` (después de `tareas`, antes
de `usuarios`): `{ key: 'alertas', label: 'Alertas', ruta: '/crm/alertas' }`.

En `src/routes/AppRouter.jsx`, agregar dentro del bloque `<Route element={<VistaGuard />}>`,
junto a las demás rutas `/crm/*`: `<Route path="/crm/alertas" element={<AlertasListPage />} />`
(+ el `lazy(() => import('@/crm/pages/AlertasListPage'))` correspondiente arriba).

En `AppSidebar.jsx`/`AppMobileSidebar.jsx`, agregar al array `NAV`, después
de "Tareas": `{ to: '/crm/alertas', label: 'Alertas', icon: Bell, vista: 'alertas' }`
(importar `Bell` de `lucide-react` en ambos archivos).

- [ ] **Paso 3: Actualizar tests existentes que dependen de la lista de vistas**

`src/crm/__tests__/vistas.test.js` tiene un test que verifica el array
completo de keys de `VISTAS` en orden — agregarle `'alertas'` en la
posición correcta. Correr `npx vitest run src/crm/__tests__/vistas.test.js`
y ajustar hasta que pase.

- [ ] **Paso 4: Test de la página** (mínimo: carga, agrupa, abre el modal)

```jsx
// src/crm/__tests__/AlertasListPage.test.jsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const listar = vi.fn().mockResolvedValue([
  { id: 1, titulo: 'ITV Cronos', fecha: '2020-01-01', hora: '10:00', hecha: false, asignado: { nombre: 'Bruno' } },
])
vi.mock('@/crm/services/alertas.service', () => ({
  listar: (...a) => listar(...a), toggleHecha: vi.fn(), eliminar: vi.fn(), crear: vi.fn(), actualizar: vi.fn(),
}))
vi.mock('@/crm/hooks/useCrmPerfil', () => ({ useCrmPerfil: () => ({ id: 'u1', esAdmin: true }) }))
vi.mock('@/crm/hooks/useCrmRealtime', () => ({ useCrmRealtime: () => {} }))

import AlertasListPage from '../pages/AlertasListPage'

describe('AlertasListPage', () => {
  it('lista alertas agrupadas (vencida, en este caso)', async () => {
    const qc = new QueryClient()
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter><AlertasListPage /></MemoryRouter>
      </QueryClientProvider>,
    )
    expect(await screen.findByText('ITV Cronos')).toBeInTheDocument()
    expect(screen.getByText(/Vencidas/)).toBeInTheDocument()
  })
})
```

- [ ] **Paso 5: Correr toda la suite, confirmar que nada se rompió**

`npm test` — debe seguir en verde (con el conteo total subiendo).

- [ ] **Paso 6: `npm run build`, confirmar limpio, commit**

```bash
git add src/crm/pages/AlertasListPage.jsx src/crm/lib/vistas.js src/routes/AppRouter.jsx \
  src/components/layout/AppSidebar.jsx src/components/layout/AppMobileSidebar.jsx \
  src/crm/__tests__/AlertasListPage.test.jsx src/crm/__tests__/vistas.test.js
git commit -m "feat(crm): página de Alertas + navegación"
```

---

### Task 6: Email real por empleado (Admin → Usuarios)

**Files:**
- Modify: `src/crm/services/usuarios.service.js` (`listar()`: agregar
  `email` al `.select(...)` — el resto ya soporta parches arbitrarios, no
  hace falta tocar `actualizarUsuario`)
- Modify: `src/crm/components/UsuarioRow.jsx` (campo Email editable)
- Test: actualizar/crear el test correspondiente a `UsuarioRow`/
  `UsuariosCrmSection` si existe (`src/components/admin/__tests__/UsuariosCrmSection.test.jsx`)

**Interfaces:**
- Produce: cada `crm.usuarios` fila trae `email`, editable desde la UI —
  usado por Task 10 (el endpoint de check-alertas lo lee para mandar el
  email).

- [ ] **Paso 1: Sumar `email` al select**

En `usuarios.service.js`, cambiar
`.select('id, usuario, nombre, rol, activo, vistas_override, creado_en')`
a `.select('id, usuario, nombre, rol, activo, vistas_override, email, creado_en')`.

- [ ] **Paso 2: Campo editable en `UsuarioRow.jsx`**

Agregar, en el primer `<div className="flex flex-wrap items-end gap-4">`
(junto al Select de Rol), un input de email con guardado al perder el foco
(no en cada tecla, para no disparar un update por letra):

```jsx
import { useState } from 'react'
// ...
function CampoEmail({ valorInicial, onGuardar }) {
  const [valor, setValor] = useState(valorInicial ?? '')
  return (
    <div className="w-56">
      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-3">Email</label>
      <input
        type="email"
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        onBlur={() => { if (valor !== (valorInicial ?? '')) onGuardar(valor || null) }}
        placeholder="empleado@neifertautomotores.com"
        className="glass field-glass h-9 w-full rounded-xl px-3 text-sm text-ink outline-none"
      />
    </div>
  )
}
```

Y en el JSX de `UsuarioRow`, dentro de ese mismo div flex, agregar
`<CampoEmail valorInicial={u.email} onGuardar={(email) => onCambiar(u.id, { email })} />`.

- [ ] **Paso 3: Test**

Si existe `src/components/admin/__tests__/UsuariosCrmSection.test.jsx`,
agregarle un caso: tipear un email, disparar blur, verificar que se llama
al mock de `actualizarUsuario`/`onCambiar` con `{ email: '...' }`. Si no
existe ningún test de esa sección, no crear uno nuevo solo para esto — no
es una pieza crítica que justifique un archivo de test aparte.

- [ ] **Paso 4: Verificar manualmente y commit**

`npm test` en verde, `npm run build` limpio.

```bash
git add src/crm/services/usuarios.service.js src/crm/components/UsuarioRow.jsx
git commit -m "feat(crm): campo de email real por usuario (para alertas)"
```

---

### Task 7: VAPID keys + envío de push y email (server-side)

**Files:**
- Modify: `package.json` (agregar dependencia `web-push`)
- Create: `src/server/webPush.js`
- Create: `src/server/resendEmail.js`
- Test: `src/server/__tests__/webPush.test.js`, `src/server/__tests__/resendEmail.test.js`

**Interfaces:**
- Produce: `enviarPush({subscriptions, payload})`,
  `enviarEmail({to, subject, html})` — usados por el endpoint de la Task 10.

- [ ] **Paso 1: Instalar `web-push` y generar las VAPID keys**

```bash
npm install web-push
npx web-push generate-vapid-keys
```

Guardar la salida (public/private key) en `.env` local:

```
VITE_VAPID_PUBLIC_KEY=<la pública — esta SÍ va prefijada VITE_, la usa el frontend>
VAPID_PRIVATE_KEY=<la privada — nunca al frontend>
VAPID_SUBJECT=mailto:alertas@neifertautomotores.com
```

- [ ] **Paso 2: Test de `webPush.js` (falla)**

```js
// src/server/__tests__/webPush.test.js
import { describe, it, expect, vi } from 'vitest'

describe('webPush.enviarPush', () => {
  it('manda la notificación a cada suscripción con el payload dado', async () => {
    const sendNotification = vi.fn().mockResolvedValue({})
    const setVapidDetails = vi.fn()
    const { enviarPush } = await import('../webPush.js')
    const subs = [{ endpoint: 'https://x/1', p256dh: 'p1', auth: 'a1' }]
    await enviarPush(
      { subscriptions: subs, payload: { title: 't', body: 'b' } },
      { webpush: { setVapidDetails, sendNotification }, vapid: { subject: 's', publicKey: 'pub', privateKey: 'priv' } },
    )
    expect(setVapidDetails).toHaveBeenCalledWith('s', 'pub', 'priv')
    expect(sendNotification).toHaveBeenCalledWith(
      { endpoint: 'https://x/1', keys: { p256dh: 'p1', auth: 'a1' } },
      JSON.stringify({ title: 't', body: 'b' }),
    )
  })

  it('si una suscripción está vencida (410), la reporta para borrar pero no frena las demás', async () => {
    const sendNotification = vi.fn()
      .mockRejectedValueOnce({ statusCode: 410 })
      .mockResolvedValueOnce({})
    const { enviarPush } = await import('../webPush.js')
    const subs = [{ endpoint: 'https://x/vencida', p256dh: 'p', auth: 'a' }, { endpoint: 'https://x/2', p256dh: 'p', auth: 'a' }]
    const { vencidas } = await enviarPush(
      { subscriptions: subs, payload: {} },
      { webpush: { setVapidDetails: vi.fn(), sendNotification }, vapid: { subject: 's', publicKey: 'pub', privateKey: 'priv' } },
    )
    expect(vencidas).toEqual(['https://x/vencida'])
  })
})
```

- [ ] **Paso 3: Implementar**

```js
// src/server/webPush.js
import webpush from 'web-push'

/** Manda un push a cada suscripción. Devuelve los endpoints que dieron 404/410
 *  (suscripción vencida — el caller las borra de crm.push_subscriptions). */
export async function enviarPush({ subscriptions, payload }, deps = {}) {
  const wp = deps.webpush || webpush
  const vapid = deps.vapid || {
    subject: process.env.VAPID_SUBJECT,
    publicKey: process.env.VITE_VAPID_PUBLIC_KEY,
    privateKey: process.env.VAPID_PRIVATE_KEY,
  }
  wp.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey)

  const vencidas = []
  for (const sub of subscriptions) {
    try {
      await wp.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload),
      )
    } catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) vencidas.push(sub.endpoint)
      else console.error('[webPush] error enviando a', sub.endpoint, e.message)
    }
  }
  return { vencidas }
}
```

- [ ] **Paso 4: Correr test de `webPush.js`** — 2/2 verdes.

- [ ] **Paso 5: Test de `resendEmail.js` (falla)**

```js
// src/server/__tests__/resendEmail.test.js
import { describe, it, expect, vi } from 'vitest'

describe('resendEmail.enviarEmail', () => {
  it('llama a la API de Resend con from/to/subject/html', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'e1' }) })
    const { enviarEmail } = await import('../resendEmail.js')
    await enviarEmail(
      { to: 'bruno@x.com', subject: 'Vence mañana', html: '<p>hola</p>' },
      { fetchImpl, apiKey: 'key123', from: 'Alertas <alertas@neifertautomotores.com>' },
    )
    expect(fetchImpl).toHaveBeenCalledWith('https://api.resend.com/emails', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ Authorization: 'Bearer key123' }),
    }))
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body)
    expect(body).toMatchObject({ to: ['bruno@x.com'], subject: 'Vence mañana', html: '<p>hola</p>' })
  })

  it('si la API falla, tira con el mensaje de error', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 422, json: async () => ({ message: 'dominio no verificado' }) })
    const { enviarEmail } = await import('../resendEmail.js')
    await expect(enviarEmail({ to: 'x@x.com', subject: 's', html: 'h' }, { fetchImpl, apiKey: 'k', from: 'f' }))
      .rejects.toThrow('dominio no verificado')
  })
})
```

- [ ] **Paso 6: Implementar**

```js
// src/server/resendEmail.js

/** Manda un email vía la API REST de Resend (sin SDK — mismo criterio que
 *  dolarapi/legacyFetch en este repo: fetch directo a servicios externos). */
export async function enviarEmail({ to, subject, html }, deps = {}) {
  const fetchImpl = deps.fetchImpl || fetch
  const apiKey = deps.apiKey || process.env.RESEND_API_KEY
  const from = deps.from || 'Alertas Neifert <alertas@neifertautomotores.com>'

  const res = await fetchImpl('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [to], subject, html }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.message || `Resend respondió ${res.status}`)
  }
  return res.json()
}
```

- [ ] **Paso 7: Correr test de `resendEmail.js`** — 2/2 verdes.

- [ ] **Paso 8: Commit**

```bash
git add package.json package-lock.json src/server/webPush.js src/server/resendEmail.js \
  src/server/__tests__/webPush.test.js src/server/__tests__/resendEmail.test.js
git commit -m "feat(server): envío de push (web-push/VAPID) y email (Resend)"
```

(Nota: `.env` con las VAPID keys y `RESEND_API_KEY` NO se commitea — ya está
gitignoreado. Agregarlas también en Vercel → Environment Variables antes de
la Task 11.)

---

### Task 8: Service worker + suscripción push en el navegador

**Files:**
- Create: `public/sw.js`
- Create: `src/crm/hooks/usePushNotifications.js`
- Create: `src/crm/components/ActivarNotificaciones.jsx`
- Modify: `src/components/layout/AppSidebar.jsx` (montar el botón, junto al `ThemeToggle`)
- Test: `src/crm/__tests__/usePushNotifications.test.js`

**Interfaces:**
- Consume: `VITE_VAPID_PUBLIC_KEY` (env var pública, Task 7), endpoint
  `/api/crm/push-subscribe` (Task 9 — este hook lo llama, aunque la Task 9
  se implemente después; el hook no rompe si el endpoint 404 todavía, solo
  falla el POST y se loguea).

- [ ] **Paso 1: Service worker (código plano, sin build — se sirve como
  archivo estático)**

```js
// public/sw.js
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {}
  const title = data.title || 'Neifert CRM'
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: '/favicon.ico',
      data: { url: data.url || '/crm/alertas' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(clients.openWindow(event.notification.data?.url || '/crm/alertas'))
})
```

- [ ] **Paso 2: Test del hook (falla)**

```js
// src/crm/__tests__/usePushNotifications.test.js
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

vi.mock('@/crm/hooks/useCrmPerfil', () => ({ useCrmPerfil: () => ({ id: 'u1' }) }))
vi.mock('@/crm/services/usuarios.service', () => ({ tokenActual: vi.fn().mockResolvedValue('tok') }))

describe('usePushNotifications', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) })
    global.navigator.serviceWorker = {
      register: vi.fn().mockResolvedValue({
        pushManager: {
          subscribe: vi.fn().mockResolvedValue({
            endpoint: 'https://x/1',
            toJSON: () => ({ endpoint: 'https://x/1', keys: { p256dh: 'p', auth: 'a' } }),
          }),
        },
      }),
    }
    global.Notification = { requestPermission: vi.fn().mockResolvedValue('granted'), permission: 'default' }
  })

  it('activar() pide permiso, se suscribe y manda la suscripción al backend', async () => {
    const { usePushNotifications } = await import('../hooks/usePushNotifications.js')
    const { result } = renderHook(() => usePushNotifications())
    await act(async () => { await result.current.activar() })
    expect(global.fetch).toHaveBeenCalledWith('/api/crm/push-subscribe', expect.objectContaining({ method: 'POST' }))
  })
})
```

- [ ] **Paso 3: Implementar el hook**

```js
// src/crm/hooks/usePushNotifications.js
import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import { tokenActual } from '@/crm/services/usuarios.service'

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)))
}

export function usePushNotifications() {
  const [activando, setActivando] = useState(false)
  const soportado = typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window

  const activar = useCallback(async () => {
    if (!soportado) return toast.error('Este navegador no soporta notificaciones de escritorio.')
    setActivando(true)
    try {
      const permiso = await Notification.requestPermission()
      if (permiso !== 'granted') return toast.error('No diste permiso para las notificaciones.')

      const reg = await navigator.serviceWorker.register('/sw.js')
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(import.meta.env.VITE_VAPID_PUBLIC_KEY),
      })
      const json = sub.toJSON()
      const token = await tokenActual()
      const res = await fetch('/api/crm/push-subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth }),
      })
      if (!res.ok) throw new Error('No se pudo guardar la suscripción en el servidor.')
      toast.success('Notificaciones de escritorio activadas.')
    } catch (e) {
      toast.error(e.message)
    } finally {
      setActivando(false)
    }
  }, [soportado])

  return { activar, activando, soportado }
}
```

- [ ] **Paso 4: Correr el test** — verde.

- [ ] **Paso 5: Botón en el sidebar**

```jsx
// src/crm/components/ActivarNotificaciones.jsx
import { Bell } from 'lucide-react'
import { usePushNotifications } from '@/crm/hooks/usePushNotifications'

export default function ActivarNotificaciones() {
  const { activar, activando, soportado } = usePushNotifications()
  if (!soportado) return null
  return (
    <button
      type="button"
      onClick={activar}
      disabled={activando}
      title="Activar notificaciones de escritorio"
      aria-label="Activar notificaciones de escritorio"
      className="grid h-10 w-10 place-items-center rounded-full text-ink-3 transition-colors hover:text-ink disabled:opacity-50"
    >
      <Bell size={18} />
    </button>
  )
}
```

Montarlo en `AppSidebar.jsx`, en el `<div className="flex items-center gap-2">`
que ya tiene `<ThemeToggle />` y el link de cambiar contraseña — agregar
`<ActivarNotificaciones />` ahí.

- [ ] **Paso 6: `npm run build`, confirmar que `public/sw.js` queda servido
  en `dist/sw.js`, commit**

```bash
git add public/sw.js src/crm/hooks/usePushNotifications.js src/crm/components/ActivarNotificaciones.jsx \
  src/components/layout/AppSidebar.jsx src/crm/__tests__/usePushNotifications.test.js
git commit -m "feat(crm): service worker y botón para activar notificaciones push"
```

---

### Task 9: Endpoint `push-subscribe`

**Files:**
- Create: `api/crm/push-subscribe.js`
- Modify: `src/plugins/crmProxy.js` (agregar el middleware de dev, mismo
  patrón que `/api/crm/usuarios`)
- Test: `src/server/__tests__/pushSubscribeEndpoint.test.js`

**Interfaces:**
- Consume: bearer token de sesión (mismo patrón de auth que
  `api/crm/usuarios.js` — valida con un cliente anon `auth.getUser`, después
  usa `service_role` para escribir).
- Produce: guarda una fila en `crm.push_subscriptions` — consumida por la
  Task 10.

- [ ] **Paso 1: Test del handler (falla)**

```js
// src/server/__tests__/pushSubscribeEndpoint.test.js
import { describe, it, expect, vi } from 'vitest'

function mockRes() {
  return { statusCode: 0, body: null, headers: {}, setHeader(k, v) { this.headers[k] = v }, status(c) { this.statusCode = c; return this }, json(b) { this.body = b; return this } }
}

describe('handlePushSubscribe', () => {
  it('401 sin bearer token válido', async () => {
    const { handlePushSubscribe } = await import('../../../api/crm/push-subscribe.js')
    const res = mockRes()
    const deps = { makeAnon: () => ({ auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) } }) }
    await handlePushSubscribe(
      { method: 'POST', headers: {}, body: {} },
      res,
      { env: { VITE_SUPABASE_URL: 'u', VITE_SUPABASE_ANON_KEY: 'a', SUPABASE_SERVICE_ROLE_KEY: 'k' }, deps },
    )
    expect(res.statusCode).toBe(401)
  })

  it('guarda la suscripción del usuario autenticado', async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null })
    const deps = {
      makeAnon: () => ({ auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) } }),
      makeAdmin: () => ({ schema: () => ({ from: () => ({ upsert }) }) }),
    }
    const { handlePushSubscribe } = await import('../../../api/crm/push-subscribe.js')
    const res = mockRes()
    await handlePushSubscribe(
      { method: 'POST', headers: { authorization: 'Bearer tok' }, body: { endpoint: 'https://x/1', p256dh: 'p', auth: 'a' } },
      res,
      { env: { VITE_SUPABASE_URL: 'u', VITE_SUPABASE_ANON_KEY: 'a', SUPABASE_SERVICE_ROLE_KEY: 'k' }, deps },
    )
    expect(res.statusCode).toBe(200)
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ usuario_id: 'u1', endpoint: 'https://x/1' }),
      expect.objectContaining({ onConflict: 'endpoint' }),
    )
  })
})
```

- [ ] **Paso 2: Implementar** (leer primero `api/crm/usuarios.js` completo
  para calcar exacto el patrón de auth con `getUser` + cliente admin —
  mismo criterio, no reinventar la validación)

```js
// api/crm/push-subscribe.js
import { createClient } from '@supabase/supabase-js'

export async function handlePushSubscribe(req, res, { env = process.env, deps = {} } = {}) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' })

  const url = env.VITE_SUPABASE_URL
  const anonKey = env.VITE_SUPABASE_ANON_KEY
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !anonKey || !serviceKey) return res.status(501).json({ ok: false, error: 'Faltan env vars de Supabase.' })

  const token = (req.headers.authorization || req.headers.Authorization || '').replace(/^Bearer\s+/i, '')
  const makeAnon = deps.makeAnon || (() => createClient(url, anonKey))
  const { data: { user } = {} } = await makeAnon().auth.getUser(token)
  if (!user) return res.status(401).json({ ok: false, error: 'No autorizado' })

  const { endpoint, p256dh, auth } = req.body || {}
  if (!endpoint || !p256dh || !auth) return res.status(400).json({ ok: false, error: 'Faltan datos de la suscripción.' })

  const makeAdmin = deps.makeAdmin || (() => createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } }))
  const { error } = await makeAdmin().schema('crm').from('push_subscriptions')
    .upsert({ usuario_id: user.id, endpoint, p256dh, auth }, { onConflict: 'endpoint' })
  if (error) return res.status(500).json({ ok: false, error: error.message })

  return res.status(200).json({ ok: true })
}

export default function handler(req, res) {
  return handlePushSubscribe(req, res)
}
```

- [ ] **Paso 3: Correr el test** — 2/2 verdes.

- [ ] **Paso 4: Dev proxy** — en `src/plugins/crmProxy.js`, agregar un
  middleware para `/api/crm/push-subscribe` calcado exacto del de
  `/api/crm/usuarios` (mismo shim `status/json/end`, mismo `readJsonBody`).

- [ ] **Paso 5: Commit**

```bash
git add api/crm/push-subscribe.js src/plugins/crmProxy.js src/server/__tests__/pushSubscribeEndpoint.test.js
git commit -m "feat(api): endpoint para guardar suscripciones push"
```

---

### Task 10: Endpoint `check-alertas` (el cron)

**Files:**
- Create: `api/crm/check-alertas.js`
- Modify: `src/plugins/crmProxy.js` (dev proxy)
- Test: `src/server/__tests__/checkAlertasEndpoint.test.js`

**Interfaces:**
- Consume: `crm.alertas` (pendientes), `crm.push_subscriptions`,
  `crm.usuarios.email`, `enviarPush` (Task 7), `enviarEmail` (Task 7).
- Produce: marca `notificado_24h`/`notificado_3h`, dispara avisos. Este es
  el endpoint que el usuario apunta desde cron-job.org (Task 11).

- [ ] **Paso 1: Test del handler (falla)** — cubre el cálculo de ventana y
  que no se manda dos veces:

```js
// src/server/__tests__/checkAlertasEndpoint.test.js
import { describe, it, expect, vi } from 'vitest'

function mockRes() {
  return { statusCode: 0, body: null, setHeader() {}, status(c) { this.statusCode = c; return this }, json(b) { this.body = b; return this } }
}
const env = { CRON_SECRET: 's3cr3t', VITE_SUPABASE_URL: 'u', SUPABASE_SERVICE_ROLE_KEY: 'k' }

describe('handleCheckAlertas', () => {
  it('401 sin el secreto', async () => {
    const { handleCheckAlertas } = await import('../../../api/crm/check-alertas.js')
    const res = mockRes()
    await handleCheckAlertas({ method: 'GET', headers: {} }, res, { env, deps: {} })
    expect(res.statusCode).toBe(401)
  })

  it('a una alerta que entró en la ventana de 24hs le manda push+email y marca notificado_24h', async () => {
    // "ahora" = 2026-10-01 10:00, alerta el 2026-10-02 10:05 → 24h antes cae a las 10:05 de hoy, ya pasó
    const ahora = new Date('2026-10-01T10:00:00Z')
    const alerta = {
      id: 1, titulo: 'ITV Cronos', fecha: '2026-10-02', hora: '10:05',
      notificado_24h: false, notificado_3h: false, asignado_a: 'u1',
      asignado: { email: 'bruno@x.com' },
    }
    const update = vi.fn().mockResolvedValue({ error: null })
    const enviarPush = vi.fn().mockResolvedValue({ vencidas: [] })
    const enviarEmail = vi.fn().mockResolvedValue({})
    const deps = {
      now: () => ahora,
      cargarAlertasPendientes: vi.fn().mockResolvedValue([alerta]),
      cargarSuscripciones: vi.fn().mockResolvedValue([{ endpoint: 'e1', p256dh: 'p', auth: 'a' }]),
      marcarNotificada: update,
      enviarPush,
      enviarEmail,
      borrarSuscripcionesVencidas: vi.fn(),
    }
    const { handleCheckAlertas } = await import('../../../api/crm/check-alertas.js')
    const res = mockRes()
    await handleCheckAlertas({ method: 'GET', headers: { authorization: 'Bearer s3cr3t' } }, res, { env, deps })

    expect(res.statusCode).toBe(200)
    expect(enviarPush).toHaveBeenCalled()
    expect(enviarEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'bruno@x.com' }))
    expect(update).toHaveBeenCalledWith(1, { notificado_24h: true })
  })

  it('no reenvía una alerta que ya tiene notificado_24h en true', async () => {
    const ahora = new Date('2026-10-01T10:00:00Z')
    const alerta = { id: 1, fecha: '2026-10-02', hora: '10:05', notificado_24h: true, notificado_3h: false, asignado_a: 'u1', asignado: {} }
    const enviarPush = vi.fn()
    const deps = {
      now: () => ahora,
      cargarAlertasPendientes: vi.fn().mockResolvedValue([alerta]),
      cargarSuscripciones: vi.fn().mockResolvedValue([]),
      marcarNotificada: vi.fn(),
      enviarPush, enviarEmail: vi.fn(), borrarSuscripcionesVencidas: vi.fn(),
    }
    const { handleCheckAlertas } = await import('../../../api/crm/check-alertas.js')
    const res = mockRes()
    await handleCheckAlertas({ method: 'GET', headers: { authorization: 'Bearer s3cr3t' } }, res, { env, deps })
    expect(enviarPush).not.toHaveBeenCalled()
  })
})
```

- [ ] **Paso 2: Implementar**

```js
// api/crm/check-alertas.js
import { createClient } from '@supabase/supabase-js'
import { enviarPush as enviarPushReal } from '../../src/server/webPush.js'
import { enviarEmail as enviarEmailReal } from '../../src/server/resendEmail.js'

const VENTANA_MS = 30 * 60 * 1000 // margen de tolerancia (cron cada 15-30 min)

function yaPaso(fecha, hora, horasAntes, ahora) {
  const objetivo = new Date(`${fecha}T${hora}:00`)
  objetivo.setHours(objetivo.getHours() - horasAntes)
  return ahora >= objetivo && ahora - objetivo <= VENTANA_MS + 15 * 60 * 1000
}

export async function handleCheckAlertas(req, res, { env = process.env, deps = {} } = {}) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' })

  const secret = env.CRON_SECRET
  const got = (req.headers.authorization || req.headers.Authorization || '').replace(/^Bearer\s+/i, '')
  if (!secret || got !== secret) return res.status(401).json({ ok: false, error: 'No autorizado' })

  const url = env.VITE_SUPABASE_URL
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY
  const admin = deps.makeAdmin
    ? deps.makeAdmin()
    : createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const db = () => admin.schema('crm')

  const ahora = (deps.now || (() => new Date()))()

  const cargarAlertasPendientes = deps.cargarAlertasPendientes || (async () => {
    const { data, error } = await db().from('alertas')
      .select('*, asignado:usuarios!alertas_asignado_a_fkey(email)')
      .eq('hecha', false)
      .or('notificado_24h.eq.false,notificado_3h.eq.false')
    if (error) throw error
    return data ?? []
  })
  const cargarSuscripciones = deps.cargarSuscripciones || (async (usuarioId) => {
    const { data, error } = await db().from('push_subscriptions').select('*').eq('usuario_id', usuarioId)
    if (error) throw error
    return data ?? []
  })
  const marcarNotificada = deps.marcarNotificada || (async (id, patch) => {
    const { error } = await db().from('alertas').update(patch).eq('id', id)
    if (error) throw error
  })
  const borrarSuscripcionesVencidas = deps.borrarSuscripcionesVencidas || (async (endpoints) => {
    if (!endpoints.length) return
    await db().from('push_subscriptions').delete().in('endpoint', endpoints)
  })
  const enviarPush = deps.enviarPush || enviarPushReal
  const enviarEmail = deps.enviarEmail || enviarEmailReal

  const alertas = await cargarAlertasPendientes()
  let enviadas24h = 0
  let enviadas3h = 0
  const errores = []

  for (const a of alertas) {
    for (const [campo, horasAntes, contador] of [
      ['notificado_24h', 24, () => enviadas24h++],
      ['notificado_3h', 3, () => enviadas3h++],
    ]) {
      if (a[campo]) continue
      if (!yaPaso(a.fecha, a.hora, horasAntes, ahora)) continue
      try {
        const subs = deps.cargarSuscripciones ? await cargarSuscripciones(a.asignado_a) : await cargarSuscripciones(a.asignado_a)
        const payload = {
          title: `Alerta: ${a.titulo}`,
          body: horasAntes === 24 ? 'Vence mañana a esta hora.' : 'Vence en 3 horas.',
          url: '/crm/alertas',
        }
        if (subs.length) {
          const { vencidas } = await enviarPush({ subscriptions: subs, payload })
          await borrarSuscripcionesVencidas(vencidas)
        }
        if (a.asignado?.email) {
          await enviarEmail({
            to: a.asignado.email,
            subject: payload.title,
            html: `<p>${payload.body}</p><p><strong>${a.titulo}</strong></p><p>${a.descripcion ?? ''}</p>`,
          })
        }
        await marcarNotificada(a.id, { [campo]: true })
        contador()
      } catch (e) {
        errores.push(`alerta ${a.id} (${campo}): ${e.message}`)
      }
    }
  }

  return res.status(200).json({ ok: errores.length === 0, enviadas24h, enviadas3h, errores })
}

export default function handler(req, res) {
  return handleCheckAlertas(req, res)
}
```

- [ ] **Paso 3: Correr el test, confirmar 3/3 verdes**

- [ ] **Paso 4: Dev proxy** — agregar `/api/crm/check-alertas` a
  `src/plugins/crmProxy.js`, mismo patrón shim que `sync-legacy`.

- [ ] **Paso 5: `npm test` completo + `npm run build`, confirmar todo limpio**

- [ ] **Paso 6: Commit**

```bash
git add api/crm/check-alertas.js src/plugins/crmProxy.js src/server/__tests__/checkAlertasEndpoint.test.js
git commit -m "feat(api): endpoint check-alertas (dispara push+email 24h/3h antes)"
```

---

### Task 11: Puesta en producción (config, no código)

Esta tarea es manual — configuración fuera del repo, no hay commits de
código (salvo que algo falle y haya que ajustar).

- [ ] **Paso 1: Vercel → Environment Variables (Production)**

Agregar, iguales a lo que hay en `.env` local:
- `RESEND_API_KEY`
- `VITE_VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT`

(`CRON_SECRET` ya debería estar de la tarea de `sync-legacy`.)

- [ ] **Paso 2: Verificar el dominio en Resend**

Ya se registró `neifertautomotores.com` en Resend (Task previa a este
plan) y se le pasaron al usuario los 4 registros DNS para cargar en Vercel
→ Domains. Una vez cargados, disparar la verificación (llamando a la API de
Resend o desde su dashboard) y confirmar `status: verified`.

- [ ] **Paso 3: Redeploy**

Con las env vars nuevas cargadas, hace falta un redeploy de `main` para que
tomen efecto (Vercel no las aplica a builds ya hechos).

- [ ] **Paso 4: Configurar cron-job.org**

El usuario crea una cuenta gratis en cron-job.org y agrega un cronjob:
- URL: `https://neifertautomotores.com/api/crm/check-alertas`
- Método: GET
- Header: `Authorization: Bearer <CRON_SECRET>`
- Intervalo: cada 15-30 min

- [ ] **Paso 5: Prueba end-to-end**

Crear una alerta de prueba con fecha/hora tal que "24hs antes" caiga
dentro de los próximos ~20 minutos, esperar la corrida del cron externo, y
confirmar que llega la notificación de escritorio (con el botón "Activar
notificaciones" ya aceptado en el navegador de prueba) y el email.

---

## Self-Review

- Cobertura de la spec: modelo de datos (Task 1), UI de alertas (Task
  4/5), email real por empleado (Task 6), push (Task 7/8/9), cron preciso
  (Task 10/11) — todos los puntos de la spec tienen tarea.
- Sin placeholders: todo el código de cada tarea está completo, ningún
  "TODO" ni "agregar validación acá".
- Consistencia de tipos: `crm.alertas.asignado_a` (uuid) ↔ `asignado_a`
  en `alertaSchema`/`AlertaFormModal` (string, id de usuario) ↔
  `crm.push_subscriptions.usuario_id` (uuid, mismo id) — coherente en todas
  las tareas. `hecha`/`hecha_en` usados igual en Task 1 (schema), Task 2
  (service) y Task 4/5 (UI).
