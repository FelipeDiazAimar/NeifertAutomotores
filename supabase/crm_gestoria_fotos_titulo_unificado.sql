-- Unifica título frente/dorso en un solo slot 'titulo' con N fotos.
-- Correr después de supabase/crm_gestoria_fotos.sql. Idempotente.

-- 1) Ampliar el check para aceptar 'titulo' (mantiene los viejos como legacy
--    por si alguna base aún no migró filas). El nombre del check autogenerado
--    por Postgres es gestoria_fotos_slot_check.
do $$
begin
  alter table crm.gestoria_fotos drop constraint if exists gestoria_fotos_slot_check;
  alter table crm.gestoria_fotos
    add constraint gestoria_fotos_slot_check
    check (slot in ('seguro', 'titulo', 'titulo_frente', 'titulo_dorso'));
exception when undefined_table then null;
end $$;

-- 2) Migrar filas viejas a 'titulo' preservando orden (frente primero).
--    Se corre antes de reasignar órdenes para no chocar.
update crm.gestoria_fotos set slot = 'titulo'
where slot in ('titulo_frente', 'titulo_dorso');

-- 3) Reasignar orden 0..N por vehículo dentro de 'titulo' según creado_en.
do $$
declare
  v record;
  f record;
  i int;
begin
  for v in select distinct vehiculo_id from crm.gestoria_fotos where slot = 'titulo' loop
    i := 0;
    for f in select id from crm.gestoria_fotos
             where vehiculo_id = v.vehiculo_id and slot = 'titulo'
             order by orden, creado_en, id
    loop
      update crm.gestoria_fotos set orden = i where id = f.id;
      i := i + 1;
    end loop;
  end loop;
exception when undefined_table then null;
end $$;
