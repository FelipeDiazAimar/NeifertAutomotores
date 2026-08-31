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

**Acción tuya**: re-correr en Supabase, en este orden:
1. `select crm.migrar_desde_legacy();`
2. `select crm.migrar_clientes_desde_legacy();`

**Pregunta 1**: ¿el "N veh. vendidos" del legacy es del **mes calendario actual**
(1 al último día del mes) o de los **últimos 30 días**? Lo dejé como mes calendario
(lo que decía el spec). Si es otra cosa, decímelo y lo ajusto.

---

## 3. KPI "Valor del stock"  ← necesito tu ayuda acá

**Síntoma**:
- Legacy: `$812.132.300` (una sola cifra, etiqueta "disponible").
- Nuevo: `$ 812.056.300` + `US$ 54.000` (separa ARS y USD).

Diferencias: (a) el nuevo separa monedas; (b) la parte ARS no coincide
(≈ 76.000 de diferencia) y encima hay 54.000 en USD que el legacy no muestra aparte.

Cómo lo calcula hoy el nuevo (`src/crm/services/dashboard.service.js` → `kpis()`):
`suma de precio_contado de vehículos con estado='disponible' y no archivados,
agrupado por moneda`. No hay nada hardcodeado, pero necesito saber qué hace el legacy:

**Pregunta 2**: en el CRM viejo, "Valor del stock" ¿suma solo los vehículos
**disponibles**, o también los **reservados**?

**Pregunta 3**: ¿el viejo guarda todos los precios en pesos (aunque el auto se
publique en USD) y por eso muestra una sola cifra? ¿O directamente suma el número
de `precio_contado` sin mirar la moneda?
- Si es "todo en una cifra": ¿querés que el nuevo muestre **una sola cifra**
  también? Para eso habría que convertir los USD a ARS con una cotización.
  Hoy no hay una cotización real en el sistema (hay una constante `DOLAR = 1000`
  en `compatibilidad.js` que es un placeholder). Opciones:
  - a) Dejar ARS y USD separados como está (más honesto, sin inventar cotización).
  - b) Cargar una cotización configurable (¿dónde la actualizás? ¿a mano en una
    tabla de settings?) y mostrar una sola cifra en ARS equivalente.
  - c) Sumar los números sin mirar moneda, como (aparentemente) hace el viejo
    (rápido, pero mezcla peras con manzanas).

**Pregunta 4**: ¿me pasás 2–3 patentes/IDs de autos que el viejo cuenta como stock
y el nuevo no (o al revés)? Con eso ubico si es un tema de `estado` mal mapeado
en la migración o de qué vehículos entran.

**Pregunta 5**: ¿qué valores de `status` usa el CRM viejo para los vehículos?
(ej: "Disponible", "Reservado", "Vendido", "Publicado", "Pausado", "Entregado"…).
La migración hoy solo reconoce `disponible / reservado / vendido` y todo lo demás
lo manda a `baja` (que no cuenta como stock). Si el viejo usa otros nombres para
autos que siguen en el lote, ahí está la fuga.

---

## 4. Otros archivos de schema tocados esta sesión (para re-correr en Supabase)

| Archivo | Qué cambió | Idempotente |
|---|---|---|
| `supabase/crm_schema.sql` | tabla `crm.opciones_campo` + RLS | sí |
| `supabase/crm_clientes_schema.sql` | política `clientes_delete` (cualquier usuario) | sí |
| `supabase/crm_migracion.sql` | migra `fecha_venta`; `trim()` en status | sí (re-correr la función) |
| `supabase/crm_clientes_migracion.sql` | backfill `venta_cliente_id` | sí (re-correr la función) |

Ninguno borra datos.
