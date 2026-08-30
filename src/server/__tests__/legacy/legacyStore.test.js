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
        select(s) { state.select = s ?? '*'; return builder },
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
      'upsert:raw_registros': (s) => ({ data: [s.payload[0]], error: null }),
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
