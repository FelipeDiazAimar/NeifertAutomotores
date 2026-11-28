/*
 * Herramientas de autos que el CRM le declara a la app del bot (GET /api/bot/herramientas) y las ejecuta él
 * (POST /api/bot/herramientas/:nombre). La app es genérica: todo lo que sabe de autos vive acá.
 * Llaman directo a las mismas funciones que usan /vehiculos, /negocio, /abierto y /vehiculos/:id/fotos.
 */
import { datosNegocio, fotosDeVehiculoWeb, vehiculosWeb } from './whatsapp.js'
import { estaAbierto } from './negocioBot.js'
import { filtrarVehiculos } from './vehiculosFiltro.js'

export const HERRAMIENTAS = [
  {
    nombre: 'buscar_vehiculos',
    descripcion: 'Busca autos del catálogo actual del negocio, usados y 0 km (precio, año, kilómetros, tipo, si está reservado y el enlace a la página). Usala siempre que pregunten qué autos hay, por una marca, modelo o tipo, por precio, o por un auto puntual. Devuelve el total que coincide y hasta `limite` autos: pedí con filtros para traer pocos.',
    parametros: {
      propiedades: {
        q: { tipo: 'string', descripcion: 'Palabras del nombre del auto (todas tienen que estar), por ejemplo "hilux srx"' },
        marca: { tipo: 'string', descripcion: 'Marca, por ejemplo Toyota o Volkswagen' },
        modelo: { tipo: 'string', descripcion: 'Modelo, por ejemplo Corolla o Gol Trend' },
        categoria: { tipo: 'string', descripcion: 'Tipo de vehículo: pickup, SUV, sedán, coupé, sport, eléctrico, etc.' },
        condicion: { tipo: 'string', descripcion: 'Usado o 0 km', opciones: ['usado', '0km'] },
        anioDesde: { tipo: 'integer', descripcion: 'Año mínimo' },
        anioHasta: { tipo: 'integer', descripcion: 'Año máximo' },
        kmMax: { tipo: 'integer', descripcion: 'Kilómetros máximos' },
        precioMax: { tipo: 'number', descripcion: 'Precio máximo. Por defecto en dólares (los autos publicados en pesos se comparan con su equivalente en dólares); con moneda ARS, en pesos y solo los publicados en pesos' },
        moneda: { tipo: 'string', descripcion: 'Moneda del precio máximo: USD (por defecto) o ARS (pesos)', opciones: ['USD', 'ARS'] },
        combustible: { tipo: 'string', descripcion: 'Nafta, Diésel, GNC, etc.' },
        transmision: { tipo: 'string', descripcion: 'Manual o Automática' },
        disponibles: { tipo: 'boolean', descripcion: 'true para dejar afuera los reservados' },
        ordenar: { tipo: 'string', descripcion: 'Orden de los resultados. USALO siempre que pregunten por "el más barato" (precio_asc), "el más caro" (precio_desc), "el más nuevo" (anio_desc) o "el de menos kilómetros" (km_asc), junto con limite 1 (o 3 para varios). Compara pesos y dólares juntos', opciones: ['precio_asc', 'precio_desc', 'anio_desc', 'anio_asc', 'km_asc'] },
        limite: { tipo: 'integer', descripcion: 'Cuántos autos devolver (1 a 25, por defecto 10)' },
      },
      requeridos: [],
    },
  },
  {
    nombre: 'ranking_vehiculos',
    descripcion: 'Devuelve los autos ordenados para responder preguntas de ranking: "el más barato", "el más caro", "el más nuevo", "el de menos kilómetros" (compara pesos y dólares juntos). Usá SIEMPRE esta herramienta, y no buscar_vehiculos, para esas preguntas. Se puede acotar con el tipo, la marca o usado/0 km.',
    parametros: {
      propiedades: {
        criterio: { tipo: 'string', descripcion: 'Qué ranking', opciones: ['mas_barato', 'mas_caro', 'mas_nuevo', 'menos_km'] },
        categoria: { tipo: 'string', descripcion: 'Tipo de vehículo: pickup, SUV, sedán, moto, etc. (opcional)' },
        marca: { tipo: 'string', descripcion: 'Marca (opcional)' },
        condicion: { tipo: 'string', descripcion: 'Usado o 0 km (opcional)', opciones: ['usado', '0km'] },
        cantidad: { tipo: 'integer', descripcion: 'Cuántos autos devolver (1 a 5, por defecto 3)' },
      },
      requeridos: ['criterio'],
    },
  },
  {
    nombre: 'consultar_negocio',
    descripcion: 'Datos del negocio: dirección y mapa, horarios de atención, teléfono, WhatsApp, email, redes, web, las categorías de vehículos que se venden y las condiciones de financiación y de toma de usados (permuta). Usala cuando pregunten dónde están, a qué hora atienden, si están abiertos, cómo contactarlos, si financian o si toman usados. Si un dato no viene, el negocio no lo cargó: no lo inventes.',
    parametros: { propiedades: {}, requeridos: [] },
  },
  {
    nombre: 'verificar_horario',
    descripcion: 'Dice si el salón está abierto un día y a una hora (con la hora de Argentina). Usala SIEMPRE antes de confirmar o aceptar que el cliente pase un día y hora ("mañana a las 10", "el sábado a la tarde", "ahora"), y cuando pregunten si están abiertos en un momento puntual: no lo adivines con el texto de los horarios. Si está cerrado, decile cuándo abre.',
    parametros: {
      propiedades: {
        dia: { tipo: 'string', descripcion: 'hoy, mañana, pasado mañana, un día de la semana (lunes...domingo: el próximo que viene) o una fecha (2026-11-28 o 28/11)' },
        hora: { tipo: 'string', descripcion: 'Hora en formato 24 h, por ejemplo 10:00 o 16:30 (opcional: sin hora se dice si abre ese día)' },
      },
      requeridos: ['dia'],
    },
  },
  {
    nombre: 'enviar_fotos_vehiculo',
    descripcion: 'Le manda al cliente, por este mismo WhatsApp, fotos de un auto del catálogo. Usala cuando pidan ver fotos o cuando quieras mostrarle un auto que le interesó: el id sale de buscar_vehiculos. Mandá fotos de uno o dos autos por vez, no de todos.',
    parametros: {
      propiedades: {
        id: { tipo: 'string', descripcion: 'El id del auto, tal cual lo devolvió buscar_vehiculos' },
        cantidad: { tipo: 'integer', descripcion: 'Cuántas fotos mandar (1 a 5, por defecto 3)' },
      },
      requeridos: ['id'],
    },
  },
]

