/*
 * Datos del negocio para el bot (la IA los consulta con la herramienta consultar_negocio): dirección,
 * horarios, teléfonos y categorías. Salen de lo que se edita en la página (Admin → Contenido → Redes y
 * contacto), así hay una sola fuente y no hace falta repetirlos en el texto del asistente.
 * Sin dependencias: se prueba sola.
 */

// Lo mismo que trae la página por defecto (src/store/useSiteStore.js), para cuando todavía no se guardó nada.
const POR_DEFECTO = {
  address: 'Av. Urquiza 898, San Francisco, Córdoba',
  hours: 'Lun a Vie · 8 a 12:30 h y 16 a 20 h · Sáb 9 a 13 h',
  phone: '(03564) 43-5199',
  email: 'neifertsanfrancisco@gmail.com',
  whatsappPhone: '543564562413',
  instagram: 'https://www.instagram.com/neifertautomotores',
  facebook: 'https://www.facebook.com/neifertautomotores',
}
const CATEGORIAS_POR_DEFECTO = ['SUVs', 'Sedanes', 'Coupé', 'Sport', 'Eléctricos', 'Pickups']

const texto = (v) => String(v ?? '').trim()

/**
 * @param {{ socials?: object, categories?: { label: string }[] }} contenido  las filas de contenido_sitio
 * @param {string} web  dirección de la página (https://...), o ''
 */
export function armarNegocio({ socials, categories } = {}, web = '') {
  const s = { ...POR_DEFECTO }
  for (const [clave, valor] of Object.entries(socials && typeof socials === 'object' ? socials : {})) if (texto(valor)) s[clave] = texto(valor)
  const categorias = (Array.isArray(categories) ? categories : []).map((c) => texto(c?.label)).filter(Boolean)
  const whatsapp = s.whatsappPhone.replace(/\D/g, '')
  return {
    nombre: 'Neifert Automotores',
    direccion: s.address,
    mapa: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.address)}`,
    horarios: s.hours,
    nota_horarios: 'Son los horarios de atención en el salón. Los días y horas que no figuran, el salón está cerrado.',
    telefono: s.phone,
    whatsapp: whatsapp ? `+${whatsapp}` : '',
    email: s.email,
    web,
    instagram: s.instagram,
    facebook: s.facebook,
    categorias: categorias.length ? categorias : CATEGORIAS_POR_DEFECTO,
    // Lo carga el negocio en Admin → Contenido → Redes y contacto → "Información para el asistente". Sin cargar no se
    // manda: la IA no tiene que inventar condiciones de financiación ni de toma de usados.
    ...(texto(s.financing) ? { financiacion: texto(s.financing) } : {}),
    ...(texto(s.tradeIn) ? { permuta: texto(s.tradeIn) } : {}),
  }
}
