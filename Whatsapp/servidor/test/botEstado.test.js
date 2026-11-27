import './entorno.js'
import express from 'express'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { rutasBot } from '../src/bot.js'
import { _reiniciar, vistaSofia } from '../src/sofiaEstado.js'

// La ruta de verdad (/api/bot/estado) con los envoltorios de index.js reemplazados por unos mínimos.
const ruta = (fn) => async (req, res) => {
  try {
    res.json(await fn(req))
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message })
  }
}
const accion = (_nombre, fn) => ruta(fn)

let servidor
let base
beforeAll(async () => {
  const app = express()
  app.use(express.json())
  app.use('/api/bot', rutasBot({ ruta, accion }))
  await new Promise((r) => (servidor = app.listen(0, '127.0.0.1', r)))
  base = `http://127.0.0.1:${servidor.address().port}/api/bot`
})
afterAll(() => servidor.close())

describe('POST /api/bot/estado: el reporte del bot llega al panel', () => {
  it('el bot reporta y el panel lo ve conectado, con el uso del cupo', async () => {
    _reiniciar()
    const r = await fetch(`${base}/estado`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ asistente: 'Sofía', vinculado: true, numeroPropio: true, iniciado: true, conectado: true, activo: true, horario: { activo: true, texto: 'lunes a viernes, de 09:00 a 18:00 h', dentro: false }, atendiendo: 2, ia: { usadas: 42, cupo: 1500, porMinuto: 20, mes: '2026-12' }, version: '1.0.0', ts: Date.now() }),
    })
    expect(await r.json()).toEqual({ ok: true })
    const v = await vistaSofia()
    expect(v.conexion).toMatchObject({ estado: 'conectado', respondiendo: true })
    expect(v.reporte).toMatchObject({ asistente: 'Sofía', atendiendo: 2, ia: { usadas: 42, cupo: 1500, porMinuto: 20 } })
    expect(v.estadisticas.porDia).toHaveLength(30)
  })

  it('un cuerpo vacío o con basura no rompe nada', async () => {
    const r = await fetch(`${base}/estado`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ia: 'x', horario: 5, atendiendo: 'mucho' }) })
    expect(r.status).toBe(200)
    expect((await vistaSofia()).reporte.ia).toBeNull()
  })
})
