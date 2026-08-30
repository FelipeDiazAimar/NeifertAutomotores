# CRM legacy — BD clon de backup + catálogo de endpoints

**Fecha:** 2026-08-30
**Estado:** aprobado, listo para plan de implementación
**Autor:** FelipeDiazAimar (con Claude)

---

## 1. Objetivo y contexto

El CRM legacy de Neifert Automotores vive en `https://neifertcrm.com` como una app
PHP con API en `/backend/api/*.php` y una base MySQL a la que **no tenemos acceso
directo** (ni código fuente ni dump). El equipo de ventas lo sigue usando todos
los días.

Queremos:

1. **Un clon de backup de la base**, alojado en nuestra infraestructura, que se
   mantenga fresco automáticamente mientras el CRM viejo sigue en uso.
2. **Un modelo relacional normalizado** de esos datos, que sirva de cimiento para
   construir un CRM nuevo y moderno para Neifert.
3. **Un catálogo completo de los endpoints** del CRM viejo (lectura y escritura),
   documentado, para que el CRM nuevo pueda replicar/reemplazar cada operación.

Esto **no** incluye construir el CRM nuevo (UI, auth, lógica de negocio) — es un
proyecto aparte que consumirá el schema definido acá.

### Decisiones tomadas en brainstorming

| Tema | Decisión |
|---|---|
| Dónde vive el clon | Mismo proyecto Supabase que ya usa el sitio, en un **schema aparte** (`crm_legacy`). |
| Forma de las tablas | **Modelo relacional normalizado** (no espejo crudo 1:1). |
| Frecuencia | **Sync recurrente** vía Vercel Cron. |
| Alcance | Backup de lectura **+ catálogo de endpoints de escritura**. |
| Fuente de esquema | Sin PHP ni dump → **ingeniería inversa** desde HAR (`scraping/`) y respuestas en vivo. |
| Credenciales | `CRM_SYNC_USER` / `CRM_SYNC_PASS` (empleado real) — **funcionan hoy**. |
| Fotos de vehículos | **Descargar y espejar** a R2 (no solo guardar URLs). |
| Historia de la capa raw | **Append-only con dedupe por hash**: fila nueva solo si el payload del registro cambió. La capa normalizada refleja el estado actual + `borrado_en`. |

---

## 2. Endpoints del CRM legacy

Base: `https://neifertcrm.com/backend/api`
Auth: `POST /auth/login.php` con `{ user, pass }` → `{ ok, data: { token (JWT), nombre, role } }`.
Las demás llamadas van con `Authorization: Bearer <token>`.

También existe una API pública dedicada en `/backend/api/public/` (token estático)
para el sitio — **fuera del alcance de este clon**, ya la usa `src/server/crmCore.js`.

### 2.1 Lectura (fuente del clon)

| Endpoint | Devuelve | Registros en captura inicial |
|---|---|---|
| `GET /clientes.php` | Cartera completa de clientes/leads. Trae anidado `brands[]` (`{marca,modelo}`), `autosEntrega[]`, `autoEntrega`, `canal`. | 137 |
| `GET /vehiculos.php` | Inventario. Trae `peritaje[]` anidado. Precios en ARS o USD (`moneda_contado`/`moneda_canje`). | 77 |
| `GET /peritaje.php` | Peritajes por vehículo. Blob plano de ~120 campos (secciones motor / rodante / electrónica / accesorios / tapizados / carrocería con paneles y % de daño / "sección F" historial). | 33 |
| `GET /gestoria.php` | Trámites de gestoría por vehículo (form08, verif. policial, multas, dominio histórico, libre deudas, título, cédulas, identificación) con fecha y nota por ítem. | 32 |
| `GET /alertas.php` | Alertas/recordatorios. | 1 |
| `GET /tareas.php` | Tareas asignadas a vendedores, con referencia a cliente. | 0 |
| `GET /usuarios.php` | Usuarios del CRM (`id`, `user`, `nombre`, `role`). | 6 |
| `GET /jerarquia.php` | **Shape desconocido** — vacío en todas las capturas. Se aterriza en `raw_registros` y se modela cuando aparezcan datos. | 0 |

> Los GET de lista ya devuelven todo el detalle anidado — **no hay endpoints de
> detalle por id** que haga falta consultar.

### 2.2 Escritura (catálogo para el CRM nuevo — NO se ejecuta desde el clon)

