# CRM nuevo — Fundaciones + Módulo Vehículos

**Fecha:** 2026-08-30
**Estado:** aprobado, listo para plan de implementación
**Autor:** FelipeDiazAimar (con Claude)
**Depende de:** `docs/superpowers/specs/2026-08-30-crm-legacy-clone-design.md` (el schema `crm_legacy` y su sync son la fuente de la migración de datos)

---

## 1. Objetivo y contexto

Neifert Automotores usa hoy un CRM legacy (PHP, `neifertcrm.com`) para todo:
inventario de vehículos, peritajes (inspección de ~120 puntos), gestoría
(trámites), cartera de clientes, alertas y tareas. Ya tenemos un **clon de esa
base** en Supabase (`crm_legacy`, ver spec del clon).

Ahora se construye un **CRM nuevo, moderno, que reemplaza al viejo**: React +
Supabase + Tailwind, estética "Apple minimalista", responsive de verdad
(escritorio + celular en la playa de autos + tablet en el taller).

### Decisiones tomadas en brainstorming

| Tema | Decisión |
|---|---|
| Fuente de verdad | **Reemplazo total.** Migración única `crm_legacy` → schema `crm`. El CRM nuevo escribe directo a Supabase. El viejo se apaga en una fecha de corte. Sin sync bidireccional. |
| Ubicación | **Route group `/crm/*`** en la app Vite actual. Comparte auth, cliente Supabase, react-query, deploy. |
| Modelo de datos | **Promover `crm_legacy` a un schema `crm` productivo**: enums, FKs, RLS por rol, triggers, auditoría. Migración de datos incluida. |
| Componentes | **shadcn/ui** (Radix + Tailwind, copiados al repo en `src/components/ui/*`). Iconos: `lucide-react` (ya está). |
| Auth | **Usuario + contraseña, idéntico al viejo.** Por debajo: Supabase Auth con email sintético `<slug(usuario)>@crm.neifert.local`. Se dispone de los usuarios y contraseñas reales de los 6 usuarios para el seed. Sin emails reales, sin magic link, sin puente legacy. |
| Permisos | **admin: todo. vendedor: casi todo.** Vendedor crea y edita todo; NO borra (solo archiva), NO gestiona usuarios, NO ve configuración. |
| Sitio público | Se mantiene la sync externa actual (legacy → `public.vehiculos`) hasta que el CRM nuevo esté probado. Después `crm.vehiculos` será la fuente única (spec aparte). |
| Tema | Claro **y** oscuro con toggle. Tokens desde el arranque. |
| Dispositivos | Responsive real: layouts que se adaptan, no solo "entra en la pantalla". |
| Alcance módulo 1 | **Vehículos: CRUD + Peritaje + Gestoría, todo junto.** |
| Datos v1 | Migrar los datos reales de `crm_legacy` desde el día 1. Re-migrable hasta el corte. |

### Descomposición del CRM completo (cada uno su spec → plan → implementación)

| # | Sub-proyecto | Estado |
|---|---|---|
| **1** | **Fundaciones + Vehículos (CRUD + Peritaje + Gestoría)** | **este spec** |
| 2 | Clientes (cartera, intereses, autos en entrega, seguimiento, ventas) | pendiente |
| 3 | Alertas + Tareas | pendiente |
| 4 | Usuarios (gestión completa) + Jerarquía / organigrama | pendiente |
| 5 | Dashboard (KPIs, gráficos) | pendiente |
| 6 | Corte del sitio público (`crm.vehiculos` fuente única, apagar sync externa) | pendiente |

---

## 2. Arquitectura

```
Vite app actual (un build, un deploy en Vercel)
│
├── /            sitio público            (sin cambios)
├── /admin/*     gestión sitio + leads    (sin cambios en v1; el panel de leads
│                                          lo superseded el módulo Clientes, spec 2)
└── /crm/*   ← NUEVO
        ├── CrmLayout (sidebar, theme toggle, topbar)
        ├── CrmProtectedRoute  (sesión Supabase + fila en crm.usuarios activa)
        ├── auth: Supabase Auth, email sintético  (usuario → <slug>@crm.neifert.local)
        ├── datos: schema `crm` en el mismo proyecto Supabase, CON RLS por rol
        └── migración: crm_legacy → crm  (función SQL idempotente + script)

crm_legacy (el clon)  → sigue sincronizando del CRM viejo (cron activo);
                        alimenta la migración; no se expone por PostgREST
```

