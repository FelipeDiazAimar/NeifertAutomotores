import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const sql = readFileSync(resolve('supabase/crm_tareas_schema.sql'), 'utf8').toLowerCase()

describe('crm_tareas_schema.sql', () => {
  it('enum prioridad_tarea', () => {
    expect(sql).toContain("create type crm.prioridad_tarea as enum ('baja','normal','alta')")
  })
  it('tabla + columnas de estado', () => {
    expect(sql).toContain('table if not exists crm.tareas')
    expect(sql).toContain('completada_en')
    expect(sql).toContain('archivado_en')
  })
  it('trigger before update', () => {
    expect(sql).toContain('before update on crm.tareas')
  })
  it('delete solo admin', () => {
    expect(sql).toMatch(/create policy[^;]+on crm\.tareas[^;]+for delete[^;]+admin/s)
  })
})
