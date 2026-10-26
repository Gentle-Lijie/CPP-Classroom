import { afterEach, describe, expect, it, vi } from 'vitest'
import onRequest from '../../edge-functions/api/[[path]].js'

afterEach(() => vi.unstubAllGlobals())
const request = (path, options) => new Request('https://cpp.lijie.space' + path, options)

describe('Makers session gateway', () => {
  it('forwards login and cookie while preserving the query and disabling caching', async () => {
    const upstream = vi.fn().mockResolvedValue(
      new Response('{"role":"admin"}', {
        headers: { 'Set-Cookie': 'classroom_session=test; Path=/; HttpOnly; SameSite=Strict' },
      }),
    )
    vi.stubGlobal('fetch', upstream)
    const result = await onRequest({
      request: request('/api/auth/login?next=teacher', {
        method: 'POST',
        headers: {
          Origin: 'https://cpp.lijie.space',
          'Content-Type': 'application/json',
          'Sec-Fetch-Site': 'same-origin',
          'X-Forwarded-Host': 'attacker.example',
        },
        body: '{"username":"example","password":"example"}',
      }),
    })
    const [url, options] = upstream.mock.calls[0]
    expect(url).toBe('https://cpp-backend.lijie.space/api/auth/login?next=teacher')
    expect(options.headers.get('origin')).toBe('https://cpp-backend.lijie.space')
    expect(options.headers.has('sec-fetch-site')).toBe(false)
    expect(options.headers.has('x-forwarded-host')).toBe(false)
    expect(new TextDecoder().decode(options.body)).toContain('"username":"example"')
    expect(result.headers.get('set-cookie')).toContain('SameSite=Strict; Secure')
    expect(result.headers.get('cache-control')).toBe('no-store')
  })

  it.each([
    { Origin: 'https://attacker.example' },
    { Origin: 'https://cpp.lijie.space', 'Sec-Fetch-Site': 'cross-site' },
  ])('rejects cross-site writes before forwarding', async (headers) => {
    const upstream = vi.fn()
    vi.stubGlobal('fetch', upstream)
    const response = await onRequest({
      request: request('/api/auth/login', { method: 'POST', headers }),
    })
    expect(response.status).toBe(403)
    expect(upstream).not.toHaveBeenCalled()
  })

  it('forwards session credentials on reads and propagates authentication errors', async () => {
    const upstream = vi
      .fn()
      .mockResolvedValue(new Response('{"message":"expired"}', { status: 401 }))
    vi.stubGlobal('fetch', upstream)
    const result = await onRequest({
      request: request('/api/auth/me', { headers: { Cookie: 'classroom_session=test' } }),
    })
    expect(upstream.mock.calls[0][1].headers.get('cookie')).toBe('classroom_session=test')
    expect(result.status).toBe(401)
  })

  it.each(['http://backend.example', 'https://backend.example/api', 'https://cpp.lijie.space'])(
    'rejects invalid or recursive upstream %s',
    async (API_ORIGIN) => {
      const upstream = vi.fn()
      vi.stubGlobal('fetch', upstream)
      const result = await onRequest({ request: request('/api/health'), env: { API_ORIGIN } })
      expect(result.status).toBe(503)
      expect(upstream).not.toHaveBeenCalled()
    },
  )

  it('returns a bounded error without leaking upstream exceptions', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('private details')))
    const result = await onRequest({ request: request('/api/health') })
    expect(result.status).toBe(502)
    expect(await result.text()).not.toContain('private details')
  })
})
