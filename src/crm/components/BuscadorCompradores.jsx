import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Search, X } from 'lucide-react'
import Button from '@/components/common/Button'
import Input from '@/components/common/Input'
import Select from '@/components/common/Select'
import Spinner from '@/components/common/Spinner'
import GlassCard from '@/components/common/GlassCard'
import Badge from '@/components/common/Badge'
import { WhatsAppIcon } from '@/components/common/SocialIcons'
import Combobox from '@/crm/components/Combobox'
import { useDemandas } from '@/crm/hooks/useCompradores'
import { useOpcionesCampo } from '@/crm/hooks/useOpcionesCampo'
import { useVehiculos } from '@/crm/hooks/useVehiculos'
import { buscarCompradores, hayFiltros, esInactivo } from '@/crm/lib/compradores'
import { waContactoLink, statusVariant } from '@/crm/lib/formatCliente'
import { TIPOS_BASE, MONEDAS, unirOpciones, formatValor } from '@/lib/leadVehiculo'
import { formatMiles, parseMiles } from '@/lib/numberMask'

const VACIO = { marca: '', modelo: '', tipo: '', precioMin: '', precioMax: '', moneda: 'ARS' }
const PASO = 30
// Al elegir un auto del stock se busca en su precio ± este margen.
const MARGEN_STOCK = 0.15

const STATUS_LABEL = { vendido: 'Vendido', perdido: 'Perdido' }

const ETIQUETA = {
  marca: 'marca',
  modelo: 'modelo',
  tipo: 'tipo',
  precio: 'precio',
  presupuesto: 'presupuesto',
  sin_valor: 'sin valor',
}

function lineaDemanda(d) {
  const veh = [d.marca, d.modelo].filter(Boolean).join(' ')
  const partes = [veh || null, d.tipo, d.condicion === 'cero' ? '0 km' : null]
  const valor = formatValor(d.valor, d.moneda)
  if (valor) partes.push(`aprox. ${valor}`)
  if (d.presupuesto) partes.push(`presupuesto ${formatValor(d.presupuesto, 'ARS')}`)
  return partes.filter(Boolean).join(' · ') || '—'
}

const textoVehiculo = (v) => {
  const precio = formatValor(v.precio_contado, v.moneda)
  const base = [v.marca, v.modelo, v.version, v.anio].filter(Boolean).join(' ')
  return precio ? `${base} — ${precio}` : base
}

