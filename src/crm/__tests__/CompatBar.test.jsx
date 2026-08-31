// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import CompatBar from '../components/CompatBar.jsx'

describe('CompatBar', () => {
  it('aria-label y relleno por score', () => {
    render(<CompatBar score={40} bucket="baja" />)
    const bar = screen.getByRole('img', { name: /compatibilidad 40%/i })
    expect(bar.firstChild).toHaveStyle({ width: '40%' })
    expect(bar.firstChild.className).toMatch(/bg-neifert/)
    expect(screen.getByText('40%')).toBeInTheDocument()
  })

  it('bucket alta → verde', () => {
    render(<CompatBar score={95} bucket="alta" />)
    expect(screen.getByRole('img').firstChild.className).toMatch(/bg-success/)
  })
})
