import { describe, it, expect } from 'vitest'
import {
  VISTAS,
  ROL_LABEL,
  vistaDeRuta,
  vistasEfectivas,
  primeraRutaPermitida,
} from '@/crm/lib/vistas.js'

describe('vistas.js', () => {
  it('VISTAS tiene las 6 vistas top-level en orden', () => {
    expect(VISTAS.map((v) => v.key)).toEqual([
      'panel', 'clientes', 'vehiculos', 'tareas', 'usuarios', 'roles',
    ])
  })

  it('ROL_LABEL cubre los 3 roles', () => {
    expect(ROL_LABEL).toEqual({ admin: 'Admin', dueno: 'Dueño', vendedor: 'Vendedor' })
  })

  describe('vistaDeRuta', () => {
    it('/crm exacto → panel', () => {
      expect(vistaDeRuta('/crm')).toBe('panel')
    })
    it('subrutas mapean a su vista', () => {
      expect(vistaDeRuta('/crm/clientes/abc-123')).toBe('clientes')
      expect(vistaDeRuta('/crm/vehiculos')).toBe('vehiculos')
      expect(vistaDeRuta('/crm/tareas')).toBe('tareas')
      expect(vistaDeRuta('/crm/usuarios')).toBe('usuarios')
      expect(vistaDeRuta('/crm/roles')).toBe('roles')
    })
    it('rutas sin gate → null', () => {
      expect(vistaDeRuta('/crm/cambiar-password')).toBeNull()
      expect(vistaDeRuta('/crm/login')).toBeNull()
      expect(vistaDeRuta('/otra')).toBeNull()
    })
  })

  describe('vistasEfectivas', () => {
    const rolesMap = {
      vendedor: { vistas_default: ['panel', 'clientes', 'vehiculos', 'tareas'] },
      admin: { vistas_default: ['panel', 'clientes', 'vehiculos', 'tareas', 'usuarios', 'roles'] },
    }
    it('sin override usa las del rol', () => {
      expect(vistasEfectivas({ rol: 'vendedor' }, rolesMap)).toEqual([
        'panel', 'clientes', 'vehiculos', 'tareas',
      ])
    })
    it('con override usa el override', () => {
      expect(vistasEfectivas({ rol: 'vendedor', vistas_override: ['panel'] }, rolesMap)).toEqual(['panel'])
    })
    it('rol desconocido → []', () => {
      expect(vistasEfectivas({ rol: 'fantasma' }, rolesMap)).toEqual([])
    })
  })

  describe('primeraRutaPermitida', () => {
    it('devuelve la ruta de la primera VISTA habilitada', () => {
      expect(primeraRutaPermitida(['tareas', 'clientes'])).toBe('/crm/clientes')
    })
    it('sin vistas → null', () => {
      expect(primeraRutaPermitida([])).toBeNull()
    })
  })
})
