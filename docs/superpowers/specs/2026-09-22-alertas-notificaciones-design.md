# Alertas con notificaciones (push + email) — Diseño

**Fecha:** 2026-09-22
**Estado:** Aprobado por el usuario para pasar a plan de implementación.

## Contexto

El CRM nuevo no tiene ningún concepto real de "alertas" — el número
"Alertas activas" del Panel en realidad cuenta tareas pendientes
(`crm.tareas`), no vencimientos. El CRM viejo sí tenía un concepto propio de
alerta (`crm_legacy.alertas`: título, descripción, fecha, hora, a quién está
asignada, referencia opcional a cliente/vehículo) que nunca se migró ni se
reconstruyó del lado nuevo.

El pedido: recrear ese concepto de alerta en el CRM nuevo, y sumarle avisos
automáticos — notificación de escritorio (navegador) y email — antes de que
venza cada alerta. Todo con herramientas gratuitas, sin cuentas de email ni
servicios ya vinculados.

## Requisitos acordados con el usuario

- Alertas de carga manual (no derivadas automáticamente de ITV u otro campo):
  título, descripción opcional, fecha + hora, empleado asignado, y
  opcionalmente un cliente o vehículo de referencia.
- Aviso por **dos canales**: notificación de escritorio del navegador (Web
  Push) y **email** (Resend, cuenta ya creada, API key provista).
- Momentos de aviso: **el día anterior a la misma hora** que la alerta, y
  **el mismo día, 3 horas antes**. Dos avisos fijos por alerta (no se repite
  después, no es un recordatorio continuo).
- El disparo debe ser preciso (ventana de ~15-30 min), no basta con el cron
  diario de Vercel (límite del plan Hobby: 1 corrida/día). Se usa un
  disparador externo gratuito, **cron-job.org**, pegándole a un endpoint del
  CRM cada 15-30 min.
- Hace falta un email real por empleado (hoy solo tienen un email sintético
  interno para el login) — se agrega un campo editable en Admin → Usuarios.
- El dominio `neifertautomotores.com` está comprado en Vercel; el usuario
  tiene acceso a su DNS ahí, así que se puede verificar en Resend para
  mandar desde `alertas@neifertautomotores.com` a la casilla real de cada
  empleado (sin verificar dominio, Resend solo deja mandar a la casilla
  dueña de la cuenta).

## Modelo de datos

### `crm.alertas` (tabla nueva)

```sql
create table if not exists crm.alertas (
  id              bigserial primary key,
  titulo          text not null,
  descripcion     text,
  fecha           date not null,
  hora            time not null,
  asignado_a      uuid not null references crm.usuarios(id),
  cliente_id      uuid references crm.clientes(id) on delete set null,
  vehiculo_id     uuid references crm.vehiculos(id) on delete set null,
  hecha           boolean not null default false,
  notificado_24h  boolean not null default false,
  notificado_3h   boolean not null default false,
  creado_por      uuid references crm.usuarios(id),
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now()
);
create index if not exists idx_crm_alertas_asignado on crm.alertas(asignado_a, hecha);
create index if not exists idx_crm_alertas_pendientes
  on crm.alertas(fecha, hora) where not hecha;
```

RLS: mismo criterio que `crm.tareas`/`crm.clientes` — cualquier usuario CRM
activo puede leer/escribir (no hay noción de "alerta privada" por ahora).

### `crm.usuarios` — nuevo campo `email`

```sql
alter table crm.usuarios add column if not exists email text;
```

Editable desde `UsuarioRow.jsx` (Admin → Usuarios), junto a Rol/Vistas. Sin
email cargado, ese usuario sigue recibiendo la notificación de escritorio
(si aceptó el permiso) pero no el email.

### `crm.push_subscriptions` (tabla nueva, para Web Push)

```sql
create table if not exists crm.push_subscriptions (
  id          bigserial primary key,
  usuario_id  uuid not null references crm.usuarios(id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  creado_en   timestamptz not null default now()
);
```

