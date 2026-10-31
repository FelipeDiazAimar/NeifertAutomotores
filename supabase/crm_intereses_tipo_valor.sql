-- ============================================================================
--  Unificación leads + clientes (un solo "cliente", como en el CRM viejo).
--  Idempotente. Ejecutar en SQL Editor o por pg.
--
--  1. Intereses y autos en entrega con tipo de vehículo y valor aproximado,
--     para buscar posibles compradores por tipo / rango de precio.
--  2. Email del cliente (el alta de leads lo pedía y crm.clientes no lo tenía).
-- ============================================================================

alter table crm.cliente_intereses
  add column if not exists tipo text,
  add column if not exists valor numeric,
  add column if not exists moneda text not null default 'ARS'
    check (moneda in ('ARS', 'USD'));

alter table crm.cliente_autos_entrega
  add column if not exists tipo text,
  add column if not exists valor numeric,
  add column if not exists moneda text not null default 'ARS'
    check (moneda in ('ARS', 'USD'));

alter table crm.clientes
  add column if not exists email text;
