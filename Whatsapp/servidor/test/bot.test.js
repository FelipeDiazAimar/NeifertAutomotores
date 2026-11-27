import './entorno.js'
import { describe, expect, it } from 'vitest'
import { filtrarVehiculos } from '../src/vehiculosFiltro.js'
import { armarNegocio } from '../src/negocioBot.js'

const AUTO = (o) => ({ reservado: false, nuevo: false, km: 50000, combustible: 'Nafta', transmision: 'Manual', moneda: 'USD', ...o })
const LISTA = [
  AUTO({ id: 1, nombre: 'Toyota Corolla XEi', marca: 'Toyota', modelo: 'Corolla XEi', anio: 2019, precio: 21000 }),
  AUTO({ id: 2, nombre: 'Toyota Etios X', marca: 'Toyota', modelo: 'Etios X', anio: 2017, precio: 11000, km: 90000 }),
  AUTO({ id: 3, nombre: 'Volkswagen Gol Trend', marca: 'Volkswagen', modelo: 'Gol Trend', anio: 2015, precio: 9000, km: 120000, reservado: true }),
  AUTO({ id: 4, nombre: 'Ford Ranger Limited', marca: 'Ford', modelo: 'Ranger', anio: 2024, precio: 52000000, moneda: 'ARS', combustible: 'Diésel', transmision: 'Automática', nuevo: true, km: 0 }),
  AUTO({ id: 5, nombre: 'Peugeot 208', marca: 'Peugeot', modelo: '208', anio: 2020, precio: null }),
]
const ids = (r) => r.vehiculos.map((v) => v.id)

describe('catálogo para el bot: filtros', () => {
  it('sin filtros devuelve todo (hasta el límite) con el total', () => {
    const r = filtrarVehiculos(LISTA, {})
    expect(r.total).toBe(5)
    expect(filtrarVehiculos(LISTA, { limite: 2 })).toMatchObject({ total: 5, vehiculos: [{ id: 1 }, { id: 2 }] })
  })

  it('marca, modelo y texto libre sin importar tildes ni mayúsculas', () => {
    expect(ids(filtrarVehiculos(LISTA, { marca: 'TOYOTA' }))).toEqual([1, 2])
    expect(ids(filtrarVehiculos(LISTA, { modelo: 'gol' }))).toEqual([3])
    expect(ids(filtrarVehiculos(LISTA, { q: 'diesel automatica' }))).toEqual([4])
    expect(ids(filtrarVehiculos(LISTA, { q: 'toyota 2019' }))).toEqual([1])
  })

  it('año, kilómetros y combustible', () => {
    expect(ids(filtrarVehiculos(LISTA, { anioDesde: 2019 }))).toEqual([1, 4, 5])
    expect(ids(filtrarVehiculos(LISTA, { anioHasta: 2016 }))).toEqual([3])
    expect(ids(filtrarVehiculos(LISTA, { kmMax: 60000 }))).toEqual([1, 4, 5])
    expect(ids(filtrarVehiculos(LISTA, { combustible: 'diésel' }))).toEqual([4])
  })

  it('precio máximo: respeta la moneda y deja afuera a los sin precio', () => {
    expect(ids(filtrarVehiculos(LISTA, { precioMax: 12000, moneda: 'USD' }))).toEqual([2, 3])
    expect(ids(filtrarVehiculos(LISTA, { precioMax: 60000000, moneda: 'ARS' }))).toEqual([4])
    expect(ids(filtrarVehiculos(LISTA, { precioMax: 99999999 }))).not.toContain(5)
  })

  it('0 km y solo disponibles', () => {
    expect(ids(filtrarVehiculos(LISTA, { nuevo: '1' }))).toEqual([4])
    expect(ids(filtrarVehiculos(LISTA, { disponibles: '1' }))).toEqual([1, 2, 4, 5])
  })

  it('límite entre 1 y 25 y valores raros no rompen nada', () => {
    const muchos = Array.from({ length: 40 }, (_, i) => AUTO({ id: i, nombre: `Auto ${i}`, marca: 'X', modelo: 'Y', anio: 2020, precio: 1 }))
    expect(filtrarVehiculos(muchos, { limite: 999 }).vehiculos).toHaveLength(25)
    expect(filtrarVehiculos(muchos, { limite: 0 }).vehiculos).toHaveLength(1)
    expect(filtrarVehiculos(muchos, { limite: 'abc', anioDesde: 'x' }).vehiculos).toHaveLength(10)
  })
})

