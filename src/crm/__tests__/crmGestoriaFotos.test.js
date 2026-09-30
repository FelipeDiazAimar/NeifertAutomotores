import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const sql = readFileSync(resolve('supabase/crm_gestoria_fotos.sql'), 'utf8').toLowerCase()

describe('crm_gestoria_fotos.sql', () => {
  it('crea crm.gestoria_fotos con slots acotados e índice', () => {
    expect(sql).toContain('table if not exists crm.gestoria_fotos')
    for (const slot of ['seguro', 'titulo_frente', 'titulo_dorso']) {
      expect(sql).toContain(slot)
    }
    expect(sql).toContain('idx_crm_gestoria_fotos_veh_slot')
  })

  it('migra las fotos únicas existentes (backfill idempotente)', () => {
    for (const col of ['foto_seguro_url', 'foto_titulo_frente_url', 'foto_titulo_dorso_url']) {
      expect(sql).toContain(col)
    }
    expect(sql).toContain('not exists')
  })

  it('activa RLS con políticas para usuarios del CRM', () => {
    expect(sql).toContain('enable row level security')
    for (const verb of ['select', 'insert', 'update', 'delete']) {
      expect(sql).toContain(`gestoria_fotos_${verb}`)
    }
  })
})