- **Estructura de carpetas nueva**, aislada del resto de `src/`:
  ```
  src/crm/
    pages/        VehiculosListPage, VehiculoNuevoPage, VehiculoDetallePage, VehiculoEditarPage, CambiarPasswordPage
    components/    VehiculoTable, VehiculoCard, VehiculoFilters, VehiculoForm,
                  FichaVehiculo, FotosUploader, PeritajeForm, PeritajeLectura,
                  EstadoStrip, GestoriaChecklist, HistorialTimeline, CrmSidebar, ThemeToggle
    services/     vehiculos.service.js, peritajes.service.js, gestoria.service.js,
                  eventos.service.js, crmUsuarios.service.js
    hooks/        useVehiculos, useVehiculo, usePeritajes, useGestoria, useCrmPerfil, useCrmRealtime
    lib/          peritajeSchema.js, gestoriaSchema.js, mapeos.js (legacy→crm en JS para tests),
                  authEmail.js (usuario→email sintético), formatVehiculo.js
    styles/       tokens.css (paleta + tipografía, claro/oscuro)
  src/components/ui/     shadcn/ui (button, input, select, dialog, tabs, table, badge,
                        dropdown-menu, sheet, tooltip, sonner, form, ...)
  ```
- Alias Vite: `@/crm` → `src/crm`. El resto (`@/`, `@/components`, ...) sin tocar.
- **shadcn/ui**: `npx shadcn@latest init` con Tailwind v4 + React 19. Componentes en
  `src/components/ui/*`. `src/components/common/*` (sitio público) queda intacto; el
  CRM importa de `@/components/ui`.
- Reusa sin modificar: `src/services/supabaseClient.js`, `@tanstack/react-query`
  (ya hay `QueryClientProvider`), patrón `zustand` para UI state, flujo R2
  `presign` (`src/server/r2Core.js` + `api/r2/presign.js`).
- Extiende: `src/context/AuthProvider.jsx` — cuando la ruta es `/crm/*`, además de
  `perfiles` carga el perfil desde `crm.usuarios`.

---

## 3. Schema `crm`

Nuevo schema `crm`, **expuesto** por PostgREST (Settings → API → Exposed schemas
→ agregar `crm`), **con RLS activada**. `crm_legacy` sigue sin exponerse.

### 3.1 Enums

```sql
create type crm.rol             as enum ('admin', 'vendedor');
create type crm.estado_vehiculo as enum ('disponible', 'reservado', 'vendido', 'baja');
create type crm.moneda          as enum ('ARS', 'USD');
create type crm.estado_gestoria as enum ('sin_iniciar', 'en_proceso', 'completo');
create type crm.estado_item     as enum ('ok', 'observacion', 'falta', 'na');
```

### 3.2 Tablas

**`crm.usuarios`** — identidad + rol. `id uuid pk` = `auth.users.id`.
```
id           uuid pk references auth.users(id) on delete cascade
usuario      citext unique not null          -- el usuario del CRM viejo, ej. "Bruno"
nombre       text not null
rol          crm.rol not null default 'vendedor'
activo       boolean not null default true
id_legacy    int                              -- crm_legacy.usuarios.id (traza)
creado_en    timestamptz not null default now()
```

**`crm.vehiculos`**
```
id             uuid pk default gen_random_uuid()
id_legacy      text unique                    -- crm_legacy.vehiculos.id
marca          text not null
modelo         text not null
version        text
patente        text
tipo           text                           -- Pickup, Sedan, SUV, Hatchback, ...
anio           int
km             int
transmision    text                           -- manual | automático
color          text
moneda         crm.moneda not null default 'ARS'
precio_contado numeric
precio_canje   numeric
duenio_nombre    text
duenio_apellido  text
duenio_contacto  text
itv            text                            -- si | no
itv_venc      date
consignacion  boolean not null default false
tipo_consignacion text
origen        text                             -- propio | consignación | ...
carpeta_completa    boolean not null default false
carpeta_con_oficio  boolean not null default false
carpeta_entregada   boolean not null default false
tiene_iva     boolean not null default false
nota          text
estado        crm.estado_vehiculo not null default 'disponible'
creado_por    uuid references crm.usuarios(id)
editado_por   uuid references crm.usuarios(id)
creado_en     timestamptz not null default now()
actualizado_en timestamptz not null default now()   -- trigger
archivado_en  timestamptz                       -- soft-archive (vendedor); delete real solo admin
```
Índices: `(estado)`, `(marca, modelo)`, `(patente)`, `(archivado_en)`.