describe('catálogo para el bot: tipo, usado/0 km y orden', () => {
  const L = [
    { id: 1, nombre: 'Toyota Hilux SRX', marca: 'Toyota', modelo: 'Hilux', anio: 2021, precio: 38000, moneda: 'USD', km: 40000, categoria: 'pickup', condicion: 'usado', nuevo: false },
    { id: 2, nombre: 'Ford Ranger Limited', marca: 'Ford', modelo: 'Ranger', anio: 2025, precio: 52000, moneda: 'USD', km: 0, categoria: 'pickup', condicion: '0km', nuevo: true },
    { id: 3, nombre: 'Peugeot 208 Allure', marca: 'Peugeot', modelo: '208', anio: 2020, precio: 14000, moneda: 'USD', km: 60000, categoria: 'sedan', condicion: 'usado', nuevo: false },
    { id: 4, nombre: 'Chevrolet Tracker', marca: 'Chevrolet', modelo: 'Tracker', anio: 2023, precio: null, km: 5000, categoria: 'suv', condicion: 'usado', nuevo: false },
    { id: 5, nombre: 'Renault Kwid', marca: 'Renault', modelo: 'Kwid', anio: 2026, precio: 15000, moneda: 'USD', km: 0, categoria: 'hatch', condicion: '0km', nuevo: true },
  ]
  const ids = (r) => r.vehiculos.map((v) => v.id)

  it('por tipo: "pickups" encuentra la categoría "pickup" (y al revés), sin tildes', () => {
    expect(ids(filtrarVehiculos(L, { categoria: 'Pickups' }))).toEqual([1, 2])
    expect(ids(filtrarVehiculos(L, { categoria: 'sedán' }))).toEqual([3])
    expect(ids(filtrarVehiculos(L, { categoria: 'SUVs' }))).toEqual([4])
    expect(ids(filtrarVehiculos(L, { categoria: 'camión' }))).toEqual([])
  })

  it('usados y 0 km, dichos de varias formas', () => {
    expect(ids(filtrarVehiculos(L, { condicion: 'usado' }))).toEqual([1, 3, 4])
    expect(ids(filtrarVehiculos(L, { condicion: 'usados' }))).toEqual([1, 3, 4])
    for (const c of ['0km', '0 km', 'cero km', 'Cero-Km', 'nuevo']) expect(ids(filtrarVehiculos(L, { condicion: c })), c).toEqual([2, 5])
    // Combinado con otros filtros.
    expect(ids(filtrarVehiculos(L, { condicion: '0km', categoria: 'pickup' }))).toEqual([2])
    expect(ids(filtrarVehiculos(L, { condicion: 'usado', precioMax: 20000, moneda: 'USD' }))).toEqual([3])
  })

  it('ordena por precio, año o kilómetros (los sin precio, al final)', () => {
    expect(ids(filtrarVehiculos(L, { ordenar: 'precio_asc' }))).toEqual([3, 5, 1, 2, 4])
    expect(ids(filtrarVehiculos(L, { ordenar: 'precio_desc' }))).toEqual([2, 1, 5, 3, 4])
    expect(ids(filtrarVehiculos(L, { ordenar: 'anio_desc', limite: 2 }))).toEqual([5, 2])
    expect(ids(filtrarVehiculos(L, { ordenar: 'km_asc', condicion: 'usado' }))).toEqual([4, 1, 3])
    expect(filtrarVehiculos(L, { ordenar: 'precio_asc', limite: 1 }).total).toBe(5)
    expect(ids(filtrarVehiculos(L, { ordenar: 'cualquier cosa' }))).toEqual([1, 2, 3, 4, 5])
  })

  it('con la búsqueda por nombre se achica: solo viene lo que se pidió', () => {
    const muchos = Array.from({ length: 300 }, (_, i) => ({ id: `r${i}`, nombre: `Auto de relleno ${i}`, marca: 'Otra', modelo: 'X', anio: 2020, precio: 1, moneda: 'USD', km: 1, categoria: 'hatch', condicion: 'usado' }))
    const r = filtrarVehiculos([...muchos, ...L], { q: 'hilux' })
    expect(r).toMatchObject({ total: 1, vehiculos: [{ id: 1 }] })
  })
})