Extraído de `scraping/NewEndpoints/*.har` (secuencia de prueba con datos `test`).

| Endpoint | Métodos | Notas de shape |
|---|---|---|
| `clientes.php` | `POST` (201, body camelCase: `name, phone, fechaCumple, fechaCreacion, localidad, status, brands[], brand, model, tipo, budget, trans, yearMin, yearMax, notes, canal, tieneAutoEntrega, autosEntrega[], autoEntrega, interesCeroKm, ceroKm{}, creadoPor`) · `PUT` (200, body **snake_case** con `id`) · `DELETE ?id=` (200) | El POST devuelve `{ ok, data: { id } }`. `id` es string tipo `6c6jqbi7l2e6eb853`. |
| `vehiculos.php` | `POST` (201, JSON camelCase **o** `multipart/form-data` con fotos) · `PUT` (200) · `DELETE ?id=` (200) | Campos vistos en POST que **no** aparecían en el GET de junio: `localidad`, `consignacion`, `tipoConsignacion`, `origen`, `carpetaCompleta`, `carpetaConOficio`, `tieneIVA`. El CRM viejo evolucionó — la forma real actual se confirma en el primer sync en vivo. |
| `tareas.php` | `POST` (201, crear) · `POST` con `id` + `done` (actualizar; **no hay PUT**) · `DELETE ?id=` (200) | Body: `titulo, descripcion, fecha, clienteId, clienteNombre, clientePhone, asignadoA, done`. |
| `alertas.php` | `POST` (201) · `PUT` (200, ej. `{id, done}`) · `DELETE ?id=` (200) | Body POST: `tipo, titulo, descripcion, fecha, hora, asignadoA, refId, refName, refPhone`. |
| `peritaje.php` | `POST` (200, upsert por `vehiculoId`; body plano con los ~120 campos) | Devuelve `{ ok, data: { vehiculoId } }`. |
| `gestoria.php` | `POST` (200, upsert por `vehiculoId`) | Body: `{ vehiculoId, estado, items: { form08: {checked,fecha,obs,marcadoPor}, verificPolicial: {...}, multasNac: {...}, ... }, notas, fechaInicio, fechaCierre }`. |

El catálogo íntegro con ejemplos de request/response vividos va a
`docs/legacy-crm/endpoints.md` como entregable de la implementación.

---

## 3. Arquitectura

```
neifertcrm.com  (API PHP legacy)
      │  login + GET de los 9 endpoints
      ▼
 legacySync.js  (Node, sin Vite/Vercel; reusa patrón de crmCore.js)
      │  1· login (CRM_SYNC_USER/PASS), token cacheado por exp del JWT
      │  2· fetch de cada endpoint (retry + timeout)
      │  3· capa RAW      → append-only + dedupe por hash sha256
      │  4· capa NORMALIZADA → upsert por id legacy + borrado_en
      │  5· fotos nuevas  → descarga → R2 → guarda URL propia
      │  6· registra sync_runs
      ▼
 Supabase · proyecto existente · schema `crm_legacy`  (solo service-role)
      ├─ raw_registros      backup literal (jsonb + historial por hash)
      ├─ <normalizadas>     estado actual relacional
      └─ sync_runs          log de corridas
      ▲
 POST /api/crm/sync-legacy   ←  Vercel Cron cada 6 h  +  header CRON_SECRET
```

El módulo de sync sigue el mismo patrón que `src/server/crmCore.js` (lógica pura
Node reutilizable desde el plugin de dev y desde funciones serverless).

---

## 4. Componentes

