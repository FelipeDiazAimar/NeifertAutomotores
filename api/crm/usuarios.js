import { createClient } from '@supabase/supabase-js'
import { emailDeUsuario } from '../../src/crm/lib/authEmail.js'

/** Serverless — alta de usuario y reset de contraseña del CRM nuevo, disparado
 *  desde la UI (/crm/usuarios). Autoriza validando que el llamador sea un
 *  usuario activo con rol admin o dueno.
 *
 *  POST /api/crm/usuarios
 *  Authorization: Bearer <access token del usuario logueado>
 *  body: { accion: 'crear',          usuario, nombre, rol, password }
 *      | { accion: 'reset_password', id, password }
 */
export async function handleUsuarios(req, res, { env = process.env, deps = {} } = {}) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' })

  const url = env.VITE_SUPABASE_URL
  const anonKey = env.VITE_SUPABASE_ANON_KEY
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !anonKey || !serviceKey) {
    return res.status(501).json({ ok: false, error: 'Faltan credenciales de Supabase en el servidor' })
  }

  const token = (req.headers.authorization || req.headers.Authorization || '').replace(/^Bearer\s+/i, '')
  if (!token) return res.status(401).json({ ok: false, error: 'Falta el token de sesión' })

  const makeAnon = deps.makeAnon || (() => createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } }))
  const makeAdmin = deps.makeAdmin || (() => createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } }))

  const anon = makeAnon()
  const { data: authData, error: authErr } = await anon.auth.getUser(token)
  const uid = authData?.user?.id
  if (authErr || !uid) return res.status(401).json({ ok: false, error: 'Sesión inválida' })

  const admin = makeAdmin()
  const { data: caller, error: callerErr } = await admin
    .schema('crm').from('usuarios').select('rol, activo').eq('id', uid).maybeSingle()
  if (callerErr) return res.status(500).json({ ok: false, error: callerErr.message })
  if (!caller || !caller.activo || !['admin', 'dueno'].includes(caller.rol)) {
    return res.status(403).json({ ok: false, error: 'No tenés permiso para gestionar usuarios' })
  }

  const body = req.body || {}

  try {
    if (body.accion === 'crear') {
      const { usuario, nombre, rol, password } = body
      if (!usuario || !nombre || !rol || !password) {
        return res.status(400).json({ ok: false, error: 'Faltan datos (usuario, nombre, rol, password)' })
      }
      const email = emailDeUsuario(usuario)
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email, password, email_confirm: true, user_metadata: { nombre, rol },
      })
      if (createErr) {
        if (/already been registered|already registered/i.test(createErr.message)) {
          return res.status(409).json({ ok: false, error: 'Ese usuario ya existe' })
        }
        return res.status(400).json({ ok: false, error: createErr.message })
      }
      const authUser = created.user

      const { data: legacyU } = await admin.schema('crm_legacy').from('usuarios')
        .select('id').eq('usuario', usuario).maybeSingle()

      const { error: upErr } = await admin.schema('crm').from('usuarios').upsert({
        id: authUser.id, usuario, nombre, rol, activo: true, id_legacy: legacyU?.id ?? null,
      }, { onConflict: 'id' }).select()
      if (upErr) return res.status(400).json({ ok: false, error: upErr.message })

      return res.status(200).json({ ok: true, id: authUser.id })
    }

    if (body.accion === 'reset_password') {
      const { id, password } = body
      if (!id || !password) return res.status(400).json({ ok: false, error: 'Faltan id / password' })
      const { error } = await admin.auth.admin.updateUserById(id, { password })
      if (error) return res.status(400).json({ ok: false, error: error.message })
      return res.status(200).json({ ok: true })
    }

    return res.status(400).json({ ok: false, error: 'Acción desconocida' })
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message })
  }
}

export default function handler(req, res) {
  return handleUsuarios(req, res)
}
