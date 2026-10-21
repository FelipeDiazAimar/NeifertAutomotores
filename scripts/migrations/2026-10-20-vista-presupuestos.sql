-- Vista "presupuestos" (/crm/presupuestos): creador de presupuestos.
-- Idempotente: suma la key a vistas_default de admin, dueno y vendedor si falta.
-- Los usuarios con vistas_override no se tocan (se habilitan desde la UI).
update crm.roles set vistas_default = vistas_default || array['presupuestos']
  where rol in ('admin', 'dueno', 'vendedor')
    and not ('presupuestos' = any(vistas_default));

-- Plantilla compartida de presupuestos (una sola fila, id = 1).
create table if not exists crm.presupuesto_plantilla (
  id             int primary key,
  datos          jsonb not null default '{}',
  actualizado_en timestamptz not null default now()
);

alter table crm.presupuesto_plantilla enable row level security;
drop policy if exists presupuesto_plantilla_select on crm.presupuesto_plantilla;
create policy presupuesto_plantilla_select on crm.presupuesto_plantilla for select
  using (crm.es_usuario());
drop policy if exists presupuesto_plantilla_write on crm.presupuesto_plantilla;
create policy presupuesto_plantilla_write on crm.presupuesto_plantilla for insert
  with check (crm.mi_rol() in ('admin', 'dueno'));
drop policy if exists presupuesto_plantilla_update on crm.presupuesto_plantilla;
create policy presupuesto_plantilla_update on crm.presupuesto_plantilla for update
  using (crm.mi_rol() in ('admin', 'dueno'))
  with check (crm.mi_rol() in ('admin', 'dueno'));

-- El grant masivo de crm_roles_schema.sql no cubre tablas creadas después:
-- grants explícitos para la tabla nueva.
grant select, insert, update on crm.presupuesto_plantilla to authenticated;
grant all privileges on crm.presupuesto_plantilla to service_role;
