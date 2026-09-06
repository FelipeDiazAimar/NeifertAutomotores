# CRM nuevo — Plan 5: Módulo Dashboard

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development o superpowers:executing-plans. Steps `- [ ]`.

**Goal:** `/crm` = Dashboard con 4 KPIs, 2 gráficos (marcas y tipos más pedidos) y la sección "Oportunidades de venta" (cruce vehículo↔clientes con % de compatibilidad y detalle).

**Architecture:** Todo lee del schema `crm` por PostgREST + react-query. El cruce vehículo↔cliente se calcula **client-side** en `src/crm/lib/compatibilidad.js`. Gráficos con `recharts` (ya dependencia). Componentes glass reusando `common/*`.

**Tech Stack:** React 19, Vite 8, Tailwind v4, `@supabase/supabase-js`, `@tanstack/react-query`, `recharts`, `lucide-react`, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-08-31-crm-nuevo-dashboard-design.md`

## Global Constraints

- Estética glass: `@/components/common/*`, tokens `--c-*`, `font-display` en títulos, `recharts` con colores `--color-neifert`/`--color-amber`/`--color-success` + paleta fija.
- Solo lectura: el Dashboard no muta nada. Sin RLS nueva.
- `/crm` deja de redirigir a `/crm/clientes` → renderiza el Dashboard.
- ESM, alias `@`→`src`, todo en `src/crm/**`. Tests verdes con `npm test`.
- Commits: body cierra con `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`. Rama `feat/crm-legacy-clone`. No `main`.
- Español.

---

## File Structure

| File | Responsabilidad |
|------|------------------|
| `src/crm/lib/compatibilidad.js` | `compatibilidad(cliente, vehiculo)`, `bucket(score)`, `precioEnArs(v)`, `DOLAR`, `CRITERIOS`. |
| `src/crm/services/dashboard.service.js` | `kpis()`, `demanda()`, `oportunidades()`. |
| `src/crm/hooks/useDashboard.js` | `useKpis()`, `useDemanda()`, `useOportunidades()`. |
| `src/crm/components/KpiTile.jsx` | tile de KPI. |
| `src/crm/components/GraficoMarcas.jsx` | barras (recharts). |
| `src/crm/components/GraficoTipos.jsx` | dona (recharts). |
| `src/crm/components/CompatBar.jsx` | barra de compatibilidad + %. |
| `src/crm/components/DetalleCompatModal.jsx` | modal con el desglose de criterios. |
| `src/crm/components/OportunidadesList.jsx` | lista de vehículos con sus clientes match. |
| `src/crm/pages/DashboardPage.jsx` | la página. |
| `src/crm/components/CrmSidebar.jsx` | (modificar) ítem "Dashboard" primero. |
| `src/routes/AppRouter.jsx` | (modificar) `/crm` → `DashboardPage` (sacar el `Navigate`). |

---

## Task 1: `compatibilidad.js`

**Files:** Create `src/crm/lib/compatibilidad.js`; Test `src/crm/__tests__/compatibilidad.test.js`.

**Interfaces:**
- `DOLAR` (number, editable), `precioEnArs(v)` → `moneda==='USD' ? precio_contado*DOLAR : precio_contado` (null → `Infinity` para que "presupuesto ≥ precio" dé false).
- `CRITERIOS`: array de `{ key, label, peso, aplica(c), ok(c,v), clienteDice(c), vehiculoDice(v) }` — marca (30), modelo (25), tipo (15), anio (15), presupuesto (15). `norm` = trim+lowercase+sin tildes.
- `compatibilidad(cliente, vehiculo)` → `{ score, bucket, detalle }`.
  `detalle[i] = { key, label, aplica, ok, clienteDice, vehiculoDice }`.
  `score = Σ aplicables.peso === 0 ? 0 : round(Σ ok.peso / Σ aplicables.peso * 100)`.
  Además prueba cada `{ marca, modelo }` de `cliente.intereses` como si fueran
  `marca_interes`/`modelo_interes` y se queda con el `score` máximo (y su `detalle`).
- `bucket(score)` → `score >= 80 ? 'alta' : score >= 50 ? 'media' : 'baja'`.

- [ ] **Step 1: Test (falla primero)**

```js
import { describe, it, expect } from 'vitest'
import { compatibilidad, bucket, precioEnArs } from '../lib/compatibilidad.js'

const veh = { marca: 'Ford', modelo: 'KA', tipo: 'Hatchback', anio: 2016, moneda: 'ARS', precio_contado: 8000000 }

describe('compatibilidad', () => {
  it('match total → 100 / alta', () => {
    const c = { marca_interes: 'ford', modelo_interes: 'ka', tipo_interes: 'Hatchback', anio_min: 2014, anio_max: 2018, presupuesto: 9000000, intereses: [] }
    const r = compatibilidad(c, veh)
    expect(r.score).toBe(100)
    expect(r.bucket).toBe('alta')
  })
  it('solo marca de 2 criterios aplicables → 50 / media', () => {
    const c = { marca_interes: 'ford', presupuesto: 1, intereses: [] } // marca ok, presupuesto no
    const r = compatibilidad(c, veh)
    expect(r.score).toBe(round(30 / 45 * 100)) // marca(30) / (marca+presupuesto=45)
  })
  it('nada aplica → 0', () => {
    expect(compatibilidad({ intereses: [] }, veh).score).toBe(0)
  })
  it('usa el mejor score entre los intereses', () => {
    const c = { marca_interes: 'toyota', intereses: [{ marca: 'ford', modelo: 'ka' }] }
    expect(compatibilidad(c, veh).score).toBeGreaterThan(0)
  })
})

function round(n) { return Math.round(n) }

describe('precioEnArs', () => {
  it('convierte USD', () => {
    expect(precioEnArs({ moneda: 'USD', precio_contado: 10000 })).toBeGreaterThan(10000)
  })
  it('null → Infinity', () => {
    expect(precioEnArs({ moneda: 'ARS', precio_contado: null })).toBe(Infinity)
  })
})

describe('bucket', () => {
  it('umbrales', () => {
    expect(bucket(90)).toBe('alta')
    expect(bucket(60)).toBe('media')
    expect(bucket(20)).toBe('baja')
  })
})
```

- [ ] **Step 2: Implementar.**
- [ ] **Step 3: Test verde + commit** `feat(crm): calculo de compatibilidad vehiculo-cliente`.

---

## Task 2: `dashboard.service` + hooks

**Files:** Create `src/crm/services/dashboard.service.js`, `src/crm/hooks/useDashboard.js`; Test `src/crm/__tests__/dashboard.service.test.js`.

**Interfaces:**
- `kpis()` → `{ clientesActivos, vehiculosDisponibles, valorStock: { ars, usd }, alertasActivas, vendidosMes }`.
  - `clientesActivos`: `count` de `clientes` `in('status',['activo','en_seguimiento'])` `is('archivado_en',null)`.
  - `vehiculosDisponibles`: `count` de `vehiculos` `eq('estado','disponible')` `is('archivado_en',null)`.
  - `valorStock`: `select('precio_contado, moneda')` de esos vehículos, sumar en JS por moneda.
  - `alertasActivas`: `count` de `tareas` `eq('done',false)` `is('archivado_en',null)`.
  - `vendidosMes`: `count` de `vehiculos` `eq('estado','vendido')` `gte('fecha_venta', primerDiaDelMes)`.
- `demanda()` → `{ marcas: [{ nombre, n }], tipos: [{ nombre, n }] }`.
  - `select('marca_interes, tipo_interes')` + `select('cliente_id, marca')` de `cliente_intereses` (join implícito no; dos queries). Filtrar clientes activos no archivados (para intereses, join por id — o traer todos los intereses y no filtrar, aceptable v1). Contar y rankear: marcas top 8, tipos todos, orden desc. `norm` para agrupar ("Ford"/"ford").
- `oportunidades()` → `[{ vehiculo, clientes: [{ cliente, score, bucket, detalle }] }]`.
  - `vehiculos` disponibles no archivados con `fotos:vehiculo_fotos(url,es_portada)`.
  - `clientes` activos no archivados con `intereses:cliente_intereses(marca,modelo)`.
  - Cruce JS: por vehículo, para cada cliente `compatibilidad(c, v)`, quedarse con `score >= 30`, ordenar desc, tomar top 8; descartar vehículos sin clientes; ordenar vehículos por el mejor score de su lista desc.
- Hooks: `useKpis` (`['crm','dash','kpis']`), `useDemanda` (`['crm','dash','demanda']`), `useOportunidades` (`['crm','dash','oportunidades']`), `staleTime: 60_000`.

- [ ] **Step 1: Test (falla primero)** — mock `_supabaseMock`: `kpis` hace los counts con los filtros correctos; `demanda` agrupa `['Ford','ford','FORD']` en uno y corta a 8 marcas; `oportunidades` (mock de `vehiculos` + `clientes`) descarta un vehículo sin match y ordena por mejor score.

- [ ] **Step 2: Implementar.** (Para `oportunidades` el test puede stubear `compatibilidad` o pasar datos que den scores predecibles.)
- [ ] **Step 3: Test verde + commit** `feat(crm): servicio y hooks del dashboard`.

---

## Task 3: `KpiTile` + `CompatBar` + `DetalleCompatModal`

**Files:** Create los 3; Test `src/crm/__tests__/KpiTile.test.jsx`, `src/crm/__tests__/CompatBar.test.jsx`, `src/crm/__tests__/DetalleCompatModal.test.jsx`.

**Interfaces:**
- `KpiTile({ label, valor, sub })` — `GlassCard p-5`: `label` uppercase `text-[11px] text-ink-3`, `valor` `font-display text-3xl text-ink`, `sub` `text-xs text-ink-3`.
- `CompatBar({ score, bucket })` — `<div role="img" aria-label="Compatibilidad 40%">`: barra `h-2 rounded-full bg-ink/10` con relleno `width: score%` y color `bg-neifert` (baja) / `bg-amber` (media) / `bg-success` (alta); a la derecha `{score}%`.
- `DetalleCompatModal({ open, onClose, cliente, vehiculo, resultado })` — `Modal`: título `${cliente.nombre} · ${vehiculo.marca} ${vehiculo.modelo} ${vehiculo.anio ?? ''}`, `<CompatBar>` + label del bucket ("Baja/Media/Alta compatibilidad"), lista de `resultado.detalle`: por criterio `✓` (verde) o `×` (rojo) si `aplica`, sino "—", con `label`, `Cliente busca: {clienteDice}` / `Vehículo: {vehiculoDice}`. Al final, `Notas del cliente` (`cliente.notas`).

- [ ] **Step 1: Tests (fallan primero)** — `CompatBar` con `score=40, bucket='baja'` → aria-label "40%" y el relleno tiene `width: 40%` y clase `bg-neifert`. `DetalleCompatModal` con un `detalle` de 2 criterios (uno ok, uno no) muestra un `✓` y un `×` y el texto "Cliente busca". `KpiTile` renderiza label/valor/sub.

- [ ] **Step 2: Implementar.**
- [ ] **Step 3: `npm test` + commit** `feat(crm): KpiTile + CompatBar + detalle de compatibilidad`.

---

## Task 4: Gráficos (`GraficoMarcas` + `GraficoTipos`)

**Files:** Create los 2; Test `src/crm/__tests__/GraficoMarcas.test.jsx` (smoke — recharts en jsdom necesita `ResponsiveContainer` con tamaño; usar `width`/`height` fijos en el test o `vi.mock` de `ResponsiveContainer`).

**Interfaces:**
- `GraficoMarcas({ datos })` — `datos: [{ nombre, n }]`. `GlassCard`: título "Marcas más pedidas" `font-display`; `<BarChart layout="vertical">` (recharts), `<Bar dataKey="n" fill="var(--color-neifert)">`, `<YAxis dataKey="nombre" type="category">`. Empty state si `!datos.length`.
- `GraficoTipos({ datos })` — `datos: [{ nombre, n }]`. `GlassCard`: título "Tipos más pedidos"; `<PieChart>` con `<Pie dataKey="n" nameKey="nombre" innerRadius={50} outerRadius={80}>` + `<Cell>` por segmento con paleta fija de 6 (`['#be1e2d','#f59e0b','#10b981','#3b82f6','#8b5cf6','#6b7280']`), `<Legend>`. Empty state.
- Ambos envueltos en `ResponsiveContainer width="100%" height={260}`.

- [ ] **Step 1: Test (falla primero)** — `GraficoMarcas` con `datos=[{nombre:'Ford',n:5}]` renderiza el título "Marcas más pedidas" (el SVG interno no se assertea en jsdom); con `datos=[]` muestra el empty state.

- [ ] **Step 2: Implementar.** Si recharts rompe en jsdom, mockear `recharts` en el test para exportar stubs (`BarChart`, `Bar`, etc. como `div`) — el objetivo del test es la estructura de la card, no el render del SVG.

- [ ] **Step 3: `npm test` + `npm run build` + commit** `feat(crm): graficos de marcas y tipos mas pedidos`.

---

## Task 5: `OportunidadesList`

**Files:** Create `src/crm/components/OportunidadesList.jsx`; Test `src/crm/__tests__/OportunidadesList.test.jsx`.

**Interfaces:**
- `OportunidadesList({ items })` — `items: [{ vehiculo, clientes:[{ cliente, score, bucket, detalle }] }]`. Estado local `verMas` (muestra 20, botón "Ver más"). Estado `detalle` (`{ open, cliente, vehiculo, resultado }`) para el `DetalleCompatModal`.
- Por item: `GlassCard`: header (miniatura de `vehiculo.fotos` portada o placa con la patente; `marca modelo version`; `lineaSpecs(vehiculo)`; `precioFmt`). Debajo, por cada `{ cliente, score, bucket, detalle }`: `<Link to={/crm/clientes/:id}>` nombre + `lineaInteres(cliente)` chico; a la derecha `<CompatBar score bucket />` + `Button size="sm" variant="ghost"` "Detalle" → abre el modal.
- Empty state ("No hay oportunidades: cargá clientes con su interés o vehículos disponibles").

- [ ] **Step 1: Test (falla primero)** — 1 item con 1 cliente `score=100`: renderiza `marca modelo`, el nombre del cliente, "100%", y "Detalle" abre el modal (aparece el título con el nombre). `items=[]` → empty state. 25 items → "Ver más" visible; al click, más cards.

- [ ] **Step 2: Implementar.**
- [ ] **Step 3: `npm test` + commit** `feat(crm): lista de oportunidades de venta`.

---

## Task 6: `DashboardPage` + ruta + sidebar

**Files:** Create `src/crm/pages/DashboardPage.jsx`; modify `src/crm/components/CrmSidebar.jsx`, `src/routes/AppRouter.jsx`; Test `src/crm/__tests__/DashboardPage.test.jsx`.

**Interfaces:**
- `DashboardPage` — `useKpis` / `useDemanda` / `useOportunidades`. Layout:
  - `h1` "Panel" (o "Dashboard").
  - Grid de 4 `KpiTile` (2×2 móvil / 4 desktop): Clientes activos (`kpis.clientesActivos` / "en seguimiento"), Vehículos disponibles (`kpis.vehiculosDisponibles` / "en stock"), Valor del stock (`$ {fmt(kpis.valorStock.ars)}` / `kpis.valorStock.usd ? "+ US$ "+fmt(usd) : "disponible"`), Alertas activas (`kpis.alertasActivas` / `${kpis.vendidosMes} veh. vendidos`).
  - Grid 2col (1 en móvil): `GraficoMarcas datos={demanda.marcas}` + `GraficoTipos datos={demanda.tipos}`.
  - `<h2 className="font-display">Oportunidades de venta</h2>` + `OportunidadesList items={oportunidades}`.
  - Spinners por sección mientras cargan.
- `CrmSidebar` NAV: `{ to:'/crm', label:'Dashboard', icon: LayoutDashboard, end: true }` como primer ítem. El `NavLink` del logo puede ir a `/crm`.
- `AppRouter`: `const DashboardPage = lazy(...)`; reemplazar `<Route path="/crm" element={<Navigate to="/crm/clientes" replace />} />` por `<Route path="/crm" element={<DashboardPage />} />`.

- [ ] **Step 1: Test (falla primero)** — mock de los 3 hooks; `DashboardPage` renderiza los 4 labels de KPI, "Marcas más pedidas", "Tipos más pedidos" y "Oportunidades de venta". Con `oportunidades=[]` la lista muestra su empty state.

- [ ] **Step 2: Implementar.** `CrmSidebar.test.jsx` (extender): el ítem Dashboard existe y es el primero.
- [ ] **Step 3: `npm test` + `npm run build` + `npm run lint` (sin errores nuevos en `src/crm`) + commit** `feat(crm): pagina Dashboard + ruta /crm + sidebar`.

---

## Task 7: Smoke

- [ ] **Step 1:** `npm run dev` → `/crm` (login `Bruno`): 4 KPIs con números reales (~175 / ~58 / valor / tareas), los 2 gráficos con datos, y "Oportunidades de venta" con vehículos y sus clientes match; "Detalle" abre el desglose; navegar a una ficha de cliente desde una oportunidad.
- [ ] **Step 2:** verificar contra el screenshot del legacy (estructura, no pixel-perfect). Ajustar labels si difieren.
- [ ] **Step 3:** commit si hubo ajustes.

---

## Self-Review

**Cobertura del spec:**

| Spec | Task |
|---|---|
| §2 compatibilidad (criterios, score, bucket, mejor de intereses) | Task 1 |
| §3 `kpis` / `demanda` / `oportunidades` + hooks | Task 2 |
| §4 tiles | Task 3, Task 6 |
| §4 gráficos marcas/tipos | Task 4 |
| §4 oportunidades (cards + CompatBar + detalle modal + ver más) | Task 3 (`CompatBar`/`DetalleCompatModal`), Task 5 |
| §4 ruta `/crm` = Dashboard + sidebar "Dashboard" | Task 6 |
| §5 testing | cada task + Task 7 |
| §6 fuera de alcance | respetado (sin rango de fechas, sin km, dólar constante) |

**Placeholders:** `DOLAR = 1000` está marcado como constante provisional (spec §2, Task 1) — decisión explícita, no un placeholder de lógica. Recharts en jsdom: Task 4 Step 2 da la salida (mock del módulo) si el SVG rompe.

**Consistencia de tipos:**
- `compatibilidad(c, v) → { score, bucket, detalle }` (Task 1) — `oportunidades` (Task 2) devuelve `{ cliente, score, bucket, detalle }` por cliente; `OportunidadesList` (Task 5) y `DetalleCompatModal` (Task 3) consumen `score`/`bucket`/`detalle`.
- `CompatBar({ score, bucket })` (Task 3) — usado por `OportunidadesList` (Task 5) y `DetalleCompatModal` (Task 3).
- `kpis()` return shape (Task 2) — `DashboardPage` (Task 6) lee `clientesActivos`, `vehiculosDisponibles`, `valorStock.{ars,usd}`, `alertasActivas`, `vendidosMes`.
- `demanda() → { marcas, tipos }` con items `{ nombre, n }` (Task 2) — `GraficoMarcas`/`GraficoTipos` (Task 4) usan `dataKey="n"`, `nameKey`/`YAxis dataKey="nombre"`.
- `lineaInteres` (ya en `formatCliente`), `lineaSpecs`/`precioFmt` (ya en `formatVehiculo`) — reusados por `OportunidadesList` (Task 5).
