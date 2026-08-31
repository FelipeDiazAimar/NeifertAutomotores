# CRM nuevo — Módulo Tareas

**Fecha:** 2026-08-31
**Estado:** aprobado
**Depende de:** specs de fundaciones/vehículos y clientes (schema `crm`, auth, shell, estética glass, patrón servicios/hooks — implementado en Planes 1–3).

## 1. Objetivo

Tareas y recordatorios del salón, unificados en una sola tabla `crm.tareas`. Una
tarea puede tener hora opcional y linkear opcionalmente a un cliente y/o un
vehículo. `crm_legacy.alertas` y `crm_legacy.tareas` estaban vacías → **sin
migración**, tablas nuevas.

### Decisiones (brainstorming)

| Tema | Decisión |
|---|---|
| Modelo | **Unificado**: una tabla `crm.tareas`. La distinción alerta/tarea del legacy = filtro (¿tiene `cliente_id`?). |
| Superficies | Página `/crm/tareas` · badge en sidebar (pendientes de hoy asignadas a mí) · pestaña "Tareas" en la ficha del cliente · toast al entrar al CRM ("N tareas vencen hoy", 1 vez por sesión). |
| Alcance | **Todos ven todas.** RLS: `crm.es_usuario()` para select/insert/update; `crm.mi_rol()='admin'` para delete. |
| Estética/patrones | Idénticos a los módulos anteriores (glass, `common/*`, react-query, zustand). |
| Plan | Uno solo. |

## 2. Schema `crm`

**Enum:** `crm.prioridad_tarea` = `('baja','normal','alta')`.

**`crm.tareas`**
```
id            uuid pk default gen_random_uuid()
titulo        text not null
descripcion   text
fecha         date not null            -- vencimiento
hora          text                     -- "HH:MM" opcional
done          boolean not null default false
prioridad     crm.prioridad_tarea not null default 'normal'
asignado_a    uuid references crm.usuarios(id)
cliente_id    uuid references crm.clientes(id) on delete set null
vehiculo_id   uuid references crm.vehiculos(id) on delete set null
creado_por    uuid references crm.usuarios(id)
creado_en     timestamptz not null default now()
actualizado_en timestamptz not null default now()   -- trigger crm.set_actualizado_en
completada_en timestamptz
archivado_en  timestamptz              -- borrado suave para vendedor (admin borra de verdad)
```
Índices: `(done, fecha)`, `(asignado_a)`, `(cliente_id)`, `(vehiculo_id)`.

Trigger `before update`: `crm.set_actualizado_en()` (ya existe) + set/clear
`completada_en` cuando cambia `done` (función nueva `crm.tarea_completada()`).

RLS: `tareas_select`/`tareas_insert`/`tareas_update` con `crm.es_usuario()`;
`tareas_delete_admin` con `crm.mi_rol()='admin'`. Grants a `authenticated` +
`service_role`.

Realtime: no hace falta agregar a la publicación (el `useCrmRealtime` genérico
usa `postgres_changes` sobre el schema `crm` — funciona si `crm` está en la
publicación `supabase_realtime`; si no, la lista se refresca por invalidación en
las mutations, que es suficiente).

## 3. UI

Rutas (grupo `CrmLayout`): `/crm/tareas` (lista). Sin páginas de detalle/edición
aparte — alta y edición son modales (patrón de `ClienteFormModal`).

**`TareasListPage`**:
- Header `h1` + "Nueva tarea" (abre `TareaFormModal`).
- Filtros (botón "Filtros" oculto por defecto, mismo patrón): asignado a (`Select`
  de `useCrmUsuarios` + "todos" + "mías"), prioridad (chips), "solo con cliente",
  "incluir hechas" (off por defecto), "incluir archivadas".
- **Agrupación por vencimiento** (no paginado; el volumen de tareas activas es
  bajo): `Vencidas` · `Hoy` · `Esta semana` · `Más adelante` · `Hechas` (colapsada).
  Cada grupo es una lista de `TareaRow`.
- `TareaRow`: checkbox done (toggle inmediato), título, chips (prioridad si
  `alta`, cliente si linkeado → link a la ficha, vehículo si linkeado), fecha/hora,
  asignado_a (avatar/iniciales), menú (editar, archivar; admin: eliminar).
- `useCrmRealtime('tareas', ['crm','tareas'])`. Empty state.

