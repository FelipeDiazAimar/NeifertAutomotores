import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const sql = readFileSync(resolve('supabase/crm_roles_schema.sql'), 'utf8').toLowerCase()

describe('crm_roles_schema.sql', () => {
  it('agrega el valor dueno al enum crm.rol', () => {
    expect(sql).toContain("add value if not exists 'dueno'")
  })
  it('tabla crm.roles con vistas_default text[]', () => {
    expect(sql).toContain('table if not exists crm.roles')
    expect(sql).toContain('vistas_default text[]')
  })
  it('columna vistas_override en crm.usuarios', () => {
    expect(sql).toContain('add column if not exists vistas_override')
  })
  it('seed idempotente de los 3 roles', () => {
    expect(sql).toContain('on conflict (rol) do nothing')
    expect(sql).toContain("'admin'")
    expect(sql).toContain("'dueno'")
    expect(sql).toContain("'vendedor'")
  })
  it('RLS de escritura en crm.roles habilita a dueno', () => {
    expect(sql).toMatch(/create policy[^;]+on crm\.roles[^;]+dueno/s)
  })
  it('crm.usuarios: insert/update/delete pasa a admin o dueno', () => {
    expect(sql).toMatch(/create policy[^;]+on crm\.usuarios[^;]+for insert[^;]+dueno/s)
    expect(sql).toMatch(/create policy[^;]+on crm\.usuarios[^;]+for update[^;]+dueno/s)
    expect(sql).toMatch(/create policy[^;]+on crm\.usuarios[^;]+for delete[^;]+dueno/s)
  })
})
