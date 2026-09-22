-- ============================================================================
--  CRM NUEVO — módulo Alertas (título/fecha/hora/asignado, con avisos por
--  push + email 24hs y 3hs antes). Ejecutar en SQL Editor o por pg.
--  Idempotente. crm_legacy.alertas está vacía, no hace falta migración.
-- ============================================================================

create table if not exists crm.alertas (
  id              bigserial primary key,
  titulo          text not null,
  descripcion     text,
  fecha           date not null,
  hora            text not null,
  hecha           boolean not null default false,
  asignado_a      uuid not null references crm.usuarios(id),
  cliente_id      uuid references crm.clientes(id) on delete set null,
  vehiculo_id     uuid references crm.vehiculos(id) on delete set null,
  notificado_24h  boolean not null default false,
  notificado_3h   boolean not null default false,
  creado_por      uuid references crm.usuarios(id),
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now(),
  hecha_en        timestamptz
);
create index if not exists idx_crm_alertas_asignado on crm.alertas(asignado_a, hecha);
create index if not exists idx_crm_alertas_pendientes on crm.alertas(fecha, hora) where not hecha;

create or replace function crm.alerta_actualizada() returns trigger
  language plpgsql as $$
begin
  new.actualizado_en := now();
  if new.hecha and (old.hecha is distinct from new.hecha) then
    new.hecha_en := now();
  elsif not new.hecha then
    new.hecha_en := null;
  end if;
  return new;
end $$;

drop trigger if exists trg_alerta_actualizada on crm.alertas;
create trigger trg_alerta_actualizada before update on crm.alertas
  for each row execute function crm.alerta_actualizada();

alter table crm.alertas enable row level security;
drop policy if exists alertas_select on crm.alertas;
create policy alertas_select on crm.alertas for select using (crm.es_usuario());
drop policy if exists alertas_insert on crm.alertas;
create policy alertas_insert on crm.alertas for insert with check (crm.es_usuario());
drop policy if exists alertas_update on crm.alertas;
create policy alertas_update on crm.alertas for update using (crm.es_usuario());
drop policy if exists alertas_delete_admin on crm.alertas;
create policy alertas_delete_admin on crm.alertas for delete using (crm.mi_rol() = 'admin');

create table if not exists crm.push_subscriptions (
  id          bigserial primary key,
  usuario_id  uuid not null references crm.usuarios(id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  creado_en   timestamptz not null default now()
);
create index if not exists idx_crm_push_usuario on crm.push_subscriptions(usuario_id);

alter table crm.push_subscriptions enable row level security;
drop policy if exists push_subs_select on crm.push_subscriptions;
create policy push_subs_select on crm.push_subscriptions for select using (crm.es_usuario());
drop policy if exists push_subs_insert on crm.push_subscriptions;
create policy push_subs_insert on crm.push_subscriptions for insert with check (crm.es_usuario());
drop policy if exists push_subs_delete on crm.push_subscriptions;
create policy push_subs_delete on crm.push_subscriptions for delete using (crm.es_usuario());

alter table crm.usuarios add column if not exists email text;

grant select, insert, update, delete on all tables in schema crm to authenticated;
grant all privileges on all tables in schema crm to service_role;
grant usage, select on all sequences in schema crm to authenticated, service_role;
