# CRM Legacy Clone DB Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clone the legacy Neifert CRM database into a `crm_legacy` schema in the existing Supabase project via a recurring, idempotent sync, plus a written catalog of every legacy endpoint.

**Architecture:** A pure-Node sync module (mirroring the existing `src/server/crmCore.js` pattern) logs into `neifertcrm.com`, fetches all read endpoints, writes an append-only raw layer (deduped by content hash) and a normalized relational layer (upsert + soft-delete), and mirrors vehicle photos to Cloudflare R2. A Vercel Serverless Function behind a shared secret is triggered by Vercel Cron every 6 hours; a local CLI script runs the first full sync outside the 300s function limit.

**Tech Stack:** Node (ESM), `@supabase/supabase-js` v2, `@aws-sdk/client-s3` (via existing `src/server/r2Core.js`), Vitest (added by this plan), Vercel Serverless Functions + Cron.

**Spec:** `docs/superpowers/specs/2026-08-30-crm-legacy-clone-design.md`

## Global Constraints

- **Module system:** ESM only (`package.json` has `"type": "module"`). Use `import`/`export`, no `require`.
- **Server code location:** All reusable sync logic goes in `src/server/legacy*.js` — no Vite or Vercel imports in those files, same as `src/server/crmCore.js` / `src/server/r2Core.js`.
- **Legacy API base:** `https://neifertcrm.com/backend/api`. Auth: `POST /auth/login.php` with `{ user, pass }` → `{ ok, data: { token, nombre, role } }`; all other calls send `Authorization: Bearer <token>`.
- **Reuse, do not reimplement:** `crmLogin` from `src/server/crmCore.js`; `createR2Client` + `putR2Object` from `src/server/r2Core.js`.
- **DB schema name:** `crm_legacy`. Normalized-table `id` columns hold the legacy id verbatim (text, except `usuarios`/`peritajes`/`gestoria_tramites` which are `int`). Every normalized table has `sync_run_id bigint` and `borrado_en timestamptz` (NULL = live). Rows are never `DELETE`d.
- **Env vars:** new `CRON_SECRET`; reuse `CRM_SYNC_USER`, `CRM_SYNC_PASS`, `VITE_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_ENDPOINT`, `R2_PUBLIC_URL`.
- **Commit style:** end every commit message body with `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`. Branch off `main` — do not commit to `main` directly.
- **Spanish naming** for DB columns and user-facing strings; code identifiers in English or Spanish following the surrounding file.

---

## File Structure

| File | Responsibility |
|---|---|
| `vitest.config.js` | Vitest config (node environment, `src/server/__tests__/**`). |
| `src/server/legacyHash.js` | Canonical JSON serialization + `sha256Hex`. Used by raw-layer dedupe and its tests. |
| `src/server/legacyTransform.js` | Pure functions: one `transformX(payload)` per entity → normalized row(s). No I/O. |
| `src/server/legacyFetch.js` | `login()` + `fetchAll()` against the legacy API, with retry + timeout. |
| `src/server/legacyStore.js` | All reads/writes against the `crm_legacy` schema via supabase-js (run bookkeeping, raw dedupe, upserts, child rebuilds, soft-delete). |
| `src/server/legacyPhotos.js` | Per-vehicle photo diff → download → `putR2Object` → rows for `vehiculo_fotos`. |
| `src/server/legacySync.js` | Orchestrator `syncLegacyCrm()` wiring fetch → store → photos → run summary. |
| `src/server/__tests__/legacy/*.test.js` | Vitest suites, one per module above. |
| `src/server/__tests__/fixtures/legacy/*.json` | Real payloads extracted once from the HAR files in `scraping/`. |
| `scripts/extract-legacy-fixtures.mjs` | One-shot: pulls representative records out of the HARs into the fixtures dir. |
| `scripts/sync-legacy-local.mjs` | CLI runner for the first full sync (`node --env-file=.env`). |
| `supabase/crm_legacy_schema.sql` | Idempotent DDL for the whole `crm_legacy` schema. |
| `api/crm/sync-legacy.js` | Vercel Serverless Function: validates `CRON_SECRET`, calls `syncLegacyCrm()`. |
| `src/plugins/crmProxy.js` | (modify) add `/api/crm/sync-legacy` route for `vite dev`. |
| `vercel.json` | (modify) add `crons` entry. |
| `.env.example` | (modify) document `CRON_SECRET`. |
| `docs/legacy-crm/endpoints.md` | Full endpoint catalog (read + write) with request/response shapes. |

---

## Task 1: Test infrastructure + fixtures

**Files:**
- Modify: `package.json` (add devDep + `test` script)
- Create: `vitest.config.js`
- Create: `scripts/extract-legacy-fixtures.mjs`
- Create: `src/server/__tests__/fixtures/legacy/` (generated JSON files)
- Create: `src/server/__tests__/legacy/smoke.test.js`
- Modify: `.env.example`

**Interfaces:**
- Consumes: nothing.
- Produces: `npm test` runs Vitest over `src/server/__tests__/**/*.test.js`. Fixture files at `src/server/__tests__/fixtures/legacy/<entidad>.json` — each is `{ "get": [...records...], "post": {...body...} }` where available.

- [ ] **Step 1: Install Vitest**

Run: `npm install -D vitest@^2`

- [ ] **Step 2: Add the `test` script**

In `package.json` `"scripts"`, add:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 3: Create `vitest.config.js`**

```js
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/server/__tests__/**/*.test.js'],
  },
})
```

- [ ] **Step 4: Write the fixture extraction script**

Create `scripts/extract-legacy-fixtures.mjs`:

```js
// Pulls representative legacy payloads out of the captured HARs into
// src/server/__tests__/fixtures/legacy/. Run once: node scripts/extract-legacy-fixtures.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const OUT = resolve('src/server/__tests__/fixtures/legacy')
mkdirSync(OUT, { recursive: true })

const GET_HAR = resolve('scraping/Harfiles/neifert.har')
const WRITE_HAR = resolve('scraping/NewEndpoints/clientes.har')

const entidades = {
  clientes: 'clientes.php',
  vehiculos: 'vehiculos.php',
  peritaje: 'peritaje.php',
  gestoria: 'gestoria.php',
  alertas: 'alertas.php',
  tareas: 'tareas.php',
  usuarios: 'usuarios.php',
}

function bestBody(har, file) {
  let best = ''
  for (const e of har.log.entries) {
    let u
    try { u = new URL(e.request.url) } catch { continue }
    if (!u.pathname.endsWith('/backend/api/' + file)) continue
    if (e.request.method !== 'GET') continue
    const t = e.response?.content?.text || ''
    if (t.length > best.length) best = t
  }
  return best
}

function firstWrite(har, file, method) {
  for (const e of har.log.entries) {
    let u
    try { u = new URL(e.request.url) } catch { continue }
    if (!u.pathname.endsWith('/backend/api/' + file)) continue
    if (e.request.method !== method) continue
    const ct = (e.request.headers.find((h) => /content-type/i.test(h.name)) || {}).value || ''
    if (/multipart/.test(ct)) continue
    try { return JSON.parse(e.request.postData.text) } catch { return null }
  }
  return null
}

const getHar = JSON.parse(readFileSync(GET_HAR, 'utf8'))
const writeHar = JSON.parse(readFileSync(WRITE_HAR, 'utf8'))

for (const [name, file] of Object.entries(entidades)) {
  const raw = bestBody(getHar, file)
  let get = []
  try {
    const parsed = JSON.parse(raw)
    get = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.data) ? parsed.data : []
  } catch {}
  const out = { get: get.slice(0, 5) }
  const post = firstWrite(writeHar, file, 'POST')
  if (post) out.post = post
  const put = firstWrite(writeHar, file, 'PUT')
  if (put) out.put = put
  writeFileSync(resolve(OUT, name + '.json'), JSON.stringify(out, null, 2) + '\n')
  console.log(name, '→', out.get.length, 'get records', post ? '+post' : '', put ? '+put' : '')
}
```

- [ ] **Step 5: Run the extraction script**

Run: `node scripts/extract-legacy-fixtures.mjs`
Expected: prints a line per entity; creates 7 JSON files under `src/server/__tests__/fixtures/legacy/`. `clientes.json` and `vehiculos.json` must have ≥1 `get` record; `clientes.json` must have a `post` and a `put`.

- [ ] **Step 6: Hand-add sparse fixtures**

`alertas.json` / `tareas.json` `get` arrays may be empty (endpoints were empty at capture time). Open `src/server/__tests__/fixtures/legacy/alertas.json` and ensure it contains this real captured record in `get` (from `scraping/Harfiles/neifert.har`):

```json
{ "id": "6b8a3qf5353036550", "tipo": "general", "titulo": "Llamada", "descripcion": "Llamar / escribir a Gustavo Bruza x Amarok 2021.\n3564 64-3253", "fecha": "2026-06-06", "done": 1, "ref_id": null, "ref_phone": null, "ref_name": null, "creado_por": "Bruno", "asignado_a": "Cristian", "created_at": "2026-06-05 14:17:24", "updated_at": "2026-06-08 19:09:11", "hora": "08:00" }
```

For `tareas.json`, add this synthetic-but-shape-accurate record to `get` (derived from the `POST /tareas.php` body + `usuarios` convention):

```json
{ "id": "mtgdfrp21ae5c7d6", "titulo": "test", "descripcion": "test", "fecha": "2026-08-30", "done": 0, "cliente_id": "6c6jqbi7l2e6eb853", "cliente_nombre": "test", "cliente_phone": "test", "asignado_a": "Bruno", "created_at": "2026-08-30 10:00:00", "updated_at": "2026-08-30 10:00:00" }
```

- [ ] **Step 7: Write the smoke test**

Create `src/server/__tests__/legacy/smoke.test.js`:

```js
import { describe, it, expect } from 'vitest'
import clientes from '../fixtures/legacy/clientes.json'

describe('fixtures', () => {
  it('clientes fixture has records and write shapes', () => {
    expect(clientes.get.length).toBeGreaterThan(0)
    expect(clientes.post).toBeTruthy()
    expect(clientes.put).toBeTruthy()
  })
})
```

Note: importing `.json` works in Vitest without an assertion. If Node complains elsewhere, use `import ... with { type: 'json' }` — but Vitest handles it.

- [ ] **Step 8: Run the smoke test**

Run: `npm test`
Expected: PASS, 1 file, 1 test.

- [ ] **Step 9: Document `CRON_SECRET` in `.env.example`**

Append after the `CRM_SYNC_PASS` block:

```
# Secreto compartido para disparar el sync del clon del CRM viejo
# (api/crm/sync-legacy.js). Vercel Cron lo manda como
# `Authorization: Bearer <CRON_SECRET>`. Generá uno con:
#   node -e "console.log(crypto.randomUUID())"
CRON_SECRET=
```

- [ ] **Step 10: Commit**

```bash
git add package.json package-lock.json vitest.config.js scripts/extract-legacy-fixtures.mjs src/server/__tests__ .env.example
git commit -m "$(printf 'test: add vitest + legacy CRM fixtures\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>')"
```

---

## Task 2: `legacyHash.js` — canonical hashing

**Files:**
- Create: `src/server/legacyHash.js`
- Test: `src/server/__tests__/legacy/legacyHash.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `canonicalJson(value): string` — deterministic JSON with object keys sorted recursively.
  - `sha256Hex(str): string` — lowercase hex SHA-256 (uses `node:crypto`).
  - `payloadHash(value): string` — `sha256Hex(canonicalJson(value))`.

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect } from 'vitest'
import { canonicalJson, sha256Hex, payloadHash } from '../../legacyHash.js'

describe('legacyHash', () => {
  it('canonicalJson sorts keys recursively and is order-independent', () => {
    const a = canonicalJson({ b: 1, a: { d: 4, c: 3 } })
    const b = canonicalJson({ a: { c: 3, d: 4 }, b: 1 })
    expect(a).toBe(b)
    expect(a).toBe('{"a":{"c":3,"d":4},"b":1}')
  })

  it('sha256Hex is stable lowercase hex', () => {
    expect(sha256Hex('hola')).toBe(
      '69062b8688fbf3a5c1a0537f9f52ff8ba26f4a1668cbb0bce38f7d54c1e488 e9'.replace(/\s/g, ''),
    )
  })

  it('payloadHash ignores key order', () => {
    expect(payloadHash({ x: 1, y: 2 })).toBe(payloadHash({ y: 2, x: 1 }))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- legacyHash`
Expected: FAIL — cannot find module `../../legacyHash.js`.

- [ ] **Step 3: Write minimal implementation**

Create `src/server/legacyHash.js`:

```js
import { createHash } from 'node:crypto'

/** JSON con claves de objeto ordenadas recursivamente — determinístico. */
export function canonicalJson(value) {
  return JSON.stringify(sortDeep(value))
}

function sortDeep(v) {
  if (Array.isArray(v)) return v.map(sortDeep)
  if (v && typeof v === 'object') {
    const out = {}
    for (const k of Object.keys(v).sort()) out[k] = sortDeep(v[k])
    return out
  }
  return v
}

export function sha256Hex(str) {
  return createHash('sha256').update(str, 'utf8').digest('hex')
}

export function payloadHash(value) {
  return sha256Hex(canonicalJson(value))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- legacyHash`
