import { beforeAll, expect, it } from 'vitest'

// Workers run lockdown.ts with `self` as the global; emulate that here.
beforeAll(async () => {
  ;(globalThis as unknown as { self: typeof globalThis }).self = globalThis
  await import('../../src/worker/lockdown')
})

it('fetch is gone: every call rejects', async () => {
  await expect(fetch('https://example.com')).rejects.toThrow(/disabled/)
})

it('WebSocket and XMLHttpRequest-style constructors throw', () => {
  expect(() => new (globalThis as unknown as { WebSocket: new (u: string) => unknown }).WebSocket('wss://example.com')).toThrow(/disabled/)
})

it('cannot be put back', () => {
  expect(() => {
    ;(globalThis as unknown as { fetch: unknown }).fetch = () => Promise.resolve()
  }).toThrow()
  expect(() => Object.defineProperty(globalThis, 'fetch', { value: () => Promise.resolve() })).toThrow()
})
