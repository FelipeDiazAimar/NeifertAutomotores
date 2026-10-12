import { useEffect, useState } from 'react'
import { Plus, Search, SlidersHorizontal, Download, ListChecks, ChevronDown } from 'lucide-react'
import { toast } from 'sonner'
import Button from '@/components/common/Button'
import Modal from '@/components/common/Modal'
import Spinner from '@/components/common/Spinner'
import Pagination from '@/components/common/Pagination'
import GlassCard from '@/components/common/GlassCard'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import { useIsDesktop } from '@/hooks/useMediaQuery'
import { useVehiculos, useConteoVehiculos, useVehiculoMutations } from '@/crm/hooks/useVehiculos'
import { useVehiculosBulk } from '@/crm/hooks/useVehiculosBulk'
import { useCrmPerfil } from '@/crm/hooks/useCrmPerfil'
import { useSeleccionVehiculos } from '@/crm/store/useSeleccionVehiculos'
import { listarTodoStock } from '@/crm/services/vehiculos.service'
import { generarStockDocx, nombreArchivoStock, LOGO_ANCHO_PX } from '@/crm/lib/stockDocx'
import logoLight from '@/assets/images/logo-light.png'
import { useCrmRealtime } from '@/crm/hooks/useCrmRealtime'
import { useVehiculosFiltros } from '@/crm/store/useVehiculosFiltros'
import { useViewModeStore } from '@/crm/store/useViewModeStore'
import VehiculoFilters from '@/crm/components/VehiculoFilters'
import VehiculoTable from '@/crm/components/VehiculoTable'
import VehiculoCard from '@/crm/components/VehiculoCard'
import VehiculoGridCard from '@/crm/components/VehiculoGridCard'
import VehiculoFormModal from '@/crm/components/VehiculoFormModal'
import ViewModeToggle from '@/crm/components/ViewModeToggle'
import { cn } from '@/lib/cn'

const PAGE_SIZE = 20

const ESTADOS_MASIVOS = ['disponible', 'reservado', 'vendido', 'baja']
const ESTADO_LABEL = { disponible: 'Disponible', reservado: 'Reservado', vendido: 'Vendido', baja: 'Baja' }

const ACCION_TITULO = { estado: 'Cambiar estado en masa', es_nuevo: 'Marcar como nuevos', es_0km: 'Marcar como 0 km' }
const ACCION_CONFIRMAR = { estado: 'Cambiar', es_nuevo: 'Marcar', es_0km: 'Marcar' }