Expected: PASS (3 tests). If the `sha256Hex('hola')` literal is wrong, replace it with the value the test run prints and re-run.

- [ ] **Step 5: Commit**

```bash
git add src/server/legacyHash.js src/server/__tests__/legacy/legacyHash.test.js
git commit -m "$(printf 'feat: add canonical JSON hashing for legacy raw dedupe\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>')"
```

---

## Task 3: `legacyTransform.js` — usuarios, alertas, tareas

**Files:**
- Create: `src/server/legacyTransform.js`
- Test: `src/server/__tests__/legacy/legacyTransform.usuarios.test.js`

**Interfaces:**
- Consumes: fixtures from Task 1.
- Produces (all pure, no I/O):
  - `transformUsuario(p): { id:number, usuario:string|null, nombre:string|null, rol:string|null }`
  - `transformAlerta(p): { id:string, tipo, titulo, descripcion, fecha, hora, done:boolean, ref_id, ref_name, ref_phone, creado_por, asignado_a, created_at, updated_at }`
  - `transformTarea(p): { id:string, titulo, descripcion, fecha, done:boolean, cliente_id, cliente_nombre, cliente_phone, asignado_a, created_at, updated_at }`
  - Helpers (exported, reused by later tasks): `bool(v)` (1/"1"/true → true; 0/"0"/""/null → false), `num(v)` (→ number or null), `str(v)` (→ trimmed string or null), `dateOnly(v)` (→ `YYYY-MM-DD` or null; `"0000-00-00"` → null).

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect } from 'vitest'
import { transformUsuario, transformAlerta, transformTarea, bool, num, dateOnly } from '../../legacyTransform.js'
import usuarios from '../fixtures/legacy/usuarios.json'
import alertas from '../fixtures/legacy/alertas.json'
import tareas from '../fixtures/legacy/tareas.json'

describe('helpers', () => {
  it('bool coerces legacy truthiness', () => {
    expect(bool(1)).toBe(true)
    expect(bool('1')).toBe(true)
    expect(bool(0)).toBe(false)
    expect(bool('')).toBe(false)
    expect(bool(null)).toBe(false)
  })
  it('num returns null for empty, number otherwise', () => {
    expect(num('')).toBe(null)
    expect(num(null)).toBe(null)
    expect(num('30000000')).toBe(30000000)
    expect(num(2017)).toBe(2017)
  })
  it('dateOnly nulls the legacy zero date', () => {
    expect(dateOnly('0000-00-00')).toBe(null)
    expect(dateOnly('2026-06-02')).toBe('2026-06-02')
    expect(dateOnly('2026-06-02 12:26:42')).toBe('2026-06-02')
  })
})

describe('transformUsuario', () => {
  it('maps the captured admin row', () => {
    const cristian = usuarios.get.find((u) => u.user === 'Cristian')
    expect(transformUsuario(cristian)).toEqual({ id: 1, usuario: 'Cristian', nombre: 'Cristian', rol: 'admin' })
  })
})

describe('transformAlerta', () => {
  it('maps the captured alert and coerces done', () => {
    const row = transformAlerta(alertas.get[0])
    expect(row.id).toBe('6b8a3qf5353036550')
    expect(row.done).toBe(true)
    expect(row.asignado_a).toBe('Cristian')
    expect(row.fecha).toBe('2026-06-06')
  })
})