// Reglas de concesionaria para el prompt de la IA (la app es genérica y no las trae escritas).
export const REGLAS = [
  'Si el cliente pide fotos de un auto, o querés mostrarle uno que le interesó, usá la herramienta de fotos con el id del auto: sale SOLO de los resultados de la búsqueda, nunca lo inventes (si no lo tenés, buscá el auto de nuevo). No digas que no podés mandar fotos.',
  'Mandá fotos de uno o dos autos por vez, no de todos. Después de mandarlas, decile en una frase corta que se las mandaste y preguntale si quiere ver otro auto o coordinar una visita.',
  'Si el cliente quiere pasar por el salón un día y hora, o pregunta si están abiertos en un momento puntual, verificalo SIEMPRE con verificar_horario antes de contestar. Nunca confirmes un horario sin verificarlo.',
  'Si verificar_horario dice que está abierto, confirmale que lo esperan: el salón atiende sin turno. Si está cerrado, decile que ese día u hora no atienden y cuándo abren.',
  'Financiación y toma de usados (permuta) se consultan con consultar_negocio. Si el negocio no cargó esos datos, no los inventes: ofrecé que una persona lo asesore.',
  'Para "el más barato", "el más caro", "el más nuevo" o "el de menos km" usá ranking_vehiculos, no buscar_vehiculos: una lista sin orden no sirve para decir cuál es el mejor.',
  'Los precios pueden estar en pesos o en dólares: para comparar usá siempre las herramientas, que ya comparan ambas monedas. Decí el precio en la moneda en que está publicado el auto.',
  'Los datos que cambian (qué autos hay, precios, año, kilómetros, usado o 0 km, horarios, dirección, teléfono) consultalos con las herramientas, no respondas de memoria. Pedí solo lo que necesitás, con filtros.',
]

const FILTROS = Object.keys(HERRAMIENTAS[0].parametros.propiedades)
const ORDEN_DEL_RANKING = { mas_barato: 'precio_asc', mas_caro: 'precio_desc', mas_nuevo: 'anio_desc', menos_km: 'km_asc' }
const sinAcceso = (a) => ({ error: 'sin_acceso', sin_acceso_a: a })
const cantidadDe = (v) => Math.min(Math.max(Number.parseInt(v, 10) || 3, 1), 5)

// De cada auto solo lo que sirve para contestar (sin rutas internas).
const resumenAuto = (v) => ({
  id: v.id, // para pedir sus fotos (enviar_fotos_vehiculo)
  nombre: v.nombre,
  descripcion: v.descripcion,
  precio: v.precioTexto || 'Consultar',
  condicion: v.condicion,
  categoria: v.categoria,
  reservado: !!v.reservado,
  enlace: v.enlace || undefined,
})