**`crm.vehiculo_fotos`**
```
id          bigserial pk
vehiculo_id uuid not null references crm.vehiculos(id) on delete cascade
orden       int not null default 0
url         text not null                      -- URL pública R2
es_portada  boolean not null default false
subida_por  uuid references crm.usuarios(id)
subida_en   timestamptz not null default now()
```
Índice parcial único: una sola portada por vehículo.

**`crm.peritajes`** — 1–N por vehículo (histórico).
```
id           bigserial pk
vehiculo_id  uuid not null references crm.vehiculos(id) on delete cascade
id_legacy    int unique
fecha        date
peritado_por uuid references crm.usuarios(id)
reseña       text
costo_total  numeric
datos        jsonb not null default '{}'::jsonb  -- blob de ~120 campos (ver lib/peritajeSchema.js)
items_ok     int not null default 0             -- resumen materializado al guardar
items_obs    int not null default 0
items_falta  int not null default 0
creado_en    timestamptz not null default now()
```
Índice: `(vehiculo_id, fecha desc)`.

**`crm.gestoria`** — 1–1 por vehículo.
```
id           bigserial pk
vehiculo_id  uuid not null unique references crm.vehiculos(id) on delete cascade
id_legacy    int unique
estado       crm.estado_gestoria not null default 'sin_iniciar'
notas        text
fecha_inicio date
fecha_cierre date
-- 8 bloques idénticos, <item> ∈ form08, verif_policial, multas_nac, dominio_hist,
--                            libre_deudas, titulo, cedulas, identificacion
<item>_hecho boolean not null default false
<item>_fecha date
<item>_nota  text
<item>_por   uuid references crm.usuarios(id)
items_extra  jsonb not null default '{}'::jsonb   -- ítems no estándar del legacy
creado_en      timestamptz not null default now()
actualizado_en timestamptz not null default now() -- trigger
```
`estado` se recalcula en un trigger: `sin_iniciar` si 0 hechos, `completo` si los 8, `en_proceso` si intermedio.

**`crm.eventos`** — bitácora append-only.
```
id         bigserial pk
entidad    text not null            -- 'vehiculo' | 'peritaje' | 'gestoria'
entidad_id text not null            -- uuid o bigint como texto
tipo       text not null            -- alta | edicion | cambio_estado | peritaje | gestoria | archivado | foto
usuario_id uuid references crm.usuarios(id)
datos      jsonb not null default '{}'::jsonb   -- {de, a} para cambios; resumen para peritaje; etc.
creado_en  timestamptz not null default now()
```
Índice: `(entidad, entidad_id, creado_en desc)`.

### 3.3 Funciones y triggers

- `crm.set_actualizado_en()` + triggers `before update` en `vehiculos` y `gestoria`.
- `crm.gestoria_recalcular_estado()` trigger `before insert/update` en `gestoria`.
- `crm.mi_rol() returns crm.rol` — `security definer`, `select rol from crm.usuarios where id = auth.uid()`. Base de todas las policies.
- `crm.es_usuario() returns boolean` — `exists (select 1 from crm.usuarios where id = auth.uid() and activo)`.

### 3.4 RLS

```
alter table crm.<todas> enable row level security;
```

| Tabla | select | insert | update | delete |
|---|---|---|---|---|
| `usuarios` | `crm.es_usuario()` | `crm.mi_rol() = 'admin'` | `crm.mi_rol() = 'admin'` | `crm.mi_rol() = 'admin'` |
| `vehiculos` | `crm.es_usuario()` | `crm.es_usuario()` | `crm.es_usuario()` | `crm.mi_rol() = 'admin'` |
| `vehiculo_fotos` | `crm.es_usuario()` | `crm.es_usuario()` | `crm.es_usuario()` | `crm.es_usuario()` |
| `peritajes` | `crm.es_usuario()` | `crm.es_usuario()` | `crm.es_usuario()` | `crm.mi_rol() = 'admin'` |
| `gestoria` | `crm.es_usuario()` | `crm.es_usuario()` | `crm.es_usuario()` | `crm.mi_rol() = 'admin'` |
| `eventos` | `crm.es_usuario()` | `crm.es_usuario()` | — | — |

