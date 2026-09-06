// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import TareaRow from '../components/TareaRow.jsx'

const tarea = { id: 't1', titulo: 'Llamar a Ana', fecha: '2026-09-01', done: false, prioridad: 'normal' }
const props = { onToggle: vi.fn(), onEditar: vi.fn(), onArchivar: vi.fn(), onEliminar: vi.fn() }
const wrap = (ui) => render(<MemoryRouter>{ui}</MemoryRouter>)

describe('TareaRow', () => {
  it('click en el checkbox llama onToggle con true', async () => {
    const onToggle = vi.fn()
    wrap(<TareaRow tarea={tarea} {...props} onToggle={onToggle} />)
    await userEvent.click(screen.getByRole('button', { name: /marcar hecha/i }))
    expect(onToggle).toHaveBeenCalledWith(tarea, true)
  })

  it('sin puedeEliminar no hay opción Eliminar', async () => {
    wrap(<TareaRow tarea={tarea} {...props} puedeEliminar={false} />)
    await userEvent.click(screen.getByRole('button', { name: /acciones/i }))
    expect(screen.queryByRole('menuitem', { name: /eliminar/i })).not.toBeInTheDocument()
  })
})
