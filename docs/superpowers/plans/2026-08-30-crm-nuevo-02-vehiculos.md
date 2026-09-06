# CRM nuevo — Plan 2: Módulo Vehículos

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El módulo Vehículos completo en `/crm/vehiculos` — lista con filtros, alta/edición, ficha de detalle con pestañas Resumen · Peritaje · Gestoría · Historial, sobre el schema `crm` y con la estética glass del sitio.

**Architecture:** Páginas y componentes en `src/crm/**`, capa de servicios contra el schema `crm` de Supabase (PostgREST, RLS por rol), react-query para cache + mutations, realtime de Supabase para la lista. Reusa `src/components/common/*` (Button/Input/Select/Badge/Modal/GlassCard/Pagination/Spinner/DatePicker) y los tokens `--c-*` / utilidades `.glass`. base-nova solo para `Tabs`, `DropdownMenu`, `Sheet`.

**Tech Stack:** React 19, Vite 8, Tailwind v4 (glass, dark por `.dark`), `@supabase/supabase-js` v2, `@tanstack/react-query` v5, `zustand` v5, `react-hook-form` + `zod` (ya dependencias), `framer-motion`, `lucide-react`, `sonner`, Vitest 2 + Testing Library.

**Spec:** `docs/superpowers/specs/2026-08-30-crm-nuevo-fundaciones-vehiculos-design.md` (secciones 5 y 6; §6 revisada a "estética glass del sitio").

## Global Constraints

- **Estética:** reusar `@/components/common/*` y las clases glass (`.glass`, `.glass-nav`, `.field-glass`, `.shadow-glass`, `rounded-2xl`). Tokens `--c-*` vía utilidades (`text-ink`, `text-ink-2`, `text-ink-3`, `border-line`, `bg-surface`, `text-neifert`, `text-success`, `text-amber`). Títulos en `font-display`. **Nada de `--crm-*`** (se eliminaron). base-nova (`@/components/ui/{tabs,dropdown-menu,sheet}`) solo donde no hay equivalente en `common/*`, siempre dentro de `.crm-root`.
- **Datos:** schema `crm` (ya aplicado y poblado: 60 vehículos, 13 gestorías, 10 peritajes, 4 usuarios). Acceso por `supabase.schema('crm').from(...)`. RLS: cualquier usuario `crm` lee/crea/edita; **solo admin** borra (`delete`). El vendedor archiva (`update archivado_en`).
- **Auditoría:** toda mutación de vehículo/peritaje/gestoría registra una fila en `crm.eventos` vía `eventos.service.registrar(...)`. `creado_por`/`editado_por` = `useCrmPerfil().id`.
- **ESM**, `"type": "module"`. Alias `@` → `src`. Todo el CRM en `src/crm/**`.
- **Tests:** unit (node) para lógica pura y servicios (mock del cliente Supabase, patrón de `src/server/__tests__/legacy/legacyStore.test.js`); componentes con `// @vitest-environment jsdom`. `npm test` debe quedar verde.
- **Commits:** cerrar el body con `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`. Rama actual: `feat/crm-legacy-clone` (el dueño quiere todo ahí). No commitear a `main`.
- **Español** en columnas, copy y nombres de dominio.

---

## File Structure

| File | Responsabilidad |
|------|------------------|
| `src/crm/lib/peritajeSchema.js` | (reemplaza el mínimo de Plan 1) `PERITAJE_SECCIONES` completo (~120 campos, `{ key, label, tipo }` por ítem) + `PERITAJE_ITEMS_ESTADO` derivado + `resumenPeritaje(datos)` movido acá. |
| `src/crm/lib/gestoriaSchema.js` | Los 8 trámites: `{ key, label }`. |
| `src/crm/lib/formatVehiculo.js` | `lineaSpecs(v)`, `precioFmt(v)`, `estadoBadge(v)` — helpers de presentación. |
| `src/crm/lib/vehiculoSchema.js` | `zod` del form de alta/edición. |
| `src/crm/lib/mapeos.js` | (existe) — se le quita `resumenPeritaje` (va a peritajeSchema) o se re-exporta desde ahí para no romper imports. |
| `src/crm/services/eventos.service.js` | `registrar({entidad,entidadId,tipo,datos})`, `listarDeVehiculo(vehiculoId)`. |
| `src/crm/services/vehiculos.service.js` | `listar(opts)`, `obtener(id)`, `crear(data)`, `actualizar(id,data)`, `cambiarEstado(id,estado)`, `archivar(id)`, `desarchivar(id)`, `eliminar(id)`. |
| `src/crm/services/fotos.service.js` | `listar(vehiculoId)`, `subir(vehiculoId, file)`, `borrar(id)`, `marcarPortada(vehiculoId,id)`, `reordenar(ids)`. |
| `src/crm/services/peritajes.service.js` | `listarPorVehiculo(id)`, `obtener(id)`, `crear(data)`, `actualizar(id,data)`. |
| `src/crm/services/gestoria.service.js` | `obtenerPorVehiculo(id)`, `guardarCampos(vehiculoId, parche)`. |
| `src/crm/hooks/useVehiculos.js` | `useVehiculos(opts)`, `useVehiculo(id)`, `useVehiculoMutations()`. |
| `src/crm/hooks/usePeritajes.js` | `usePeritajes(vehiculoId)`, `usePeritaje(id)`, `usePeritajeMutations(vehiculoId)`. |
| `src/crm/hooks/useGestoria.js` | `useGestoria(vehiculoId)`, `useGestoriaMutations(vehiculoId)`. |
| `src/crm/hooks/useEventosVehiculo.js` | `useEventosVehiculo(vehiculoId)`. |
| `src/crm/hooks/useCrmRealtime.js` | suscripción a cambios de una tabla `crm` → invalida query key. |
| `src/crm/store/useVehiculosFiltros.js` | zustand: búsqueda, filtros, orden, página. |
| `src/crm/components/EstadoStrip.jsx` | barra segmentada ok/obs/falta. |
| `src/crm/components/VehiculoFilters.jsx` | panel de filtros (glass). |
| `src/crm/components/VehiculoTable.jsx` | tabla (≥md) — filas glass. |
| `src/crm/components/VehiculoCard.jsx` | card (<md). |
| `src/crm/components/VehiculoForm.jsx` | alta/edición (RHF + zod). |
| `src/crm/components/FotosUploader.jsx` | subida R2, reordenar, portada. |
| `src/crm/components/FichaVehiculo.jsx` | tab Resumen. |
| `src/crm/components/PeritajeForm.jsx` | form largo + `EstadoStrip` vivo. |
| `src/crm/components/PeritajeLectura.jsx` | vista de lectura por secciones. |
| `src/crm/components/GestoriaChecklist.jsx` | 8 trámites con autosave. |
| `src/crm/components/HistorialTimeline.jsx` | timeline de `crm.eventos`. |
| `src/crm/pages/VehiculosListPage.jsx` | lista + filtros. |
| `src/crm/pages/VehiculoNuevoPage.jsx` | alta. |
| `src/crm/pages/VehiculoEditarPage.jsx` | edición. |
| `src/crm/pages/VehiculoDetallePage.jsx` | detalle con `Tabs`. |
| `src/routes/AppRouter.jsx` | (modificar) rutas reales del módulo. |
| `src/crm/pages/VehiculosPlaceholderPage.jsx` | (borrar al final) |

