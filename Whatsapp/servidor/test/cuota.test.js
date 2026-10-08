import './entorno.js'
import { beforeAll, describe, expect, it } from 'vitest'

// Con R2 "configurado" (credenciales de mentira: nunca se conecta) y un tope de 1 GB.
Object.assign(process.env, {
  WA_R2_BUCKET: 'bucket-de-prueba',
  WA_R2_ENDPOINT: 'https://prueba.r2.cloudflarestorage.com',
  WA_R2_ACCESS_KEY_ID: 'id',
  WA_R2_SECRET_ACCESS_KEY: 'secreto',
  WA_R2_LIMITE_GB: '1',
})
let cuota
beforeAll(async () => {
  cuota = await import('../src/cuota.js')
})

const GB = 1024 ** 3

describe('tope de espacio en R2', () => {
  it('toma el tope de WA_R2_LIMITE_GB', () => {
    expect(cuota.activa()).toBe(true)
    expect(cuota.LIMITE).toBe(GB)
  })

  it('antes de medir no frena nada', () => {
    expect(() => cuota.permitir('media/x/a.jpg', 2 * GB)).not.toThrow()
  })

  it('mide el bucket sumando todos los archivos', async () => {
    const listar = async () => [{ tamano: 0.5 * GB }, { tamano: 0.3 * GB }]
    expect(await cuota.medir(listar)).toBe(0.8 * GB)
    expect(cuota.fraccion()).toBeCloseTo(0.8)
  })

  it('no deja subir lo que haría pasar el tope', () => {
    expect(() => cuota.permitir('media/x/b.mp4', 0.1 * GB)).not.toThrow()
    let error
    try {
      cuota.permitir('media/x/c.mp4', 0.3 * GB)
    } catch (err) {
      error = err
    }
    expect(error?.code).toBe('SIN_ESPACIO')
    expect(error?.message).toMatch(/0\.80 GB usados.*1\.00 GB/)
  })

  it('el respaldo de la sesión y los paquetes del servidor pasan siempre', () => {
    expect(() => cuota.permitir('respaldo/sesion.enc', 0.5 * GB)).not.toThrow()
    expect(() => cuota.permitir('app/servidor/x.tar.gz', 0.5 * GB)).not.toThrow()
  })

  it('lleva la cuenta de lo que se sube', () => {
    cuota.sumar(0.1 * GB)
    expect(cuota.estadoCuota().usado).toBe(0.9 * GB)
    expect(cuota.fraccion()).toBeGreaterThanOrEqual(cuota.UMBRAL_LIMPIEZA)
  })
})
