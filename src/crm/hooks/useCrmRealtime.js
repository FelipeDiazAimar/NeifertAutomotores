import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase, isSupabaseConfigured } from '@/services/supabaseClient'

/** Invalida `queryKey` cuando cambia la tabla `crm.<tabla>` en Supabase. */
export function useCrmRealtime(tabla, queryKey) {
  const qc = useQueryClient()
  useEffect(() => {
    if (!isSupabaseConfigured) return
    const canal = supabase
      .channel(`crm:${tabla}`)
      .on('postgres_changes', { event: '*', schema: 'crm', table: tabla }, () => {
        qc.invalidateQueries({ queryKey })
      })
      .subscribe()
    return () => {
      supabase.removeChannel(canal)
    }
  }, [tabla, JSON.stringify(queryKey)]) // eslint-disable-line react-hooks/exhaustive-deps
}
