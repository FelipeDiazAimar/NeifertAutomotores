import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  transformCliente, transformVehiculo, transformAlerta, transformTarea, transformUsuario,
} from '../../legacyTransform.js'
import clientes from '../fixtures/legacy/clientes.json'
import vehiculos from '../fixtures/legacy/vehiculos.json'
import alertas from '../fixtures/legacy/alertas.json'
import tareas from '../fixtures/legacy/tareas.json'
import usuarios from '../fixtures/legacy/usuarios.json'

const sql = readFileSync(resolve('supabase/crm_legacy_schema.sql'), 'utf8').toLowerCase()

function assertColumns(obj) {
  for (const key of Object.keys(obj)) {
    expect(sql, `missing column ${key}`).toContain(key.toLowerCase())
  }
}

describe('crm_legacy_schema.sql', () => {
  it('declares the schema and every table', () => {
    for (const t of [
      'sync_runs', 'raw_registros', 'usuarios', 'clientes', 'cliente_intereses',
      'cliente_autos_entrega', 'vehiculos', 'vehiculo_fotos', 'peritajes',
      'gestoria_tramites', 'alertas', 'tareas',
    ]) {
      expect(sql).toContain(`crm_legacy.${t}`)
    }
    expect(sql).toContain('create schema if not exists crm_legacy')
  })

  it('has a column for every field the transforms emit', () => {
    assertColumns(transformCliente(clientes.get[0]).cliente)
    assertColumns(transformVehiculo(vehiculos.get[0]).vehiculo)
    assertColumns(transformAlerta(alertas.get[0]))
    assertColumns(transformTarea(tareas.get[0]))
    assertColumns(transformUsuario(usuarios.get[0]))
  })

  it('locks the schema down to service_role', () => {
    expect(sql).toContain('revoke all on all tables in schema crm_legacy from anon, authenticated')
    expect(sql).toContain('grant usage on schema crm_legacy to service_role')
  })
})