| Archivo | Responsabilidad | Depende de |
|---|---|---|
| `supabase/crm_legacy_schema.sql` | Migración idempotente: `create schema`, tablas raw + normalizadas + `sync_runs`, índices, `revoke` a `anon`/`authenticated`. Corre en el SQL Editor de Supabase. | — |
| `src/server/legacyFetch.js` | `login()` + `fetchAll()` → `{ clientes, vehiculos, peritajes, gestoria, alertas, tareas, usuarios, jerarquia }`. Retry (3x, backoff), `AbortSignal.timeout`. Cache de token por `exp`. | `fetch` global |
| `src/server/legacyTransform.js` | Funciones **puras** `transformCliente(payload) → { cliente, intereses[], autosEntrega[] }`, `transformVehiculo`, `transformPeritaje`, `transformGestoria`, `transformAlerta`, `transformTarea`, `transformUsuario`. Sin I/O. | — |
| `src/server/legacyPhotos.js` | `syncFotosVehiculo(vehiculoId, imagenesApi[], supabase)`: diff contra `vehiculo_fotos.url_origen`, baja las nuevas, sube a R2 vía el flujo de `api/r2/presign.js`, devuelve filas para upsert. | R2, `legacyFetch` |
| `src/server/legacySync.js` | Orquestador `syncLegacyCrm({ ... }) → resumen`. Toma advisory lock, llama `fetchAll`, escribe raw, escribe normalizado, detecta borrados, dispara fotos, cierra `sync_runs`. | todos los de arriba, `@supabase/supabase-js` |
| `api/crm/sync-legacy.js` | Vercel Serverless Function. Valida `req.headers['authorization'] === 'Bearer ' + CRON_SECRET` (o header `x-cron-secret`), llama `syncLegacyCrm`, responde `{ ok, run }`. `POST` only. | `legacySync` |
| `src/plugins/crmProxy.js` | (extensión opcional) ruta `/api/crm/sync-legacy` también en `vite dev` para poder correrlo local. | `legacySync` |
| `vercel.json` | Agregar bloque `crons: [{ path: "/api/crm/sync-legacy", schedule: "0 */6 * * *" }]`. | — |
| `docs/legacy-crm/endpoints.md` | Catálogo de API (sección 2 expandida con ejemplos completos de los HAR). | — |
| `scripts/sync-legacy-local.mjs` | Runner CLI para la **primera** corrida (full + fotos) fuera del límite de 300 s de Vercel. Carga `.env`, llama `syncLegacyCrm`. | `legacySync` |
| `src/server/__tests__/legacyTransform.test.js` | Unit de cada `transformX` contra fixtures. | fixtures |
| `src/server/__tests__/legacySync.test.js` | Unit del orquestador con un cliente Supabase y un `fetchAll` mockeados: dedupe, borrados, idempotencia. | fixtures |
| `src/server/__tests__/fixtures/legacy/*.json` | Payloads reales extraídos de `scraping/Harfiles/neifert.har` (GET) y `scraping/NewEndpoints/*.har` (write). | — |

---

## 5. Modelo de datos — schema `crm_legacy`

Convenciones: nombres en español; `id` de las tablas normalizadas = **el id del
legacy** tal cual (string o int según la entidad); toda tabla normalizada lleva
`sync_run_id bigint` y `borrado_en timestamptz` (NULL = vigente). **Nunca se hace
`DELETE` de una fila.**

### 5.1 Capa raw — backup literal

```
raw_registros (
  entidad            text        not null,   -- 'clientes' | 'vehiculos' | 'peritaje' | 'gestoria' | 'alertas' | 'tareas' | 'usuarios' | 'jerarquia'
  id_legacy          text        not null,   -- id del registro en el CRM viejo (los usuarios usan su id int como texto)
  payload            jsonb       not null,   -- el objeto tal cual lo devolvió el GET
  hash               text        not null,   -- sha256 del JSON canónico de payload
  fetched_at         timestamptz not null default now(),
  sync_run_id        bigint      not null references crm_legacy.sync_runs(id),
  visto_ultimo_sync  boolean     not null default true,
  primary key (entidad, id_legacy, hash)
)
```

Regla de escritura: por cada registro del GET se calcula `hash`. Si
`(entidad, id_legacy, hash)` ya existe → no se inserta (el registro no cambió).
Si el hash es nuevo → `insert` (nueva versión histórica). Después de procesar una
entidad, `update raw_registros set visto_ultimo_sync = (id_legacy = any(:vistos))
where entidad = :entidad` para saber qué existía en el último sync.

Índice: `(entidad, id_legacy, fetched_at desc)`.

### 5.2 Capa normalizada — estado actual

**`usuarios`** — `id int pk`, `usuario text`, `nombre text`, `rol text`,
`sync_run_id`, `borrado_en`.

**`clientes`** — `id text pk`, `nombre`, `telefono`, `localidad`, `fecha_cumple date`,
`status text`, `canal text`, `presupuesto numeric`, `marca_interes`, `modelo_interes`,
`tipo_interes`, `trans_interes`, `anio_min int`, `anio_max int`, `notas text`,
`interes_cero_km boolean`, `cero_km jsonb`, `tiene_auto_entrega boolean`,
`creado_por`, `editado_por`, `fecha_creacion date`, `fecha_edicion date`,
`created_at timestamptz`, `updated_at timestamptz`, `venta_vehiculo_id text`,
`fecha_venta date`, `sync_run_id`, `borrado_en`.

