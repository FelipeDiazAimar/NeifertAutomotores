import { useEffect } from 'react'
import { useUiStore } from '@/store/useUiStore'

/** La ruta /crm/whatsapp: solo avisa que se entró (pasó VistaGuard). La pantalla en sí la
 *  dibuja WhatsappPersistente en el layout, que la deja montada al navegar a otra. */
export default function WhatsappMarcador() {
  const montar = useUiStore((s) => s.montarWhatsapp)
  useEffect(() => {
    montar()
  }, [montar])
  return null
}
