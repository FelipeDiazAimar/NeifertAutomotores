import { useQuery } from '@tanstack/react-query'
import { listarUsuarios } from '@/crm/services/crmUsuarios.service'

export function useCrmUsuarios() {
  return useQuery({
    queryKey: ['crm', 'usuarios'],
    queryFn: listarUsuarios,
    staleTime: 5 * 60_000,
  })
}
