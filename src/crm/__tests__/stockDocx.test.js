import { describe, it, expect } from 'vitest'
import {
  formatearMilesDoc,
  contactoDuenio,
  filaStock,
  ordenarStock,
  fechaEmision,
  nombreArchivoStock,
  generarStockDocx,
} from '../lib/stockDocx'

describe('stockDocx (planilla de stock)', () => {
  it('formatea miles estilo papel: 21000 → "21.000"', () => {
    expect(formatearMilesDoc(21000)).toBe('21.000')
    expect(formatearMilesDoc(14100)).toBe('14.100')
    expect(formatearMilesDoc(8000)).toBe('8.000')
    expect(formatearMilesDoc(null)).toBe('')
    expect(formatearMilesDoc(undefined)).toBe('')
  })

  it('contacto dueño apila nombre y contacto', () => {
    expect(
      contactoDuenio({ duenio_nombre: 'MASSERA', duenio_apellido: '568660', duenio_contacto: '66-2059' })
    ).toEqual(['MASSERA 568660', '66-2059'])
    expect(contactoDuenio({})).toEqual([])
  })

  it('filaStock mapea las 8 columnas del papel y saltea bajas', () => {
    const f = filaStock({
      marca: 'CHEV', modelo: 'CRUZE', version: 'LT 1.4T MT 5P', anio: 2022, km: 160000,
      duenio_nombre: 'SEBA', duenio_apellido: 'NICOLAS', duenio_contacto: '4918',
      precio_canje: 21000, precio_contado: 20500, estado: 'disponible',
    })
    expect(f).toEqual([
      'CHEV', 'CRUZE', 'LT 1.4T MT 5P', '2022', '160.000',
      ['SEBA NICOLAS', '4918'], '21.000', '20.500',
    ])
    expect(filaStock({ estado: 'baja', marca: 'X' })).toBeNull()
  })

  it('ordena por marca y luego modelo (A-Z, sin importar acentos)', () => {
    const out = ordenarStock([
      { marca: 'Ford', modelo: 'Ranger' },
      { marca: 'Audi', modelo: 'A4' },
      { marca: 'Ford', modelo: 'Maverick' },
    ])
    expect(out.map((v) => v.modelo)).toEqual(['A4', 'Maverick', 'Ranger'])
  })

  it('fecha de emisión y nombre de archivo', () => {
    expect(fechaEmision(new Date(2026, 9, 2))).toBe('Viernes, 2 de octubre de 2026')
    expect(nombreArchivoStock(new Date(2026, 9, 2))).toBe('stock-neifert-2026-10-02.docx')
  })

  it('genera un .docx descargable (blob no vacío)', async () => {
    const blob = await generarStockDocx({
      vehiculos: [
        { marca: 'AUDI', modelo: 'A4', version: '1.8 TSFI MT', anio: 2011, km: 80000, estado: 'disponible' },
        { marca: 'FORD', modelo: 'RANGER', estado: 'baja' },
      ],
    })
    expect(blob.size).toBeGreaterThan(1000)
  })
})
