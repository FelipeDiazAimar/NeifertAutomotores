import { describe, it, expect } from 'vitest'
import { transformUsuario, transformAlerta, transformTarea, bool, num, dateOnly } from '../../legacyTransform.js'
import usuarios from '../fixtures/legacy/usuarios.json'
import alertas from '../fixtures/legacy/alertas.json'
import tareas from '../fixtures/legacy/tareas.json'

describe('helpers', () => {
  it('bool coerces legacy truthiness', () => {
    expect(bool(1)).toBe(true)
    expect(bool('1')).toBe(true)
    expect(bool(0)).toBe(false)
    expect(bool('')).toBe(false)
    expect(bool(null)).toBe(false)
  })
  it('num returns null for empty, number otherwise', () => {
    expect(num('')).toBe(null)
    expect(num(null)).toBe(null)
    expect(num('30000000')).toBe(30000000)
    expect(num(2017)).toBe(2017)
  })
  it('dateOnly nulls the legacy zero date', () => {
    expect(dateOnly('0000-00-00')).toBe(null)
    expect(dateOnly('2026-06-02')).toBe('2026-06-02')
    expect(dateOnly('2026-06-02 12:26:42')).toBe('2026-06-02')
  })
})

describe('transformUsuario', () => {
  it('maps the captured admin row', () => {
    const cristian = usuarios.get.find((u) => u.user === 'Cristian')
    expect(transformUsuario(cristian)).toEqual({ id: 1, usuario: 'Cristian', nombre: 'Cristian', rol: 'admin' })
  })
})

describe('transformAlerta', () => {
  it('maps the captured alert and coerces done', () => {
    const row = transformAlerta(alertas.get[0])
    expect(row.id).toBe('6b8a3qf5353036550')
    expect(row.done).toBe(true)
    expect(row.asignado_a).toBe('Cristian')
    expect(row.fecha).toBe('2026-06-06')
  })
})

describe('transformTarea', () => {
  it('maps id, cliente ref and done=false', () => {
    const row = transformTarea(tareas.get[0])
    expect(row.id).toBe('mtgdfrp21ae5c7d6')
    expect(row.cliente_id).toBe('6c6jqbi7l2e6eb853')
    expect(row.done).toBe(false)
  })
})
