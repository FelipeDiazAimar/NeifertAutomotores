// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import VistasChecklist from '../components/VistasChecklist.jsx'

describe('VistasChecklist', () => {
  it('marca una vista y emite el array nuevo en orden de VISTAS', async () => {
    const onChange = vi.fn()
    render(<VistasChecklist value={['panel']} onChange={onChange} />)
    await userEvent.click(screen.getByRole('checkbox', { name: 'Clientes' }))
    expect(onChange).toHaveBeenCalledWith(['panel', 'clientes'])
  })

  it('desmarca una vista ya activa', async () => {
    const onChange = vi.fn()
    render(<VistasChecklist value={['panel', 'clientes']} onChange={onChange} />)
    await userEvent.click(screen.getByRole('checkbox', { name: 'Panel' }))
    expect(onChange).toHaveBeenCalledWith(['clientes'])
  })

  it('disabled no emite', async () => {
    const onChange = vi.fn()
    render(<VistasChecklist value={[]} onChange={onChange} disabled />)
    await userEvent.click(screen.getByRole('checkbox', { name: 'Panel' }))
    expect(onChange).not.toHaveBeenCalled()
  })
})
