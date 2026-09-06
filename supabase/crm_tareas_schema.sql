-- ============================================================================
--  CRM NUEVO — módulo Tareas (unificado). Ejecutar en SQL Editor o por pg.
--  Idempotente. Sin migración (crm_legacy.alertas/tareas estaban vacías).
-- ============================================================================

do $$ begin
  create type crm.prioridad_tarea as enum ('baja','normal','alta');
exception when duplicate_object then null; end $$;

create table if not exists crm.tareas (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  descripcion text,
  fecha date not null,
  hora text,
  done boolean not null default false,
  prioridad crm.prioridad_tarea not null default 'normal',
  asignado_a uuid references crm.usuarios(id),
  cliente_id uuid references crm.clientes(id) on delete set null,
  vehiculo_id uuid references crm.vehiculos(id) on delete set null,
  creado_por uuid references crm.usuarios(id),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  completada_en timestamptz,
  archivado_en timestamptz
);
create index if not exists idx_crm_tar_done_fecha on crm.tareas(done, fecha);
create index if not exists idx_crm_tar_asignado on crm.tareas(asignado_a);
create index if not exists idx_crm_tar_cliente on crm.tareas(cliente_id);
create index if not exists idx_crm_tar_vehiculo on crm.tareas(vehiculo_id);

create or replace function crm.tarea_completada() returns trigger
  language plpgsql as $$
begin
  new.actualizado_en := now();
  if new.done and (old.done is distinct from new.done) then
    new.completada_en := now();
  elsif not new.done then
    new.completada_en := null;
  end if;
  return new;
end $$;

drop trigger if exists trg_tarea_completada on crm.tareas;
create trigger trg_tarea_completada before update on crm.tareas
  for each row execute function crm.tarea_completada();

alter table crm.tareas enable row level security;

drop policy if exists tareas_select on crm.tareas;
create policy tareas_select on crm.tareas for select using (crm.es_usuario());
drop policy if exists tareas_insert on crm.tareas;
create policy tareas_insert on crm.tareas for insert with check (crm.es_usuario());
drop policy if exists tareas_update on crm.tareas;
create policy tareas_update on crm.tareas for update using (crm.es_usuario());
drop policy if exists tareas_delete_admin on crm.tareas;
create policy tareas_delete_admin on crm.tareas for delete using (crm.mi_rol() = 'admin');

grant select, insert, update, delete on all tables in schema crm to authenticated;
grant all privileges on all tables in schema crm to service_role;
grant usage, select on all sequences in schema crm to authenticated, service_role;
