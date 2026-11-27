import './entorno.js'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { upsertChat } from '../src/almacen.js'
import { altaAutomatica, asegurarCliente, buscarClientes, clientePorTelefono, crearAlerta, crearCliente, crearTarea, fichaCrm, registrarSeguimiento, seguimientoPorTelefono, tareaPorTelefono, vincularCliente } from '../src/crm.js'

// CRM de mentira: clientes con teléfonos cargados "a mano", como en el real.
const CLIENTES = [
  { id: 'c1', nombre: 'Mauricio Barra', telefono: '3576 41-2286', status: 'activo', archivado_en: null },
  { id: 'c2', nombre: 'Ana Gómez', telefono: '+54 9 3406 15-518585', status: 'en_seguimiento', archivado_en: null },
  { id: 'c3', nombre: 'Ana vieja', telefono: '03406 15 518585', status: 'perdido', archivado_en: '2025-01-01' },
  { id: 'c4', nombre: 'Sin teléfono', telefono: null, status: 'activo', archivado_en: null },
]
const enviados = []
const json = (cuerpo, status = 200) => new Response(JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json' } })

beforeAll(() => {
  vi.stubGlobal('fetch', async (url, opciones = {}) => {
    const u = new URL(url)
    const tabla = u.pathname.replace('/rest/v1/', '')
    if (opciones.method === 'POST') {
      const fila = JSON.parse(opciones.body)
      enviados.push({ tabla, fila, perfil: opciones.headers['Content-Profile'] })
      const creada = { id: `${tabla}-${enviados.length}`, ...fila }
      if (tabla === 'clientes') CLIENTES.push({ ...creada, archivado_en: null })
      return json([creada], 201)
    }
    // Empleado con el teléfono como lo cargan: sin 0 y con 15.
    if (tabla === 'usuarios') return json([{ telefono: '3564 15 562413' }])
    if (tabla === 'clientes') return json(CLIENTES.slice(Number(u.searchParams.get('offset')) || 0))
    return json([])
  })
})
afterAll(() => vi.unstubAllGlobals())

const USUARIO = { id: 'u-vend', nombre: 'Vico' }

describe('cliente del CRM en cada chat', () => {
  it('reconoce al cliente por el teléfono aunque esté cargado distinto', async () => {
    upsertChat('5493576412286@s.whatsapp.net')
    const f = await fichaCrm('5493576412286@s.whatsapp.net')
    expect(f).toMatchObject({ vinculo: 'telefono', cliente: { id: 'c1', nombre: 'Mauricio Barra' } })
  })

  it('si dos clientes comparten el número, gana el que no está archivado', async () => {
    upsertChat('5493406518585@s.whatsapp.net')
    expect((await fichaCrm('5493406518585@s.whatsapp.net')).cliente.id).toBe('c2')
  })

  it('un grupo no tiene cliente', async () => {
    expect(await fichaCrm('120363000000000001@g.us')).toMatchObject({ grupo: true, cliente: null })
  })

  it('vínculo a mano, "no es cliente" y volver a reconocer por teléfono', async () => {
    const J = '5493576412286@s.whatsapp.net'
    expect((await vincularCliente(J, 'c4')).cliente.id).toBe('c4')
    expect((await vincularCliente(J, 'ninguno'))).toMatchObject({ cliente: null, vinculo: 'ninguno' })
    expect((await vincularCliente(J, null)).cliente.id).toBe('c1')
    await expect(vincularCliente(J, 'no-existe')).rejects.toThrow(/no existe/)
    await expect(vincularCliente('120363000000000001@g.us', 'c1')).rejects.toThrow(/grupo/)
  })

  it('busca por nombre o por parte del teléfono', async () => {
    expect((await buscarClientes('ana')).map((c) => c.id)).toEqual(['c2', 'c3'])
    expect((await buscarClientes('412286')).map((c) => c.id)).toEqual(['c1'])
    expect(await buscarClientes('a')).toEqual([])
  })

  it('crea el cliente con el teléfono como se carga en el CRM y lo deja vinculado', async () => {
    const J = '5493406777777@s.whatsapp.net'
    upsertChat(J, { pushName: 'Carla' })
    const f = await crearCliente(J, { nombre: '  Carla Ruiz ', localidad: 'Rafaela' }, USUARIO)
    const alta = enviados.find((e) => e.tabla === 'clientes').fila
    expect(alta).toMatchObject({ nombre: 'Carla Ruiz', telefono: '3406777777', localidad: 'Rafaela', canal: 'whatsapp', status: 'activo', creado_por: 'u-vend' })
    expect(enviados.find((e) => e.tabla === 'eventos').fila).toMatchObject({ entidad: 'cliente', tipo: 'alta', usuario_id: 'u-vend' })
    expect(enviados.every((e) => e.perfil === 'crm')).toBe(true)
    expect(f).toMatchObject({ vinculo: 'manual', cliente: { nombre: 'Carla Ruiz' } })
    await expect(crearCliente(J, {}, USUARIO)).rejects.toThrow(/ya es de Carla Ruiz/)
  })

  it('un número de otro país se guarda completo', async () => {
    const J = '15551234567@s.whatsapp.net'
    upsertChat(J)
    await crearCliente(J, { nombre: 'Extranjero' }, USUARIO)
    expect(enviados.filter((e) => e.tabla === 'clientes').at(-1).fila.telefono).toBe('+15551234567')
  })

  it('seguimiento y tarea quedan en el CRM a nombre de quien los hizo', async () => {
    const J = '5493576412286@s.whatsapp.net'
    await registrarSeguimiento(J, 'Pidió precio del Corolla', USUARIO)
    expect(enviados.at(-1)).toMatchObject({ tabla: 'eventos', fila: { entidad_id: 'c1', tipo: 'contacto', usuario_id: 'u-vend', datos: { texto: 'Pidió precio del Corolla' } } })
    await crearTarea(J, { titulo: 'Llamar', fecha: '2026-10-05', hora: '9:00', prioridad: 'urgente' }, USUARIO)
    const tarea = enviados.find((e) => e.tabla === 'tareas').fila
    expect(tarea).toMatchObject({ titulo: 'Llamar', cliente_id: 'c1', asignado_a: 'u-vend', creado_por: 'u-vend', prioridad: 'normal', hora: null })
    await expect(crearTarea(J, { titulo: 'Sin fecha' }, USUARIO)).rejects.toThrow(/fecha/)
    await expect(registrarSeguimiento(J, '   ', USUARIO)).rejects.toThrow()
    await expect(registrarSeguimiento('5490000000001@s.whatsapp.net', 'x', USUARIO)).rejects.toThrow(/no está vinculado/)
  })

  it('la alerta exige fecha y hora y avisa al elegido o a quien la crea', async () => {
    const J = '5493576412286@s.whatsapp.net'
    await crearAlerta(J, { titulo: ' Llamar por el Gol ', fecha: '2026-11-25', hora: '10:30' }, USUARIO)
    expect(enviados.at(-1)).toMatchObject({ tabla: 'alertas', fila: { titulo: 'Llamar por el Gol', fecha: '2026-11-25', hora: '10:30', cliente_id: 'c1', asignado_a: 'u-vend', creado_por: 'u-vend' } })
    await crearAlerta(J, { titulo: 'x', fecha: '2026-11-25', hora: '10:30', asignadoA: 'u-otro' }, USUARIO)
    expect(enviados.at(-1).fila.asignado_a).toBe('u-otro')
    await expect(crearAlerta(J, { titulo: 'Sin hora', fecha: '2026-11-25' }, USUARIO)).rejects.toThrow(/hora/)
    await expect(crearAlerta(J, { titulo: 'Sin fecha', hora: '10:30' }, USUARIO)).rejects.toThrow(/fecha/)
  })
})

describe('tarea o alerta desde un chat que todavía no es cliente', () => {
  it('crea el cliente con su nombre de WhatsApp y su teléfono, y la tarea queda de ese cliente', async () => {
    const J = '5493492666111@s.whatsapp.net'
    upsertChat(J, { pushName: 'Sergio' })
    const r = await crearTarea(J, { titulo: 'Llamar', fecha: '2026-12-05' }, USUARIO)
    expect(r.clienteCreado).toBe(true)
    const cliente = enviados.filter((e) => e.tabla === 'clientes').at(-1).fila
    expect(cliente).toMatchObject({ nombre: 'Sergio', telefono: '3492666111' })
    expect(enviados.find((e) => e.tabla === 'tareas' && e.fila.titulo === 'Llamar' && e.fila.cliente_id === r.clienteId)).toBeTruthy()
    // La segunda vez ya es cliente: no se crea otro.
    const otra = await crearTarea(J, { titulo: 'Otra', fecha: '2026-12-06' }, USUARIO)
    expect(otra.clienteCreado).toBeUndefined()
    expect(otra.clienteId).toBe(r.clienteId)
  })

  it('con la alerta pasa lo mismo, y sin nombre queda como "Contacto de WhatsApp"', async () => {
    const J = '5493492666222@s.whatsapp.net'
    upsertChat(J)
    const r = await crearAlerta(J, { titulo: 'Avisar', fecha: '2026-12-05', hora: '10:00' }, USUARIO)
    expect(r.clienteCreado).toBe(true)
    expect(enviados.filter((e) => e.tabla === 'clientes').at(-1).fila.nombre).toBe('Contacto de WhatsApp')
  })

  it('si faltan datos no crea el cliente de balde', async () => {
    const J = '5493492666333@s.whatsapp.net'
    upsertChat(J, { pushName: 'Nadie' })
    const antes = enviados.filter((e) => e.tabla === 'clientes').length
    await expect(crearTarea(J, { titulo: 'Sin fecha' }, USUARIO)).rejects.toThrow(/fecha/)
    await expect(crearAlerta(J, { titulo: 'Sin hora', fecha: '2026-12-05' }, USUARIO)).rejects.toThrow(/hora/)
    expect(enviados.filter((e) => e.tabla === 'clientes')).toHaveLength(antes)
  })

  it('respeta "no es cliente" y no crea nada en grupos', async () => {
    const J = '5493492666444@s.whatsapp.net'
    upsertChat(J, { pushName: 'Spam', clienteId: 'ninguno' })
    await expect(crearTarea(J, { titulo: 'x', fecha: '2026-12-05' }, USUARIO)).rejects.toThrow(/no es cliente/)
    await expect(crearTarea('120363000000000009@g.us', { titulo: 'x', fecha: '2026-12-05' }, USUARIO)).rejects.toThrow(/grupo/i)
  })
})

describe('el bot habla con el CRM por teléfono', () => {
  it('reconoce al cliente por teléfono, con cualquier formato; inválido o desconocido da null', async () => {
    expect((await clientePorTelefono('+54 9 3576 41-2286'))).toMatchObject({ id: 'c1' })
    expect((await clientePorTelefono('3406518585')).id).toBe('c2')
    expect(await clientePorTelefono('3511000000')).toBeNull()
    expect(await clientePorTelefono('abc')).toBeNull()
  })

  it('si el cliente existe lo devuelve; con interés deja un contacto del bot', async () => {
    const antes = enviados.length
    expect(await asegurarCliente({ telefono: '3576412286', nombre: 'Otro' }, null)).toMatchObject({ creado: false, cliente: { id: 'c1' } })
    expect(enviados.length).toBe(antes)
    await asegurarCliente({ telefono: '3576412286', interes: 'Corolla 2020' }, null)
    expect(enviados.at(-1)).toMatchObject({ tabla: 'eventos', fila: { entidad_id: 'c1', tipo: 'contacto', usuario_id: null, datos: { texto: 'Interés: Corolla 2020', via: 'bot' } } })
  })

  it('si no existe lo crea con los 10 dígitos, nombre por defecto y el interés en las notas', async () => {
    const r = await asegurarCliente({ telefono: '+54 9 351 555-0101', localidad: 'Rafaela', interes: 'Gol', notas: 'Pidió financiar' }, null)
    expect(r).toMatchObject({ creado: true, cliente: { nombre: 'Contacto de WhatsApp', telefono: '3515550101' } })
    const alta = enviados.filter((e) => e.tabla === 'clientes').at(-1).fila
    expect(alta).toMatchObject({ canal: 'whatsapp', status: 'activo', creado_por: null, localidad: 'Rafaela', notas: 'Pidió financiar\nInterés: Gol' })
    expect(enviados.at(-1)).toMatchObject({ tabla: 'eventos', fila: { tipo: 'alta', datos: { origen: 'bot' } } })
    // El segundo pedido ya lo encuentra (se olvidó la caché).
    expect((await asegurarCliente({ telefono: '3515550101' }, null)).creado).toBe(false)
  })

  it('un teléfono inválido es un error 400', async () => {
    await expect(asegurarCliente({ telefono: 'xx' }, null)).rejects.toMatchObject({ status: 400, message: 'Teléfono inválido.' })
  })

  it('seguimiento y tarea de un teléfono que no es cliente dan 404', async () => {
    await expect(seguimientoPorTelefono('3511000000', 'hola', null)).rejects.toMatchObject({ status: 404, message: 'Ese teléfono no es cliente del CRM.' })
    await expect(tareaPorTelefono('3511000000', { titulo: 'x' }, null)).rejects.toMatchObject({ status: 404 })
    await expect(seguimientoPorTelefono('3576412286', '  ', null)).rejects.toThrow(/qué se habló/)
    await seguimientoPorTelefono('3576412286', 'Quiere visitar', null)
    expect(enviados.at(-1).fila.datos).toEqual({ texto: 'Quiere visitar', via: 'bot' })
  })

  it('la tarea del bot sin fecha es para hoy (Argentina) y sin asignado', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-25T01:30:00Z')) // en Argentina todavía es 24
    try {
      await tareaPorTelefono('3576412286', { titulo: 'Llamar' }, null)
    } finally {
      vi.useRealTimers()
    }
    expect(enviados.find((e) => e.tabla === 'tareas' && e.fila.titulo === 'Llamar' && e.fila.fecha === '2026-11-24').fila).toMatchObject({ cliente_id: 'c1', asignado_a: null, creado_por: null })
    expect(enviados.at(-1).fila.datos).toMatchObject({ titulo: 'Llamar', via: 'bot' })
  })
})

