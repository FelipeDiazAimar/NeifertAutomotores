-- ============================================================================
--  CRM NUEVO — schema `crm` (productivo, CON RLS). Promovido de `crm_legacy`.
--  Ejecutar en Supabase -> SQL Editor -> Run. Idempotente.
--  Despues: Settings -> API -> Exposed schemas -> agregar `crm`.
--  Nombres en espanol. `id` = uuid propio; `id_legacy` traza al clon.
--  Ninguna fila de vehiculos se borra por vendedor: se archiva (archivado_en).
-- ============================================================================

create schema if not exists crm;
create extension if not exists citext;
create extension if not exists pgcrypto;

-- ---- ENUMS (idempotentes) ------------------------------------------------
do $$ begin create type crm.rol as enum ('admin','vendedor'); exception when duplicate_object then null; end $$;
do $$ begin create type crm.estado_vehiculo as enum ('disponible','reservado','vendido','baja'); exception when duplicate_object then null; end $$;
do $$ begin create type crm.moneda as enum ('ARS','USD'); exception when duplicate_object then null; end $$;
do $$ begin create type crm.estado_gestoria as enum ('sin_iniciar','en_proceso','completo'); exception when duplicate_object then null; end $$;
do $$ begin create type crm.estado_item as enum ('ok','observacion','falta','na'); exception when duplicate_object then null; end $$;

-- ---- TABLAS ------------------------------------------------------------
create table if not exists crm.usuarios (
  id         uuid primary key references auth.users(id) on delete cascade,
  usuario    citext unique not null,
  nombre     text not null,
  rol        crm.rol not null default 'vendedor',
  activo     boolean not null default true,
  id_legacy  int,
  creado_en  timestamptz not null default now()
);

create table if not exists crm.vehiculos (
  id uuid primary key default gen_random_uuid(),
  id_legacy text unique,
  marca text not null,
  modelo text not null,
  version text,
  patente text,
  tipo text,
  anio int,
  km int,
  transmision text,
  color text,
  moneda crm.moneda not null default 'ARS',
  precio_contado numeric,
  precio_canje numeric,
  duenio_nombre text,
  duenio_apellido text,
  duenio_contacto text,
  itv text,
  itv_venc date,
  consignacion boolean not null default false,
  tipo_consignacion text,
  origen text,
  carpeta_completa boolean not null default false,
  carpeta_con_oficio boolean not null default false,
  carpeta_entregada boolean not null default false,
  tiene_iva boolean not null default false,
  nota text,
  estado crm.estado_vehiculo not null default 'disponible',
  creado_por uuid references crm.usuarios(id),
  editado_por uuid references crm.usuarios(id),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  archivado_en timestamptz
);
create index if not exists idx_crm_veh_estado on crm.vehiculos(estado);
create index if not exists idx_crm_veh_marca_modelo on crm.vehiculos(marca, modelo);
create index if not exists idx_crm_veh_patente on crm.vehiculos(patente);
create index if not exists idx_crm_veh_archivado on crm.vehiculos(archivado_en);

create table if not exists crm.vehiculo_fotos (
  id bigserial primary key,
  vehiculo_id uuid not null references crm.vehiculos(id) on delete cascade,
  orden int not null default 0,
  url text not null,
  es_portada boolean not null default false,
  subida_por uuid references crm.usuarios(id),
  subida_en timestamptz not null default now()
);
create unique index if not exists idx_crm_foto_portada on crm.vehiculo_fotos(vehiculo_id) where es_portada;
create index if not exists idx_crm_foto_veh on crm.vehiculo_fotos(vehiculo_id);

create table if not exists crm.peritajes (
  id bigserial primary key,
  vehiculo_id uuid not null references crm.vehiculos(id) on delete cascade,
  id_legacy int unique,
  fecha date,
  peritado_por uuid references crm.usuarios(id),
  resena text,
  costo_total numeric,
  datos jsonb not null default '{}'::jsonb,
  items_ok int not null default 0,
  items_obs int not null default 0,
  items_falta int not null default 0,
  creado_en timestamptz not null default now()
);
create index if not exists idx_crm_peritaje_veh on crm.peritajes(vehiculo_id, fecha desc);

