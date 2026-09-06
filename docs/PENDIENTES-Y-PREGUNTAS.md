# Pendientes y preguntas — sesión 2026-08-31 (noche)

Dejo acá lo que hice y lo que necesito que me confirmes para cerrar bien los KPIs.

---

## 1. Lo que quedó terminado y verificado (tests + lint en verde)

### CRM · página de detalle de cliente (`/crm/clientes/:id`)
- **Eliminar cliente**: ahora cualquier usuario del CRM puede borrar (antes solo admin).
  - Front: el botón "Eliminar" (con modal de confirmación) se muestra siempre.
  - RLS: `supabase/crm_clientes_schema.sql` → política `clientes_delete` pasó de
    `crm.mi_rol() = 'admin'` a `crm.es_usuario()`.
  - ⚠️ **Acción tuya**: correr de nuevo `supabase/crm_clientes_schema.sql` en Supabase
    (solo recrea esa política; es idempotente).
- **Navegación por secciones en vez de pestañas**: Datos, Intereses, Autos en entrega,
  Seguimiento, Tareas, Historial ahora son secciones apiladas en una sola página.
  La barra de navegación (sticky arriba) hace scroll suave a cada sección
  (usa Lenis si está, si no `scrollIntoView`).

### CRM · Oportunidades de venta (`/crm`)
- 2 columnas en desktop (antes 1).
- Botón de **WhatsApp** por cliente además de "Detalle" (link `api.whatsapp.com/send/…`
  con saludo "Hola <nombre>! Te contactamos desde NEIFERT Automotores. ¿Cómo estás?").
  Solo aparece si el cliente tiene teléfono cargado.
- "Detalle" ahora es un botón visible (variante glass + icono), antes era texto tenue.
- **Modal de detalle de compatibilidad**: solo muestra los criterios que el cliente
  definió (Marca/Modelo/Tipo/Año/Presupuesto). Los vacíos ya no aparecen.
  Botón de WhatsApp + Cerrar en el pie.

### CRM · filtros (`/crm/clientes`, `/crm/tareas`)
- Popover del `Select` ya no se ve transparente/solapado (bug de cascada de Tailwind v4
  en `.glass.glass-popover`, en `src/styles/index.css`).
- Filtros en 3 columnas.

### CRM · gráfico "Marcas más pedidas"
- Muestra top 6 y cada barra en una gama del rojo Neifert (de más intenso a más claro).

### CRM · alta de vehículo (`/crm/vehiculos`)
- Modal en vez de ruta aparte; bloquea scroll de fondo (Lenis) y scrollea dentro.
- Campos Marca/Modelo/Versión/Tipo/Color/Origen/Tipo de consignación como
  "select escribible": ofrecen lo ya usado y guardan valores nuevos.
  - ⚠️ **Acción tuya**: correr `supabase/crm_schema.sql` (agrega tabla
    `crm.opciones_campo` + RLS). Hasta entonces funciona con los valores
    derivados de los vehículos existentes.

---

## 2. KPI "N veh. vendidos" (subtítulo de "Alertas activas")

**Síntoma**: legacy dice "2 veh. vendidos", el nuevo "0".

**Causa encontrada**: la migración `supabase/crm_migracion.sql` NO copiaba
`fecha_venta` (ni `venta_cliente_id`) a `crm.vehiculos`. El KPI cuenta
`vehiculos con estado='vendido' y fecha_venta en el mes actual`; como `fecha_venta`
quedaba `NULL` en todos los migrados, contaba 0.

**Arreglado (no hardcodeado)**:
- `crm_migracion.sql`: ahora migra `v.fecha_venta` → `crm.vehiculos.fecha_venta`
  (en el insert y en el `on conflict do update`). También le agregué `trim()` al
  mapeo de `status` (antes un `'disponible '` con espacio caía en `'baja'`).
- `crm_clientes_migracion.sql`: al final completa
  `crm.vehiculos.venta_cliente_id` con el enlace recíproco (los clientes ya traen
  `venta_vehiculo_id`).
- Las ventas registradas desde el CRM nuevo ya seteaban `fecha_venta` bien; esto
  era solo el histórico migrado.

