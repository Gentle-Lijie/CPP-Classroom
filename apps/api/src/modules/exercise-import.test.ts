import { describe, expect, it, vi } from 'vitest'
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common'
import { ClassroomController, type ClassroomService } from './classroom.js'
import type { AuthRequest } from './common.js'

const classId = '33333333-3333-4333-8333-333333333333'
const req = {
  actor: { id: '11111111-1111-4111-8111-111111111111', role: 'teacher' },
} as AuthRequest
function setup(existing: string[] = [], failAt = 0) {
  let inserted = 0
  const writes: unknown[][] = []
  const query = vi.fn(async (sql: string, values?: unknown[]) => {
    if (sql.startsWith('select filename'))
      return { rows: existing.map((filename) => ({ filename })) }
    if (sql.startsWith('select coalesce')) return { rows: [{ position: 7 }] }
    if (sql.startsWith('insert into exercises')) {
      inserted++
      if (inserted === failAt) throw new Error('insert failed')
      writes.push(values!)
      return { rows: [{ id: `new-${inserted}` }] }
    }
    return { rows: [], rowCount: 1 }
  })
  const client = { query, release: vi.fn() }
  const access = vi.fn()
  const connect = vi.fn(async () => client)
  const controller = new ClassroomController({
    access,
    pool: { connect },
  } as unknown as ClassroomService)
  return { controller, query, writes, access, connect, client }
}

describe('atomic exercise batch import', () => {
  it('appends in order as drafts and ignores backup IDs, versions, status and position', async () => {
    const mock = setup()
    await expect(
      mock.controller.importExercises(
        classId,
        {
          exercises: [
            {
              title: '第一题',
              filename: 'sum.cpp',
              status: '已发布',
              position: 1,
              version: 99,
              id: 'old',
            },
            { title: '第二题' },
            { title: '第三题' },
          ],
        },
        req,
      ),
    ).resolves.toEqual({ ids: ['new-1', 'new-2', 'new-3'] })
    expect(mock.access).toHaveBeenCalledWith(req.actor, classId, 'teacher')
    expect(mock.writes.map((write) => write.slice(1, 4))).toEqual([
      ['sum.cpp', '草稿', 8],
      ['', '草稿', 9],
      ['', '草稿', 10],
    ])
    const content = JSON.parse(String(mock.writes[0]![4]))
    expect(content).toMatchObject({ title: '第一题', code: '' })
    for (const key of ['id', 'version', 'position', 'status'])
      expect(content).not.toHaveProperty(key)
    expect(mock.query.mock.calls.at(-1)?.[0]).toBe('commit')
    expect(mock.client.release).toHaveBeenCalledOnce()
  })
  it.each([['existing'], ['within-batch']])(
    'rejects %s case-insensitive filename conflicts before writing',
    async (kind) => {
      const mock = setup(kind === 'existing' ? ['SUM.CPP'] : [])
      const exercises =
        kind === 'existing'
          ? [{ filename: 'sum.cpp' }]
          : [{ filename: 'sum.cpp' }, { filename: 'SUM.CPP' }]
      await expect(
        mock.controller.importExercises(classId, { exercises }, req),
      ).rejects.toBeInstanceOf(ConflictException)
      expect(mock.writes).toEqual([])
      expect(mock.query.mock.calls.at(-1)?.[0]).toBe('rollback')
    },
  )
  it('rolls back earlier inserts when a later insert fails', async () => {
    const mock = setup([], 2)
    await expect(
      mock.controller.importExercises(classId, { exercises: [{}, {}] }, req),
    ).rejects.toThrow('insert failed')
    expect(mock.writes).toHaveLength(1)
    expect(mock.query.mock.calls.at(-1)?.[0]).toBe('rollback')
    expect(mock.query.mock.calls.some(([sql]) => sql === 'commit')).toBe(false)
    expect(mock.client.release).toHaveBeenCalledOnce()
  })
  it.each([
    { exercises: [] },
    { exercises: Array.from({ length: 51 }, () => ({})) },
    { exercises: [{ filename: '../sum.cpp' }] },
    { exercises: [{ filename: 'sum.py', language: 'cpp' }] },
    { exercises: [{ filename: 'sum.cpp', language: 'python' }] },
    { exercises: [{ starters: { python: 'bad\0starter' } }] },
    { exercises: [{ input: 'x'.repeat(10001) }] },
    { exercises: [{ description: 'bad\0text' }] },
    { exercises: Array.from({ length: 6 }, () => ({ description: 'x'.repeat(100000) })) },
  ])('rejects invalid or oversized batches before opening a transaction', async (body) => {
    const mock = setup()
    await expect(mock.controller.importExercises(classId, body, req)).rejects.toBeInstanceOf(
      BadRequestException,
    )
    expect(mock.connect).not.toHaveBeenCalled()
  })
  it('requires classroom write ownership before opening a transaction', async () => {
    const mock = setup()
    mock.access.mockRejectedValue(new ForbiddenException())
    await expect(
      mock.controller.importExercises(classId, { exercises: [{}] }, req),
    ).rejects.toBeInstanceOf(ForbiddenException)
    expect(mock.connect).not.toHaveBeenCalled()
  })
})

it('imports Python with both templates and allows a literal Unicode escape in source', async () => {
  const mock = setup()
  await mock.controller.importExercises(
    classId,
    {
      exercises: [
        {
          filename: 'hello.py',
          language: 'python',
          code: 'print(1)',
          starters: { cpp: 'int main() {}', python: 'print("\\u0000")' },
        },
      ],
    },
    req,
  )
  expect(mock.writes[0]?.[5]).toBe('python')
  expect(JSON.parse(String(mock.writes[0]?.[6]))).toEqual({
    cpp: 'int main() {}',
    python: 'print("\\u0000")',
  })
})
