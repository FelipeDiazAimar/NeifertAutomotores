// Cruce vehículo ↔ cliente. Score 0–100 por criterios ponderados.
// TODO: DOLAR debería venir de config; por ahora una constante editable.
export const DOLAR = 1000

const norm = (s) =>
  (s ?? '')
    .toString()
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')

export function precioEnArs(v) {
  if (v.precio_contado == null || v.precio_contado === '') return Infinity
  const p = Number(v.precio_contado)
  return v.moneda === 'USD' ? p * DOLAR : p
}

export const CRITERIOS = [
  {
    key: 'marca',
    label: 'Marca',
    peso: 30,
    aplica: (c) => !!c.marca_interes,
    ok: (c, v) => norm(c.marca_interes) === norm(v.marca),
    clienteDice: (c) => c.marca_interes,
    vehiculoDice: (v) => v.marca,
  },
  {
    key: 'modelo',
    label: 'Modelo',
    peso: 25,
    aplica: (c) => !!c.modelo_interes,
    ok: (c, v) => norm(c.modelo_interes) === norm(v.modelo),
    clienteDice: (c) => c.modelo_interes,
    vehiculoDice: (v) => v.modelo,
  },
  {
    key: 'tipo',
    label: 'Tipo',
    peso: 15,
    aplica: (c) => !!c.tipo_interes,
    ok: (c, v) => norm(c.tipo_interes) === norm(v.tipo),
    clienteDice: (c) => c.tipo_interes,
    vehiculoDice: (v) => v.tipo,
  },
  {
    key: 'anio',
    label: 'Año',
    peso: 15,
    aplica: (c) => c.anio_min != null || c.anio_max != null,
    ok: (c, v) =>
      v.anio != null &&
      (c.anio_min == null || v.anio >= c.anio_min) &&
      (c.anio_max == null || v.anio <= c.anio_max),
    clienteDice: (c) => `${c.anio_min ?? '…'}–${c.anio_max ?? '…'}`,
    vehiculoDice: (v) => v.anio ?? '—',
  },
  {
    key: 'presupuesto',
    label: 'Presupuesto',
    peso: 15,
    aplica: (c) => c.presupuesto != null && c.presupuesto !== '',
    ok: (c, v) => Number(c.presupuesto ?? 0) >= precioEnArs(v),
    clienteDice: (c) => c.presupuesto,
    vehiculoDice: (v) => (precioEnArs(v) === Infinity ? 's/precio' : precioEnArs(v)),
  },
]

export function bucket(score) {
  return score >= 80 ? 'alta' : score >= 50 ? 'media' : 'baja'
}

function evaluar(cliente, vehiculo) {
  let pesoAplicable = 0
  let pesoOk = 0
  const detalle = CRITERIOS.map((cr) => {
    const aplica = cr.aplica(cliente)
    const ok = aplica && cr.ok(cliente, vehiculo)
    if (aplica) {
      pesoAplicable += cr.peso
      if (ok) pesoOk += cr.peso
    }
    return {
      key: cr.key,
      label: cr.label,
      aplica,
      ok,
      clienteDice: aplica ? cr.clienteDice(cliente) : null,
      vehiculoDice: cr.vehiculoDice(vehiculo),
    }
  })
  const score = pesoAplicable === 0 ? 0 : Math.round((pesoOk / pesoAplicable) * 100)
  return { score, detalle }
}

/** Devuelve el mejor { score, bucket, detalle } probando los campos de interés
 *  del cliente y también cada fila de cliente.intereses. */
export function compatibilidad(cliente, vehiculo) {
  const candidatos = [cliente]
  for (const i of cliente.intereses ?? []) {
    candidatos.push({ ...cliente, marca_interes: i.marca, modelo_interes: i.modelo })
  }
  let mejor = { score: -1, detalle: [] }
  for (const c of candidatos) {
    const r = evaluar(c, vehiculo)
    if (r.score > mejor.score) mejor = r
  }
  return { score: Math.max(0, mejor.score), bucket: bucket(Math.max(0, mejor.score)), detalle: mejor.detalle }
}
