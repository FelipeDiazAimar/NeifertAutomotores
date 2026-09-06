# CRM nuevo — Módulo Dashboard

**Fecha:** 2026-08-31
**Estado:** aprobado
**Depende de:** módulos Fundaciones/Vehículos/Clientes/Tareas (schema `crm`, hooks, estética glass).

## 1. Objetivo

Réplica del dashboard del CRM viejo: 4 KPIs + 2 gráficos (marcas y tipos más
pedidos) + la sección **"Oportunidades de venta"** (cruce vehículo↔clientes con
puntaje de compatibilidad). Ruta `/crm` pasa a ser el Dashboard.

### Decisiones (brainstorming)

| Tema | Decisión |
|---|---|
| KPIs | 4 tiles: **Clientes activos** (`status in activo/en_seguimiento`, no archivados) · **Vehículos disponibles** (`estado='disponible'`, no archivados) · **Valor del stock** (Σ `precio_contado` de disponibles; ARS primario, "+ US$ N" si hay stock en USD) · **Alertas activas** (tareas pendientes: `done=false`, no archivadas; subtítulo = "N veh. vendidos" este mes = `estado='vendido'` con `fecha_venta` en el mes). |
| Gráficos | **Marcas más pedidas** (barras, top 8) y **Tipos más pedidos** (dona) — de `crm.clientes.marca_interes`/`tipo_interes` + `crm.cliente_intereses.marca` de clientes activos no archivados. `recharts` (ya dependencia). |
| Oportunidades de venta | Por cada vehículo `disponible`, la lista de clientes activos cuyo interés matchea, con **% de compatibilidad** y desglose. Cálculo **client-side** (58 veh × ~175 clientes = trivial). |
| Ruta | `/crm` → Dashboard (hoy redirige a `/crm/clientes`). Ítem "Dashboard" primero en la sidebar. |
| Plan | Uno solo. |

## 2. Compatibilidad vehículo ↔ cliente

`src/crm/lib/compatibilidad.js`:

```js
export const DOLAR = 1000 // ARS por USD para comparar presupuesto vs precio. TODO: config.

const CRITERIOS = [
  { key: 'marca',   peso: 30, aplica: (c) => !!c.marca_interes,
    ok: (c, v) => norm(c.marca_interes) === norm(v.marca) },
  { key: 'modelo',  peso: 25, aplica: (c) => !!c.modelo_interes,
    ok: (c, v) => norm(c.modelo_interes) === norm(v.modelo) },
  { key: 'tipo',    peso: 15, aplica: (c) => !!c.tipo_interes,
    ok: (c, v) => norm(c.tipo_interes) === norm(v.tipo) },
  { key: 'anio',    peso: 15, aplica: (c) => c.anio_min || c.anio_max,
    ok: (c, v) => v.anio != null
      && (!c.anio_min || v.anio >= c.anio_min)
      && (!c.anio_max || v.anio <= c.anio_max) },
  { key: 'presupuesto', peso: 15, aplica: (c) => c.presupuesto != null,
    ok: (c, v) => (c.presupuesto ?? 0) >= precioEnArs(v) },
]
```

- `compatibilidad(cliente, vehiculo)` → `{ score, detalle }` donde
  `score = round(Σ pesos ok / Σ pesos aplicables × 100)` (si no aplica ningún
  criterio → `score = 0`); `detalle` = array `{ key, label, aplica, ok, clienteDice, vehiculoDice }`.
- `bucket(score)` → `'baja' | 'media' | 'alta'` (`<50` / `50–79` / `>=80`).
- También se cruzan los `cliente_intereses` (marca/modelo extra): si alguno matchea
  mejor que los campos principales, se usa ese (score máximo por cliente).
- **Fuera de v1:** criterio "kilometraje / preferencia" (el legacy lo mostraba;
  no tenemos el campo `km_preferencia` en clientes). Se anota como criterio
  futuro; el `detalle` puede incluirlo como "sin dato".
- `parseNotasCliente(notas)` opcional: extrae pistas ("contado", "USD", modelos
  sueltos) para mostrar en el detalle. v1: solo mostrar `c.notas` crudas.

## 3. Datos / servicios

