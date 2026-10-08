-- Badge "Nuevo" con vigencia de 14 días desde que se tilda es_nuevo.
-- es_0km no se toca (permanente).
alter table crm.vehiculos
  add column if not exists es_nuevo_en timestamptz;

create or replace function crm.set_es_nuevo_en() returns trigger
  language plpgsql as $$
begin
  if new.es_nuevo then
    if tg_op = 'insert' or old.es_nuevo is distinct from true then
      new.es_nuevo_en = now();
    end if;
  else
    new.es_nuevo_en = null;
  end if;
  return new;
end $$;

drop trigger if exists trg_veh_es_nuevo_en on crm.vehiculos;
create trigger trg_veh_es_nuevo_en before insert or update on crm.vehiculos
  for each row execute function crm.set_es_nuevo_en();

update crm.vehiculos
set es_nuevo_en = creado_en
where es_nuevo = true and es_nuevo_en is null;

create index if not exists idx_crm_veh_es_nuevo_en on crm.vehiculos(es_nuevo_en);