---

## Task 1: `peritajeSchema.js` completo + `gestoriaSchema.js`

**Files:**
- Modify: `src/crm/lib/peritajeSchema.js`
- Create: `src/crm/lib/gestoriaSchema.js`
- Modify: `src/crm/lib/mapeos.js` (re-exportar `resumenPeritaje` desde peritajeSchema para no romper imports existentes)
- Test: `src/crm/__tests__/peritajeSchema.test.js`, `src/crm/__tests__/gestoriaSchema.test.js`

**Interfaces:**
- Produce:
  - `PERITAJE_SECCIONES: Array<{ id, titulo, items: Array<{ key, label, tipo }> }>` con `tipo ∈ 'estado' | 'texto' | 'moneda' | 'porcentaje'`.
  - `PERITAJE_ITEMS_ESTADO: string[]` = `PERITAJE_SECCIONES.flatMap(s => s.items).filter(i => i.tipo === 'estado').map(i => i.key)`.
  - `resumenPeritaje(datos): { items_ok, items_obs, items_falta }` (movido acá; misma lógica que hoy en mapeos.js — sinónimos `ok`/`obs`/`observación`/`falta`/`mal`, ignora vacío/`na`).
  - `GESTORIA_ITEMS: Array<{ key, label }>` — `form08`→"Formulario 08", `verif_policial`→"Verificación policial", `multas_nac`→"Multas nacionales", `dominio_hist`→"Informe de dominio", `libre_deudas`→"Libre deuda", `titulo`→"Título", `cedulas`→"Cédulas", `identificacion`→"Verificación de autopartes".

- [ ] **Step 1: Tests (fallan primero)**

`peritajeSchema.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { PERITAJE_SECCIONES, PERITAJE_ITEMS_ESTADO, resumenPeritaje } from '../lib/peritajeSchema.js'

describe('PERITAJE_SECCIONES', () => {
  it('todo ítem tiene key único, label y tipo válido', () => {
    const keys = new Set()
    const tipos = new Set(['estado', 'texto', 'moneda', 'porcentaje'])
    for (const sec of PERITAJE_SECCIONES) {
      expect(sec.id).toBeTruthy()
      expect(sec.titulo).toBeTruthy()
      for (const it of sec.items) {
        expect(it.key, `dup ${it.key}`).not.toBe(undefined)
        expect(keys.has(it.key)).toBe(false)
        keys.add(it.key)
        expect(it.label).toBeTruthy()
        expect(tipos.has(it.tipo)).toBe(true)
      }
    }
  })
  it('cubre las secciones esperadas', () => {
    const ids = PERITAJE_SECCIONES.map((s) => s.id)
    expect(ids).toEqual(
      expect.arrayContaining(['motor', 'rodante', 'electronica', 'accesorios', 'tapizados', 'carroceria', 'historial']),
    )
  })
  it('PERITAJE_ITEMS_ESTADO se deriva de los ítems tipo estado', () => {
    expect(PERITAJE_ITEMS_ESTADO).toContain('motor')
    expect(PERITAJE_ITEMS_ESTADO).toContain('frenos')
    expect(PERITAJE_ITEMS_ESTADO).not.toContain('obsMotor')
    expect(PERITAJE_ITEMS_ESTADO).not.toContain('costoB')
    expect(PERITAJE_ITEMS_ESTADO).not.toContain('dañoCapo')
  })
})

describe('resumenPeritaje', () => {
  it('cuenta ok/obs/falta e ignora texto y na', () => {
    expect(resumenPeritaje({ motor: 'ok', frenos: 'obs', abs: 'falta', cajaAT: 'na', obsMotor: 'x' }))
      .toEqual({ items_ok: 1, items_obs: 1, items_falta: 1 })
  })
})
```

`gestoriaSchema.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { GESTORIA_ITEMS } from '../lib/gestoriaSchema.js'

describe('GESTORIA_ITEMS', () => {
  it('tiene los 8 trámites con label', () => {
    expect(GESTORIA_ITEMS.map((i) => i.key)).toEqual([
      'form08', 'verif_policial', 'multas_nac', 'dominio_hist',
      'libre_deudas', 'titulo', 'cedulas', 'identificacion',
    ])
    for (const i of GESTORIA_ITEMS) expect(i.label).toBeTruthy()
  })
})
```

Run: `npm test -- peritajeSchema gestoriaSchema` → FAIL.

- [ ] **Step 2: Escribir `peritajeSchema.js`**

Fuente: keys del POST `peritaje.php` (`scraping/NewEndpoints/*.har`) — verbatim:
`gatoLlave,ruedaAux,matafuego,balizas,antirrobos,alarma,segundaLlave,manualUnidad,codigosRadio,carpetaDoc,audio,calefaccion,ac,vidriosElec,cierreCentral,cinturon,frenoMano,obsExt,desgasteCarroceria,costoA,dañoCapo,pctCapo,dañoTecho,pctTecho,dañoBaul,pctBaul,dañoParaDelant,pctParaDelant,dañoParaTras,pctParaTras,dañoPuertaDelIzq,pctPuertaDelIzq,dañoPuertaDelDer,pctPuertaDelDer,dañoPuertaTrasIzq,pctPuertaTrasIzq,dañoPuertaTrasDer,pctPuertaTrasDer,dañoGdaDelIzq,pctGdaDelIzq,dañoGdaDelDer,pctGdaDelDer,dañoGdaTrasIzq,pctGdaTrasIzq,dañoGdaTrasDer,pctGdaTrasDer,dañoEspejoIzq,pctEspejoIzq,dañoEspejoDer,pctEspejoDer,costoCarroceria,motor,cajaAT,embrague,cuatroX4,diferencial,mantenimiento,obsMotor,costoB,frenos,trenDelant,amortiguadores,obsC,costoC,abs,motorLuz,airbag,transLuz,bateria,dtcCode1,dtcCode2,dtcCode3,dtcOtros,obsD,costoD,butacaIzq,butacaDer,asientoTras,tapizPuertas,tapizTecho,bandejaT,obsE,costoE,fHistorialServicios,fHistorialObs,fCorreaDistrib,fCorreaDistribObs,fNeumaticosEstado,fNeumaticosReemplazo,fNneumaticosMarca,fPrimerDuenio,fParabrisas,fNotaPropietario,costoF,costoTotal`

Estructura (labels en español, `tipo`: `estado` para checklist de condición; `texto` para `obs*`/`mantenimiento`/`dtc*`/`f*` de texto; `moneda` para `costo*`; `porcentaje` para `pct*`; `dañoX` es `texto` — describe el daño):