create table if not exists crm.gestoria (
  id bigserial primary key,
  vehiculo_id uuid not null unique references crm.vehiculos(id) on delete cascade,
  id_legacy int unique,
  estado crm.estado_gestoria not null default 'sin_iniciar',
  notas text,
  fecha_inicio date,
  fecha_cierre date,
  form08_hecho boolean not null default false, form08_fecha date, form08_nota text, form08_por uuid references crm.usuarios(id),
  verif_policial_hecho boolean not null default false, verif_policial_fecha date, verif_policial_nota text, verif_policial_por uuid references crm.usuarios(id),
  multas_nac_hecho boolean not null default false, multas_nac_fecha date, multas_nac_nota text, multas_nac_por uuid references crm.usuarios(id),
  dominio_hist_hecho boolean not null default false, dominio_hist_fecha date, dominio_hist_nota text, dominio_hist_por uuid references crm.usuarios(id),
  libre_deudas_hecho boolean not null default false, libre_deudas_fecha date, libre_deudas_nota text, libre_deudas_por uuid references crm.usuarios(id),
  titulo_hecho boolean not null default false, titulo_fecha date, titulo_nota text, titulo_por uuid references crm.usuarios(id),
  cedulas_hecho boolean not null default false, cedulas_fecha date, cedulas_nota text, cedulas_por uuid references crm.usuarios(id),
  identificacion_hecho boolean not null default false, identificacion_fecha date, identificacion_nota text, identificacion_por uuid references crm.usuarios(id),
  items_extra jsonb not null default '{}'::jsonb,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create table if not exists crm.eventos (
  id bigserial primary key,
  entidad text not null,
  entidad_id text not null,
  tipo text not null,
  usuario_id uuid references crm.usuarios(id),
  datos jsonb not null default '{}'::jsonb,
  creado_en timestamptz not null default now()
);
create index if not exists idx_crm_eventos_entidad on crm.eventos(entidad, entidad_id, creado_en desc);

-- Catalogo de opciones escribibles (marca, modelo, version, tipo, color,
-- origen, tipo_consignacion). Los combobox del alta de vehiculos las ofrecen
-- junto con los valores ya presentes en crm.vehiculos; cada valor nuevo que
-- el usuario tipea se guarda aca para la proxima.
create table if not exists crm.opciones_campo (
  campo text not null,
  valor text not null,
  creado_en timestamptz not null default now(),
  primary key (campo, valor)
);
create unique index if not exists idx_crm_opciones_campo_lower
  on crm.opciones_campo (campo, lower(valor));

-- ---- FUNCIONES ------------------------------------------------------
create or replace function crm.mi_rol() returns crm.rol
  language sql stable security definer set search_path = crm, public as
$$ select rol from crm.usuarios where id = auth.uid() $$;

create or replace function crm.es_usuario() returns boolean
  language sql stable security definer set search_path = crm, public as
$$ select exists (select 1 from crm.usuarios where id = auth.uid() and activo) $$;

create or replace function crm.set_actualizado_en() returns trigger
  language plpgsql as $$ begin new.actualizado_en = now(); return new; end $$;

drop trigger if exists trg_veh_actualizado on crm.vehiculos;
create trigger trg_veh_actualizado before update on crm.vehiculos
  for each row execute function crm.set_actualizado_en();

create or replace function crm.gestoria_recalc_estado() returns trigger
  language plpgsql as $$
declare hechos int;
begin
  hechos := (new.form08_hecho::int + new.verif_policial_hecho::int + new.multas_nac_hecho::int
    + new.dominio_hist_hecho::int + new.libre_deudas_hecho::int + new.titulo_hecho::int
    + new.cedulas_hecho::int + new.identificacion_hecho::int);
  new.estado := case when hechos = 0 then 'sin_iniciar'::crm.estado_gestoria
                     when hechos = 8 then 'completo'::crm.estado_gestoria
                     else 'en_proceso'::crm.estado_gestoria end;
  new.actualizado_en := now();
  return new;
end $$;

drop trigger if exists trg_gestoria_estado on crm.gestoria;
create trigger trg_gestoria_estado before insert or update on crm.gestoria
  for each row execute function crm.gestoria_recalc_estado();

-- ---- RLS ----------------------------------------------------------
alter table crm.usuarios        enable row level security;
alter table crm.vehiculos       enable row level security;
alter table crm.vehiculo_fotos  enable row level security;
alter table crm.peritajes       enable row level security;
alter table crm.gestoria        enable row level security;
alter table crm.eventos         enable row level security;
alter table crm.opciones_campo  enable row level security;

-- usuarios: select cualquier usuario activo; escritura solo admin
drop policy if exists usuarios_select on crm.usuarios;
create policy usuarios_select on crm.usuarios for select using (crm.es_usuario());
drop policy if exists usuarios_admin_insert on crm.usuarios;
create policy usuarios_admin_insert on crm.usuarios for insert with check (crm.mi_rol() = 'admin');
drop policy if exists usuarios_admin_update on crm.usuarios;
create policy usuarios_admin_update on crm.usuarios for update using (crm.mi_rol() = 'admin');
drop policy if exists usuarios_admin_delete on crm.usuarios;
create policy usuarios_admin_delete on crm.usuarios for delete using (crm.mi_rol() = 'admin');

-- vehiculos: lectura/alta/edicion cualquier usuario; delete solo admin
drop policy if exists vehiculos_select on crm.vehiculos;
create policy vehiculos_select on crm.vehiculos for select using (crm.es_usuario());
drop policy if exists vehiculos_insert on crm.vehiculos;
create policy vehiculos_insert on crm.vehiculos for insert with check (crm.es_usuario());
drop policy if exists vehiculos_update on crm.vehiculos;
create policy vehiculos_update on crm.vehiculos for update using (crm.es_usuario());
drop policy if exists vehiculos_delete_admin on crm.vehiculos;
create policy vehiculos_delete_admin on crm.vehiculos for delete using (crm.mi_rol() = 'admin');

-- vehiculo_fotos: todo cualquier usuario
drop policy if exists fotos_select on crm.vehiculo_fotos;
create policy fotos_select on crm.vehiculo_fotos for select using (crm.es_usuario());
drop policy if exists fotos_insert on crm.vehiculo_fotos;
create policy fotos_insert on crm.vehiculo_fotos for insert with check (crm.es_usuario());
drop policy if exists fotos_update on crm.vehiculo_fotos;
create policy fotos_update on crm.vehiculo_fotos for update using (crm.es_usuario());
drop policy if exists fotos_delete on crm.vehiculo_fotos;
create policy fotos_delete on crm.vehiculo_fotos for delete using (crm.es_usuario());

-- peritajes: lectura/alta/edicion cualquier usuario; delete solo admin
drop policy if exists peritajes_select on crm.peritajes;
create policy peritajes_select on crm.peritajes for select using (crm.es_usuario());
drop policy if exists peritajes_insert on crm.peritajes;
create policy peritajes_insert on crm.peritajes for insert with check (crm.es_usuario());
drop policy if exists peritajes_update on crm.peritajes;
create policy peritajes_update on crm.peritajes for update using (crm.es_usuario());
drop policy if exists peritajes_delete_admin on crm.peritajes;
create policy peritajes_delete_admin on crm.peritajes for delete using (crm.mi_rol() = 'admin');

-- gestoria: lectura/alta/edicion cualquier usuario; delete solo admin
drop policy if exists gestoria_select on crm.gestoria;
create policy gestoria_select on crm.gestoria for select using (crm.es_usuario());
drop policy if exists gestoria_insert on crm.gestoria;
create policy gestoria_insert on crm.gestoria for insert with check (crm.es_usuario());
drop policy if exists gestoria_update on crm.gestoria;
create policy gestoria_update on crm.gestoria for update using (crm.es_usuario());
drop policy if exists gestoria_delete_admin on crm.gestoria;
create policy gestoria_delete_admin on crm.gestoria for delete using (crm.mi_rol() = 'admin');

-- eventos: bitacora append-only (select + insert, sin update/delete)
drop policy if exists eventos_select on crm.eventos;
create policy eventos_select on crm.eventos for select using (crm.es_usuario());
drop policy if exists eventos_insert on crm.eventos;
create policy eventos_insert on crm.eventos for insert with check (crm.es_usuario());

-- opciones_campo: cualquier usuario lee y agrega opciones nuevas
drop policy if exists opciones_campo_select on crm.opciones_campo;
create policy opciones_campo_select on crm.opciones_campo for select using (crm.es_usuario());
drop policy if exists opciones_campo_insert on crm.opciones_campo;
create policy opciones_campo_insert on crm.opciones_campo for insert with check (crm.es_usuario());

-- ---- GRANTS ------------------------------------------------------
grant usage on schema crm to anon, authenticated, service_role;

grant select, insert, update, delete on all tables in schema crm to authenticated;
grant usage, select on all sequences in schema crm to authenticated;
alter default privileges in schema crm grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema crm grant usage, select on sequences to authenticated;

-- service_role (seed de usuarios, migración, jobs) — bypass RLS + acceso total
grant all privileges on all tables in schema crm to service_role;
grant all privileges on all sequences in schema crm to service_role;
alter default privileges in schema crm grant all on tables to service_role;
alter default privileges in schema crm grant all on sequences to service_role;
