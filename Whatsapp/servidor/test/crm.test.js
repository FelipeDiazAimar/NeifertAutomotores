import './entorno.js'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { upsertChat } from '../src/almacen.js'
import { buscarClientes, crearCliente, crearTarea, fichaCrm, registrarSeguimiento, vincularCliente } from '../src/crm.js'

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
})
