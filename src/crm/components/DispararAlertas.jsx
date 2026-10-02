import { useState } from 'react'
import { Radio } from 'lucide-react'
import { toast } from 'sonner'
import Button from '@/components/common/Button'
import { dispararAlertas } from '@/crm/services/alertas.service'

/** Solo admin: corre la revisión de alertas a mano (como si la llamara el
 *  cron) y muestra cuántos avisos salieron. */
export default function DispararAlertas() {
  const [corriendo, setCorriendo] = useState(false)

  async function handleClick() {
    setCorriendo(true)
    try {
      const r = await dispararAlertas()
      if (r.errores?.length) toast.error(r.errores.join(' | '))
      toast.success(r.enviadas > 0 ? `Avisos enviados: ${r.enviadas}.` : 'Sin avisos pendientes a esta hora.')
    } catch (e) {
      toast.error(e.message)
    } finally {
      setCorriendo(false)
    }
  }

  return (
    <Button
      type="button"
      icon={Radio}
      onClick={handleClick}
      disabled={corriendo}
      title="Revisar alertas ahora y enviar los avisos pendientes"
    >
      {corriendo ? 'Enviando…' : 'Probar avisos'}
    </Button>
  )
}
