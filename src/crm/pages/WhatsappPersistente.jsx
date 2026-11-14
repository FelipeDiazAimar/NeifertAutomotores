import { lazy, Suspense } from 'react'
import { useLocation } from 'react-router-dom'
import { useUiStore } from '@/store/useUiStore'
import Spinner from '@/components/common/Spinner'

const WhatsappPage = lazy(() => import('@/crm/pages/WhatsappPage'))

/** WhatsApp siempre montado desde la primera visita (oculto fuera de /crm/whatsapp). Así el
 *  panel no se recarga al volver y sigue recibiendo chats y mensajes en tiempo real. */
export default function WhatsappPersistente() {
  const montado = useUiStore((s) => s.whatsappMontado)
  const { pathname } = useLocation()
  if (!montado) return null
  return (
    <div hidden={pathname !== '/crm/whatsapp'}>
      <Suspense
        fallback={
          <div className="grid min-h-[50vh] place-items-center">
            <Spinner size={28} />
          </div>
        }
      >
        <WhatsappPage />
      </Suspense>
    </div>
  )
}
