import './entorno.js'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { exigirCabecera, exigirEscritura, exigirLinea, exigirSesion, iniciarSesion, permisosDeRol } from '../src/auth.js'

// CRM de mentira: token → usuario de Supabase Auth, id → fila de crm.usuarios.
const USUARIOS = {
  'u-admin': { id: 'u-admin', usuario: 'ana', nombre: 'Ana', rol: 'admin', activo: true },
  'u-vend': { id: 'u-vend', usuario: 'vico', nombre: 'Vico', rol: 'vendedor', activo: true },
  'u-lect': { id: 'u-lect', usuario: 'lu', nombre: 'Lu', rol: 'lectura', activo: true },
  'u-baja': { id: 'u-baja', usuario: 'ex', nombre: 'Ex', rol: 'admin', activo: false },
  'u-otro': { id: 'u-otro', usuario: 'o', nombre: 'Otro', rol: 'mecanico', activo: true },
}
const json = (cuerpo, status = 200) => new Response(JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json' } })

beforeAll(() => {
  vi.stubGlobal('fetch', async (url, opciones = {}) => {
    const u = new URL(url)
    if (u.pathname === '/auth/v1/user') {
      const token = opciones.headers.Authorization.replace('Bearer ', '')
      return token.startsWith('token-') ? json({ id: token.slice(6) }) : json({ msg: 'invalid' }, 401)
    }
    if (u.pathname === '/rest/v1/usuarios') {
      const id = u.searchParams.get('id').replace('eq.', '')
      return json(USUARIOS[id] ? [USUARIOS[id]] : [])
    }
    return json({}, 404)
  })
})
afterAll(() => vi.unstubAllGlobals())

function resFalsa() {
  const res = { statusCode: 200, cabeceras: {}, cuerpo: null }
  res.status = (c) => ((res.statusCode = c), res)
  res.json = (b) => ((res.cuerpo = b), res)
  res.setHeader = (k, v) => (res.cabeceras[k.toLowerCase()] = v)
  return res
}
const reqFalso = (extra = {}) => ({ method: 'POST', headers: {}, body: {}, socket: { remoteAddress: '127.0.0.1' }, get(h) { return this.headers[h.toLowerCase()] }, path: '/x', ...extra })

/** Canjea el token del CRM y devuelve la cookie que da el servidor. */
async function entrar(id) {
  const res = resFalsa()
  await iniciarSesion(reqFalso({ body: { token: `token-${id}` } }), res)
  return { res, cookie: String(res.cabeceras['set-cookie'] || '').split(';')[0] }
}

/** Pasa el pedido por exigirSesion y devuelve el usuario que queda (o la respuesta de error). */
async function conCookie(cookie) {
  const req = reqFalso({ headers: { cookie } })
  const res = resFalsa()
  let paso = false
  await exigirSesion(req, res, () => (paso = true))
  return { paso, usuario: req.usuario, res, req }
}

describe('permisos por rol', () => {
  it('admin y dueño manejan la línea; vendedor escribe; lectura solo mira', () => {
    expect(permisosDeRol('admin')).toEqual({ escribir: true, linea: true })
    expect(permisosDeRol('dueno')).toEqual({ escribir: true, linea: true })
    expect(permisosDeRol('vendedor')).toEqual({ escribir: true, linea: false })
    expect(permisosDeRol('lectura')).toEqual({ escribir: false, linea: false })
    expect(permisosDeRol('mecanico')).toBe(null)
  })
})

describe('sesión con el CRM', () => {
  it('canjea el token del CRM por una cookie firmada y HttpOnly', async () => {
    const { res, cookie } = await entrar('u-vend')
    expect(res.statusCode).toBe(200)
    expect(res.cuerpo.usuario).toMatchObject({ id: 'u-vend', nombre: 'Vico', escribir: true, linea: false })
    expect(res.cabeceras['set-cookie']).toMatch(/HttpOnly/)
    expect((await conCookie(cookie)).usuario.id).toBe('u-vend')
  })

  it('token vencido o inválido → 401', async () => {
    const res = resFalsa()
    await iniciarSesion(reqFalso({ body: { token: 'cualquiera' } }), res)
    expect(res.statusCode).toBe(401)
  })

  it('usuario inactivo o con un rol sin acceso → 403', async () => {
    expect((await entrar('u-baja')).res.statusCode).toBe(403)
    expect((await entrar('u-otro')).res.statusCode).toBe(403)
  })

  it('sin cookie, o con una cookie alterada, no entra', async () => {
    expect((await conCookie('')).res.statusCode).toBe(401)
    const { cookie } = await entrar('u-vend')
    const alterada = cookie.replace('u-vend', 'u-admin')
    const r = await conCookie(alterada)
    expect(r.paso).toBe(false)
    expect(r.res.statusCode).toBe(401)
  })
})

describe('qué puede hacer cada uno', () => {
  const pasa = (mw, usuario) => {
    let ok = false
    const res = resFalsa()
    mw(reqFalso({ usuario }), res, () => (ok = true))
    return ok ? 'pasa' : res.statusCode
  }
  it('vincular/desvincular: solo admin y dueño', () => {
    expect(pasa(exigirLinea, { id: 'a', linea: true, escribir: true })).toBe('pasa')
    expect(pasa(exigirLinea, { id: 'v', linea: false, escribir: true })).toBe(403)
  })
  it('escribir: no el de solo lectura', () => {
    expect(pasa(exigirEscritura, { id: 'v', linea: false, escribir: true })).toBe('pasa')
    expect(pasa(exigirEscritura, { id: 'l', linea: false, escribir: false })).toBe(403)
  })
  it('los POST sin la cabecera del panel se rechazan (CSRF)', () => {
    expect(pasa(exigirCabecera, null)).toBe(403)
    let ok = false
    exigirCabecera(reqFalso({ headers: { 'x-nf-wa': '1' } }), resFalsa(), () => (ok = true))
    expect(ok).toBe(true)
    ok = false
    exigirCabecera(reqFalso({ method: 'GET' }), resFalsa(), () => (ok = true))
    expect(ok).toBe(true)
  })
})
