-- ============================================================================
--  CRM NUEVO — migración de datos crm_legacy -> crm
--  Ejecutar en Supabase -> SQL Editor -> Run (después de crm_schema.sql y de
--  tener crm_legacy poblado por el sync). Idempotente por id_legacy.
--  Vehículos y gestoría acá; PERITAJES se migran con
--  scripts/migrate-legacy-to-crm.mjs (necesitan el resumen calculado en JS).
-- ============================================================================

create or replace function crm.migrar_desde_legacy()
returns table (entidad text, filas bigint)
language plpgsql
security definer
set search_path = crm, crm_legacy, public
as $$
begin
  -- ---- VEHÍCULOS ----------------------------------------------------------
  insert into crm.vehiculos (
    id_legacy, marca, modelo, version, patente, tipo, anio, km, transmision, color,
    moneda, precio_contado, precio_canje,
    duenio_nombre, duenio_apellido, duenio_contacto,
    itv, itv_venc, consignacion, tipo_consignacion, origen,
    carpeta_completa, carpeta_con_oficio, carpeta_entregada, tiene_iva,
    nota, estado, fecha_venta, creado_en, actualizado_en
  )
  select
    v.id,
    coalesce(nullif(trim(v.marca), ''), 'S/D'),
    coalesce(nullif(trim(v.modelo), ''), 'S/D'),
    v.version, v.patente, v.tipo, v.anio, v.km, v.trans, v.color,
    (case when upper(coalesce(v.moneda_contado, 'ARS')) = 'USD' then 'USD' else 'ARS' end)::crm.moneda,
    v.precio_contado, v.precio_canje,
    v.duenio_nombre, v.duenio_apellido, v.duenio_contacto,
    v.itv, v.itv_venc,
    coalesce(v.consignacion, false), v.tipo_consignacion, v.origen,
    coalesce(v.carpeta_completa, false), coalesce(v.carpeta_con_oficio, false),
    coalesce(v.carpeta_entregada, false), coalesce(v.tiene_iva, false),
    v.nota,
    (case lower(trim(coalesce(v.status, '')))
       when 'disponible' then 'disponible'
       when 'reservado'  then 'reservado'
       when 'vendido'    then 'vendido'
       else 'baja'
     end)::crm.estado_vehiculo,
    v.fecha_venta,
    coalesce(v.created_at, now()),
    coalesce(v.updated_at, now())
  from crm_legacy.vehiculos v
  on conflict (id_legacy) do update set
    marca = excluded.marca, modelo = excluded.modelo, version = excluded.version,
    patente = excluded.patente, tipo = excluded.tipo, anio = excluded.anio,
    km = excluded.km, transmision = excluded.transmision, color = excluded.color,
    moneda = excluded.moneda, precio_contado = excluded.precio_contado,
    precio_canje = excluded.precio_canje,
    duenio_nombre = excluded.duenio_nombre, duenio_apellido = excluded.duenio_apellido,
    duenio_contacto = excluded.duenio_contacto,
    itv = excluded.itv, itv_venc = excluded.itv_venc,
    consignacion = excluded.consignacion, tipo_consignacion = excluded.tipo_consignacion,
    origen = excluded.origen, carpeta_completa = excluded.carpeta_completa,
    carpeta_con_oficio = excluded.carpeta_con_oficio,
    carpeta_entregada = excluded.carpeta_entregada, tiene_iva = excluded.tiene_iva,
    nota = excluded.nota, estado = excluded.estado,
    fecha_venta = excluded.fecha_venta,
    actualizado_en = excluded.actualizado_en;

  -- ---- GESTORÍA ---------------------------------------------------------
  insert into crm.gestoria (
    vehiculo_id, id_legacy, notas, fecha_inicio, fecha_cierre,
    form08_hecho, form08_fecha, form08_nota,
    verif_policial_hecho, verif_policial_fecha, verif_policial_nota,
    multas_nac_hecho, multas_nac_fecha, multas_nac_nota,
    dominio_hist_hecho, dominio_hist_fecha, dominio_hist_nota,
    libre_deudas_hecho, libre_deudas_fecha, libre_deudas_nota,
    titulo_hecho, titulo_fecha, titulo_nota,
    cedulas_hecho, cedulas_fecha, cedulas_nota,
    identificacion_hecho, identificacion_fecha, identificacion_nota,
    items_extra, creado_en
  )
  select
    cv.id, g.id, g.notas,
    nullif(g.fecha_inicio::text, '0000-00-00')::date,
    nullif(g.fecha_cierre::text, '0000-00-00')::date,
    coalesce(g.form08, false),         nullif(g.items->'form08'->>'fecha','')::date,         g.items->'form08'->>'obs',
    coalesce(g.verif_policial, false), nullif(g.items->'verif_policial'->>'fecha','')::date, g.items->'verif_policial'->>'obs',
    coalesce(g.multas_nac, false),     nullif(g.items->'multas_nac'->>'fecha','')::date,     g.items->'multas_nac'->>'obs',
    coalesce(g.dominio_hist, false),   nullif(g.items->'dominio_hist'->>'fecha','')::date,   g.items->'dominio_hist'->>'obs',
    coalesce(g.libre_deudas, false),   nullif(g.items->'libre_deudas'->>'fecha','')::date,   g.items->'libre_deudas'->>'obs',
    coalesce(g.titulo, false),         nullif(g.items->'titulo'->>'fecha','')::date,         g.items->'titulo'->>'obs',
    coalesce(g.cedulas, false),        nullif(g.items->'cedulas'->>'fecha','')::date,        g.items->'cedulas'->>'obs',
    coalesce(g.identificacion, false), nullif(g.items->'identificacion'->>'fecha','')::date, g.items->'identificacion'->>'obs',
    '{}'::jsonb,
    coalesce(g.created_at, now())
  from crm_legacy.gestoria_tramites g
  join crm.vehiculos cv on cv.id_legacy = g.vehiculo_id
  on conflict (id_legacy) do update set
    notas = excluded.notas,
    fecha_inicio = excluded.fecha_inicio, fecha_cierre = excluded.fecha_cierre,
    form08_hecho = excluded.form08_hecho, form08_fecha = excluded.form08_fecha, form08_nota = excluded.form08_nota,
    verif_policial_hecho = excluded.verif_policial_hecho, verif_policial_fecha = excluded.verif_policial_fecha, verif_policial_nota = excluded.verif_policial_nota,
    multas_nac_hecho = excluded.multas_nac_hecho, multas_nac_fecha = excluded.multas_nac_fecha, multas_nac_nota = excluded.multas_nac_nota,
    dominio_hist_hecho = excluded.dominio_hist_hecho, dominio_hist_fecha = excluded.dominio_hist_fecha, dominio_hist_nota = excluded.dominio_hist_nota,
    libre_deudas_hecho = excluded.libre_deudas_hecho, libre_deudas_fecha = excluded.libre_deudas_fecha, libre_deudas_nota = excluded.libre_deudas_nota,
    titulo_hecho = excluded.titulo_hecho, titulo_fecha = excluded.titulo_fecha, titulo_nota = excluded.titulo_nota,
    cedulas_hecho = excluded.cedulas_hecho, cedulas_fecha = excluded.cedulas_fecha, cedulas_nota = excluded.cedulas_nota,
    identificacion_hecho = excluded.identificacion_hecho, identificacion_fecha = excluded.identificacion_fecha, identificacion_nota = excluded.identificacion_nota,
    items_extra = excluded.items_extra;

  return query
    select 'vehiculos'::text, count(*) from crm.vehiculos where id_legacy is not null
    union all
    select 'gestoria'::text, count(*) from crm.gestoria where id_legacy is not null;
end $$;
