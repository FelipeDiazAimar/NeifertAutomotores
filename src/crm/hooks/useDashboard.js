import { useQuery } from '@tanstack/react-query'
import * as svc from '@/crm/services/dashboard.service'

const OPTS = { staleTime: 60_000 }

export function useKpis() {
  return useQuery({ queryKey: ['crm', 'dash', 'kpis'], queryFn: svc.kpis, ...OPTS })
}

export function useDemanda() {
  return useQuery({ queryKey: ['crm', 'dash', 'demanda'], queryFn: svc.demanda, ...OPTS })
}

export function useOportunidades() {
  return useQuery({ queryKey: ['crm', 'dash', 'oportunidades'], queryFn: svc.oportunidades, ...OPTS })
}
