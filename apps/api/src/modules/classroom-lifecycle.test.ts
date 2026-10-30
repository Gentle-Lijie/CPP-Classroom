import { describe, expect, it, vi } from 'vitest'
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { ClassroomController, type ClassroomService } from './classroom.js'
import { WorkspaceController } from './workspace.js'
import type { AuthRequest } from './common.js'

const classId = '11111111-1111-4111-8111-111111111111'
const studentId = '22222222-2222-4222-8222-222222222222'
const exerciseId = '33333333-3333-4333-8333-333333333333'
const req = (role: 'teacher' | 'student') => ({ actor: { id: studentId, role } }) as AuthRequest
function setup(
  query: (sql: string, values?: unknown[]) => Promise<{ rows?: unknown[]; rowCount?: number }>,
) {
  const client = { query: vi.fn(query), release: vi.fn() }
  const pool = { query: vi.fn(query), connect: vi.fn(async () => client) }
  return {
    controller: new ClassroomController({ access: vi.fn(), pool } as unknown as ClassroomService),
    client,
    pool,
  }
}

describe('classroom lifecycle transitions', () => {
  it.each([
    { status: '已归档', settings: {}, member: undefined },
    { status: '已关闭', settings: {}, member: undefined },
    { status: '进行中', settings: {}, member: { status: 'removed' } },
    { status: '进行中', settings: { access: 'roster' }, member: undefined },
  ])('enforces join authorization: %j', async ({ status, settings, member }) => {
    const mock = setup(async (sql) => {
      if (sql.startsWith('select * from classrooms'))
        return {
          rows: [
            { id: classId, invite_expires_at: new Date(Date.now() + 60000), status, settings },
          ],
        }
      if (sql.startsWith('select * from memberships')) return { rows: member ? [member] : [] }
      return { rows: [] }
    })
    await expect(mock.controller.join({ code: 'ABC' }, req('student'))).rejects.toBeInstanceOf(
      ForbiddenException,
    )
    expect(mock.client.query.mock.calls.at(-1)?.[0]).toBe('rollback')
  })

  it.each([undefined, { status: 'active' }])(
    'admits an eligible join without duplicating existing membership',
    async (member) => {
      const mock = setup(async (sql) => {
        if (sql.startsWith('select * from classrooms'))
          return {
            rows: [
              {
                id: classId,
                invite_expires_at: new Date(Date.now() + 60000),
                status: '进行中',
                settings: {},
              },
            ],
          }
        if (sql.startsWith('select * from memberships')) return { rows: member ? [member] : [] }
        if (sql.startsWith('select count(*)')) return { rows: [{ count: 0 }] }
        return { rows: [] }
      })
      await expect(mock.controller.join({ code: 'abc' }, req('student'))).resolves.toEqual({
        id: classId,
        status: member?.status ?? 'pending',
      })
      expect(mock.client.query.mock.calls.at(-1)?.[0]).toBe('commit')
      expect(mock.client.release).toHaveBeenCalledOnce()
    },
  )

  it('rejects reducing capacity below the active roster', async () => {
    const mock = setup(async (sql) => {
      if (sql.startsWith('select * from classrooms')) return { rows: [{ settings: {} }] }
      if (sql.startsWith('select count(*)')) return { rows: [{ count: 2 }] }
      return { rows: [] }
    })
    await expect(
      mock.controller.update(classId, { settings: { capacity: 1 } }, req('teacher')),
    ).rejects.toBeInstanceOf(ConflictException)
    expect(mock.client.query.mock.calls.some(([sql]) => sql.startsWith('update classrooms'))).toBe(
      false,
    )
  })

  it('rotates an expiring invitation and validates the complete reordered exercise list', async () => {
    const another = '44444444-4444-4444-8444-444444444444'
    const mock = setup(async (sql) => {
      if (sql.startsWith('select id from exercises'))
        return { rows: [{ id: exerciseId }, { id: another }] }
      if (sql.startsWith('update classrooms set invite_code'))
        return { rows: [{ inviteCode: 'new-code' }] }
      return { rows: [] }
    })
    await expect(mock.controller.invite(classId, req('teacher'))).resolves.toEqual({
      inviteCode: 'new-code',
    })
    expect(mock.pool.query.mock.calls[0]?.[0]).toContain("interval '7 days'")
    await expect(
      mock.controller.reorder(classId, { ids: [exerciseId, exerciseId] }, req('teacher')),
    ).rejects.toBeInstanceOf(ConflictException)
    await expect(
      mock.controller.reorder(classId, { ids: [another, exerciseId] }, req('teacher')),
    ).resolves.toEqual({ ok: true })
    const update = mock.client.query.mock.calls.find(([sql]) =>
      sql.startsWith('update exercises e set position'),
    )
    expect(update?.[1]).toEqual([classId, [another, exerciseId]])
  })

  it('validates the selected exercise before updating a student heartbeat', async () => {
    const query = vi.fn(async (_sql: string, _values?: unknown[]) => ({ rows: [] }))
    const access = vi.fn()
    const exercise = vi.fn()
    const service = { access, exercise, pool: { query } } as unknown as ClassroomService
    await expect(
      new WorkspaceController(service).heartbeat(
        classId,
        { exerciseId, language: 'python' },
        req('student'),
      ),
    ).resolves.toEqual({ ok: true })
    expect(exercise).toHaveBeenCalledWith(req('student').actor, classId, exerciseId)
    expect(query.mock.calls[0]?.[1]).toEqual([classId, studentId, exerciseId, 'python'])
  })

  it('rejects expired invites and classrooms at capacity', async () => {
    const expired = setup(async (sql) =>
      sql.startsWith('select * from classrooms')
        ? { rows: [{ invite_expires_at: new Date(0), settings: {}, status: '进行中' }] }
        : { rows: [] },
    )
    await expect(expired.controller.join({ code: 'ABC' }, req('student'))).rejects.toBeInstanceOf(
      NotFoundException,
    )
    const full = setup(async (sql) => {
      if (sql.startsWith('select * from classrooms'))
        return {
          rows: [
            {
              id: classId,
              invite_expires_at: new Date(Date.now() + 60000),
              settings: { capacity: 1 },
              status: '进行中',
            },
          ],
        }
      if (sql.startsWith('select count(*)')) return { rows: [{ count: 1 }] }
      return { rows: [] }
    })
    await expect(full.controller.join({ code: 'ABC' }, req('student'))).rejects.toBeInstanceOf(
      ConflictException,
    )
    expect(full.client.query.mock.calls.at(-1)?.[0]).toBe('rollback')
  })

  it('rejects joins when the teacher closes admission', async () => {
    const mock = setup(async (sql) =>
      sql.startsWith('select * from classrooms')
        ? {
            rows: [
              {
                id: classId,
                invite_expires_at: new Date(Date.now() + 60000),
                settings: { allowJoin: false },
                status: '进行中',
              },
            ],
          }
        : { rows: [] },
    )
    await expect(mock.controller.join({ code: 'ABC' }, req('student'))).rejects.toBeInstanceOf(
      ForbiddenException,
    )
  })

  it('stops active runs when a classroom or exercise closes', async () => {
    const mock = setup(async (sql) => {
      if (sql.startsWith('select * from classrooms'))
        return {
          rows: [
            {
              id: classId,
              name: 'class',
              description: '',
              status: '进行中',
              settings: {},
              recommended: exerciseId,
            },
          ],
        }
      if (sql.startsWith('update exercises set status'))
        return { rows: [{ id: exerciseId }], rowCount: 1 }
      return { rows: [] }
    })
    await expect(
      mock.controller.update(classId, { status: '已归档' }, req('teacher')),
    ).resolves.toEqual({ ok: true })
    await expect(
      mock.controller.closeExercise(classId, exerciseId, req('teacher')),
    ).resolves.toEqual({ ok: true })
    const stopQueries = mock.client.query.mock.calls.filter(([sql]) =>
      sql.includes('update runs set stop_requested=true'),
    )
    expect(stopQueries).toHaveLength(2)
    expect(stopQueries[0]?.[1]).toEqual([classId])
    expect(stopQueries[1]?.[1]).toEqual([classId, exerciseId])
  })

  it('refuses approval at capacity and stops runs on member removal', async () => {
    const mock = setup(async (sql) => {
      if (sql.startsWith('select settings')) return { rows: [{ settings: { capacity: 1 } }] }
      if (sql.startsWith('select status from memberships')) return { rows: [{ status: 'pending' }] }
      if (sql.startsWith('select count(*)')) return { rows: [{ count: 1 }] }
      if (sql.startsWith('update memberships')) return { rows: [{ id: 'member' }], rowCount: 1 }
      return { rows: [] }
    })
    await expect(
      mock.controller.member(classId, studentId, { status: 'active' }, req('teacher')),
    ).rejects.toBeInstanceOf(ConflictException)
    await expect(
      mock.controller.member(classId, studentId, { status: 'removed' }, req('teacher')),
    ).resolves.toEqual({ ok: true })
    expect(
      mock.client.query.mock.calls.some(([sql]) =>
        sql.includes('update runs set stop_requested=true'),
      ),
    ).toBe(true)
  })
})
