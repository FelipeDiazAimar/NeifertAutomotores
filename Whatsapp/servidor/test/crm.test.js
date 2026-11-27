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

describe('tarea o alerta de un chat que no es cliente', () => {
  const tareas = () => enviados.filter((e) => e.tabla === 'tareas')
  const clientesCreados = () => enviados.filter((e) => e.tabla === 'clientes').length

  it('la tarea queda sin cliente, con el contacto en el detalle, y no se crea ningún cliente', async () => {
    const J = '5493492666111@s.whatsapp.net'
    upsertChat(J, { pushName: 'Sergio' })
    const antes = clientesCreados()
    const r = await crearTarea(J, { titulo: 'Llamar al proveedor', fecha: '2026-12-05', descripcion: 'Pedir presupuesto' }, USUARIO)
    expect(r).toMatchObject({ ok: true, clienteId: null, sinCliente: true })
    const fila = tareas().at(-1).fila
    expect(fila).toMatchObject({ titulo: 'Llamar al proveedor', cliente_id: null, creado_por: 'u-vend' })
    expect(fila.descripcion).toBe('Contacto de WhatsApp (no es cliente): Sergio · +5493492666111\nPedir presupuesto')
    expect(clientesCreados()).toBe(antes)
    // No se anota nada en la bitácora de un cliente que no existe.
    expect(enviados.filter((e) => e.tabla === 'eventos' && e.fila.datos?.titulo === 'Llamar al proveedor')).toHaveLength(0)
  })

  it('la alerta también: sin cliente y con el contacto (sin nombre, solo el teléfono)', async () => {
    const J = '5493492666222@s.whatsapp.net'
    upsertChat(J)
    const r = await crearAlerta(J, { titulo: 'Avisar', fecha: '2026-12-05', hora: '10:00' }, USUARIO)
    expect(r).toMatchObject({ ok: true, clienteId: null, sinCliente: true })
    const fila = enviados.filter((e) => e.tabla === 'alertas').at(-1).fila
    expect(fila).toMatchObject({ cliente_id: null, asignado_a: 'u-vend' })
    expect(fila.descripcion).toBe('Contacto de WhatsApp (no es cliente): +5493492666222')
  })

  it('un chat marcado "no es cliente" y un grupo también pueden tener tarea', async () => {
    const J = '5493492666444@s.whatsapp.net'
    upsertChat(J, { pushName: 'Spam', clienteId: 'ninguno' })
    expect((await crearTarea(J, { titulo: 'x', fecha: '2026-12-05' }, USUARIO)).sinCliente).toBe(true)
    const G = '120363000000000009@g.us'
    upsertChat(G, { nombre: 'Proveedores' })
    await crearTarea(G, { titulo: 'Pedir lista', fecha: '2026-12-05' }, USUARIO)
    expect(tareas().at(-1).fila.descripcion).toMatch(/^Grupo de WhatsApp: /)
  })

  it('si es cliente, queda del cliente y sin la línea de contacto', async () => {
    const J = '5493576412286@s.whatsapp.net'
    await crearTarea(J, { titulo: 'Con cliente', fecha: '2026-12-05' }, USUARIO)
    expect(tareas().at(-1).fila).toMatchObject({ cliente_id: 'c1', descripcion: null })
  })

  it('con datos que faltan no crea nada', async () => {
    const J = '5493492666333@s.whatsapp.net'
    upsertChat(J, { pushName: 'Nadie' })
    const antes = tareas().length
    await expect(crearTarea(J, { titulo: 'Sin fecha' }, USUARIO)).rejects.toThrow(/fecha/)
    expect(tareas()).toHaveLength(antes)
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