```js
export const PERITAJE_SECCIONES = [
  { id: 'motor', titulo: 'Motor y transmisión', items: [
    { key: 'motor', label: 'Motor', tipo: 'estado' },
    { key: 'cajaAT', label: 'Caja automática', tipo: 'estado' },
    { key: 'embrague', label: 'Embrague', tipo: 'estado' },
    { key: 'cuatroX4', label: 'Tracción 4x4', tipo: 'estado' },
    { key: 'diferencial', label: 'Diferencial', tipo: 'estado' },
    { key: 'mantenimiento', label: 'Últ. mantenimiento', tipo: 'texto' },
    { key: 'obsMotor', label: 'Observaciones', tipo: 'texto' },
    { key: 'costoB', label: 'Costo estimado', tipo: 'moneda' },
  ]},
  { id: 'rodante', titulo: 'Rodante y frenos', items: [
    { key: 'frenos', label: 'Frenos', tipo: 'estado' },
    { key: 'trenDelant', label: 'Tren delantero', tipo: 'estado' },
    { key: 'amortiguadores', label: 'Amortiguadores', tipo: 'estado' },
    { key: 'obsC', label: 'Observaciones', tipo: 'texto' },
    { key: 'costoC', label: 'Costo estimado', tipo: 'moneda' },
  ]},
  { id: 'electronica', titulo: 'Electrónica y diagnóstico', items: [
    { key: 'abs', label: 'ABS', tipo: 'estado' },
    { key: 'motorLuz', label: 'Testigo motor', tipo: 'estado' },
    { key: 'airbag', label: 'Airbag', tipo: 'estado' },
    { key: 'transLuz', label: 'Testigo transmisión', tipo: 'estado' },
    { key: 'bateria', label: 'Batería', tipo: 'estado' },
    { key: 'dtcCode1', label: 'Código DTC 1', tipo: 'texto' },
    { key: 'dtcCode2', label: 'Código DTC 2', tipo: 'texto' },
    { key: 'dtcCode3', label: 'Código DTC 3', tipo: 'texto' },
    { key: 'dtcOtros', label: 'Otros códigos', tipo: 'texto' },
    { key: 'obsD', label: 'Observaciones', tipo: 'texto' },
    { key: 'costoD', label: 'Costo estimado', tipo: 'moneda' },
  ]},
  { id: 'accesorios', titulo: 'Accesorios y equipamiento', items: [
    { key: 'gatoLlave', label: 'Gato y llave', tipo: 'estado' },
    { key: 'ruedaAux', label: 'Rueda de auxilio', tipo: 'estado' },
    { key: 'matafuego', label: 'Matafuego', tipo: 'estado' },
    { key: 'balizas', label: 'Balizas', tipo: 'estado' },
    { key: 'antirrobos', label: 'Antirrobos', tipo: 'estado' },
    { key: 'alarma', label: 'Alarma', tipo: 'estado' },
    { key: 'segundaLlave', label: 'Segunda llave', tipo: 'estado' },
    { key: 'manualUnidad', label: 'Manual de la unidad', tipo: 'estado' },
    { key: 'codigosRadio', label: 'Códigos de radio', tipo: 'estado' },
    { key: 'carpetaDoc', label: 'Carpeta de documentación', tipo: 'estado' },
    { key: 'audio', label: 'Audio', tipo: 'estado' },
    { key: 'calefaccion', label: 'Calefacción', tipo: 'estado' },
    { key: 'ac', label: 'Aire acondicionado', tipo: 'estado' },
    { key: 'vidriosElec', label: 'Vidrios eléctricos', tipo: 'estado' },
    { key: 'cierreCentral', label: 'Cierre centralizado', tipo: 'estado' },
    { key: 'cinturon', label: 'Cinturones', tipo: 'estado' },
    { key: 'frenoMano', label: 'Freno de mano', tipo: 'estado' },
  ]},
  { id: 'tapizados', titulo: 'Tapizados e interior', items: [
    { key: 'butacaIzq', label: 'Butaca izquierda', tipo: 'estado' },
    { key: 'butacaDer', label: 'Butaca derecha', tipo: 'estado' },
    { key: 'asientoTras', label: 'Asiento trasero', tipo: 'estado' },
    { key: 'tapizPuertas', label: 'Tapizado de puertas', tipo: 'estado' },
    { key: 'tapizTecho', label: 'Tapizado de techo', tipo: 'estado' },
    { key: 'bandejaT', label: 'Bandeja trasera', tipo: 'estado' },
    { key: 'obsE', label: 'Observaciones', tipo: 'texto' },
    { key: 'costoE', label: 'Costo estimado', tipo: 'moneda' },
  ]},
  { id: 'carroceria', titulo: 'Carrocería', items: [
    { key: 'obsExt', label: 'Observaciones exteriores', tipo: 'texto' },
    { key: 'desgasteCarroceria', label: 'Desgaste general', tipo: 'texto' },
    { key: 'costoA', label: 'Costo estimado', tipo: 'moneda' },
    ...['Capo','Techo','Baul','ParaDelant','ParaTras','PuertaDelIzq','PuertaDelDer','PuertaTrasIzq','PuertaTrasDer','GdaDelIzq','GdaDelDer','GdaTrasIzq','GdaTrasDer','EspejoIzq','EspejoDer']
      .flatMap((p) => {
        const LBL = { Capo:'Capó', Techo:'Techo', Baul:'Baúl', ParaDelant:'Paragolpes del.', ParaTras:'Paragolpes tras.',
          PuertaDelIzq:'Puerta del. izq.', PuertaDelDer:'Puerta del. der.', PuertaTrasIzq:'Puerta tras. izq.',
          PuertaTrasDer:'Puerta tras. der.', GdaDelIzq:'Guardabarros del. izq.', GdaDelDer:'Guardabarros del. der.',
          GdaTrasIzq:'Guardabarros tras. izq.', GdaTrasDer:'Guardabarros tras. der.', EspejoIzq:'Espejo izq.', EspejoDer:'Espejo der.' }
        return [
          { key: 'daño' + p, label: LBL[p] + ' — daño', tipo: 'texto' },
          { key: 'pct' + p, label: LBL[p] + ' — %', tipo: 'porcentaje' },
        ]
      }),
    { key: 'costoCarroceria', label: 'Costo total carrocería', tipo: 'moneda' },
  ]},
  { id: 'historial', titulo: 'Historial y fondo', items: [
    { key: 'fHistorialServicios', label: 'Historial de servicios', tipo: 'texto' },
    { key: 'fHistorialObs', label: 'Obs. historial', tipo: 'texto' },
    { key: 'fCorreaDistrib', label: 'Correa de distribución', tipo: 'texto' },
    { key: 'fCorreaDistribObs', label: 'Obs. correa', tipo: 'texto' },
    { key: 'fNeumaticosEstado', label: 'Estado neumáticos', tipo: 'texto' },
    { key: 'fNeumaticosReemplazo', label: 'Reemplazo neumáticos', tipo: 'texto' },
    { key: 'fNneumaticosMarca', label: 'Marca neumáticos', tipo: 'texto' },
    { key: 'fPrimerDuenio', label: 'Primer dueño', tipo: 'texto' },
    { key: 'fParabrisas', label: 'Parabrisas', tipo: 'texto' },
    { key: 'fNotaPropietario', label: 'Nota del propietario', tipo: 'texto' },
    { key: 'costoF', label: 'Costo estimado', tipo: 'moneda' },
  ]},
]

export const PERITAJE_ITEMS_ESTADO = PERITAJE_SECCIONES
  .flatMap((s) => s.items).filter((i) => i.tipo === 'estado').map((i) => i.key)

const VAL = { ok: 'ok', obs: 'obs', 'observación': 'obs', observacion: 'obs', falta: 'falta', mal: 'falta' }
export function resumenPeritaje(datos = {}) {
  let items_ok = 0, items_obs = 0, items_falta = 0
  for (const k of PERITAJE_ITEMS_ESTADO) {
    const raw = datos[k] == null ? null : String(datos[k]).trim().toLowerCase()
    const v = raw && VAL[raw]
    if (v === 'ok') items_ok++
    else if (v === 'obs') items_obs++
    else if (v === 'falta') items_falta++
  }
  return { items_ok, items_obs, items_falta }
}
```