**`TareaFormModal`** (alta y edición): `titulo*`, `descripcion` (textarea),
`fecha*` (`type=date`, default hoy), `hora` (`type=time` opcional), `prioridad`
(`Select`), `asignado_a` (`Select` de `useCrmUsuarios`, default = usuario actual),
`cliente_id` (buscador de clientes opcional — reusa un `Select` simple con
`useClientes({pageSize:500})` o un input con datalist), `vehiculo_id` (buscador de
vehículos disponibles opcional). RHF + `zod` (`tareaSchema`).
Cuando se abre desde la ficha de un cliente, `cliente_id` viene pre-cargado y
bloqueado.

**Sidebar**: ítem "Tareas" (icono `CheckSquare` o `ListTodo`) con badge =
`useTareasPendientesHoy()` (count de `done=false AND fecha<=hoy AND asignado_a=mí`).
Se ubica entre "Clientes" y "Vehículos" o al final — a gusto.

**Ficha del cliente**: nueva pestaña "Tareas" en `ClienteDetallePage` →
`<TareasDeCliente clienteId={id} />`: lista de tareas con ese `cliente_id`
(`useTareas({ filtros:{ clienteId: id }, incluirHechas:true })`), alta inline
(botón "Nueva tarea" → `TareaFormModal` con `cliente` fijo).

**Aviso al entrar**: en `CrmLayout` (o un `useAvisoTareasHoy()` montado ahí), al
primer render con sesión + perfil, si hay tareas que vencen hoy asignadas a mí y
no se mostró el aviso esta sesión (`sessionStorage`), `toast(\`Tenés N tareas que
vencen hoy\`, { action: ver → navigate('/crm/tareas') })`.

## 4. Servicios / hooks / lib

- `src/crm/services/tareas.service.js`: `listar({ filtros, incluirHechas, incluirArchivadas })`
  (sin paginar; ordena por `fecha`, `hora`), `contarPendientesHoy(usuarioId)`,
  `crear(data, autorId)`, `actualizar(id, data, autorId)`,
  `toggleDone(id, done, autorId)`, `archivar(id, autorId)`, `desarchivar`,
  `eliminar(id)`. Mutaciones registran `crm.eventos` **solo si** la tarea tiene
  `cliente_id` o `vehiculo_id` (evento `tipo='tarea'` en esa entidad, para que
  aparezca en su historial); las tareas sueltas no ensucian la bitácora.
- `src/crm/hooks/useTareas.js`: `useTareas(opts)`, `useTareaMutations()`,
  `useTareasPendientesHoy()` (`['crm','tareas','pendientes-hoy', usuarioId]`).
- `src/crm/lib/tareaSchema.js` (zod): `titulo` `min(1)`, `fecha` requerida
  (string ISO), `prioridad` enum, resto opcional.
- `src/crm/lib/agruparTareas.js`: `agrupar(tareas, hoy = new Date())` →
  `{ vencidas, hoy, semana, despues, hechas }` (usa `date-fns`).
- `src/crm/store/useTareasFiltros.js` (patrón de los otros filtros stores).
- `textoEvento` ya tiene `case 'tarea'`? No — agregar: `case 'tarea': return
  \`${quien} ${d.done ? 'completó' : 'creó'} una tarea: ${d.titulo}\``.

## 5. Testing

Unit: `tareaSchema`, `agruparTareas` (vencida / hoy / dentro de 7 días / más
lejos / hecha).
Servicios (mock supabase): `listar` arma filtros (`done`, `asignado_a`,
`cliente_id`, `archivado_en is null`); `crear` registra evento solo si hay
`cliente_id`/`vehiculo_id`; `toggleDone` setea `completada_en`;
`contarPendientesHoy` filtra `done=false`, `fecha<=hoy`, `asignado_a`.
Componentes (jsdom): `TareasListPage` (grupos), `TareaFormModal` (título vacío →
error; con `cliente` fijo el select viene bloqueado), `TareaRow` (toggle llama
`toggleDone`), badge de sidebar.
RLS: extender `scripts/verificar-crm-rls.mjs` (vendedor crea/edita, no borra;
admin borra).

## 6. Fuera de alcance

Recurrencia de tareas · notificaciones push/email · asignación múltiple ·
subtareas · calendario/vista mensual · adjuntos.

## 7. Entregables

Schema aplicado · `/crm/tareas` funcionando · badge en sidebar · pestaña Tareas en
ficha de cliente · aviso al entrar · tests verdes · `verificar-crm-rls.mjs`
extendido.
