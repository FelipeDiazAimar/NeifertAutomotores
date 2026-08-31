// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import DetalleCompatModal from '../components/DetalleCompatModal.jsx'

const resultado = {
  score: 55,
  bucket: 'media',
  detalle: [
    { key: 'marca', label: 'Marca', aplica: true, ok: true, clienteDice: 'Ford', vehiculoDice: 'Ford' },
    { key: 'tipo', label: 'Tipo', aplica: true, ok: false, clienteDice: 'SUV', vehiculoDice: 'Hatchback' },
    { key: 'anio', label: 'Año', aplica: false, ok: false, clienteDice: null, vehiculoDice: 2016 },
  ],
}

describe('DetalleCompatModal', () => {
  it('muestra criterios y notas', () => {
    render(
      <DetalleCompatModal
        open
        onClose={vi.fn()}
        cliente={{ nombre: 'Ana', notas: 'de contado' }}
        vehiculo={{ marca: 'Ford', modelo: 'KA', anio: 2016 }}
        resultado={resultado}
      />,
    )
    expect(screen.getByText(/Media compatibilidad/)).toBeInTheDocument()
    expect(screen.getByText('Marca')).toBeInTheDocument()
    expect(screen.getByText('Tipo')).toBeInTheDocument()
    expect(screen.getAllByText(/Cliente busca:/).length).toBe(2) // marca y tipo aplican; año no
    expect(screen.getByText('de contado')).toBeInTheDocument()
    expect(screen.getByText('Cerrar')).toBeInTheDocument() // botón del footer
  })

  it('muestra el botón de WhatsApp cuando el cliente tiene teléfono', () => {
    render(
      <DetalleCompatModal
        open
        onClose={vi.fn()}
        cliente={{ nombre: 'Marcelo', telefono: '3564 55-1122' }}
        vehiculo={{ marca: 'Ford', modelo: 'KA', anio: 2016 }}
        resultado={resultado}
      />,
    )
    const link = screen.getByRole('link', { name: /whatsapp/i })
    expect(link).toHaveAttribute('href', expect.stringContaining('https://api.whatsapp.com/send/?'))
    expect(link).toHaveAttribute('href', expect.stringContaining('phone=3564551122'))
  })

  it('sin teléfono no muestra WhatsApp', () => {
    render(
      <DetalleCompatModal
        open
        onClose={vi.fn()}
        cliente={{ nombre: 'Ana' }}
        vehiculo={{ marca: 'Ford', modelo: 'KA', anio: 2016 }}
        resultado={resultado}
      />,
    )
    expect(screen.queryByRole('link', { name: /whatsapp/i })).not.toBeInTheDocument()
  })
})
