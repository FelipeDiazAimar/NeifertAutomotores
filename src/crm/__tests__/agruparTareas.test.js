import { describe, it, expect } from 'vitest'
import { agrupar } from '../lib/agruparTareas.js'

const hoy = new Date('2026-08-31T12:00:00')

const t = (id, fecha, extra = {}) => ({ id, titulo: id, fecha, done: false, ...extra })

describe('agrupar', () => {
  it('reparte por vencimiento', () => {
    const g = agrupar(
      [
        t('vencida', '2026-08-29'),
        t('hoy', '2026-08-31'),
        t('semana', '2026-09-03'),
        t('despues', '2026-09-20'),
        t('hecha', '2026-08-20', { done: true }),
      ],
      hoy,
    )
    expect(g.vencidas.map((x) => x.id)).toEqual(['vencida'])
    expect(g.hoy.map((x) => x.id)).toEqual(['hoy'])
    expect(g.semana.map((x) => x.id)).toEqual(['semana'])
    expect(g.despues.map((x) => x.id)).toEqual(['despues'])
    expect(g.hechas.map((x) => x.id)).toEqual(['hecha'])
  })

  it('ordena por hora dentro del grupo (nulls last)', () => {
    const g = agrupar(
      [
        t('b', '2026-08-31', { hora: '15:00' }),
        t('a', '2026-08-31', { hora: '09:00' }),
        t('c', '2026-08-31'),
      ],
      hoy,
    )
    expect(g.hoy.map((x) => x.id)).toEqual(['a', 'b', 'c'])
  })
})
