import { describe, it, expect, vi } from 'vitest'

vi.mock('@/services/supabaseClient', () => ({
  supabase: null,
  isSupabaseConfigured: false,
}))

import {
  fetchLeads,
  fetchLeadById,
  createLead,
  updateLead,
  resumenVehiculo,
  resumenIntereses,
} from '@/services/leads.service'

describe('leads.service (vehículos de interés / entrega)', () => {
  it('resumenVehiculo arma "marca modelo version año" omitiendo vacíos', () => {
    expect(
      resumenVehiculo({ marca: 'Toyota', modelo: 'Corolla', version: 'XEi', anio: 2022 })
    ).toBe('Toyota Corolla XEi 2022')
    expect(resumenVehiculo({ marca: 'Fiat', modelo: null, anio: null })).toBe('Fiat')
    expect(resumenVehiculo(null)).toBe('')
  })

  it('resumenIntereses une con · para el campo viejo de texto', () => {
    expect(resumenIntereses([])).toBe('')
    expect(
      resumenIntereses([
        { marca: 'Toyota', modelo: 'Corolla', anio: 2022 },
        { marca: 'Ford', modelo: 'Fiesta' },
      ])
    ).toBe('Toyota Corolla 2022 · Ford Fiesta')
  })

  it('fetchLeads demo normaliza las listas a [] aunque el mock no las traiga', async () => {
    const leads = await fetchLeads()
    expect(leads.length).toBeGreaterThan(0)
    for (const l of leads) {
      expect(Array.isArray(l.vehiculos_interes)).toBe(true)
      expect(Array.isArray(l.autos_entrega)).toBe(true)
    }
  })

  it('crear + buscar por modelo de interés + actualizar listas (ida y vuelta)', async () => {
    const modeloUnico = 'ModeloUnicoXyz123'
    const lead = await createLead({
      full_name: 'Test Vehiculos',
      phone: '123456',
      vehiculos_interes: [{ condicion: 'cero', marca: 'TestMarca', modelo: modeloUnico, anio: 2025 }],
      autos_entrega: [{ condicion: 'usado', marca: 'EntregaMarca', modelo: 'EntregaModelo' }],
    })
    expect(lead.vehiculos_interes).toHaveLength(1)

    const encontrados = await fetchLeads({ search: modeloUnico.toLowerCase() })
    expect(encontrados.some((l) => l.id === lead.id)).toBe(true)

    const porEntrega = await fetchLeads({ search: 'entregamarca' })
    expect(porEntrega.some((l) => l.id === lead.id)).toBe(true)

    const actualizado = await updateLead(lead.id, {
      vehiculos_interes: [
        ...lead.vehiculos_interes,
        { condicion: 'usado', marca: 'Otra', modelo: 'OtroModelo' },
      ],
    })
    expect(actualizado.vehiculos_interes).toHaveLength(2)
    const releido = await fetchLeadById(lead.id)
    expect(releido.vehiculos_interes).toHaveLength(2)
    expect(releido.autos_entrega).toHaveLength(1)
  })
})
