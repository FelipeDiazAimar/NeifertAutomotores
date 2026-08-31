import { describe, it, expect } from 'vitest'
import { mapVehiculo, mapEstadoVehiculo, mapGestoria, resumenPeritaje } from '../lib/mapeos.js'

describe('mapEstadoVehiculo', () => {
  it('mapea conocidos y cae a baja', () => {
    expect(mapEstadoVehiculo('disponible')).toBe('disponible')
    expect(mapEstadoVehiculo('vendido')).toBe('vendido')
    expect(mapEstadoVehiculo('reservado')).toBe('reservado')
    expect(mapEstadoVehiculo(null)).toBe('baja')
    expect(mapEstadoVehiculo('cualquier_cosa')).toBe('baja')
  })
})

describe('mapVehiculo', () => {
  const legacy = {
    id: '6abc', brand: 'TOYOTA', model: 'HILUX', year: 2015, km: 128000,
    moneda_contado: 'ARS', precio_contado: null, itv: 'si', carpeta_entregada: 0,
    status: 'disponible', consignacion: 1,
  }
  it('tipa y traza id_legacy', () => {
    const r = mapVehiculo(legacy)
    expect(r.id_legacy).toBe('6abc')
    expect(r).not.toHaveProperty('id')
    expect(r.marca).toBe('TOYOTA')
    expect(r.anio).toBe(2015)
    expect(r.moneda).toBe('ARS')
    expect(r.carpeta_entregada).toBe(false)
    expect(r.consignacion).toBe(true)
    expect(r.estado).toBe('disponible')
  })
  it('distingue null de 0 en precios', () => {
    expect(mapVehiculo({ ...legacy, precio_contado: null }).precio_contado).toBe(null)
    expect(mapVehiculo({ ...legacy, precio_contado: 0 }).precio_contado).toBe(0)
  })
  it('moneda USD', () => {
    expect(mapVehiculo({ ...legacy, moneda_contado: 'USD' }).moneda).toBe('USD')
  })
})

describe('mapGestoria', () => {
  it('expande columnas espejo del legacy', () => {
    const r = mapGestoria({ id: 3, vehiculo_id: 'v', form08: 1, form08_fecha: '2026-06-02', form08_nota: 'x', verif_policial: 0 })
    expect(r.form08_hecho).toBe(true)
    expect(r.form08_fecha).toBe('2026-06-02')
    expect(r.form08_nota).toBe('x')
    expect(r.verif_policial_hecho).toBe(false)
    expect(r.id_legacy).toBe(3)
  })
  it('fecha "0000-00-00" → null', () => {
    expect(mapGestoria({ id: 1, fecha_inicio: '0000-00-00' }).fecha_inicio).toBe(null)
  })
})

describe('resumenPeritaje', () => {
  it('cuenta ok/obs/falta sobre items de estado, ignora texto y na', () => {
    const datos = { motor: 'ok', frenos: 'obs', abs: 'falta', bateria: 'ok', cajaAT: 'na', obsMotor: 'texto libre', costoB: 1000 }
    expect(resumenPeritaje(datos)).toEqual({ items_ok: 2, items_obs: 1, items_falta: 1 })
  })
  it('acepta sinónimos y vacío', () => {
    const datos = { motor: 'observación', frenos: 'mal', abs: '', airbag: 'OK' }
    expect(resumenPeritaje(datos)).toEqual({ items_ok: 1, items_obs: 1, items_falta: 1 })
  })
  it('objeto vacío → todo 0', () => {
    expect(resumenPeritaje({})).toEqual({ items_ok: 0, items_obs: 0, items_falta: 0 })
  })
})
