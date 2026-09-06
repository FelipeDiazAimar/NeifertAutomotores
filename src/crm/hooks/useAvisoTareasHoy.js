import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { isSupabaseConfigured } from '@/services/supabaseClient'
import { useCrmPerfil } from '@/crm/hooks/useCrmPerfil'
import { useTareasPendientesHoy } from '@/crm/hooks/useTareas'

const KEY = 'nf-aviso-tareas'

/** Al entrar al CRM, un toast (1×/sesión) si hay tareas que vencen hoy. */
export function useAvisoTareasHoy() {
  const navigate = useNavigate()
  const { id } = useCrmPerfil()
  const { data: pendientes } = useTareasPendientesHoy()
  const mostrado = useRef(false)

  useEffect(() => {
    if (!isSupabaseConfigured || !id || mostrado.current) return
    if (!pendientes || pendientes < 1) return
    let previo
    try {
      previo = sessionStorage.getItem(KEY)
    } catch {
      previo = null
    }
    const hoy = new Date().toISOString().slice(0, 10)
    if (previo === hoy) return

    mostrado.current = true
    try {
      sessionStorage.setItem(KEY, hoy)
    } catch {
      /* modo incógnito */
    }
    toast(`Tenés ${pendientes} tarea${pendientes === 1 ? '' : 's'} que vence${pendientes === 1 ? '' : 'n'} hoy`, {
      action: { label: 'Ver', onClick: () => navigate('/crm/tareas') },
    })
  }, [id, pendientes, navigate])
}
