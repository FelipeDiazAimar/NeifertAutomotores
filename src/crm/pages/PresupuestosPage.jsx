import { useEffect, useMemo, useRef, useState } from 'react'
import { Car, PenLine, Printer, Search } from 'lucide-react'
import { toast } from 'sonner'
import GlassCard from '@/components/common/GlassCard'
import Spinner from '@/components/common/Spinner'
import Button from '@/components/common/Button'
import Badge from '@/components/common/Badge'
import PresupuestoPreview from '@/crm/components/PresupuestoPreview'
import PresupuestoEditor, { Campo, inputCls } from '@/crm/components/PresupuestoEditor'
import ExportarMenu from '@/crm/components/ExportarMenu'
import { useVehiculos } from '@/crm/hooks/useVehiculos'
import { useCrmRealtime } from '@/crm/hooks/useCrmRealtime'
import { usePlantillaPresupuesto } from '@/crm/hooks/usePlantillaPresupuesto'
import { estadoLabel, estadoVariant, lineaSpecs, precioFmt } from '@/crm/lib/formatVehiculo'
import {
  PRESUPUESTO_DEFAULTS,
  construirDatosPresupuesto,
  extraerPlantilla,
  fechaHoyAR,
  nombreArchivoPresupuesto,
} from '@/crm/lib/presupuestoTemplate'
import { copiarPresupuestoImagen, exportarPresupuestoPDF, exportarPresupuestoPNG, imprimirPresupuesto } from '@/crm/lib/presupuestoExport'
import { cn } from '@/lib/cn'

const FILTROS_VIGENTES = { estado: ['disponible', 'reservado'] }

/** Creador de presupuestos: reutiliza la plantilla compartida. Un vehículo
 *  del CRM o datos en texto libre, un presupuesto por vez. */
