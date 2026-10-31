// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { esCampoDeTexto, insertarTexto } from '../dictado.js'

const input = (type = 'text', value = '') => {
  const el = document.createElement('input')
  el.type = type
  el.value = value
  document.body.appendChild(el)
  return el
}

describe('esCampoDeTexto', () => {
  it('acepta texto, buscador, teléfono, email y textarea', () => {
    for (const t of ['text', 'search', 'tel', 'email', 'url']) expect(esCampoDeTexto(input(t))).toBe(true)
    expect(esCampoDeTexto(document.createElement('textarea'))).toBe(true)
  })
  it('rechaza contraseñas, números, fechas, deshabilitados y solo lectura', () => {
    for (const t of ['password', 'number', 'date', 'time', 'checkbox']) expect(esCampoDeTexto(input(t))).toBe(false)
    const d = input('text')
    d.disabled = true
    expect(esCampoDeTexto(d)).toBe(false)
    const r = input('text')
    r.readOnly = true
    expect(esCampoDeTexto(r)).toBe(false)
    expect(esCampoDeTexto(null)).toBe(false)
  })
})

describe('insertarTexto', () => {
  it('agrega al final con un espacio de separación y avisa con un evento input', () => {
    const el = input('text', 'Hola')
    const onInput = vi.fn()
    el.addEventListener('input', onInput)
    insertarTexto(el, 'mundo')
    expect(el.value).toBe('Hola mundo')
    expect(onInput).toHaveBeenCalledTimes(1)
  })
  it('inserta en la posición del cursor', () => {
    const el = input('text', 'Hola mundo')
    el.setSelectionRange(4, 4)
    insertarTexto(el, 'lindo')
    expect(el.value).toBe('Hola lindo mundo')
  })
  it('en un campo vacío no agrega espacio', () => {
    const el = input('text', '')
    insertarTexto(el, 'hola')
    expect(el.value).toBe('hola')
  })
  it('en type=email (sin selección) agrega al final sin romper', () => {
    const el = input('email', 'a')
    expect(() => insertarTexto(el, 'b')).not.toThrow()
    expect(el.value).toBe('a b')
  })
})