El vendedor "archiva" seteando `vehiculos.archivado_en` (un `update`, permitido).
La gestión de usuarios (alta/reset password) pasa por función serverless con
service role, no por PostgREST directo — por eso `usuarios` insert/update admin es
defensa en profundidad.

### 3.5 Peritaje: `datos jsonb` + `lib/peritajeSchema.js`

El formulario de ~120 campos **no** se modela columna por columna. Se guarda como
`datos jsonb` (misma decisión que el clon). La estructura vive en
`src/crm/lib/peritajeSchema.js` como fuente única:

```js
export const PERITAJE_SECCIONES = [
  { id: 'motor', titulo: 'Motor y transmisión', items: [
    { key: 'motor',       label: 'Motor',            tipo: 'estado' },
    { key: 'cajaAT',       label: 'Caja automática',  tipo: 'estado' },
    { key: 'mantenimiento',label: 'Últ. mantenimiento', tipo: 'texto' },
    { key: 'obsMotor',     label: 'Observaciones',    tipo: 'texto' },
    { key: 'costoB',       label: 'Costo estimado',   tipo: 'moneda' },
    // ...
  ]},
  { id: 'rodante', titulo: 'Rodante y frenos', items: [ /* ... */ ]},
  { id: 'electronica', titulo: 'Electrónica y diagnóstico', items: [ /* dtcCode1..3, ... */ ]},
  { id: 'accesorios', titulo: 'Accesorios y equipamiento', items: [ /* ... */ ]},
  { id: 'tapizados', titulo: 'Tapizados e interior', items: [ /* ... */ ]},
  { id: 'carroceria', titulo: 'Carrocería', items: [ /* daño<Panel> + pct<Panel> por panel */ ]},
  { id: 'historial', titulo: 'Historial y fondo', items: [ /* fHistorialServicios, fPrimerDuenio, ... */ ]},
]
```

- `tipo`: `estado` (`crm.estado_item`) | `texto` | `moneda` | `porcentaje` | `seleccion`.
- El form y la vista de lectura (`PeritajeLectura`) se generan de acá.
- El **resumen** (`items_ok/obs/falta`) = conteo de los items `tipo: 'estado'` por valor, calculado en JS al guardar y persistido en las columnas.
- La lista completa de items/labels se extrae de los HAR (`scraping/NewEndpoints/*.har` — el POST de `peritaje.php` trae los ~120 keys) y de `crm_legacy.raw_registros` (entidad `peritaje`) durante la implementación.

`src/crm/lib/gestoriaSchema.js`: los 8 ítems estándar con sus labels en español
(`form08` → "Formulario 08", `verif_policial` → "Verificación policial", etc.).

---

## 4. Auth

### 4.1 Login

- Pantalla `/crm/login` (o reusa `/login` con detección de destino): campos
  **Usuario** y **Contraseña**, botón "Ingresar". Idéntico al viejo.
- `src/crm/lib/authEmail.js`: `emailDeUsuario(usuario)` → `${usuario.toLowerCase().replace(/[^a-z0-9]/g,'')}@crm.neifert.local`. **Misma fórmula** que `crmShadowEmail` en `src/server/crmCore.js` (reusar la lógica, no divergir).
- El front llama `supabase.auth.signInWithPassword({ email: emailDeUsuario(usuario), password })`.
- Error → "Usuario o contraseña incorrectos." (en la voz de la interfaz, sin disculpas).

### 4.2 Seed de los 6 usuarios

- `api/crm/seed-usuarios.js` — Serverless Function, protegida por `CRON_SECRET`
  (reusa el de la infra del clon) o un `SEED_SECRET` dedicado.
- Input: array `[{ usuario, nombre, rol, password }]` (lo aporta el dueño; **no** se commitea).
- Por cada uno: `admin.listUsers` → si no existe `admin.createUser({ email, password, email_confirm: true, user_metadata: { nombre, rol } })`; luego `upsert` en `crm.usuarios` (`id` = auth user id, `usuario`, `nombre`, `rol`, `id_legacy` matcheando `crm_legacy.usuarios` por `usuario`).
- Idempotente por `usuario`. Re-ejecutable para corregir rol o resetear password.
- Script `scripts/seed-crm-usuarios.mjs` que lee un JSON local (gitignored) y llama la función.

### 4.3 Sesión y guard

- `AuthProvider` extendido: cuando `location.pathname` empieza con `/crm`, tras
  tener `session.user`, carga `crm.usuarios` por `id` y expone `crmPerfil = { usuario, nombre, rol, activo }` en el contexto.
