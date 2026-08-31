import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const sql = readFileSync(resolve('supabase/crm_clientes_migracion.sql'), 'utf8').toLowerCase()

describe('crm_clientes_migracion.sql', () => {
  it('define la función idempotente', () => {
    expect(sql).toContain('function crm.migrar_clientes_desde_legacy')
    expect(sql).toContain('on conflict (id_legacy) do update')
  })
  it('migra clientes + intereses + autos en entrega', () => {
    expect(sql).toContain('from crm_legacy.clientes')
    expect(sql).toContain('from crm_legacy.cliente_intereses')
    expect(sql).toContain('from crm_legacy.cliente_autos_entrega')
    expect(sql).toContain('into crm.clientes')
  })
  it('mapea status desconocido a activo', () => {
    expect(sql).toMatch(/else\s+'activo'/)
  })
})