**`cliente_intereses`** — `id bigserial pk`, `cliente_id text references clientes(id)`,
`marca text`, `modelo text`. (Del array `brands[]`.) Se reconstruye delete+insert
por `cliente_id` en cada sync.

**`cliente_autos_entrega`** — `id bigserial pk`, `cliente_id text references clientes(id)`,
`marca`, `modelo`, `version`, `anio int`, `km int`, `color`, `trans`, `notas`.
(Del array `autosEntrega[]`.) Reconstrucción delete+insert por `cliente_id`.
Nota de transform: en capturas viejas `autos_entrega` viene como **string JSON**;
en otras como array — el transform acepta ambos.

**`vehiculos`** — `id text pk`, `marca`, `modelo`, `version`, `patente`, `tipo`,
`anio int`, `km int`, `trans`, `color`, `moneda_contado text`, `precio_contado numeric`,
`moneda_canje text`, `precio_canje numeric`, `duenio_nombre`, `duenio_apellido`,
`duenio_contacto`, `itv text`, `itv_venc date`, `consignacion boolean`,
`tipo_consignacion text`, `origen text`, `carpeta_completa boolean`,
`carpeta_con_oficio boolean`, `carpeta_entregada boolean`, `tiene_iva boolean`,
`nota text`, `status text`, `creado_por`, `editado_por`, `fecha_creacion date`,
`fecha_edicion date`, `created_at timestamptz`, `updated_at timestamptz`,
`venta_cliente_id text`, `fecha_venta date`, `sync_run_id`, `borrado_en`.
Las columnas que hoy no aparecen en el GET (`consignacion`, `origen`, etc.) se
llenan si el GET en vivo las trae; si no, quedan NULL sin romper.

**`vehiculo_fotos`** — `id bigserial pk`, `vehiculo_id text references vehiculos(id)`,
`orden int`, `url_origen text`, `url_espejo text`, `bytes int`, `content_type text`,
`mirrored_at timestamptz`, `borrado_en timestamptz`. Se hace upsert por
`(vehiculo_id, url_origen)`; una foto que desaparece del API se marca `borrado_en`
pero **no** se borra de R2.
Nota: el GET de junio **no** expone fotos. El nombre/ubicación real del campo
(`imagenes`, `fotos`, o un endpoint aparte) se confirma en el primer sync en vivo;
`legacyPhotos.js` se adapta a lo que devuelva `vehiculos.php` hoy.

**`peritajes`** — `id int pk`, `vehiculo_id text references vehiculos(id)`,
`fecha_peritaje date`, `peritado_por text`, `resena_texto text`, `costo_total numeric`,
`secciones jsonb not null`, `created_at timestamptz`, `updated_at timestamptz`,
`sync_run_id`, `borrado_en`.
`secciones` guarda el blob plano completo (los ~120 campos). Solo se promueven a
columna los campos que se filtran/reportan. Razón: el blob evoluciona (jun-2026
tenía 5 secciones; ago-2026 agrega paneles de carrocería con % de daño y
"sección F"); modelar campo por campo sería frágil y de mantenimiento constante.

**`gestoria_tramites`** — `id int pk`, `vehiculo_id text references vehiculos(id)`,
`estado text`, `notas text`, `fecha_inicio date`, `fecha_cierre date`,
`items jsonb not null`, `created_at`, `updated_at`, `sync_run_id`, `borrado_en`.
`items` = `{ form08: {checked,fecha,obs,marcadoPor}, verif_policial: {...},
multas_nac, dominio_hist, libre_deudas, titulo, cedulas, identificacion, ... }`.
Además columnas booleanas espejo (`form08 boolean`, `verif_policial boolean`, …)
para los 8 ítems estándar, derivadas de `items.*.checked`, para poder filtrar sin
abrir el jsonb. Ítems no estándar viven solo en `items`.

**`alertas`** — `id text pk`, `tipo`, `titulo`, `descripcion`, `fecha date`,
`hora text`, `done boolean`, `ref_id text`, `ref_name text`, `ref_phone text`,
`creado_por`, `asignado_a`, `created_at timestamptz`, `updated_at timestamptz`,
`sync_run_id`, `borrado_en`.