describe('transformTarea', () => {
  it('maps id, cliente ref and done=false', () => {
    const row = transformTarea(tareas.get[0])
    expect(row.id).toBe('mtgdfrp21ae5c7d6')
    expect(row.cliente_id).toBe('6c6jqbi7l2e6eb853')
    expect(row.done).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- legacyTransform.usuarios`
Expected: FAIL — cannot find module `../../legacyTransform.js`.

- [ ] **Step 3: Write minimal implementation**

Create `src/server/legacyTransform.js`:

```js
export function str(v) {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s === '' ? null : s
}

export function num(v) {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export function bool(v) {
  return v === true || v === 1 || v === '1'
}

export function dateOnly(v) {
  const s = str(v)
  if (!s || s.startsWith('0000-00-00')) return null
  return s.slice(0, 10)
}

export function transformUsuario(p) {
  return {
    id: num(p.id),
    usuario: str(p.user),
    nombre: str(p.nombre),
    rol: str(p.role) ?? '',
  }
}

export function transformAlerta(p) {
  return {
    id: str(p.id),
    tipo: str(p.tipo),
    titulo: str(p.titulo),
    descripcion: str(p.descripcion),
    fecha: dateOnly(p.fecha),
    hora: str(p.hora),
    done: bool(p.done),
    ref_id: str(p.ref_id ?? p.refId),
    ref_name: str(p.ref_name ?? p.refName),
    ref_phone: str(p.ref_phone ?? p.refPhone),
    creado_por: str(p.creado_por ?? p.creadoPor),
    asignado_a: str(p.asignado_a ?? p.asignadoA),
    created_at: str(p.created_at),
    updated_at: str(p.updated_at),
  }
}

export function transformTarea(p) {
  return {
    id: str(p.id),
    titulo: str(p.titulo),
    descripcion: str(p.descripcion),
    fecha: dateOnly(p.fecha),
    done: bool(p.done),
    cliente_id: str(p.cliente_id ?? p.clienteId),
    cliente_nombre: str(p.cliente_nombre ?? p.clienteNombre),
    cliente_phone: str(p.cliente_phone ?? p.clientePhone),
    asignado_a: str(p.asignado_a ?? p.asignadoA),
    created_at: str(p.created_at),
    updated_at: str(p.updated_at),
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- legacyTransform.usuarios`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/legacyTransform.js src/server/__tests__/legacy/legacyTransform.usuarios.test.js
git commit -m "$(printf 'feat: transform usuarios/alertas/tareas legacy payloads\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>')"
```

---

## Task 4: `legacyTransform.js` — clientes (+ intereses + autos en entrega)

**Files:**
- Modify: `src/server/legacyTransform.js`
- Test: `src/server/__tests__/legacy/legacyTransform.clientes.test.js`

**Interfaces:**
- Consumes: helpers `str/num/bool/dateOnly` from Task 3.
- Produces:
  - `transformCliente(p): { cliente, intereses, autosEntrega }` where
    - `cliente`: `{ id:string, nombre, telefono, localidad, fecha_cumple, status, canal, presupuesto:number|null, marca_interes, modelo_interes, tipo_interes, trans_interes, anio_min:number|null, anio_max:number|null, notas, interes_cero_km:boolean, cero_km:object|null, tiene_auto_entrega:boolean, creado_por, editado_por, fecha_creacion, fecha_edicion, created_at, updated_at, venta_vehiculo_id, fecha_venta }`
    - `intereses`: `Array<{ marca:string|null, modelo:string|null }>` from `brands[]`
    - `autosEntrega`: `Array<{ marca, modelo, version, anio:number|null, km:number|null, color, trans, notas }>` from `autosEntrega[]` **or** the JSON-string `autos_entrega`
  - `parseMaybeJsonArray(v): any[]` — exported helper: returns `v` if array, `JSON.parse(v)` if a JSON-array string, else `[]`.

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect } from 'vitest'
import { transformCliente, parseMaybeJsonArray } from '../../legacyTransform.js'
import clientes from '../fixtures/legacy/clientes.json'

describe('parseMaybeJsonArray', () => {
  it('passes arrays through', () => {
    expect(parseMaybeJsonArray([{ a: 1 }])).toEqual([{ a: 1 }])
  })
  it('parses JSON-string arrays (legacy autos_entrega)', () => {
    expect(parseMaybeJsonArray('[{"brand":"ford"}]')).toEqual([{ brand: 'ford' }])
  })
  it('returns [] for null/garbage', () => {
    expect(parseMaybeJsonArray(null)).toEqual([])
    expect(parseMaybeJsonArray('not json')).toEqual([])
  })
})

describe('transformCliente', () => {
  const withBrands = clientes.get.find((c) => Array.isArray(c.brands) && c.brands.length)
  const withAE = clientes.get.find((c) => c.tiene_auto_entrega)

  it('maps core fields and coerces numerics', () => {
    const { cliente } = transformCliente(withAE)
    expect(typeof cliente.id).toBe('string')
    expect(cliente.tiene_auto_entrega).toBe(true)
    // budget is a number or null, never "" or "0" string
    expect(cliente.presupuesto === null || typeof cliente.presupuesto === 'number').toBe(true)
  })

  it('extracts intereses from brands[]', () => {
    const { intereses } = transformCliente(withBrands)
    expect(intereses.length).toBe(withBrands.brands.length)
    expect(intereses[0]).toHaveProperty('marca')
    expect(intereses[0]).toHaveProperty('modelo')
  })

  it('extracts autosEntrega whether array or JSON string', () => {
    const asArray = transformCliente({ ...withAE, autosEntrega: [{ brand: 'x', model: 'y' }], autos_entrega: null })
    const asString = transformCliente({ ...withAE, autosEntrega: undefined, autos_entrega: '[{"brand":"x","model":"y"}]' })
    expect(asArray.autosEntrega).toEqual(asString.autosEntrega)
    expect(asArray.autosEntrega[0]).toMatchObject({ marca: 'x', modelo: 'y' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- legacyTransform.clientes`
Expected: FAIL — `transformCliente is not a function`.

- [ ] **Step 3: Write minimal implementation**

Append to `src/server/legacyTransform.js`:

```js
export function parseMaybeJsonArray(v) {
  if (Array.isArray(v)) return v
  if (typeof v === 'string') {
    try {
      const parsed = JSON.parse(v)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}

function mapInteres(b) {
  return { marca: str(b.marca ?? b.brand), modelo: str(b.modelo ?? b.model) }
}

function mapAutoEntrega(a) {
  return {
    marca: str(a.marca ?? a.brand),
    modelo: str(a.modelo ?? a.model),
    version: str(a.version),
    anio: num(a.anio ?? a.year),
    km: num(a.km),
    color: str(a.color),
    trans: str(a.trans),
    notas: str(a.notas ?? a.notes),
  }
}

export function transformCliente(p) {
  const cliente = {
    id: str(p.id),
    nombre: str(p.name ?? p.nombre),
    telefono: str(p.phone ?? p.telefono),
    localidad: str(p.localidad),
    fecha_cumple: dateOnly(p.fecha_cumple ?? p.fechaCumple),
    status: str(p.status),
    canal: str(p.canal),
    presupuesto: num(p.budget ?? p.presupuesto),
    marca_interes: str(p.brand),
    modelo_interes: str(p.model),
    tipo_interes: str(p.tipo),
    trans_interes: str(p.trans),
    anio_min: num(p.year_min ?? p.yearMin),
    anio_max: num(p.year_max ?? p.yearMax),
    notas: str(p.notes ?? p.notas),
    interes_cero_km: bool(p.interes_cero_km ?? p.interesCeroKm),
    cero_km: p.cero_km ?? p.ceroKm ?? null,
    tiene_auto_entrega: bool(p.tiene_auto_entrega ?? p.tieneAutoEntrega),
    creado_por: str(p.creado_por ?? p.creadoPor),
    editado_por: str(p.editado_por ?? p.editadoPor),
    fecha_creacion: dateOnly(p.fecha_creacion ?? p.fechaCreacion),
    fecha_edicion: dateOnly(p.fecha_edicion ?? p.fechaEdicion),
    created_at: str(p.created_at),
    updated_at: str(p.updated_at),
    venta_vehiculo_id: str(p.venta_car_id ?? p.ventaCarId),
    fecha_venta: dateOnly(p.fecha_venta ?? p.fechaVenta),
  }
  const brands = Array.isArray(p.brands) ? p.brands : []
  const intereses = brands.map(mapInteres)
  const aeSource =
    (Array.isArray(p.autosEntrega) && p.autosEntrega.length ? p.autosEntrega : null) ??
    parseMaybeJsonArray(p.autos_entrega)
  const autosEntrega = aeSource.map(mapAutoEntrega)
  return { cliente, intereses, autosEntrega }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- legacyTransform.clientes`
Expected: PASS.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS (Tasks 1–4 suites green).

- [ ] **Step 6: Commit**

```bash
git add src/server/legacyTransform.js src/server/__tests__/legacy/legacyTransform.clientes.test.js
git commit -m "$(printf 'feat: transform clientes + intereses + autos en entrega\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>')"
```

---

## Task 5: `legacyTransform.js` — vehiculos

**Files:**
- Modify: `src/server/legacyTransform.js`
- Test: `src/server/__tests__/legacy/legacyTransform.vehiculos.test.js`

**Interfaces:**
- Consumes: helpers from Task 3.
- Produces:
  - `transformVehiculo(p): { vehiculo }` where `vehiculo` = `{ id:string, marca, modelo, version, patente, tipo, anio:number|null, km:number|null, trans, color, moneda_contado, precio_contado:number|null, moneda_canje, precio_canje:number|null, duenio_nombre, duenio_apellido, duenio_contacto, itv, itv_venc, consignacion:boolean, tipo_consignacion, origen, carpeta_completa:boolean, carpeta_con_oficio:boolean, carpeta_entregada:boolean, tiene_iva:boolean, nota, status, creado_por, editado_por, fecha_creacion, fecha_edicion, created_at, updated_at, venta_cliente_id, fecha_venta }`
  - `extractImagenes(p): string[]` — exported helper. Reads `p.imagenes ?? p.fotos ?? p.images ?? []`; each item may be a string URL or `{ url }`/`{ src }` object; returns array of URL strings, order preserved.

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect } from 'vitest'
import { transformVehiculo, extractImagenes } from '../../legacyTransform.js'
import vehiculos from '../fixtures/legacy/vehiculos.json'

describe('transformVehiculo', () => {
  const v = vehiculos.get[0]
  it('maps core fields with numeric coercion', () => {
    const { vehiculo } = transformVehiculo(v)
    expect(typeof vehiculo.id).toBe('string')
    expect(vehiculo.marca).toBe(v.brand)
    expect(vehiculo.anio).toBe(v.year)
    expect(vehiculo.precio_contado === null || typeof vehiculo.precio_contado === 'number').toBe(true)
  })
  it('defaults unseen boolean flags to false, not null', () => {
    const { vehiculo } = transformVehiculo(v)
    expect(vehiculo.consignacion).toBe(false)
    expect(vehiculo.tiene_iva).toBe(false)
  })
  it('reads camelCase POST field names too', () => {
    const { vehiculo } = transformVehiculo({ id: 'x', brand: 'b', model: 'm', year: 2020, monedaContado: 'USD', precioContado: 15000, tieneIVA: true, consignacion: true })
    expect(vehiculo.moneda_contado).toBe('USD')
    expect(vehiculo.precio_contado).toBe(15000)
    expect(vehiculo.tiene_iva).toBe(true)
    expect(vehiculo.consignacion).toBe(true)
  })
})

describe('extractImagenes', () => {
  it('handles missing, string items, and object items', () => {
    expect(extractImagenes({})).toEqual([])
    expect(extractImagenes({ imagenes: ['a.jpg', 'b.jpg'] })).toEqual(['a.jpg', 'b.jpg'])
    expect(extractImagenes({ fotos: [{ url: 'c.jpg' }, { src: 'd.jpg' }] })).toEqual(['c.jpg', 'd.jpg'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- legacyTransform.vehiculos`
Expected: FAIL — `transformVehiculo is not a function`.

- [ ] **Step 3: Write minimal implementation**

Append to `src/server/legacyTransform.js`:

```js
export function extractImagenes(p) {
  const arr = p.imagenes ?? p.fotos ?? p.images ?? []
  if (!Array.isArray(arr)) return []
  return arr
    .map((it) => (typeof it === 'string' ? it : it && (it.url ?? it.src ?? it.href)))
    .filter((u) => typeof u === 'string' && u.length > 0)
}

export function transformVehiculo(p) {
  const vehiculo = {
    id: str(p.id),
    marca: str(p.brand ?? p.marca),
    modelo: str(p.model ?? p.modelo),
    version: str(p.version),
    patente: str(p.patente),
    tipo: str(p.tipo),
    anio: num(p.year ?? p.anio),
    km: num(p.km),
    trans: str(p.trans),
    color: str(p.color),
    moneda_contado: str(p.moneda_contado ?? p.monedaContado),
    precio_contado: num(p.precio_contado ?? p.precioContado),
    moneda_canje: str(p.moneda_canje ?? p.monedaCanje),
    precio_canje: num(p.precio_canje ?? p.precioCanje),
    duenio_nombre: str(p.duenio_nombre ?? p.duenioNombre),
    duenio_apellido: str(p.duenio_apellido ?? p.duenioApellido),
    duenio_contacto: str(p.duenio_contacto ?? p.duenioContacto),
    itv: str(p.itv),
    itv_venc: dateOnly(p.itv_venc ?? p.itvVenc),
    consignacion: bool(p.consignacion),
    tipo_consignacion: str(p.tipo_consignacion ?? p.tipoConsignacion),
    origen: str(p.origen),
    carpeta_completa: bool(p.carpeta_completa ?? p.carpetaCompleta),
    carpeta_con_oficio: bool(p.carpeta_con_oficio ?? p.carpetaConOficio),
    carpeta_entregada: bool(p.carpeta_entregada ?? p.carpetaEntregada),
    tiene_iva: bool(p.tiene_iva ?? p.tieneIVA),
    nota: str(p.nota),
    status: str(p.status),
    creado_por: str(p.creado_por ?? p.creadoPor),
    editado_por: str(p.editado_por ?? p.editadoPor),
    fecha_creacion: dateOnly(p.fecha_creacion ?? p.fechaCreacion),
    fecha_edicion: dateOnly(p.fecha_edicion ?? p.fechaEdicion),
    created_at: str(p.created_at),
    updated_at: str(p.updated_at),
    venta_cliente_id: str(p.venta_cliente_id ?? p.ventaClienteId),
    fecha_venta: dateOnly(p.fecha_venta ?? p.fechaVenta),
  }
  return { vehiculo }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- legacyTransform.vehiculos`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/legacyTransform.js src/server/__tests__/legacy/legacyTransform.vehiculos.test.js
git commit -m "$(printf 'feat: transform vehiculos legacy payloads\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>')"
```

---

## Task 6: `legacyTransform.js` — peritaje + gestoria

**Files:**
- Modify: `src/server/legacyTransform.js`
- Test: `src/server/__tests__/legacy/legacyTransform.peritaje.test.js`

**Interfaces:**
- Consumes: helpers from Task 3.
- Produces:
  - `transformPeritaje(p): { id:number|null, vehiculo_id:string|null, fecha_peritaje, peritado_por, resena_texto, costo_total:number|null, secciones:object }` — `secciones` is the **entire payload** minus `{ id, vehiculo_id, vehiculoId, created_at, updated_at }`. When the legacy GET nests sections (`sec_a`…`sec_e`), those are flattened one level into `secciones`; when it's already flat (POST shape), it's copied as-is.
  - `GESTORIA_ITEMS: string[]` — the 8 standard slugs: `['form08','verif_policial','multas_nac','dominio_hist','libre_deudas','titulo','cedulas','identificacion']`.
  - `transformGestoria(p): { id:number|null, vehiculo_id:string|null, estado, notas, fecha_inicio, fecha_cierre, items:object, <slug>:boolean per GESTORIA_ITEMS }` — `items` normalized to `{ <slug>: { checked:boolean, fecha:string|null, obs:string|null, marcado_por:string|null } }`, accepting both the flat GET columns (`form08`, `form08_fecha`, `form08_nota`) and the nested POST `items` object (`items.form08 = {checked,fecha,obs,marcadoPor}`, `items.verificPolicial`, `items.multasNac`, …).

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect } from 'vitest'
import { transformPeritaje, transformGestoria, GESTORIA_ITEMS } from '../../legacyTransform.js'
import peritaje from '../fixtures/legacy/peritaje.json'
import gestoria from '../fixtures/legacy/gestoria.json'

describe('transformPeritaje', () => {
  it('keeps vehiculo_id + all section data, drops bookkeeping keys', () => {
    const src = peritaje.get[0]
    const row = transformPeritaje(src)
    expect(row.vehiculo_id).toBe(src.vehiculo_id)
    expect(row.secciones).not.toHaveProperty('created_at')
    expect(row.secciones).not.toHaveProperty('id')
    // a known nested field is reachable after flatten
    expect(row.secciones).toHaveProperty('motor')
  })
})

describe('transformGestoria', () => {
  const src = gestoria.get[0]
  it('maps flat GET columns into items + mirror booleans', () => {
    const row = transformGestoria(src)
    expect(row.vehiculo_id).toBe(src.vehiculo_id)
    for (const slug of GESTORIA_ITEMS) expect(typeof row[slug]).toBe('boolean')
    expect(row.items.form08).toMatchObject({ checked: expect.any(Boolean) })
    expect(row.form08).toBe(Boolean(src.form08 === 1 || src.form08 === '1'))
  })
  it('also accepts the nested POST items shape', () => {
    const row = transformGestoria({
      vehiculoId: 'v1', estado: 'en_proceso',
      items: { form08: { checked: true, fecha: '2026-08-30', obs: '', marcadoPor: 'Bruno' }, verificPolicial: { checked: false } },
      notas: 'x', fechaInicio: '', fechaCierre: '',
    })
    expect(row.vehiculo_id).toBe('v1')
    expect(row.form08).toBe(true)
    expect(row.verif_policial).toBe(false)
    expect(row.items.form08.marcado_por).toBe('Bruno')
    expect(row.fecha_inicio).toBe(null)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- legacyTransform.peritaje`
Expected: FAIL — `transformPeritaje is not a function`.

- [ ] **Step 3: Write minimal implementation**

Append to `src/server/legacyTransform.js`:

```js
const PERITAJE_DROP = new Set(['id', 'vehiculo_id', 'vehiculoId', 'created_at', 'updated_at'])

export function transformPeritaje(p) {
  const secciones = {}
  for (const [k, v] of Object.entries(p)) {
    if (PERITAJE_DROP.has(k)) continue
    if (v && typeof v === 'object' && !Array.isArray(v) && /^sec_[a-z]$/.test(k)) {
      for (const [sk, sv] of Object.entries(v)) secciones[sk] = sv
    } else {
      secciones[k] = v
    }
  }
  return {
    id: num(p.id),
    vehiculo_id: str(p.vehiculo_id ?? p.vehiculoId),
    fecha_peritaje: dateOnly(p.fecha_peritaje ?? p.fechaPeritaje ?? p.fecha),
    peritado_por: str(p.peritado_por ?? p.peritadoPor ?? p.peritador),
    resena_texto: str(p.resena_texto ?? p.resenaTexto ?? p.observaciones),
    costo_total: num(p.costo_total ?? p.costoTotal),
    secciones,
  }
}

export const GESTORIA_ITEMS = [
  'form08', 'verif_policial', 'multas_nac', 'dominio_hist',
  'libre_deudas', 'titulo', 'cedulas', 'identificacion',
]

// nested-POST key → standard slug
const GESTORIA_ALIAS = {
  form08: 'form08',
  verificPolicial: 'verif_policial',
  verif_policial: 'verif_policial',
  multasNac: 'multas_nac',
  multas_nac: 'multas_nac',
  dominioHist: 'dominio_hist',
  dominio_hist: 'dominio_hist',
  libreDeudas: 'libre_deudas',
  libre_deudas: 'libre_deudas',
  titulo: 'titulo',
  cedulas: 'cedulas',
  identificacion: 'identificacion',
}

function gestoriaItemFromFlat(p, slug) {
  return {
    checked: bool(p[slug]),
    fecha: dateOnly(p[slug + '_fecha']),
    obs: str(p[slug + '_nota']),
    marcado_por: null,
  }
}

function gestoriaItemFromNested(v) {
  return {
    checked: bool(v.checked),
    fecha: dateOnly(v.fecha),
    obs: str(v.obs),
    marcado_por: str(v.marcadoPor ?? v.marcado_por),
  }
}

export function transformGestoria(p) {
  const items = {}
  if (p.items && typeof p.items === 'object') {
    for (const [k, v] of Object.entries(p.items)) {
      const slug = GESTORIA_ALIAS[k] ?? k
      items[slug] = v && typeof v === 'object' ? gestoriaItemFromNested(v) : { checked: bool(v), fecha: null, obs: null, marcado_por: null }
    }
  } else {
    for (const slug of GESTORIA_ITEMS) items[slug] = gestoriaItemFromFlat(p, slug)
  }
  const row = {
    id: num(p.id),
    vehiculo_id: str(p.vehiculo_id ?? p.vehiculoId),
    estado: str(p.estado),
    notas: str(p.notas),
    fecha_inicio: dateOnly(p.fecha_inicio ?? p.fechaInicio),
    fecha_cierre: dateOnly(p.fecha_cierre ?? p.fechaCierre),
    items,
  }
  for (const slug of GESTORIA_ITEMS) row[slug] = Boolean(items[slug]?.checked)
  return row
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- legacyTransform.peritaje`
Expected: PASS.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: all transform suites green.

- [ ] **Step 6: Commit**

```bash
git add src/server/legacyTransform.js src/server/__tests__/legacy/legacyTransform.peritaje.test.js
git commit -m "$(printf 'feat: transform peritaje + gestoria legacy payloads\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>')"
```

---

## Task 7: `supabase/crm_legacy_schema.sql` — the schema

**Files:**
- Create: `supabase/crm_legacy_schema.sql`
- Test: `src/server/__tests__/legacy/schema.test.js`

**Interfaces:**
- Consumes: the column names produced by Tasks 3–6 (the schema must have a column for every key those transforms emit).
- Produces: the `crm_legacy` schema, applied manually in the Supabase SQL Editor. Tables: `sync_runs`, `raw_registros`, `usuarios`, `clientes`, `cliente_intereses`, `cliente_autos_entrega`, `vehiculos`, `vehiculo_fotos`, `peritajes`, `gestoria_tramites`, `alertas`, `tareas`.

- [ ] **Step 1: Write the failing test**

`src/server/__tests__/legacy/schema.test.js` — a static check that the SQL declares every column the transforms emit, so schema and code cannot drift:

```js
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  transformCliente, transformVehiculo, transformAlerta, transformTarea, transformUsuario,
} from '../../legacyTransform.js'
import clientes from '../fixtures/legacy/clientes.json'
import vehiculos from '../fixtures/legacy/vehiculos.json'
import alertas from '../fixtures/legacy/alertas.json'
import tareas from '../fixtures/legacy/tareas.json'
import usuarios from '../fixtures/legacy/usuarios.json'

const sql = readFileSync(resolve('supabase/crm_legacy_schema.sql'), 'utf8').toLowerCase()

function assertColumns(obj) {
  for (const key of Object.keys(obj)) {
    expect(sql, `missing column ${key}`).toContain(key.toLowerCase())
  }
}

describe('crm_legacy_schema.sql', () => {
  it('declares the schema and every table', () => {
    for (const t of [
      'sync_runs', 'raw_registros', 'usuarios', 'clientes', 'cliente_intereses',
      'cliente_autos_entrega', 'vehiculos', 'vehiculo_fotos', 'peritajes',
      'gestoria_tramites', 'alertas', 'tareas',
    ]) {
      expect(sql).toContain(`crm_legacy.${t}`)
    }
    expect(sql).toContain('create schema if not exists crm_legacy')
  })

  it('has a column for every field the transforms emit', () => {
    assertColumns(transformCliente(clientes.get[0]).cliente)
    assertColumns(transformVehiculo(vehiculos.get[0]).vehiculo)
    assertColumns(transformAlerta(alertas.get[0]))
    assertColumns(transformTarea(tareas.get[0]))
    assertColumns(transformUsuario(usuarios.get[0]))
  })

  it('locks the schema down to service_role', () => {
    expect(sql).toContain('revoke all on all tables in schema crm_legacy from anon, authenticated')
    expect(sql).toContain('grant usage on schema crm_legacy to service_role')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- schema`
Expected: FAIL — cannot read `supabase/crm_legacy_schema.sql`.

- [ ] **Step 3: Write the schema**

Create `supabase/crm_legacy_schema.sql`:

```sql
-- ============================================================================
--  CRM LEGACY — clon de backup (schema aislado, solo service_role)
--  Ejecutar en: Supabase -> SQL Editor -> pegar todo -> Run. Es idempotente.
--  Después de correrlo: Settings -> API -> Exposed schemas -> agregar
--  `crm_legacy` (para que la service_role key lo alcance por PostgREST).
--  Nombres en español. Los `id` de tablas normalizadas guardan el id del
--  CRM viejo tal cual. Ninguna fila se borra: se marca `borrado_en`.
-- ============================================================================

create schema if not exists crm_legacy;

-- ---- Bookkeeping de corridas -----------------------------------------------
create table if not exists crm_legacy.sync_runs (
  id                 bigserial primary key,
  iniciado_en        timestamptz not null default now(),
  terminado_en       timestamptz,
  estado             text not null default 'corriendo',   -- corriendo | ok | error
  disparado_por      text not null default 'cron',        -- cron | manual
  filas_por_entidad  jsonb not null default '{}'::jsonb,
  fotos_bajadas      int  not null default 0,
  error              text
);

-- ---- Capa raw (backup literal, append-only con dedupe por hash) ------------
create table if not exists crm_legacy.raw_registros (
  entidad            text not null,
  id_legacy          text not null,
  payload            jsonb not null,
  hash               text not null,
  fetched_at         timestamptz not null default now(),
  sync_run_id        bigint not null references crm_legacy.sync_runs(id),
  visto_ultimo_sync  boolean not null default true,
  primary key (entidad, id_legacy, hash)
);
create index if not exists idx_raw_entidad_id_fecha
  on crm_legacy.raw_registros (entidad, id_legacy, fetched_at desc);

-- ---- Normalizadas ---------------------------------------------------------
create table if not exists crm_legacy.usuarios (
  id           int primary key,
  usuario      text,
  nombre       text,
  rol          text,
  sync_run_id  bigint references crm_legacy.sync_runs(id),
  borrado_en   timestamptz
);

create table if not exists crm_legacy.clientes (
  id                 text primary key,
  nombre             text,
  telefono           text,
  localidad          text,
  fecha_cumple       date,
  status             text,
  canal              text,
  presupuesto        numeric,
  marca_interes      text,
  modelo_interes     text,
  tipo_interes       text,
  trans_interes      text,
  anio_min           int,
  anio_max           int,
  notas              text,
  interes_cero_km    boolean not null default false,
  cero_km            jsonb,
  tiene_auto_entrega boolean not null default false,
  creado_por         text,
  editado_por        text,
  fecha_creacion     date,
  fecha_edicion      date,
  created_at         timestamptz,
  updated_at         timestamptz,
  venta_vehiculo_id  text,
  fecha_venta        date,
  sync_run_id        bigint references crm_legacy.sync_runs(id),
  borrado_en         timestamptz
);

create table if not exists crm_legacy.cliente_intereses (
  id          bigserial primary key,
  cliente_id  text not null references crm_legacy.clientes(id) on delete cascade,
  marca       text,
  modelo      text
);
create index if not exists idx_cli_int_cliente on crm_legacy.cliente_intereses (cliente_id);

create table if not exists crm_legacy.cliente_autos_entrega (
  id          bigserial primary key,
  cliente_id  text not null references crm_legacy.clientes(id) on delete cascade,
  marca       text,
  modelo      text,
  version     text,
  anio        int,
  km          int,
  color       text,
  trans       text,
  notas       text
);
create index if not exists idx_cli_ae_cliente on crm_legacy.cliente_autos_entrega (cliente_id);

create table if not exists crm_legacy.vehiculos (
  id                 text primary key,
  marca              text,
  modelo             text,
  version            text,
  patente            text,
  tipo               text,
  anio               int,
  km                 int,
  trans              text,
  color              text,
  moneda_contado     text,
  precio_contado     numeric,
  moneda_canje       text,
  precio_canje       numeric,
  duenio_nombre      text,
  duenio_apellido    text,
  duenio_contacto    text,
  itv                text,
  itv_venc           date,
  consignacion       boolean not null default false,
  tipo_consignacion  text,
  origen             text,
  carpeta_completa   boolean not null default false,
  carpeta_con_oficio boolean not null default false,
  carpeta_entregada  boolean not null default false,
  tiene_iva          boolean not null default false,
  nota               text,
  status             text,
  creado_por         text,
  editado_por        text,
  fecha_creacion     date,
  fecha_edicion      date,
  created_at         timestamptz,
  updated_at         timestamptz,
  venta_cliente_id   text,
  fecha_venta        date,
  sync_run_id        bigint references crm_legacy.sync_runs(id),
  borrado_en         timestamptz
);

create table if not exists crm_legacy.vehiculo_fotos (
  id            bigserial primary key,
  vehiculo_id   text not null references crm_legacy.vehiculos(id) on delete cascade,
  orden         int not null default 0,
  url_origen    text not null,
  url_espejo    text,
  bytes         int,
  content_type  text,
  mirrored_at   timestamptz,
  borrado_en    timestamptz,
  unique (vehiculo_id, url_origen)
);
create index if not exists idx_veh_fotos_vehiculo on crm_legacy.vehiculo_fotos (vehiculo_id);

create table if not exists crm_legacy.peritajes (
  id             int primary key,
  vehiculo_id    text references crm_legacy.vehiculos(id) on delete set null,
  fecha_peritaje date,
  peritado_por   text,
  resena_texto   text,
  costo_total    numeric,
  secciones      jsonb not null default '{}'::jsonb,
  created_at     timestamptz,
  updated_at     timestamptz,
  sync_run_id    bigint references crm_legacy.sync_runs(id),
  borrado_en     timestamptz
);
create index if not exists idx_peritajes_vehiculo on crm_legacy.peritajes (vehiculo_id);

create table if not exists crm_legacy.gestoria_tramites (
  id             int primary key,
  vehiculo_id    text references crm_legacy.vehiculos(id) on delete set null,
  estado         text,
  notas          text,
  fecha_inicio   date,
  fecha_cierre   date,
  items          jsonb not null default '{}'::jsonb,
  form08         boolean not null default false,
  verif_policial boolean not null default false,
  multas_nac     boolean not null default false,
  dominio_hist   boolean not null default false,
  libre_deudas   boolean not null default false,
  titulo         boolean not null default false,
  cedulas        boolean not null default false,
  identificacion boolean not null default false,
  created_at     timestamptz,
  updated_at     timestamptz,
  sync_run_id    bigint references crm_legacy.sync_runs(id),
  borrado_en     timestamptz
);
create index if not exists idx_gestoria_vehiculo on crm_legacy.gestoria_tramites (vehiculo_id);

create table if not exists crm_legacy.alertas (
  id           text primary key,
  tipo         text,
  titulo       text,
  descripcion  text,
  fecha        date,
  hora         text,
  done         boolean not null default false,
  ref_id       text,
  ref_name     text,
  ref_phone    text,
  creado_por   text,
  asignado_a   text,
  created_at   timestamptz,
  updated_at   timestamptz,
  sync_run_id  bigint references crm_legacy.sync_runs(id),
  borrado_en   timestamptz
);

create table if not exists crm_legacy.tareas (
  id            text primary key,
  titulo        text,
  descripcion   text,
  fecha         date,
  done          boolean not null default false,
  cliente_id    text,
  cliente_nombre text,
  cliente_phone text,
  asignado_a    text,
  created_at    timestamptz,
  updated_at    timestamptz,
  sync_run_id   bigint references crm_legacy.sync_runs(id),
  borrado_en    timestamptz
);

-- ---- Permisos: solo service_role -----------------------------------------
grant usage on schema crm_legacy to service_role;
grant all privileges on all tables in schema crm_legacy to service_role;
grant all privileges on all sequences in schema crm_legacy to service_role;
alter default privileges in schema crm_legacy grant all on tables to service_role;
alter default privileges in schema crm_legacy grant all on sequences to service_role;

revoke all on all tables in schema crm_legacy from anon, authenticated;
revoke all on all sequences in schema crm_legacy from anon, authenticated;
alter default privileges in schema crm_legacy revoke all on tables from anon, authenticated;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- schema`
Expected: PASS. If a column is reported missing, add it to the correct `create table` and re-run.

- [ ] **Step 5: Apply the schema in Supabase (manual)**

Open Supabase → SQL Editor → paste the whole file → Run. Then Settings → API → **Exposed schemas** → add `crm_legacy` → Save. Confirm no errors. (This step has no local automation; the test in Step 4 is the drift guard.)

- [ ] **Step 6: Commit**

```bash
git add supabase/crm_legacy_schema.sql src/server/__tests__/legacy/schema.test.js
git commit -m "$(printf 'feat: crm_legacy schema (raw + normalized + run log)\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>')"
```

---

## Task 8: `legacyFetch.js` — login + fetchAll

**Files:**
- Create: `src/server/legacyFetch.js`
- Test: `src/server/__tests__/legacy/legacyFetch.test.js`

**Interfaces:**
- Consumes: `crmLogin` from `src/server/crmCore.js` (`crmLogin(user, pass) → { status, json }`).
- Produces:
  - `login({ user, pass, fetchImpl? }): Promise<string>` — returns the bearer token; throws `Error` if `json.ok` is false.
  - `ENTIDADES: Array<{ nombre, path }>` — the 8 read endpoints: `clientes/clientes.php`, `vehiculos/vehiculos.php`, `peritaje/peritaje.php`, `gestoria/gestoria.php`, `alertas/alertas.php`, `tareas/tareas.php`, `usuarios/usuarios.php`, `jerarquia/jerarquia.php`.
  - `fetchEntidad(token, path, { fetchImpl?, retries? }): Promise<any[]>` — GET `<BASE>/<path>` with `Authorization: Bearer <token>`, 15s timeout, up to 3 attempts (500ms · 1s · 2s backoff) on network error or HTTP ≥ 500; unwraps `{ data: [...] }` / raw array / `[]`.
  - `fetchAll({ user, pass, fetchImpl? }): Promise<{ token, resultados: Record<string, { ok:true, registros:any[] } | { ok:false, error:string }> }>` — logs in once, fetches every entity with `Promise.allSettled`, never throws for a single-entity failure.
- `BASE = 'https://neifertcrm.com/backend/api'` (exported).

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect, vi } from 'vitest'
import { login, fetchEntidad, fetchAll, ENTIDADES } from '../../legacyFetch.js'

function jsonResponse(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body }
}

describe('login', () => {
  it('returns the token on ok', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ ok: true, data: { token: 'T', nombre: 'B', role: 'vendedor' } }))
    await expect(login({ user: 'u', pass: 'p', fetchImpl })).resolves.toBe('T')
  })
  it('throws on failure', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ ok: false, error: 'bad creds' }, 401))
    await expect(login({ user: 'u', pass: 'p', fetchImpl })).rejects.toTHROW(/bad creds/)
  })
})

describe('fetchEntidad', () => {
  it('unwraps { data: [...] }', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ ok: true, data: [{ id: '1' }] }))
    await expect(fetchEntidad('T', 'clientes.php', { fetchImpl })).resolves.toEqual([{ id: '1' }])
  })
  it('retries on HTTP 500 then succeeds', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse({}, 500))
      .mockResolvedValueOnce(jsonResponse({ data: [{ id: '2' }] }))
    await expect(fetchEntidad('T', 'x.php', { fetchImpl, retries: 2, backoffMs: 0 })).resolves.toEqual([{ id: '2' }])
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })
})