describe('alta automática de quien escribe', () => {
  it('carga al desconocido con su nombre de WhatsApp, una sola vez', async () => {
    const J = '5493492555111@s.whatsapp.net'
    upsertChat(J, { pushName: 'Lucía' })
    const c = await altaAutomatica(J)
    expect(c).toMatchObject({ nombre: 'Lucía', telefono: '3492555111' })
    expect(enviados.filter((e) => e.tabla === 'eventos').at(-1).fila).toMatchObject({ tipo: 'alta', datos: { origen: 'whatsapp_automatico' }, usuario_id: null })
    expect(await altaAutomatica(J)).toBeNull()
  })

  it('sin nombre de WhatsApp queda como "Contacto de WhatsApp"', async () => {
    const J = '5493492555222@s.whatsapp.net'
    upsertChat(J)
    expect((await altaAutomatica(J)).nombre).toBe('Contacto de WhatsApp')
  })

  it('si alguien lo cargó a mano hace instantes (la copia en memoria no lo tiene), no se duplica', async () => {
    const J = '5493492555444@s.whatsapp.net'
    upsertChat(J, { pushName: 'Rosa' })
    await clientePorTelefono('3576412286') // deja la copia en memoria cargada
    CLIENTES.push({ id: 'manual', nombre: 'Rosa a mano', telefono: '3492 55-5444', status: 'activo', archivado_en: null })
    const antes = enviados.length
    expect(await altaAutomatica(J)).toBeNull()
    expect(enviados).toHaveLength(antes)
  })

  it('no carga clientes existentes, empleados, grupos ni chats marcados', async () => {
    upsertChat('5493564562413@s.whatsapp.net', { pushName: 'Empleado' })
    expect(await altaAutomatica('5493564562413@s.whatsapp.net')).toBeNull()
    expect(await altaAutomatica('5493576412286@s.whatsapp.net')).toBeNull()
    expect(await altaAutomatica('120363000000000001@g.us')).toBeNull()
    upsertChat('5493492555333@s.whatsapp.net', { pushName: 'Pepe', clienteId: 'ninguno' })
    expect(await altaAutomatica('5493492555333@s.whatsapp.net')).toBeNull()
  })
})