- `CrmProtectedRoute`: `loading` → spinner; sin sesión → redirect a login; con
  sesión pero sin fila en `crm.usuarios` o `activo=false` → pantalla "Tu cuenta no
  tiene acceso al CRM. Pedile a un administrador que te habilite."
- `useCrmPerfil()` hook → `{ usuario, nombre, rol, esAdmin }`.
- Gating de UI por `esAdmin` (botones borrar, sección usuarios futura). El RLS es
  la barrera real; la UI solo evita ofrecer lo que va a fallar.

### 4.4 Cambiar contraseña

- `/crm/cambiar-password`: form (contraseña nueva + repetir) → `supabase.auth.updateUser({ password })`. Toast "Contraseña actualizada."
- Reset por olvido: lo hace un admin re-corriendo el seed con la password nueva
  para ese usuario (v1). Flujo self-service de reset queda para el spec 4.

---

## 5. Módulo Vehículos

### 5.1 Rutas

```
/crm                       → redirect a /crm/vehiculos
/crm/vehiculos             lista + filtros
/crm/vehiculos/nuevo       alta
/crm/vehiculos/:id         detalle — tabs: Resumen · Peritaje · Gestoría · Historial
/crm/vehiculos/:id/editar  edición
/crm/cambiar-password
```

### 5.2 Lista (`VehiculosListPage`)

- **Tabla** (`VehiculoTable`) en ≥ md; **cards** (`VehiculoCard`) en < md.
- Columnas: Vehículo (marca modelo versión), Patente (mono), Año (mono), Km (mono),
  Precio (mono, con moneda), Estado (badge), Peritaje (chip resumen o "—"),
  Gestoría (badge estado), acciones.
- **Búsqueda** (debounced): marca, modelo, versión, patente, dueño.
- **Filtros** (`VehiculoFilters`): estado, tipo, moneda, rango año, rango precio,
  "con peritaje", "gestoría pendiente", "incluir archivados" (off por defecto).
- **Orden**: creado_en, precio, año, km, marca. **Paginación** server-side (page size 20).
- Acción rápida en fila: cambiar estado (dropdown) → mutation + evento.
- **Realtime**: `useCrmRealtime('vehiculos')` invalida la query al haber cambios.
- Estado de UI (búsqueda, filtros, orden, página) en un store zustand
  `useVehiculosFiltros` (patrón de `useCrmStore` existente).
- Empty state: "No hay vehículos que coincidan. Probá quitar filtros o [Cargar vehículo]."

### 5.3 Alta / edición (`VehiculoForm`)

- `react-hook-form` + `zod` (`vehiculoSchema` en `lib/`). Sin dependencia nueva:
  `@hookform/resolvers` y `zod` ya están.
- Secciones: **Datos** (marca*, modelo*, versión, tipo, año, km, transmisión,
  color, patente) · **Precio** (moneda, contado, canje) · **Dueño** (nombre,
  apellido, contacto) · **Documentación** (itv, itv_venc, consignación +
  tipo, origen, carpeta_*, tiene_iva) · **Nota**.
- **Fotos** (`FotosUploader`, solo en edición o tras crear): sube a R2 con
  `presign`, muestra miniaturas, drag para reordenar, marcar portada, borrar.
- Guardar: `insert`/`update` en `crm.vehiculos` con `creado_por`/`editado_por` =
  `crmPerfil.id`; registra evento (`alta` / `edicion` con diff de campos).
- Validación: marca y modelo requeridos; año entre 1950 y (año actual + 1); km ≥ 0;
  precios ≥ 0. Mensajes en la voz de la interfaz.

### 5.4 Detalle (`VehiculoDetallePage`)

**Tab Resumen (`FichaVehiculo`)** — el elemento signature:
- Hero: foto de portada grande; si no hay fotos, **placa-placeholder** con la
  patente en Geist Mono grande sobre `--surface`.
- Línea de specs en mono: `2015 · 128.000 km · Manual · Nafta` (formateada por `formatVehiculo.js`).
- Precio con peso de titular; moneda como sufijo `muted`.
- Chips: estado, ITV (`si`/`vence dd/mm`), consignación, IVA.
- Bloque dueño; bloque nota.
- Acciones: Editar · Cambiar estado · Archivar (si admin: además Eliminar, con diálogo de confirmación).

