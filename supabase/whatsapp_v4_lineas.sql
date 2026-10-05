-- ============================================================================
--  WhatsApp v4 — cada línea (número de WhatsApp) con sus datos aparte.
--  Proyecto Supabase "Whatsapp Neifert", esquema wa.
-- ============================================================================
--  Todas las tablas llevan `linea` (el número con código de país, sin +) y las claves la
--  incluyen. Así la misma base guarda la línea de prueba y la de la concesionaria sin
--  mezclarse: el servidor solo lee y escribe la de WHATSAPP_NUMERO.
--
--  Lo que ya había queda asignado a la línea con la que se probó hasta ahora. Para otra
--  base, cambiar el número de abajo antes de correrlo. Ejecutar con el servidor APAGADO.
-- ============================================================================

begin;

do $$
declare
  linea_actual constant text := '5493406518585';
begin
  alter table wa.chats     add column if not exists linea text;
  alter table wa.mensajes  add column if not exists linea text;
  alter table wa.contactos add column if not exists linea text;
  alter table wa.estado    add column if not exists linea text;
  alter table wa.auditoria add column if not exists linea text;

  update wa.chats     set linea = linea_actual where linea is null;
  update wa.mensajes  set linea = linea_actual where linea is null;
  update wa.contactos set linea = linea_actual where linea is null;
  update wa.estado    set linea = linea_actual where linea is null;
  update wa.auditoria set linea = linea_actual where linea is null;
end $$;

alter table wa.chats     alter column linea set not null;
alter table wa.mensajes  alter column linea set not null;
alter table wa.contactos alter column linea set not null;
alter table wa.estado    alter column linea set not null;
alter table wa.auditoria alter column linea set not null;

-- Claves con la línea
alter table wa.mensajes  drop constraint if exists mensajes_chat_jid_fkey;
alter table wa.mensajes  drop constraint if exists mensajes_pkey;
alter table wa.chats     drop constraint if exists chats_pkey;
alter table wa.contactos drop constraint if exists contactos_pkey;
alter table wa.contactos drop constraint if exists contactos_lid_key;
alter table wa.estado    drop constraint if exists estado_pkey;

alter table wa.chats     add constraint chats_pkey primary key (linea, jid);
alter table wa.mensajes  add constraint mensajes_pkey primary key (linea, chat_jid, id);
alter table wa.mensajes  add constraint mensajes_chat_fkey foreign key (linea, chat_jid) references wa.chats (linea, jid) on delete cascade;
alter table wa.contactos add constraint contactos_pkey primary key (linea, jid);
alter table wa.contactos add constraint contactos_lid_key unique (linea, lid);
alter table wa.estado    add constraint estado_pkey primary key (linea, clave);

-- Índices con la línea adelante (cada consulta filtra por línea)
drop index if exists wa.chats_bandeja_idx;
drop index if exists wa.mensajes_chat_ts_idx;
drop index if exists wa.mensajes_ts_idx;
create index chats_bandeja_idx on wa.chats (linea, archivado, ultimo_ts desc);
create index mensajes_chat_ts_idx on wa.mensajes (linea, chat_jid, ts desc);
create index mensajes_ts_idx on wa.mensajes (linea, ts);
create index if not exists auditoria_linea_ts_idx on wa.auditoria (linea, ts desc);

-- Automatismos: el chat de cada mensaje es el de su misma línea
create or replace function wa.crear_chat_si_falta()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
begin
  insert into wa.chats (linea, jid) values (new.linea, new.chat_jid) on conflict (linea, jid) do nothing;
  return new;
end
$function$;

create or replace function wa.al_insertar_mensaje()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
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
   where ch.linea = new.linea
     and ch.jid = new.chat_jid
     and (ch.ultimo_ts is null or new.ts >= ch.ultimo_ts);

  if new.origen = 'vivo' and not new.de_mi and new.tipo not in ('desconocido', 'sistema') then
    update wa.chats ch
       set no_leidos = ch.no_leidos + 1,
           archivado = case when ch.archivado and desarchivar then false else ch.archivado end,
           archivado_hasta = case when ch.archivado and desarchivar then null else ch.archivado_hasta end
     where ch.linea = new.linea
       and ch.jid = new.chat_jid;
  end if;

  return new;
end
$function$;

commit;
