-- ============================================================================
--  CRM LEGACY — clon de backup (schema aislado, solo service_role)
--  Ejecutar en: Supabase -> SQL Editor -> pegar todo -> Run. Es idempotente.
--  Despues de correrlo: Settings -> API -> Exposed schemas -> agregar
--  `crm_legacy` (para que la service_role key lo alcance por PostgREST).
--  Nombres en espanol. Los `id` de tablas normalizadas guardan el id del
--  CRM viejo tal cual. Ninguna fila se borra: se marca `borrado_en`.
-- ============================================================================

create schema if not exists crm_legacy;

-- ---- Bookkeeping de corridas -----------------------------------------------
create table if not exists crm_legacy.sync_runs (
  id                 bigserial primary key,
  iniciado_en        timestamptz not null default now(),
  terminado_en       timestamptz,
  estado             text not null default 'corriendo',   -- corriendo | ok | error
  disparado_por      text not null default 'cron',        -- cron | manual
  filas_por_entidad  jsonb not null default '{}'::jsonb,
  fotos_bajadas      int  not null default 0,
  error              text
);

-- ---- Capa raw (backup literal, append-only con dedupe por hash) ------------
create table if not exists crm_legacy.raw_registros (
  entidad            text not null,
  id_legacy          text not null,
  payload            jsonb not null,
  hash               text not null,
  fetched_at         timestamptz not null default now(),
  sync_run_id        bigint not null references crm_legacy.sync_runs(id),
  visto_ultimo_sync  boolean not null default true,
  primary key (entidad, id_legacy, hash)
);
create index if not exists idx_raw_entidad_id_fecha
  on crm_legacy.raw_registros (entidad, id_legacy, fetched_at desc);

-- ---- Normalizadas -------------------------------------------------------
create table if not exists crm_legacy.usuarios (
  id           int primary key,
  usuario      text,
  nombre       text,
  rol          text,
  sync_run_id  bigint references crm_legacy.sync_runs(id),
  borrado_en   timestamptz
);

create table if not exists crm_legacy.clientes (
  id                 text primary key,
  nombre             text,
  telefono           text,
  localidad          text,
  fecha_cumple       date,
  status             text,
  canal              text,
  presupuesto        numeric,
  marca_interes      text,
  modelo_interes     text,
  tipo_interes       text,
  trans_interes      text,
  anio_min           int,
  anio_max           int,
  notas              text,
  interes_cero_km    boolean not null default false,
  cero_km            jsonb,
  tiene_auto_entrega boolean not null default false,
  creado_por         text,
  editado_por        text,
  fecha_creacion     date,
  fecha_edicion      date,
  created_at         timestamptz,
  updated_at         timestamptz,
  venta_vehiculo_id  text,
  fecha_venta        date,
  sync_run_id        bigint references crm_legacy.sync_runs(id),
  borrado_en         timestamptz
);

create table if not exists crm_legacy.cliente_intereses (
  id          bigserial primary key,
  cliente_id  text not null references crm_legacy.clientes(id) on delete cascade,
  marca       text,
  modelo      text
);
create index if not exists idx_cli_int_cliente on crm_legacy.cliente_intereses (cliente_id);

create table if not exists crm_legacy.cliente_autos_entrega (
  id          bigserial primary key,
  cliente_id  text not null references crm_legacy.clientes(id) on delete cascade,
  marca       text,
  modelo      text,
  version     text,
  anio        int,
  km          int,
  color       text,
  trans       text,
  notas       text
);
create index if not exists idx_cli_ae_cliente on crm_legacy.cliente_autos_entrega (cliente_id);