/** { total, vehiculos } con los autos que coinciden con los filtros (solo los conocidos, con valores simples y acotados). */
async function buscar(args, esRanking) {
  const filtros = {}
  for (const [clave, valor] of Object.entries(args && typeof args === 'object' ? args : {})) {
    if (FILTROS.includes(clave) && ['string', 'number', 'boolean'].includes(typeof valor)) filtros[clave] = typeof valor === 'boolean' ? (valor ? '1' : '0') : String(valor).slice(0, 100)
  }
  try {
    const lista = (await vehiculosWeb()).map((v) => ({ ...v, imagen: undefined }))
    const r = filtrarVehiculos(lista, filtros)
    const salida = { total: r.total, vehiculos: r.vehiculos.map(resumenAuto) }
    // Una lista parcial y sin orden NO sirve para decir "el más barato": se lo avisa a la IA (que si no, toma el primero).
    if (!esRanking && filtros.ordenar === undefined && salida.total > salida.vehiculos.length) {
      salida.nota = `Son solo ${salida.vehiculos.length} de ${salida.total} autos, en orden alfabético por marca: no es un ranking. Para "el más barato", "el más caro", "el más nuevo" o "el de menos km" usá ranking_vehiculos.`
    }
    return salida
  } catch (err) {
    console.error('[herramientas] catálogo:', err.message)
    return sinAcceso('el catálogo de vehículos')
  }
}

async function fotos(args) {
  const id = String(args?.id ?? '').trim().slice(0, 80)
  if (!id) return { error: 'falta_id', nota: 'Falta el id del auto: salió de buscar_vehiculos.' }
  try {
    const v = await fotosDeVehiculoWeb(id) // un id con "../" o inventado simplemente no existe
    if (!v) return { error: 'Ese id no corresponde a un auto del catálogo: buscalo de nuevo con buscar_vehiculos.' }
    if (!v.fotos.length) return { total: 0, nota: 'Ese auto todavía no tiene fotos cargadas.' }
    const precio = (await vehiculosWeb()).find((x) => String(x.id) === id)?.precioTexto
    return {
      id,
      nombre: v.nombre,
      total: v.fotos.length,
      // La app elige cuáles manda (hasta 5) y no repite las ya enviadas.
      imagenes: { rutas: v.fotos.slice(0, 10).map((_, i) => `/vehiculos/${encodeURIComponent(id)}/foto/${i}`), leyenda: precio ? `${v.nombre} - ${precio}` : v.nombre },
    }
  } catch (err) {
    console.error('[herramientas] fotos:', err.message)
    return sinAcceso('las fotos de los autos')
  }
}

/** Ejecuta la herramienta que pidió la IA. Si el CRM no puede leer los datos devuelve { error: 'sin_acceso' }; herramienta desconocida: 404. */
export async function ejecutar(nombre, args, { telefono } = {}) { // eslint-disable-line no-unused-vars
  switch (nombre) {
    case 'buscar_vehiculos':
      return buscar(args, false)
    case 'ranking_vehiculos': {
      // "El más barato / el más caro / el más nuevo / el de menos km": se ordena (pesos y dólares juntos) y se devuelven pocos.
      const ordenar = ORDEN_DEL_RANKING[String(args?.criterio ?? '')]
      if (!ordenar) return { error: 'criterio_invalido', nota: 'El criterio tiene que ser mas_barato, mas_caro, mas_nuevo o menos_km.' }
      return buscar({ categoria: args.categoria, marca: args.marca, condicion: args.condicion, ordenar, limite: cantidadDe(args.cantidad) }, true)
    }
    case 'consultar_negocio':
      try {
        return await datosNegocio()
      } catch (err) {
        console.error('[herramientas] negocio:', err.message)
        return sinAcceso('los horarios, la dirección y los datos de contacto')
      }
    case 'verificar_horario':
      try {
        const dia = typeof args?.dia === 'string' ? args.dia.slice(0, 40) : undefined
        const hora = typeof args?.hora === 'string' || typeof args?.hora === 'number' ? String(args.hora).slice(0, 10) : undefined
        return estaAbierto((await datosNegocio()).horarios, { dia, hora })
      } catch (err) {
        console.error('[herramientas] horario:', err.message)
        return sinAcceso('los horarios de atención')
      }
    case 'enviar_fotos_vehiculo':
      return fotos(args)
    default:
      throw Object.assign(new Error(`No existe la herramienta ${String(nombre).slice(0, 60)}.`), { status: 404 })
  }
}
