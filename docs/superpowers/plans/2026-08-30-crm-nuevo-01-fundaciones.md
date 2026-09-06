# CRM nuevo — Plan 1: Fundaciones

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dejar el CRM nuevo logueable en `/crm` con el schema `crm` productivo (RLS por rol), auth usuario/contraseña sobre Supabase Auth, el shell de la app (shadcn/ui + tokens + sidebar + tema), y los datos reales migrados desde `crm_legacy`.

**Architecture:** Route group `/crm/*` dentro de la app Vite actual. Schema `crm` en el mismo Supabase, promovido de `crm_legacy` (enums, FKs, triggers, RLS). Auth: Supabase Auth con email sintético `<slug(usuario)>@crm.neifert.local` — el form pide usuario+contraseña como el CRM viejo. Migración vía función SQL idempotente + script Node para la parte que necesita JS (resumen de peritajes).

**Tech Stack:** React 19, Vite 8, Tailwind v4 (CSS-first, dark por clase `.dark`), `@supabase/supabase-js` v2, `@tanstack/react-query` v5, `zustand` v5, `react-router-dom` v7, `react-hook-form` + `zod`, shadcn/ui (new-york, componentes en `src/components/ui/*`), Vitest 2, Testing Library.

**Spec:** `docs/superpowers/specs/2026-08-30-crm-nuevo-fundaciones-vehiculos-design.md` (secciones 2, 3, 4, 6, 7 — Vehículos es el Plan 2).

## Global Constraints

- **Module system:** ESM. `"type": "module"`.
- **Alias:** solo `@` → `src`. `@/crm/...` ya funciona (no tocar `vite.config.js` para alias). Todo el CRM vive en `src/crm/**` salvo los componentes shadcn en `src/components/ui/**`.
- **Tema:** el CRM **reusa `src/store/useUiStore.js`** (`theme` / `toggleTheme`, clase `.dark` en `<html>`, key `nf-theme`, script anti-FOUC ya en `index.html`). No se crea mecanismo de tema nuevo.
- **Tokens:** el CRM usa variables `--crm-*` definidas en `src/crm/styles/tokens.css` (en `:root` y bajo `.dark`). Nunca hex sueltos en componentes. No tocar los `--c-*` del sitio público.
- **DB:** schema `crm` (NO `crm_legacy`, que sigue service-role only). `crm` se agrega a Supabase → Settings → API → Exposed schemas (paso manual). `id` de tablas = `uuid` propio; `id_legacy` traza al clon.
- **Auth email sintético:** `emailDeUsuario(usuario)` DEBE producir exactamente lo mismo que `crmShadowEmail` en `src/server/crmCore.js`: `${String(user).toLowerCase().replace(/[^a-z0-9]/g, '')}@crm-viejo.neifert.local`. **OJO:** `crmCore` usa el dominio `@crm-viejo.neifert.local`. Reusar ese dominio exacto (no `@crm.neifert.local` del texto del spec) para poder compartir cuentas puente si hiciera falta, y para tener una sola fórmula. Confirmar leyendo `crmCore.js` antes de implementar.
- **Reusar, no reimplementar:** `supabase` de `src/services/supabaseClient.js`; `useUiStore` para tema; patrón de `src/plugins/crmProxy.js` para rutas dev; flujo `presign` de R2 (Plan 2).
- **Commits:** cerrar el body con `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`. No commitear a `main`.
- **Español** en columnas DB, copy de UI, y nombres de dominio en el código del CRM.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `components.json` | Config de shadcn/ui (new-york, RSC off, CSS vars, alias). |
| `src/components/ui/*.jsx` | Componentes shadcn copiados (button, input, label, select, dialog, tabs, table, badge, dropdown-menu, sheet, tooltip, sonner, form, skeleton, separator). |
| `src/crm/styles/tokens.css` | Variables `--crm-*` claro/oscuro. Importado por `CrmLayout`. |
| `src/crm/lib/authEmail.js` | `emailDeUsuario(usuario)` — fórmula compartida con `crmCore.crmShadowEmail`. |
| `src/crm/lib/mapeos.js` | Puro: mapeos `crm_legacy` → `crm` (text→enum, 0/1→bool, fecha zero→null) + `resumenPeritaje(datos)`. |
| `src/crm/lib/peritajeResumen.js` | (o dentro de mapeos) conteo `ok/observacion/falta` sobre items `tipo:'estado'`. Necesita `peritajeSchema` mínimo — ver Task 5. |
| `src/crm/services/crmUsuarios.service.js` | `listar()`, `miPerfil(userId)` contra `crm.usuarios`. |
| `src/crm/hooks/useCrmPerfil.js` | Hook: `{ usuario, nombre, rol, esAdmin, cargando }` desde el AuthContext. |
| `src/crm/components/CrmLayout.jsx` | Shell: sidebar + topbar + `<Outlet/>`, importa `tokens.css`, clase raíz `crm-root`. |
| `src/crm/components/CrmSidebar.jsx` | Nav lateral (colapsable ≥md, `Sheet` en <md), `ThemeToggle`, bloque usuario + salir. |
| `src/crm/components/CrmThemeToggle.jsx` | Botón estética shadcn cableado a `useUiStore.toggleTheme`. |
| `src/crm/pages/CrmLoginPage.jsx` | Form usuario + contraseña → `signInWithPassword(emailDeUsuario(u), p)`. |
| `src/crm/pages/CambiarPasswordPage.jsx` | `updateUser({ password })`. |
| `src/crm/pages/VehiculosPlaceholderPage.jsx` | Stub temporal (“Módulo en construcción”) para probar el shell. Lo reemplaza el Plan 2. |
| `src/crm/routes/CrmProtectedRoute.jsx` | Guard: sesión + fila `crm.usuarios` activa; si no, pantalla “sin acceso”. |
| `src/context/AuthProvider.jsx` | (modificar) cargar perfil `crm.usuarios` cuando la ruta es `/crm/*`; exponer `crmPerfil`. |
| `src/context/authContext.js` | (revisar) asegurar que el value expone `crmPerfil`. |
| `src/routes/AppRouter.jsx` | (modificar) agregar el grupo `/crm/*`. |
| `supabase/crm_schema.sql` | DDL completo del schema `crm` (idempotente). |
| `supabase/crm_migracion.sql` | `crm.migrar_desde_legacy()` (vehículos + gestoría en SQL). |
| `api/crm/seed-usuarios.js` | Serverless: crea/actualiza los usuarios (Supabase Auth + `crm.usuarios`). |
| `scripts/seed-crm-usuarios.mjs` | Lee un JSON local (gitignored) y llama el handler del seed. |
| `scripts/migrate-legacy-to-crm.mjs` | Corre la parte SQL + la de peritajes en JS + reporta conteos. |
| `src/plugins/crmProxy.js` | (modificar) ruta dev `/api/crm/seed-usuarios`. |
| `vitest.config.js` | (modificar) soporte jsdom para tests de componentes. |
| `.env.example` | (modificar) `SEED_SECRET`. |
| `.gitignore` | (modificar) `scripts/*.local.json`. |

---

## Task 1: base-nova (shadcn) aislado + tokens CRM + entorno de tests de componentes

> **Corrección durante ejecución:** `npx shadcn init -d` instaló el estilo
> **`base-nova`** (Base UI, no Radix) y modificó el CSS **compartido**
> `src/styles/index.css` (font swap, `@apply` globales, imports rotos). Ese
> archivo se revirtió a HEAD. Enfoque nuevo, **híbrido y aislado**: base-nova como
> base del CRM, todo su theme scopeado a `.crm-root` en archivos propios del CRM,
> el sitio público intacto. Se puede copiar algún componente Radix suelto a
> `src/components/ui/` más adelante si base-nova no alcanza.

**Files:**
- Keep (ya creados por el init): `components.json` (style `base-nova`), `src/lib/utils.js`, `src/components/ui/button.jsx`
- Create: `src/crm/styles/shadcn-theme.css` (mapeos `@theme inline` + imports de animación/fuentes)
- Create: `src/crm/styles/tokens.css` (`--crm-*` + vars semánticas de base-nova, scopeadas a `.crm-root`)
- Modify: `src/styles/index.css` (UNA línea: `@import '../crm/styles/shadcn-theme.css';`)
- Modify: `package.json`, `vitest.config.js`
- Create: `vitest.setup.js`, `src/crm/__tests__/setup-shadcn.test.jsx`

**Interfaces:**
- Consumes: nada.
- Produces: componentes base-nova importables desde `@/components/ui/<name>`, funcionales **solo dentro de `.crm-root`** (ahí viven sus vars); `--crm-*` tokens bajo `.crm-root`; `npm test` corre tests `node` y `jsdom`.