**Tab Peritaje:**
- Lista de peritajes del vehículo: fecha, peritador, `EstadoStrip` (barra segmentada
  verde/ámbar/rojo por proporción `items_ok/obs/falta`), costo. "Nuevo peritaje".
- Abrir uno → `PeritajeLectura`: sección por sección desde `peritajeSchema`, cada
  item con su valor; los `estado` con color semántico; costos sumados.
- `PeritajeForm` (nuevo/editar): secciones colapsables, item por item según
  `peritajeSchema`. **Strip fijo arriba** con el conteo vivo mientras se carga.
  Guardar → `insert crm.peritajes` con `datos`, resumen calculado, `peritado_por`;
  evento `peritaje`.

**Tab Gestoría (`GestoriaChecklist`):**
- Los 8 trámites (de `gestoriaSchema`): cada uno toggle "hecho" + fecha + nota +
  quién. `estado` general derivado (badge). Fechas inicio/cierre editables.
- Guardar por item (autosave al togglear) o botón "Guardar cambios" — **autosave
  por item**, con toast discreto. `upsert crm.gestoria` (1–1 por vehículo); evento
  `gestoria` con el item cambiado.

**Tab Historial (`HistorialTimeline`):**
- `crm.eventos` filtrado por `(entidad='vehiculo', entidad_id=:id)` **más** los
  eventos de sus peritajes y gestoría. Orden desc. Cada entrada: icono por tipo,
  texto legible ("Bruno cambió el estado de disponible a reservado"), fecha relativa.

### 5.5 Servicios y hooks

- `vehiculos.service.js`: `listar(filtros, orden, pagina)`, `obtener(id)`,
  `crear(data)`, `actualizar(id, data)`, `archivar(id)`, `eliminar(id)`,
  `cambiarEstado(id, estado)`. Cada mutation llama `eventos.service.registrar(...)`.
- `peritajes.service.js`: `listarPorVehiculo(id)`, `obtener(id)`, `crear(data)`, `actualizar(id, data)`.
- `gestoria.service.js`: `obtenerPorVehiculo(id)`, `guardarItem(vehiculoId, item, valor)`.
- `eventos.service.js`: `registrar({ entidad, entidadId, tipo, datos })`, `listarDeVehiculo(id)`.
- `crmUsuarios.service.js`: `listar()` (para selects de "peritado por", etc.).
- Hooks react-query: `useVehiculos(filtros)`, `useVehiculo(id)`, `usePeritajes(vehiculoId)`,
  `usePeritaje(id)`, `useGestoria(vehiculoId)`, `useEventosVehiculo(id)`, `useCrmUsuarios()`.
  Mutations con `onSuccess` → `invalidateQueries` + toast.

---

## 6. Dirección visual

**Subject:** herramienta de piso de venta de una automotora de San Francisco
(Córdoba). Uso rápido y diario desde la compu del salón, el celular en la playa
de autos, o una tablet en el taller cargando el peritaje. Es un instrumento de
medición y seguimiento, no una pieza de marketing.

**Committed a "Apple minimalista"** (el brief manda), ejecutado con precisión:

### Tokens (`src/crm/styles/tokens.css`)

El sitio ya usa **Tailwind v4 CSS-first** con dark mode por **clase `.dark` en
`<html>`** (`@custom-variant dark`), key de `localStorage` `nf-theme`, y un script
anti-FOUC en `index.html`. El CRM **reusa ese mecanismo** — no inventa `data-theme`
ni otra key. `tokens.css` del CRM define variables `--crm-*` propias (scope: se
importan en `CrmLayout`), en `:root` y bajo `.dark`, para no chocar con los
`--c-*` glassy del sitio público:

```
/* src/crm/styles/tokens.css */
:root {
  --crm-bg:      #FBFBFD;
  --crm-surface: #FFFFFF;
  --crm-ink:     #1D1D1F;
  --crm-muted:   #86868B;
  --crm-line:    #E8E8ED;
  --crm-accent:  #0B6BCB;   /* azul señal, tipo instrumento */
  --crm-ok:      #1A7F52;
  --crm-obs:     #B0740A;
  --crm-falta:   #C1352B;
  --crm-radius:  10px;
}
.dark {
  --crm-bg:      #0A0A0C;
  --crm-surface: #161618;
  --crm-ink:     #F5F5F7;
  --crm-muted:   #8E8E93;
  --crm-line:    #2A2A2E;
  --crm-accent:  #3B93E6;
  --crm-ok:      #34B27B;
  --crm-obs:     #D2963A;
  --crm-falta:   #E0564B;
}
```
Colores semánticos desaturados (no semáforo chillón). El estado de tema **ya
existe**: `src/store/useUiStore.js` (`theme` / `toggleTheme` / `setTheme`, clase
`.dark` + key `nf-theme` + script anti-FOUC en `index.html`). El CRM **reusa
`useUiStore` tal cual** — no hay lógica de tema nueva. El `ThemeToggle` del CRM es
solo un botón con estética shadcn cableado a `useUiStore.toggleTheme` (o se reusa
`src/components/common/ThemeToggle.jsx` directamente).

