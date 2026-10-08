/**
 * Los chats que la vista sin conexión del WhatsApp guarda en el navegador (IndexedDB
 * "nf-wa-lectura", ver Whatsapp/web/app.js). La copia del panel está en /wa-lectura/, del
 * mismo sitio que el CRM, así que el CRM los puede borrar: se borran al cerrar sesión.
 * Ocultar los chats (desde el CRM o al apagar el servidor) no borra nada.
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

