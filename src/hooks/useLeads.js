import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useNavigate } from 'react-router-dom'
import { useCrmStore } from '@/store/useCrmStore'
import {
  fetchLeads,
  fetchLeadById,
  fetchLeadCounts,
  createLead,
  updateLead,
  deleteLead,
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

export function useUpdateLead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...payload }) => updateLead(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leads'] })
      qc.invalidateQueries({ queryKey: ['lead-counts'] })
      qc.invalidateQueries({ queryKey: ['stats'] })
      toast.success('Lead actualizado')
    },
    onError: () => toast.error('No se pudo actualizar el lead'),
  })
}

export function useDeleteLead() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  return useMutation({
    mutationFn: deleteLead,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leads'] })
      qc.invalidateQueries({ queryKey: ['lead-counts'] })
      qc.invalidateQueries({ queryKey: ['stats'] })
      toast.success('Lead eliminado')
      navigate('/admin/crm')
    },
    onError: () => toast.error('No se pudo eliminar el lead'),
  })
}