create table if not exists crm_legacy.vehiculos (
  id                 text primary key,
  marca              text,
  modelo             text,
  version            text,
  patente            text,
  tipo               text,
  anio               int,
  km                 int,
  trans              text,
  color              text,
  moneda_contado     text,
  precio_contado     numeric,
  moneda_canje       text,
  precio_canje       numeric,
  duenio_nombre      text,
  duenio_apellido    text,
  duenio_contacto    text,
  itv                text,
  itv_venc           date,
  consignacion       boolean not null default false,
  tipo_consignacion  text,
  origen             text,
  carpeta_completa   boolean not null default false,
  carpeta_con_oficio boolean not null default false,
  carpeta_entregada  boolean not null default false,
  tiene_iva          boolean not null default false,
  nota               text,
  status             text,
  creado_por         text,
  editado_por        text,
  fecha_creacion     date,
  fecha_edicion      date,
  created_at         timestamptz,
  updated_at         timestamptz,
  venta_cliente_id   text,
  fecha_venta        date,
  sync_run_id        bigint references crm_legacy.sync_runs(id),
  borrado_en         timestamptz
);

create table if not exists crm_legacy.vehiculo_fotos (
  id            bigserial primary key,
  vehiculo_id   text not null references crm_legacy.vehiculos(id) on delete cascade,
  orden         int not null default 0,
  url_origen    text not null,
  url_espejo    text,
  bytes         int,
  content_type  text,
  mirrored_at   timestamptz,
  borrado_en    timestamptz,
  unique (vehiculo_id, url_origen)
);
create index if not exists idx_veh_fotos_vehiculo on crm_legacy.vehiculo_fotos (vehiculo_id);

create table if not exists crm_legacy.peritajes (
  id             int primary key,
  vehiculo_id    text references crm_legacy.vehiculos(id) on delete set null,
  fecha_peritaje date,
  peritado_por   text,
  resena_texto   text,
  costo_total    numeric,
  secciones      jsonb not null default '{}'::jsonb,
  created_at     timestamptz,
  updated_at     timestamptz,
  sync_run_id    bigint references crm_legacy.sync_runs(id),
  borrado_en     timestamptz
);
create index if not exists idx_peritajes_vehiculo on crm_legacy.peritajes (vehiculo_id);

create table if not exists crm_legacy.gestoria_tramites (
  id             int primary key,
  vehiculo_id    text references crm_legacy.vehiculos(id) on delete set null,
  estado         text,
  notas          text,
  fecha_inicio   date,
  fecha_cierre   date,
  items          jsonb not null default '{}'::jsonb,
  form08         boolean not null default false,
  verif_policial boolean not null default false,
  multas_nac     boolean not null default false,
  dominio_hist   boolean not null default false,
  libre_deudas   boolean not null default false,
  titulo         boolean not null default false,
  cedulas        boolean not null default false,
  identificacion boolean not null default false,
  created_at     timestamptz,
  updated_at     timestamptz,
  sync_run_id    bigint references crm_legacy.sync_runs(id),
  borrado_en     timestamptz
);
create index if not exists idx_gestoria_vehiculo on crm_legacy.gestoria_tramites (vehiculo_id);

create table if not exists crm_legacy.alertas (
  id           text primary key,
  tipo         text,
  titulo       text,
  descripcion  text,
  fecha        date,
  hora         text,
  done         boolean not null default false,
  ref_id       text,
  ref_name     text,
  ref_phone    text,
  creado_por   text,
  asignado_a   text,
  created_at   timestamptz,
  updated_at   timestamptz,
  sync_run_id  bigint references crm_legacy.sync_runs(id),
  borrado_en   timestamptz
);

create table if not exists crm_legacy.tareas (
  id            text primary key,
  titulo        text,
  descripcion   text,
  fecha         date,
  done          boolean not null default false,
  cliente_id    text,
  cliente_nombre text,
  cliente_phone text,
  asignado_a    text,
  created_at    timestamptz,
  updated_at    timestamptz,
  sync_run_id   bigint references crm_legacy.sync_runs(id),
  borrado_en    timestamptz
);

-- ---- Permisos: solo service_role -------------------------------------
grant usage on schema crm_legacy to service_role;
grant all privileges on all tables in schema crm_legacy to service_role;
grant all privileges on all sequences in schema crm_legacy to service_role;
alter default privileges in schema crm_legacy grant all on tables to service_role;
alter default privileges in schema crm_legacy grant all on sequences to service_role;

revoke all on all tables in schema crm_legacy from anon, authenticated;
revoke all on all sequences in schema crm_legacy from anon, authenticated;
alter default privileges in schema crm_legacy revoke all on tables from anon, authenticated;
