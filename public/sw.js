const ICONO = '/favicon.png'

// Activa la versión nueva del worker apenas se instala: sin esto, un navegador
// con la pestaña abierta sigue con el worker viejo y no ve los cambios.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

self.addEventListener('push', (event) => {
  let data
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { body: event.data.text() }
  }
  const title = data.title || 'Neifert CRM'
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: ICONO,
      badge: ICONO,
      // Windows/Chrome descartan en silencio las notificaciones sin interacción
      // si hay "no molestar"; esta queda en pantalla hasta que se la toque.
      requireInteraction: true,
      tag: data.tag || 'neifert-alerta',
      renotify: true,
      data: { url: data.url || '/crm/alertas' },
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const destino = new URL(
    event.notification.data?.url || '/crm/alertas',
    self.location.origin
  ).href
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((tabs) => {
      const abierta = tabs.find((t) => t.url.startsWith(self.location.origin))
      if (abierta) {
        abierta.navigate(destino)
        return abierta.focus()
      }
      return self.clients.openWindow(destino)
    })
  )
})
