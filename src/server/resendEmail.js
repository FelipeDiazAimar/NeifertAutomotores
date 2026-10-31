import { LOGO_EMAIL_BASE64 } from './emailLogo.js'

const LOGO_CID = 'logo-neifert'

/** Manda un email vía la API REST de Resend (sin SDK — mismo criterio que
 *  dolarapi/legacyFetch en este repo: fetch directo a servicios externos). */
export async function enviarEmail({ to, subject, html, text }, deps = {}) {
  const fetchImpl = deps.fetchImpl || fetch
  const apiKey = deps.apiKey || process.env.RESEND_API_KEY
  const from = deps.from || 'Alertas Neifert <alertas@neifertautomotores.com>'

  // Si el HTML referencia el logo inline (cid), se adjunta embebido: no depende
  // de URLs públicas ni de que el cliente cargue imágenes remotas.
  const attachments = html.includes(`cid:${LOGO_CID}`)
    ? [
        {
          filename: 'logo-neifert.png',
          content: LOGO_EMAIL_BASE64,
          content_type: 'image/png',
          content_id: LOGO_CID,
        },
      ]
    : undefined
  const res = await fetchImpl('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      html,
      ...(text ? { text } : {}),
      ...(attachments ? { attachments } : {}),
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.message || `Resend respondió ${res.status}`)
  }
  return res.json()
}

function escaparHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Cuerpo HTML de marca para el aviso de una alerta (logo + título + detalle).
 *  El logo es blanco, por eso va sobre franja oscura. */
export function htmlAlerta({ titulo, descripcion }) {
  return (
    `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#0b0b0f">` +
    `<img src="cid:${LOGO_CID}" alt="Neifert Automotores" width="560" style="display:block;width:100%;max-width:560px;height:auto;border:0" />` +
    `<h2 style="font-size:20px;margin:16px 8px 4px">${escaparHtml(titulo)}</h2>` +
    (descripcion
      ? `<p style="font-size:14px;line-height:1.5;color:#333;margin:0 8px">${escaparHtml(descripcion).replace(/\n/g, '<br>')}</p>`
      : '') +
    `<p style="font-size:12px;color:#888;margin:24px 8px 0">Enviado por el CRM de Neifert Automotores.</p>` +
    `</div>`
  )
}
