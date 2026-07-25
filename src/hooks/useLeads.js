import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useCrmStore } from '@/store/useCrmStore'
import {
  fetchLeads,
  fetchLeadById,
  fetchLeadCounts,
  createLead,
} from '@/services/leads.service'

export function useLeads() {
  const quickFilter = useCrmStore((s) => s.quickFilter)
  const search = useCrmStore((s) => s.search)
  const sort = useCrmStore((s) => s.sort)
  const origin = useCrmStore((s) => s.originFilter)
  return useQuery({
    queryKey: ['leads', { quickFilter, search, sort, origin }],
    queryFn: () => fetchLeads({ quickFilter, search, sort, origin }),
  })
}

export function useLead(id) {
  return useQuery({
    queryKey: ['lead', id],
    queryFn: () => fetchLeadById(id),
    enabled: Boolean(id),
  })
}

export function useLeadCounts() {
  return useQuery({ queryKey: ['lead-counts'], queryFn: fetchLeadCounts })
}

export function useCreateLead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: createLead,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leads'] })
      qc.invalidateQueries({ queryKey: ['lead-counts'] })
      qc.invalidateQueries({ queryKey: ['stats'] })
      toast.success('Lead registrado con éxito')
    },
    onError: () => toast.error('No se pudo registrar el lead'),
  })
}