Un usuario puede tener más de una suscripción (varios navegadores/PCs). Se
manda el push a todas las suscripciones activas de su `usuario_id`.

## Flujo de notificación

1. Al cargar una alerta, el asignado ve un botón **"Activar notificaciones
   de escritorio"** (si su navegador no tiene ya una suscripción activa).
   Al tocarlo, el navegador pide permiso, y si lo acepta, el service worker
   se suscribe y la suscripción se guarda en `crm.push_subscriptions`.
2. **cron-job.org** llama a `GET/POST /api/crm/check-alertas` cada 15-30 min,
   con `Authorization: Bearer <CRON_SECRET>` (mismo patrón que
   `/api/crm/sync-legacy`, incluyendo aceptar GET — ya nos mordió una vez
   que Vercel Cron pega por GET y el endpoint solo aceptaba POST).
3. El endpoint calcula, para cada alerta no `hecha`:
   - `aviso_24h = fecha+hora - 24h`
   - `aviso_3h  = fecha+hora - 3h`
   Si `now()` ya pasó ese momento y el flag correspondiente (`notificado_24h`
   / `notificado_3h`) sigue en `false`, dispara el aviso y lo marca en
   `true`. Al estar acotado por el propio flag, no importa que la corrida se
   solape un poco con la ventana anterior — nunca se manda dos veces el
   mismo aviso.
4. Envío:
   - **Push**: `web-push` (librería npm, gratis, usa VAPID — un par de
     claves que se genera una sola vez, sin servicio de terceros) a cada
     suscripción de `asignado_a`.
   - **Email**: Resend (`RESEND_API_KEY`, ya en `.env` local — falta
     configurarla también como env var de producción en Vercel), desde
     `alertas@neifertautomotores.com` (una vez verificado el dominio) al
     `email` del usuario asignado, si lo tiene cargado.

## UI nueva

- **Sidebar**: ítem "Alertas" (ícono tipo campana), nueva vista `alertas` en
  `src/crm/lib/vistas.js`, ruta `/crm/alertas` bajo `VistaGuard` (igual que
  el resto de `/crm/*`).
- **`AlertasListPage.jsx`**: lista de alertas (propias primero, filtro por
  estado hecha/pendiente, buscador), botón "Nueva alerta". Seguí el patrón
  ya establecido de `TareasListPage`/`PeritajesListPage` (store de filtros
  persistente, `SortDropdown`, etc.) para no reinventar nada.
- **`AlertaFormModal.jsx`**: alta/edición — título, descripción, fecha,
  hora, asignado (select de usuarios activos), cliente/vehículo opcional
  (autocomplete, reusando lo que ya exista para esos pickers en Tareas o
  Clientes).
- Botón para pedir permiso de notificaciones — se puede poner en el sidebar
  (junto al toggle de tema) o arriba de la lista de Alertas; decisión de
  implementación, no bloquea el diseño.

## Seguridad / secretos

- `RESEND_API_KEY`: ya en `.env` local (gitignored). Falta agregarla en
  Vercel → Settings → Environment Variables (Production) antes de que el
  envío real funcione en producción.
- VAPID keys (par pública/privada para Web Push): se generan una sola vez
  con `web-push generate-vapid-keys` (gratis, no depende de ningún
  servicio) y se guardan igual que `RESEND_API_KEY` (`.env` local +
  Vercel). La pública además se necesita en el frontend (no es secreta).
- El endpoint `check-alertas` se protege igual que `sync-legacy`
  (`CRON_SECRET` ya existente, reusado).

## Fuera de alcance / seguimiento

- Verificación del dominio en Resend: requiere que el usuario agregue
  registros DNS en el panel de dominios de Vercel — se lo guío en el
  momento, no es algo que yo pueda hacer por él.
- Alta de la cuenta en cron-job.org y configuración del endpoint: la hace
  el usuario, le paso la URL exacta y el header de autorización cuando el
  endpoint esté armado.
- No se contempla (por ahora) avisar a nadie más que el empleado asignado
  (sin copia a admin/dueño) — se puede sumar después si hace falta.
