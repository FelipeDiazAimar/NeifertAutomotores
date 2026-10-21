import { useRef, useState } from 'react'
import { Pencil } from 'lucide-react'
import { toast } from 'sonner'
import Modal from '@/components/common/Modal'
import Button from '@/components/common/Button'
import Spinner from '@/components/common/Spinner'
import PresupuestoPreview from './PresupuestoPreview'
import PresupuestoEditor from './PresupuestoEditor'
import ExportarMenu from './ExportarMenu'
import { usePlantillaPresupuesto } from '@/crm/hooks/usePlantillaPresupuesto'
import {
  PRESUPUESTO_DEFAULTS,
  FINANCIACION_DEFAULT,
  construirDatosPresupuesto,
  extraerPlantilla,
  nombreArchivoPresupuesto,
  subtituloVehiculo,
  tituloVehiculo,
  formatearPrecio,
  fechaHoyAR,
} from '@/crm/lib/presupuestoTemplate'
import { copiarPresupuestoImagen, exportarPresupuestoPDF, exportarPresupuestoPNG } from '@/crm/lib/presupuestoExport'

/** Contenido con plantilla ya resuelta: el estado inicial se calcula una vez. */
function ContenidoPresupuesto({ vehiculo, plantilla, guardar, puedeEditar, onClose }) {
  const [datos, setDatos] = useState(() => construirDatosPresupuesto(vehiculo ?? {}, {}, plantilla ?? undefined))
  const [editando, setEditando] = useState(false)
  const [exportando, setExportando] = useState(false)
  const nodoRef = useRef(null)

  const onDato = (k, v) => setDatos((d) => ({ ...d, [k]: v }))
  const onFin = (i, k, v) =>
    setDatos((d) => ({
      ...d,
      financiacion: d.financiacion.map((f, j) => (j === i ? { ...f, [k]: v } : f)),
    }))

  function restablecer() {
    setDatos({
      fecha: fechaHoyAR(),
      titulo: tituloVehiculo(vehiculo ?? {}),
      subtitulo: subtituloVehiculo(vehiculo ?? {}),
      precioEntrega: formatearPrecio(vehiculo?.precio_contado, vehiculo?.moneda),
      patentamientoMonto: '$2.500.000',
      incluye: PRESUPUESTO_DEFAULTS.incluye,
      regalo: PRESUPUESTO_DEFAULTS.regalo,
      condiciones: PRESUPUESTO_DEFAULTS.condiciones,
      patentamientoTexto: PRESUPUESTO_DEFAULTS.patentamientoTexto,
      fechaLimite: PRESUPUESTO_DEFAULTS.fechaLimite,
      financiacion: FINANCIACION_DEFAULT.map((f) => ({ ...f })),
    })
    guardar.mutate(extraerPlantilla(PRESUPUESTO_DEFAULTS))
    setEditando(false)
  }

  function guardarPlantilla() {
    guardar.mutate(extraerPlantilla(datos), {
      onSuccess: () => setEditando(false),
    })
  }

  async function exportar(formato) {
    const nodo = nodoRef.current
    if (!nodo) return
    setExportando(true)
    try {
      if (formato === 'pdf') {
        await exportarPresupuestoPDF(nodo, nombreArchivoPresupuesto(vehiculo ?? {}, datos.fecha, 'pdf'))
        toast.success('PDF descargado.')
      } else if (formato === 'copiar') {
        await copiarPresupuestoImagen(nodo)
        toast.success('Imagen copiada. Pegala en WhatsApp.')
      } else {
        await exportarPresupuestoPNG(nodo, nombreArchivoPresupuesto(vehiculo ?? {}, datos.fecha, 'png'))
        toast.success('Imagen descargada.')
      }
    } catch (e) {
      const msg =
        e?.name === 'NotAllowedError'
          ? 'El navegador bloqueó el portapapeles. Probá descargar la imagen.'
          : (e?.message ?? 'No se pudo exportar.')
      toast.error(msg)
    } finally {
      setExportando(false)
    }
  }

  return (
    <div data-testid="presupuesto-modal" className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
        {puedeEditar && (
          <Button data-testid="presupuesto-editar" variant="glass" icon={Pencil} onClick={() => setEditando((e) => !e)}>
            {editando ? 'Cerrar edición' : 'Editar plantilla'}
          </Button>
        )}
        <ExportarMenu exportando={exportando} onElegir={exportar} />
      </div>

      {editando && puedeEditar && (
        <PresupuestoEditor
          datos={datos}
          onDato={onDato}
          onFin={onFin}
          onGuardar={guardarPlantilla}
          guardando={guardar.isPending}
          onRestablecer={restablecer}
          puedeEditar
          mostrarVehiculo
        />
      )}

      <PresupuestoPreview datos={datos} nodoRef={nodoRef} />
      <p className="text-xs text-ink-3">
        La vista previa es la imagen final en alta resolución. La plantilla es compartida para todo el equipo.
      </p>
      <div className="flex justify-end">
        <Button variant="ghost" onClick={onClose}>
          Cerrar
        </Button>
      </div>
    </div>
  )
}

/** Baja la plantilla compartida antes de montar el contenido (spinner corto). */
function ContenidoConPlantilla({ vehiculo, onClose }) {
  const { plantilla, cargando, guardar, puedeEditar } = usePlantillaPresupuesto()
  if (cargando) {
    return (
      <div data-testid="presupuesto-modal" className="grid place-items-center py-16">
        <Spinner size={28} />
      </div>
    )
  }
  return (
    <ContenidoPresupuesto
      vehiculo={vehiculo}
      plantilla={plantilla}
      guardar={guardar}
      puedeEditar={puedeEditar}
      onClose={onClose}
    />
  )
}

export default function PresupuestoModal({ open, onClose, vehiculo }) {
  return (
    <Modal open={open} onClose={onClose} title="Presupuesto del vehículo" size="xl">
      {open && <ContenidoConPlantilla vehiculo={vehiculo} onClose={onClose} />}
    </Modal>
  )
}
