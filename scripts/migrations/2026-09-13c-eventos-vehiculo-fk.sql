-- eventos_vehiculo.vehiculo_id apuntaba a public.vehiculos (tabla retirada tras
-- la unificación de catálogos). Los inserts nuevos desde el sitio público
-- (trackEvent, con ids de crm.vehiculos) fallaban en silencio contra esta FK.
alter table public.eventos_vehiculo drop constraint if exists eventos_vehiculo_vehiculo_id_fkey;

-- NOT VALID: no revalida las ~230 filas históricas que quedan huérfanas (autos
-- vendidos/dados de baja que no matchean ningún crm.vehiculos, o ambiguos) —
-- solo exige la FK para inserts/updates nuevos de acá en adelante.
alter table public.eventos_vehiculo
  add constraint eventos_vehiculo_vehiculo_id_fkey
  foreign key (vehiculo_id) references crm.vehiculos(id) on delete cascade
  not valid;
