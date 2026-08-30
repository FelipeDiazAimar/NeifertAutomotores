# CRM legacy (neifertcrm.com) — catálogo de endpoints

**Base:** `https://neifertcrm.com/backend/api`
**Auth:** `POST /auth/login.php` → `{ ok, data: { token, nombre, role } }`; el resto de las llamadas van con `Authorization: Bearer <token>`.
**Fuente:** HARs en `scraping/Harfiles/` (lectura) y `scraping/NewEndpoints/` (escritura). Regenerar ejemplos con `node scripts/dump-legacy-har-shapes.mjs`.
**Envoltura común de respuesta:** `{ "ok": boolean, "data": <payload> | null, "error"?: string }`.

> Marcas **[confirmar en sync]**: la captura de lectura es de mediados de 2026 y el
> CRM viejo evolucionó (los bodies de escritura traen campos que el GET viejo no
> mostraba). La forma real vigente se fija en la primera corrida de
> `npm run sync:legacy`, que guarda el JSON crudo en `crm_legacy.raw_registros`.

---

## Autenticación

### POST /auth/login.php
Request: `{ "user": "<usuario>", "pass": "<contraseña>" }`
Response 200: `{ "ok": true, "data": { "token": "<JWT>", "nombre": "Bruno", "role": "vendedor" } }`
Response 401: `{ "ok": false, "error": "..." }`
El `token` es un JWT HS256 con payload `{ id, user, nombre, role, exp }`. No verificamos la firma; solo leemos `exp` para cachear el token (ver `src/server/crmCore.js`).

---

## Lectura (fuente del clon)

Todos son `GET`, sin query string, devuelven `{ ok, data: [...] }`. Los GET de
lista ya traen el detalle anidado — no hay endpoints de detalle por id.

### GET /clientes.php  → `crm_legacy.clientes` (+ `cliente_intereses`, `cliente_autos_entrega`)
Cartera completa de clientes/leads del panel interno. Campos observados por registro:

| Campo | Tipo | Nota |
|---|---|---|
| `id` | string | ej. `6bnpp6ikab873c167` |
| `name` | string | |
| `phone` | string | |
| `fecha_cumple` | date \| null | |
| `status` | string | `activo`, `vendido`, … |
| `canal` | string | `salon`, `ya_cliente`, `whatsapp`, … (solo panel interno) |
| `brand` / `model` / `tipo` / `trans` | string \| null | interés principal |
| `budget` | number \| null | |
| `year_min` / `year_max` | int \| null | |
| `notes` | string \| null | |
| `interes_cero_km` | 0/1 | |
| `cero_km` | objeto \| null | `{ brand, model, version, budget, trans, color, notas }` |
| `tiene_auto_entrega` | 0/1 | |
| `autos_entrega` | **string JSON** \| array | `[{brand,model,version,year,km,color,trans,notas}]` — el transform acepta ambos |
| `brands` | array | `[{ marca, modelo }]` → `cliente_intereses` |
| `creado_por` / `editado_por` | string \| null | |
| `fecha_creacion` / `fecha_edicion` | date \| null | |
| `created_at` / `updated_at` | timestamp | |
| `venta_car_id` | string \| null | vehículo con el que se cerró |
| `fecha_venta` | date \| null | |
| `localidad` | string | **[confirmar en sync]** aparece en el POST, no en el GET viejo |

El GET viejo además duplica varios campos en camelCase (`tieneAutoEntrega`,
`autosEntrega`, `autoEntrega`, `creadoPor`, …); el transform lee snake_case y
camelCase indistintamente.

