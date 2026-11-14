import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { queryClient, persistOptions } from '@/lib/queryClient'
import { Toaster } from 'sonner'
import { ReactLenis } from 'lenis/react'
import { AuthProvider } from '@/context/AuthProvider'
import { hydrateSiteContent } from '@/store/useSiteStore'
import { recordShareVisit } from '@/lib/vehicleClicks'
import App from '@/App'
import '@/styles/index.css'

// Consola de debug en el teléfono (Eruda). Se activa con ?debug=1 en la URL y
// queda recordada; ?debug=0 la apaga. El bundle solo se descarga si está
// activa (import dinámico), así los usuarios normales nunca la cargan.
{
  const debugParam = new URLSearchParams(window.location.search).get('debug')
  if (debugParam === '1') localStorage.setItem('nf-debug', '1')
  if (debugParam === '0') localStorage.removeItem('nf-debug')
  if (localStorage.getItem('nf-debug') === '1') {
    import('eruda')
      .then(({ default: eruda }) => {
        eruda.init()
        console.log('[debug] Consola Eruda activada (?debug=1). Apagá con ?debug=0.')
      })
      .catch((e) => console.error('[debug] No se pudo cargar Eruda', e))
  }
}

// Trae el contenido del sitio desde Supabase (no-op en modo demo).
hydrateSiteContent()

// Registra el ingreso si la persona llegó por un link compartido (?ref=share).
if (new URLSearchParams(window.location.search).get('ref') === 'share') {
  recordShareVisit(window.location.pathname)
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
      <AuthProvider>
        <ReactLenis root options={{ lerp: 0.1, smoothWheel: true }}>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </ReactLenis>
        <Toaster position="top-center" richColors theme="system" />
      </AuthProvider>
    </PersistQueryClientProvider>
  </React.StrictMode>
)
