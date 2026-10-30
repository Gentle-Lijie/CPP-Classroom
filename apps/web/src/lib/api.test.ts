import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, ApiError, connectionState } from './api'

afterEach(() => {
  vi.unstubAllGlobals()
  connectionState.value = 'connected'
})

describe('API connection handling', () => {
  it('bounds write requests and gives a recoverable timeout error', async () => {
    const fetch = vi.fn(async (_url: string, options: RequestInit) => {
      expect(options.signal).toBeInstanceOf(AbortSignal)
      throw new DOMException('timed out', 'TimeoutError')
    })
    vi.stubGlobal('fetch', fetch)
    await expect(api('/admin/settings', 'POST', {})).rejects.toMatchObject({
      status: 0,
      message: expect.stringContaining('请求超时'),
    } satisfies Partial<ApiError>)
    expect(connectionState.value).toBe('disconnected')
  })

  it('restores the connected indicator after a successful response', async () => {
    connectionState.value = 'disconnected'
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({ ok: true }) })),
    )
    await expect(api('/health')).resolves.toEqual({ ok: true })
    expect(connectionState.value).toBe('connected')
  })

  it('rejects an invalid successful response instead of treating it as saved', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => {
          throw new SyntaxError('HTML')
        },
      })),
    )
    await expect(api('/admin/settings', 'POST', {})).rejects.toMatchObject({ status: 0 })
    expect(connectionState.value).toBe('disconnected')
  })
})
