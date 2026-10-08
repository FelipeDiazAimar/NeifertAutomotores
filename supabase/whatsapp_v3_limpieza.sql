-- =============================================================================
-- WhatsApp — v3: limpieza de lo que nunca se usó
-- La sesión vive en la PC titular (data/sesion) y se respalda cifrada en R2; las claves
-- de los archivos están en wa.mensajes.datos.media; la ventana de 365 días y el borrado
-- de archivos de R2 los hace el servidor (así ningún archivo queda huérfano). Estas
-- tablas, la vista y las funciones quedaron vacías y sin uso. Idempotente.
-- =============================================================================
drop table if exists wa.archivos cascade;      -- arrastra el trigger archivos_encolar_r2
drop table if exists wa.r2_por_borrar cascade;
drop table if exists wa.sesion cascade;
drop view if exists wa.mensajes_vigentes;
drop function if exists wa.purgar_ventana();
drop function if exists wa.encolar_borrado_r2();
do $$
begin
  perform cron.unschedule('wa-ventana-365');
exception when others then
  null;
end
$$;
comment on column wa.config.ventana_dias is 'Sin uso: la ventana la define WA_VENTANA_DIAS en el servidor.';

-- Los avisos de grupo (tipo sistema) no suman no leídos.
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