function Tarjeta({ persona: p, lineas }) {
  const wa = waContactoLink({ telefono: p.telefono, nombre: p.nombre })
  const ficha = `/crm/clientes/${p.id}`
  return (
    <GlassCard className="min-w-0 p-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <Link to={ficha} className="block truncate font-semibold text-ink hover:text-neifert">
            {p.nombre}
          </Link>
          <p className="truncate text-xs text-ink-3">{p.telefono || 'Sin teléfono'}</p>
        </div>
        {esInactivo(p) && <Badge variant={statusVariant(p.estado)}>{STATUS_LABEL[p.estado] ?? p.estado}</Badge>}
        {wa && (
          <a
            href={wa}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Contactar a ${p.nombre} por WhatsApp`}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-whatsapp text-white transition-opacity hover:opacity-90"
          >
            <WhatsAppIcon size={16} />
          </a>
        )}
      </div>
      <ul className="mt-3 space-y-1.5 border-t border-line pt-3">
        {lineas.map((d, i) => (
          <li key={i} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            <span className="text-ink-2">{lineaDemanda(d)}</span>
            {d.coincide.map((c) => (
              <span
                key={c}
                className={
                  c === 'sin_valor'
                    ? 'rounded-full bg-ink/8 px-2 py-0.5 text-[10px] font-semibold uppercase text-ink-3'
                    : 'rounded-full bg-neifert/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-neifert'
                }
              >
                {ETIQUETA[c]}
              </span>
            ))}
          </li>
        ))}
      </ul>
    </GlassCard>
  )
}

/** Lista paginada de resultados, con título opcional (grupo). */
function Grupo({ titulo, detalle, items }) {
  const [limite, setLimite] = useState(PASO)
  if (!items.length) return null
  return (
    <section className="space-y-3">
      {titulo && (
        <div className="border-t border-line pt-4">
          <h2 className="font-display text-base font-bold text-ink">
            {titulo} <span className="font-normal text-ink-3">({items.length})</span>
          </h2>
          {detalle && <p className="text-xs text-ink-3">{detalle}</p>}
        </div>
      )}
      <ul className="grid items-start gap-3 lg:grid-cols-2">
        {items.slice(0, limite).map((r) => (
          <li key={r.persona.id}>
            <Tarjeta persona={r.persona} lineas={r.lineas} />
          </li>
        ))}
      </ul>
      {limite < items.length && (
        <div className="flex justify-center">
          <Button variant="glass" onClick={() => setLimite((l) => l + PASO)}>
            Ver más ({items.length - limite})
          </Button>
        </div>
      )}
    </section>
  )
}

export default function BuscadorCompradores() {
  const { data: demandas = [], isLoading, isError } = useDemandas()
  const { opciones } = useOpcionesCampo()
  const { data: stock } = useVehiculos({ filtros: { estado: ['disponible'] }, pageSize: 300 })
  const [f, setF] = useState(VACIO)
  const [auto, setAuto] = useState('')
  const set = (k) => (v) => setF((prev) => ({ ...prev, [k]: v }))

  const vehiculos = useMemo(() => stock?.filas ?? [], [stock])
  const porTexto = useMemo(() => new Map(vehiculos.map((v) => [textoVehiculo(v), v])), [vehiculos])

  // Elegir un auto del stock completa los filtros con sus datos y su precio ± margen.
  function elegirAuto(texto) {
    setAuto(texto)
    const v = porTexto.get(texto)
    if (!v) return
    const precio = Number(v.precio_contado)
    setF({
      marca: v.marca ?? '',
      modelo: v.modelo ?? '',
      tipo: v.tipo ?? '',
      moneda: v.moneda === 'USD' ? 'USD' : 'ARS',
      precioMin: precio > 0 ? Math.round(precio * (1 - MARGEN_STOCK)) : '',
      precioMax: precio > 0 ? Math.round(precio * (1 + MARGEN_STOCK)) : '',
    })
  }

  function limpiar() {
    setF(VACIO)
    setAuto('')
  }

  const resultados = useMemo(() => buscarCompradores(demandas, f), [demandas, f])
  const activos = resultados.filter((r) => !esInactivo(r.persona))
  const inactivos = resultados.filter((r) => esInactivo(r.persona))
  const activo = hayFiltros(f)

  return (
    <div className="space-y-5">
      <p className="text-sm text-ink-2">
        Buscá por vehículo, tipo o rango de precio y mirá a quién le puede interesar, según los
        intereses cargados en cada cliente.
      </p>

      <GlassCard className="p-4">
        <div className="mb-3">
          <Combobox
            label="Elegir un auto del stock (opcional)"
            value={auto}
            onChange={elegirAuto}
            options={[...porTexto.keys()]}
            placeholder="Buscá un vehículo disponible para completar los filtros…"
          />
          <p className="mt-1 text-[11px] text-ink-3">
            Completa marca, modelo, tipo y un rango de precio de ±{MARGEN_STOCK * 100}%. Después podés ajustarlo.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Combobox label="Marca" value={f.marca} onChange={set('marca')} options={opciones.marca ?? []} placeholder="Ej. Toyota" />
          <Combobox label="Modelo" value={f.modelo} onChange={set('modelo')} options={opciones.modelo ?? []} placeholder="Ej. Corolla" />
          <Combobox label="Tipo" value={f.tipo} onChange={set('tipo')} options={unirOpciones(TIPOS_BASE, opciones.tipo)} placeholder="Ej. SUV" />
          <Select label="Moneda" options={MONEDAS} value={f.moneda} onChange={set('moneda')} />
          <Input
            label="Precio desde"
            inputMode="numeric"
            value={formatMiles(f.precioMin)}
            onChange={(e) => set('precioMin')(parseMiles(e.target.value))}
            placeholder="Ej. 15.000.000"
          />
          <Input
            label="Precio hasta"
            inputMode="numeric"
            value={formatMiles(f.precioMax)}
            onChange={(e) => set('precioMax')(parseMiles(e.target.value))}
            placeholder="Ej. 25.000.000"
          />
        </div>
        {(activo || auto) && (
          <div className="mt-3 flex justify-end">
            <Button variant="ghost" size="sm" icon={X} onClick={limpiar}>
              Limpiar
            </Button>
          </div>
        )}
      </GlassCard>

      {isLoading ? (
        <div className="grid place-items-center py-10">
          <Spinner size={24} />
        </div>
      ) : isError ? (
        <GlassCard className="p-8 text-center text-sm text-ink-2">
          No se pudieron cargar los intereses. Probá de nuevo en un momento.
        </GlassCard>
      ) : !activo ? (
        <GlassCard className="grid place-items-center gap-2 p-10 text-center">
          <Search size={22} className="text-ink-3" />
          <p className="font-display font-bold text-ink">Elegí al menos un filtro</p>
          <p className="text-sm text-ink-3">
            Hay {demandas.length} líneas de interés cargadas para cruzar.
          </p>
        </GlassCard>
      ) : resultados.length === 0 ? (
        <GlassCard className="p-10 text-center">
          <p className="font-display font-bold text-ink">Sin posibles compradores</p>
          <p className="mt-1 text-sm text-ink-3">
            Nadie tiene cargado un interés que coincida. Probá con menos filtros o un rango más amplio.
          </p>
        </GlassCard>
      ) : (
        <div className="space-y-5">
          <p className="text-sm text-ink-2">
            {activos.length} posible{activos.length === 1 ? '' : 's'} comprador
            {activos.length === 1 ? '' : 'es'}
            {inactivos.length > 0 && ` · ${inactivos.length} no activo${inactivos.length === 1 ? '' : 's'}`}
          </p>
          <Grupo items={activos} />
          <Grupo
            titulo="Vendidos y perdidos"
            detalle="Ya no están en seguimiento: se muestran al final por si querés retomarlos."
            items={inactivos}
          />
        </div>
      )}
    </div>
  )
}
