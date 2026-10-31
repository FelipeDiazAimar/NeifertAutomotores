import { expect, it } from 'vitest'
import { LATIDO_VENCE_MS, puedeTomar } from '../src/nube.js'

const ahora = 1_000_000
it('puedeTomar: libre, propio, ajeno vivo, ajeno vencido, forzado', () => {
  expect(puedeTomar(undefined, 'a', ahora)).toBe(true)
  expect(puedeTomar({ id: 'a', ts: ahora }, 'a', ahora)).toBe(true)
  expect(puedeTomar({ id: 'b', ts: ahora - 1000 }, 'a', ahora)).toBe(false)
  expect(puedeTomar({ id: 'b', ts: ahora - LATIDO_VENCE_MS - 1 }, 'a', ahora)).toBe(true)
  expect(puedeTomar({ id: 'b', ts: ahora }, 'a', ahora, true)).toBe(true)
})