- [ ] **Step 1: Instalar deps**

Run: `npm i -D tw-animate-css @fontsource-variable/geist-mono @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom`
(`class-variance-authority`, `@fontsource-variable/geist`, `@base-ui/react`, `shadcn` ya los puso el init. `clsx`, `tailwind-merge`, `lucide-react` ya estaban.)

- [ ] **Step 2: `src/crm/styles/shadcn-theme.css`** (mapeos globales, inertes para el sitio)

```css
/* Theme de base-nova (shadcn) para el CRM. Los @theme inline son globales
   (Tailwind los necesita para generar bg-primary, text-muted-foreground, etc.)
   pero son inertes para el sitio público, que nunca usa esas clases. Los
   VALORES de las vars viven scopeados en .crm-root (ver tokens.css). */
@import 'tw-animate-css';
@import '@fontsource-variable/geist';
@import '@fontsource-variable/geist-mono';

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);
}
```

- [ ] **Step 3: `src/crm/styles/tokens.css`** (valores, scopeados)

```css
/* Tokens del CRM + valores de las vars semánticas de base-nova. TODO scopeado
   a .crm-root (lo pone CrmLayout / CrmLoginPage en su div raíz). Reusa la clase
   .dark en <html> que maneja useUiStore. */
.crm-root {
  /* Paleta CRM (Apple-minimal) */
  --crm-bg: #fbfbfd;
  --crm-surface: #ffffff;
  --crm-ink: #1d1d1f;
  --crm-muted: #86868b;
  --crm-line: #e8e8ed;
  --crm-accent: #0b6bcb;
  --crm-ok: #1a7f52;
  --crm-obs: #b0740a;
  --crm-falta: #c1352b;

  /* Vars que consumen los componentes base-nova */
  --background: var(--crm-bg);
  --foreground: var(--crm-ink);
  --card: var(--crm-surface);
  --card-foreground: var(--crm-ink);
  --popover: var(--crm-surface);
  --popover-foreground: var(--crm-ink);
  --primary: var(--crm-accent);
  --primary-foreground: #ffffff;
  --secondary: #f2f2f5;
  --secondary-foreground: var(--crm-ink);
  --muted: #f2f2f5;
  --muted-foreground: var(--crm-muted);
  --accent: #eef4fb;
  --accent-foreground: var(--crm-accent);
  --destructive: var(--crm-falta);
  --destructive-foreground: #ffffff;
  --border: var(--crm-line);
  --input: var(--crm-line);
  --ring: var(--crm-accent);
  --radius: 0.625rem;

  background: var(--crm-bg);
  color: var(--crm-ink);
  font-family: 'Geist Variable', ui-sans-serif, system-ui, sans-serif;
}

.dark .crm-root {
  --crm-bg: #0a0a0c;
  --crm-surface: #161618;
  --crm-ink: #f5f5f7;
  --crm-muted: #8e8e93;
  --crm-line: #2a2a2e;
  --crm-accent: #3b93e6;
  --crm-ok: #34b27b;
  --crm-obs: #d2963a;
  --crm-falta: #e0564b;

  --secondary: #232327;
  --muted: #232327;
  --accent: #1c2b3a;
  --primary-foreground: #0a0a0c;
}

.crm-mono { font-family: 'Geist Mono Variable', ui-monospace, 'SF Mono', monospace; }
```

- [ ] **Step 4: UNA línea en `src/styles/index.css`**

Justo después de `@import 'tailwindcss';`, agregá:
```css
@import '../crm/styles/shadcn-theme.css'; /* theme del CRM (base-nova), scopeado a .crm-root */
```
No tocar nada más de ese archivo (font, @layer base, etc. quedan como están).

- [ ] **Step 5: Agregar el resto de componentes base-nova**

Run: `npx --yes shadcn@latest add input label select dialog tabs table badge dropdown-menu sheet tooltip sonner skeleton separator --yes`
(`button` ya está. Si algún nombre no existe en el registro base-nova, seguí sin él y anotá cuál para copiarlo a mano después.) Quedan en `src/components/ui/*.jsx`.

- [ ] **Step 6: Configurar vitest para jsdom por archivo**

En `vitest.config.js`, dentro de `test`, agregá:

```js
setupFiles: ['./vitest.setup.js'],
```

Create `vitest.setup.js`:

```js
import '@testing-library/jest-dom/vitest'
```

Los tests de componentes declaran su entorno con un docblock al inicio del archivo:
`// @vitest-environment jsdom`. Los de `src/server/**` y lógica pura siguen en `node` (default del config).

- [ ] **Step 7: Test de humo del entorno de componentes**

Create `src/crm/__tests__/setup-shadcn.test.jsx`:

```jsx
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Button } from '@/components/ui/button'

describe('entorno base-nova + jsdom', () => {
  it('renderiza un Button', () => {
    render(<div className="crm-root"><Button>Guardar</Button></div>)
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeInTheDocument()
  })
})
```

- [ ] **Step 8: Verificar que el sitio público no se rompió + suite**

Run: `npm run build`
Expected: build OK (el `@import` nuevo resuelve; `tw-animate-css` y las fuentes existen).
Run: `npm test`
Expected: PASS — tests del clon (`src/server/__tests__/**`) verdes + el nuevo de componente.
Run: `git diff --stat src/styles/index.css`
Expected: solo 1 línea agregada (el `@import`), nada más.

- [ ] **Step 9: Commit**

```bash
git add components.json src/components/ui src/lib/utils.js package.json package-lock.json src/crm/styles src/styles/index.css vitest.config.js vitest.setup.js src/crm/__tests__/setup-shadcn.test.jsx
git commit -m "$(printf 'feat(crm): base-nova aislado + tokens CRM + tests de componentes\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>')"
```

---

## Task 2: Schema `crm` (DDL + RLS)

**Files:**
- Create: `supabase/crm_schema.sql`
- Test: `src/crm/__tests__/crmSchema.test.js`

**Interfaces:**
- Consumes: nada (se aplica a mano en Supabase).
- Produces: schema `crm` con tablas `usuarios, vehiculos, vehiculo_fotos, peritajes, gestoria, eventos`; enums; funciones `crm.mi_rol()`, `crm.es_usuario()`; triggers; políticas RLS.

- [ ] **Step 1: Test de drift (falla primero)**

Create `src/crm/__tests__/crmSchema.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const sql = readFileSync(resolve('supabase/crm_schema.sql'), 'utf8').toLowerCase()

describe('crm_schema.sql', () => {
  it('crea el schema y los enums', () => {
    expect(sql).toContain('create schema if not exists crm')
    for (const e of ['crm.rol', 'crm.estado_vehiculo', 'crm.moneda', 'crm.estado_gestoria', 'crm.estado_item']) {
      expect(sql).toContain(e)
    }
  })
  it('crea las 6 tablas', () => {
    for (const t of ['crm.usuarios', 'crm.vehiculos', 'crm.vehiculo_fotos', 'crm.peritajes', 'crm.gestoria', 'crm.eventos']) {
      expect(sql).toContain(`table if not exists ${t}`)
    }
  })
  it('define las funciones de rol y activa RLS', () => {
    expect(sql).toContain('function crm.mi_rol')
    expect(sql).toContain('function crm.es_usuario')
    expect(sql).toContain('enable row level security')
  })
  it('vendedor no puede borrar vehiculos/peritajes/gestoria (delete solo admin)', () => {
    // por cada tabla restringida debe existir una policy de delete que menciona mi_rol() = 'admin'
    for (const t of ['vehiculos', 'peritajes', 'gestoria']) {
      const re = new RegExp(`create policy[^;]+on crm\\.${t}[^;]+for delete[^;]+admin`, 's')
      expect(sql).toMatch(re)
    }
  })
  it('las 8 columnas de gestoria estandar existen', () => {
    for (const item of ['form08', 'verif_policial', 'multas_nac', 'dominio_hist', 'libre_deudas', 'titulo', 'cedulas', 'identificacion']) {
      expect(sql).toContain(`${item}_hecho`)
    }
  })
})
```

Run: `npm test -- crmSchema` → FAIL (no existe el archivo).

- [ ] **Step 2: Escribir `supabase/crm_schema.sql`**

Idempotente. Estructura (completar con las columnas de la §3.2 del spec, verbatim):

