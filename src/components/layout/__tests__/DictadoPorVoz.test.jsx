// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useState } from 'react'
import { render, screen, fireEvent, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('sonner', () => ({ toast: { info: vi.fn(), error: vi.fn() } }))
import { toast } from 'sonner'
import DictadoPorVoz from '../DictadoPorVoz.jsx'

let instancias = []
class FakeSR {
  constructor() {
    instancias.push(this)
  }
  start() {
    this.iniciado = true
  }
  stop() {
    this.iniciado = false
    this.onend?.()
  }
  abort() {}
}
const resultado = (texto, isFinal = true) => ({
  resultIndex: 0,
  results: [Object.assign([{ transcript: texto }], { isFinal })],
})

function Campo() {
  const [v, setV] = useState('')
  return <input aria-label="nombre" value={v} onChange={(e) => setV(e.target.value)} />
}

describe('DictadoPorVoz', () => {
  beforeEach(() => {
    instancias = []
    vi.clearAllMocks()
    window.webkitSpeechRecognition = FakeSR
  })
  afterEach(() => {
    delete window.webkitSpeechRecognition
  })

  it('no muestra nada si el navegador no soporta reconocimiento de voz', () => {
    delete window.webkitSpeechRecognition
    const { container } = render(<DictadoPorVoz />)
    expect(container).toBeEmptyDOMElement()
  })

  it('sin campo elegido avisa que hay que hacer clic en uno', async () => {
    render(<DictadoPorVoz />)
    await userEvent.click(screen.getByRole('button', { name: /dictar por voz/i }))
    expect(toast.info).toHaveBeenCalled()
    expect(instancias).toHaveLength(0)
  })

  it('dicta en el último campo enfocado (input controlado de React)', async () => {
    render(
      <>
        <Campo />
        <DictadoPorVoz />
      </>
    )
    await userEvent.click(screen.getByLabelText('nombre'))
    await userEvent.click(screen.getByRole('button', { name: /dictar por voz/i }))
    expect(instancias[0].iniciado).toBe(true)
    expect(instancias[0].lang).toBe('es-AR')

    act(() => instancias[0].onresult(resultado('Juan Pérez')))
    expect(screen.getByLabelText('nombre')).toHaveValue('Juan Pérez')

    act(() => instancias[0].onresult(resultado('de Rafaela')))
    expect(screen.getByLabelText('nombre')).toHaveValue('Juan Pérez de Rafaela')
  })

  it('el atajo Ctrl+Shift+H activa y Escape detiene', async () => {
    render(
      <>
        <Campo />
        <DictadoPorVoz />
      </>
    )
    await userEvent.click(screen.getByLabelText('nombre'))
    fireEvent.keyDown(document, { key: 'H', ctrlKey: true, shiftKey: true })
    expect(instancias).toHaveLength(1)
    expect(screen.getByRole('button', { name: /detener dictado/i })).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.getByRole('button', { name: /dictar por voz/i })).toBeInTheDocument()
  })

  it('si el navegador no tiene permiso de micrófono lo explica', async () => {
    render(
      <>
        <Campo />
        <DictadoPorVoz />
      </>
    )
    await userEvent.click(screen.getByLabelText('nombre'))
    await userEvent.click(screen.getByRole('button', { name: /dictar por voz/i }))
    act(() => instancias[0].onerror({ error: 'not-allowed' }))
    expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/permiso para usar el micrófono/i))
    expect(screen.getByRole('button', { name: /dictar por voz/i })).toBeInTheDocument()
  })
})