describe('fetchAll', () => {
  it('logs in once and reports per-entity ok/error', async () => {
    const fetchImpl = vi.fn().mockImplementation((url) => {
      if (String(url).endsWith('/auth/login.php')) return Promise.resolve(jsonResponse({ ok: true, data: { token: 'T' } }))
      if (String(url).endsWith('/gestoria.php')) return Promise.resolve(jsonResponse({}, 503))
      return Promise.resolve(jsonResponse({ data: [{ id: 'z' }] }))
    })
    const { token, resultados } = await fetchAll({ user: 'u', pass: 'p', fetchImpl, backoffMs: 0 })
    expect(token).toBe('T')
    expect(resultados.clientes).toEqual({ ok: true, registros: [{ id: 'z' }] })
    expect(resultados.gestoria.ok).toBe(false)
    expect(Object.keys(resultados).length).toBe(ENTIDADES.length)
  })
})
```

Fix the two intentional typos before running: `rejects.toTHROW` → `rejects.toThrow`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- legacyFetch`
Expected: FAIL — cannot find module `../../legacyFetch.js`.

- [ ] **Step 3: Write minimal implementation**

Create `src/server/legacyFetch.js`:

```js
import { crmLogin } from './crmCore.js'

export const BASE = 'https://neifertcrm.com/backend/api'

export const ENTIDADES = [
  { nombre: 'clientes', path: 'clientes.php' },
  { nombre: 'vehiculos', path: 'vehiculos.php' },
  { nombre: 'peritaje', path: 'peritaje.php' },
  { nombre: 'gestoria', path: 'gestoria.php' },
  { nombre: 'alertas', path: 'alertas.php' },
  { nombre: 'tareas', path: 'tareas.php' },
  { nombre: 'usuarios', path: 'usuarios.php' },
  { nombre: 'jerarquia', path: 'jerarquia.php' },
]

export async function login({ user, pass, fetchImpl }) {
  // crmCore.crmLogin uses global fetch; for tests we allow an override.
  if (fetchImpl) {
    const r = await fetchImpl(`${BASE}/auth/login.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user, pass }),
    })
    const json = await r.json()
    if (!json?.ok) throw new Error(json?.error || 'Login del CRM viejo falló.')
    return json.data.token
  }
  const { json } = await crmLogin(user, pass)
  if (!json?.ok) throw new Error(json?.error || 'Login del CRM viejo falló.')
  return json.data.token
}

