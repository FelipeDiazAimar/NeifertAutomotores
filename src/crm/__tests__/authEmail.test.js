import { describe, it, expect } from 'vitest'
import { emailDeUsuario } from '../lib/authEmail.js'

// Oráculo: cuerpo exacto de crmShadowEmail en src/server/crmCore.js
const oraculo = (u) => `${String(u).toLowerCase().replace(/[^a-z0-9]/g, '')}@crm-viejo.neifert.local`

describe('emailDeUsuario', () => {
  it('normaliza minúsculas y saca no-alfanuméricos', () => {
    expect(emailDeUsuario('Bruno')).toBe('bruno@crm-viejo.neifert.local')
    expect(emailDeUsuario('Juan Pérez')).toBe('juanprez@crm-viejo.neifert.local')
  })

  it('coincide con crmShadowEmail del servidor', () => {
    for (const u of ['Bruno', 'Cristian', 'Nico', 'Valeria', 'Juani ', 'Víctor 2']) {
      expect(emailDeUsuario(u)).toBe(oraculo(u))
    }
  })
})
