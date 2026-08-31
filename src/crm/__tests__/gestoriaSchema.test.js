import { describe, it, expect } from 'vitest'
import { GESTORIA_ITEMS } from '../lib/gestoriaSchema.js'

describe('GESTORIA_ITEMS', () => {
  it('tiene los 8 trámites con label', () => {
    expect(GESTORIA_ITEMS.map((i) => i.key)).toEqual([
      'form08', 'verif_policial', 'multas_nac', 'dominio_hist',
      'libre_deudas', 'titulo', 'cedulas', 'identificacion',
    ])
    for (const i of GESTORIA_ITEMS) expect(i.label).toBeTruthy()
  })
})
