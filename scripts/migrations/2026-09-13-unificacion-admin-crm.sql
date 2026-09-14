alter table crm.vehiculos
  add column if not exists categoria text,
  add column if not exists descripcion text,
  add column if not exists es_nuevo boolean not null default false,
  add column if not exists precio_usd numeric,
  add column if not exists combustible text,
  add column if not exists publicado boolean not null default false;

alter table crm.gestoria
  add column if not exists foto_seguro_url text,
  add column if not exists foto_titulo_frente_url text,
  add column if not exists foto_titulo_dorso_url text;

-- Lectura pública (web sin sesión) de vehículos publicados y sus fotos.
drop policy if exists vehiculos_publico_select on crm.vehiculos;
create policy vehiculos_publico_select on crm.vehiculos
  for select to anon
  using (estado = 'disponible' and publicado = true);

drop policy if exists vehiculo_fotos_publico_select on crm.vehiculo_fotos;
create policy vehiculo_fotos_publico_select on crm.vehiculo_fotos
  for select to anon
  using (
    exists (
      select 1 from crm.vehiculos v
      where v.id = vehiculo_id and v.estado = 'disponible' and v.publicado = true
    )
  );

grant usage on schema crm to anon;
grant select on crm.vehiculos, crm.vehiculo_fotos to anon;

-- Vistas nuevas del sidebar unificado, habilitadas por defecto para los 3 roles.
update crm.roles set vistas_default = vistas_default || array['leads','contenido','estadisticas','admin']
where not (vistas_default @> array['leads','contenido','estadisticas','admin']);