### GET /vehiculos.php  → `crm_legacy.vehiculos` (+ `vehiculo_fotos`)
Inventario. Campos: `id` (string), `brand`, `model`, `version`, `patente`,
`tipo`, `year`, `km`, `trans`, `color`, `moneda_contado` (`ARS`/`USD`),
`precio_contado`, `moneda_canje`, `precio_canje`, `duenio_nombre`,
`duenio_apellido`, `duenio_contacto`, `itv` (`si`/`no`), `itv_venc`,
`carpeta_entregada` (0/1), `nota`, `status` (`disponible`, `reservado`,
`vendido`), `creado_por`, `editado_por`, `fecha_creacion`, `fecha_edicion`,
`created_at`, `updated_at`, `venta_cliente_id`, `fecha_venta`, `peritaje` (array
anidado — se ignora acá; se toma de `/peritaje.php`).

**[confirmar en sync]** campos vistos solo en el POST: `consignacion`,
`tipoConsignacion`, `origen`, `carpetaCompleta`, `carpetaConOficio`, `tieneIVA`.

**Fotos — [confirmar en sync]:** el GET de la captura vieja **no** expone
imágenes. El POST de alta acepta `multipart/form-data` con archivos. En la
primera corrida hay que verificar bajo qué clave vienen las URLs de las fotos en
el GET vigente (`imagenes`, `fotos`, `images`, o un endpoint aparte).
`src/server/legacyTransform.js::extractImagenes` ya prueba las tres primeras.

### GET /peritaje.php  → `crm_legacy.peritajes`
Peritajes por vehículo. En la captura vieja viene con secciones anidadas
`sec_a`…`sec_e` (motor / rodante / electrónica / accesorios / tapizados) más
`carroceria`, `observaciones`, `peritado_por`, `fecha_peritaje`, `created_at`,
`updated_at`, `id` (int), `vehiculo_id` (string).
El POST vigente manda **todo plano** (~120 campos) e incluye paneles de
carrocería con % de daño (`dañoCapo`, `pctCapo`, `dañoPuertaDelIzq`, …) y una
"sección F" de historial (`fHistorialServicios`, `fCorreaDistrib`,
`fPrimerDuenio`, `fParabrisas`, …).
El clon guarda el blob entero en `peritajes.secciones` (jsonb) y solo promueve a
columna: `vehiculo_id`, `fecha_peritaje`, `peritado_por` (`peritador`),
`resena_texto`, `costo_total`.

### GET /gestoria.php  → `crm_legacy.gestoria_tramites`
Trámites por vehículo. Captura vieja (formato plano): `id` (int), `vehiculo_id`,
`estado` (`en_proceso`, …), `notas`, `fecha_inicio`, `fecha_cierre`,
`created_at`, `updated_at`, y por cada ítem estándar tres columnas
`<item>`, `<item>_fecha`, `<item>_nota` con `<item>` ∈
`form08, verif_policial, multas_nac, dominio_hist, libre_deudas, titulo,
cedulas, identificacion`.
El POST vigente usa `items: { form08: {checked,fecha,obs,marcadoPor},
verificPolicial: {...}, multasNac: {...}, … }`.
El clon normaliza a `items` (jsonb, un objeto por slug) + una columna booleana
espejo por ítem estándar.

### GET /alertas.php  → `crm_legacy.alertas`
`id` (string), `tipo` (`general`, …), `titulo`, `descripcion`, `fecha`, `hora`,
`done` (0/1), `ref_id`, `ref_phone`, `ref_name`, `creado_por`, `asignado_a`,
`created_at`, `updated_at`.

### GET /tareas.php  → `crm_legacy.tareas`
Vacío en las capturas. Forma derivada del POST + convención: `id` (string),
`titulo`, `descripcion`, `fecha`, `done` (0/1), `cliente_id`, `cliente_nombre`,
`cliente_phone`, `asignado_a`, `created_at`, `updated_at`. **[confirmar en sync]**

### GET /usuarios.php  → `crm_legacy.usuarios`
`{ id (int), user, nombre, role }`. En la captura: Bruno/Cristian(admin)/Juani/
Nico/Valeria(role vacío)/Victor.

### GET /jerarquia.php  → solo `crm_legacy.raw_registros` (entidad `jerarquia`)
Vacío en todas las capturas. Forma desconocida. El clon lo aterriza crudo en
`raw_registros` y se modela cuando devuelva datos.