```sql
-- ============================================================================
--  CRM NUEVO — schema `crm` (productivo, CON RLS). Promovido de `crm_legacy`.
--  Ejecutar en Supabase -> SQL Editor -> Run. Idempotente.
--  Después: Settings -> API -> Exposed schemas -> agregar `crm`.
-- ============================================================================
create schema if not exists crm;
create extension if not exists citext;

-- ENUMS (idempotencia con guardas DO $$ ... $$)
do $$ begin create type crm.rol as enum ('admin','vendedor'); exception when duplicate_object then null; end $$;
do $$ begin create type crm.estado_vehiculo as enum ('disponible','reservado','vendido','baja'); exception when duplicate_object then null; end $$;
do $$ begin create type crm.moneda as enum ('ARS','USD'); exception when duplicate_object then null; end $$;
do $$ begin create type crm.estado_gestoria as enum ('sin_iniciar','en_proceso','completo'); exception when duplicate_object then null; end $$;
do $$ begin create type crm.estado_item as enum ('ok','observacion','falta','na'); exception when duplicate_object then null; end $$;

-- TABLAS
create table if not exists crm.usuarios (
  id         uuid primary key references auth.users(id) on delete cascade,
  usuario    citext unique not null,
  nombre     text not null,
  rol        crm.rol not null default 'vendedor',
  activo     boolean not null default true,
  id_legacy  int,
  creado_en  timestamptz not null default now()
);

create table if not exists crm.vehiculos (
  id uuid primary key default gen_random_uuid(),
  id_legacy text unique,
  marca text not null,
  modelo text not null,
  version text,
  patente text,
  tipo text,
  anio int,
  km int,
  transmision text,
  color text,
  moneda crm.moneda not null default 'ARS',
  precio_contado numeric,
  precio_canje numeric,
  duenio_nombre text,
  duenio_apellido text,
  duenio_contacto text,
  itv text,
  itv_venc date,
  consignacion boolean not null default false,
  tipo_consignacion text,
  origen text,
  carpeta_completa boolean not null default false,
  carpeta_con_oficio boolean not null default false,
  carpeta_entregada boolean not null default false,
  tiene_iva boolean not null default false,
  nota text,
  estado crm.estado_vehiculo not null default 'disponible',
  creado_por uuid references crm.usuarios(id),
  editado_por uuid references crm.usuarios(id),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  archivado_en timestamptz
);
create index if not exists idx_crm_veh_estado on crm.vehiculos(estado);
create index if not exists idx_crm_veh_marca_modelo on crm.vehiculos(marca, modelo);
create index if not exists idx_crm_veh_patente on crm.vehiculos(patente);
create index if not exists idx_crm_veh_archivado on crm.vehiculos(archivado_en);

create table if not exists crm.vehiculo_fotos (
  id bigserial primary key,
  vehiculo_id uuid not null references crm.vehiculos(id) on delete cascade,
  orden int not null default 0,
  url text not null,
  es_portada boolean not null default false,
  subida_por uuid references crm.usuarios(id),
  subida_en timestamptz not null default now()
);
create unique index if not exists idx_crm_foto_portada on crm.vehiculo_fotos(vehiculo_id) where es_portada;
create index if not exists idx_crm_foto_veh on crm.vehiculo_fotos(vehiculo_id);

create table if not exists crm.peritajes (
  id bigserial primary key,
  vehiculo_id uuid not null references crm.vehiculos(id) on delete cascade,
  id_legacy int unique,
  fecha date,
  peritado_por uuid references crm.usuarios(id),
  resena text,
  costo_total numeric,
  datos jsonb not null default '{}'::jsonb,
  items_ok int not null default 0,
  items_obs int not null default 0,
  items_falta int not null default 0,
  creado_en timestamptz not null default now()
);
create index if not exists idx_crm_peritaje_veh on crm.peritajes(vehiculo_id, fecha desc);

create table if not exists crm.gestoria (
  id bigserial primary key,
  vehiculo_id uuid not null unique references crm.vehiculos(id) on delete cascade,
  id_legacy int unique,
  estado crm.estado_gestoria not null default 'sin_iniciar',
  notas text,
  fecha_inicio date,
  fecha_cierre date,
  form08_hecho boolean not null default false, form08_fecha date, form08_nota text, form08_por uuid references crm.usuarios(id),
  verif_policial_hecho boolean not null default false, verif_policial_fecha date, verif_policial_nota text, verif_policial_por uuid references crm.usuarios(id),
  multas_nac_hecho boolean not null default false, multas_nac_fecha date, multas_nac_nota text, multas_nac_por uuid references crm.usuarios(id),
  dominio_hist_hecho boolean not null default false, dominio_hist_fecha date, dominio_hist_nota text, dominio_hist_por uuid references crm.usuarios(id),
  libre_deudas_hecho boolean not null default false, libre_deudas_fecha date, libre_deudas_nota text, libre_deudas_por uuid references crm.usuarios(id),
  titulo_hecho boolean not null default false, titulo_fecha date, titulo_nota text, titulo_por uuid references crm.usuarios(id),
  cedulas_hecho boolean not null default false, cedulas_fecha date, cedulas_nota text, cedulas_por uuid references crm.usuarios(id),
  identificacion_hecho boolean not null default false, identificacion_fecha date, identificacion_nota text, identificacion_por uuid references crm.usuarios(id),
  items_extra jsonb not null default '{}'::jsonb,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create table if not exists crm.eventos (
  id bigserial primary key,
  entidad text not null,
  entidad_id text not null,
  tipo text not null,
  usuario_id uuid references crm.usuarios(id),
  datos jsonb not null default '{}'::jsonb,
  creado_en timestamptz not null default now()
);
create index if not exists idx_crm_eventos_entidad on crm.eventos(entidad, entidad_id, creado_en desc);

-- FUNCIONES
create or replace function crm.mi_rol() returns crm.rol
  language sql stable security definer set search_path = crm, public as
$$ select rol from crm.usuarios where id = auth.uid() $$;

create or replace function crm.es_usuario() returns boolean
  language sql stable security definer set search_path = crm, public as
$$ select exists (select 1 from crm.usuarios where id = auth.uid() and activo) $$;

create or replace function crm.set_actualizado_en() returns trigger
  language plpgsql as $$ begin new.actualizado_en = now(); return new; end $$;

drop trigger if exists trg_veh_actualizado on crm.vehiculos;
create trigger trg_veh_actualizado before update on crm.vehiculos
  for each row execute function crm.set_actualizado_en();

create or replace function crm.gestoria_recalc_estado() returns trigger
  language plpgsql as $$
declare hechos int;
begin
  hechos := (new.form08_hecho::int + new.verif_policial_hecho::int + new.multas_nac_hecho::int
    + new.dominio_hist_hecho::int + new.libre_deudas_hecho::int + new.titulo_hecho::int
    + new.cedulas_hecho::int + new.identificacion_hecho::int);
  new.estado := case when hechos = 0 then 'sin_iniciar'::crm.estado_gestoria
                     when hechos = 8 then 'completo'::crm.estado_gestoria
                     else 'en_proceso'::crm.estado_gestoria end;
  new.actualizado_en := now();
  return new;
end $$;

drop trigger if exists trg_gestoria_estado on crm.gestoria;
create trigger trg_gestoria_estado before insert or update on crm.gestoria
  for each row execute function crm.gestoria_recalc_estado();

-- RLS
alter table crm.usuarios        enable row level security;
alter table crm.vehiculos       enable row level security;
alter table crm.vehiculo_fotos  enable row level security;
alter table crm.peritajes       enable row level security;
alter table crm.gestoria        enable row level security;
alter table crm.eventos         enable row level security;

-- (drop policy if exists ... para idempotencia, luego create) — por cada una:
drop policy if exists usuarios_select on crm.usuarios;
create policy usuarios_select on crm.usuarios for select using (crm.es_usuario());
drop policy if exists usuarios_admin_ins on crm.usuarios;
create policy usuarios_admin_ins on crm.usuarios for insert with check (crm.mi_rol() = 'admin');
drop policy if exists usuarios_admin_upd on crm.usuarios;
create policy usuarios_admin_upd on crm.usuarios for update using (crm.mi_rol() = 'admin');
drop policy if exists usuarios_admin_del on crm.usuarios;
create policy usuarios_admin_del on crm.usuarios for delete using (crm.mi_rol() = 'admin');

-- vehiculos / peritajes / gestoria: select+insert+update para es_usuario(); delete solo admin
-- vehiculo_fotos / eventos: select+insert (eventos sin update/delete); fotos update+delete es_usuario()
-- (escribir las 6 tablas × sus verbos según la tabla de la §3.4 del spec)

grant usage on schema crm to anon, authenticated;
grant select, insert, update, delete on all tables in schema crm to authenticated;
grant usage, select on all sequences in schema crm to authenticated;
alter default privileges in schema crm grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema crm grant usage, select on sequences to authenticated;
```