`src/crm/services/dashboard.service.js`:
- `kpis()` — 4 counts/sums en paralelo (`crm.clientes`, `crm.vehiculos`, `crm.tareas`).
  Valor del stock: `select('precio_contado, moneda').eq('estado','disponible').is('archivado_en', null)` y sumar en JS por moneda.
- `demanda()` — `select('marca_interes, tipo_interes').eq(...)` de clientes activos +
  `crm.cliente_intereses(marca)`; devuelve `{ marcas: [{ nombre, n }], tipos: [{ nombre, n }] }` ya rankeado (top 8 marcas, todos los tipos).
- `oportunidades()` — trae `crm.vehiculos` disponibles (con `fotos`) + `crm.clientes`
  activos no archivados (con `intereses`); cruza en JS con `compatibilidad`; devuelve
  `[{ vehiculo, clientes: [{ cliente, score, bucket, detalle }] }]` — solo clientes
  con `score >= 30`, ordenados desc, y solo vehículos con ≥ 1 cliente. Orden de
  vehículos: por mejor score de su lista, desc.

Hooks (`src/crm/hooks/useDashboard.js`): `useKpis()`, `useDemanda()`,
`useOportunidades()` — `staleTime` 60s.

## 4. UI

`/crm` → `DashboardPage` (dentro de `CrmLayout`).

**Tiles (`KpiTile`)**: `GlassCard` — número grande `font-display`, label arriba
chico uppercase, subtítulo abajo `text-ink-3`. Grid 2×2 en móvil, 4 en ≥md.

**Gráficos**:
- `GraficoMarcas` — `recharts` `<BarChart>` horizontal, top 8, barras `--color-neifert`.
- `GraficoTipos` — `recharts` `<PieChart>` dona, paleta derivada (usar
  `src/hooks/useChartColors.js` si sirve, o una paleta fija de 6). Leyenda a un lado.
- Ambos en `GlassCard`, con estado vacío ("Sin datos de interés todavía").

**Oportunidades de venta** (`OportunidadesList`):
- Encabezado de sección `font-display` + contador.
- Por vehículo: `GlassCard` con header (foto miniatura o placa, `marca modelo version`,
  `lineaSpecs`, precio). Debajo, filas de cliente: nombre → link a la ficha,
  `lineaInteres(cliente)` chico, y a la derecha una **barra de compatibilidad**
  (`CompatBar`: barra `h-2 rounded-full`, relleno proporcional al `score`, color por
  `bucket` — `bg-neifert`/`bg-amber`/`bg-success`) + el `%` + botón "Detalle".
- "Detalle" abre `Modal` (`DetalleCompatModal`): título `cliente · vehiculo`, `%` +
  bucket, y una lista de criterios (`✓`/`×` por criterio, con "Cliente busca: X" /
  "Vehículo: Y"), más las notas del cliente.
- Paginado suave client-side (mostrar 20 vehículos, botón "ver más") — el volumen
  es acotado pero puede ser largo.

**Sidebar**: nuevo ítem "Dashboard" (icono `LayoutDashboard`) primero. `/crm`
redirige a `/crm` (la ruta índice ES el dashboard; sacar el `Navigate` a clientes).

## 5. Testing

Unit: `compatibilidad` (todos los criterios; score 0 si nada aplica; bucket;
mejor score usando `cliente_intereses`), `precioEnArs`.
Servicios (mock supabase): `kpis` arma los filtros; `demanda` rankea y corta top 8;
`oportunidades` filtra `score >= 30` y descarta vehículos sin match.
Componentes (jsdom): `KpiTile`, `CompatBar` (ancho/color por score), `DashboardPage`
(mock hooks → renderiza los 4 tiles + títulos de gráficos + "Oportunidades de venta"),
`DetalleCompatModal` (muestra ✓/× por criterio).

## 6. Fuera de alcance

Rango de fechas configurable · export · ventas por vendedor · embudo de conversión ·
criterio km/preferencia (falta el campo) · cotización real del dólar (constante por ahora).

## 7. Entregables

`/crm` = Dashboard con KPIs + 2 gráficos + Oportunidades de venta · sidebar con
"Dashboard" · `compatibilidad.js` testeado · tests verdes.
