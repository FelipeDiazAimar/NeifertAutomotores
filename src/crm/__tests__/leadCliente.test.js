import { describe, it, expect } from 'vitest'
import { normTel, normNombre, clienteQueCoincide, canalDeOrigen, itemAFila } from '../lib/leadCliente.js'

describe('normTel', () => {
  it('iguala distintos formatos del mismo teléfono', () => {
    expect(normTel('+54 9 3564-66-9753')).toBe('3564669753')
    expect(normTel('3564669753')).toBe('3564669753')
    expect(normTel('(03564) 66 9753')).toBe('3564669753')
  })
  it('vacío si no hay dígitos suficientes', () => {
    expect(normTel('')).toBe('')
    expect(normTel(null)).toBe('')
    expect(normTel('123')).toBe('')
  })
})

describe('clienteQueCoincide', () => {
  const clientes = [
    { id: 'a', nombre: 'Juan Pérez', telefono: '+54 9 3564-66-9753' },
    { id: 'b', nombre: 'Julio  Bovo', telefono: null },
  ]
  it('con teléfono, cruza por teléfono aunque cambie el formato', () => {
    expect(clienteQueCoincide({ telefono: '3564669753', nombre_completo: 'otro' }, clientes).id).toBe('a')
  })
  it('con teléfono que no existe, no coincide aunque el nombre sí', () => {
    expect(clienteQueCoincide({ telefono: '3511111111', nombre_completo: 'Juan Pérez' }, clientes)).toBeNull()
  })
  it('sin teléfono, cruza por nombre sin tildes ni mayúsculas', () => {
    expect(clienteQueCoincide({ telefono: '', nombre_completo: ' julio bovo ' }, clientes).id).toBe('b')
    expect(normNombre('  Árbol   GRANDE ')).toBe('arbol grande')
  })
  it('sin teléfono ni nombre, no coincide con nada', () => {
    expect(clienteQueCoincide({ telefono: '', nombre_completo: '' }, clientes)).toBeNull()
  })
})

describe('canalDeOrigen', () => {
  it('traduce el origen del lead al canal del cliente', () => {
    expect(canalDeOrigen('Showroom')).toBe('salon')
    expect(canalDeOrigen('WhatsApp')).toBe('whatsapp')
    expect(canalDeOrigen(' instagram ')).toBe('instagram')
    expect(canalDeOrigen('Referido')).toBe('referido')
  })
  it('lo desconocido va a "otro"', () => {
    expect(canalDeOrigen('Cartel')).toBe('otro')
    expect(canalDeOrigen(undefined)).toBe('otro')
  })
})

describe('itemAFila', () => {
  it('deja solo columnas conocidas y con valor', () => {
    expect(itemAFila({ marca: 'Fiat', modelo: '', km: null, tipo: 'Sedan', valor: 1000, moneda: 'ARS', raro: 1 })).toEqual({
      marca: 'Fiat',
      tipo: 'Sedan',
      valor: 1000,
      moneda: 'ARS',
    })
  })
  it('trans solo en autos en entrega', () => {
    expect(itemAFila({ marca: 'Fiat', trans: 'manual' })).toEqual({ marca: 'Fiat' })
    expect(itemAFila({ marca: 'Fiat', trans: 'manual' }, { conTransmision: true })).toEqual({ marca: 'Fiat', trans: 'manual' })
  })
})

describe('agruparDuplicados', () => {
  const c = (id, telefono, creado_en, nombre = 'X') => ({ id, telefono, creado_en, nombre })

  it('agrupa por teléfono normalizado y descarta los únicos y los sin teléfono', async () => {
    const { agruparDuplicados } = await import('../lib/leadCliente.js')
    const g = agruparDuplicados([
      c('a', '3492 12-3456', '2026-01-01'),
      c('b', '+54 9 3492123456', '2026-02-01'),
      c('c', '3564000000', '2026-03-01'),
      c('d', '', '2026-03-02'),
      c('e', null, '2026-03-03'),
    ])
    expect(g).toHaveLength(1)
    expect(g[0].clientes.map((x) => x.id)).toEqual(['a', 'b'])
  })

  it('ordena cada grupo del más viejo al más nuevo y los grupos por alta reciente', async () => {
    const { agruparDuplicados } = await import('../lib/leadCliente.js')
    const g = agruparDuplicados([
      c('n2', '3000000001', '2026-05-01'),
      c('n1', '3000000001', '2026-04-01'),
      c('m2', '3000000002', '2026-08-01'),
      c('m1', '3000000002', '2026-07-01'),
    ])
    expect(g.map((x) => x.clave)).toEqual(['3000000002', '3000000001'])
    expect(g[1].clientes.map((x) => x.id)).toEqual(['n1', 'n2'])
  })
})
