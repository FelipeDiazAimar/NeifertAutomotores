// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

const signInWithPassword = vi.fn()
vi.mock('@/services/supabaseClient', () => ({
  isSupabaseConfigured: true,
  supabase: { auth: { signInWithPassword: (...a) => signInWithPassword(...a) } },
}))

const { default: CrmLoginPage } = await import('../pages/CrmLoginPage.jsx')

beforeEach(() => signInWithPassword.mockReset())

function renderLogin() {
  return render(
    <MemoryRouter>
      <CrmLoginPage />
    </MemoryRouter>,
  )
}

describe('CrmLoginPage', () => {
  it('convierte usuario a email sintético y llama signInWithPassword', async () => {
    signInWithPassword.mockResolvedValue({ data: { session: {} }, error: null })
    renderLogin()
    await userEvent.type(screen.getByLabelText(/usuario/i), 'Bruno')
    await userEvent.type(screen.getByLabelText(/contraseña/i), 'secreta')
    await userEvent.click(screen.getByRole('button', { name: /ingresar/i }))
    expect(signInWithPassword).toHaveBeenCalledWith({
      email: 'bruno@crm-viejo.neifert.local',
      password: 'secreta',
    })
  })

  it('muestra error de credenciales', async () => {
    signInWithPassword.mockResolvedValue({ data: {}, error: { message: 'Invalid login credentials' } })
    renderLogin()
    await userEvent.type(screen.getByLabelText(/usuario/i), 'Bruno')
    await userEvent.type(screen.getByLabelText(/contraseña/i), 'mala')
    await userEvent.click(screen.getByRole('button', { name: /ingresar/i }))
    expect(await screen.findByText(/usuario o contraseña incorrectos/i)).toBeInTheDocument()
  })
})
