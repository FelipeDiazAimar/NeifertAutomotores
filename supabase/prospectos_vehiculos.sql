-- ============================================================================
--  MINI-CRM (/admin/crm) — vehículos de interés y autos en entrega por lead.
--  Ejecutar UNA vez en el SQL Editor de Supabase. Idempotente.
-- ============================================================================
--  Cada item guarda: condicion ('usado' | 'cero'), marca, modelo, version,
--  anio, color, km y notas. Son listas (puede haber varios por lead), por eso
--  van como jsonb en vez de columnas planas. El campo viejo `vehiculo_interes`
--  (texto) se sigue usando como resumen para la búsqueda del listado.
-- ============================================================================

do $$ begin
  alter table public.prospectos
    add column vehiculos_interes jsonb not null default '[]'::jsonb;
exception when duplicate_column then null; end $$;

do $$ begin
  alter table public.prospectos
    add column autos_entrega jsonb not null default '[]'::jsonb;
exception when duplicate_column then null; end $$;

-- Backfill por si alguna fila quedó con null (defensa, con not null no debería pasar).
update public.prospectos set vehiculos_interes = '[]'::jsonb where vehiculos_interes is null;
update public.prospectos set autos_entrega = '[]'::jsonb where autos_entrega is null;
