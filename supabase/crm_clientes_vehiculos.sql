-- ============================================================================
--  CRM NUEVO — vehículos de interés y entrega con datos completos.
--  Ejecutar UNA vez en el SQL Editor de Supabase. Idempotente.
-- ============================================================================
--  cliente_intereses solo tenía (marca, modelo): se amplía al mismo shape que
--  usan los leads (condicion usado/cero, version, anio, color, km, notas).
--  cliente_autos_entrega suma `condicion` para quedar a la par.
-- ============================================================================

alter table crm.cliente_intereses
  add column if not exists condicion text not null default 'usado'
    check (condicion in ('usado', 'cero'));
alter table crm.cliente_intereses add column if not exists version text;
alter table crm.cliente_intereses add column if not exists anio int;
alter table crm.cliente_intereses add column if not exists color text;
alter table crm.cliente_intereses add column if not exists km int;
alter table crm.cliente_intereses add column if not exists notas text;

alter table crm.cliente_autos_entrega
  add column if not exists condicion text not null default 'usado'
    check (condicion in ('usado', 'cero'));
