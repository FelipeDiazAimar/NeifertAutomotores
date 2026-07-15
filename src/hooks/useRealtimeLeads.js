import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase, isSupabaseConfigured } from '@/services/supabaseClient'

/** Suscribe a cambios en `leads` y refresca la cache de Query en vivo.
 *  En modo demo no hace nada (no hay backend real). */
export function useRealtimeLeads() {
  const qc = useQueryClient()

  useEffect(() => {
    if (!isSupabaseConfigured) return

    const channel = supabase
      .channel('public:prospectos')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'prospectos' },
        () => {
          qc.invalidateQueries({ queryKey: ['leads'] })
          qc.invalidateQueries({ queryKey: ['lead-counts'] })
          qc.invalidateQueries({ queryKey: ['stats'] })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [qc])
}