### Tipografía

- **Geist Sans** — UI y títulos. Pesos 400 / 500 / 600. Sin serif de exhibición.
- **Geist Mono** — todo valor medido: patente, km, precios, IDs, códigos DTC,
  fechas en tablas. Que los números "se sientan medidos" es fiel a un peritaje.
- Escala: 12 / 13 / 14 / 16 / 20 / 28. Ambas fuentes por Google Fonts.

### Layout

- Sidebar fija angosta (icono + label, colapsable a solo icono), `--surface` con
  borde hairline. En móvil → `Sheet` de shadcn disparado por un botón en la topbar.
- Contenido en `max-width` generoso, aire amplio, separadores `1px var(--line)`,
  cero sombras pesadas, `--radius` 10px, foco de teclado visible siempre.
- Densidad funcional: filas de tabla ~44px (cómodas, no el aire de una landing).

### Signature

1. **La ficha del vehículo** como página de producto: hero de foto grande (o
   placa-placeholder con la patente en Mono gigante), specs en fila tabular mono,
   precio con peso de titular.
2. **`EstadoStrip`** del peritaje: barra fina segmentada (verde/ámbar/rojo por
   proporción de ítems) que se lee de un vistazo desde el otro lado del taller.

Todo lo demás, callado. Una sola apuesta visual, ejecutada bien.

### Motion

Mínima: transición de página sutil (`framer-motion`, ya está), hover de fila
apenas perceptible, colapso de secciones del peritaje suave. `prefers-reduced-motion`
respetado (sin excepción).

### Piso de calidad (sin anunciarlo)

Responsive hasta 360px de ancho · foco de teclado visible · `reduced-motion` ·
contraste AA en ambos temas · estados vacíos que invitan a actuar · errores que
dicen qué pasó y cómo seguir, en la voz de la interfaz.

---

## 7. Migración de datos

- **Función SQL `crm.migrar_desde_legacy()`** (idempotente), corre en el SQL Editor:
  - `crm_legacy.vehiculos` → `crm.vehiculos`: `on conflict (id_legacy) do update`;
    mapeo text→enum (`status` → `estado_vehiculo`, con `'baja'` para lo que el
    legacy no tenga), `0/1`→bool, strings de fecha→`date`. `creado_por`/`editado_por`
    se resuelven contra `crm.usuarios` por nombre si matchea, si no `null`.
  - `crm_legacy.peritajes` → `crm.peritajes`: `secciones` (jsonb del clon) → `datos`;
    resumen `items_ok/obs/falta` recalculado con `peritajeSchema` (en el script JS,
    no en SQL — ver abajo).
  - `crm_legacy.gestoria_tramites` → `crm.gestoria`: `items`/columnas espejo → los
    8 bloques `<item>_*`; `estado` recalculado por el trigger.
  - `crm_legacy.usuarios`: no se migra acá — es input del **seed** de auth (§4.2),
    que además setea `crm.usuarios.id_legacy`.
- **Script `scripts/migrate-legacy-to-crm.mjs`** (`node --env-file=.env`):
  1. corre el seed de usuarios si falta (o avisa),
  2. llama la parte SQL para vehículos y gestoría,
  3. hace la de **peritajes en JS** (lee `crm_legacy.peritajes`, calcula resumen con
     `src/crm/lib/peritajeSchema.js` + un `resumenPeritaje(datos)`, upsert a `crm.peritajes`),
  4. reporta conteos por tabla y diferencias vs. `crm_legacy`.
- `crm_legacy` sigue sincronizando del CRM viejo (cron activo). La migración se
  **re-corre** cuando quieras hasta la fecha de corte. Sin sync inverso: lo que se
  cargue en `crm` durante la transición se replica a mano en el viejo (transición
  corta, controlada por el dueño).

---

## 8. Testing