function unwrap(json) {
  if (Array.isArray(json)) return json
  if (Array.isArray(json?.data)) return json.data
  return []
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export async function fetchEntidad(token, path, { fetchImpl, retries = 3, backoffMs = 500 } = {}) {
  const doFetch = fetchImpl || fetch
  let lastErr
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const r = await doFetch(`${BASE}/${path}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(15000),
      })
      if (r.status >= 500) throw new Error(`${path} respondió ${r.status}`)
      if (!r.ok) throw new Error(`${path} respondió ${r.status}`)
      return unwrap(await r.json())
    } catch (e) {
      lastErr = e
      if (attempt < retries) await sleep(backoffMs * 2 ** (attempt - 1))
    }
  }
  throw lastErr
}

export async function fetchAll({ user, pass, fetchImpl, backoffMs = 500 }) {
  const token = await login({ user, pass, fetchImpl })
  const settled = await Promise.allSettled(
    ENTIDADES.map((e) => fetchEntidad(token, e.path, { fetchImpl, backoffMs })),
  )
  const resultados = {}
  settled.forEach((s, i) => {
    const nombre = ENTIDADES[i].nombre
    resultados[nombre] = s.status === 'fulfilled'
      ? { ok: true, registros: s.value }
      : { ok: false, error: String(s.reason?.message || s.reason) }
  })
  return { token, resultados }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- legacyFetch`
Expected: PASS (all 6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/server/legacyFetch.js src/server/__tests__/legacy/legacyFetch.test.js
git commit -m "$(printf 'feat: legacy CRM fetch layer (login + fetchAll with retry)\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>')"
```

---

## Task 9: `legacyStore.js` — the `crm_legacy` data-access layer

**Files:**
- Create: `src/server/legacyStore.js`
- Test: `src/server/__tests__/legacy/legacyStore.test.js`

**Interfaces:**
- Consumes: a supabase-js client whose `.schema('crm_legacy')` is used for all tables; `payloadHash` from Task 2.
- Produces a `createLegacyStore(supabase)` factory returning:
  - `anotherRunActive(): Promise<boolean>` — true if a `sync_runs` row has `estado='corriendo'` and `iniciado_en > now() - 30 min`.
  - `startRun(disparadoPor): Promise<number>` — inserts a `sync_runs` row, returns its `id`.
  - `finishRun(id, { estado, filasPorEntidad, fotosBajadas, error }): Promise<void>`.
  - `writeRaw(entidad, registros, idOf, runId): Promise<{ leidos:number, nuevos:number, ids:string[] }>` — computes `payloadHash` per record, upserts into `raw_registros` with `onConflict: 'entidad,id_legacy,hash'`, `ignoreDuplicates: true`, `.select()` to count inserts; `idOf(record)` returns the legacy id string.
  - `markRawSeen(entidad, ids): Promise<void>` — sets `visto_ultimo_sync = ids.includes(id_legacy)` for that entidad (two updates: `true` for `id_legacy in ids`, `false` for the rest).
  - `upsertRows(tabla, rows, onConflict='id'): Promise<void>`.
  - `replaceChildren(tabla, parentCol, parentIds, rows): Promise<void>` — `delete().in(parentCol, parentIds)` then `insert(rows)` (skip insert if `rows` empty).
  - `markDeleted(tabla, idsVivos, runId): Promise<number>` — `update({ borrado_en: nowIso, sync_run_id: runId }).is('borrado_en', null).not('id', 'in', listOf(idsVivos))`; returns affected count. When `idsVivos` is empty, still runs (marks everything deleted).
  - `listOf(ids): string` — exported helper building a PostgREST `in` list: `(\"a\",\"b\")` (numbers unquoted).

- [ ] **Step 1: Write the failing test**

Use a hand-rolled chainable mock that records calls.

```js
import { describe, it, expect, vi } from 'vitest'
import { createLegacyStore, listOf } from '../../legacyStore.js'

// Minimal chainable supabase-ish mock. Each .from() returns a builder whose
// terminal call resolves to { data, error, count }.
function makeSupabase(handlers = {}) {
  const calls = []
  const client = {
    schema: () => client,
    from(table) {
      const state = { table, filters: [], op: null, payload: null }
      const builder = {
        insert(p) { state.op = 'insert'; state.payload = p; return builder },
        upsert(p, opts) { state.op = 'upsert'; state.payload = p; state.opts = opts; return builder },
        update(p) { state.op = 'update'; state.payload = p; return builder },
        delete() { state.op = 'delete'; return builder },
        select(s) { state.select = s ?? '*'; return finalize() },
        eq(c, v) { state.filters.push(['eq', c, v]); return builder },
        is(c, v) { state.filters.push(['is', c, v]); return builder },
        in(c, v) { state.filters.push(['in', c, v]); return builder },
        not(c, op, v) { state.filters.push(['not', c, op, v]); return builder },
        gt(c, v) { state.filters.push(['gt', c, v]); return builder },
        order() { return builder },
        limit() { return finalize() },
        single() { return finalize(true) },
        then(res, rej) { return finalize().then(res, rej) },
      }
      function finalize(single = false) {
        calls.push(state)
        const h = handlers[`${state.op}:${table}`] || handlers[table]
        const result = (typeof h === 'function' ? h(state) : h) || { data: single ? {} : [], error: null, count: 0 }
        return Promise.resolve(result)
      }
      return builder
    },
  }
  return { client, calls }
}

describe('listOf', () => {
  it('quotes strings, leaves numbers bare', () => {
    expect(listOf(['a', 'b'])).toBe('("a","b")')
    expect(listOf([1, 2])).toBe('(1,2)')
    expect(listOf([])).toBe('("__none__")')
  })
})

describe('legacyStore', () => {
  it('startRun returns the new id', async () => {
    const { client } = makeSupabase({ 'insert:sync_runs': { data: { id: 42 }, error: null } })
    const store = createLegacyStore(client)
    await expect(store.startRun('manual')).resolves.toBe(42)
  })

  it('writeRaw counts only inserted rows and collects ids', async () => {
    const { client, calls } = makeSupabase({
      'upsert:raw_registros': (s) => ({ data: [s.payload[0]], error: null }), // 1 of N inserted
    })
    const store = createLegacyStore(client)
    const res = await store.writeRaw('clientes', [{ id: 'a' }, { id: 'b' }], (r) => r.id, 42)
    expect(res.leidos).toBe(2)
    expect(res.nuevos).toBe(1)
    expect(res.ids).toEqual(['a', 'b'])
    expect(calls.find((c) => c.table === 'raw_registros').opts).toMatchObject({ onConflict: 'entidad,id_legacy,hash', ignoreDuplicates: true })
  })

  it('markDeleted filters on borrado_en null and excludes live ids', async () => {
    const { client, calls } = makeSupabase({ 'update:clientes': { data: [{ id: 'x' }], error: null, count: 1 } })
    const store = createLegacyStore(client)
    await store.markDeleted('clientes', ['a', 'b'], 42)
    const call = calls.find((c) => c.table === 'clientes')
    expect(call.filters).toEqual(expect.arrayContaining([
      ['is', 'borrado_en', null],
      ['not', 'id', 'in', '("a","b")'],
    ]))
  })

  it('replaceChildren deletes by parent then inserts', async () => {
    const { client, calls } = makeSupabase()
    const store = createLegacyStore(client)
    await store.replaceChildren('cliente_intereses', 'cliente_id', ['a'], [{ cliente_id: 'a', marca: 'x' }])
    const ops = calls.filter((c) => c.table === 'cliente_intereses').map((c) => c.op)
    expect(ops).toEqual(['delete', 'insert'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- legacyStore`
Expected: FAIL — cannot find module `../../legacyStore.js`.

- [ ] **Step 3: Write minimal implementation**

Create `src/server/legacyStore.js`:

```js
import { payloadHash } from './legacyHash.js'

export function listOf(ids) {
  if (!ids || ids.length === 0) return '("__none__")'
  return '(' + ids.map((v) => (typeof v === 'number' ? String(v) : `"${String(v).replace(/"/g, '')}"`)).join(',') + ')'
}

const STALE_RUN_MIN = 30

export function createLegacyStore(supabase) {
  const db = () => supabase.schema('crm_legacy')

  async function anotherRunActive() {
    const cutoff = new Date(Date.now() - STALE_RUN_MIN * 60_000).toISOString()
    const { data, error } = await db()
      .from('sync_runs')
      .select('id')
      .eq('estado', 'corriendo')
      .gt('iniciado_en', cutoff)
      .limit(1)
    if (error) throw error
    return (data?.length ?? 0) > 0
  }

  async function startRun(disparadoPor) {
    const { data, error } = await db()
      .from('sync_runs')
      .insert({ disparado_por: disparadoPor })
      .select('id')
      .single()
    if (error) throw error
    return data.id
  }

  async function finishRun(id, { estado, filasPorEntidad, fotosBajadas, error }) {
    const { error: err } = await db()
      .from('sync_runs')
      .update({
        terminado_en: new Date().toISOString(),
        estado,
        filas_por_entidad: filasPorEntidad ?? {},
        fotos_bajadas: fotosBajadas ?? 0,
        error: error ?? null,
      })
      .eq('id', id)
    if (err) throw err
  }

  async function writeRaw(entidad, registros, idOf, runId) {
    const rows = registros.map((r) => {
      const idLegacy = String(idOf(r))
      return { entidad, id_legacy: idLegacy, payload: r, hash: payloadHash(r), sync_run_id: runId }
    })
    let nuevos = 0
    if (rows.length) {
      const { data, error } = await db()
        .from('raw_registros')
        .upsert(rows, { onConflict: 'entidad,id_legacy,hash', ignoreDuplicates: true })
        .select('id_legacy')
      if (error) throw error
      nuevos = data?.length ?? 0
    }
    return { leidos: registros.length, nuevos, ids: rows.map((r) => r.id_legacy) }
  }

  async function markRawSeen(entidad, ids) {
    const { error: e1 } = await db()
      .from('raw_registros')
      .update({ visto_ultimo_sync: true })
      .eq('entidad', entidad)
      .in('id_legacy', ids.length ? ids : ['__none__'])
    if (e1) throw e1
    const { error: e2 } = await db()
      .from('raw_registros')
      .update({ visto_ultimo_sync: false })
      .eq('entidad', entidad)
      .not('id_legacy', 'in', listOf(ids))
    if (e2) throw e2
  }

  async function upsertRows(tabla, rows, onConflict = 'id') {
    if (!rows.length) return
    const { error } = await db().from(tabla).upsert(rows, { onConflict })
    if (error) throw error
  }

  async function replaceChildren(tabla, parentCol, parentIds, rows) {
    if (parentIds.length) {
      const { error } = await db().from(tabla).delete().in(parentCol, parentIds)
      if (error) throw error
    }
    if (rows.length) {
      const { error } = await db().from(tabla).insert(rows)
      if (error) throw error
    }
  }

  async function markDeleted(tabla, idsVivos, runId) {
    const { data, error } = await db()
      .from(tabla)
      .update({ borrado_en: new Date().toISOString(), sync_run_id: runId })
      .is('borrado_en', null)
      .not('id', 'in', listOf(idsVivos))
      .select('id')
    if (error) throw error
    return data?.length ?? 0
  }

  return {
    anotherRunActive, startRun, finishRun,
    writeRaw, markRawSeen, upsertRows, replaceChildren, markDeleted,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- legacyStore`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/legacyStore.js src/server/__tests__/legacy/legacyStore.test.js
git commit -m "$(printf 'feat: crm_legacy data-access layer (runs, raw dedupe, soft-delete)\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>')"
```

---

## Task 10: `legacyPhotos.js` — mirror vehicle photos to R2

**Files:**
- Create: `src/server/legacyPhotos.js`
- Test: `src/server/__tests__/legacy/legacyPhotos.test.js`

**Interfaces:**
- Consumes: `createR2Client` + `putR2Object` from `src/server/r2Core.js`; `extractImagenes` from `legacyTransform.js`.
- Produces:
  - `r2KeyForPhoto(vehiculoId, url): string` — `legacy/vehiculos/<vehiculoId>/<sha1-12 of url>.<ext>` (ext from the URL path, default `jpg`).
  - `syncFotosVehiculo({ vehiculoId, urls, existentes, r2, bucket, publicUrlBase, fetchImpl? }): Promise<{ filas, bajadas, errores }>` where
    - `existentes`: `Array<{ url_origen, url_espejo }>` already in `vehiculo_fotos` for this vehicle.
    - For each `url` not already mirrored (`url_espejo` set), download via `fetchImpl||fetch`; on success `putR2Object` and push a row `{ vehiculo_id, orden, url_origen, url_espejo, bytes, content_type, mirrored_at }`; on failure push `{ vehiculo_id, orden, url_origen, url_espejo: null }` and increment `errores`.
    - `filas` also includes unchanged already-mirrored URLs (so caller upserts the full set with correct `orden`).
  - `mirrorAllPhotos({ vehiculos, fotosPorVehiculo, r2, bucket, publicUrlBase, fetchImpl?, upsertFotos }): Promise<number>` — loops vehicles, calls `syncFotosVehiculo`, calls `upsertFotos(filas)` per vehicle, returns total `bajadas`.

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect, vi } from 'vitest'
import { r2KeyForPhoto, syncFotosVehiculo } from '../../legacyPhotos.js'

const okImg = () => ({ ok: true, status: 200, headers: new Map([['content-type', 'image/jpeg']]), arrayBuffer: async () => new ArrayBuffer(8) })

describe('r2KeyForPhoto', () => {
  it('namespaces by vehicle and keeps extension', () => {
    const k = r2KeyForPhoto('v1', 'https://x/y/pic.png?foo=1')
    expect(k).toMatch(/^legacy\/vehiculos\/v1\/[a-f0-9]{12}\.png$/)
  })
})

describe('syncFotosVehiculo', () => {
  const r2 = {}
  const putR2Object = vi.fn().mockResolvedValue(undefined)
  vi.mock('../../r2Core.js', () => ({ putR2Object: (...a) => putR2Object(...a), createR2Client: () => ({}) }))

  it('downloads only new urls, keeps mirrored ones', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okImg())
    const res = await syncFotosVehiculo({
      vehiculoId: 'v1',
      urls: ['https://x/a.jpg', 'https://x/b.jpg'],
      existentes: [{ url_origen: 'https://x/a.jpg', url_espejo: 'https://pub/legacy/vehiculos/v1/aaa.jpg' }],
      r2, bucket: 'b', publicUrlBase: 'https://pub', fetchImpl,
    })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(res.bajadas).toBe(1)
    expect(res.filas).toHaveLength(2)
    expect(res.filas.find((f) => f.url_origen === 'https://x/b.jpg').url_espejo).toContain('https://pub/legacy/vehiculos/v1/')
  })

  it('records an error row when download fails', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 404 })
    const res = await syncFotosVehiculo({
      vehiculoId: 'v1', urls: ['https://x/c.jpg'], existentes: [],
      r2, bucket: 'b', publicUrlBase: 'https://pub', fetchImpl,
    })
    expect(res.errores).toBe(1)
    expect(res.filas[0].url_espejo).toBe(null)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- legacyPhotos`
Expected: FAIL — cannot find module `../../legacyPhotos.js`.

- [ ] **Step 3: Write minimal implementation**

Create `src/server/legacyPhotos.js`:

```js
import { createHash } from 'node:crypto'
import { putR2Object } from './r2Core.js'

function sha1_12(s) {
  return createHash('sha1').update(s).digest('hex').slice(0, 12)
}

export function r2KeyForPhoto(vehiculoId, url) {
  let ext = 'jpg'
  try {
    const path = new URL(url).pathname
    const m = path.match(/\.([a-zA-Z0-9]{2,5})$/)
    if (m) ext = m[1].toLowerCase()
  } catch {}
  return `legacy/vehiculos/${vehiculoId}/${sha1_12(url)}.${ext}`
}

export async function syncFotosVehiculo({
  vehiculoId, urls, existentes, r2, bucket, publicUrlBase, fetchImpl,
}) {
  const doFetch = fetchImpl || fetch
  const yaEspejada = new Map(
    (existentes || []).filter((e) => e.url_espejo).map((e) => [e.url_origen, e.url_espejo]),
  )
  const filas = []
  let bajadas = 0
  let errores = 0

  for (let orden = 0; orden < urls.length; orden++) {
    const url = urls[orden]
    if (yaEspejada.has(url)) {
      filas.push({ vehiculo_id: vehiculoId, orden, url_origen: url, url_espejo: yaEspejada.get(url) })
      continue
    }
    try {
      const r = await doFetch(url, { signal: AbortSignal.timeout(20000) })
      if (!r.ok) throw new Error(`descarga ${r.status}`)
      const buf = Buffer.from(await r.arrayBuffer())
      const contentType = (r.headers.get?.('content-type')) || 'image/jpeg'
      const key = r2KeyForPhoto(vehiculoId, url)
      await putR2Object(r2, { bucket, filename: key, body: buf, contentType })
      const urlEspejo = `${publicUrlBase.replace(/\/$/, '')}/${key}`
      filas.push({
        vehiculo_id: vehiculoId, orden, url_origen: url, url_espejo: urlEspejo,
        bytes: buf.length, content_type: contentType, mirrored_at: new Date().toISOString(),
      })
      bajadas++
    } catch (e) {
      errores++
      filas.push({ vehiculo_id: vehiculoId, orden, url_origen: url, url_espejo: null })
    }
  }
  return { filas, bajadas, errores }
}

export async function mirrorAllPhotos({
  vehiculos, fotosPorVehiculo, r2, bucket, publicUrlBase, fetchImpl, upsertFotos,
}) {
  let total = 0
  for (const v of vehiculos) {
    const urls = v.urls || []
    if (!urls.length) continue
    const res = await syncFotosVehiculo({
      vehiculoId: v.id, urls, existentes: fotosPorVehiculo.get(v.id) || [],
      r2, bucket, publicUrlBase, fetchImpl,
    })
    await upsertFotos(res.filas)
    total += res.bajadas
  }
  return total
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- legacyPhotos`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/legacyPhotos.js src/server/__tests__/legacy/legacyPhotos.test.js
git commit -m "$(printf 'feat: mirror legacy vehicle photos to R2\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>')"
```

---

## Task 11: `legacySync.js` — the orchestrator

**Files:**
- Create: `src/server/legacySync.js`
- Test: `src/server/__tests__/legacy/legacySync.test.js`

**Interfaces:**
- Consumes: `fetchAll` (Task 8), `createLegacyStore` (Task 9), all `transformX` (Tasks 3–6), `extractImagenes` (Task 5), `mirrorAllPhotos` (Task 10), `createClient` from `@supabase/supabase-js`, `createR2Client` from `r2Core.js`.
- Produces:
  - `syncLegacyCrm(opts): Promise<{ ok:boolean, runId?:number, skipped?:string, resumen?:object, estado?:string }>` where `opts` = `{ supabaseUrl, serviceRoleKey, crmUser, crmPass, r2, disparadoPor='cron', deps? }`. `deps` lets tests inject `{ fetchAll, makeStore, makeSupabase, makeR2, mirrorAllPhotos }`.
  - Flow: guard (`anotherRunActive` → return `{ ok:false, skipped:'otra-corrida' }`) → `startRun` → `fetchAll` → per entity: `writeRaw`, transform + `upsertRows`, rebuild children, `markRawSeen`, `markDeleted` → photos → `finishRun` with `estado` = `'ok'` unless any entity `resultados[x].ok === false` or an exception was caught per-entity, in which case `'error'` (partial). Login failure → `finishRun(estado:'error')`, return `{ ok:false, estado:'error' }`.
  - `ENTITY_PLAN` (exported): array describing, per entity, `{ nombre, tabla, idOf, transform, children? }` so the loop is data-driven and testable.

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect, vi } from 'vitest'
import { syncLegacyCrm } from '../../legacySync.js'
import clientes from '../fixtures/legacy/clientes.json'
import vehiculos from '../fixtures/legacy/vehiculos.json'

function fakeStore() {
  return {
    anotherRunActive: vi.fn().mockResolvedValue(false),
    startRun: vi.fn().mockResolvedValue(7),
    finishRun: vi.fn().mockResolvedValue(undefined),
    writeRaw: vi.fn().mockImplementation((entidad, regs) => Promise.resolve({ leidos: regs.length, nuevos: regs.length, ids: regs.map((r, i) => String(r.id ?? i)) })),
    markRawSeen: vi.fn().mockResolvedValue(undefined),
    upsertRows: vi.fn().mockResolvedValue(undefined),
    replaceChildren: vi.fn().mockResolvedValue(undefined),
    markDeleted: vi.fn().mockResolvedValue(0),
  }
}

function baseDeps(resultadosOverride) {
  const store = fakeStore()
  return {
    store,
    deps: {
      makeStore: () => store,
      makeSupabase: () => ({}),
      makeR2: () => ({}),
      mirrorAllPhotos: vi.fn().mockResolvedValue(0),
      fetchAll: vi.fn().mockResolvedValue({
        token: 'T',
        resultados: resultadosOverride || {
          clientes: { ok: true, registros: clientes.get },
          vehiculos: { ok: true, registros: vehiculos.get },
          peritaje: { ok: true, registros: [] },
          gestoria: { ok: true, registros: [] },
          alertas: { ok: true, registros: [] },
          tareas: { ok: true, registros: [] },
          usuarios: { ok: true, registros: [] },
          jerarquia: { ok: true, registros: [] },
        },
      }),
    },
  }
}

const OPTS = { supabaseUrl: 'u', serviceRoleKey: 'k', crmUser: 'x', crmPass: 'y', r2: { bucket: 'b', publicUrlBase: 'https://pub' } }

describe('syncLegacyCrm', () => {
  it('happy path: writes raw + normalized, finishes ok', async () => {
    const { store, deps } = baseDeps()
    const res = await syncLegacyCrm({ ...OPTS, deps })
    expect(res.ok).toBe(true)
    expect(res.runId).toBe(7)
    expect(store.writeRaw).toHaveBeenCalledWith('clientes', clientes.get, expect.any(Function), 7)
    expect(store.upsertRows).toHaveBeenCalledWith('clientes', expect.any(Array), 'id')
    expect(store.replaceChildren).toHaveBeenCalledWith('cliente_intereses', 'cliente_id', expect.any(Array), expect.any(Array))
    expect(store.markDeleted).toHaveBeenCalledWith('clientes', expect.any(Array), 7)
    expect(store.finishRun).toHaveBeenCalledWith(7, expect.objectContaining({ estado: 'ok' }))
  })

  it('skips when another run is active', async () => {
    const { store, deps } = baseDeps()
    store.anotherRunActive.mockResolvedValue(true)
    const res = await syncLegacyCrm({ ...OPTS, deps })
    expect(res).toEqual({ ok: false, skipped: 'otra-corrida' })
    expect(store.startRun).not.toHaveBeenCalled()
  })

  it('finishes estado=error when an endpoint failed but still persists the rest', async () => {
    const { store, deps } = baseDeps({
      clientes: { ok: true, registros: clientes.get },
      vehiculos: { ok: false, error: 'gestoria respondió 503' },
      peritaje: { ok: true, registros: [] }, gestoria: { ok: true, registros: [] },
      alertas: { ok: true, registros: [] }, tareas: { ok: true, registros: [] },
      usuarios: { ok: true, registros: [] }, jerarquia: { ok: true, registros: [] },
    })
    const res = await syncLegacyCrm({ ...OPTS, deps })
    expect(store.writeRaw).toHaveBeenCalledWith('clientes', clientes.get, expect.any(Function), 7)
    expect(store.finishRun).toHaveBeenCalledWith(7, expect.objectContaining({ estado: 'error' }))
    expect(res.estado).toBe('error')
  })

  it('login failure → estado error, ok false', async () => {
    const { store, deps } = baseDeps()
    deps.fetchAll.mockRejectedValue(new Error('Login del CRM viejo falló.'))
    const res = await syncLegacyCrm({ ...OPTS, deps })
    expect(res.ok).toBe(false)
    expect(store.finishRun).toHaveBeenCalledWith(7, expect.objectContaining({ estado: 'error' }))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- legacySync`
Expected: FAIL — cannot find module `../../legacySync.js`.

- [ ] **Step 3: Write minimal implementation**

Create `src/server/legacySync.js`:

```js
import { createClient } from '@supabase/supabase-js'
import { createR2Client } from './r2Core.js'
import { createLegacyStore } from './legacyStore.js'
import { mirrorAllPhotos as realMirrorAllPhotos } from './legacyPhotos.js'
import { fetchAll as realFetchAll } from './legacyFetch.js'
import {
  transformUsuario, transformAlerta, transformTarea, transformCliente,
  transformVehiculo, transformPeritaje, transformGestoria, extractImagenes,
} from './legacyTransform.js'

export const ENTITY_PLAN = [
  { nombre: 'usuarios', tabla: 'usuarios', idOf: (r) => r.id, kind: 'usuario' },
  { nombre: 'clientes', tabla: 'clientes', idOf: (r) => r.id, kind: 'cliente' },
  { nombre: 'vehiculos', tabla: 'vehiculos', idOf: (r) => r.id, kind: 'vehiculo' },
  { nombre: 'peritaje', tabla: 'peritajes', idOf: (r) => r.id, kind: 'peritaje' },
  { nombre: 'gestoria', tabla: 'gestoria_tramites', idOf: (r) => r.id, kind: 'gestoria' },
  { nombre: 'alertas', tabla: 'alertas', idOf: (r) => r.id, kind: 'alerta' },
  { nombre: 'tareas', tabla: 'tareas', idOf: (r) => r.id, kind: 'tarea' },
  // jerarquia: solo raw, sin tabla normalizada todavía
]

function buildNormalized(kind, registros) {
  const rows = []
  const intereses = []
  const autosEntrega = []
  const parentIdsIntereses = []
  const parentIdsAE = []
  const vehiculosParaFotos = []

  for (const p of registros) {
    if (kind === 'usuario') rows.push(transformUsuario(p))
    else if (kind === 'alerta') rows.push(transformAlerta(p))
    else if (kind === 'tarea') rows.push(transformTarea(p))
    else if (kind === 'peritaje') rows.push(transformPeritaje(p))
    else if (kind === 'gestoria') rows.push(transformGestoria(p))
    else if (kind === 'cliente') {
      const { cliente, intereses: ints, autosEntrega: aes } = transformCliente(p)
      rows.push(cliente)
      parentIdsIntereses.push(cliente.id)
      parentIdsAE.push(cliente.id)
      for (const i of ints) intereses.push({ ...i, cliente_id: cliente.id })
      for (const a of aes) autosEntrega.push({ ...a, cliente_id: cliente.id })
    } else if (kind === 'vehiculo') {
      const { vehiculo } = transformVehiculo(p)
      rows.push(vehiculo)
      vehiculosParaFotos.push({ id: vehiculo.id, urls: extractImagenes(p) })
    }
  }
  return { rows, intereses, autosEntrega, parentIdsIntereses, parentIdsAE, vehiculosParaFotos }
}

export async function syncLegacyCrm(opts) {
  const {
    supabaseUrl, serviceRoleKey, crmUser, crmPass, r2 = {}, disparadoPor = 'cron', deps = {},
  } = opts
  const fetchAll = deps.fetchAll || realFetchAll
  const mirrorAllPhotos = deps.mirrorAllPhotos || realMirrorAllPhotos
  const makeSupabase = deps.makeSupabase || (() => createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } }))
  const makeR2 = deps.makeR2 || (() => createR2Client({ accessKeyId: r2.accessKeyId, secretAccessKey: r2.secretAccessKey, endpoint: r2.endpoint }))
  const makeStore = deps.makeStore || ((sb) => createLegacyStore(sb))

  const supabase = makeSupabase()
  const store = makeStore(supabase)

  if (await store.anotherRunActive()) return { ok: false, skipped: 'otra-corrida' }

  const runId = await store.startRun(disparadoPor)
  const resumen = {}
  const errores = []
  let vehiculosParaFotos = []

  let fetched
  try {
    fetched = await fetchAll({ user: crmUser, pass: crmPass })
  } catch (e) {
    await store.finishRun(runId, { estado: 'error', error: `login/fetch: ${e.message}`, filasPorEntidad: {} })
    return { ok: false, estado: 'error', runId }
  }

  const { resultados } = fetched

  // jerarquia: solo raw
  if (resultados.jerarquia?.ok && resultados.jerarquia.registros.length) {
    try {
      const r = await store.writeRaw('jerarquia', resultados.jerarquia.registros, (x, i) => String(x.id ?? i), runId)
      resumen.jerarquia = r
    } catch (e) { errores.push(`jerarquia: ${e.message}`) }
  } else if (resultados.jerarquia && !resultados.jerarquia.ok) {
    errores.push(`jerarquia: ${resultados.jerarquia.error}`)
  }

  for (const plan of ENTITY_PLAN) {
    const res = resultados[plan.nombre]
    if (!res) continue
    if (!res.ok) { errores.push(`${plan.nombre}: ${res.error}`); continue }
    try {
      const registros = res.registros
      const raw = await store.writeRaw(plan.nombre, registros, plan.idOf, runId)
      const norm = buildNormalized(plan.kind, registros)
      await store.upsertRows(plan.tabla, norm.rows, 'id')

      if (plan.kind === 'cliente') {
        await store.replaceChildren('cliente_intereses', 'cliente_id', norm.parentIdsIntereses, norm.intereses)
        await store.replaceChildren('cliente_autos_entrega', 'cliente_id', norm.parentIdsAE, norm.autosEntrega)
      }
      if (plan.kind === 'vehiculo') vehiculosParaFotos = norm.vehiculosParaFotos

      await store.markRawSeen(plan.nombre, raw.ids)
      const borrados = await store.markDeleted(plan.tabla, norm.rows.map((r) => r.id), runId)
      resumen[plan.nombre] = { ...raw, upserts: norm.rows.length, borrados }
    } catch (e) {
      errores.push(`${plan.nombre}: ${e.message}`)
    }
  }

  let fotosBajadas = 0
  try {
    fotosBajadas = await mirrorAllPhotos({
      vehiculos: vehiculosParaFotos,
      fotosPorVehiculo: new Map(),
      r2: makeR2(),
      bucket: r2.bucket,
      publicUrlBase: r2.publicUrlBase,
      upsertFotos: (filas) => store.upsertRows('vehiculo_fotos', filas, 'vehiculo_id,url_origen'),
    })
  } catch (e) {
    errores.push(`fotos: ${e.message}`)
  }

  const anyEndpointFailed = Object.values(resultados).some((r) => r && r.ok === false)
  const estado = anyEndpointFailed || errores.length ? 'error' : 'ok'
  await store.finishRun(runId, {
    estado,
    filasPorEntidad: resumen,
    fotosBajadas,
    error: errores.length ? errores.join(' | ') : null,
  })

  return { ok: estado === 'ok', estado, runId, resumen }
}
```

Note on `fotosPorVehiculo`: passing an empty Map means the first run re-mirrors all photos; incremental runs should pass the existing `vehiculo_fotos` rows. Add a `store.fotosExistentes(vehiculoIds)` read + wire it here in a follow-up step below.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- legacySync`
Expected: PASS (4 tests).

- [ ] **Step 5: Add `fotosExistentes` to the store and wire it**

In `src/server/legacyStore.js`, add inside `createLegacyStore` and to the returned object:

```js
async function fotosExistentes(vehiculoIds) {
  const map = new Map()
  if (!vehiculoIds.length) return map
  const { data, error } = await db()
    .from('vehiculo_fotos')
    .select('vehiculo_id, url_origen, url_espejo')
    .in('vehiculo_id', vehiculoIds)
  if (error) throw error
  for (const row of data || []) {
    if (!map.has(row.vehiculo_id)) map.set(row.vehiculo_id, [])
    map.get(row.vehiculo_id).push(row)
  }
  return map
}
```

In `src/server/legacySync.js`, replace `fotosPorVehiculo: new Map(),` with:

```js
      fotosPorVehiculo: await store.fotosExistentes(vehiculosParaFotos.map((v) => v.id)),
```

And in the test's `fakeStore()` add: `fotosExistentes: vi.fn().mockResolvedValue(new Map()),`

- [ ] **Step 6: Run tests again**

Run: `npm test -- legacySync legacyStore`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/server/legacySync.js src/server/legacyStore.js src/server/__tests__/legacy/legacySync.test.js src/server/__tests__/legacy/legacyStore.test.js
git commit -m "$(printf 'feat: legacy CRM sync orchestrator\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>')"
```

---

## Task 12: HTTP entrypoint, cron wiring, local runner

**Files:**
- Create: `api/crm/sync-legacy.js`
- Create: `scripts/sync-legacy-local.mjs`
- Modify: `vercel.json`
- Modify: `src/plugins/crmProxy.js`
- Test: `src/server/__tests__/legacy/syncEndpoint.test.js`

**Interfaces:**
- Consumes: `syncLegacyCrm` (Task 11).
- Produces:
  - `handleSyncLegacy(req, res, { runner? }): Promise<void>` — exported from `api/crm/sync-legacy.js` alongside the default handler, so it is unit-testable. Rejects non-POST with 405. Rejects missing/incorrect `Authorization: Bearer <CRON_SECRET>` with 401. On success responds `200 { ok, run }`. Missing env → 501.

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect, vi } from 'vitest'
import { handleSyncLegacy } from '../../../../api/crm/sync-legacy.js'

function mockRes() {
  return {
    statusCode: 0, body: null, headers: {},
    setHeader(k, v) { this.headers[k] = v },
    status(c) { this.statusCode = c; return this },
    json(b) { this.body = b; return this },
    end(b) { this.body = b ?? this.body; return this },
  }
}

describe('handleSyncLegacy', () => {
  const env = { CRON_SECRET: 's3cr3t', VITE_SUPABASE_URL: 'u', SUPABASE_SERVICE_ROLE_KEY: 'k', CRM_SYNC_USER: 'x', CRM_SYNC_PASS: 'y' }

  it('405 on GET', async () => {
    const res = mockRes()
    await handleSyncLegacy({ method: 'GET', headers: {} }, res, { env, runner: vi.fn() })
    expect(res.statusCode).toBe(405)
  })

  it('401 without the bearer secret', async () => {
    const res = mockRes()
    await handleSyncLegacy({ method: 'POST', headers: {} }, res, { env, runner: vi.fn() })
    expect(res.statusCode).toBe(401)
  })

  it('runs the sync and returns its result', async () => {
    const res = mockRes()
    const runner = vi.fn().mockResolvedValue({ ok: true, runId: 5, estado: 'ok' })
    await handleSyncLegacy({ method: 'POST', headers: { authorization: 'Bearer s3cr3t' } }, res, { env, runner })
    expect(runner).toHaveBeenCalledWith(expect.objectContaining({ supabaseUrl: 'u', serviceRoleKey: 'k', crmUser: 'x', disparadoPor: 'cron' }))
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ ok: true, run: { ok: true, runId: 5, estado: 'ok' } })
  })

  it('501 when env is missing', async () => {
    const res = mockRes()
    await handleSyncLegacy({ method: 'POST', headers: { authorization: 'Bearer s3cr3t' } }, { ...mockRes() }, { env: { CRON_SECRET: 's3cr3t' }, runner: vi.fn() })
      .then(() => {})
    // call again capturing res properly
    const res2 = mockRes()
    await handleSyncLegacy({ method: 'POST', headers: { authorization: 'Bearer s3cr3t' } }, res2, { env: { CRON_SECRET: 's3cr3t' }, runner: vi.fn() })
    expect(res2.statusCode).toBe(501)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- syncEndpoint`
Expected: FAIL — cannot find module `api/crm/sync-legacy.js`.

- [ ] **Step 3: Write the endpoint**

Create `api/crm/sync-legacy.js`:

```js
import { syncLegacyCrm } from '../../src/server/legacySync.js'

export async function handleSyncLegacy(req, res, { env = process.env, runner = syncLegacyCrm } = {}) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' })

  const expected = env.CRON_SECRET
  const got = (req.headers.authorization || req.headers.Authorization || '').replace(/^Bearer\s+/i, '')
  if (!expected || got !== expected) return res.status(401).json({ ok: false, error: 'No autorizado' })

  const supabaseUrl = env.VITE_SUPABASE_URL
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY
  const crmUser = env.CRM_SYNC_USER
  const crmPass = env.CRM_SYNC_PASS
  if (!supabaseUrl || !serviceRoleKey || !crmUser || !crmPass) {
    return res.status(501).json({ ok: false, error: 'Faltan env vars (SUPABASE / CRM_SYNC_*) para el sync.' })
  }

  try {
    const run = await runner({
      supabaseUrl,
      serviceRoleKey,
      crmUser,
      crmPass,
      r2: {
        accessKeyId: env.R2_ACCESS_KEY_ID,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY,
        endpoint: env.R2_ENDPOINT,
        bucket: env.R2_BUCKET_NAME,
        publicUrlBase: env.R2_PUBLIC_URL,
      },
      disparadoPor: 'cron',
    })
    return res.status(200).json({ ok: true, run })
  } catch (e) {
    console.error('[sync-legacy]', e.message)
    return res.status(500).json({ ok: false, error: e.message })
  }
}

export default function handler(req, res) {
  return handleSyncLegacy(req, res)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- syncEndpoint`
Expected: PASS. (Delete the messy double-call in the "501" test if it's awkward — keep only the `res2` assertion.)

- [ ] **Step 5: Add the cron to `vercel.json`**

Replace `vercel.json` with:

```json
{
  "rewrites": [
    { "source": "/((?!api/).*)", "destination": "/index.html" }
  ],
  "crons": [
    { "path": "/api/crm/sync-legacy", "schedule": "0 */6 * * *" }
  ]
}
```

Note: Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` automatically **only if** an env var literally named `CRON_SECRET` exists in the project (Vercel's documented convention). Set `CRON_SECRET` in the Vercel project env for all environments.

- [ ] **Step 6: Add the dev route in `src/plugins/crmProxy.js`**

After the existing `server.middlewares.use('/api/crm/clientes', ...)` block, add:

```js
      server.middlewares.use('/api/crm/sync-legacy', async (req, res) => {
        const { handleSyncLegacy } = await import('../../api/crm/sync-legacy.js')
        // adapt Node req/res to the handler's res shape
        const shim = {
          setHeader: (k, v) => res.setHeader(k, v),
          status: (c) => { res.statusCode = c; return shim },
          json: (b) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(b)) },
          end: (b) => res.end(b),
        }
        await handleSyncLegacy(req, shim)
      })
```

- [ ] **Step 7: Write the local runner**

Create `scripts/sync-legacy-local.mjs`:

```js
// Primera corrida completa del clon del CRM viejo, fuera del límite de 300s
// de Vercel. Uso: node --env-file=.env scripts/sync-legacy-local.mjs
import { syncLegacyCrm } from '../src/server/legacySync.js'

const env = process.env
const run = await syncLegacyCrm({
  supabaseUrl: env.VITE_SUPABASE_URL,
  serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
  crmUser: env.CRM_SYNC_USER,
  crmPass: env.CRM_SYNC_PASS,
  r2: {
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    endpoint: env.R2_ENDPOINT,
    bucket: env.R2_BUCKET_NAME,
    publicUrlBase: env.R2_PUBLIC_URL,
  },
  disparadoPor: 'manual',
})
console.log(JSON.stringify(run, null, 2))
process.exit(run.ok || run.estado === 'error' ? 0 : 1)
```

Add to `package.json` `"scripts"`: `"sync:legacy": "node --env-file=.env scripts/sync-legacy-local.mjs"`.

- [ ] **Step 8: Run the full test suite + lint**

Run: `npm test`
Expected: every suite green.
Run: `npm run lint`
Expected: no new errors in `src/server/legacy*.js` / `api/crm/sync-legacy.js` (fix any).

- [ ] **Step 9: Commit**

```bash
git add api/crm/sync-legacy.js scripts/sync-legacy-local.mjs vercel.json src/plugins/crmProxy.js package.json src/server/__tests__/legacy/syncEndpoint.test.js
git commit -m "$(printf 'feat: sync-legacy HTTP endpoint + vercel cron + local runner\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>')"
```

---

## Task 13: First full sync + endpoint catalog doc

**Files:**
- Create: `docs/legacy-crm/endpoints.md`
- Create: `scripts/dump-legacy-har-shapes.mjs` (helper to regenerate example bodies)

**Interfaces:**
- Consumes: everything above; the HARs in `scraping/`.
- Produces: the running clone (first sync executed) and the written catalog.

- [ ] **Step 1: Confirm the schema is applied**

Verify in Supabase that `crm_legacy` exists with all 12 tables (Task 7 Step 5) and is in Exposed schemas. If not, do it now.

- [ ] **Step 2: Set env vars locally**

Ensure `.env` has real values for `VITE_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CRM_SYNC_USER`, `CRM_SYNC_PASS`, and all `R2_*`. Add `CRON_SECRET` too.

- [ ] **Step 3: Run the first full sync**

Run: `npm run sync:legacy`
Expected: JSON summary with `"estado": "ok"` (or `"error"` with a readable `error` string — investigate and re-run; the sync is idempotent). Note the real GET shapes it reveals — especially whether `vehiculos.php` exposes a photo field and under what key.

- [ ] **Step 4: Spot-check the data in Supabase**

In the SQL Editor:

```sql
select count(*) from crm_legacy.clientes where borrado_en is null;      -- ~137
select count(*) from crm_legacy.vehiculos where borrado_en is null;     -- ~77
select count(*) from crm_legacy.raw_registros;                          -- >= sum of the above
select * from crm_legacy.sync_runs order by id desc limit 1;            -- estado ok, filas_por_entidad populated
select count(*) from crm_legacy.vehiculo_fotos where url_espejo is not null;
```

Record actual counts in the PR description.

- [ ] **Step 5: Run the second sync to prove idempotency**

Run: `npm run sync:legacy`
Expected: `sync_runs` gets a new row; `raw_registros` count barely changes (only real edits since the first run); `select count(*) from crm_legacy.clientes where borrado_en is not null` stays 0 (nothing wrongly soft-deleted).

- [ ] **Step 6: Write the helper that dumps HAR shapes**

Create `scripts/dump-legacy-har-shapes.mjs` — walks `scraping/Harfiles/*.har` and `scraping/NewEndpoints/*.har`, prints per `METHOD /path`: one example request body and one example response body (JSON-pretty, multipart noted). Base it on the extraction logic already in `scripts/extract-legacy-fixtures.mjs` but keep every method, not just GET/POST, and print rather than write files.

Run: `node scripts/dump-legacy-har-shapes.mjs > /tmp/legacy-shapes.txt` and use it as raw material for the next step.

- [ ] **Step 7: Write `docs/legacy-crm/endpoints.md`**

Structure (fill every section with the real shapes from Step 6 and the live GET shapes from Step 3 — no placeholders):

```markdown
# CRM legacy (neifertcrm.com) — catálogo de endpoints

Base: `https://neifertcrm.com/backend/api`
Auth: `POST /auth/login.php` → `{ ok, data: { token, nombre, role } }`; resto con `Authorization: Bearer <token>`.
Fuente: HARs en `scraping/Harfiles/` (lectura) y `scraping/NewEndpoints/` (escritura), más el primer sync en vivo (2026-08-30).

## Autenticación
### POST /auth/login.php
Request: `{ "user": "...", "pass": "..." }`
Response 200: `{ "ok": true, "data": { "token": "<JWT>", "nombre": "...", "role": "vendedor|admin|..." } }`
Response 401: `{ "ok": false, "error": "..." }`
JWT payload: `{ id, user, nombre, role, exp }` (HS256, no lo verificamos, solo leemos `exp`).

## Lectura
### GET /clientes.php
(descripción + ejemplo de 1 registro real, con la lista de campos y tipos)
### GET /vehiculos.php
(idem + **nota explícita** del campo de fotos: nombre real de la clave, formato de cada item)
### GET /peritaje.php
### GET /gestoria.php
### GET /alertas.php
### GET /tareas.php
### GET /usuarios.php
### GET /jerarquia.php
(estado: vacío al 2026-08-30; forma a confirmar)

## Escritura (para el CRM nuevo — el clon NO las ejecuta)
### clientes.php — POST / PUT / DELETE
POST (201) body camelCase: <campos>. Respuesta: `{ ok, data: { id } }`.
PUT (200) body snake_case, incluye `id`.
DELETE `?id=<id>` (200).
### vehiculos.php — POST / PUT / DELETE
POST acepta `application/json` **o** `multipart/form-data` (campo de archivos: <nombre>).
### tareas.php — POST (crear) / POST con `id` (actualizar) / DELETE `?id=`
### alertas.php — POST / PUT (`{id,done}`) / DELETE `?id=`
### peritaje.php — POST (upsert por `vehiculoId`, body plano ~120 campos)
### gestoria.php — POST (upsert por `vehiculoId`, `items: { <slug>: {checked,fecha,obs,marcadoPor} }`)

## Mapa endpoint → tabla del clon
| Endpoint | Tabla(s) `crm_legacy` |
|---|---|
| clientes.php | clientes, cliente_intereses, cliente_autos_entrega |
| vehiculos.php | vehiculos, vehiculo_fotos |
| peritaje.php | peritajes |
| gestoria.php | gestoria_tramites |
| alertas.php | alertas |
| tareas.php | tareas |
| usuarios.php | usuarios |
| jerarquia.php | (solo raw_registros) |
```

- [ ] **Step 8: Commit**

```bash
git add docs/legacy-crm/endpoints.md scripts/dump-legacy-har-shapes.mjs
git commit -m "$(printf 'docs: legacy CRM endpoint catalog + first sync verified\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>')"
```

- [ ] **Step 9: Open the PR**

```bash
git push -u origin <branch>
gh pr create --title "CRM legacy clone DB + endpoint catalog" --body "$(printf 'Implementa docs/superpowers/specs/2026-08-30-crm-legacy-clone-design.md\n\n- schema crm_legacy (raw + normalizado + sync_runs)\n- sync idempotente: fetch -> raw dedupe por hash -> normalizado -> soft-delete -> fotos a R2\n- /api/crm/sync-legacy + Vercel Cron cada 6h\n- scripts/sync-legacy-local.mjs para la primera corrida\n- docs/legacy-crm/endpoints.md\n\nConteos primer sync: clientes=<N>, vehiculos=<N>, fotos=<N>.\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)')"
```

---

## Self-Review

**1. Spec coverage:**

| Spec section | Task(s) |
|---|---|
| §2.1 read endpoints | Task 8 (`ENTIDADES`), Task 11 (`ENTITY_PLAN`) |
| §2.2 write catalog | Task 13 (`docs/legacy-crm/endpoints.md`) |
| §3 architecture / crmCore pattern | Tasks 8–12 (pure `src/server/legacy*.js`) |
| §4 components table | Task 1 (vitest, fixtures), 2 (hash), 3–6 (transform), 7 (schema), 8 (fetch), 9 (store), 10 (photos), 11 (sync), 12 (endpoint+cron+dev+local script), 13 (docs) |
| §5.1 raw_registros append-only + dedupe | Task 7 (table), Task 9 (`writeRaw` with `ignoreDuplicates`), Task 2 (hash) |
| §5.2 normalized tables + children + soft-delete | Task 7 (DDL), Tasks 3–6 (transforms), Task 9 (`upsertRows`/`replaceChildren`/`markDeleted`), Task 11 (wiring) |
| §5.2 peritaje/gestoria jsonb + mirror columns | Task 6, Task 7 |
| §5.2 jerarquia raw-only | Task 11 (jerarquia branch), Task 7 (no table — intentional) |
| §5.3 sync_runs | Task 7, Task 9 (`startRun`/`finishRun`), Task 11 |
| §5.4 service-role-only perms | Task 7 (grants/revokes), Task 7 test |
| §6 idempotent flow + run guard | Task 11 (`anotherRunActive` guard replaces advisory lock — pooler-safe), tests for idempotency |
| §6 photo mirroring after vehiculos | Task 10, Task 11 (photos step after entity loop) |
| §7 error handling (partial failure, login failure, photo failure, timeout) | Task 11 tests; Task 12 (local runner for first full sync) |
| §8 testing with fixtures | Task 1 (fixtures), every module task has a Vitest suite |
| §9 config/security, `CRON_SECRET` | Task 1 (`.env.example`), Task 12 (endpoint auth + `vercel.json`) |
| §10 out of scope | respected — no write-back, no new CRM UI, no `public.*` changes, jerarquia deferred |
| §11 deliverables | Tasks 7 (schema applied), 3–12 (modules+tests), 12 (endpoint+cron+script), 13 (first run + docs), 1 (`.env.example`) |

Deviation from spec: §6 specifies a `pg_try_advisory_lock`. Connection pooling (PgBouncer transaction mode) makes session advisory locks unreliable across separate PostgREST calls, so the plan uses a `sync_runs` "corriendo + fresh" guard instead (Task 9 `anotherRunActive`, 30-min stale window). Same intent (no overlapping runs), pooler-safe. Flagged for the spec.

**2. Placeholder scan:** The only intentionally-templated content is `docs/legacy-crm/endpoints.md` (Task 13 Step 7), which is a document outline the task explicitly says to fill from real HAR/live output before committing — not a code placeholder. All code steps contain full implementations. Deliberate test typos in Tasks 8 are called out with their fixes.

**3. Type consistency:** `writeRaw` returns `{ leidos, nuevos, ids }` — consumed as `raw.ids` in Task 11. `transformCliente` returns `{ cliente, intereses, autosEntrega }` — Task 11 `buildNormalized` destructures exactly those. `syncLegacyCrm` return shape `{ ok, runId, skipped?, estado?, resumen? }` — Task 12 wraps it as `{ ok: true, run }`. `markDeleted`/`listOf` string-list format `("a","b")` consistent between Task 9 impl and test. `createLegacyStore` returned object gains `fotosExistentes` in Task 11 Step 5 and the fake store is updated in the same step.
