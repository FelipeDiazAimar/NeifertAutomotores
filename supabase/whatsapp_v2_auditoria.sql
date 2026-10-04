-- =============================================================================
-- WhatsApp — v2: registro de auditoría
-- Quién hizo qué en el panel, cuándo y desde dónde: entradas, vincular/desvincular la
-- línea, envíos, cambios de preferencias y los intentos rechazados por falta de permiso.
-- Lo escribe solo el servidor (con su conexión directa); nadie más tiene acceso.
-- Idempotente: se puede correr más de una vez.
-- =============================================================================

create table if not exists wa.auditoria (
  id             bigint generated always as identity primary key,
  ts             timestamptz not null default now(),
  usuario_id     text,                 -- crm.usuarios.id (null: el propio servidor)
  usuario_nombre text,
  rol            text,
  accion         text not null,        -- 'sesion', 'desvincular', 'enviar_texto', ...
  resultado      text not null default 'ok' check (resultado in ('ok', 'denegado', 'error')),
  chat_jid       text,
  detalle        jsonb not null default '{}'::jsonb,
  ip             text
);

create index if not exists auditoria_ts_idx on wa.auditoria (ts desc);
create index if not exists auditoria_usuario_idx on wa.auditoria (usuario_id, ts desc);
create index if not exists auditoria_accion_idx on wa.auditoria (accion, ts desc);

alter table wa.auditoria enable row level security;
-- Sin políticas: con RLS activo y sin políticas, ni anon ni authenticated pueden leer ni
-- escribir. El servidor usa la conexión directa (rol postgres), que no pasa por RLS.

comment on table wa.auditoria is 'Registro de auditoría del panel de WhatsApp (quién, qué, cuándo, desde qué IP).';
