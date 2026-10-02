-- Catálogo 0km: flag independiente de "Es nuevo".
-- es_0km = true → la unidad se publica en /catalogo-0km.
-- es_0km = false/NULL → va a /catalogo (usados).
alter table crm.vehiculos
  add column if not exists es_0km boolean not null default false;

create index if not exists idx_crm_veh_es_0km on crm.vehiculos(es_0km)
  where publicado = true;
