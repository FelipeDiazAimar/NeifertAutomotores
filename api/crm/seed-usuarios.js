import { createClient } from '@supabase/supabase-js'
import { emailDeUsuario } from '../../src/crm/lib/authEmail.js'

/** Serverless — crea/actualiza los usuarios del CRM nuevo: cuenta en Supabase
 *  Auth (email sintético) + fila en crm.usuarios (con id_legacy matcheado
 *  contra crm_legacy.usuarios por usuario). Idempotente por `usuario`.
 *
 *  POST /api/crm/seed-usuarios  { usuarios: [{ usuario, nombre, rol, password }] }
 *  Auth: Authorization: Bearer <SEED_SECRET | CRON_SECRET>
 */
export async function handleSeedUsuarios(req, res, { env = process.env, deps = {} } = {}) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' })

  const secret = env.SEED_SECRET || env.CRON_SECRET
  const got = (req.headers.authorization || req.headers.Authorization || '').replace(/^Bearer\s+/i, '')
  if (!secret || got !== secret) return res.status(401).json({ ok: false, error: 'No autorizado' })

  const url = env.VITE_SUPABASE_URL
  const key = env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return res.status(501).json({ ok: false, error: 'Faltan VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY' })

  const usuarios = req.body?.usuarios
  if (!Array.isArray(usuarios) || !usuarios.length) {
    return res.status(400).json({ ok: false, error: 'body.usuarios vacío' })
  }

  const makeAdmin = deps.makeAdmin || (() => createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }))
  const admin = makeAdmin()
  const resultados = []

  for (const u of usuarios) {
    try {
      const email = emailDeUsuario(u.usuario)
      const { data: list, error: listErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
      if (listErr) throw listErr
      let authUser = list.users.find((x) => x.email === email)
      let creado = false

      if (!authUser) {
        const { data, error } = await admin.auth.admin.createUser({
          email, password: u.password, email_confirm: true,
          user_metadata: { nombre: u.nombre, rol: u.rol },
        })
        if (error) throw error
        authUser = data.user
        creado = true
      } else if (u.password) {
        const { error } = await admin.auth.admin.updateUserById(authUser.id, { password: u.password })
        if (error) throw error
      }

      const { data: legacyU } = await admin.schema('crm_legacy').from('usuarios')
        .select('id').eq('usuario', u.usuario).maybeSingle()

      const { error: upErr } = await admin.schema('crm').from('usuarios').upsert({
        id: authUser.id, usuario: u.usuario, nombre: u.nombre, rol: u.rol, activo: true,
        id_legacy: legacyU?.id ?? null,
      }, { onConflict: 'id' }).select()
      if (upErr) throw upErr

      resultados.push({ usuario: u.usuario, creado, actualizado: !creado })
    } catch (e) {
      resultados.push({ usuario: u.usuario, error: e.message })
    }
  }

  const ok = resultados.every((r) => !r.error)
  return res.status(ok ? 200 : 207).json({ ok, resultados })
}

export default function handler(req, res) {
  return handleSeedUsuarios(req, res)
}