**Acción tuya**: ~~re-correr en Supabase~~ — **YA LO CORRÍ yo (2026-09-06)**.
`crm.migrar_desde_legacy()` y `crm.migrar_clientes_desde_legacy()` no son
archivos: son **funciones** que se definen dentro de `supabase/crm_migracion.sql`
y `supabase/crm_clientes_migracion.sql` y se llaman con `select ...()` (o con
`scripts/migrate-legacy-to-crm.mjs` / `scripts/migrate-clientes-to-crm.mjs`, que
además migra peritajes). Resultado: vehiculos 60, gestoria 13, clientes 175,
intereses 27, autos_entrega 125, peritajes 10.

**⚠️ Hallazgo — la migración está OK pero el origen no tiene datos de venta:**
`crm_legacy.vehiculos.fecha_venta` está en **NULL para los 2 autos vendidos**
(y `venta_cliente_id` también). El CRM viejo **no guarda la fecha de venta**;
su pantalla muestra simplemente `count(status='vendido')` = 2, sin filtro de
fecha. Por eso el KPI nuevo (que filtra por mes) da 0 y **seguirá en 0** con los
datos migrados hasta que registres una venta desde el CRM nuevo.

**Pregunta 1 (revisada)**: ya sé que el viejo NO usa fecha. ¿Qué querés que
muestre el nuevo?
- **(a)** contar todos los `estado='vendido'` sin fecha (imita exacto al viejo → mostraría 2), o
- **(b)** mantener "vendidos del mes" (más útil a futuro, pero hoy da 0 porque el histórico no trae fechas).
Cambio de 1 línea en `dashboard.service.js` en cualquier caso.

---

## 3. KPI "Valor del stock" — RESUELTO (no era bug)

Verifiqué contra la base después de migrar. Los números del nuevo son **idénticos**
al legacy actual:

| | ARS (53 autos) | USD (5 autos) | suma cruda (sin mirar moneda) |
|---|---|---|---|
| `crm_legacy.vehiculos` disponibles | $812.056.300 | US$54.000 | $812.110.300 |
| `crm.vehiculos` disponibles (migrado) | $812.056.300 | US$54.000 | $812.110.300 |

- El `$812.132.300` del screenshot es de **otro momento** — el stock del viejo
  cambió desde que lo sacaste (±22k). No hay ninguna fuga de vehículos.
- El viejo muestra **una sola cifra** porque suma `precio_contado` **ignorando
  `moneda_contado`**: mete los US$54.000 como si fueran pesos. El nuevo separa
  ARS y USD, que es lo correcto.
- Los 5 autos en USD suman US$54.000 (prom. US$10.800 c/u) — precios reales en
  dólares, no un error de carga.

**Única decisión de producto (Pregunta 2)**: ¿el KPI del nuevo se queda con
**ARS + USD separado** (recomendado, es lo honesto), o querés **una sola cifra**?
Para una sola cifra hay que convertir USD→ARS con una cotización, y hoy no hay
cotización real en el sistema (`DOLAR=1000` en `compatibilidad.js` es placeholder).
Si querés cifra única decime de dónde sale la cotización (¿la cargás a mano en una
tabla de settings?).

`status` del CRM viejo (confirmado en `crm_legacy.vehiculos`): sólo se usan
**`disponible` (58)** y **`vendido` (2)**. No hay reservado/pausado/otros → el
mapeo de la migración está bien, no hay fuga por `status`.

---

## 4. SQL de esquema — TODO APLICADO (2026-09-06)

| Archivo | Qué cambió | Estado |
|---|---|---|
| `supabase/crm_roles_schema.sql` | `dueno` + `crm.roles` + `vistas_override` | ✅ aplicado |
| `supabase/crm_schema.sql` | tabla `crm.opciones_campo` + RLS | ✅ aplicado |
| `supabase/crm_clientes_schema.sql` | política `clientes_delete` (cualquier usuario) | ✅ aplicado |
| `supabase/crm_migracion.sql` | migra `fecha_venta`; `trim()` en status | ✅ función redefinida + corrida |
| `supabase/crm_clientes_migracion.sql` | backfill `venta_cliente_id` | ✅ función redefinida + corrida |
| `scripts/migrate-legacy-to-crm.mjs` | peritajes (resumen en JS) | ✅ corrido (10 peritajes) |

Ninguno borra datos. Todo idempotente por `id_legacy`.
