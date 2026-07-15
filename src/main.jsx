import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { ReactLenis } from 'lenis/react'
import { AuthProvider } from '@/context/AuthProvider'
import { hydrateSiteContent } from '@/store/useSiteStore'
import { recordShareVisit } from '@/lib/vehicleClicks'
import App from '@/App'
import '@/styles/index.css'

// Trae el contenido del sitio desde Supabase (no-op en modo demo).
hydrateSiteContent()

// Registra el ingreso si la persona llegó por un link compartido (?ref=share).
if (new URLSearchParams(window.location.search).get('ref') === 'share') {
  recordShareVisit(window.location.pathname)
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ReactLenis root options={{ lerp: 0.1, smoothWheel: true }}>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </ReactLenis>
        <Toaster position="top-center" richColors theme="system" />
      </AuthProvider>
    </QueryClientProvider>
  </React.StrictMode>
)
