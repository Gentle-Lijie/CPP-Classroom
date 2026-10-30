import { describe, expect, it, vi } from 'vitest'
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common'
import { TeachingController } from './teaching.js'
import type { ClassroomService } from './classroom.js'
import type { AuthRequest } from './common.js'

const classId = '11111111-1111-4111-8111-111111111111'
const studentId = '22222222-2222-4222-8222-222222222222'
const exerciseId = '33333333-3333-4333-8333-333333333333'
const req = (role: 'student' | 'teacher' = 'student') =>
  ({ actor: { id: studentId, role } }) as AuthRequest

function setup(
  query: (sql: string, values?: unknown[]) => Promise<{ rows?: unknown[]; rowCount?: number }>,
) {
  const client = { query: vi.fn(query), release: vi.fn() }
  const pool = { query: vi.fn(query), connect: vi.fn(async () => client) }
  const service = {
    pool,
    access: vi.fn(),
    exercise: vi.fn(async () => ({ e: { id: exerciseId, language: 'cpp', filename: 'main.cpp' } })),
    lockWritable: vi.fn(async () => ({ status: '进行中', settings: { allowResubmit: false } })),
    audit: vi.fn(),
  }
  return {
    controller: new TeachingController(service as unknown as ClassroomService),
    client,
    pool,
    service,
  }
}

describe('teaching lifecycle safeguards', () => {
  it.each([false, true])(
    'deduplicates unresolved help requests (existing=%s)',
    async (existing) => {
      const mock = setup(async (sql) => {
        if (sql.startsWith('select id from help_requests'))
          return { rows: existing ? [{ id: 'help-id' }] : [] }
        if (sql.startsWith('insert into help_requests') || sql.startsWith('update help_requests'))
          return { rows: [{ id: 'help-id', message: 'help' }] }
        return { rows: [] }
      })
      await expect(
        mock.controller.help(classId, { exerciseId, message: 'help' }, req()),
      ).resolves.toMatchObject({ id: 'help-id' })
      expect(
        mock.client.query.mock.calls.some(([sql]) =>
          sql.startsWith(existing ? 'update help_requests' : 'insert into help_requests'),
        ),
      ).toBe(true)
      expect(mock.client.query.mock.calls.at(-1)?.[0]).toBe('commit')
      expect(mock.client.release).toHaveBeenCalledOnce()
    },
  )

  it('resolves only the selected student and request', async () => {
    const mock = setup(async () => ({ rows: [], rowCount: 1 }))
    await expect(
      mock.controller.resolve(classId, studentId, { requestId: exerciseId }, req('teacher')),
    ).resolves.toEqual({ ok: true, resolved: 1 })
    expect(mock.pool.query.mock.calls[0]?.[1]).toEqual([classId, studentId, exerciseId, null])
  })

  it.each([
    { count: 10001, bytes: 0 },
    { count: 1, bytes: 64 * 1024 * 1024 + 1 },
  ])('rejects oversized exports in the read-only snapshot transaction', async (size) => {
    const mock = setup(async (sql) =>
      sql.startsWith('select count(*)::int as count') ? { rows: [size] } : { rows: [] },
    )
    await expect(mock.controller.export(classId, {}, req('teacher'))).rejects.toBeInstanceOf(
      BadRequestException,
    )
    expect(mock.client.query.mock.calls[0]?.[0]).toBe(
      'begin isolation level repeatable read read only',
    )
    expect(mock.client.query.mock.calls.at(-1)?.[0]).toBe('rollback')
    expect(
      mock.client.query.mock.calls.some(([sql]) => sql.startsWith('select * from drafts')),
    ).toBe(false)
  })

  it('rejects resubmission and stale draft revisions', async () => {
    const body = { exerciseId, revision: 2 }
    const previous = setup(async (sql) => {
      if (sql.startsWith('select id,status,filename'))
        return { rows: [{ status: '已发布', filename: 'main.cpp' }] }
      if (sql.startsWith('select * from submissions')) return { rows: [{ revision: 1 }] }
      return { rows: [] }
    })
    await expect(previous.controller.submit(classId, body, req())).rejects.toBeInstanceOf(
      ForbiddenException,
    )
    expect(previous.client.query.mock.calls.at(-1)?.[0]).toBe('rollback')

    const stale = setup(async (sql) => {
      if (sql.startsWith('select id,status,filename'))
        return { rows: [{ status: '已发布', filename: 'main.cpp' }] }
      if (sql.startsWith('insert into submissions')) return { rows: [], rowCount: 0 }
      return { rows: [] }
    })
    await expect(stale.controller.submit(classId, body, req())).rejects.toBeInstanceOf(
      ConflictException,
    )
    expect(stale.client.query.mock.calls.at(-1)?.[0]).toBe('rollback')
  })

  it('rejects expired or revoked projections', async () => {
    const mock = setup(async () => ({ rows: [] }))
    await expect(
      mock.controller.projection(classId, exerciseId, req('teacher')),
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(mock.pool.query.mock.calls[0]?.[0]).toContain('not revoked and expires_at>now()')
  })
})