En `src/crm/lib/mapeos.js`: borrar la definición local de `resumenPeritaje` y agregar `export { resumenPeritaje } from './peritajeSchema.js'` (los imports en `mapeos.test.js` y `migrate-legacy-to-crm.mjs` siguen andando).

- [ ] **Step 3: `gestoriaSchema.js`**

```js
export const GESTORIA_ITEMS = [
  { key: 'form08', label: 'Formulario 08' },
  { key: 'verif_policial', label: 'Verificación policial' },
  { key: 'multas_nac', label: 'Multas nacionales' },
  { key: 'dominio_hist', label: 'Informe de dominio histórico' },
  { key: 'libre_deudas', label: 'Libre deuda de patente' },
  { key: 'titulo', label: 'Título' },
  { key: 'cedulas', label: 'Cédulas' },
  { key: 'identificacion', label: 'Verificación de autopartes' },
]
```

- [ ] **Step 4: Tests en verde + suite**

Run: `npm test -- peritajeSchema gestoriaSchema mapeos` → PASS. Luego `npm test` completo.

- [ ] **Step 5: Commit**

```bash
git add src/crm/lib/peritajeSchema.js src/crm/lib/gestoriaSchema.js src/crm/lib/mapeos.js src/crm/__tests__/peritajeSchema.test.js src/crm/__tests__/gestoriaSchema.test.js
git commit -m "$(printf 'feat(crm): peritajeSchema completo + gestoriaSchema\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>')"
```

---

## Task 2: `eventos.service.js` + `useEventosVehiculo`

**Files:**
- Create: `src/crm/services/eventos.service.js`, `src/crm/hooks/useEventosVehiculo.js`
- Test: `src/crm/__tests__/eventos.service.test.js`

**Interfaces:**
- `registrar({ entidad, entidadId, tipo, datos, usuarioId }): Promise<void>` — `insert` en `crm.eventos` (`entidad_id` = String).
- `listarDeVehiculo(vehiculoId): Promise<Evento[]>` — eventos de `entidad='vehiculo'` con ese id **más** los de sus peritajes/gestoría (dos queries + merge por `creado_en desc`), o una sola query con `or(...)` si los ids se conocen. v1: query por `entidad='vehiculo', entidad_id=vehiculoId` ordenado desc (los de peritaje/gestoría se agregan cuando esos servicios registren con `entidadId = vehiculoId`). **Decisión:** peritajes y gestoría registran su evento con `entidad='vehiculo', entidad_id=<vehiculoId>` y `tipo='peritaje'|'gestoria'` — así una sola query alcanza.
- `useEventosVehiculo(vehiculoId)` → react-query `['crm','eventos',vehiculoId]`.

- [ ] **Step 1: Test (falla primero)** — mock chainable de supabase (copiar el helper `makeSupabase` de `src/server/__tests__/legacy/legacyStore.test.js`, adaptado). Casos: `registrar` arma la fila con `entidad_id` string y `datos` default `{}`; `listarDeVehiculo` filtra por entidad+id y ordena desc.

- [ ] **Step 2: Implementar**

```js
import { supabase } from '@/services/supabaseClient'

export async function registrar({ entidad, entidadId, tipo, datos = {}, usuarioId = null }) {
  const { error } = await supabase.schema('crm').from('eventos').insert({
    entidad, entidad_id: String(entidadId), tipo, datos, usuario_id: usuarioId,
  })
  if (error) throw error
}

export async function listarDeVehiculo(vehiculoId) {
  const { data, error } = await supabase.schema('crm').from('eventos')
    .select('id, tipo, datos, usuario_id, creado_en, usuario:usuarios(nombre)')
    .eq('entidad', 'vehiculo').eq('entidad_id', String(vehiculoId))
    .order('creado_en', { ascending: false })
  if (error) throw error
  return data ?? []
}
```

- [ ] **Step 3: `useEventosVehiculo.js`** — `useQuery({ queryKey: ['crm','eventos',vehiculoId], queryFn: () => listarDeVehiculo(vehiculoId), enabled: !!vehiculoId })`.

- [ ] **Step 4: Test verde + commit**

```bash
git add src/crm/services/eventos.service.js src/crm/hooks/useEventosVehiculo.js src/crm/__tests__/eventos.service.test.js
git commit -m "$(printf 'feat(crm): servicio y hook de eventos (bitacora)\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>')"
```

---

## Task 3: `vehiculos.service.js` + hooks + store de filtros

**Files:**
- Create: `src/crm/services/vehiculos.service.js`, `src/crm/hooks/useVehiculos.js`, `src/crm/store/useVehiculosFiltros.js`, `src/crm/lib/formatVehiculo.js`
- Test: `src/crm/__tests__/vehiculos.service.test.js`, `src/crm/__tests__/formatVehiculo.test.js`

**Interfaces:**
- `listar({ busqueda, filtros, orden, pagina, pageSize=20, incluirArchivados=false }): Promise<{ filas, total }>` — `select('*', { count: 'exact' })`, `.range()`, filtros: `estado` (`in`), `tipo` (`in`), `moneda` (`eq`), `anioMin/anioMax` (`gte/lte`), `precioMin/precioMax` (sobre `precio_contado`), `conPeritaje` (join/exists — v1: columna calculada del lado servidor NO; se hace con `.not('peritajes','is',null)` vía `select('*, peritajes(id)')` y filtra client-side, o se omite y queda como filtro futuro), `gestoriaPendiente` (idem). `busqueda` → `.or('marca.ilike.%q%,modelo.ilike.%q%,version.ilike.%q%,patente.ilike.%q%,duenio_nombre.ilike.%q%,duenio_apellido.ilike.%q%')`. `incluirArchivados=false` → `.is('archivado_en', null)`.
- `obtener(id)` → `select('*, fotos:vehiculo_fotos(*)')` de un vehículo.
- `crear(data)` / `actualizar(id, data)` → setean `creado_por`/`editado_por` (pasados por el hook), registran evento (`alta` / `edicion` con `datos: { campos: [...] }`).
- `cambiarEstado(id, estado)` → `update({ estado })` + evento `cambio_estado` `{ de, a }`.
- `archivar(id)` / `desarchivar(id)` → `update({ archivado_en })` + evento `archivado`.
- `eliminar(id)` → `delete` (falla por RLS si no es admin — el hook muestra el error).
- `formatVehiculo.js`: `lineaSpecs(v)` → `"2015 · 128.000 km · Manual"`; `precioFmt(v)` → `{ monto: "12.500", moneda: "USD" }` (usa `Intl.NumberFormat('es-AR')`); `estadoVariant(estado)` → `'green'|'amber'|'neutral'|'red'` para `Badge`.
- Hooks: `useVehiculos(opts)` (`['crm','vehiculos',opts]`), `useVehiculo(id)`, `useVehiculoMutations()` → `{ crear, actualizar, cambiarEstado, archivar, desarchivar, eliminar }` (cada uno `useMutation` con `onSuccess` → invalidar `['crm','vehiculos']` + toast; inyecta `useCrmPerfil().id` como autor).
- Store `useVehiculosFiltros`: `{ busqueda, filtros, orden, pagina, setBusqueda, setFiltro, resetFiltros, setOrden, setPagina }` — patrón de `src/store/useCrmStore.js`.

