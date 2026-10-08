import './entorno.js'
import { describe, expect, it } from 'vitest'
import { fuenteCopia } from '../src/archivos.js'

describe('copias en R2', () => {
  it('CopySource codifica cada parte pero deja las barras (antes salía %2F y fallaba)', () => {
    // Sin bucket en los tests: queda "/<clave>"; en el servidor real va el nombre del bucket adelante.
    expect(fuenteCopia('media/Juan Pérez (+5493406000005)/F1.jpg')).toBe('/media/Juan%20P%C3%A9rez%20(%2B5493406000005)/F1.jpg')
    expect(fuenteCopia('media/a/b.jpg').includes('%2F')).toBe(false)
  })
})
