import { DIR_PRUEBA } from './entorno.js'
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { anotar, cerrarTramo, pendientesEnDiario, recuperar, tramoGuardado } from '../src/diario.js'

const DIR = path.join(DIR_PRUEBA, 'diario')

describe('diario local (sin pérdida ante un corte)', () => {
  it('lo anotado y no confirmado se recupera en orden al arrancar', () => {
    anotar({ jid: 'a', m: { id: '1' } }, { urgente: true })
    anotar({ jid: 'a', m: { id: '2' } })
    anotar({ chat: 'a', c: { noLeidos: 2 } })
    expect(pendientesEnDiario()).toBe(3)
    const tramo = cerrarTramo()
    expect(tramo).toMatch(/tramo-\d+\.jsonl$/)
    // Llega más después de cerrar el tramo (mientras la tanda se escribe).
    anotar({ jid: 'a', m: { id: '3' } }, { urgente: true })
    cerrarTramo()
    const entradas = recuperar()
    expect(entradas.map((e) => e.m?.id ?? 'chat')).toEqual(['1', '2', 'chat', '3'])
  })

  it('confirmar un tramo borra ese y los anteriores, no los posteriores', async () => {
    for (const f of fs.readdirSync(DIR)) fs.rmSync(path.join(DIR, f))
    anotar({ jid: 'b', m: { id: 'x' } }, { urgente: true })
    const primero = cerrarTramo()
    await new Promise((r) => setTimeout(r, 5))
    anotar({ jid: 'b', m: { id: 'y' } }, { urgente: true })
    const segundo = cerrarTramo()
    tramoGuardado(primero)
    expect(fs.existsSync(primero)).toBe(false)
    expect(fs.existsSync(segundo)).toBe(true)
    expect(recuperar().map((e) => e.m.id)).toEqual(['y'])
  })

  it('una última línea a medio escribir (corte de luz) se ignora', () => {
    for (const f of fs.readdirSync(DIR)) fs.rmSync(path.join(DIR, f))
    fs.writeFileSync(path.join(DIR, 'tramo-1.jsonl'), '{"jid":"c","m":{"id":"ok"}}\n{"jid":"c","m":{"id":"cor')
    expect(recuperar().map((e) => e.m.id)).toEqual(['ok'])
  })

  it('cerrar sin nada anotado no crea tramos', () => {
    for (const f of fs.readdirSync(DIR)) fs.rmSync(path.join(DIR, f))
    expect(cerrarTramo()).toBe(null)
    expect(fs.readdirSync(DIR)).toEqual([])
  })
})
