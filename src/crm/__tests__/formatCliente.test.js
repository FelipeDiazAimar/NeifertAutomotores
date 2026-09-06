import { describe, it, expect } from 'vitest'
import { lineaInteres, statusVariant, CANAL_OPCIONES, waContactoLink } from '../lib/formatCliente.js'

describe('lineaInteres', () => {
  it('junta lo que hay', () => {
    expect(lineaInteres({ marca_interes: 'Nissan', modelo_interes: 'Kicks', tipo_interes: 'SUV', anio_min: 2017, anio_max: 2020, presupuesto: 30000000 }))
      .toContain('Nissan Kicks')
  })
  it('sin datos → guion', () => {
    expect(lineaInteres({})).toBe('—')
  })
})

describe('statusVariant', () => {
  it('mapea los 4 estados', () => {
    expect(statusVariant('activo')).toBe('green')
    expect(statusVariant('en_seguimiento')).toBe('amber')
    expect(statusVariant('vendido')).toBe('neutral')
    expect(statusVariant('perdido')).toBe('red')
  })
})

describe('CANAL_OPCIONES', () => {
  it('tiene id y label', () => {
    expect(CANAL_OPCIONES.every((o) => o.id && o.label)).toBe(true)
  })
})

describe('waContactoLink', () => {
  it('arma el link api.whatsapp.com con teléfono limpio y saludo', () => {
    const url = waContactoLink({ nombre: 'Marcelo Corbalaña', telefono: '+54 3564 56-5884' })
    expect(url.startsWith('https://api.whatsapp.com/send/?')).toBe(true)
    const params = new URL(url).searchParams
    expect(params.get('phone')).toBe('543564565884')
    expect(params.get('type')).toBe('phone_number')
    expect(params.get('app_absent')).toBe('0')
    expect(params.get('text')).toBe('Hola Marcelo Corbalaña! Te contactamos desde NEIFERT Automotores. ¿Cómo estás?')
  })

  it('sin teléfono → null', () => {
    expect(waContactoLink({ nombre: 'Ana' })).toBeNull()
    expect(waContactoLink(null)).toBeNull()
  })
})