**`tareas`** — `id text pk`, `titulo`, `descripcion`, `fecha date`, `done boolean`,
`cliente_id text`, `cliente_nombre text`, `cliente_phone text`, `asignado_a text`,
`created_at timestamptz`, `updated_at timestamptz`, `sync_run_id`, `borrado_en`.
`cliente_id` **no** lleva FK dura a `clientes` (puede referenciar un cliente ya
borrado en el legacy); se resuelve por join tolerante.

**`jerarquia`** — no se crea tabla todavía. Los datos van a `raw_registros`
(`entidad = 'jerarquia'`). Cuando haya contenido real se agrega la tabla en una
migración posterior y se backfillea desde raw.

### 5.3 Operativa

**`sync_runs`** — `id bigserial pk`, `iniciado_en timestamptz not null default now()`,
`terminado_en timestamptz`, `estado text not null default 'corriendo'`
(`'corriendo'` | `'ok'` | `'error'`), `disparado_por text` (`'cron'` | `'manual'`),
`filas_por_entidad jsonb` (`{ clientes: { leidos, nuevos_raw, upserts, borrados }, ... }`),
`fotos_bajadas int default 0`, `error text`.

### 5.4 Permisos

```
revoke all on all tables    in schema crm_legacy from anon, authenticated;
revoke all on all sequences  in schema crm_legacy from anon, authenticated;
revoke all on all functions  in schema crm_legacy from anon, authenticated;
alter default privileges in schema crm_legacy revoke all on tables from anon, authenticated;
```

El schema no se agrega a `search_path` de PostgREST (`Settings → API → Exposed
schemas`), así que no es alcanzable por el cliente Supabase con anon/auth key.
Solo la service-role key (que usa el sync) y el SQL Editor lo tocan.

---

## 6. Flujo de sync (`syncLegacyCrm`)

1. `pg_try_advisory_lock(<clave fija>)`. Si no se obtiene → salir con
   `{ ok: false, skipped: 'lock' }` (otra corrida en curso).
2. `insert into sync_runs (disparado_por) values (:origen) returning id`.
3. `login()` → token. Si falla → `sync_runs.estado = 'error'`, `error = ...`,
   liberar lock, salir.
4. `fetchAll()` — GET de los 9 endpoints en paralelo con `Promise.allSettled`.
   Cada endpoint que rechaza se anota; los demás siguen.
5. Por entidad con datos:
   a. **Raw:** calcular `hash` por registro; `insert ... on conflict do nothing`
      sobre `(entidad, id_legacy, hash)`. Contar `nuevos_raw`.
   b. **Normalizada:** `transformX` → filas; `upsert` por `id`
      (`on conflict (id) do update`). Contar `upserts`.
   c. **Hijos** (`cliente_intereses`, `cliente_autos_entrega`, `vehiculo_fotos`):
      `delete where <parent>_id = any(:ids_de_este_sync)` + `insert`.
   d. **Borrados:** `update <tabla> set borrado_en = now(), sync_run_id = :run
      where borrado_en is null and id <> all(:ids_vistos)`. Contar `borrados`.
   e. `update raw_registros set visto_ultimo_sync = (id_legacy = any(:vistos))
      where entidad = :entidad`.
6. **Fotos:** para cada vehículo vigente, `syncFotosVehiculo`. Se ejecuta después
   de que `vehiculos` esté escrito. Errores por foto no abortan la corrida.
7. `update sync_runs set terminado_en = now(),
   estado = (hubo_errores ? 'error' : 'ok'), filas_por_entidad = :resumen,
   fotos_bajadas = :n, error = :errs`.
8. Liberar advisory lock. Devolver el resumen.

**Idempotencia:** correr el sync dos veces seguidas sin cambios en el legacy no
inserta filas raw nuevas, no cambia `updated_at` de la normalizada más allá del
`upsert` (que reescribe el mismo valor), y no marca borrados.

---

## 7. Manejo de errores

