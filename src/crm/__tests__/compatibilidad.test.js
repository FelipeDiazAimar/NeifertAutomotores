import { describe, it, expect } from 'vitest'
import { compatibilidad, bucket, precioEnArs } from '../lib/compatibilidad.js'

const veh = { marca: 'Ford', modelo: 'KA', tipo: 'Hatchback', anio: 2016, moneda: 'ARS', precio_contado: 8000000 }
const r = (n) => Math.round(n)

describe('compatibilidad', () => {
  it('match total → 100 / alta', () => {
    const c = {
      marca_interes: 'ford', modelo_interes: 'ka', tipo_interes: 'Hatchback',
      anio_min: 2014, anio_max: 2018, presupuesto: 9000000, intereses: [],
    }
    const res = compatibilidad(c, veh)
    expect(res.score).toBe(100)
    expect(res.bucket).toBe('alta')
  })

  it('marca ok + presupuesto no → 30/45', () => {
    const c = { marca_interes: 'ford', presupuesto: 1, intereses: [] }
    expect(compatibilidad(c, veh).score).toBe(r((30 / 45) * 100))
  })

  it('nada aplica → 0', () => {
    expect(compatibilidad({ intereses: [] }, veh).score).toBe(0)
  })

  it('usa el mejor score entre los intereses', () => {
    const c = { marca_interes: 'toyota', intereses: [{ marca: 'ford', modelo: 'ka' }] }
    expect(compatibilidad(c, veh).score).toBeGreaterThan(0)
  })

  it('detalle marca criterios aplicables y ok', () => {
    const c = { marca_interes: 'ford', tipo_interes: 'SUV', intereses: [] }
    const d = compatibilidad(c, veh).detalle
    const marca = d.find((x) => x.key === 'marca')
    const tipo = d.find((x) => x.key === 'tipo')
    expect(marca).toMatchObject({ aplica: true, ok: true })
    expect(tipo).toMatchObject({ aplica: true, ok: false })
  })
})

describe('precioEnArs', () => {
  it('convierte USD', () => {
    expect(precioEnArs({ moneda: 'USD', precio_contado: 10000 })).toBeGreaterThan(10000)
  })
  it('null → Infinity', () => {
    expect(precioEnArs({ moneda: 'ARS', precio_contado: null })).toBe(Infinity)
  })
})

describe('bucket', () => {
  it('umbrales', () => {
    expect(bucket(90)).toBe('alta')
    expect(bucket(60)).toBe('media')
    expect(bucket(20)).toBe('baja')
  })
})