Completá las policies faltantes siguiendo exactamente la matriz de la §3.4 del spec.

- [ ] **Step 3: Test en verde**

Run: `npm test -- crmSchema` → PASS. Ajustá el SQL hasta que pase.

- [ ] **Step 4: Aplicar en Supabase (manual)**

SQL Editor → pegar `supabase/crm_schema.sql` → Run. Settings → API → Exposed schemas → agregar `crm` → Save. Confirmar sin errores.

- [ ] **Step 5: Commit**

```bash
git add supabase/crm_schema.sql src/crm/__tests__/crmSchema.test.js
git commit -m "$(printf 'feat(crm): schema crm (enums, tablas, triggers, RLS por rol)\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>')"
```

---

## Task 3: `authEmail.js` — email sintético

**Files:**
- Create: `src/crm/lib/authEmail.js`
- Test: `src/crm/__tests__/authEmail.test.js`

**Interfaces:**
- Consumes: (referencia) `crmShadowEmail` de `src/server/crmCore.js`.
- Produces: `emailDeUsuario(usuario: string): string`.

- [ ] **Step 1: Leer la fórmula de referencia**

Abrí `src/server/crmCore.js`, función `crmShadowEmail`. Copiá su lógica EXACTA (normalización + dominio). Si el dominio ahí es `@crm-viejo.neifert.local`, usá ese.

- [ ] **Step 2: Test (falla primero)**

```js
import { describe, it, expect } from 'vitest'
import { emailDeUsuario } from '../lib/authEmail.js'

describe('emailDeUsuario', () => {
  it('normaliza minúsculas y saca no-alfanuméricos', () => {
    expect(emailDeUsuario('Bruno')).toBe('bruno@crm-viejo.neifert.local')
    expect(emailDeUsuario('Juan Pérez')).toBe('juanprez@crm-viejo.neifert.local')
  })
  it('coincide con crmShadowEmail del servidor', async () => {
    const mod = await import('../../server/crmCore.js')
    // crmShadowEmail no está exportada -> replicar su cuerpo aquí como oráculo:
    const oraculo = (u) => `${String(u).toLowerCase().replace(/[^a-z0-9]/g, '')}@crm-viejo.neifert.local`
    for (const u of ['Bruno', 'Cristian', 'Nico', 'Valeria', 'Juani ', 'Víctor 2']) {
      expect(emailDeUsuario(u)).toBe(oraculo(u))
    }
  })
})
```

Run: `npm test -- authEmail` → FAIL.

- [ ] **Step 3: Implementar**

```js
/** Email sintético 1-a-1 por usuario del CRM. No recibe correo real: es un id
 *  estable para Supabase Auth. Misma fórmula que crmShadowEmail en
 *  src/server/crmCore.js — no divergir. */
export function emailDeUsuario(usuario) {
  return `${String(usuario).toLowerCase().replace(/[^a-z0-9]/g, '')}@crm-viejo.neifert.local`
}
```

- [ ] **Step 4: Test en verde**

Run: `npm test -- authEmail` → PASS. Si el dominio real difiere, ajustá impl **y** test al valor de `crmCore.js`.

- [ ] **Step 5: Commit**

```bash
git add src/crm/lib/authEmail.js src/crm/__tests__/authEmail.test.js
git commit -m "$(printf 'feat(crm): emailDeUsuario (email sintetico compartido con crmCore)\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>')"
```

---

## Task 4: Seed de usuarios (serverless + script + ruta dev)

**Files:**
- Create: `api/crm/seed-usuarios.js`
- Create: `scripts/seed-crm-usuarios.mjs`
- Modify: `src/plugins/crmProxy.js`, `.env.example`, `.gitignore`
- Test: `src/crm/__tests__/seedUsuarios.test.js`

**Interfaces:**
- Consumes: `emailDeUsuario` (Task 3), `@supabase/supabase-js` admin client.
- Produces: `handleSeedUsuarios(req, res, { env, deps }): Promise<void>` — POST, auth por `SEED_SECRET` (o `CRON_SECRET`), body `{ usuarios: [{ usuario, nombre, rol, password }] }`; por cada uno crea/actualiza el auth user + upsert en `crm.usuarios` (matcheando `id_legacy` contra `crm_legacy.usuarios` por `usuario`). Responde `{ ok, resultados: [{ usuario, creado|actualizado, error? }] }`.

- [ ] **Step 1: Test del handler (falla primero)**

```js
import { describe, it, expect, vi } from 'vitest'
import { handleSeedUsuarios } from '../../../api/crm/seed-usuarios.js'

function mockRes() {
  return { statusCode: 0, body: null, setHeader() {}, status(c){this.statusCode=c;return this}, json(b){this.body=b;return this}, end(b){this.body=b??this.body;return this} }
}

const env = { SEED_SECRET: 's', VITE_SUPABASE_URL: 'u', SUPABASE_SERVICE_ROLE_KEY: 'k' }

function fakeAdmin({ existing = [] } = {}) {
  const created = []
  return {
    _created: created,
    auth: { admin: {
      listUsers: vi.fn().mockResolvedValue({ data: { users: existing }, error: null }),
      createUser: vi.fn().mockImplementation(async ({ email }) => {
        const u = { id: 'uid-' + email, email }; created.push(u); return { data: { user: u }, error: null }
      }),
      updateUserById: vi.fn().mockResolvedValue({ data: {}, error: null }),
    }},
    schema: () => ({
      from: () => ({
        upsert: vi.fn().mockReturnValue({ select: () => ({ data: [{}], error: null }) }),
        select: () => ({ eq: () => ({ maybeSingle: () => ({ data: null, error: null }) }) }),
      }),
    }),
  }
}

describe('handleSeedUsuarios', () => {
  it('401 sin secreto', async () => {
    const res = mockRes()
    await handleSeedUsuarios({ method: 'POST', headers: {}, body: {} }, res, { env, deps: { makeAdmin: () => fakeAdmin() } })
    expect(res.statusCode).toBe(401)
  })
  it('crea usuarios nuevos', async () => {
    const res = mockRes()
    const admin = fakeAdmin()
    await handleSeedUsuarios(
      { method: 'POST', headers: { authorization: 'Bearer s' }, body: { usuarios: [{ usuario: 'Bruno', nombre: 'Bruno', rol: 'vendedor', password: 'x' }] } },
      res, { env, deps: { makeAdmin: () => admin } },
    )
    expect(res.statusCode).toBe(200)
    expect(res.body.resultados[0]).toMatchObject({ usuario: 'Bruno', creado: true })
    expect(admin.auth.admin.createUser).toHaveBeenCalledWith(expect.objectContaining({ email: 'bruno@crm-viejo.neifert.local', password: 'x', email_confirm: true }))
  })
})
```

Run: `npm test -- seedUsuarios` → FAIL.

- [ ] **Step 2: Implementar `api/crm/seed-usuarios.js`**

```js
import { createClient } from '@supabase/supabase-js'
import { emailDeUsuario } from '../../src/crm/lib/authEmail.js'

export async function handleSeedUsuarios(req, res, { env = process.env, deps = {} } = {}) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' })
  const secret = env.SEED_SECRET || env.CRON_SECRET
  const got = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (!secret || got !== secret) return res.status(401).json({ ok: false, error: 'No autorizado' })

  const url = env.VITE_SUPABASE_URL, key = env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return res.status(501).json({ ok: false, error: 'Faltan VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY' })

  const usuarios = req.body?.usuarios
  if (!Array.isArray(usuarios) || !usuarios.length) return res.status(400).json({ ok: false, error: 'body.usuarios vacío' })

  const admin = (deps.makeAdmin || (() => createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })))()
  const resultados = []

  for (const u of usuarios) {
    try {
      const email = emailDeUsuario(u.usuario)
      const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
      let authUser = list.users.find((x) => x.email === email)
      let creado = false
      if (!authUser) {
        const { data, error } = await admin.auth.admin.createUser({
          email, password: u.password, email_confirm: true,
          user_metadata: { nombre: u.nombre, rol: u.rol },
        })
        if (error) throw error
        authUser = data.user; creado = true
      } else if (u.password) {
        await admin.auth.admin.updateUserById(authUser.id, { password: u.password })
      }
      // id_legacy: match contra crm_legacy.usuarios por usuario
      const { data: legacyU } = await admin.schema('crm_legacy').from('usuarios')
        .select('id').eq('usuario', u.usuario).maybeSingle()
      const { error: upErr } = await admin.schema('crm').from('usuarios').upsert({
        id: authUser.id, usuario: u.usuario, nombre: u.nombre, rol: u.rol, activo: true,
        id_legacy: legacyU?.id ?? null,
      }, { onConflict: 'id' }).select()
      if (upErr) throw upErr
      resultados.push({ usuario: u.usuario, creado, actualizado: !creado })
    } catch (e) {
      resultados.push({ usuario: u.usuario, error: e.message })
    }
  }
  const ok = resultados.every((r) => !r.error)
  return res.status(ok ? 200 : 207).json({ ok, resultados })
}

export default function handler(req, res) { return handleSeedUsuarios(req, res) }
```

