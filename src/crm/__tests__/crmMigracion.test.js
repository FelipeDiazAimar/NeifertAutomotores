import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const sql = readFileSync(resolve('supabase/crm_migracion.sql'), 'utf8').toLowerCase()

describe('crm_migracion.sql', () => {
  it('define la función idempotente', () => {
    expect(sql).toContain('function crm.migrar_desde_legacy')
    expect(sql).toContain('on conflict (id_legacy) do update')
  })

  it('migra vehiculos y gestoria desde crm_legacy', () => {
    expect(sql).toContain('from crm_legacy.vehiculos')
    expect(sql).toContain('from crm_legacy.gestoria_tramites')
    expect(sql).toContain('into crm.vehiculos')
    expect(sql).toContain('into crm.gestoria')
  })

  it('mapea status desconocido a baja (con trim)', () => {
    expect(sql).toMatch(/else\s+'baja'/)
    expect(sql).toContain('::crm.estado_vehiculo')
    expect(sql).toContain("lower(trim(coalesce(v.status, '')))")
  })

  it('migra fecha_venta a crm.vehiculos', () => {
    expect(sql).toMatch(/insert into crm\.vehiculos[^;]*fecha_venta/s)
    expect(sql).toContain('fecha_venta = excluded.fecha_venta')
  })
})
