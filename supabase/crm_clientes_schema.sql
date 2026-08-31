-- ============================================================================
--  CRM NUEVO — módulo Clientes. Ejecutar en SQL Editor o por pg. Idempotente.
-- ============================================================================

do $$ begin
  create type crm.estado_cliente as enum ('activo','en_seguimiento','vendido','perdido');
exception when duplicate_object then null; end $$;

create table if not exists crm.clientes (
  id uuid primary key default gen_random_uuid(),
  id_legacy text unique,
  nombre text not null,
  telefono text,
  localidad text,
  fecha_cumple date,
  status crm.estado_cliente not null default 'activo',
  canal text,
  presupuesto numeric,
  marca_interes text,
  modelo_interes text,
  tipo_interes text,
  trans_interes text,
  anio_min int,
  anio_max int,
  notas text,
  interes_cero_km boolean not null default false,
  cero_km jsonb,
  tiene_auto_entrega boolean not null default false,
  venta_vehiculo_id uuid references crm.vehiculos(id) on delete set null,
  fecha_venta date,
  creado_por uuid references crm.usuarios(id),
  editado_por uuid references crm.usuarios(id),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  archivado_en timestamptz
);
create index if not exists idx_crm_cli_status on crm.clientes(status);
create index if not exists idx_crm_cli_canal on crm.clientes(canal);
create index if not exists idx_crm_cli_archivado on crm.clientes(archivado_en);
create index if not exists idx_crm_cli_marca on crm.clientes(marca_interes);

create table if not exists crm.cliente_intereses (
  id bigserial primary key,
  cliente_id uuid not null references crm.clientes(id) on delete cascade,
  marca text,
  modelo text
);
create index if not exists idx_crm_cli_int on crm.cliente_intereses(cliente_id);

create table if not exists crm.cliente_autos_entrega (
  id bigserial primary key,
  cliente_id uuid not null references crm.clientes(id) on delete cascade,
  marca text,
  modelo text,
  version text,
  anio int,
  km int,
  color text,
  trans text,
  notas text
);
create index if not exists idx_crm_cli_ae on crm.cliente_autos_entrega(cliente_id);

alter table crm.vehiculos add column if not exists venta_cliente_id uuid references crm.clientes(id) on delete set null;
alter table crm.vehiculos add column if not exists fecha_venta date;

drop trigger if exists trg_cli_actualizado on crm.clientes;
create trigger trg_cli_actualizado before update on crm.clientes
  for each row execute function crm.set_actualizado_en();

alter table crm.clientes enable row level security;
alter table crm.cliente_intereses enable row level security;
alter table crm.cliente_autos_entrega enable row level security;

drop policy if exists clientes_select on crm.clientes;
create policy clientes_select on crm.clientes for select using (crm.es_usuario());
drop policy if exists clientes_insert on crm.clientes;
create policy clientes_insert on crm.clientes for insert with check (crm.es_usuario());
drop policy if exists clientes_update on crm.clientes;
create policy clientes_update on crm.clientes for update using (crm.es_usuario());
drop policy if exists clientes_delete_admin on crm.clientes;
create policy clientes_delete_admin on crm.clientes for delete using (crm.mi_rol() = 'admin');

drop policy if exists cli_int_all on crm.cliente_intereses;
create policy cli_int_all on crm.cliente_intereses for all using (crm.es_usuario()) with check (crm.es_usuario());
drop policy if exists cli_ae_all on crm.cliente_autos_entrega;
create policy cli_ae_all on crm.cliente_autos_entrega for all using (crm.es_usuario()) with check (crm.es_usuario());

grant select, insert, update, delete on all tables in schema crm to authenticated;
grant all privileges on all tables in schema crm to service_role;
grant usage, select on all sequences in schema crm to authenticated, service_role;