export default function PresupuestosPage() {
  const { plantilla, cargando: cargandoPlantilla, guardar, puedeEditar } = usePlantillaPresupuesto()
  const [modo, setModo] = useState('crm')
  const [vehiculoSel, setVehiculoSel] = useState(null)
  const [texto, setTexto] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [edits, setEdits] = useState({ fecha: fechaHoyAR(), patentamientoMonto: '$2.500.000' })
  const [editando, setEditando] = useState(false)
  const [exportando, setExportando] = useState(false)
  const nodoRef = useRef(null)

  useEffect(() => {
    const t = setTimeout(() => setBusqueda(texto), 300)
    return () => clearTimeout(t)
  }, [texto])

  useCrmRealtime('vehiculos', ['crm', 'vehiculos'])

  const { data, isLoading: cargandoVehiculos } = useVehiculos({
    busqueda,
    filtros: FILTROS_VIGENTES,
    orden: { campo: 'marca', dir: 'asc' },
    pagina: 1,
    pageSize: 8,
  })
  const filas = data?.filas ?? []

  const onDato = (k, v) => setEdits((e) => ({ ...e, [k]: v }))
  const onFin = (i, k, v) =>
    setEdits((e) => {
      const base = e.financiacion ?? plantilla?.financiacion ?? PRESUPUESTO_DEFAULTS.financiacion
      return { ...e, financiacion: base.map((f, j) => (j === i ? { ...f, [k]: v } : f)) }
    })

  function elegirVehiculo(v) {
    setVehiculoSel(v)
    // Los datos del vehículo mandan; se limpian overrides de texto libre.
    setEdits((e) => {
      const resto = { ...e }
      delete resto.titulo
      delete resto.subtitulo
      delete resto.precioEntrega
      delete resto.financiacion
      return resto
    })
  }

  const datos = useMemo(
    () => construirDatosPresupuesto(vehiculoSel ?? {}, edits, plantilla ?? undefined),
    [vehiculoSel, edits, plantilla],
  )

  const listo = modo === 'crm' ? Boolean(vehiculoSel) : Boolean((edits.titulo ?? '').trim())

  function restablecer() {
    guardar.mutate(extraerPlantilla(PRESUPUESTO_DEFAULTS))
    setEdits((e) => ({
      fecha: e.fecha ?? fechaHoyAR(),
      patentamientoMonto: e.patentamientoMonto ?? '$2.500.000',
      ...(modo === 'libre'
        ? { titulo: e.titulo ?? '', subtitulo: e.subtitulo ?? '', precioEntrega: e.precioEntrega ?? '' }
        : {}),
    }))
    setEditando(false)
  }

  async function imprimir() {
    const nodo = nodoRef.current
    if (!nodo || !listo) return
    setExportando(true)
    try {
      const base = vehiculoSel ?? { marca: edits.titulo || 'presupuesto', modelo: '', patente: '' }
      await imprimirPresupuesto(nodo, nombreArchivoPresupuesto(base, datos.fecha, 'png'))
    } catch (e) {
      toast.error(e?.message ?? 'No se pudo imprimir.')
    } finally {
      setExportando(false)
    }
  }

  async function exportar(formato) {
    const nodo = nodoRef.current
    if (!nodo || !listo) return
    setExportando(true)
    try {
      const base = vehiculoSel ?? { marca: edits.titulo || 'presupuesto', modelo: '', patente: '' }
      if (formato === 'pdf') {
        await exportarPresupuestoPDF(nodo, nombreArchivoPresupuesto(base, datos.fecha, 'pdf'))
        toast.success('PDF descargado.')
      } else if (formato === 'copiar') {
        await copiarPresupuestoImagen(nodo)
        toast.success('Imagen copiada. Pegala en WhatsApp.')
      } else {
        await exportarPresupuestoPNG(nodo, nombreArchivoPresupuesto(base, datos.fecha, 'png'))
        toast.success('Imagen descargada.')
      }
    } catch (e) {
      toast.error(
        e?.name === 'NotAllowedError'
          ? 'El navegador bloqueó el portapapeles. Probá descargar la imagen.'
          : (e?.message ?? 'No se pudo exportar.'),
      )
    } finally {
      setExportando(false)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">Presupuestos</h1>
        <p className="mt-1 text-sm text-ink-3">
          Elegí un vehículo del catálogo o escribí los datos a mano. Un presupuesto por vez.
        </p>
      </div>

      {cargandoPlantilla ? (
        <div className="grid place-items-center py-16">
          <Spinner size={28} />
        </div>
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-[380px_1fr]">
          <GlassCard className="space-y-4 p-4">
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: 'crm', label: 'Vehículo del CRM', Icon: Car },
                { id: 'libre', label: 'Texto libre', Icon: PenLine },
              ].map(({ id, label, Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setModo(id)}
                  aria-pressed={modo === id}
                  className={cn(
                    'glass inline-flex h-10 items-center justify-center gap-2 rounded-2xl px-3 text-sm font-semibold transition-colors',
                    modo === id ? 'text-neifert' : 'text-ink-2 hover:text-ink',
                  )}
                >
                  <Icon size={16} /> {label}
                </button>
              ))}
            </div>

            {modo === 'crm' ? (
              <div className="space-y-2">
                <div className="glass field-glass flex h-11 items-center gap-2 rounded-2xl px-3">
                  <Search size={16} className="shrink-0 text-ink-3" />
                  <input
                    value={texto}
                    onChange={(e) => setTexto(e.target.value)}
                    placeholder="Buscar vehículo…"
                    aria-label="Buscar vehículo"
                    className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-3"
                  />
                </div>
                {cargandoVehiculos ? (
                  <div className="grid place-items-center py-6">
                    <Spinner size={20} />
                  </div>
                ) : filas.length === 0 ? (
                  <p className="py-4 text-center text-sm text-ink-3">Sin resultados.</p>
                ) : (
                  <ul data-lenis-prevent className="crm-scrollbar max-h-80 space-y-1.5 overflow-y-auto">
                    {filas.map((v) => {
                      const precio = precioFmt(v)
                      const activo = vehiculoSel?.id === v.id
                      return (
                        <li key={v.id}>
                          <button
                            type="button"
                            onClick={() => elegirVehiculo(v)}
                            aria-pressed={activo}
                            data-seleccionado={activo || undefined}
                            className={cn(
                              'glass flex w-full items-center gap-3 rounded-2xl p-2.5 text-left transition-colors hover:border-ink/30',
                              activo && 'text-neifert',
                            )}
                            style={
                              activo
                                ? { borderColor: 'var(--color-neifert)', boxShadow: '0 0 0 2px var(--color-neifert)' }
                                : undefined
                            }
                          >
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold text-ink">
                                {v.marca} {v.modelo}
                              </p>
                              <p className="truncate text-xs text-ink-3">{v.version || lineaSpecs(v)}</p>
                              <p className="mt-0.5 text-xs font-bold text-ink">
                                {precio.monto} <span className="font-normal text-ink-3">{precio.moneda}</span>
                              </p>
                            </div>
                            <Badge variant={estadoVariant(v.estado)} className="shrink-0">
                              {estadoLabel(v.estado)}
                            </Badge>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <Campo label="Título (vehículo)">
                  <input
                    className={inputCls}
                    value={edits.titulo ?? ''}
                    onChange={(e) => onDato('titulo', e.target.value)}
                    placeholder="Ej: FORD RANGER XLS 4X2"
                  />
                </Campo>
                <Campo label="Subtítulo (km | color)">
                  <input
                    className={inputCls}
                    value={edits.subtitulo ?? ''}
                    onChange={(e) => onDato('subtitulo', e.target.value)}
                    placeholder="Ej: 0 KM | COLOR: BLANCO"
                  />
                </Campo>
                <Campo label="Precio entrega">
                  <input
                    className={inputCls}
                    value={edits.precioEntrega ?? ''}
                    onChange={(e) => onDato('precioEntrega', e.target.value)}
                    placeholder="Ej: USD 14.100"
                  />
                </Campo>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Campo label="Fecha">
                <input className={inputCls} value={edits.fecha ?? ''} onChange={(e) => onDato('fecha', e.target.value)} />
              </Campo>
              <Campo label="Patentamiento aprox.">
                <input
                  className={inputCls}
                  value={edits.patentamientoMonto ?? ''}
                  onChange={(e) => onDato('patentamientoMonto', e.target.value)}
                />
              </Campo>
            </div>
          </GlassCard>

          <div className="space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
              {puedeEditar && (
                <Button variant="glass" onClick={() => setEditando((e) => !e)}>
                  {editando ? 'Cerrar edición' : 'Editar plantilla'}
                </Button>
              )}
              <Button
                variant="glass"
                icon={Printer}
                onClick={imprimir}
                disabled={exportando || !listo}
              >
                Imprimir
              </Button>
              <ExportarMenu exportando={exportando} onElegir={exportar} deshabilitado={!listo} />
            </div>

            {!listo && (
              <p className="rounded-2xl border border-dashed border-line p-4 text-center text-sm text-ink-3">
                {modo === 'crm' ? 'Elegí un vehículo de la lista para ver la vista previa.' : 'Escribí el título para ver la vista previa.'}
              </p>
            )}

            {editando && puedeEditar && (
              <PresupuestoEditor
                datos={datos}
                onDato={onDato}
                onFin={onFin}
                onGuardar={() => guardar.mutate(extraerPlantilla(datos), { onSuccess: () => setEditando(false) })}
                guardando={guardar.isPending}
                onRestablecer={restablecer}
                puedeEditar
                mostrarVehiculo={false}
              />
            )}

            {listo && <PresupuestoPreview datos={datos} nodoRef={nodoRef} />}
          </div>
        </div>
      )}
    </div>
  )
}
