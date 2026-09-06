import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const sql = readFileSync(resolve('supabase/crm_clientes_schema.sql'), 'utf8').toLowerCase()

describe('crm_clientes_schema.sql', () => {
  it('enum estado_cliente con 4 valores', () => {
    expect(sql).toContain("create type crm.estado_cliente as enum ('activo','en_seguimiento','vendido','perdido')")
  })

  it('3 tablas + columnas de venta en vehiculos', () => {
    for (const t of ['crm.clientes', 'crm.cliente_intereses', 'crm.cliente_autos_entrega']) {
      expect(sql).toContain(`table if not exists ${t}`)
    }
    expect(sql).toContain('add column if not exists venta_cliente_id')
    expect(sql).toContain('add column if not exists fecha_venta')
  })

  it('RLS: delete en clientes habilitado para cualquier usuario del CRM', () => {
    expect(sql).toMatch(/create policy[^;]+on crm\.clientes[^;]+for delete[^;]+es_usuario\(\)/s)
  })

  it('trigger actualizado_en en clientes', () => {
    expect(sql).toContain('before update on crm.clientes')
  })
})
