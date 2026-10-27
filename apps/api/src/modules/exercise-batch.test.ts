import { describe, expect, it, vi } from 'vitest'
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common'
import { ClassroomController, type ClassroomService } from './classroom.js'
import type { AuthRequest } from './common.js'

const classId = '33333333-3333-4333-8333-333333333333'
const firstId = '44444444-4444-4444-8444-444444444444'
const secondId = '55555555-5555-4555-8555-555555555555'
const req = {
  actor: { id: '11111111-1111-4111-8111-111111111111', role: 'teacher' },
} as AuthRequest
const targets = [
  { id: firstId, version: 2 },
  { id: secondId, version: 3 },
]
function setup(current = targets, failAudit = false) {
  const query = vi.fn(async (sql: string, _values?: unknown[]) => {
    if (sql.startsWith('select id,version')) return { rows: current }
    if (failAudit && sql.startsWith('insert into audit_events')) throw new Error('audit failed')
    return { rows: [], rowCount: 2 }
  })
  const client = { query, release: vi.fn() }
  const access = vi.fn()
  const connect = vi.fn(async () => client)
  const controller = new ClassroomController({
    access,
    pool: { connect },
  } as unknown as ClassroomService)
  return { controller, query, access, connect, client }
}

describe('atomic exercise batch editing', () => {
  it('patches only selected fields and leaves state and execution alone for topic edits', async () => {
    const mock = setup()
    await expect(
      mock.controller.batchUpdateExercises(
        classId,
        {
          exercises: targets,
          changes: { topic: '  循环  ' },
        },
        req,
      ),
    ).resolves.toEqual({ ids: [firstId, secondId] })
    expect(mock.access).toHaveBeenCalledWith(req.actor, classId, true)
    const update = mock.query.mock.calls.find(([sql]) => sql.startsWith('update exercises'))!
    expect(update[0]).toContain('content=content || $4::jsonb')
    expect(update[1]).toEqual([classId, [firstId, secondId], null, '{"topic":"循环"}'])
    expect(
      mock.query.mock.calls.some(
        ([sql]) => sql.startsWith('update runs') || sql.startsWith('update classrooms'),
      ),
    ).toBe(false)
    expect(mock.query.mock.calls.at(-1)?.[0]).toBe('commit')
    expect(mock.client.release).toHaveBeenCalledOnce()
  })
  it.each(['草稿', '已关闭'])(
    'stops active runs and clears selected recommendations for %s',
    async (status) => {
      const mock = setup()
      await mock.controller.batchUpdateExercises(
        classId,
        { exercises: targets, changes: { status, topic: '' } },
        req,
      )
      expect(mock.query.mock.calls.find(([sql]) => sql.startsWith('update runs'))?.[1]).toEqual([
        classId,
        [firstId, secondId],
      ])
      expect(
        mock.query.mock.calls.find(([sql]) => sql.startsWith('update classrooms'))?.[1],
      ).toEqual([classId, [firstId, secondId]])
      expect(
        mock.query.mock.calls.find(([sql]) => sql.startsWith('update exercises'))?.[1]?.[3],
      ).toBe(JSON.stringify({ status, topic: '' }))
    },
  )
  it('publishes without stopping runs or assigning a recommendation', async () => {
    const mock = setup()
    await mock.controller.batchUpdateExercises(
      classId,
      { exercises: targets, changes: { status: '已发布' } },
      req,
    )
    expect(
      mock.query.mock.calls.some(
        ([sql]) => sql.startsWith('update runs') || sql.startsWith('update classrooms'),
      ),
    ).toBe(false)
  })
  it.each(
    [[{ id: firstId, version: 1 }, targets[1]!], [targets[0]!], []].map((current) => ({ current })),
  )('rejects stale, missing or foreign-class targets before any writes', async ({ current }) => {
    const mock = setup(current)
    await expect(
      mock.controller.batchUpdateExercises(
        classId,
        { exercises: targets, changes: { status: '已发布' } },
        req,
      ),
    ).rejects.toBeInstanceOf(ConflictException)
    expect(mock.query.mock.calls.some(([sql]) => sql.startsWith('update '))).toBe(false)
    expect(mock.query.mock.calls.at(-1)?.[0]).toBe('rollback')
    expect(mock.client.release).toHaveBeenCalledOnce()
  })
  it('rolls back the entire batch when a later write fails', async () => {
    const mock = setup(targets, true)
    await expect(
      mock.controller.batchUpdateExercises(
        classId,
        { exercises: targets, changes: { status: '已关闭' } },
        req,
      ),
    ).rejects.toThrow('audit failed')
    expect(mock.query.mock.calls.at(-1)?.[0]).toBe('rollback')
    expect(mock.query.mock.calls.some(([sql]) => sql === 'commit')).toBe(false)
  })
  it.each([
    { exercises: [], changes: { status: '草稿' } },
    { exercises: [targets[0], targets[0]], changes: { topic: '' } },
    { exercises: targets, changes: {} },
    { exercises: targets, changes: { filename: 'same.cpp' } },
    { exercises: targets, changes: { status: 'invalid' } },
    { exercises: targets, changes: { topic: 'bad\0text' } },
    { exercises: targets, changes: { topic: 'x'.repeat(101) } },
    { exercises: [{ id: firstId }], changes: { topic: '' } },
    { exercises: targets, changes: { version: 3 } },
  ])('rejects invalid patches before opening a transaction', async (body) => {
    const mock = setup()
    await expect(mock.controller.batchUpdateExercises(classId, body, req)).rejects.toBeInstanceOf(
      BadRequestException,
    )
    expect(mock.connect).not.toHaveBeenCalled()
  })
  it('requires teacher ownership before accessing targets', async () => {
    const mock = setup()
    mock.access.mockRejectedValue(new ForbiddenException())
    await expect(
      mock.controller.batchUpdateExercises(
        classId,
        { exercises: targets, changes: { topic: '' } },
        req,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException)
    expect(mock.connect).not.toHaveBeenCalled()
  })
})
