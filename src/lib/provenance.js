/** Procedencia de una visita: de qué canal llegó la persona.
 *  Prioridad: parámetro ?ref → referrer → first-touch de la sesión → 'Directo'. */

export const SOURCES = ['Instagram', 'Facebook', 'WhatsApp', 'Web', 'Directo']

export const SOURCE_COLORS = {
  Instagram: '#E1306C',
  Facebook: '#1877F2',
  WhatsApp: '#25D366',
  Web: '#BE1E2D',
  Directo: '#9AA0A8',
}

/** Mapea el valor de ?ref= a un canal canónico. */
const REF_MAP = {
  ig: 'Instagram',
  instagram: 'Instagram',
  fb: 'Facebook',
  facebook: 'Facebook',
  wa: 'WhatsApp',
  whatsapp: 'WhatsApp',
  wsp: 'WhatsApp',
  web: 'Web',
  share: 'Web',
  compartido: 'Web',
}

const SESSION_KEY = 'nf-provenance'

/** Detecta la procedencia y la fija como first-touch de la sesión. */
export function detectSource() {
  if (typeof window === 'undefined') return 'Directo'

  // 1) Parámetro explícito ?ref=
  const ref = new URLSearchParams(window.location.search).get('ref')?.toLowerCase()
  if (ref && REF_MAP[ref]) {
    sessionStorage.setItem(SESSION_KEY, REF_MAP[ref])
    return REF_MAP[ref]
  }

  // 2) Ya detectada en esta sesión (first-touch)
  const saved = sessionStorage.getItem(SESSION_KEY)
  if (saved) return saved

  // 3) Heurística por referrer
  const r = document.referrer || ''
  let src = 'Directo'
  if (/instagram\.com/i.test(r)) src = 'Instagram'
  else if (/facebook\.com|fb\.com|fb\.me/i.test(r)) src = 'Facebook'
  else if (/whatsapp|wa\.me/i.test(r)) src = 'WhatsApp'
  else if (r && !r.includes(window.location.host)) src = 'Web'
  else if (r) src = 'Web'

  sessionStorage.setItem(SESSION_KEY, src)
  return src
}
