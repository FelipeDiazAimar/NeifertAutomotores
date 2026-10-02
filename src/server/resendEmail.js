/** Manda un email vía la API REST de Resend (sin SDK — mismo criterio que
 *  dolarapi/legacyFetch en este repo: fetch directo a servicios externos). */
export async function enviarEmail({ to, subject, html }, deps = {}) {
  const fetchImpl = deps.fetchImpl || fetch
  const apiKey = deps.apiKey || process.env.RESEND_API_KEY
  const from = deps.from || 'Alertas Neifert <alertas@neifertautomotores.com>'

  const res = await fetchImpl('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [to], subject, html }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.message || `Resend respondió ${res.status}`)
  }
  return res.json()
}
