import { describe, expect, it, vi } from 'vitest'
import type { Response } from 'express'
import { AuthController, passwordHash, verifyPassword } from './auth.js'
import type { DatabaseService } from '../database.service.js'
import type { AuthRequest } from './common.js'

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

/** A deterministic single-user DB model with transaction-scoped row locking.
 * Both actual controller methods run against it; pausing the first login read
 * forces a password change to compete with the in-flight authentication.
 */
function databaseModel(options: { pauseLogin?: boolean; failCommit?: boolean } = {}) {
  const loginRead = deferred(),
    resumeLogin = deferred(),
    resetAttempted = deferred()
  const user = {
    id: '11111111-1111-4111-8111-111111111111',
    username: 'synthetic',
    name: '合成用户',
    number: '',
    role: 'student',
    password_hash: passwordHash('old-long-password'),
  }
  const sessions = new Set<string>()
  const statements: string[] = []
  let attempts = 0,
    releases = 0
  let lockTail = Promise.resolve()
  async function rowLock() {
    const preceding = lockTail,
      next = deferred()
    lockTail = next.promise
    await preceding
    return next.resolve
  }
  function connection() {
    let unlock: (() => void) | undefined
    const query = async (sql: string, params: unknown[] = []) => {
      statements.push(sql)
      if (sql.startsWith('insert into login_attempts')) {
        attempts++
        return { rows: [{ count: attempts }], rowCount: 1 }
      }
      if (sql.startsWith('select') && sql.includes('from users')) {
        const login = sql.startsWith('select *')
        if (!login) resetAttempted.resolve()
        if (sql.includes('for update')) unlock = await rowLock()
        const snapshot = { ...user }
        if (login && options.pauseLogin) {
          loginRead.resolve()
          await resumeLogin.promise
        }
        return { rows: [snapshot], rowCount: 1 }
      }
      if (sql.startsWith('update users')) user.password_hash = String(params[0])
      if (sql.startsWith('insert into sessions')) sessions.add(String(params[0]))
      if (sql.startsWith('delete from sessions') && !sql.includes('expires_at')) sessions.clear()
      if (sql.startsWith('delete from login_attempts')) attempts = 0
      if (sql === 'commit' && options.failCommit) throw new Error('commit unavailable')
      if (sql === 'commit' || sql === 'rollback') {
        unlock?.()
        unlock = undefined
      }
      return { rows: [], rowCount: 1 }
    }
    return {
      query,
      release() {
        releases++
        unlock?.()
        unlock = undefined
      },
    }
  }
  const direct = connection()
  const controller = new AuthController({
    database: { pool: { query: direct.query, connect: async () => connection() } },
  } as unknown as DatabaseService)
  const req = { ip: '127.0.0.1', secure: false, actor: user } as unknown as AuthRequest
  return {
    controller,
    req,
    user,
    sessions,
    statements,
    loginRead,
    resumeLogin,
    resetAttempted,
    get attempts() {
      return attempts
    },
    get releases() {
      return releases
    },
  }
}

describe('login and password-change serialization', () => {
  it('cannot mint an old-password session after a concurrent password change has revoked prior sessions', async () => {
    const model = databaseModel({ pauseLogin: true })
    const cookie = vi.fn(),
      response = { cookie } as unknown as Response
    const login = model.controller.login(
      { username: model.user.username, password: 'old-long-password' },
      model.req,
      response,
    )
    await model.loginRead.promise
    const change = model.controller.password(
      { current: 'old-long-password', password: 'new-long-password' },
      model.req,
    )
    await model.resetAttempted.promise
    // Give an unlocked reset enough opportunity to commit before resuming login.
    // A correctly locked reset remains pending until the login transaction ends.
    await new Promise<void>((resolve) => setImmediate(resolve))
    model.resumeLogin.resolve()
    await Promise.all([login, change])
    expect(verifyPassword('new-long-password', model.user.password_hash)).toBe(true)
    expect(verifyPassword('old-long-password', model.user.password_hash)).toBe(false)
    expect(model.sessions.size).toBe(0)
    expect(cookie).toHaveBeenCalledOnce()
    expect(model.releases).toBe(2)
  })
  it('never sets an authentication cookie if committing the session fails', async () => {
    const model = databaseModel({ failCommit: true })
    const cookie = vi.fn()
    await expect(
      model.controller.login(
        { username: model.user.username, password: 'old-long-password' },
        model.req,
        { cookie } as unknown as Response,
      ),
    ).rejects.toThrow('commit unavailable')
    expect(cookie).not.toHaveBeenCalled()
    expect(model.statements.at(-1)).toBe('rollback')
    expect(model.releases).toBe(1)
  })
  it('keeps the failed-login counter while rolling back and releasing a rejected login', async () => {
    const model = databaseModel()
    const cookie = vi.fn()
    await expect(
      model.controller.login(
        { username: model.user.username, password: 'wrong-password' },
        model.req,
        { cookie } as unknown as Response,
      ),
    ).rejects.toThrow('账号或密码不正确')
    expect(model.attempts).toBe(1)
    expect(model.sessions.size).toBe(0)
    expect(cookie).not.toHaveBeenCalled()
    expect(model.statements.at(-1)).toBe('rollback')
    expect(model.releases).toBe(1)
  })
})
