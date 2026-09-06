// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Button } from '@/components/ui/button'

describe('entorno base-nova + jsdom', () => {
  it('renderiza un Button', () => {
    render(
      <div className="crm-root">
        <Button>Guardar</Button>
      </div>,
    )
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeInTheDocument()
  })
})