- [ ] **Step 3: Ruta dev en `src/plugins/crmProxy.js`**

Después del bloque `/api/crm/sync-legacy` (o `/api/crm/clientes`), agregá (reusando el `readJsonBody`/`sendJson` del archivo):

```js
      server.middlewares.use('/api/crm/seed-usuarios', async (req, res) => {
        const { handleSeedUsuarios } = await import('../../api/crm/seed-usuarios.js')
        const body = req.method === 'POST' ? await readJsonBody(req).catch(() => ({})) : {}
        const shim = {
          setHeader: (k, v) => res.setHeader(k, v),
          status: (c) => { res.statusCode = c; return shim },
          json: (b) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(b)) },
          end: (b) => res.end(b),
        }
        await handleSeedUsuarios({ ...req, body }, shim)
      })
```

- [ ] **Step 4: Script `scripts/seed-crm-usuarios.mjs`**

```js
// Lee scripts/crm-usuarios.local.json (gitignored) y siembra los usuarios.
// node --env-file=.env scripts/seed-crm-usuarios.mjs
import { readFileSync } from 'node:fs'
import { handleSeedUsuarios } from '../api/crm/seed-usuarios.js'

const usuarios = JSON.parse(readFileSync(new URL('./crm-usuarios.local.json', import.meta.url), 'utf8'))
const res = { statusCode: 0, body: null, setHeader() {}, status(c){this.statusCode=c;return this}, json(b){this.body=b;return this}, end(b){this.body=b??this.body;return this} }
await handleSeedUsuarios(
  { method: 'POST', headers: { authorization: 'Bearer ' + (process.env.SEED_SECRET || process.env.CRON_SECRET) }, body: { usuarios } },
  res, {},
)
console.log(JSON.stringify(res.body, null, 2))
process.exit(res.statusCode === 200 ? 0 : 1)
```

Formato de `scripts/crm-usuarios.local.json` (documentar en un `.example`):
```json
[
  { "usuario": "Cristian", "nombre": "Cristian", "rol": "admin", "password": "…" },
  { "usuario": "Bruno", "nombre": "Bruno", "rol": "vendedor", "password": "…" }
]
```

- [ ] **Step 5: `.gitignore` + `.env.example`**

`.gitignore`: agregá `scripts/*.local.json`.
`.env.example`: agregá tras `CRON_SECRET`:
```
# Secreto para sembrar/actualizar usuarios del CRM nuevo (api/crm/seed-usuarios.js).
# Si no se setea, cae a CRON_SECRET.
SEED_SECRET=
```

- [ ] **Step 6: Test en verde + suite**

Run: `npm test -- seedUsuarios` → PASS. Luego `npm test` completo → verde.

- [ ] **Step 7: Commit**

```bash
git add api/crm/seed-usuarios.js scripts/seed-crm-usuarios.mjs src/plugins/crmProxy.js .env.example .gitignore src/crm/__tests__/seedUsuarios.test.js
git commit -m "$(printf 'feat(crm): seed de usuarios (Supabase Auth + crm.usuarios)\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>')"
```

---

## Task 5: `mapeos.js` — transformaciones legacy→crm + resumen de peritaje

**Files:**
- Create: `src/crm/lib/mapeos.js`
- Create: `src/crm/lib/peritajeSchema.js` (versión mínima: solo lo necesario para el resumen)
- Test: `src/crm/__tests__/mapeos.test.js`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `mapVehiculo(legacyRow): objeto para crm.vehiculos` (sin `id`, con `id_legacy`).
  - `mapEstadoVehiculo(status): 'disponible'|'reservado'|'vendido'|'baja'` (desconocido/null → `'baja'`).
  - `mapGestoria(legacyRow): objeto para crm.gestoria` (columnas `<item>_hecho/_fecha/_nota`).
  - `resumenPeritaje(datos: object): { items_ok, items_obs, items_falta }` — cuenta valores `ok`/`observacion`/`falta` sobre las keys que `peritajeSchema` marca `tipo:'estado'`. Acepta sinónimos legacy: `''`/`null`→ignora, `'ok'`→ok, `'obs'`/`'observación'`→obs, `'falta'`/`'mal'`→falta, `'na'`/`'n/a'`→ignora.
- `peritajeSchema.js` exporta `PERITAJE_ITEMS_ESTADO: string[]` (lista de keys `tipo:'estado'`), extraída de los ~120 campos del POST de `peritaje.php` en `scraping/NewEndpoints/*.har` (los que son checklist de condición, no texto/costo/%).

- [ ] **Step 1: Extraer las keys de estado del HAR**

Run: `node scripts/dump-legacy-har-shapes.mjs | grep -A200 "POST /backend/api/peritaje.php"` — de la lista de ~120 keys, las de condición (motor, cajaAT, embrague, frenos, abs, airbag, gatoLlave, matafuego, …) son `tipo:'estado'`; las `obs*`, `costo*`, `pct*`, `dtcCode*`, `daño*`, `f*` (historial texto) NO. Armá `PERITAJE_ITEMS_ESTADO` con las de condición.

- [ ] **Step 2: Test (falla primero)**

```js
import { describe, it, expect } from 'vitest'
import { mapVehiculo, mapEstadoVehiculo, mapGestoria, resumenPeritaje } from '../lib/mapeos.js'

describe('mapEstadoVehiculo', () => {
  it('mapea conocidos y cae a baja', () => {
    expect(mapEstadoVehiculo('disponible')).toBe('disponible')
    expect(mapEstadoVehiculo('vendido')).toBe('vendido')
    expect(mapEstadoVehiculo('reservado')).toBe('reservado')
    expect(mapEstadoVehiculo(null)).toBe('baja')
    expect(mapEstadoVehiculo('cualquier_cosa')).toBe('baja')
  })
})

describe('mapVehiculo', () => {
  const legacy = { id: '6abc', brand: 'TOYOTA', model: 'HILUX', year: 2015, km: 128000, moneda_contado: 'ARS', precio_contado: null, itv: 'si', carpeta_entregada: 0, status: 'disponible', consignacion: 1 }
  it('tipa y traza id_legacy', () => {
    const r = mapVehiculo(legacy)
    expect(r.id_legacy).toBe('6abc')
    expect(r).not.toHaveProperty('id')
    expect(r.marca).toBe('TOYOTA')
    expect(r.anio).toBe(2015)
    expect(r.moneda).toBe('ARS')
    expect(r.carpeta_entregada).toBe(false)
    expect(r.consignacion).toBe(true)
    expect(r.estado).toBe('disponible')
  })
})

describe('mapGestoria', () => {
  it('expande columnas espejo del legacy', () => {
    const r = mapGestoria({ id: 3, vehiculo_id: 'v', form08: 1, form08_fecha: '2026-06-02', form08_nota: 'x', verif_policial: 0 })
    expect(r.form08_hecho).toBe(true)
    expect(r.form08_fecha).toBe('2026-06-02')
    expect(r.verif_policial_hecho).toBe(false)
    expect(r.id_legacy).toBe(3)
  })
})

describe('resumenPeritaje', () => {
  it('cuenta ok/obs/falta sobre items de estado, ignora texto y na', () => {
    const datos = { motor: 'ok', frenos: 'obs', abs: 'falta', bateria: 'ok', cajaAT: 'na', obsMotor: 'texto libre', costoB: 1000 }
    expect(resumenPeritaje(datos)).toEqual({ items_ok: 2, items_obs: 1, items_falta: 1 })
  })
})
```

Run: `npm test -- mapeos` → FAIL.

- [ ] **Step 3: Implementar**

`peritajeSchema.js` (mínimo):
```js
// Keys del peritaje que son checklist de condición (tipo 'estado').
// Extraídas del POST de peritaje.php (scraping/NewEndpoints/*.har).
export const PERITAJE_ITEMS_ESTADO = [
  'motor','cajaAT','embrague','cuatroX4','diferencial',
  'frenos','trenDelant','amortiguadores',
  'abs','motorLuz','airbag','transLuz','bateria',
  'gatoLlave','ruedaAux','matafuego','balizas','antirrobos','alarma','segundaLlave',
  'manualUnidad','codigosRadio','carpetaDoc','audio','calefaccion','ac','vidriosElec',
  'cierreCentral','cinturon','frenoMano',
  'butacaIzq','butacaDer','asientoTras','tapizPuertas','tapizTecho','bandejaT',
  // completar con el resto de las keys de condición del HAR
]
```

