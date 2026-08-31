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
  })
})