---

## Escritura (catálogo para el CRM nuevo — el clon NO ejecuta nada de esto)

Todas devuelven la envoltura `{ ok, data, error? }`. El id que generan es un
string tipo `6c6jqbi7l2e6eb853` (clientes/vehículos/alertas/tareas) o el
`vehiculoId` como clave natural (peritaje/gestoría).

### clientes.php
- **POST** (201) — crear. Body camelCase:
  `{ name, phone, fechaCumple, fechaCreacion, localidad, status, brands[],
  brand, model, tipo, budget, trans, yearMin, yearMax, notes, canal,
  tieneAutoEntrega, autosEntrega[], autoEntrega, interesCeroKm, ceroKm{},
  creadoPor }`. Respuesta: `{ ok: true, data: { id } }`.
- **PUT** (200) — actualizar. Body **snake_case**, incluye `id` y todos los
  campos del registro (`name, phone, fecha_cumple, status, brand, …,
  tiene_auto_entrega, ae_brand, ae_model, …`).
- **DELETE** `?id=<id>` (200) — `{ ok: true, data: null }`.

### vehiculos.php
- **POST** (201) — crear. Acepta `application/json` (camelCase:
  `{ brand, model, version, patente, tipo, year, km, trans, color,
  monedaContado, precioContado, monedaCanje, precioCanje, duenioNombre,
  duenioApellido, duenioContacto, itv, itvVenc, consignacion,
  tipoConsignacion, origen, carpetaCompleta, carpetaConOficio, tieneIVA, nota,
  status }`) **o** `multipart/form-data` con los mismos campos + archivos de
  foto.
- **PUT** (200) — actualizar. Body con `id` + campos (se vieron tanto camelCase
  como snake_case en distintas llamadas).
- **DELETE** `?id=<id>` (200).

### tareas.php
- **POST** (201) — crear: `{ titulo, descripcion, fecha, clienteId,
  clienteNombre, clientePhone, asignadoA }`.
- **POST** (201) con `id` — actualizar (no hay PUT): mismo body + `id` + `done`.
- **DELETE** `?id=<id>` (200).

### alertas.php
- **POST** (201) — crear: `{ tipo, titulo, descripcion, fecha, hora, asignadoA,
  refId, refName, refPhone }`.
- **PUT** (200) — actualización parcial, ej. `{ id, done: 1 }` / `{ id, done: 0 }`.
- **DELETE** `?id=<id>` (200).

### peritaje.php
- **POST** (200) — upsert por `vehiculoId`. Body plano con los ~120 campos
  (secciones motor/rodante/electrónica/accesorios/tapizados + carrocería con
  `daño*`/`pct*` + sección F historial + `peritador`, `resenaTexto`,
  `fechaPeritaje`, `costoTotal`, …). Respuesta: `{ ok: true, data: { vehiculoId } }`.

### gestoria.php
- **POST** (200) — upsert por `vehiculoId`. Body:
  `{ vehiculoId, estado, items: { form08: {checked,fecha,obs,marcadoPor},
  verificPolicial: {...}, multasNac: {...}, … }, notas, fechaInicio,
  fechaCierre }`. Respuesta: `{ ok: true, data: { vehiculoId } }`.

---

## Mapa endpoint → tablas del clon

| Endpoint | Tabla(s) `crm_legacy` |
|---|---|
| `clientes.php` | `clientes`, `cliente_intereses`, `cliente_autos_entrega` |
| `vehiculos.php` | `vehiculos`, `vehiculo_fotos` |
| `peritaje.php` | `peritajes` |
| `gestoria.php` | `gestoria_tramites` |
| `alertas.php` | `alertas` |
| `tareas.php` | `tareas` |
| `usuarios.php` | `usuarios` |
| `jerarquia.php` | `raw_registros` (solo crudo) |
| todos | `raw_registros` (copia literal) + `sync_runs` (log de corrida) |
