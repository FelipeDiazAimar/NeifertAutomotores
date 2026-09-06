/** Email sintético 1-a-1 por usuario del CRM. No recibe correo real: es un id
 *  estable para Supabase Auth. Misma fórmula que crmShadowEmail en
 *  src/server/crmCore.js — no divergir. */
export function emailDeUsuario(usuario) {
  return `${String(usuario).toLowerCase().replace(/[^a-z0-9]/g, '')}@crm-viejo.neifert.local`
}
