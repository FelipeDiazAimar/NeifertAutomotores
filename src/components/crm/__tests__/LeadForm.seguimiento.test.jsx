// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const crearCliente = vi.fn()
const crearTarea = vi.fn()
const crearAlerta = vi.fn()

vi.mock('@/crm/hooks/useClientes', () => ({
  useClienteMutations: () => ({ crearCompleto: { mutateAsync: crearCliente, isPending: false } }),
}))
vi.mock('@/crm/hooks/useTareas', () => ({ useTareaMutations: () => ({ crear: { mutateAsync: crearTarea } }) }))
vi.mock('@/crm/hooks/useAlertas', () => ({ useAlertaMutations: () => ({ crear: { mutateAsync: crearAlerta } }) }))
vi.mock('@/crm/hooks/useCrmUsuarios', () => ({
  useCrmUsuarios: () => ({
    data: [
      { id: 'u1', usuario: 'bruno', nombre: 'Bruno', activo: true },
      { id: 'u2', usuario: 'valeria', nombre: 'Valeria', activo: true },
      { id: 'ua', usuario: 'admin', nombre: 'Admin', activo: true },
    ],
  }),
}))
vi.mock('@/crm/hooks/useCrmPerfil', () => ({ useCrmPerfil: () => ({ id: 'u1' }) }))

import LeadForm from '../LeadForm.jsx'
import { validarSeguimiento, usuariosAsignables } from '@/lib/leadSeguimiento'

// Los desplegables son botones "Agregar…" en este orden: interés, entrega, tarea, alerta.
const desplegable = (i) => screen.getAllByRole('button', { name: /agregar/i })[i]
const TAREA = 2
const ALERTA = 3

async function cargarDatosBasicos() {
  await userEvent.type(screen.getByLabelText('Nombre completo'), 'Juan Pérez')
  await userEvent.type(screen.getByLabelText('Teléfono'), '3492123456')
}

describe('LeadForm — alta de cliente con tarea y alerta', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    crearCliente.mockResolvedValue({ id: 'cli-1' })
    crearTarea.mockResolvedValue({})
    crearAlerta.mockResolvedValue({})
  })

  it('crea la tarea y la alerta vinculadas al cliente nuevo', async () => {
    render(<LeadForm />)
    await cargarDatosBasicos()
    await userEvent.click(desplegable(TAREA))
    await userEvent.click(desplegable(ALERTA))
    const titulos = screen.getAllByLabelText('Título')
    await userEvent.type(titulos[0], 'Llamar')
    await userEvent.type(titulos[1], 'Recordar presupuesto')
    const horas = screen.getAllByLabelText('Hora')
    await userEvent.type(horas[1], '10:30')
    await userEvent.click(screen.getByRole('button', { name: /registrar cliente/i }))

    await vi.waitFor(() => expect(crearAlerta).toHaveBeenCalled())
    expect(crearTarea).toHaveBeenCalledWith(
      expect.objectContaining({ titulo: 'Llamar', cliente_id: 'cli-1', asignado_a: 'u1' })
    )
    expect(crearAlerta).toHaveBeenCalledWith(
      expect.objectContaining({ titulo: 'Recordar presupuesto', hora: '10:30', cliente_id: 'cli-1' })
    )
  })

  it('se puede asignar la tarea a otro usuario', async () => {
    render(<LeadForm />)
    await cargarDatosBasicos()
    await userEvent.click(desplegable(TAREA))
    await userEvent.type(screen.getByLabelText('Título'), 'Llamar')
    await userEvent.click(screen.getByRole('button', { name: /bruno/i }))
    expect(screen.queryByRole('button', { name: /^admin$/i })).toBeNull()
    await userEvent.click(await screen.findByRole('button', { name: /valeria/i }))
    await userEvent.click(screen.getByRole('button', { name: /registrar cliente/i }))
    await vi.waitFor(() => expect(crearTarea).toHaveBeenCalled())
    expect(crearTarea).toHaveBeenCalledWith(expect.objectContaining({ asignado_a: 'u2' }))
  })

  it('crea el cliente con sus datos y el canal elegido', async () => {
    render(<LeadForm />)
    await cargarDatosBasicos()
    await userEvent.click(screen.getByRole('button', { name: /registrar cliente/i }))
    await vi.waitFor(() => expect(crearCliente).toHaveBeenCalled())
    expect(crearCliente).toHaveBeenCalledWith(
      expect.objectContaining({ nombre: 'Juan Pérez', telefono: '3492123456', canal: 'salon', intereses: [], autos_entrega: [] })
    )
  })

  it('sin título no crea ni tarea ni alerta', async () => {
    render(<LeadForm />)
    await cargarDatosBasicos()
    await userEvent.click(screen.getByRole('button', { name: /registrar cliente/i }))
    await vi.waitFor(() => expect(crearCliente).toHaveBeenCalled())
    expect(crearTarea).not.toHaveBeenCalled()
    expect(crearAlerta).not.toHaveBeenCalled()
  })

  it('una alerta sin hora frena el alta del cliente', async () => {
    render(<LeadForm />)
    await cargarDatosBasicos()
    await userEvent.click(desplegable(ALERTA))
    await userEvent.type(screen.getByLabelText('Título'), 'Aviso')
    await userEvent.click(screen.getByRole('button', { name: /registrar cliente/i }))
    await new Promise((r) => setTimeout(r, 50))
    expect(crearCliente).not.toHaveBeenCalled()
  })
})

describe('usuariosAsignables', () => {
  const lista = [
    { id: 'u1', usuario: 'bruno', activo: true },
    { id: 'ua', usuario: 'admin', activo: true },
    { id: 'u3', usuario: 'viejo', activo: false },
  ]
  it('esconde a admin y a los inactivos', () => {
    expect(usuariosAsignables(lista, 'u1').map((u) => u.id)).toEqual(['u1'])
  })
  it('admin aparece si el que carga es admin', () => {
    expect(usuariosAsignables(lista, 'ua').map((u) => u.id)).toEqual(['u1', 'ua'])
  })
})

describe('validarSeguimiento', () => {
  const t = { titulo: '', fecha: '2026-11-01', hora: '' }
  it('sin títulos no valida nada', () => {
    expect(validarSeguimiento({ ...t, fecha: '' }, { ...t, fecha: '', hora: '' })).toBeNull()
  })
  it('alerta sin hora → error', () => {
    expect(validarSeguimiento(t, { ...t, titulo: 'x' })).toMatch(/hora de la alerta/)
  })
  it('tarea sin fecha → error', () => {
    expect(validarSeguimiento({ ...t, titulo: 'x', fecha: '' }, t)).toMatch(/fecha de la tarea/)
  })
})