| Falla | Comportamiento |
|---|---|
| Un endpoint GET rechaza | Se anota en `sync_runs.error` (concatenado), se procesan los demás, corrida cierra `estado = 'error'`. Lo que sí se trajo se persiste. |
| `login.php` falla | Aborta toda la corrida. `sync_runs.estado = 'error'`. Lock liberado. |
| Foto no baja / R2 falla | Se loguea, `vehiculo_fotos.url_espejo` queda NULL, se reintenta el próximo sync. No aborta. |
| Timeout de Vercel (300 s) | La **primera** corrida (full: ~350 registros + ~200 fotos) se corre con `scripts/sync-legacy-local.mjs`. Las corridas incrementales del cron son chicas (solo diffs + fotos nuevas). Si aun así se acerca al límite, el sync de fotos se paginará: N vehículos por corrida, marcados con `mirrored_at` viejo o NULL. |
| Dos corridas solapadas | La segunda no obtiene el advisory lock y sale sin hacer nada. |
| Payload con forma inesperada | `transformX` es defensivo: campos ausentes → NULL, tipos raros → se castea o se deja el crudo en raw. El raw siempre se guarda aunque el transform falle; un transform que tira excepción se anota por-registro y no frena la entidad. |

---

## 8. Testing

**Fixtures** (`src/server/__tests__/fixtures/legacy/`): extraídas una vez de
`scraping/Harfiles/neifert.har` (shapes GET) y `scraping/NewEndpoints/*.har`
(shapes de escritura), guardadas como JSON individuales por entidad, incluyendo
casos borde reales: `clientes` con `autos_entrega` como string y como array,
`vehiculo` con y sin peritaje anidado, `peritaje` de jun (5 secciones) y de ago
(con carrocería + sección F), `gestoria` con ítems parciales.

**Unit — `legacyTransform.test.js`:**
- cada `transformX(payload)` produce la fila normalizada esperada;
- `null` / `""` / `0` se distinguen correctamente (ej. `precio_contado: null` vs `0`);
- `autos_entrega` string JSON y array dan el mismo resultado;
- `gestoria.items.*.checked` → columnas booleanas espejo correctas;
- `peritaje` conserva el 100 % de las claves en `secciones`.

**Unit — `legacySync.test.js`** (con `fetchAll` y cliente Supabase mockeados):
- primer sync: inserta raw + normalizado, `sync_runs.estado = 'ok'`;
- segundo sync sin cambios: 0 inserts en raw, 0 borrados (idempotencia);
- registro que cambia un campo: 1 insert raw nuevo, 1 upsert, mismo `id`;
- registro que desaparece: `borrado_en` seteado, raw intacto, `visto_ultimo_sync = false`;
- endpoint que rechaza: las otras entidades se procesan, `estado = 'error'`.

**Integración (opcional, detrás de `RUN_LEGACY_INTEGRATION=1`):**
`syncLegacyCrm` real contra un proyecto Supabase de prueba y el CRM legacy real.

---

## 9. Configuración y seguridad

**Variables de entorno:**
- Nueva: `CRON_SECRET` — string aleatorio; el cron de Vercel lo manda como
  `Authorization: Bearer <CRON_SECRET>`, la función lo compara.
- Reusadas: `CRM_SYNC_USER`, `CRM_SYNC_PASS`, `VITE_SUPABASE_URL`,
  `SUPABASE_SERVICE_ROLE_KEY`, y las credenciales de R2 ya presentes en `.env`.

**PII:** `clientes` y `tareas` tienen nombres y teléfonos. Todo queda dentro del
proyecto Supabase existente, en un schema sin acceso `anon`/`authenticated`, no
expuesto por PostgREST. Ninguna ruta pública lo lee.

**`vercel.json`:** `schedule: "0 */6 * * *"` (00, 06, 12, 18 UTC). Ajustable.

---

## 10. Fuera de alcance (YAGNI)

- Escribir de vuelta al CRM viejo — el clon es estrictamente de lectura.
- El CRM nuevo en sí: UI, autenticación, lógica de negocio, reglas de permisos.
- Migrar el sitio público (`public.*`) a este schema o unificar modelos.
- Reconciliación bidireccional o resolución de conflictos entre clon y legacy.
- Modelar `jerarquia` hasta que devuelva datos.
- Dashboards / reportes sobre el clon (se harán desde el CRM nuevo).

---

## 11. Entregables

1. `supabase/crm_legacy_schema.sql` aplicado en Supabase.
2. Módulos `src/server/legacy*.js` con tests en verde.
3. `api/crm/sync-legacy.js` + entrada de cron en `vercel.json`.
4. `scripts/sync-legacy-local.mjs` y primera corrida full ejecutada.
5. `docs/legacy-crm/endpoints.md` — catálogo completo de endpoints.
6. `.env.example` actualizado con `CRON_SECRET`.