`mapeos.js`:
```js
import { PERITAJE_ITEMS_ESTADO } from './peritajeSchema.js'

const b = (v) => v === true || v === 1 || v === '1'
const n = (v) => (v === '' || v == null ? null : Number.isFinite(Number(v)) ? Number(v) : null)
const s = (v) => { const x = v == null ? null : String(v).trim(); return x === '' ? null : x }
const d = (v) => { const x = s(v); return !x || x.startsWith('0000-00-00') ? null : x.slice(0, 10) }

const ESTADOS_VEH = new Set(['disponible', 'reservado', 'vendido', 'baja'])
export function mapEstadoVehiculo(status) {
  const x = s(status)?.toLowerCase()
  return x && ESTADOS_VEH.has(x) ? x : 'baja'
}

export function mapVehiculo(l) {
  return {
    id_legacy: s(l.id),
    marca: s(l.brand ?? l.marca) ?? '',
    modelo: s(l.model ?? l.modelo) ?? '',
    version: s(l.version),
    patente: s(l.patente),
    tipo: s(l.tipo),
    anio: n(l.year ?? l.anio),
    km: n(l.km),
    transmision: s(l.trans),
    color: s(l.color),
    moneda: (s(l.moneda_contado ?? l.monedaContado)?.toUpperCase() === 'USD') ? 'USD' : 'ARS',
    precio_contado: n(l.precio_contado ?? l.precioContado),
    precio_canje: n(l.precio_canje ?? l.precioCanje),
    duenio_nombre: s(l.duenio_nombre ?? l.duenioNombre),
    duenio_apellido: s(l.duenio_apellido ?? l.duenioApellido),
    duenio_contacto: s(l.duenio_contacto ?? l.duenioContacto),
    itv: s(l.itv),
    itv_venc: d(l.itv_venc ?? l.itvVenc),
    consignacion: b(l.consignacion),
    tipo_consignacion: s(l.tipo_consignacion ?? l.tipoConsignacion),
    origen: s(l.origen),
    carpeta_completa: b(l.carpeta_completa ?? l.carpetaCompleta),
    carpeta_con_oficio: b(l.carpeta_con_oficio ?? l.carpetaConOficio),
    carpeta_entregada: b(l.carpeta_entregada ?? l.carpetaEntregada),
    tiene_iva: b(l.tiene_iva ?? l.tieneIVA),
    nota: s(l.nota),
    estado: mapEstadoVehiculo(l.status),
  }
}

const GESTORIA_ITEMS = ['form08','verif_policial','multas_nac','dominio_hist','libre_deudas','titulo','cedulas','identificacion']
export function mapGestoria(l) {
  const out = {
    id_legacy: l.id ?? null,
    notas: s(l.notas),
    fecha_inicio: d(l.fecha_inicio ?? l.fechaInicio),
    fecha_cierre: d(l.fecha_cierre ?? l.fechaCierre),
    items_extra: {},
  }
  for (const it of GESTORIA_ITEMS) {
    out[`${it}_hecho`] = b(l[it])
    out[`${it}_fecha`] = d(l[`${it}_fecha`])
    out[`${it}_nota`] = s(l[`${it}_nota`])
  }
  return out
}

const VAL = { ok: 'ok', obs: 'obs', 'observación': 'obs', observacion: 'obs', falta: 'falta', mal: 'falta' }
export function resumenPeritaje(datos = {}) {
  let items_ok = 0, items_obs = 0, items_falta = 0
  for (const k of PERITAJE_ITEMS_ESTADO) {
    const raw = s(datos[k])?.toLowerCase()
    const v = raw && VAL[raw]
    if (v === 'ok') items_ok++
    else if (v === 'obs') items_obs++
    else if (v === 'falta') items_falta++
  }
  return { items_ok, items_obs, items_falta }
}
```

- [ ] **Step 4: Test en verde**

Run: `npm test -- mapeos` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/crm/lib/mapeos.js src/crm/lib/peritajeSchema.js src/crm/__tests__/mapeos.test.js
git commit -m "$(printf 'feat(crm): mapeos legacy->crm + resumen de peritaje\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>')"
```

---

## Task 6: Migración de datos (SQL + script)

**Files:**
- Create: `supabase/crm_migracion.sql`
- Create: `scripts/migrate-legacy-to-crm.mjs`
- Test: `src/crm/__tests__/crmMigracion.test.js`

**Interfaces:**
- Consumes: `crm_legacy.*` (poblado por el sync del Plan del clon), `mapeos.js` (peritajes en JS).
- Produces: `crm.migrar_desde_legacy()` (vehículos + gestoría, idempotente por `id_legacy`); script que la corre + migra peritajes en JS + reporta conteos.

- [ ] **Step 1: Test de forma del SQL (falla primero)**

```js
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
const sql = readFileSync(resolve('supabase/crm_migracion.sql'), 'utf8').toLowerCase()

describe('crm_migracion.sql', () => {
  it('define la función idempotente', () => {
    expect(sql).toContain('function crm.migrar_desde_legacy')
    expect(sql).toContain('on conflict (id_legacy) do update')
  })
  it('migra vehiculos y gestoria desde crm_legacy', () => {
    expect(sql).toContain('from crm_legacy.vehiculos')
    expect(sql).toContain('from crm_legacy.gestoria_tramites')
    expect(sql).toContain('into crm.vehiculos')
    expect(sql).toContain('into crm.gestoria')
  })
})
```

Run: `npm test -- crmMigracion` → FAIL.

- [ ] **Step 2: Escribir `supabase/crm_migracion.sql`**

`crm.migrar_desde_legacy()` — `plpgsql`, idempotente:
- `insert into crm.vehiculos (id_legacy, marca, modelo, ...) select ... from crm_legacy.vehiculos on conflict (id_legacy) do update set ...` con los casts (text→enum vía `case`, `0/1`→bool, `nullif(fecha,'0000-00-00')::date`). `estado` = `case lower(status) when 'disponible' then 'disponible'::crm.estado_vehiculo ... else 'baja'::crm.estado_vehiculo end`.
- `insert into crm.gestoria (...) select ... from crm_legacy.gestoria_tramites gt join crm.vehiculos v on v.id_legacy = gt.vehiculo_id on conflict (id_legacy) do update ...` — mapea las columnas espejo del clon a `<item>_hecho/_fecha/_nota`. `<item>_por` queda null.
- Devuelve `table(entidad text, insertados int, actualizados int)` o loguea con `raise notice`.
- Peritajes **no** acá (se hacen en JS por el resumen).

- [ ] **Step 3: Test en verde**

Run: `npm test -- crmMigracion` → PASS.

- [ ] **Step 4: Script `scripts/migrate-legacy-to-crm.mjs`**

```js
// node --env-file=.env scripts/migrate-legacy-to-crm.mjs
import { createClient } from '@supabase/supabase-js'
import { resumenPeritaje } from '../src/crm/lib/mapeos.js'

const admin = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

// 1) vehículos + gestoría (SQL)
const { error: rpcErr } = await admin.rpc('migrar_desde_legacy', {}, { schema: 'crm' })
if (rpcErr) { console.error('SQL:', rpcErr.message); process.exit(1) }

// 2) peritajes (JS, por el resumen)
const { data: legacyPer } = await admin.schema('crm_legacy').from('peritajes').select('*')
const { data: vehs } = await admin.schema('crm').from('vehiculos').select('id, id_legacy')
const porLegacy = new Map(vehs.map((v) => [v.id_legacy, v.id]))
let ok = 0, skip = 0
for (const p of legacyPer ?? []) {
  const vehiculo_id = porLegacy.get(p.vehiculo_id)
  if (!vehiculo_id) { skip++; continue }
  const datos = p.secciones ?? {}
  const r = resumenPeritaje(datos)
  const { error } = await admin.schema('crm').from('peritajes').upsert({
    id_legacy: p.id, vehiculo_id, fecha: p.fecha_peritaje ?? null,
    resena: p.resena_texto ?? null, costo_total: p.costo_total ?? null,
    datos, ...r,
  }, { onConflict: 'id_legacy' })
  if (error) console.error('peritaje', p.id, error.message)
  else ok++
}

