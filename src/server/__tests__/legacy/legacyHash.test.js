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
    expect(sha256Hex('hola')).toBe('b221d9dbb083a7f33428d7c2a3c3198ae925614d70210e28716ccaa7cd4ddb79')
  })

  it('payloadHash ignores key order', () => {
    expect(payloadHash({ x: 1, y: 2 })).toBe(payloadHash({ y: 2, x: 1 }))
  })
})
