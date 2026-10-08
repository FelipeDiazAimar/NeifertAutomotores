import './entorno.js'
import { describe, expect, it } from 'vitest'

const { contactoDeVcard, vcardDe } = await import('../src/whatsapp.js')

describe('contactos compartidos (vCard)', () => {
  it('lee el nombre y los teléfonos de la vCard que manda el celular', () => {
    const vcard = 'BEGIN:VCARD\nVERSION:3.0\nN:Pérez;Juan;;;\nFN:Juan Pérez\nitem1.TEL;waid=5493564111111:+54 9 3564 11-1111\nitem1.X-ABLabel:Celular\nTEL;type=HOME:0351 4222222\nEND:VCARD'
    expect(contactoDeVcard({ displayName: '', vcard })).toEqual({
      nombre: 'Juan Pérez',
      telefonos: [
        { numero: '+54 9 3564 11-1111', waid: '5493564111111' },
        { numero: '0351 4222222', waid: null },
      ],
    })
  })

  it('arma una vCard que se vuelve a leer igual, con el número de WhatsApp', () => {
    const vcard = vcardDe({ nombre: 'Ana; Ventas', telefono: '5493406222222' })
    expect(vcard).toContain('TEL;type=CELL;type=VOICE;waid=5493406222222:+5493406222222')
    expect(contactoDeVcard({ vcard })).toEqual({ nombre: 'Ana; Ventas', telefonos: [{ numero: '+5493406222222', waid: '5493406222222' }] })
  })
})
