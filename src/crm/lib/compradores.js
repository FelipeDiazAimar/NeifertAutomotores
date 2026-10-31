// "Posibles compradores": cruza una búsqueda (marca / modelo / tipo / rango de
// precio) con los intereses cargados en los clientes.
import { DOLAR } from '@/crm/lib/compatibilidad'
import { normTexto, parecidas, coincidePalabra } from '@/lib/similitud'

const norm = normTexto

const aArs = (valor, moneda) => (moneda === 'USD' ? Number(valor) * DOLAR : Number(valor))
const hayValor = (v) => v != null && v !== '' && Number(v) > 0

/** Una "demanda" es una línea de interés de una persona, normalizada:
 *  { persona: { id, nombre, telefono, estado }, marca, modelo, tipo,
 *    condicion, anio, valor, moneda, presupuesto }
 *  `presupuesto` (tope que dijo el cliente) es distinto de `valor` (precio
 *  aproximado del auto que busca). */

/** Demandas de un cliente del CRM nuevo: cada fila de cliente_intereses más,
 *  si lo cargó, su perfil general (marca/modelo/tipo/presupuesto). */
export function demandasDeCliente(c) {
  const persona = {
    id: c.id,
    nombre: c.nombre,
    telefono: c.telefono,
    estado: c.status,
  }
  const out = (c.intereses ?? []).map((i) => ({
    persona,
    marca: i.marca,
    modelo: i.modelo,
    version: i.version,
    tipo: i.tipo,
    condicion: i.condicion,
    anio: i.anio,
    valor: i.valor,
    moneda: i.moneda,
    presupuesto: hayValor(c.presupuesto) ? Number(c.presupuesto) : null,
  }))
  if (c.marca_interes || c.modelo_interes || c.tipo_interes || hayValor(c.presupuesto)) {
    out.push({
      persona,
      marca: c.marca_interes,
      modelo: c.modelo_interes,
      tipo: c.tipo_interes,
      condicion: c.interes_cero_km ? 'cero' : null,
      presupuesto: hayValor(c.presupuesto) ? Number(c.presupuesto) : null,
    })
  }
  return out
}

/** Clientes vendidos o perdidos: ya no son compradores activos, se listan
 *  aparte y al final. */
export function esInactivo(persona) {
  return ['vendido', 'perdido'].includes(persona?.estado)
}

/** Evalúa una demanda contra la búsqueda. Devuelve { score, coincide: [...] }
 *  o null si no sirve. Un dato vacío en la demanda no descarta (no se sabe),
 *  pero uno cargado que no coincide sí. Hace falta al menos una coincidencia. */
function evaluar(d, f) {
  const coincide = []

  // Marca / modelo / tipo toleran errores de tipeo ("toyta", "corola").
  if (f.marca && norm(d.marca)) {
    if (!parecidas(norm(d.marca), norm(f.marca))) return null
    coincide.push('marca')
  }
  if (f.modelo && norm(d.modelo)) {
    const dm = norm(d.modelo)
    const fm = norm(f.modelo)
    if (!dm.includes(fm) && !fm.includes(dm) && !parecidas(dm, fm)) return null
    coincide.push('modelo')
  }
  if (f.tipo && norm(d.tipo)) {
    if (!parecidas(norm(d.tipo), norm(f.tipo))) return null
    coincide.push('tipo')
  }

  // Texto libre: cada palabra tiene que aparecer (aunque sea parecida) en el
  // vehículo de interés o en el nombre del cliente.
  let extra = 0
  const terminos = terminosDeTexto(f.texto)
  if (terminos.length) {
    const palabrasVeh = norm([d.marca, d.modelo, d.version, d.tipo, d.anio].filter(Boolean).join(' ')).split(' ').filter(Boolean)
    const palabrasNombre = norm(d.persona?.nombre).split(' ').filter(Boolean)
    let enVeh = 0
    let enNombre = 0
    for (const t of terminos) {
      if (palabrasVeh.some((w) => coincidePalabra(t, w))) enVeh++
      else if (palabrasNombre.some((w) => coincidePalabra(t, w))) enNombre++
      else return null
    }
    if (enVeh) coincide.push('texto')
    if (enNombre) coincide.push('nombre')
    extra = Math.max(0, enVeh + enNombre - 1)
  }

  const min = hayValor(f.precioMin) ? aArs(f.precioMin, f.moneda) : null
  const max = hayValor(f.precioMax) ? aArs(f.precioMax, f.moneda) : null
  let sinValor = false
  if (min != null || max != null) {
    if (hayValor(d.valor)) {
      const v = aArs(d.valor, d.moneda)
      if ((min != null && v < min) || (max != null && v > max)) return null
      coincide.push('precio')
    } else if (hayValor(d.presupuesto)) {
      // Tope del cliente: alcanza si puede pagar lo más barato del rango.
      if (min != null && min > d.presupuesto) return null
      if (min == null && max != null && max > d.presupuesto * 3) return null
      coincide.push('presupuesto')
    } else {
      sinValor = true // no cargó cuánto: se ofrece igual, marcado
    }
  }

  // Si se buscó por vehículo, al menos un dato del vehículo tiene que coincidir.
  const hayVeh = Boolean(f.marca || f.modelo || f.tipo)
  const coincideVeh = coincide.some((c) => c === 'marca' || c === 'modelo' || c === 'tipo')
  if (hayVeh && !coincideVeh) return null
  if (coincide.length === 0 && !sinValor) return null
  // Con texto libre, "sin valor" solo no alcanza: tiene que haber coincidido el texto.
  if (terminos.length && !coincide.some((c) => c === 'texto' || c === 'nombre')) return null

  const score = coincide.length + extra
  if (sinValor) coincide.push('sin_valor')
  return { score, coincide }
}

/** Palabras útiles del texto libre (sin las de una sola letra). */
function terminosDeTexto(texto) {
  return norm(texto).split(' ').filter((t) => t.length >= 2)
}

/** Hay algún criterio cargado en la búsqueda. */
export function hayFiltros(f) {
  return Boolean(
    f.marca || f.modelo || f.tipo || terminosDeTexto(f.texto).length || hayValor(f.precioMin) || hayValor(f.precioMax)
  )
}

/** Personas con al menos una línea de interés que encaje con la búsqueda,
 *  una fila por persona: { persona, score, lineas: [{ ...demanda, coincide }] },
 *  de más a menos coincidencias (y por nombre a igualdad). */
export function buscarCompradores(demandas, filtros) {
  if (!hayFiltros(filtros)) return []
  const porPersona = new Map()
  for (const d of demandas) {
    const r = evaluar(d, filtros)
    if (!r) continue
    const key = d.persona.id
    const actual = porPersona.get(key) ?? { persona: d.persona, score: 0, lineas: [] }
    actual.score = Math.max(actual.score, r.score)
    actual.lineas.push({ ...d, coincide: r.coincide })
    porPersona.set(key, actual)
  }
  return [...porPersona.values()].sort(
    (a, b) =>
      b.score - a.score ||
      (a.persona.nombre ?? '').localeCompare(b.persona.nombre ?? '', 'es')
  )
}
