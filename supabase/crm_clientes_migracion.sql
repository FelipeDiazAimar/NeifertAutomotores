-- ============================================================================
--  CRM NUEVO — migración de clientes crm_legacy -> crm. Idempotente por id_legacy.
--  Requiere crm_clientes_schema.sql aplicado y crm.vehiculos migrado.
-- ============================================================================

create or replace function crm.migrar_clientes_desde_legacy()
returns table (entidad text, filas bigint)
language plpgsql
security definer
set search_path = crm, crm_legacy, public
as $$
begin
  insert into crm.clientes (
    id_legacy, nombre, telefono, localidad, fecha_cumple, status, canal, presupuesto,
    marca_interes, modelo_interes, tipo_interes, trans_interes, anio_min, anio_max, notas,
    interes_cero_km, cero_km, tiene_auto_entrega, venta_vehiculo_id, fecha_venta,
    creado_en, actualizado_en
  )
  select
    l.id,
    coalesce(nullif(trim(l.nombre), ''), 'S/N'),
    l.telefono, l.localidad, l.fecha_cumple,
    (case lower(coalesce(l.status, ''))
       when 'vendido' then 'vendido'
       when 'perdido' then 'perdido'
       when 'en_seguimiento' then 'en_seguimiento'
       else 'activo'
     end)::crm.estado_cliente,
    l.canal, l.presupuesto,
    l.marca_interes, l.modelo_interes, l.tipo_interes, l.trans_interes, l.anio_min, l.anio_max, l.notas,
    coalesce(l.interes_cero_km, false), l.cero_km, coalesce(l.tiene_auto_entrega, false),
    (select v.id from crm.vehiculos v where v.id_legacy = l.venta_vehiculo_id),
    l.fecha_venta,
    coalesce(l.created_at, now()), coalesce(l.updated_at, now())
  from crm_legacy.clientes l
  on conflict (id_legacy) do update set
    nombre = excluded.nombre, telefono = excluded.telefono, localidad = excluded.localidad,
    fecha_cumple = excluded.fecha_cumple, status = excluded.status, canal = excluded.canal,
    presupuesto = excluded.presupuesto, marca_interes = excluded.marca_interes,
    modelo_interes = excluded.modelo_interes, tipo_interes = excluded.tipo_interes,
    trans_interes = excluded.trans_interes, anio_min = excluded.anio_min, anio_max = excluded.anio_max,
    notas = excluded.notas, interes_cero_km = excluded.interes_cero_km, cero_km = excluded.cero_km,
    tiene_auto_entrega = excluded.tiene_auto_entrega, venta_vehiculo_id = excluded.venta_vehiculo_id,
    fecha_venta = excluded.fecha_venta, actualizado_en = excluded.actualizado_en;

  -- Intereses: reconstruir para los clientes migrados
  delete from crm.cliente_intereses ci
    using crm.clientes c
    where ci.cliente_id = c.id and c.id_legacy is not null;
  insert into crm.cliente_intereses (cliente_id, marca, modelo)
    select c.id, li.marca, li.modelo
    from crm_legacy.cliente_intereses li
    join crm.clientes c on c.id_legacy = li.cliente_id;

  -- Autos en entrega: idem
  delete from crm.cliente_autos_entrega ae
    using crm.clientes c
    where ae.cliente_id = c.id and c.id_legacy is not null;
  insert into crm.cliente_autos_entrega (cliente_id, marca, modelo, version, anio, km, color, trans, notas)
    select c.id, la.marca, la.modelo, la.version, la.anio, la.km, la.color, la.trans, la.notas
    from crm_legacy.cliente_autos_entrega la
    join crm.clientes c on c.id_legacy = la.cliente_id;

  return query
    select 'clientes'::text, count(*) from crm.clientes where id_legacy is not null
    union all
    select 'intereses'::text, count(*) from crm.cliente_intereses
    union all
    select 'autos_entrega'::text, count(*) from crm.cliente_autos_entrega;
end $$;
