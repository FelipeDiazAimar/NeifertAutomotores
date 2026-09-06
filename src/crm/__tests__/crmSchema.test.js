import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const sql = readFileSync(resolve('supabase/crm_schema.sql'), 'utf8').toLowerCase()

describe('crm_schema.sql', () => {
  it('crea el schema y los enums', () => {
    expect(sql).toContain('create schema if not exists crm')
    for (const e of ['crm.rol', 'crm.estado_vehiculo', 'crm.moneda', 'crm.estado_gestoria', 'crm.estado_item']) {
      expect(sql).toContain(e)
    }
  })

  it('crea las 6 tablas', () => {
    for (const t of ['crm.usuarios', 'crm.vehiculos', 'crm.vehiculo_fotos', 'crm.peritajes', 'crm.gestoria', 'crm.eventos']) {
      expect(sql).toContain(`table if not exists ${t}`)
    }
  })

  it('define las funciones de rol y activa RLS', () => {
    expect(sql).toContain('function crm.mi_rol')
    expect(sql).toContain('function crm.es_usuario')
    expect(sql).toContain('enable row level security')
  })

  it('vendedor no puede borrar vehiculos/peritajes/gestoria (delete solo admin)', () => {
    for (const t of ['vehiculos', 'peritajes', 'gestoria']) {
      const re = new RegExp(`create policy[^;]+on crm\\.${t}[^;]+for delete[^;]+admin`, 's')
      expect(sql).toMatch(re)
    }
  })

  it('las 8 columnas de gestoria estandar existen', () => {
    for (const item of ['form08', 'verif_policial', 'multas_nac', 'dominio_hist', 'libre_deudas', 'titulo', 'cedulas', 'identificacion']) {
      expect(sql).toContain(`${item}_hecho`)
    }
  })

  it('usuarios: insert/update/delete solo admin', () => {
    for (const verb of ['insert', 'update', 'delete']) {
      const re = new RegExp(`create policy[^;]+on crm\\.usuarios[^;]+for ${verb}[^;]+admin`, 's')
      expect(sql).toMatch(re)
    }
  })
})
