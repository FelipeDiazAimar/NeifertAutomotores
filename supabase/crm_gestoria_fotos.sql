-- Fotos documentales de gestoría SIN límite (seguro, título).
-- El título es UNA galería con N fotos (no solo frente/dorso): todas las
-- fotos del título viven en el slot 'titulo'.
-- Idempotente: se puede correr varias veces (IF NOT EXISTS + backfill con
-- NOT EXISTS). Correr después de supabase/crm_schema.sql.

-- 1) Paridad con prod: las 3 columnas de URL única existían en la base
--    productiva pero nunca entraron al schema del repo. Se agregan por si la
--    base donde corre esto no las tiene (el backfill de abajo las necesita).
alter table crm.gestoria add column if not exists foto_seguro_url text;
alter table crm.gestoria add column if not exists foto_titulo_frente_url text;
alter table crm.gestoria add column if not exists foto_titulo_dorso_url text;

-- 2) Tabla de fotos múltiples (mirror del patrón de crm.vehiculo_fotos).
create table if not exists crm.gestoria_fotos (
  id uuid primary key default gen_random_uuid(),
  vehiculo_id uuid not null references crm.vehiculos(id) on delete cascade,
  slot text not null check (slot in ('seguro', 'titulo')),
  url text not null,
  orden int not null default 0,
  creado_en timestamptz not null default now()
);
create index if not exists idx_crm_gestoria_fotos_veh_slot
  on crm.gestoria_fotos(vehiculo_id, slot, orden);

-- 2b) Compat con bases ya creadas con el check viejo
--     ('seguro','titulo_frente','titulo_dorso'): se amplía para aceptar
--     'titulo' (y los viejos como legacy hasta que corra la unificación).
do $$
begin
  alter table crm.gestoria_fotos drop constraint if exists gestoria_fotos_slot_check;
  alter table crm.gestoria_fotos
    add constraint gestoria_fotos_slot_check
    check (slot in ('seguro', 'titulo', 'titulo_frente', 'titulo_dorso'));
exception when undefined_table then null;
end $$;

-- 3) Backfill: las fotos únicas existentes pasan a la tabla nueva (una vez,
--    gracias al NOT EXISTS). Las columnas viejas NO se borran: quedan como
--    respaldo y la app ya no las escribe. Frente y dorso se unifican en 'titulo'.
insert into crm.gestoria_fotos (vehiculo_id, slot, url, orden)
select vehiculo_id, 'seguro', foto_seguro_url, 0 from crm.gestoria
where foto_seguro_url is not null
  and not exists (
    select 1 from crm.gestoria_fotos f
    where f.vehiculo_id = crm.gestoria.vehiculo_id and f.slot = 'seguro'
  );
insert into crm.gestoria_fotos (vehiculo_id, slot, url, orden)
select vehiculo_id, 'titulo', foto_titulo_frente_url, 0 from crm.gestoria
where foto_titulo_frente_url is not null
  and not exists (
    select 1 from crm.gestoria_fotos f
    where f.vehiculo_id = crm.gestoria.vehiculo_id and f.slot = 'titulo'
      and f.url = crm.gestoria.foto_titulo_frente_url
  );
insert into crm.gestoria_fotos (vehiculo_id, slot, url, orden)
select vehiculo_id, 'titulo', foto_titulo_dorso_url, 1 from crm.gestoria
where foto_titulo_dorso_url is not null
  and not exists (
    select 1 from crm.gestoria_fotos f
    where f.vehiculo_id = crm.gestoria.vehiculo_id and f.slot = 'titulo'
      and f.url = crm.gestoria.foto_titulo_dorso_url
  );

-- 4) RLS: igual que crm.vehiculo_fotos (cualquier usuario del CRM gestiona).
alter table crm.gestoria_fotos enable row level security;
drop policy if exists gestoria_fotos_select on crm.gestoria_fotos;
create policy gestoria_fotos_select on crm.gestoria_fotos for select using (crm.es_usuario());
drop policy if exists gestoria_fotos_insert on crm.gestoria_fotos;
create policy gestoria_fotos_insert on crm.gestoria_fotos for insert with check (crm.es_usuario());
drop policy if exists gestoria_fotos_update on crm.gestoria_fotos;
create policy gestoria_fotos_update on crm.gestoria_fotos for update using (crm.es_usuario());
drop policy if exists gestoria_fotos_delete on crm.gestoria_fotos;
create policy gestoria_fotos_delete on crm.gestoria_fotos for delete using (crm.es_usuario());
