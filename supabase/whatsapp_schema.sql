-- =============================================================================
-- WhatsApp de Neifert — esquema de PRUEBA para Supabase
--
-- No es la versión final: sirve para ver cómo se guardan los mensajes y cómo
-- interactúa todo. Se pega entero en el SQL Editor de Supabase y se ejecuta.
-- Se puede correr más de una vez.
--
-- Qué hay:
--   1. Configuración (desarchivar al recibir)
--   3. Contactos
--   4. Chats (con archivado, fijado, silenciado, no leídos y último mensaje)
--   5. Mensajes: una fila por mensaje, con el mensaje completo en JSON (datos);
--      el archivo de cada mensaje va a R2 y su clave vive en datos.media
--   8. Automatismos: crear el chat, actualizar la lista, desarchivar
--   9. Estado del servidor y auditoría
--  10. Seguridad
--
-- La sesión de WhatsApp vive en la PC titular (data/sesion) y se respalda cifrada en
-- R2; la ventana de 365 días y el borrado de archivos los hace el servidor.
--  11. Datos de ejemplo y consultas para probar (opcional, al final)
-- =============================================================================

create extension if not exists pg_trgm with schema extensions;   -- búsqueda de texto rápida (ILIKE)

create schema if not exists wa;

-- -----------------------------------------------------------------------------
-- 1. Configuración (una sola fila)
-- -----------------------------------------------------------------------------
create table if not exists wa.config (
  id                     boolean primary key default true check (id),
  ventana_dias           integer not null default 365 check (ventana_dias > 0),
  -- Igual que el ajuste del celular: si llega un mensaje nuevo a un chat archivado,
  -- vuelve a la bandeja.
  desarchivar_al_recibir boolean not null default true,
  actualizado_en         timestamptz not null default now()
);
insert into wa.config (id) values (true) on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- 3. Contactos
-- -----------------------------------------------------------------------------
create table if not exists wa.contactos (
  jid              text primary key,        -- 5493564000001@s.whatsapp.net
  lid              text unique,             -- 1234567890@lid, si WhatsApp lo informó
  nombre_agenda    text,                    -- como está guardado en el celular
  nombre_propio    text,                    -- el que se puso la persona en WhatsApp
  foto_r2          text,                    -- clave de la foto de perfil en R2
  foto_revisada_en timestamptz,
  actualizado_en   timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- 4. Chats
-- -----------------------------------------------------------------------------
create table if not exists wa.chats (
  jid              text primary key,        -- ...@s.whatsapp.net o ...@g.us
  es_grupo         boolean generated always as (jid like '%@g.us') stored,
  nombre_grupo     text,
  archivado        boolean not null default false,
  -- WhatsApp archiva "hasta tal mensaje": si después escribe la otra persona, vuelve.
  archivado_hasta  text,
  fijado_en        timestamptz,
  silenciado_hasta timestamptz,
  no_leidos        integer not null default 0,
  ultimo_ts        timestamptz,
  ultimo           jsonb,                   -- resumen del último mensaje para la lista
  creado_en        timestamptz not null default now()
);
create index if not exists chats_bandeja_idx on wa.chats (archivado, ultimo_ts desc);

-- -----------------------------------------------------------------------------
-- 5. Mensajes: una fila por mensaje
-- Las columnas sueltas son las que se usan para buscar y ordenar. Todo lo demás
-- (ediciones, reacciones, cita, ubicación, el mensaje crudo de WhatsApp) va en
-- "datos", tal cual lo guarda hoy el servidor en cada línea de los .jsonl.
-- -----------------------------------------------------------------------------
create table if not exists wa.mensajes (
  chat_jid     text not null references wa.chats (jid) on delete cascade,
  id           text not null,               -- id de WhatsApp
  ts           timestamptz not null,
  de_mi        boolean not null,
  tipo         text not null,               -- texto, imagen, video, audio, nota_voz, documento, sticker, ubicacion, contacto, una_vez, otro, desconocido
  texto        text,
  autor_jid    text,                        -- en grupos: quién lo escribió
  enviado_por  jsonb,                       -- empleado del CRM que lo mandó: {"id": ..., "nombre": ...}
  estado       text,                        -- pendiente, enviado, entregado, leido, reproducido, error
  origen       text not null default 'vivo' check (origen in ('vivo', 'historial')),
  eliminado_en timestamptz,                 -- "eliminado para todos": se marca, no se borra
  datos        jsonb not null default '{}'::jsonb,
  primary key (chat_jid, id)
);
create index if not exists mensajes_chat_ts_idx on wa.mensajes (chat_jid, ts desc);
create index if not exists mensajes_ts_idx on wa.mensajes (ts);
create index if not exists mensajes_texto_idx on wa.mensajes using gin (texto extensions.gin_trgm_ops);

-- -----------------------------------------------------------------------------
-- 8. Automatismos
-- -----------------------------------------------------------------------------

-- 8a. Si llega un mensaje de un chat que todavía no existe, se crea.
create or replace function wa.crear_chat_si_falta()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  insert into wa.chats (jid) values (new.chat_jid) on conflict (jid) do nothing;
  return new;
end
$$;

create or replace trigger mensajes_crear_chat
  before insert on wa.mensajes
  for each row execute function wa.crear_chat_si_falta();

-- 8b. Cada mensaje nuevo actualiza la lista de chats: último mensaje, no leídos y,
--     si corresponde, desarchiva. Los mensajes del historial no cuentan como nuevos,
--     y el aviso de un mensaje borrado tampoco (igual que WhatsApp).
create or replace function wa.al_insertar_mensaje()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  desarchivar boolean;
begin
  select c.desarchivar_al_recibir into desarchivar from wa.config c where c.id;

  update wa.chats ch
     set ultimo_ts = new.ts,
         ultimo = jsonb_build_object(
           'id', new.id,
           'tipo', new.tipo,
           'texto', left(coalesce(new.texto, ''), 140),
           'de_mi', new.de_mi,
           'autor', new.datos ->> 'autorNombre',
           'eliminado', new.eliminado_en is not null
         )
   where ch.jid = new.chat_jid
     and (ch.ultimo_ts is null or new.ts >= ch.ultimo_ts);

  if new.origen = 'vivo' and not new.de_mi and new.tipo not in ('desconocido', 'sistema') then
    update wa.chats ch
       set no_leidos = ch.no_leidos + 1,
           archivado = case when ch.archivado and desarchivar then false else ch.archivado end,
           archivado_hasta = case when ch.archivado and desarchivar then null else ch.archivado_hasta end
     where ch.jid = new.chat_jid;
  end if;

  return new;
end
$$;

create or replace trigger mensajes_actualizar_chat
  after insert on wa.mensajes
  for each row execute function wa.al_insertar_mensaje();

-- -----------------------------------------------------------------------------
-- 9. Estado del servidor
-- Lo que el servidor necesita recordar y no es un mensaje ni un chat: marcas de
-- archivado/fijado/silenciado, mapa LID → teléfono, fotos consultadas, preferencias.
-- Y en cada chat, "datos" con la ficha completa tal como la maneja el servidor.
-- -----------------------------------------------------------------------------
create table if not exists wa.estado (
  clave          text primary key,          -- marcas, lids, meta, fotos, config
  valor          jsonb not null,
  actualizado_en timestamptz not null default now()
);
alter table wa.chats add column if not exists datos jsonb;

-- Registro de auditoría: quién hizo qué en el panel (lo escribe solo el servidor).
create table if not exists wa.auditoria (
  id             bigint generated always as identity primary key,
  ts             timestamptz not null default now(),
  usuario_id     text,
  usuario_nombre text,
  rol            text,
  accion         text not null,
  resultado      text not null default 'ok' check (resultado in ('ok', 'denegado', 'error')),
  chat_jid       text,
  detalle        jsonb not null default '{}'::jsonb,
  ip             text
);
create index if not exists auditoria_ts_idx on wa.auditoria (ts desc);
create index if not exists auditoria_usuario_idx on wa.auditoria (usuario_id, ts desc);
create index if not exists auditoria_accion_idx on wa.auditoria (accion, ts desc);

-- Lo que había antes de que estas tareas pasaran al servidor (idempotente).
drop table if exists wa.archivos cascade;
drop table if exists wa.r2_por_borrar cascade;
drop table if exists wa.sesion cascade;
drop view if exists wa.mensajes_vigentes;
drop function if exists wa.purgar_ventana();
drop function if exists wa.encolar_borrado_r2();
do $
begin
  perform cron.unschedule('wa-ventana-365');
exception when others then
  null;
end
$;

-- -----------------------------------------------------------------------------
-- 10. Seguridad
-- Todo con RLS y sin políticas: desde el navegador (anon / usuarios logueados) no
-- se puede leer ni escribir nada. Solo el servidor, con la service role key.
-- -----------------------------------------------------------------------------
alter table wa.config        enable row level security;
alter table wa.contactos     enable row level security;
alter table wa.chats         enable row level security;
alter table wa.mensajes      enable row level security;
alter table wa.estado        enable row level security;
alter table wa.auditoria     enable row level security;

grant usage on schema wa to service_role;
grant all on all tables in schema wa to service_role;
grant execute on all functions in schema wa to service_role;
revoke all on all tables in schema wa from anon, authenticated;


-- =============================================================================
-- 11. DATOS DE EJEMPLO (opcional)
-- Para ver cómo queda todo guardado. Números inventados. Se puede borrar con:
--   delete from wa.chats where jid in ('5493564000001@s.whatsapp.net', '120363000000000001@g.us');
-- =============================================================================

-- Contactos
insert into wa.contactos (jid, nombre_agenda, nombre_propio) values
  ('5493564000001@s.whatsapp.net', 'Cliente Amarok', 'Juan P'),
  ('5493564000002@s.whatsapp.net', null, 'Seba')
on conflict (jid) do nothing;

-- Grupo con nombre (el chat del cliente se crea solo al insertar su primer mensaje)
insert into wa.chats (jid, nombre_grupo) values ('120363000000000001@g.us', 'Ventas Neifert')
on conflict (jid) do nothing;

-- Mensajes del cliente
insert into wa.mensajes (chat_jid, id, ts, de_mi, tipo, texto, origen, estado, enviado_por, datos) values
  -- Uno de hace 400 días: queda fuera de la ventana y el servidor lo borra al arrancar
  ('5493564000001@s.whatsapp.net', 'VIEJO1', now() - interval '400 days', false, 'texto',
   'Consulta de hace más de un año', 'historial', null, null,
   '{"texto": "Consulta de hace más de un año"}'),
  ('5493564000001@s.whatsapp.net', 'C1', now() - interval '2 hours', false, 'texto',
   'Hola, ¿tienen la Amarok gris?', 'vivo', null, null,
   '{"texto": "Hola, ¿tienen la Amarok gris?"}'),
  -- Respuesta enviada desde el panel por un empleado
  ('5493564000001@s.whatsapp.net', 'C2', now() - interval '1 hour 50 minutes', true, 'texto',
   'Sí, llegó ayer. Te paso fotos.', 'vivo', 'leido', '{"id": "u-1", "nombre": "Nico"}',
   '{"texto": "Sí, llegó ayer. Te paso fotos.", "citado": "C1"}'),
  -- Foto: el mensaje acá, el archivo en R2
  ('5493564000001@s.whatsapp.net', 'C3', now() - interval '1 hour 49 minutes', true, 'imagen',
   'Así está por dentro', 'vivo', 'entregado', '{"id": "u-1", "nombre": "Nico"}',
   '{"texto": "Así está por dentro", "media": {"mime": "image/jpeg"}}'),
  -- Mensaje editado y con reacción: todo eso vive en "datos"
  ('5493564000001@s.whatsapp.net', 'C4', now() - interval '1 hour', false, 'texto',
   '¿Cuánto sale en efectivo?', 'vivo', null, null,
   '{"texto": "¿Cuánto sale en efectivo?", "ediciones": [{"texto": "¿Cuánto sale?", "ts": 1790000000}], "reacciones": {"yo": "👍"}}')
on conflict (chat_jid, id) do nothing;

-- Mensajes del grupo (con autor) y uno eliminado para todos: se marca, no se borra
insert into wa.mensajes (chat_jid, id, ts, de_mi, tipo, texto, autor_jid, origen, eliminado_en, datos) values
  ('120363000000000001@g.us', 'G1', now() - interval '30 minutes', false, 'texto',
   'La Amarok se publica hoy', '5493564000002@s.whatsapp.net', 'vivo', null,
   '{"texto": "La Amarok se publica hoy", "autorNombre": "Seba"}'),
  ('120363000000000001@g.us', 'G2', now() - interval '20 minutes', false, 'texto',
   'El precio lo bajamos a 28 palos', '5493564000002@s.whatsapp.net', 'vivo', now() - interval '10 minutes',
   '{"texto": "El precio lo bajamos a 28 palos", "autorNombre": "Seba", "eliminado": {"por": "contacto"}}')
on conflict (chat_jid, id) do nothing;

-- Archivar el grupo "hasta el mensaje G2" y después llega uno nuevo de Seba:
-- el automatismo 8b lo desarchiva solo, como en el celular.
update wa.chats set archivado = true, archivado_hasta = 'G2' where jid = '120363000000000001@g.us';
insert into wa.mensajes (chat_jid, id, ts, de_mi, tipo, texto, autor_jid, origen, datos) values
  ('120363000000000001@g.us', 'G3', now(), false, 'texto', '¿Alguien la mostró?',
   '5493564000002@s.whatsapp.net', 'vivo', '{"texto": "¿Alguien la mostró?", "autorNombre": "Seba"}')
on conflict (chat_jid, id) do nothing;


-- =============================================================================
-- CONSULTAS PARA PROBAR (de a una, seleccionándola y ejecutando)
-- =============================================================================

-- La bandeja, como la lista del panel (el grupo aparece desarchivado por G3):
--   select jid, coalesce(nombre_grupo, jid) as chat, archivado, no_leidos, ultimo_ts, ultimo
--     from wa.chats order by archivado, ultimo_ts desc nulls last;

-- Los últimos 50 mensajes de un chat:
--   select ts, de_mi, tipo, texto, enviado_por ->> 'nombre' as empleado, datos
--     from wa.mensajes
--    where chat_jid = '5493564000001@s.whatsapp.net'
--    order by ts desc limit 50;

-- Buscar en todos los chats (usa el índice de texto):
--   select chat_jid, ts, texto from wa.mensajes where texto ilike '%amarok%' order by ts desc;

-- Quién respondió cada mensaje enviado:
--   select ts, texto, enviado_por ->> 'nombre' as empleado from wa.mensajes where de_mi order by ts;

-- Últimas acciones del panel (auditoría):
--   select ts, usuario_nombre, rol, accion, resultado, chat_jid, ip from wa.auditoria order by ts desc limit 50;


-- =============================================================================
-- RESULTADO: lo que quedó creado (esto es lo que muestra "Results" al terminar)
-- En el Table Editor, elegí el esquema "wa" arriba a la izquierda: por defecto
-- muestra "public" y ahí no aparece nada de esto.
-- =============================================================================
select t.table_name as tabla,
       (select count(*) from wa.chats)    as chats_de_ejemplo,
       (select count(*) from wa.mensajes) as mensajes_de_ejemplo,
       exists (select 1 from pg_extension where extname = 'pg_cron') as limpieza_diaria_programada
  from information_schema.tables t
 where t.table_schema = 'wa'
 order by t.table_name;
