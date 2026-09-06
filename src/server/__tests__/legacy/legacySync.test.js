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
    fotosExistentes: vi.fn().mockResolvedValue(new Map()),
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
      vehiculos: { ok: false, error: 'gestoria respondio 503' },
      peritaje: { ok: true, registros: [] }, gestoria: { ok: true, registros: [] },
      alertas: { ok: true, registros: [] }, tareas: { ok: true, registros: [] },
      usuarios: { ok: true, registros: [] }, jerarquia: { ok: true, registros: [] },
    })
    const res = await syncLegacyCrm({ ...OPTS, deps })
    expect(store.writeRaw).toHaveBeenCalledWith('clientes', clientes.get, expect.any(Function), 7)
    expect(store.finishRun).toHaveBeenCalledWith(7, expect.objectContaining({ estado: 'error' }))
    expect(res.estado).toBe('error')
  })

  it('login failure -> estado error, ok false', async () => {
    const { store, deps } = baseDeps()
    deps.fetchAll.mockRejectedValue(new Error('Login del CRM viejo fallo.'))
    const res = await syncLegacyCrm({ ...OPTS, deps })
    expect(res.ok).toBe(false)
    expect(store.finishRun).toHaveBeenCalledWith(7, expect.objectContaining({ estado: 'error' }))
  })
})
