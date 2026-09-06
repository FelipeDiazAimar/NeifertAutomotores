import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/services/supabaseClient'
import { useCrmPerfil } from '@/crm/hooks/useCrmPerfil'
import { vistasEfectivas } from '@/crm/lib/vistas'

async function cargarMisVistas(id) {
  const db = supabase.schema('crm')
  const [{ data: fila, error: e1 }, { data: filasRol, error: e2 }] = await Promise.all([
    db.from('usuarios').select('rol, vistas_override').eq('id', id).single(),
    db.from('roles').select('rol, vistas_default'),
  ])
  if (e1) throw e1
  if (e2) throw e2
  const rolesMap = Object.fromEntries((filasRol ?? []).map((r) => [r.rol, r]))
  return vistasEfectivas(fila, rolesMap)
}

/** Vistas efectivas del usuario logueado. `{ vistas: string[], cargando }`. */
export function useMisVistas() {
  const { id, cargando: perfilCargando } = useCrmPerfil()
  const q = useQuery({
    queryKey: ['crm', 'mis-vistas', id],
    queryFn: () => cargarMisVistas(id),
    enabled: Boolean(id),
    staleTime: 60_000,
  })
  return {
    vistas: q.data ?? [],
    cargando: perfilCargando || (Boolean(id) && q.isLoading),
  }
}
