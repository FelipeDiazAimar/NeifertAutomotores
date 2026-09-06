import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useLenis } from 'lenis/react'
import { X } from 'lucide-react'
import { useVehiculoMutations } from '@/crm/hooks/useVehiculos'
import VehiculoForm from '@/crm/components/VehiculoForm'

// Campos que el form maneja (sin id/auditoría/estado).
const CAMPOS = [
  'marca', 'modelo', 'version', 'patente', 'tipo', 'anio', 'km', 'transmision', 'color',
  'moneda', 'precio_contado', 'precio_canje', 'duenio_nombre', 'duenio_apellido',
  'duenio_contacto', 'itv', 'itv_venc', 'consignacion', 'tipo_consignacion', 'origen',
  'carpeta_completa', 'carpeta_con_oficio', 'carpeta_entregada', 'tiene_iva', 'nota',
]

/** Alta o edición de vehículo como overlay: difumina y bloquea el scroll de
 *  todo lo que hay detrás; el formulario largo hace scroll dentro del overlay,
 *  no en la página. Cierra con Escape o con click en el fondo.
 *  Pasando `vehiculo` entra en modo edición. */
export default function VehiculoFormModal({ open, onClose, vehiculo = null }) {
  const { crear, actualizar } = useVehiculoMutations()
  const lenis = useLenis()

  const esEdicion = Boolean(vehiculo?.id)
  const titulo = esEdicion ? `Editar ${vehiculo.marca} ${vehiculo.modelo}` : 'Cargar vehículo'
  const inicial = esEdicion
    ? Object.fromEntries(CAMPOS.map((k) => [k, vehiculo[k] ?? undefined]))
    : undefined
  const guardando = esEdicion ? actualizar.isPending : crear.isPending
  const guardar = (data) =>
    esEdicion
      ? actualizar.mutate({ id: vehiculo.id, data }, { onSuccess: onClose })
      : crear.mutate(data, { onSuccess: onClose })

  useEffect(() => {
    if (!open) return
    // La pagina usa smooth-scroll de Lenis (<ReactLenis root>): maneja el
    // scroll por JS e ignora `overflow: hidden`, ademas de capturar la rueda
    // sobre el modal. Hay que frenarlo mientras el modal esta abierto.
    lenis?.stop()

    // Belt & suspenders para el scroll nativo (teclado, arrastre de barra).
    // El scroll vive en <html>, no en <body>: bloqueamos ambos y compensamos
    // el ancho de la scrollbar para que el fondo no pegue un salto.
    const { documentElement: html, body } = document
    const anchoScrollbar = window.innerWidth - html.clientWidth
    const previo = {
      htmlOverflow: html.style.overflow,
      bodyOverflow: body.style.overflow,
      bodyPaddingRight: body.style.paddingRight,
    }
    html.style.overflow = 'hidden'
    body.style.overflow = 'hidden'
    if (anchoScrollbar > 0) body.style.paddingRight = `${anchoScrollbar}px`

    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      lenis?.start()
      html.style.overflow = previo.htmlOverflow
      body.style.overflow = previo.bodyOverflow
      body.style.paddingRight = previo.bodyPaddingRight
      document.removeEventListener('keydown', onKey)
    }
  }, [open, onClose, lenis])

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          data-lenis-prevent
          className="fixed inset-0 z-[60] overflow-y-auto overscroll-contain"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="fixed inset-0 bg-black/50 backdrop-blur-md" onClick={onClose} />
          <div className="relative flex min-h-full items-start justify-center p-4 sm:p-6">
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label={titulo}
              className="glass relative z-10 my-4 w-full max-w-3xl rounded-[20px] p-6 shadow-glass"
              initial={{ scale: 0.96, y: 16 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.97, y: 8 }}
              transition={{ type: 'spring', stiffness: 280, damping: 26 }}
            >
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-display text-lg font-bold text-ink">{titulo}</h2>
                <button
                  onClick={onClose}
                  aria-label="Cerrar"
                  className="grid h-8 w-8 place-items-center rounded-full text-ink-3 transition-colors hover:bg-surface hover:text-ink"
                >
                  <X size={18} />
                </button>
              </div>
              <VehiculoForm inicial={inicial} guardando={guardando} onGuardar={guardar} />
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