**Unit (Vitest, ya configurado):**
- `lib/authEmail.js`: `emailDeUsuario` — casos con mayúsculas, espacios, acentos;
  **debe coincidir** con `crmShadowEmail` de `src/server/crmCore.js` (test que
  compara ambas salidas).
- `lib/peritajeSchema.js`: integridad — todo item tiene `key` único, `label`,
  `tipo` válido; toda sección tiene `id` y `titulo`.
- `resumenPeritaje(datos)`: conteo `ok/observacion/falta` sobre items `tipo:'estado'`;
  ignora `texto`/`moneda`; datos parciales.
- `lib/mapeos.js`: mapeo legacy→crm campo por campo (text→enum, 0/1→bool, fecha
  `"0000-00-00"`→null, `status` desconocido→`'baja'`).
- `vehiculoSchema` / `peritajeSchema` zod: válidos e inválidos (año fuera de rango,
  km negativo, marca vacía).

**Servicios (mock del cliente Supabase, patrón del clon):**
- `vehiculos.service`: `listar` arma filtros/orden/paginación correctos; `crear` y
  `actualizar` setean auditoría y **registran evento**; `archivar` setea
  `archivado_en` y no borra; `eliminar` sí borra.
- `gestoria.service.guardarItem`: upsert correcto + evento.
- `eventos.service.registrar`: shape de la fila.

**RLS (integración, detrás de `RUN_CRM_RLS=1`):**
- Con dos sesiones reales (un `admin` y un `vendedor` del seed en un proyecto de
  prueba): vendedor puede `insert`/`update` vehículos, **no** puede `delete`, **no**
  puede `insert` en `crm.usuarios`. admin puede todo. Un usuario sin fila en
  `crm.usuarios` no ve nada.

**Componentes (Vitest + Testing Library — agregar `@testing-library/react` +
`jsdom` como devDeps):**
- `EstadoStrip`: proporciones y `aria-label` correctos para varios conteos.
- `PeritajeForm`: el strip fijo actualiza el conteo al cambiar un item `estado`.
- `VehiculoFilters`: emite el objeto de filtros esperado.
- `FichaVehiculo`: muestra placa-placeholder cuando no hay fotos.

Sin e2e en v1.

---

## 9. Configuración

- **Supabase:** correr `supabase/crm_schema.sql`; agregar `crm` a Exposed schemas.
- **Env nuevas:** `SEED_SECRET` (o reusar `CRON_SECRET`) para `api/crm/seed-usuarios.js`.
  Reusa: todo lo de Supabase y R2 que ya existe.
- **Deps nuevas:** shadcn/ui (no es un paquete: son componentes copiados + `class-variance-authority`, `tailwind-merge` (ya está), `clsx` (ya está), `@radix-ui/*` según componente); dev: `@testing-library/react`, `@testing-library/jest-dom`, `jsdom`.
- **`vitest.config.js`:** agregar `environment: 'jsdom'` para los tests de componentes (o un segundo proyecto vitest; los de `src/server/**` siguen en `node`).
- **Fuentes:** Geist Sans + Geist Mono vía `@fontsource` o Google Fonts en el `index.html` / CSS del CRM.

---

## 10. Fuera de alcance (v1)

Clientes · Alertas · Tareas · gestión de Usuarios más allá del seed (alta desde
UI, roles editables, organigrama) · Dashboard y gráficos · jerarquía · corte del
sitio público (la sync externa legacy→`public.vehiculos` sigue intacta) ·
notificaciones push · app móvil nativa · escribir de vuelta al CRM viejo ·
reset de contraseña self-service.

---

## 11. Entregables

1. `supabase/crm_schema.sql` aplicado (enums, tablas, triggers, funciones, RLS).
2. `crm` agregado a Exposed schemas.
3. shadcn/ui inicializado; `src/components/ui/*` con los componentes usados.
4. `src/crm/**` — páginas, componentes, servicios, hooks, lib, tokens.
5. Route group `/crm/*` + `CrmProtectedRoute` + `CrmLayout` + `AuthProvider` extendido.
6. `api/crm/seed-usuarios.js` + `scripts/seed-crm-usuarios.mjs` + los 6 usuarios seedeados.
7. `crm.migrar_desde_legacy()` + `scripts/migrate-legacy-to-crm.mjs` + datos migrados.
8. Suite de tests en verde (unit + servicios + componentes; RLS detrás de env).
9. `.env.example` actualizado.
