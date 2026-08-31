import { supabase } from '@/services/supabaseClient'
import { compatibilidad } from '@/crm/lib/compatibilidad'

const db = () => supabase.schema('crm')
const norm = (s) => (s ?? '').toString().trim()

function primerDiaDelMes() {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10)
}

export async function kpis() {
  const [cli, veh, tar, stock, vend] = await Promise.all([
    db().from('clientes').select('id', { count: 'exact', head: true })
      .in('status', ['activo', 'en_seguimiento']).is('archivado_en', null),
    db().from('vehiculos').select('id', { count: 'exact', head: true })
      .eq('estado', 'disponible').is('archivado_en', null),
    db().from('tareas').select('id', { count: 'exact', head: true })
      .eq('done', false).is('archivado_en', null),
    db().from('vehiculos').select('precio_contado, moneda')
      .eq('estado', 'disponible').is('archivado_en', null),
    db().from('vehiculos').select('id', { count: 'exact', head: true })
      .eq('estado', 'vendido').gte('fecha_venta', primerDiaDelMes()),
  ])
  for (const r of [cli, veh, tar, stock, vend]) if (r.error) throw r.error

  const valorStock = { ars: 0, usd: 0 }
  for (const row of stock.data ?? []) {
    const p = Number(row.precio_contado) || 0
    if (row.moneda === 'USD') valorStock.usd += p
    else valorStock.ars += p
  }

  return {
    clientesActivos: cli.count ?? 0,
    vehiculosDisponibles: veh.count ?? 0,
    valorStock,
    alertasActivas: tar.count ?? 0,
    vendidosMes: vend.count ?? 0,
  }
}

function rankear(pares, limite) {
  const mapa = new Map()
  for (const raw of pares) {
    const nombre = norm(raw)
    if (!nombre) continue
    const k = nombre.toLowerCase()
    const cur = mapa.get(k)
    if (cur) cur.n++
    else mapa.set(k, { nombre, n: 1 })
  }
  const arr = [...mapa.values()].sort((a, b) => b.n - a.n)
  return limite ? arr.slice(0, limite) : arr
}

export async function demanda() {
  const [cli, ints] = await Promise.all([
    db().from('clientes').select('marca_interes, tipo_interes')
      .in('status', ['activo', 'en_seguimiento']).is('archivado_en', null),
    db().from('cliente_intereses').select('marca'),
  ])
  if (cli.error) throw cli.error
  if (ints.error) throw ints.error

  const marcas = [
    ...(cli.data ?? []).map((c) => c.marca_interes),
    ...(ints.data ?? []).map((i) => i.marca),
  ]
  const tipos = (cli.data ?? []).map((c) => c.tipo_interes)

  return { marcas: rankear(marcas, 8), tipos: rankear(tipos) }
}

export async function oportunidades() {
  const [veh, cli] = await Promise.all([
    db().from('vehiculos')
      .select('id, marca, modelo, version, tipo, anio, km, moneda, precio_contado, fotos:vehiculo_fotos(url,es_portada)')
      .eq('estado', 'disponible').is('archivado_en', null),
    db().from('clientes')
      .select('id, nombre, notas, marca_interes, modelo_interes, tipo_interes, anio_min, anio_max, presupuesto, intereses:cliente_intereses(marca,modelo)')
      .in('status', ['activo', 'en_seguimiento']).is('archivado_en', null),
  ])
  if (veh.error) throw veh.error
  if (cli.error) throw cli.error

  const items = []
  for (const v of veh.data ?? []) {
    const matches = []
    for (const c of cli.data ?? []) {
      const res = compatibilidad(c, v)
      if (res.score >= 30) matches.push({ cliente: c, ...res })
    }
    if (!matches.length) continue
    matches.sort((a, b) => b.score - a.score)
    items.push({ vehiculo: v, clientes: matches.slice(0, 8) })
  }
  items.sort((a, b) => (b.clientes[0]?.score ?? 0) - (a.clientes[0]?.score ?? 0))
  return items
}
