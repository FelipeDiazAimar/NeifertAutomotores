import { parseISO, startOfDay, isBefore, isEqual, addDays } from 'date-fns'

function ordenar(a, b) {
  if (a.fecha !== b.fecha) return a.fecha < b.fecha ? -1 : 1
  const ha = a.hora || '99:99'
  const hb = b.hora || '99:99'
  return ha < hb ? -1 : ha > hb ? 1 : 0
}

/** Reparte las tareas en { vencidas, hoy, semana, despues, hechas }.
 *  `done` → hechas. Si no: por día vs `hoy`. */
export function agrupar(tareas = [], hoy = new Date()) {
  const h0 = startOfDay(hoy)
  const limiteSemana = addDays(h0, 7)
  const g = { vencidas: [], hoy: [], semana: [], despues: [], hechas: [] }

  for (const t of tareas) {
    if (t.done) {
      g.hechas.push(t)
      continue
    }
    const d = startOfDay(parseISO(t.fecha))
    if (isBefore(d, h0)) g.vencidas.push(t)
    else if (isEqual(d, h0)) g.hoy.push(t)
    else if (isBefore(d, limiteSemana) || isEqual(d, limiteSemana)) g.semana.push(t)
    else g.despues.push(t)
  }

  for (const k of Object.keys(g)) g[k].sort(ordenar)
  return g
}
