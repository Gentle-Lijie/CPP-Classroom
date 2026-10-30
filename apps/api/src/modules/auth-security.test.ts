import { describe, expect, it, vi } from 'vitest'
import { HttpException, UnauthorizedException, type ExecutionContext } from '@nestjs/common'
import type { Response } from 'express'
import { AuthController, AuthGuard } from './auth.js'
import type { AuthRequest } from './common.js'
import type { DatabaseService } from '../database.service.js'

function request(overrides: Record<string, unknown> = {}) {
  return {
    method: 'POST',
    path: '/api/classes',
    ip: '127.0.0.1',
    headers: { host: 'classroom.example', 'content-type': 'application/json' },
    ...overrides,
  } as unknown as AuthRequest
}
function context(req: AuthRequest) {
  return { switchToHttp: () => ({ getRequest: () => req }) } as unknown as ExecutionContext
}

describe('API authentication gate', () => {
  const query = vi.fn(async () => ({ rows: [] }))
  const guard = new AuthGuard({ database: { pool: { query } } } as unknown as DatabaseService)

  it('rejects cross-origin, cross-site, malformed-origin and non-JSON mutations', async () => {
    for (const headers of [
      { origin: 'https://elsewhere.example' },
      { origin: '%broken' },
      { 'sec-fetch-site': 'cross-site' },
      { 'content-type': 'text/plain' },
    ]) {
      await expect(
        guard.canActivate(
          context(
            request({
              headers: {
                host: 'classroom.example',
                'content-type': 'application/json',
                ...headers,
              },
            }),
          ),
        ),
      ).rejects.toBeInstanceOf(UnauthorizedException)
    }
  })

  it('admits public paths and rejects missing or invalid sessions', async () => {
    await expect(guard.canActivate(context(request({ path: '/api/auth/login' })))).resolves.toBe(
      true,
    )
    await expect(guard.canActivate(context(request()))).rejects.toBeInstanceOf(
      UnauthorizedException,
    )
    query.mockResolvedValueOnce({ rows: [] })
    await expect(
      guard.canActivate(
        context(
          request({
            headers: {
              host: 'classroom.example',
              'content-type': 'application/json',
              cookie: 'classroom_session=token',
            },
          }),
        ),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException)
    expect(String(query.mock.calls.at(-1)?.[0])).toContain('s.expires_at>now() and not u.disabled')
  })

  it('attaches a validated actor to a valid session', async () => {
    const actor = { id: 'user', role: 'teacher' }
    query.mockResolvedValueOnce({ rows: [actor] })
    const req = request({
      headers: {
        host: 'classroom.example',
        'content-type': 'application/json',
        cookie: 'classroom_session=token',
      },
    })
    await expect(guard.canActivate(context(req))).resolves.toBe(true)
    expect(req.actor).toEqual(actor)
  })
})

describe('authentication attempt limits', () => {
  function controller(ipCount: number, userCount: number) {
    const query = vi.fn(async (sql: string, _values?: unknown[]) => ({
      rows: [
        {
          count: sql.includes('login_attempts')
            ? query.mock.calls.length === 1
              ? ipCount
              : userCount
            : 0,
        },
      ],
    }))
    const connect = vi.fn()
    return {
      controller: new AuthController({
        database: { pool: { query, connect } },
      } as unknown as DatabaseService),
      query,
      connect,
    }
  }
  const req = request({ secure: false })
  const res = {} as Response

  it('caps all logins from an IP before expensive password work', async () => {
    const mock = controller(501, 0)
    await expect(
      mock.controller.login({ username: 'fresh-name', password: 'x' }, req, res),
    ).rejects.toMatchObject({ status: 429 })
    expect(mock.query).toHaveBeenCalledOnce()
    expect(mock.connect).not.toHaveBeenCalled()
  })

  it('caps repeated usernames even below the IP limit', async () => {
    const mock = controller(20, 21)
    await expect(
      mock.controller.login({ username: 'same-name', password: 'x' }, req, res),
    ).rejects.toMatchObject({ status: 429 })
    expect(mock.query).toHaveBeenCalledTimes(2)
    expect(mock.connect).not.toHaveBeenCalled()
  })

  it('admits the boundary attempt and keeps the IP key stable across usernames', async () => {
    const first = controller(500, 20)
    const second = controller(500, 20)
    for (const [mock, username] of [
      [first, 'first-name'],
      [second, 'another-name'],
    ] as const) {
      mock.connect.mockRejectedValueOnce(new Error('admitted before password work'))
      await expect(mock.controller.login({ username, password: 'x' }, req, res)).rejects.toThrow(
        'admitted before password work',
      )
      expect(mock.connect).toHaveBeenCalledOnce()
    }
    expect(first.query.mock.calls[0]?.[1]).toEqual(second.query.mock.calls[0]?.[1])
    expect(first.query.mock.calls[1]?.[1]).not.toEqual(second.query.mock.calls[1]?.[1])
  })

  it('accepts the tenth recovery attempt', async () => {
    const query = vi.fn(async () => ({ rows: [{ count: 10 }] }))
    const controller = new AuthController({
      database: { pool: { query } },
    } as unknown as DatabaseService)
    await expect(controller.recover({ username: 'student' }, req)).resolves.toMatchObject({
      ok: true,
    })
    expect(query).toHaveBeenCalledTimes(2)
  })

  it('caps recovery requests at eleven attempts', async () => {
    const query = vi.fn(async () => ({ rows: [{ count: 11 }] }))
    const controller = new AuthController({
      database: { pool: { query } },
    } as unknown as DatabaseService)
    await expect(controller.recover({ username: 'student' }, req)).rejects.toBeInstanceOf(
      HttpException,
    )
    expect(query).toHaveBeenCalledOnce()
  })
})