// 3) conteos
for (const t of ['vehiculos', 'gestoria', 'peritajes']) {
  const { count } = await admin.schema('crm').from(t).select('*', { count: 'exact', head: true })
  console.log(t, '=', count)
}
console.log('peritajes migrados en JS:', ok, 'sin vehículo match:', skip)
```

Nota: si `admin.rpc(..., { schema: 'crm' })` no resuelve el schema, exponé la función como `crm.migrar_desde_legacy` y llamá `admin.schema('crm').rpc('migrar_desde_legacy')`.

- [ ] **Step 5: Correr la migración (manual, requiere Supabase + `crm_legacy` poblado)**

1. Aplicar `supabase/crm_migracion.sql` en el SQL Editor.
2. Sembrar usuarios: `node --env-file=.env scripts/seed-crm-usuarios.mjs` (con `scripts/crm-usuarios.local.json` armado).
3. `node --env-file=.env scripts/migrate-legacy-to-crm.mjs`.
4. Verificar en SQL Editor: `select count(*) from crm.vehiculos;` (~60), `crm.gestoria` (~13), `crm.peritajes` (~10), `crm.usuarios` (6).

- [ ] **Step 6: Commit**

```bash
git add supabase/crm_migracion.sql scripts/migrate-legacy-to-crm.mjs src/crm/__tests__/crmMigracion.test.js
git commit -m "$(printf 'feat(crm): migracion de datos crm_legacy -> crm\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>')"
```

---

## Task 7: AuthProvider extendido + `useCrmPerfil`

**Files:**
- Modify: `src/context/AuthProvider.jsx`, `src/context/authContext.js` (si hace falta)
- Create: `src/crm/services/crmUsuarios.service.js`
- Create: `src/crm/hooks/useCrmPerfil.js`
- Test: `src/crm/__tests__/useCrmPerfil.test.jsx`

**Interfaces:**
- Consumes: `AuthContext` (session), `supabase`.
- Produces:
  - `AuthContext.value` gana `crmPerfil: { id, usuario, nombre, rol, activo } | null` y `crmPerfilCargando: boolean`. Se puebla solo cuando `window.location.pathname` empieza con `/crm` y hay `session.user`.
  - `crmUsuarios.service.js`: `obtenerMiPerfil(userId)`, `listarUsuarios()`.
  - `useCrmPerfil()`: `{ id, usuario, nombre, rol, esAdmin, cargando }`.

- [ ] **Step 1: Test de `useCrmPerfil` (falla primero)**

```jsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { AuthContext } from '@/context/authContext'
import { useCrmPerfil } from '../hooks/useCrmPerfil.js'

const wrapper = (value) => ({ children }) => <AuthContext.Provider value={value}>{children}</AuthContext.Provider>

describe('useCrmPerfil', () => {
  it('deriva esAdmin del rol', () => {
    const { result } = renderHook(() => useCrmPerfil(), {
      wrapper: wrapper({ crmPerfil: { id: '1', usuario: 'Cris', nombre: 'Cris', rol: 'admin', activo: true }, crmPerfilCargando: false }),
    })
    expect(result.current.esAdmin).toBe(true)
    expect(result.current.usuario).toBe('Cris')
  })
  it('sin perfil → cargando/valores null', () => {
    const { result } = renderHook(() => useCrmPerfil(), { wrapper: wrapper({ crmPerfil: null, crmPerfilCargando: true }) })
    expect(result.current.esAdmin).toBe(false)
    expect(result.current.cargando).toBe(true)
  })
})
```

Run: `npm test -- useCrmPerfil` → FAIL.

- [ ] **Step 2: `crmUsuarios.service.js`**

```js
import { supabase } from '@/services/supabaseClient'

export async function obtenerMiPerfil(userId) {
  const { data, error } = await supabase.schema('crm').from('usuarios')
    .select('id, usuario, nombre, rol, activo').eq('id', userId).maybeSingle()
  if (error) throw error
  return data
}

export async function listarUsuarios() {
  const { data, error } = await supabase.schema('crm').from('usuarios')
    .select('id, usuario, nombre, rol, activo').order('nombre')
  if (error) throw error
  return data ?? []
}
```

- [ ] **Step 3: `useCrmPerfil.js`**

```js
import { useContext } from 'react'
import { AuthContext } from '@/context/authContext'

export function useCrmPerfil() {
  const { crmPerfil, crmPerfilCargando } = useContext(AuthContext) ?? {}
  return {
    id: crmPerfil?.id ?? null,
    usuario: crmPerfil?.usuario ?? null,
    nombre: crmPerfil?.nombre ?? null,
    rol: crmPerfil?.rol ?? null,
    esAdmin: crmPerfil?.rol === 'admin',
    activo: crmPerfil?.activo ?? false,
    cargando: Boolean(crmPerfilCargando),
  }
}
```

- [ ] **Step 4: Extender `AuthProvider.jsx`**

Agregá estado `crmPerfil` / `crmPerfilCargando` y un `useEffect` que, cuando `isSupabaseConfigured && session?.user && location.pathname.startsWith('/crm')`, llama `obtenerMiPerfil(session.user.id)` y setea el estado. Sumá ambos al `value` del provider. No toques la lógica de `perfiles` existente.

- [ ] **Step 5: Test en verde + suite**

Run: `npm test -- useCrmPerfil` → PASS. `npm test` → verde.

- [ ] **Step 6: Commit**

```bash
git add src/context/AuthProvider.jsx src/context/authContext.js src/crm/services/crmUsuarios.service.js src/crm/hooks/useCrmPerfil.js src/crm/__tests__/useCrmPerfil.test.jsx
git commit -m "$(printf 'feat(crm): perfil crm en AuthProvider + useCrmPerfil\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>')"
```

---

## Task 8: Shell `/crm` — rutas, guard, layout, login

**Files:**
- Create: `src/crm/routes/CrmProtectedRoute.jsx`
- Create: `src/crm/components/CrmLayout.jsx`, `CrmSidebar.jsx`, `CrmThemeToggle.jsx`
- Create: `src/crm/pages/CrmLoginPage.jsx`, `CambiarPasswordPage.jsx`, `VehiculosPlaceholderPage.jsx`
- Modify: `src/routes/AppRouter.jsx`
- Test: `src/crm/__tests__/CrmProtectedRoute.test.jsx`, `src/crm/__tests__/CrmLoginPage.test.jsx`

**Interfaces:**
- Consumes: `useAuth` (session), `useCrmPerfil`, `useUiStore` (tema), `supabase.auth`, `emailDeUsuario`.
- Produces: rutas `/crm`, `/crm/login`, `/crm/vehiculos` (placeholder), `/crm/cambiar-password`.

- [ ] **Step 1: Tests (fallan primero)**

`CrmProtectedRoute.test.jsx`:
```jsx
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { AuthContext } from '@/context/authContext'
import CrmProtectedRoute from '../routes/CrmProtectedRoute.jsx'

function renderAt(value) {
  return render(
    <AuthContext.Provider value={value}>
      <MemoryRouter initialEntries={['/crm/x']}>
        <Routes>
          <Route path="/crm/login" element={<div>LOGIN</div>} />
          <Route element={<CrmProtectedRoute />}>
            <Route path="/crm/x" element={<div>PRIVADO</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  )
}

describe('CrmProtectedRoute', () => {
  it('sin sesión → redirige a login', () => {
    renderAt({ session: null, loading: false, crmPerfil: null, crmPerfilCargando: false })
    expect(screen.getByText('LOGIN')).toBeInTheDocument()
  })
  it('con sesión pero sin perfil crm → pantalla sin acceso', () => {
    renderAt({ session: { user: { id: '1' } }, loading: false, crmPerfil: null, crmPerfilCargando: false })
    expect(screen.getByText(/no tiene acceso/i)).toBeInTheDocument()
  })
  it('con sesión y perfil activo → contenido', () => {
    renderAt({ session: { user: { id: '1' } }, loading: false, crmPerfil: { rol: 'vendedor', activo: true }, crmPerfilCargando: false })
    expect(screen.getByText('PRIVADO')).toBeInTheDocument()
  })
})
```

`CrmLoginPage.test.jsx`: mockeá `@/services/supabaseClient` (`supabase.auth.signInWithPassword` → spy) y verificá que al enviar el form con usuario `Bruno` + pass `x` llama `signInWithPassword({ email: 'bruno@crm-viejo.neifert.local', password: 'x' })` y que un error muestra "Usuario o contraseña incorrectos.".

Run: `npm test -- CrmProtectedRoute CrmLoginPage` → FAIL.

- [ ] **Step 2: `CrmProtectedRoute.jsx`**

```jsx
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useCrmPerfil } from '@/crm/hooks/useCrmPerfil'
import Spinner from '@/components/common/Spinner'

