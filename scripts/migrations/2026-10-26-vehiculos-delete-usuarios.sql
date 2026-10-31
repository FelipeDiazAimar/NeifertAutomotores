-- Eliminar vehículo: cualquier usuario del CRM (con acceso a la vista),
-- no solo admin. Idempotente.
drop policy if exists vehiculos_delete_admin on crm.vehiculos;
drop policy if exists vehiculos_delete on crm.vehiculos;
create policy vehiculos_delete on crm.vehiculos for delete using (crm.es_usuario());
