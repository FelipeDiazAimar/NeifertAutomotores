# CRM nuevo — Módulo Clientes

**Fecha:** 2026-08-30
**Estado:** aprobado
**Depende de:** `2026-08-30-crm-nuevo-fundaciones-vehiculos-design.md` (schema `crm`, auth, shell, estética glass, patrón servicios/hooks — todo ya implementado en Planes 1 y 2).

## 1. Objetivo

Gestión de la cartera de clientes/leads del salón dentro del CRM nuevo: ficha del
cliente, intereses, autos en entrega, seguimiento de contactos, y cierre de venta
vinculando cliente ↔ vehículo. Migra los 175 clientes de `crm_legacy`.

### Decisiones (brainstorming)

| Tema | Decisión |
|---|---|
| Seguimiento | **Log simple de contactos** por cliente (texto + fecha + quién), sobre `crm.eventos` (`tipo='contacto'`). Sin recordatorios/due-dates — eso es el módulo Alertas/Tareas. |
| Leads web | **Fuera de v1.** El módulo gestiona la cartera interna (migrados + altas manuales). El `/admin/crm` actual sigue en paralelo. La ingesta web se ve en "corte del sitio público". |
| Cierre de venta | **"Registrar venta" desde la ficha del cliente**: elegís un vehículo `disponible` → cliente pasa a `vendido` (+ `venta_vehiculo_id`, `fecha_venta`), vehículo pasa a `vendido` (+ `venta_cliente_id`, `fecha_venta`), evento en ambos. |
| Estética / patrones | Idénticos a Vehículos: glass, `common/*`, `react-query`, `zustand`, RLS por rol. |
| Plan | **Uno solo** (más chico que Vehículos). |

## 2. Schema `crm` (adiciones)

**Enum:** `crm.estado_cliente` = `('activo','en_seguimiento','vendido','perdido')`.

**`crm.clientes`**
```
id                 uuid pk default gen_random_uuid()
id_legacy          text unique
nombre             text not null
telefono           text
localidad          text
fecha_cumple       date
status             crm.estado_cliente not null default 'activo'
canal              text                     -- salon | whatsapp | instagram | ya_cliente | ...
presupuesto        numeric
marca_interes      text
modelo_interes     text
tipo_interes       text
trans_interes      text
anio_min           int
anio_max           int
notas              text
interes_cero_km    boolean not null default false
cero_km            jsonb
tiene_auto_entrega boolean not null default false
venta_vehiculo_id  uuid references crm.vehiculos(id) on delete set null
fecha_venta        date
creado_por         uuid references crm.usuarios(id)
editado_por        uuid references crm.usuarios(id)
creado_en          timestamptz not null default now()
actualizado_en     timestamptz not null default now()   -- trigger
archivado_en       timestamptz
```
Índices: `(status)`, `(canal)`, `(archivado_en)`, `(marca_interes)`.

**`crm.cliente_intereses`** — `id bigserial pk`, `cliente_id uuid not null references crm.clientes(id) on delete cascade`, `marca text`, `modelo text`. Índice `(cliente_id)`.

**`crm.cliente_autos_entrega`** — `id bigserial pk`, `cliente_id uuid not null references crm.clientes(id) on delete cascade`, `marca`, `modelo`, `version`, `anio int`, `km int`, `color`, `trans`, `notas`. Índice `(cliente_id)`.

**`crm.vehiculos`** += `venta_cliente_id uuid references crm.clientes(id) on delete set null` y `fecha_venta date` (ya existía en el clon; falta en `crm`). `alter table ... add column if not exists`.

**Trigger:** `crm.set_actualizado_en()` (ya existe) → trigger `before update` en `crm.clientes`.

**RLS** (mismas 3 tablas): `select`/`insert`/`update` con `crm.es_usuario()`; `delete` con `crm.mi_rol() = 'admin'`. `crm.eventos` ya cubre `entidad='cliente'`.

**Grants:** `authenticated` + `service_role` sobre las nuevas tablas (el schema ya los tiene por `alter default privileges`, pero se corren los `grant ... on all tables` de nuevo por las dudas).

## 3. Migración

**`crm.migrar_clientes_desde_legacy()`** (idempotente, `on conflict (id_legacy) do update`):
- `crm_legacy.clientes` → `crm.clientes`: mapeo directo; `status` legacy (`activo`/`vendido`/otro) → enum (`otro`→`activo`); `venta_vehiculo_id` = `(select id from crm.vehiculos where id_legacy = l.venta_vehiculo_id)`; `creado_por`/`editado_por` null (no hay match confiable por nombre).
- `crm_legacy.cliente_intereses` → `crm.cliente_intereses` (join por `id_legacy`). Se reconstruye: `delete` los de los clientes migrados + `insert`.
- `crm_legacy.cliente_autos_entrega` → `crm.cliente_autos_entrega` (idem).
- Devuelve conteos.

Script: se corre por `pg` como en la migración de vehículos (`scripts/migrate-clientes-to-crm.mjs` o se agrega al existente). Nota: `crm_legacy.clientes.venta_vehiculo_id` es el nombre de columna del clon (ver `transformCliente`).

## 4. UI

Rutas (dentro del grupo `CrmLayout`):
```
/crm/clientes             lista + filtros
/crm/clientes/nuevo       alta
/crm/clientes/:id         ficha (datos · intereses · autos en entrega · seguimiento · historial)
/crm/clientes/:id/editar  edición
```
Sidebar: nuevo ítem "Clientes" (icono `Users`), antes de "Vehículos" o después — a gusto.