describe('datos del negocio para el bot', () => {
  it('con lo que se editó en la página', () => {
    const n = armarNegocio({ socials: { address: 'Calle Falsa 123, Rafaela', hours: 'Lun a Sáb 9 a 18', phone: '03492 12-3456', whatsappPhone: '5493492123456', email: '' }, categories: [{ id: 'suv', label: 'SUVs' }, { id: 'x', label: ' ' }] }, 'https://neifertautomotores.com')
    expect(n).toMatchObject({ direccion: 'Calle Falsa 123, Rafaela', horarios: 'Lun a Sáb 9 a 18', telefono: '03492 12-3456', whatsapp: '+5493492123456', web: 'https://neifertautomotores.com', categorias: ['SUVs'] })
    expect(n.mapa).toBe('https://www.google.com/maps/search/?api=1&query=Calle%20Falsa%20123%2C%20Rafaela')
    // Un campo vacío no pisa el dato por defecto.
    expect(n.email).toBe('neifertsanfrancisco@gmail.com')
  })

  it('financiación y toma de usados salen de lo que carga el negocio; sin cargar, no se mandan', () => {
    const n = armarNegocio({ socials: { financing: ' Hasta 36 cuotas con DNI y recibo. ', tradeIn: 'Tomamos tu usado.' } })
    expect(n).toMatchObject({ financiacion: 'Hasta 36 cuotas con DNI y recibo.', permuta: 'Tomamos tu usado.' })
    const vacio = armarNegocio({ socials: { financing: '  ', tradeIn: '' } })
    expect('financiacion' in vacio).toBe(false)
    expect('permuta' in vacio).toBe(false)
    expect('financiacion' in armarNegocio({})).toBe(false)
  })

  it('sin nada guardado todavía usa lo que trae la página por defecto', () => {
    const n = armarNegocio({}, '')
    expect(n.direccion).toBe('Av. Urquiza 898, San Francisco, Córdoba')
    expect(n.horarios).toContain('Lun a Vie')
    expect(n.categorias).toContain('Pickups')
    expect(n.nota_horarios).toMatch(/cerrado/)
  })

  it('datos raros no rompen nada', () => {
    expect(() => armarNegocio({ socials: 'x', categories: 'y' }, '')).not.toThrow()
    expect(armarNegocio({ socials: null, categories: null }).nombre).toBe('Neifert Automotores')
  })
})

describe('catálogo con precios en pesos y en dólares (como el real: 44 de 55 en pesos)', () => {
  // precioUsd: el equivalente que usa la página (acá, pesos / 1000).
  const M = [
    { id: 1, nombre: 'Audi A1', marca: 'Audi', anio: 2012, precio: 14100, moneda: 'USD', precioUsd: 14100, categoria: 'hatchback', condicion: 'usado' },
    { id: 2, nombre: 'Chevrolet S-10', marca: 'Chevrolet', anio: 2018, precio: 29000000, moneda: 'ARS', precioUsd: 29000, categoria: 'pickup', condicion: 'usado' },
    { id: 3, nombre: 'Honda Wave 110', marca: 'Honda', anio: 2020, precio: 3000000, moneda: 'ARS', precioUsd: 3000, categoria: 'moto', condicion: 'usado' },
    { id: 4, nombre: 'Ford Ranger Limited', marca: 'Ford', anio: 2025, precio: 66000000, moneda: 'ARS', precioUsd: 66000, categoria: 'pickup', condicion: '0km' },
    { id: 5, nombre: 'BMW 120D', marca: 'BMW', anio: 2008, precio: 12000, moneda: 'USD', precioUsd: 12000, categoria: 'sedan', condicion: 'usado' },
    { id: 6, nombre: 'Sin precio', marca: 'X', anio: 2019, precio: null, moneda: 'ARS', precioUsd: null, categoria: 'suv', condicion: 'usado' },
  ]
  const ids = (r) => r.vehiculos.map((v) => v.id)

  it('"el más caro" y "el más barato" comparan pesos y dólares juntos', () => {
    expect(ids(filtrarVehiculos(M, { ordenar: 'precio_desc', limite: 1 }))).toEqual([4]) // la Ranger de $66.000.000, no el Audi de U$S 14.100
    expect(ids(filtrarVehiculos(M, { ordenar: 'precio_asc', limite: 1 }))).toEqual([3]) // la moto
    expect(ids(filtrarVehiculos(M, { ordenar: 'precio_asc' })).at(-1)).toBe(6) // sin precio, al final
  })

  it('"algo hasta 15 mil dólares" incluye los autos en pesos que equivalen a eso', () => {
    expect(ids(filtrarVehiculos(M, { precioMax: 15000, moneda: 'USD' }))).toEqual([1, 3, 5])
    expect(ids(filtrarVehiculos(M, { precioMax: 15000 }))).toEqual([1, 3, 5]) // sin moneda: dólares
  })

  it('con moneda ARS solo los publicados en pesos', () => {
    expect(ids(filtrarVehiculos(M, { precioMax: 30000000, moneda: 'ARS' }))).toEqual([2, 3])
  })
})
