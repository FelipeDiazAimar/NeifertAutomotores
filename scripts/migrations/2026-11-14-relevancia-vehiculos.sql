-- Relevancia manual de los vehículos en los catálogos públicos.
-- orden_relevancia = posición en el ranking (1 = primero). Usados y 0 km se
-- ordenan por separado (una unidad es de uno u otro según es_0km), así que
-- una sola columna alcanza. NULL = sin relevancia asignada: va después de
-- los que sí tienen, por año descendente. Aditiva e idempotente.
alter table crm.vehiculos
  add column if not exists orden_relevancia integer;

create index if not exists idx_crm_veh_orden_relevancia
  on crm.vehiculos (es_0km, orden_relevancia)
  where orden_relevancia is not null;