- [ ] **Step 1: Tests (fallan primero)**
  - `formatVehiculo.test.js`: `lineaSpecs` con año/km/trans presentes y ausentes; `precioFmt` formatea miles es-AR y maneja null; `estadoVariant` mapea los 4 estados.
  - `vehiculos.service.test.js` (mock supabase): `listar` aplica `.is('archivado_en', null)` cuando `incluirArchivados=false`, arma el `.or(...)` de búsqueda, aplica `.range()` por página; `crear` inyecta `creado_por` y llama `eventos.registrar` con `tipo:'alta'`; `cambiarEstado` registra `cambio_estado` con `{de,a}`; `archivar` setea `archivado_en` no-null; `eliminar` hace `.delete()`.

- [ ] **Step 2: Implementar** los 4 archivos. Mockear `eventos.service` en el test de `vehiculos.service` (`vi.mock('./eventos.service.js', ...)`).

- [ ] **Step 3: Tests verde + suite + commit**

```bash
git add src/crm/services/vehiculos.service.js src/crm/hooks/useVehiculos.js src/crm/store/useVehiculosFiltros.js src/crm/lib/formatVehiculo.js src/crm/__tests__/vehiculos.service.test.js src/crm/__tests__/formatVehiculo.test.js
git commit -m "$(printf 'feat(crm): servicio/hooks/store de vehiculos + formatters\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>')"
```

---

## Task 4: `EstadoStrip`

**Files:**
- Create: `src/crm/components/EstadoStrip.jsx`
- Test: `src/crm/__tests__/EstadoStrip.test.jsx`

**Interfaces:**
- `<EstadoStrip ok={n} obs={n} falta={n} className? />` — barra `h-1.5 rounded-full` con 3 segmentos proporcionales (`bg-success` / `bg-amber` / `bg-neifert`); si `ok+obs+falta === 0` → barra `bg-ink/10` plena. `role="img"` + `aria-label="84 ok, 6 observaciones, 2 fallas"`. Opcional: `showLegend` para mostrar `● 84 · ▲ 6 · ✕ 2` debajo.

- [ ] **Step 1: Test (falla primero)**