**Lista (`ClientesListPage`)** — igual que Vehículos:
- Búsqueda (nombre, teléfono) debounced.
- Botón "Filtros" a la derecha del buscador (oculto por defecto), badge de activos. `ClienteFilters`: status (chips), canal (chips), "con auto en entrega", "interés 0km", incluir archivados.
- `ClienteTable` (≥md) / `ClienteCard` (<md): nombre, teléfono, localidad, interés (marca modelo), presupuesto, canal (Badge), status (Badge + DropdownMenu cambio rápido).
- Paginación server-side (20), realtime (`useCrmRealtime('clientes', ...)`), empty state.

**Alta/edición (`ClienteForm` + `clienteSchema` zod)** — secciones: **Datos** (nombre*, teléfono, localidad, cumpleaños, canal `Select`) · **Interés** (marca, modelo, tipo, transmisión, año min/max, presupuesto, "interés 0km" + campos `cero_km`) · **Notas**. Los intereses múltiples y autos en entrega se editan en la ficha (no en el form de alta), salvo que quieras cargarlos al crear — v1: se agregan desde la ficha.

**Ficha (`ClienteDetallePage`)** — pestañas (base-nova `Tabs`):
- **Datos** (`FichaCliente`): nombre grande, chips (status, canal, 0km, tiene auto en entrega), presupuesto, línea de interés, localidad/cumpleaños, notas. Acciones: Editar · Cambiar status · Archivar (admin: Eliminar) · **Registrar venta**.
- **Intereses**: lista de `cliente_intereses` (marca/modelo) con agregar/quitar inline.
- **Autos en entrega**: lista de `cliente_autos_entrega` (form chico por fila) con agregar/quitar.
- **Seguimiento**: compositor "Agregar contacto" (textarea → evento `tipo='contacto'`, `datos.texto`) + lista de contactos (de `crm.eventos` filtrados).
- **Historial**: `HistorialTimeline` reusado con `entidad='cliente'` (extender el hook/servicio para aceptar `entidad`).

**Registrar venta (`RegistrarVentaModal`)** — `Modal` con `Select`/búsqueda de vehículos `disponible`; confirmar → `clientes.service.registrarVenta(clienteId, vehiculoId, autorId)`:
1. `update crm.clientes` set `status='vendido'`, `venta_vehiculo_id`, `fecha_venta=hoy`.
2. `update crm.vehiculos` set `estado='vendido'`, `venta_cliente_id`, `fecha_venta=hoy`.
3. `eventos.registrar` en cliente (`tipo='venta'`, `datos:{vehiculo_id}`) y en vehículo (`tipo='cambio_estado'`, `datos:{de,a:'vendido',cliente_id}`).
Sin transacción DB (RLS permite ambos updates); si el 2º falla, se loguea y el toast avisa.

## 5. Servicios / hooks / lib nuevos

- `src/crm/services/clientes.service.js`: `listar(opts)`, `obtener(id)`, `crear(data, autorId)`, `actualizar(id, data, autorId)`, `cambiarStatus(id, de, a, autorId)`, `archivar(id, autorId)`, `desarchivar`, `eliminar(id)`, `registrarVenta(clienteId, vehiculoId, autorId)`, `agregarInteres/quitarInteres`, `agregarAutoEntrega/quitarAutoEntrega`, `agregarContacto(clienteId, texto, autorId)`.
- `src/crm/hooks/useClientes.js`: `useClientes(opts)`, `useCliente(id)`, `useClienteMutations()`.
- `src/crm/hooks/useClienteRelacionados.js` (o dentro de `useCliente`): intereses, autos entrega, contactos.
- `src/crm/lib/clienteSchema.js` (zod), `src/crm/lib/formatCliente.js` (`lineaInteres(c)`, `statusVariant(status)`, `canalLabel`).
- `src/crm/store/useClientesFiltros.js` (patrón de `useVehiculosFiltros`).
- `eventos.service.listarDeVehiculo` → generalizar a `listarDeEntidad(entidad, id)`; mantener `listarDeVehiculo` como wrapper. `useEventosVehiculo` → `useEventos(entidad, id)` + wrapper.

## 6. Testing

Unit: `clienteSchema` (nombre requerido, año/presupuesto ≥ 0), `formatCliente`.
Servicios (mock supabase, patrón `_supabaseMock`): `listar` filtros/paginación, `crear`/`cambiarStatus`/`archivar` registran evento, `registrarVenta` hace los 2 updates + 2 eventos, `agregarContacto` inserta evento `contacto`.
Componentes (jsdom): `ClienteFilters` (toggle chip), `ClienteForm` (nombre vacío → error), `ClienteDetallePage` (4–5 pestañas), `RegistrarVentaModal` (elegir vehículo → callback).
Migración: test de forma del SQL. RLS: extender `scripts/verificar-crm-rls.mjs` con clientes (vendedor no borra, no `registrarVenta` si… — bueno, sí puede; solo delete es admin).

## 7. Fuera de alcance

Recordatorios / tareas / alertas (módulo aparte) · ingesta de leads web · scoring de leads · dashboard · notificaciones · merge de duplicados.

## 8. Entregables

Schema aplicado · migración corrida (175 clientes + hijos) · `/crm/clientes/*` funcionando · sidebar con "Clientes" · tests verdes · `verificar-crm-rls.mjs` extendido.
