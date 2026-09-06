/** Mock encadenable estilo supabase-js para tests de servicios del CRM.
 *  `handlers`: { 'op:tabla': result | (state) => result }  ó  { tabla: ... }
 *  result: { data, error, count }. El builder es thenable (await) y también
 *  responde .single()/.maybeSingle()/.limit(). Registra cada llamada en `calls`. */
export function makeSupabase(handlers = {}) {
  const calls = []
  const client = {
    schema: () => client,
    from(table) {
      const state = { table, op: null, payload: null, opts: null, filters: [], select: null }
      const builder = {
        insert(p) { state.op = 'insert'; state.payload = p; return builder },
        upsert(p, opts) { state.op = 'upsert'; state.payload = p; state.opts = opts; return builder },
        update(p) { state.op = 'update'; state.payload = p; return builder },
        delete() { state.op = 'delete'; return builder },
        select(s) { state.select = s ?? '*'; if (!state.op) state.op = 'select'; return builder },
        eq(c, v) { state.filters.push(['eq', c, v]); return builder },
        neq(c, v) { state.filters.push(['neq', c, v]); return builder },
        is(c, v) { state.filters.push(['is', c, v]); return builder },
        in(c, v) { state.filters.push(['in', c, v]); return builder },
        not(c, op, v) { state.filters.push(['not', c, op, v]); return builder },
        or(expr) { state.filters.push(['or', expr]); return builder },
        gte(c, v) { state.filters.push(['gte', c, v]); return builder },
        lte(c, v) { state.filters.push(['lte', c, v]); return builder },
        gt(c, v) { state.filters.push(['gt', c, v]); return builder },
        lt(c, v) { state.filters.push(['lt', c, v]); return builder },
        order(c, o) { state.filters.push(['order', c, o]); return builder },
        range(a, b) { state.filters.push(['range', a, b]); return builder },
        limit() { return finalize() },
        single() { return finalize(true) },
        maybeSingle() { return finalize(true) },
        then(res, rej) { return finalize().then(res, rej) },
      }
      function finalize(single = false) {
        calls.push(state)
        const h = handlers[`${state.op}:${table}`] ?? handlers[table]
        const r = (typeof h === 'function' ? h(state) : h) || { data: single ? null : [], error: null, count: 0 }
        return Promise.resolve(r)
      }
      return builder
    },
  }
  return { client, calls }
}