```jsx
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import EstadoStrip from '../components/EstadoStrip.jsx'

describe('EstadoStrip', () => {
  it('aria-label refleja los conteos', () => {
    render(<EstadoStrip ok={84} obs={6} falta={2} />)
    expect(screen.getByRole('img')).toHaveAttribute('aria-label', expect.stringMatching(/84.*6.*2/))
  })
  it('sin datos → no rompe', () => {
    render(<EstadoStrip ok={0} obs={0} falta={0} />)
    expect(screen.getByRole('img')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Implementar** — segmentos con `style={{ flex: n }}` o `width: %`. `prefers-reduced-motion` no aplica (sin animación). 

- [ ] **Step 3: Test verde + commit**

```bash
git add src/crm/components/EstadoStrip.jsx src/crm/__tests__/EstadoStrip.test.jsx
git commit -m "$(printf 'feat(crm): componente EstadoStrip\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>')"
```

---

## Task 5: Lista de vehículos (`VehiculosListPage` + `VehiculoFilters` + `VehiculoTable` + `VehiculoCard` + `useCrmRealtime`)

**Files:**
- Create: `src/crm/components/VehiculoFilters.jsx`, `VehiculoTable.jsx`, `VehiculoCard.jsx`, `src/crm/hooks/useCrmRealtime.js`, `src/crm/pages/VehiculosListPage.jsx`
- Test: `src/crm/__tests__/VehiculoFilters.test.jsx`, `src/crm/__tests__/VehiculoTable.test.jsx`

**Interfaces:**
- `useCrmRealtime(tabla, queryKey)` — `supabase.channel('crm:'+tabla).on('postgres_changes', { schema:'crm', table:tabla }, () => qc.invalidateQueries({ queryKey })).subscribe()`; cleanup en unmount. No-op si `!isSupabaseConfigured`.
- `VehiculoFilters` — controlado por `useVehiculosFiltros`: `Select`/inputs glass para estado, tipo, moneda, rango año, rango precio, checkbox "incluir archivados". Botón "Limpiar" (`resetFiltros`). Contador de filtros activos.
- `VehiculoTable` (≥md) — recibe `filas`, render por fila: Vehículo (marca modelo versión), Patente, Año, Km, Precio (`Badge` moneda), Estado (`Badge` + `DropdownMenu` para cambiar rápido), Peritaje (`EstadoStrip` mini o "—"), Gestoría (`Badge` estado), link a detalle. Fila = `.glass rounded-2xl` (patrón `LeadTable`).
- `VehiculoCard` (<md) — misma info en card glass.
- `VehiculosListPage` — header con título `font-display` + `Button` "Cargar vehículo" (→ `/crm/vehiculos/nuevo`); `VehiculoFilters`; búsqueda (`Input` con icono, debounced 300ms); `useVehiculos({...del store})`; `VehiculoTable`/`VehiculoCard` según `useMediaQuery`; `Pagination`; `useCrmRealtime('vehiculos', ['crm','vehiculos'])`; empty state con CTA.

- [ ] **Step 1: Tests (fallan primero)**
  - `VehiculoFilters.test.jsx`: cambiar el `Select` de estado llama `setFiltro('estado', ...)`; "Limpiar" llama `resetFiltros`. (Store real de zustand o mock.)
  - `VehiculoTable.test.jsx`: renderiza marca/modelo/patente/precio de una fila fixture; el menú de estado muestra las 4 opciones; click en una opción llama el `onCambiarEstado` prop.

- [ ] **Step 2: Implementar** los 5 archivos.

- [ ] **Step 3: Tests verde + `npm test` + `npm run build` + commit**

```bash
git add src/crm/components/Vehiculo{Filters,Table,Card}.jsx src/crm/hooks/useCrmRealtime.js src/crm/pages/VehiculosListPage.jsx src/crm/__tests__/Vehiculo{Filters,Table}.test.jsx
git commit -m "$(printf 'feat(crm): lista de vehiculos con filtros, tabla/cards y realtime\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>')"
```

---

## Task 6: Alta/edición (`vehiculoSchema` + `VehiculoForm` + páginas nuevo/editar)

**Files:**
- Create: `src/crm/lib/vehiculoSchema.js`, `src/crm/components/VehiculoForm.jsx`, `src/crm/pages/VehiculoNuevoPage.jsx`, `src/crm/pages/VehiculoEditarPage.jsx`
- Test: `src/crm/__tests__/vehiculoSchema.test.js`, `src/crm/__tests__/VehiculoForm.test.jsx`

**Interfaces:**
- `vehiculoSchema` (zod): `marca` y `modelo` requeridos (`min(1)`); `anio` int `1950..(añoActual+1)` opcional; `km` `>=0` opcional; `precio_contado`/`precio_canje` `>=0` opcional; `moneda` enum `ARS|USD`; el resto opcional. `mensajes` en español.
- `VehiculoForm({ inicial?, onGuardar, guardando })` — `react-hook-form` + `zodResolver`. Secciones (headings `font-display`): **Datos** (marca*, modelo*, versión, tipo `Select`, año, km, transmisión `Select`, color, patente) · **Precio** (moneda `Select`, contado, canje) · **Dueño** (nombre, apellido, contacto) · **Documentación** (itv `Select si/no`, itv_venc `DatePicker`, consignación checkbox + tipo, origen, carpeta_* checkboxes, tiene_iva checkbox) · **Nota** (`Input as="textarea"`). Inputs glass de `common/Input`/`common/Select`. Submit → `onGuardar(values)`.
- `VehiculoNuevoPage` — `useVehiculoMutations().crear`; al éxito `navigate('/crm/vehiculos/'+id)`.
- `VehiculoEditarPage` — `useVehiculo(id)` para `inicial`; `actualizar`; al éxito volver al detalle.

- [ ] **Step 1: Tests (fallan primero)**
  - `vehiculoSchema.test.js`: marca vacía → error; año 1700 → error; año dentro de rango → ok; km negativo → error; payload mínimo válido `{marca:'x',modelo:'y'}` → ok.
  - `VehiculoForm.test.jsx`: render con `inicial`, cambiar marca, submit → `onGuardar` recibe el objeto con la marca nueva; submit con marca vacía → muestra el error, no llama `onGuardar`.

- [ ] **Step 2: Implementar.**

- [ ] **Step 3: Tests verde + build + commit**

```bash
git add src/crm/lib/vehiculoSchema.js src/crm/components/VehiculoForm.jsx src/crm/pages/VehiculoNuevoPage.jsx src/crm/pages/VehiculoEditarPage.jsx src/crm/__tests__/vehiculoSchema.test.js src/crm/__tests__/VehiculoForm.test.jsx
git commit -m "$(printf 'feat(crm): alta y edicion de vehiculos (RHF + zod)\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>')"
```

---

## Task 7: Fotos (`fotos.service.js` + `FotosUploader`)

**Files:**
- Create: `src/crm/services/fotos.service.js`, `src/crm/components/FotosUploader.jsx`
- Test: `src/crm/__tests__/fotos.service.test.js`

**Interfaces:**
- `subir(vehiculoId, file)` — pide presign a `/api/r2/presign` (`{ filename, contentType }`), `PUT` el archivo a `uploadUrl`, luego `insert` en `crm.vehiculo_fotos` (`url` = `publicUrl`, `orden` = siguiente, `subida_por`). Devuelve la fila.
- `listar(vehiculoId)`, `borrar(id)`, `marcarPortada(vehiculoId, id)` (transacción lógica: `update es_portada=false where vehiculo_id` + `update es_portada=true where id`), `reordenar(ids)` (`update orden` por índice).
- `FotosUploader({ vehiculoId })` — grid de miniaturas (glass), input file (acepta múltiples, `image/*`), drag para reordenar (o botones ↑↓ v1), marcar portada, borrar (con confirm). `react-query` key `['crm','fotos',vehiculoId]`.

- [ ] **Step 1: Test de `fotos.service` (falla primero)** — mock de `fetch` (presign + PUT) + mock supabase; `subir` hace el presign, el PUT y el insert con `url` público y `orden` correcto.

- [ ] **Step 2: Implementar.** (El `FotosUploader` no lleva test de componente en v1 — es interacción de archivos; se valida en el smoke manual.)

- [ ] **Step 3: Test verde + commit**

```bash
git add src/crm/services/fotos.service.js src/crm/components/FotosUploader.jsx src/crm/__tests__/fotos.service.test.js
git commit -m "$(printf 'feat(crm): subida de fotos de vehiculo a R2\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>')"
```

---

## Task 8: `FichaVehiculo` (tab Resumen)

**Files:**
- Create: `src/crm/components/FichaVehiculo.jsx`
- Test: `src/crm/__tests__/FichaVehiculo.test.jsx`

**Interfaces:**
- `<FichaVehiculo vehiculo={v} onCambiarEstado onArchivar onEliminar puedeEliminar />` — 
  - Hero: `GlassCard` con foto de portada (de `v.fotos`), o placeholder glass con la patente grande si no hay fotos.
  - `lineaSpecs(v)` en una fila; `precioFmt(v)` como titular (`font-display text-2xl`), moneda `text-ink-3`.
  - `Badge`s: estado, ITV, consignación, IVA.
  - Bloque dueño (nombre apellido, contacto), bloque nota.
  - Acciones: `Button` "Editar" (link `/crm/vehiculos/:id/editar`), `DropdownMenu` "Cambiar estado" (4 opciones), `Button variant="ghost"` "Archivar"; si `puedeEliminar` (admin) → `Button` rojo "Eliminar" con `Modal` de confirmación.

- [ ] **Step 1: Test (falla primero)** — con `vehiculo` sin `fotos` muestra la patente placeholder; con `puedeEliminar={false}` no renderiza "Eliminar"; click en una opción del menú de estado llama `onCambiarEstado(nuevo)`.

- [ ] **Step 2: Implementar.**

- [ ] **Step 3: Test verde + commit**

```bash
git add src/crm/components/FichaVehiculo.jsx src/crm/__tests__/FichaVehiculo.test.jsx
git commit -m "$(printf 'feat(crm): ficha de vehiculo (tab Resumen)\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>')"
```

---

## Task 9: `peritajes.service.js` + hooks

**Files:**
- Create: `src/crm/services/peritajes.service.js`, `src/crm/hooks/usePeritajes.js`
- Test: `src/crm/__tests__/peritajes.service.test.js`

**Interfaces:**
- `listarPorVehiculo(vehiculoId)` → `select('id, fecha, peritado_por, costo_total, items_ok, items_obs, items_falta, peritador:usuarios(nombre)').eq('vehiculo_id', ...).order('fecha', desc)`.
- `obtener(id)` → fila completa con `datos`.
- `crear({ vehiculoId, datos, fecha, resena, costo_total, peritadoPor })` → calcula `resumenPeritaje(datos)` (import de `peritajeSchema`), `insert` con `items_ok/obs/falta`; registra evento `entidad='vehiculo', entidad_id=vehiculoId, tipo='peritaje', datos:{ resumen }`.
- `actualizar(id, { datos, ... })` → recalcula resumen, `update`, evento.
- Hooks: `usePeritajes(vehiculoId)`, `usePeritaje(id)`, `usePeritajeMutations(vehiculoId)` (`crear`/`actualizar`, invalida `['crm','peritajes',vehiculoId]` + `['crm','eventos',vehiculoId]`).

- [ ] **Step 1: Test (falla primero)** — `crear` computa resumen desde `datos` y lo persiste; registra evento con `tipo:'peritaje'`.

- [ ] **Step 2: Implementar.**

- [ ] **Step 3: Test verde + commit**

```bash
git add src/crm/services/peritajes.service.js src/crm/hooks/usePeritajes.js src/crm/__tests__/peritajes.service.test.js
git commit -m "$(printf 'feat(crm): servicio y hooks de peritajes\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>')"
```

---

## Task 10: `PeritajeForm` + `PeritajeLectura` (tab Peritaje)

**Files:**
- Create: `src/crm/components/PeritajeForm.jsx`, `src/crm/components/PeritajeLectura.jsx`
- Test: `src/crm/__tests__/PeritajeForm.test.jsx`

**Interfaces:**
- `PeritajeLectura({ peritaje })` — recorre `PERITAJE_SECCIONES`; por ítem muestra `label` + valor; los `tipo:'estado'` con color (`text-success`/`text-amber`/`text-neifert`); `moneda` formateado; oculta ítems vacíos. `EstadoStrip` arriba con el resumen del peritaje.
- `PeritajeForm({ inicial?, onGuardar, guardando })` — estado local `datos` (objeto plano). Secciones colapsables (`<details>` o toggle propio) desde `PERITAJE_SECCIONES`. Por ítem según `tipo`:
  - `estado` → grupo de 4 botones (ok / obs / falta / na) glass, seleccionable.
  - `texto` → `Input` (o `textarea` para `obs*`).
  - `moneda` → `Input` numérico con prefijo `$`.
  - `porcentaje` → `Input` numérico 0–100 con sufijo `%`.
  - Campos meta arriba: `fecha` (`DatePicker`), `resena` (`textarea`), `peritado_por` (`Select` de `useCrmUsuarios`, default = usuario actual).
  - **Strip fijo** (`sticky top-0`) con `EstadoStrip` recalculado en vivo de `datos` (via `resumenPeritaje(datos)`).
  - Submit → `onGuardar({ datos, fecha, resena, peritadoPor, costo_total })`.

- [ ] **Step 1: Test (falla primero)** — cambiar un ítem `estado` a "falta" incrementa el conteo del strip (aria-label cambia); submit pasa `datos` con esa key en "falta".

- [ ] **Step 2: Implementar.**

- [ ] **Step 3: Test verde + build + commit**

```bash
git add src/crm/components/Peritaje{Form,Lectura}.jsx src/crm/__tests__/PeritajeForm.test.jsx
git commit -m "$(printf 'feat(crm): form y lectura de peritaje con EstadoStrip vivo\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>')"
```

---

## Task 11: Gestoría (`gestoria.service.js` + `useGestoria` + `GestoriaChecklist`)

**Files:**
- Create: `src/crm/services/gestoria.service.js`, `src/crm/hooks/useGestoria.js`, `src/crm/components/GestoriaChecklist.jsx`
- Test: `src/crm/__tests__/gestoria.service.test.js`, `src/crm/__tests__/GestoriaChecklist.test.jsx`

**Interfaces:**
- `obtenerPorVehiculo(vehiculoId)` → fila de `crm.gestoria` (o `null`).
- `guardarCampos(vehiculoId, parche)` → `upsert` sobre `crm.gestoria` con `vehiculo_id` (onConflict `vehiculo_id`) + `parche` (ej. `{ form08_hecho: true, form08_fecha: '2026-08-30', form08_por: <id> }`); el trigger recalcula `estado`. Registra evento `entidad='vehiculo', entidad_id=vehiculoId, tipo='gestoria', datos:{ campos: Object.keys(parche) }`.
- `useGestoria(vehiculoId)` + `useGestoriaMutations(vehiculoId)` (`guardarCampos`, invalida `['crm','gestoria',vehiculoId]` + eventos).
- `GestoriaChecklist({ vehiculoId })` — por cada `GESTORIA_ITEMS`: checkbox "hecho" (toggle → autosave `guardarCampos({ [k+'_hecho']: v, [k+'_fecha']: hoy si v, [k+'_por']: perfil.id })` + toast discreto), `DatePicker` fecha, `Input` nota (autosave on blur). `Badge` del `estado` general arriba. `DatePicker` fecha_inicio / fecha_cierre.

- [ ] **Step 1: Tests (fallan primero)**
  - `gestoria.service.test.js`: `guardarCampos` hace `upsert` con `vehiculo_id` + parche; registra evento `tipo:'gestoria'`.
  - `GestoriaChecklist.test.jsx`: togglear "Formulario 08" llama `guardarCampos` con `form08_hecho: true` y setea `form08_fecha`.

- [ ] **Step 2: Implementar.**

- [ ] **Step 3: Tests verde + commit**

```bash
git add src/crm/services/gestoria.service.js src/crm/hooks/useGestoria.js src/crm/components/GestoriaChecklist.jsx src/crm/__tests__/gestoria.service.test.js src/crm/__tests__/GestoriaChecklist.test.jsx
git commit -m "$(printf 'feat(crm): gestoria — checklist con autosave por item\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>')"
```

---

## Task 12: `HistorialTimeline` (tab Historial)

**Files:**
- Create: `src/crm/components/HistorialTimeline.jsx`
- Test: `src/crm/__tests__/HistorialTimeline.test.jsx`

**Interfaces:**
- `<HistorialTimeline vehiculoId />` — `useEventosVehiculo(vehiculoId)`; lista vertical; por evento: icono por `tipo` (`alta`→Plus, `edicion`→Pencil, `cambio_estado`→ArrowRight, `peritaje`→ClipboardCheck, `gestoria`→FileText, `archivado`→Archive, `foto`→Image), texto legible (`textoEvento(ev)` helper: `"{usuario} cambió el estado de {de} a {a}"`, `"{usuario} cargó el vehículo"`, etc.), fecha relativa (`date-fns` `formatDistanceToNow` con `locale es` — `date-fns` ya es dependencia). Empty state.

- [ ] **Step 1: Test (falla primero)** — con un evento `cambio_estado` `{de:'disponible',a:'reservado'}` renderiza un texto que contiene "disponible" y "reservado"; empty state cuando no hay eventos.

- [ ] **Step 2: Implementar** (incluí `textoEvento` como función exportada y testeala aparte si conviene).

- [ ] **Step 3: Test verde + commit**

```bash
git add src/crm/components/HistorialTimeline.jsx src/crm/__tests__/HistorialTimeline.test.jsx
git commit -m "$(printf 'feat(crm): timeline de historial del vehiculo\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>')"
```

---

## Task 13: `VehiculoDetallePage` + wiring de rutas

**Files:**
- Create: `src/crm/pages/VehiculoDetallePage.jsx`
- Modify: `src/routes/AppRouter.jsx`
- Delete: `src/crm/pages/VehiculosPlaceholderPage.jsx`
- Test: `src/crm/__tests__/VehiculoDetallePage.test.jsx`

**Interfaces:**
- `VehiculoDetallePage` — `useParams().id`; `useVehiculo(id)`; header con marca modelo + volver; `Tabs` (base-nova, re-estilado glass) con 4 paneles: **Resumen** (`FichaVehiculo`), **Peritaje** (lista `usePeritajes` + `EstadoStrip` por fila + botón "Nuevo peritaje" que abre `Modal` con `PeritajeForm`; abrir uno → `Modal` con `PeritajeLectura`), **Gestoría** (`GestoriaChecklist`), **Historial** (`HistorialTimeline`). Estado del tab activo en la URL (`?tab=`) o local.
- Rutas en `AppRouter.jsx` (dentro del grupo `CrmLayout` ya existente):

```jsx
<Route path="/crm/vehiculos" element={<VehiculosListPage />} />
<Route path="/crm/vehiculos/nuevo" element={<VehiculoNuevoPage />} />
<Route path="/crm/vehiculos/:id" element={<VehiculoDetallePage />} />
<Route path="/crm/vehiculos/:id/editar" element={<VehiculoEditarPage />} />
```

(reemplazá el `VehiculosPlaceholderPage`; agregá los `lazy(() => import(...))` correspondientes y borrá el del placeholder).

- [ ] **Step 1: Test (falla primero)** — con `useVehiculo` mockeado devolviendo un vehículo, renderiza las 4 pestañas y por defecto muestra el Resumen (marca del vehículo visible). Cambiar a "Historial" muestra el timeline.

- [ ] **Step 2: Implementar** la página + editar `AppRouter.jsx` + borrar el placeholder.

- [ ] **Step 3: `npm test` + `npm run build` + `npm run lint` (sin errores nuevos en `src/crm/**`) + commit**

```bash
git add src/crm/pages/VehiculoDetallePage.jsx src/routes/AppRouter.jsx src/crm/__tests__/VehiculoDetallePage.test.jsx
git rm src/crm/pages/VehiculosPlaceholderPage.jsx
git commit -m "$(printf 'feat(crm): pagina de detalle del vehiculo con pestanas + rutas\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>')"
```

---

## Task 14: Verificación end-to-end + RLS

**Files:**
- Create: `scripts/verificar-crm-rls.mjs` (integración, corre con `--env-file=.env`)

**Interfaces:** ninguno nuevo — valida lo construido.

- [ ] **Step 1: Script de verificación RLS**

`scripts/verificar-crm-rls.mjs`: usando `fetch` contra `${VITE_SUPABASE_URL}/auth/v1/token` + `/rest/v1` con `Accept-Profile: crm`:
1. login como `Bruno` (vendedor) → token.
2. `insert` un vehículo de prueba → 201.
3. `update` ese vehículo (cambiar `nota`) → 200.
4. `update` seteando `archivado_en` → 200.
5. `delete` ese vehículo → **403** (RLS: solo admin). 
6. `insert` en `crm.usuarios` → **403**.
7. login como `Cristian` (admin) → `delete` el vehículo de prueba → 200 (limpieza).
Imprime PASS/FAIL por punto; exit 1 si alguno falla.

- [ ] **Step 2: Correr**

Run: `node --env-file=.env scripts/verificar-crm-rls.mjs`
Expected: todos PASS.

- [ ] **Step 3: Smoke manual**

Run: `npm run dev` → `/crm` (login `Bruno`/`bruno321`):
- La lista muestra ~60 vehículos con filtros y búsqueda funcionando.
- Abrir un vehículo → 4 pestañas; Resumen con specs/precio; Peritaje muestra el/los peritajes migrados con su `EstadoStrip`; Gestoría muestra los trámites; Historial (probablemente vacío para los migrados).
- "Cargar vehículo" → alta → aparece en la lista (realtime).
- Editar un vehículo → cambio persiste.
- Cambiar estado desde la fila → `Badge` cambia.
- Como `Bruno`: "Eliminar" no aparece / falla; como `Cristian`: elimina.
- Toggle de tema claro/oscuro se ve bien en todo el módulo.

- [ ] **Step 4: Commit**

```bash
git add scripts/verificar-crm-rls.mjs
git commit -m "$(printf 'test(crm): verificacion RLS end-to-end del modulo vehiculos\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>')"
```

---

## Self-Review

**1. Cobertura del spec (§5 Módulo Vehículos + §6 estética):**

| Requisito | Task |
|---|---|
| §5.1 rutas `/crm/vehiculos[...]` | Task 13 |
| §5.2 lista: tabla/cards, búsqueda, filtros, orden, paginación, realtime, cambio rápido de estado | Task 3 (servicio+store), Task 5 |
| §5.3 alta/edición RHF+zod, secciones, fotos | Task 6 (form), Task 7 (fotos) |
| §5.4 detalle tab Resumen (FichaVehiculo, placa-placeholder, acciones, eliminar solo admin) | Task 8 |
| §5.4 tab Peritaje (lista + EstadoStrip + form largo con strip vivo + lectura) | Task 4 (strip), Task 9 (servicio), Task 10 (form/lectura), Task 13 (wiring) |
| §5.4 tab Gestoría (8 trámites, autosave, estado derivado) | Task 11 |
| §5.4 tab Historial (timeline de eventos) | Task 2 (servicio), Task 12 |
| §5.5 servicios y hooks (vehiculos, peritajes, gestoria, eventos, crmUsuarios) | Tasks 2, 3, 9, 11 (crmUsuarios ya existe de Plan 1) |
| §3.5 peritajeSchema completo + gestoriaSchema | Task 1 |
| §6 estética glass (common/*, --c-*, Sora), base-nova solo Tabs/DropdownMenu/Sheet | Global Constraints + todas las tasks de UI |
| §6 EstadoStrip elemento distintivo | Task 4 |
| §5 auditoría (eventos en cada mutación) | Tasks 2, 3, 9, 11 |
| RLS: vendedor no borra, no toca usuarios | Task 14 |

**2. Placeholder scan:** Task 3 marca `conPeritaje`/`gestoriaPendiente` como "filtro futuro" si el `exists` en PostgREST se complica — decisión explícita, no un placeholder de lógica. Task 1 trae el schema completo verbatim del HAR (no "completar después"). Ningún step de código sin su implementación o su fuente identificada.

**3. Consistencia de tipos:**
- `resumenPeritaje(datos) → { items_ok, items_obs, items_falta }` (Task 1) — mismas keys que las columnas `crm.peritajes` (Plan 1 Task 2) y que el `insert` de `peritajes.service.crear` (Task 9) y el `EstadoStrip` props `ok/obs/falta` (Task 4 los mapea).
- `eventos.registrar({ entidad, entidadId, tipo, datos, usuarioId })` (Task 2) — llamado con esa firma exacta desde `vehiculos.service` (Task 3), `peritajes.service` (Task 9), `gestoria.service` (Task 11). Peritaje y gestoría siempre con `entidad='vehiculo', entidadId=<vehiculoId>` → `listarDeVehiculo` (Task 2) con una sola query los trae.
- `useVehiculoMutations()` expone `{ crear, actualizar, cambiarEstado, archivar, desarchivar, eliminar }` (Task 3) — `FichaVehiculo` (Task 8) consume `onCambiarEstado`/`onArchivar`/`onEliminar`; `VehiculoTable` (Task 5) consume `onCambiarEstado`.
- `PERITAJE_SECCIONES` item shape `{ key, label, tipo }` (Task 1) — `PeritajeForm`/`PeritajeLectura` (Task 10) iteran exactamente eso; `tipo` ∈ `estado|texto|moneda|porcentaje`.
- `GESTORIA_ITEMS` `{ key, label }` (Task 1) — `GestoriaChecklist` (Task 11) arma `<key>_hecho/_fecha/_nota/_por` a partir de `key`, que matchean las columnas de `crm.gestoria` (Plan 1 Task 2).
- `formatVehiculo`: `estadoVariant(estado)` (Task 3) → string variant de `common/Badge` (`red|green|amber|neutral`), usado por Task 5 y Task 8.
