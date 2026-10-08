/**
 * Los chats que la vista sin conexión del WhatsApp guarda en el navegador (IndexedDB
 * "nf-wa-lectura", ver Whatsapp/web/app.js). La copia del panel está en /wa-lectura/, del
 * mismo sitio que el CRM, así que el CRM los puede borrar: al cerrar sesión, cuando un
 * administrador cerró la vista sin conexión o pidió borrar lo guardado en todas las PC.
 */
const BASE = 'nf-wa-lectura'
const LINEA = 'nf-wa-lectura-linea'
const BORRADO = 'nf-wa-lectura-borrado' // cuándo se borró por última vez en este navegador

export function borrarChatsGuardados() {
  try {
    // Si la vista está abierta en otra pestaña, se borra apenas se cierre.
    indexedDB.deleteDatabase(BASE)
  } catch {
    // Sin IndexedDB no había nada guardado.
  }
  try {
    localStorage.removeItem(LINEA)
    localStorage.setItem(BORRADO, String(Date.now()))
  } catch {
    // Sin localStorage, igual.
  }
}

/**
 * Aplica el ajuste que informa el servidor ({ habilitada, borradoEn }): si la vista sin
 * conexión está cerrada, o se pidió borrar después del último borrado de este navegador,
 * se borra lo guardado.
 */
export function aplicarAjusteLectura(lectura) {
  if (!lectura) return
  let visto = 0
  try {
    visto = Number(localStorage.getItem(BORRADO)) || 0
  } catch {
    // Sin localStorage se toma como nunca borrado.
  }
  if (lectura.habilitada === false || (lectura.borradoEn || 0) > visto) borrarChatsGuardados()
}
