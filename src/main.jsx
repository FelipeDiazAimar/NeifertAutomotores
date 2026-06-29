import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { ReactLenis } from 'lenis/react'
import { AuthProvider } from '@/context/AuthProvider'
import App from '@/App'
import '@/styles/index.css'

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