export default function VehiculosListPage() {
  const esDesktop = useIsDesktop()
  const { busqueda, filtros, orden, pagina, setBusqueda, setPagina } = useVehiculosFiltros()
  const filtrosActivos = useVehiculosFiltros((s) => s.contarFiltrosActivos())
  const [texto, setTexto] = useState(busqueda)
  const [mostrarFiltros, setMostrarFiltros] = useState(false)
  const [abrirNuevo, setAbrirNuevo] = useState(false)
  const [descargando, setDescargando] = useState(false)
  const { cambiarEstado, actualizar } = useVehiculoMutations()
  const viewMode = useViewModeStore((s) => s.viewMode)
  const { esAdmin } = useCrmPerfil()
  const modoSeleccion = useSeleccionVehiculos((s) => s.modoSeleccion)
  const ids = useSeleccionVehiculos((s) => s.ids)
  const setModoSeleccion = useSeleccionVehiculos((s) => s.setModoSeleccion)
  const toggleId = useSeleccionVehiculos((s) => s.toggleId)
  const seleccionarTodos = useSeleccionVehiculos((s) => s.seleccionarTodos)
  const limpiar = useSeleccionVehiculos((s) => s.limpiar)
  const salir = useSeleccionVehiculos((s) => s.salir)
  const { cambiarEstadoMasivo, actualizarMasivo, eliminarMasivo } = useVehiculosBulk()
  const [confirmarEliminar, setConfirmarEliminar] = useState(false)
  const [confirmarAccion, setConfirmarAccion] = useState(null)
  const bulkPendiente =
    cambiarEstadoMasivo.isPending || actualizarMasivo.isPending || eliminarMasivo.isPending

  /** Ejecuta la acción masiva ya confirmada en el modal. */
  function ejecutarAccionMasiva() {
    if (!confirmarAccion) return
    const listo = () => {
      limpiar()
      setConfirmarAccion(null)
    }
    if (confirmarAccion.tipo === 'estado') {
      cambiarEstadoMasivo.mutate(
        {
          items: ids.map((id) => ({
            id,
            de: filas.find((f) => f.id === id)?.estado ?? 'disponible',
          })),
          a: confirmarAccion.valor,
        },
        { onSuccess: listo },
      )
    } else if (confirmarAccion.tipo === 'es_nuevo') {
      actualizarMasivo.mutate({ ids, data: { es_nuevo: true } }, { onSuccess: listo })
    } else if (confirmarAccion.tipo === 'es_0km') {
      actualizarMasivo.mutate({ ids, data: { es_0km: true } }, { onSuccess: listo })
    }
  }

  function descripcionAccion() {
    const n = ids.length
    const cant = `${n} vehículo${n === 1 ? '' : 's'}`
    if (confirmarAccion?.tipo === 'estado')
      return `Se cambiará el estado de ${cant} a "${ESTADO_LABEL[confirmarAccion.valor]}".`
    if (confirmarAccion?.tipo === 'es_nuevo')
      return `Se marcarán ${cant} como nuevos (badge Nuevo en la ficha).`
    if (confirmarAccion?.tipo === 'es_0km')
      return `Se marcarán ${cant} como 0 km.`
    return ''
  }

  // debounce búsqueda → store
  useEffect(() => {
    const t = setTimeout(() => setBusqueda(texto), 300)
    return () => clearTimeout(t)
  }, [texto, setBusqueda])

  useCrmRealtime('vehiculos', ['crm', 'vehiculos'])

  const opts = {
    busqueda, filtros, orden, pagina, pageSize: PAGE_SIZE,
  }
  const { data, isLoading } = useVehiculos(opts)
  const filas = data?.filas ?? []
  const total = data?.total ?? 0
  const totalPaginas = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const { data: conteo } = useConteoVehiculos({ busqueda, filtros })
  const c = conteo ?? { disponible: 0, reservado: 0, vendido: 0, baja: 0, sinPeritar: 0, sinGestoria: 0 }

  /** Descarga la planilla DOCX del stock con los filtros/búsqueda actuales,
   *  con las mismas columnas de la planilla en papel + logo y fecha. */
  async function descargarStock() {
    if (descargando) return
    setDescargando(true)
    try {
      const stock = await listarTodoStock({ busqueda, filtros })
      if (stock.length === 0) {
        toast.info('No hay vehículos para exportar con esos filtros.')
        return
      }
      let logoPng = null
      try {
        const buf = await (await fetch(logoLight)).arrayBuffer()
        let height = 40
        if (typeof createImageBitmap === 'function') {
          const bmp = await createImageBitmap(new Blob([buf], { type: 'image/png' }))
          height = Math.round((LOGO_ANCHO_PX * bmp.height) / bmp.width)
          bmp.close?.()
        }
        logoPng = { data: buf, width: LOGO_ANCHO_PX, height }
      } catch {
        logoPng = null // sin logo igual se genera la planilla
      }
      const blob = await generarStockDocx({ vehiculos: stock, logoPng })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = nombreArchivoStock()
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 5000)
      toast.success(`Planilla descargada: ${stock.length} vehículos.`)
    } catch (e) {
      toast.error('No se pudo generar la planilla: ' + (e?.message ?? e))
    } finally {
      setDescargando(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">Vehículos</h1>
          <p className="flex flex-wrap gap-x-3 gap-y-0.5 text-sm text-ink-3">
            <span>
              <span className="font-bold text-success">{c.disponible}</span> disponibles
            </span>
            <span>
              <span className="font-bold text-amber">{c.reservado}</span> reservados
            </span>
            <span>
              <span className="font-bold text-ink">{c.vendido}</span> vendidos
            </span>
            <span>
              <span className="font-bold text-neifert">{c.baja}</span> en baja
            </span>
            <span>
              <span className="font-bold text-ink">{c.sinPeritar ?? 0}</span> sin peritar
            </span>
            <span>
              <span className="font-bold text-ink">{c.sinGestoria ?? 0}</span> sin gestoría
            </span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="glass"
            icon={ListChecks}
            onClick={() => (modoSeleccion ? salir() : setModoSeleccion(true))}
            className={modoSeleccion ? 'text-neifert' : undefined}
          >
            {modoSeleccion ? 'Listo' : 'Seleccionar'}
          </Button>
          <Button variant="glass" icon={Download} onClick={descargarStock} disabled={descargando}>
            {descargando ? 'Generando…' : 'Descargar stock'}
          </Button>
          <Button icon={Plus} onClick={() => setAbrirNuevo(true)}>
            Cargar vehículo
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="glass field-glass flex h-12 flex-1 items-center gap-2.5 rounded-2xl px-3.5">
          <Search size={17} className="shrink-0 text-ink-3" />
          <input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Buscar por marca, modelo, patente o dueño…"
            className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-3"
          />
        </div>
        <ViewModeToggle className="h-12" />
        <button
          type="button"
          onClick={() => setMostrarFiltros((v) => !v)}
          aria-expanded={mostrarFiltros}
          className={cn(
            'glass flex h-12 shrink-0 items-center gap-2 rounded-2xl px-4 text-sm font-semibold transition-colors',
            mostrarFiltros || filtrosActivos > 0 ? 'text-neifert' : 'text-ink-2 hover:text-ink',
          )}
        >
          <SlidersHorizontal size={16} />
          <span className="hidden sm:inline">Filtros</span>
          {filtrosActivos > 0 && (
            <span className="grid h-5 min-w-5 place-items-center rounded-full bg-neifert px-1 text-[11px] font-bold text-white">
              {filtrosActivos}
            </span>
          )}
        </button>
      </div>

      {mostrarFiltros && <VehiculoFilters />}

      {isLoading ? (
        <div className="grid place-items-center py-16">
          <Spinner size={28} />
        </div>
      ) : filas.length === 0 ? (
        <GlassCard className="p-10 text-center">
          <p className="font-display font-bold text-ink">No hay vehículos que coincidan</p>
          <p className="mt-1 text-sm text-ink-3">Probá quitar filtros o cargá un vehículo nuevo.</p>
          <Button icon={Plus} className="mt-4" onClick={() => setAbrirNuevo(true)}>
            Cargar vehículo
          </Button>
        </GlassCard>
      ) : viewMode === 'card' ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filas.map((v) => (
            <VehiculoGridCard
              key={v.id}
              vehiculo={v}
              onCambiarEstado={(veh, e) => cambiarEstado.mutate({ id: veh.id, de: veh.estado, a: e })}
              onCambiarPublicado={(veh, publicado) => actualizar.mutate({ id: veh.id, data: { publicado } })}
              seleccionado={ids.includes(v.id)}
              enSeleccion={modoSeleccion}
              onToggleSeleccion={(veh) => toggleId(veh.id)}
            />
          ))}
        </div>
      ) : esDesktop ? (
        <VehiculoTable
          filas={filas}
          onCambiarEstado={(v, e) => cambiarEstado.mutate({ id: v.id, de: v.estado, a: e })}
          onCambiarPublicado={(v, publicado) => actualizar.mutate({ id: v.id, data: { publicado } })}
          seleccionados={ids}
          enSeleccion={modoSeleccion}
          onToggleSeleccion={(veh) => toggleId(veh.id)}
        />
      ) : (
        <div className="space-y-2">
          {filas.map((v) => (
            <VehiculoCard
              key={v.id}
              vehiculo={v}
              seleccionado={ids.includes(v.id)}
              enSeleccion={modoSeleccion}
              onToggleSeleccion={(veh) => toggleId(veh.id)}
            />
          ))}
        </div>
      )}

      <Pagination page={pagina} totalPages={totalPaginas} onChange={setPagina} />

      {modoSeleccion && ids.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:bottom-4 sm:px-4">
          <GlassCard data-testid="barra-masiva" className="w-full max-w-2xl px-3 py-2.5 sm:w-auto sm:px-4 sm:py-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="flex items-center justify-between gap-2 sm:justify-start">
                <span className="px-1 text-sm font-bold text-ink">
                  {ids.length} seleccionado{ids.length === 1 ? '' : 's'}
                </span>
                <div className="flex items-center gap-2 sm:hidden">
                  <Button
                    size="sm"
                    variant="glass"
                    onClick={() => seleccionarTodos(filas.map((f) => f.id))}
                    disabled={bulkPendiente}
                  >
                    Todos
                  </Button>
                  <Button size="sm" variant="ghost" disabled={bulkPendiente} onClick={() => limpiar()}>
                    Limpiar
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
                <Button
                  size="sm"
                  variant="glass"
                  className="hidden sm:inline-flex"
                  onClick={() => seleccionarTodos(filas.map((f) => f.id))}
                  disabled={bulkPendiente}
                >
                  Todos
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    aria-label="Cambiar estado en masa"
                    disabled={bulkPendiente}
                    className="glass inline-flex h-9 w-full items-center justify-center gap-1 rounded-2xl px-4 text-xs font-semibold text-ink transition-colors hover:border-ink/30 disabled:pointer-events-none disabled:opacity-50 sm:w-auto"
                  >
                    <span className="inline-flex items-center gap-1">
                      Estado <ChevronDown size={15} />
                    </span>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="crm-root">
                    {ESTADOS_MASIVOS.map((e) => (
                      <DropdownMenuItem
                        key={e}
                        onClick={() => setConfirmarAccion({ tipo: 'estado', valor: e })}
                      >
                        {ESTADO_LABEL[e]}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button
                  size="sm"
                  variant="glass"
                  className="w-full sm:w-auto"
                  disabled={bulkPendiente}
                  onClick={() => setConfirmarAccion({ tipo: 'es_nuevo' })}
                >
                  Es nuevo
                </Button>
                <Button
                  size="sm"
                  variant="glass"
                  className="w-full sm:w-auto"
                  disabled={bulkPendiente}
                  onClick={() => setConfirmarAccion({ tipo: 'es_0km' })}
                >
                  Es 0 km
                </Button>
                {esAdmin && (
                  <Button
                    size="sm"
                    variant="glass"
                    className="w-full text-neifert sm:w-auto"
                    disabled={bulkPendiente}
                    onClick={() => setConfirmarEliminar(true)}
                  >
                    Eliminar
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="hidden sm:inline-flex"
                  disabled={bulkPendiente}
                  onClick={() => limpiar()}
                >
                  Limpiar
                </Button>
              </div>
            </div>
          </GlassCard>
        </div>
      )}
      {modoSeleccion && ids.length > 0 && <div aria-hidden className="h-32 sm:h-20" />}

      <Modal
        open={Boolean(confirmarAccion)}
        onClose={() => setConfirmarAccion(null)}
        title={confirmarAccion ? ACCION_TITULO[confirmarAccion.tipo] : ''}
      >
        <p className="text-sm text-ink-2">{descripcionAccion()}</p>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirmarAccion(null)}>
            Cancelar
          </Button>
          <Button
            disabled={bulkPendiente}
            onClick={ejecutarAccionMasiva}
          >
            {bulkPendiente
              ? 'Aplicando…'
              : confirmarAccion
                ? ACCION_CONFIRMAR[confirmarAccion.tipo]
                : 'Confirmar'}
          </Button>
        </div>
      </Modal>

      <Modal
        open={confirmarEliminar}
        onClose={() => setConfirmarEliminar(false)}
        title="Eliminar vehículos"
      >
        <p className="text-sm text-ink-2">
          Se eliminarán {ids.length} vehículo{ids.length === 1 ? '' : 's'}. Esta acción no se
          puede deshacer.
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirmarEliminar(false)}>
            Cancelar
          </Button>
          <Button
            disabled={eliminarMasivo.isPending}
            onClick={() =>
              eliminarMasivo.mutate(ids, {
                onSuccess: () => {
                  limpiar()
                  setConfirmarEliminar(false)
                },
              })
            }
          >
            {eliminarMasivo.isPending ? 'Eliminando…' : 'Eliminar'}
          </Button>
        </div>
      </Modal>

      <VehiculoFormModal open={abrirNuevo} onClose={() => setAbrirNuevo(false)} />
    </div>
  )
}