export default function CrmProtectedRoute() {
  const { session, loading } = useAuth()
  const { activo, cargando } = useCrmPerfil()
  const location = useLocation()

  if (loading || cargando) return <div className="grid min-h-screen place-items-center"><Spinner size={32} /></div>
  if (!session?.user) return <Navigate to="/crm/login" replace state={{ from: location }} />
  if (!activo) {
    return (
      <div className="crm-root grid min-h-screen place-items-center p-6 text-center">
        <div>
          <p className="text-lg font-semibold">Tu cuenta no tiene acceso al CRM.</p>
          <p className="mt-1 text-[var(--crm-muted)]">Pedile a un administrador que te habilite.</p>
        </div>
      </div>
    )
  }
  return <Outlet />
}
```

- [ ] **Step 3: `CrmLoginPage.jsx`**

Form controlado (usuario, contraseña) con componentes shadcn (`Input`, `Label`, `Button`). Submit → `supabase.auth.signInWithPassword({ email: emailDeUsuario(usuario), password })`. Éxito → `navigate(from ?? '/crm/vehiculos')`. Error → mensaje "Usuario o contraseña incorrectos." en la voz de la interfaz. Layout centrado, `crm-root`, logo, sin decoración. Importa `@/crm/styles/tokens.css`.

- [ ] **Step 4: `CrmThemeToggle.jsx`**

```jsx
import { Moon, Sun } from 'lucide-react'
import { useUiStore } from '@/store/useUiStore'
import { Button } from '@/components/ui/button'

export default function CrmThemeToggle() {
  const theme = useUiStore((s) => s.theme)
  const toggle = useUiStore((s) => s.toggleTheme)
  return (
    <Button variant="ghost" size="icon" onClick={toggle}
      aria-label={theme === 'dark' ? 'Activar modo claro' : 'Activar modo oscuro'}>
      {theme === 'dark' ? <Moon size={18} /> : <Sun size={18} />}
    </Button>
  )
}
```

- [ ] **Step 5: `CrmSidebar.jsx` + `CrmLayout.jsx`**

`CrmSidebar`: nav con un item (Vehículos, icono `Car`) — más se agregan en planes futuros. `NavLink` con estado activo. En ≥md: `<aside>` fija angosta. En <md: `Sheet` de shadcn disparado desde la topbar de `CrmLayout`. Abajo: `CrmThemeToggle`, nombre del usuario (`useCrmPerfil`), botón "Salir" (`supabase.auth.signOut()` → `navigate('/crm/login')`).

`CrmLayout`: `<div className="crm-root min-h-screen">`, importa `@/crm/styles/tokens.css`, topbar (solo <md, con botón de menú), `<CrmSidebar/>`, `<main>` con `<Outlet/>`. Separadores hairline con `var(--crm-line)`.

- [ ] **Step 6: `CambiarPasswordPage.jsx` + `VehiculosPlaceholderPage.jsx`**

`CambiarPassword`: form (nueva + repetir, validación mínima 8) → `supabase.auth.updateUser({ password })` → toast "Contraseña actualizada.".
`VehiculosPlaceholder`: card centrada "Módulo de vehículos — en construcción (Plan 2)".

- [ ] **Step 7: Rutas en `src/routes/AppRouter.jsx`**

Agregá los lazy imports y el grupo:
```jsx
const CrmLoginPage = lazy(() => import('@/crm/pages/CrmLoginPage'))
const CrmLayout = lazy(() => import('@/crm/components/CrmLayout'))
const VehiculosPlaceholderPage = lazy(() => import('@/crm/pages/VehiculosPlaceholderPage'))
const CambiarPasswordPage = lazy(() => import('@/crm/pages/CambiarPasswordPage'))
// dentro de <Routes>:
<Route path="/crm/login" element={<CrmLoginPage />} />
<Route element={<CrmProtectedRoute />}>
  <Route element={<CrmLayout />}>
    <Route path="/crm" element={<Navigate to="/crm/vehiculos" replace />} />
    <Route path="/crm/vehiculos" element={<VehiculosPlaceholderPage />} />
    <Route path="/crm/cambiar-password" element={<CambiarPasswordPage />} />
  </Route>
</Route>
```
(importá `Navigate` de `react-router-dom` y `CrmProtectedRoute`.)

- [ ] **Step 8: Tests en verde + suite completa + lint**

Run: `npm test` → todo verde.
Run: `npm run lint` → sin errores nuevos en `src/crm/**` (los `process`/`Buffer` preexistentes en `api/` no cuentan).

- [ ] **Step 9: Verificación manual (dev)**

Run: `npm run dev` → `http://localhost:5173/crm` redirige a `/crm/login` → login con un usuario seedeado → entra al shell con la sidebar y el placeholder → toggle de tema funciona → "Salir" vuelve al login.

- [ ] **Step 10: Commit**

```bash
git add src/crm/routes src/crm/components src/crm/pages src/routes/AppRouter.jsx src/crm/__tests__/CrmProtectedRoute.test.jsx src/crm/__tests__/CrmLoginPage.test.jsx
git commit -m "$(printf 'feat(crm): shell /crm — rutas, guard, layout, login, tema\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>')"
```

---

## Self-Review

**1. Cobertura del spec (Plan 1 = §2, 3, 4, 6, 7 del spec):**

| Requisito del spec | Task |
|---|---|
| §2 route group `/crm`, `src/crm/**`, shadcn en `src/components/ui` | Task 1 (shadcn), Task 8 (rutas/layout) |
| §2 reusar `useUiStore` para tema | Task 1 (tokens), Task 8 (`CrmThemeToggle`) |
| §3.1 enums | Task 2 |
| §3.2 6 tablas con sus columnas | Task 2 |
| §3.3 `mi_rol()`, `es_usuario()`, triggers `actualizado_en` + `gestoria_recalc` | Task 2 |
| §3.4 RLS: vendedor no delete, usuarios solo admin | Task 2 (+ test de policies) |
| §3.5 `peritajeSchema` (keys de estado) | Task 5 (versión mínima; completa en Plan 2) |
| §4.1 login usuario+contraseña / email sintético | Task 3 (`emailDeUsuario`), Task 8 (`CrmLoginPage`) |
| §4.2 seed de los 6 usuarios | Task 4 |
| §4.3 `AuthProvider` extendido, `CrmProtectedRoute`, `useCrmPerfil` | Task 7, Task 8 |
| §4.4 cambiar contraseña | Task 8 (`CambiarPasswordPage`) |
| §6 tokens `--crm-*` claro/oscuro, Geist | Task 1 |
| §7 `crm.migrar_desde_legacy()` + script + peritajes en JS | Task 6 (usa `resumenPeritaje` de Task 5) |
| §9 `SEED_SECRET`, vitest jsdom, fuentes | Task 1 + Task 4 |
| §11 entregables 1-7, 9 | Tasks 1-8 (entregable 8 pruebas: cada task; RLS de integración → nota abajo) |

**Desvío del spec:** el spec dice dominio `@crm.neifert.local`; el Plan usa
`@crm-viejo.neifert.local` para **igualar exactamente** `crmShadowEmail` de
`src/server/crmCore.js` (una sola fórmula, verificado por test). Confirmar el valor
real al implementar la Task 3 y ajustar spec si hace falta.

**Test de RLS de integración (spec §8):** no está como task ejecutable porque
necesita dos sesiones reales contra un proyecto Supabase. Queda como paso manual
recomendado tras la Task 2 / Task 6; se puede formalizar en el Plan 2 cuando haya
`vehiculos.service` para ejercerlo.

**2. Placeholders:** el `supabase/crm_schema.sql` de la Task 2 deja las policies de
`vehiculos/peritajes/gestoria/fotos/eventos` como "completar según §3.4" — es
contenido a escribir desde la matriz explícita del spec, no un placeholder de
lógica indefinida. `peritajeSchema.js` (Task 5) trae una lista parcial de keys con
"completar con el resto del HAR" — la fuente (POST de `peritaje.php` en los HAR)
está identificada y hay un comando para extraerla.

**3. Consistencia de tipos:** `emailDeUsuario` (Task 3) usada por Task 4 y Task 8
con la misma firma. `resumenPeritaje(datos) → { items_ok, items_obs, items_falta }`
(Task 5) — mismas keys que las columnas de `crm.peritajes` (Task 2) y que el upsert
del script de migración (Task 6). `useCrmPerfil()` expone `{ id, usuario, nombre,
rol, esAdmin, activo, cargando }` (Task 7) y Task 8 consume `activo`/`cargando`.
`AuthContext.value` gana `crmPerfil` + `crmPerfilCargando` (Task 7), consumidos por
`useCrmPerfil` (Task 7) y `CrmProtectedRoute` (Task 8).
