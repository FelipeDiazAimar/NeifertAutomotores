-- CRM nuevo — Módulo Usuarios / Roles
-- RBAC por vistas: crm.roles.vistas_default + crm.usuarios.vistas_override.
--
-- NOTA DE EJECUCIÓN: `alter type ... add value` no puede correr en el mismo
-- bloque transaccional que un statement que use el valor nuevo. Al aplicar por
-- pg, mandar el `alter type` en un query() separado del resto del archivo.

-- 1. dueno al enum (statement suelto)
alter type crm.rol add value if not exists 'dueno';

-- 2. Catálogo de vistas por rol
create table if not exists crm.roles (
  rol            crm.rol primary key,
  vistas_default text[] not null default '{}',
  actualizado_en timestamptz not null default now()
);

-- 3. Override de vistas por usuario (null = usar las del rol)
alter table crm.usuarios add column if not exists vistas_override text[];

-- 4. Seed idempotente (no pisa ediciones hechas desde la UI)
insert into crm.roles (rol, vistas_default) values
  ('admin',    '{panel,clientes,vehiculos,tareas,usuarios,roles}'),
  ('vendedor', '{panel,clientes,vehiculos,tareas}')
on conflict (rol) do nothing;
-- 'dueno' en un statement aparte: el valor de enum recién se amplió arriba
insert into crm.roles (rol, vistas_default) values
  ('dueno', '{panel,clientes,vehiculos,tareas,usuarios,roles}')
on conflict (rol) do nothing;

-- 5. RLS de crm.roles
alter table crm.roles enable row level security;
drop policy if exists roles_select on crm.roles;
create policy roles_select on crm.roles for select using (crm.es_usuario());
drop policy if exists roles_write on crm.roles;
create policy roles_write on crm.roles for all
  using (crm.mi_rol() in ('admin','dueno'))
  with check (crm.mi_rol() in ('admin','dueno'));

-- 6. crm.usuarios: insert/update/delete pasa de solo admin a admin O dueno
drop policy if exists usuarios_admin_insert on crm.usuarios;
create policy usuarios_admin_insert on crm.usuarios for insert
  with check (crm.mi_rol() in ('admin','dueno'));
drop policy if exists usuarios_admin_update on crm.usuarios;
create policy usuarios_admin_update on crm.usuarios for update
  using (crm.mi_rol() in ('admin','dueno'));
drop policy if exists usuarios_admin_delete on crm.usuarios;
create policy usuarios_admin_delete on crm.usuarios for delete
  using (crm.mi_rol() in ('admin','dueno'));

-- 7. Grants (idempotente)
grant select, insert, update, delete on all tables in schema crm to authenticated;
grant all privileges on all tables in schema crm to service_role;
