-- ============================================================================
--  Tareas y alertas vinculadas a un lead (public.prospectos), cargadas desde
--  "Registrar Nuevo Lead". Idempotente. Ejecutar en SQL Editor o por pg.
-- ============================================================================

alter table crm.tareas
  add column if not exists prospecto_id uuid references public.prospectos(id) on delete set null;
alter table crm.alertas
  add column if not exists prospecto_id uuid references public.prospectos(id) on delete set null;

create index if not exists idx_crm_tar_prospecto on crm.tareas(prospecto_id);
create index if not exists idx_crm_alertas_prospecto on crm.alertas(prospecto_id);
