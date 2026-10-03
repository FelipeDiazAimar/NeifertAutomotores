-- =============================================================================
-- WhatsApp de Neifert — esquema de PRUEBA para Supabase
--
-- No es la versión final: sirve para ver cómo se guardan los mensajes y cómo
-- interactúa todo. Se pega entero en el SQL Editor de Supabase y se ejecuta.
-- Se puede correr más de una vez.
--
-- Qué hay:
--   1. Configuración (ventana de días, desarchivar al recibir)
--   2. Sesión de WhatsApp (lo que hoy es la carpeta data/sesion)
--   3. Contactos
--   4. Chats (con archivado, fijado, silenciado, no leídos y último mensaje)
--   5. Mensajes: una fila por mensaje, con el mensaje completo en JSON (datos)
--   6. Archivos multimedia (el archivo en sí va a R2; acá solo la referencia)
--   7. Cola de archivos para borrar de R2
--   8. Automatismos: crear el chat, actualizar la lista, desarchivar
--   9. Ventana de 365 días: vista de lo vigente + limpieza diaria
--  10. Seguridad
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
-- 2. Sesión de WhatsApp (Baileys)
-- Reemplaza la carpeta data/sesion: 'creds' y una fila por cada clave de cifrado.
-- Con esto el servidor no necesita disco propio.
-- -----------------------------------------------------------------------------
create table if not exists wa.sesion (
  clave          text primary key,          -- 'creds', 'pre-key-12', 'session-549...', ...
  valor          jsonb not null,
  actualizado_en timestamptz not null default now()
);

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
-- 6. Archivos multimedia
-- El archivo vive en R2 (Cloudflare); acá se guarda dónde está y su estado.
-- -----------------------------------------------------------------------------
create table if not exists wa.archivos (
  chat_jid   text not null,
  mensaje_id text not null,
  r2_clave   text unique,                   -- ej: media/5493564000001/3EB0ABC.jpg (null hasta descargarlo)
  mime       text,
  nombre     text,                          -- nombre original (documentos)
  bytes      bigint,
  segundos   integer,                       -- audios y videos
  estado     text not null default 'pendiente' check (estado in ('pendiente', 'ok', 'error', 'grande')),
  fallos     integer not null default 0,
  creado_en  timestamptz not null default now(),
  primary key (chat_jid, mensaje_id),
  foreign key (chat_jid, mensaje_id) references wa.mensajes (chat_jid, id) on delete cascade
);

-- -----------------------------------------------------------------------------
-- 7. Cola de archivos para borrar de R2
-- La base no puede hablar con R2. Cuando se borra un mensaje (por la ventana de
-- 365 días), la clave de su archivo queda acá y el servidor lo borra de R2.
-- -----------------------------------------------------------------------------
create table if not exists wa.r2_por_borrar (
  r2_clave    text primary key,
  motivo      text not null default 'ventana',
  encolado_en timestamptz not null default now()
);

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

  if new.origen = 'vivo' and not new.de_mi and new.tipo <> 'desconocido' then
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

-- 8c. Al borrarse un archivo (por ejemplo, junto con su mensaje), su clave de R2
--     queda en la cola para que el servidor lo borre de Cloudflare.
create or replace function wa.encolar_borrado_r2()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.r2_clave is not null then
    insert into wa.r2_por_borrar (r2_clave) values (old.r2_clave) on conflict (r2_clave) do nothing;
  end if;
  return old;
end
$$;

create or replace trigger archivos_encolar_r2
  after delete on wa.archivos
  for each row execute function wa.encolar_borrado_r2();

-- -----------------------------------------------------------------------------
-- 9. Ventana de 365 días
-- -----------------------------------------------------------------------------

-- 9a. Lo que ve el panel: solo mensajes dentro de la ventana. Aunque la limpieza
--     corra una vez por día, en pantalla nunca aparece nada más viejo.
create or replace view wa.mensajes_vigentes
with (security_invoker = true)
as
select m.*
  from wa.mensajes m
  join wa.config c on c.id
 where m.ts >= now() - make_interval(days => c.ventana_dias);

-- 9b. Limpieza: borra lo que salió de la ventana. Sus archivos pasan solos a la
--     cola de R2 (por el borrado en cascada y el automatismo 8c).
create or replace function wa.purgar_ventana()
returns table (mensajes_borrados bigint, archivos_para_r2 bigint)
language plpgsql
set search_path = ''
as $$
declare
  dias integer;
  n_mensajes bigint;
  en_cola_antes bigint;
begin
  select c.ventana_dias into dias from wa.config c where c.id;
  select count(*) into en_cola_antes from wa.r2_por_borrar;

  delete from wa.mensajes m where m.ts < now() - make_interval(days => dias);
  get diagnostics n_mensajes = row_count;

  return query
    select n_mensajes, (select count(*) from wa.r2_por_borrar) - en_cola_antes;
end
$$;

-- 9c. Todos los días a las 03:15 UTC (00:15 en Argentina), con pg_cron.
--     Si pg_cron no está disponible, avisa y el resto del script sigue igual:
--     se habilita en Database → Extensions y se vuelve a correr el script.
do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('wa-ventana-365', '15 3 * * *', 'select * from wa.purgar_ventana();');
exception when others then
  raise notice 'No se programó la limpieza diaria (pg_cron): %. Habilitá pg_cron y volvé a correr el script.', sqlerrm;
end
$$;

-- -----------------------------------------------------------------------------
-- 9d. Estado del servidor
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

-- -----------------------------------------------------------------------------
-- 10. Seguridad
-- Todo con RLS y sin políticas: desde el navegador (anon / usuarios logueados) no
-- se puede leer ni escribir nada. Solo el servidor, con la service role key.
-- -----------------------------------------------------------------------------
alter table wa.config        enable row level security;
alter table wa.sesion        enable row level security;
alter table wa.contactos     enable row level security;
alter table wa.chats         enable row level security;
alter table wa.mensajes      enable row level security;
alter table wa.archivos      enable row level security;
alter table wa.r2_por_borrar enable row level security;
alter table wa.estado        enable row level security;

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
  -- Uno de hace 400 días: queda fuera de la ventana y se va en la próxima limpieza
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

insert into wa.archivos (chat_jid, mensaje_id, r2_clave, mime, bytes, estado) values
  ('5493564000001@s.whatsapp.net', 'C3', 'media/5493564000001/C3.jpg', 'image/jpeg', 184320, 'ok')
on conflict (chat_jid, mensaje_id) do nothing;

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

-- Los últimos 50 mensajes de un chat, solo dentro de la ventana de 365 días:
--   select ts, de_mi, tipo, texto, enviado_por ->> 'nombre' as empleado, datos
--     from wa.mensajes_vigentes
--    where chat_jid = '5493564000001@s.whatsapp.net'
--    order by ts desc limit 50;

-- Buscar en todos los chats (usa el índice de texto):
--   select chat_jid, ts, texto from wa.mensajes_vigentes where texto ilike '%amarok%' order by ts desc;

-- Quién respondió cada mensaje enviado:
--   select ts, texto, enviado_por ->> 'nombre' as empleado from wa.mensajes where de_mi order by ts;

-- Ver la limpieza en acción: borra el mensaje de hace 400 días.
--   select * from wa.purgar_ventana();

-- Borrar el chat del cliente: la foto C3 pasa sola a la cola de R2.
--   delete from wa.chats where jid = '5493564000001@s.whatsapp.net';
--   select * from wa.r2_por_borrar;

-- La tarea diaria programada:
--   select jobid, jobname, schedule, command from cron.job where jobname = 'wa-ventana-365';


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
