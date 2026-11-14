import { QueryClient } from '@tanstack/react-query'
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister'

export const CACHE_KEY = 'nf-crm-query-cache'
const UNA_SEMANA = 7 * 24 * 60 * 60 * 1000

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      // Lo restaurado del navegador se conserva para mostrarlo al instante al volver a entrar.
      gcTime: UNA_SEMANA,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
})

// Guarda en localStorage lo que ya se trajo del CRM: al volver a entrar (o recargar) se ve
// al instante y se actualiza por detrás (staleTime + realtime de Supabase). Si el
// navegador no deja guardar (privado, lleno) simplemente no persiste.
export const persister = createSyncStoragePersister({
  storage: typeof window === 'undefined' ? undefined : window.localStorage,
  key: CACHE_KEY,
  throttleTime: 1500,
})

// Solo datos del CRM ya cargados. Los permisos (mis-vistas) y los usuarios no se guardan.
const NO_PERSISTIR = new Set(['mis-vistas', 'usuarios', 'roles'])
export const persistOptions = {
  persister,
  maxAge: UNA_SEMANA,
  buster: 'v1', // subir al cambiar la forma de los datos
  dehydrateOptions: {
    shouldDehydrateQuery: (q) =>
      q.state.status === 'success' && q.queryKey[0] === 'crm' && !NO_PERSISTIR.has(q.queryKey[1]),
  },
}

/** Al cerrar sesión: nada de datos del CRM queda en el navegador. */
export function limpiarCacheCrm() {
  queryClient.clear()
  try {
    window.localStorage.removeItem(CACHE_KEY)
  } catch {
    /* sin storage */
  }
}
