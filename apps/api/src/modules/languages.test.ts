import { BadRequestException, ConflictException } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'
import { WorkspaceController } from './workspace.js'
import { TeachingController } from './teaching.js'
import type { ClassroomService } from './classroom.js'
import type { AuthRequest } from './common.js'

const classId = '11111111-1111-4111-8111-111111111111'
const exerciseId = '22222222-2222-4222-8222-222222222222'
const userId = '33333333-3333-4333-8333-333333333333'
const req = { actor: { id: userId, role: 'student' } } as AuthRequest
const exercise = {
  id: exerciseId,
  status: '已发布',
  filename: 'example.cpp',
  language: 'cpp',
  starters: { cpp: 'int main() {}', python: 'print("你好")' },
  content: { code: 'old C++', title: 'Example' },
}

function setup(handler: (sql: string, params: unknown[]) => unknown = () => undefined) {
  const query = vi.fn(
    async (sql: string, params: unknown[] = []) =>
      handler(sql, params) ?? { rows: [], rowCount: 0 },
  )
  const client = { query, release: vi.fn() }
  const service = {
    access: vi.fn(),
    exercise: vi.fn(async () => ({ e: exercise })),
    lockWritable: vi.fn(async () => ({ status: '进行中', settings: { allowResubmit: false } })),
    pool: { query, connect: vi.fn(async () => client) },
  } as unknown as ClassroomService
  return {
    query,
    service,
    client,
    workspace: new WorkspaceController(service),
    teaching: new TeachingController(service),
  }
}

describe('independent language workspaces', () => {
  it('selects the matching starter without using a C++ draft or submission', async () => {
    const mock = setup((sql, params) => {
      if (sql.includes('from drafts') && params[3] === 'cpp')
        return { rows: [{ code: 'saved C++', revision: 8 }] }
      return undefined
    })
    expect(await mock.workspace.get(classId, exerciseId, undefined, 'python', req)).toMatchObject({
      language: 'python',
      code: 'print("你好")',
      revision: 0,
      submitted: false,
    })
    expect(await mock.workspace.get(classId, exerciseId, undefined, 'cpp', req)).toMatchObject({
      language: 'cpp',
      code: 'saved C++',
      revision: 8,
    })
    for (const [sql, params] of mock.query.mock.calls) {
      expect(sql).toContain('language=$4')
      expect(params[3]).toMatch(/^(cpp|python)$/)
    }
  })

  it('scopes optimistic revisions and initial draft insertion to the selected language', async () => {
    const mock = setup((sql, params) =>
      sql.startsWith('update drafts') && params[5] === 'python' && params[4] === 2
        ? { rows: [{ revision: 3, language: 'python' }], rowCount: 1 }
        : undefined,
    )
    expect(
      await mock.workspace.save(
        classId,
        exerciseId,
        { code: 'print(2)', revision: 2, language: 'python' },
        req,
      ),
    ).toEqual({ revision: 3, language: 'python' })
    const insert = mock.query.mock.calls.find(([sql]) => sql.startsWith('insert into drafts'))!
    expect(insert[0]).toContain('on conflict(user_id,exercise_id,language)')
    const update = mock.query.mock.calls.find(([sql]) => sql.startsWith('update drafts'))!
    expect(update[0]).toContain('language=$6')
    expect(update[1]).toEqual([classId, exerciseId, userId, 'print(2)', 2, 'python'])
    await expect(
      mock.workspace.save(
        classId,
        exerciseId,
        { code: 'stale', revision: 1, language: 'python' },
        req,
      ),
    ).rejects.toBeInstanceOf(ConflictException)
  })

  it('rejects unknown languages before touching the database', async () => {
    const mock = setup()
    await expect(
      mock.workspace.get(classId, exerciseId, undefined, 'shell', req),
    ).rejects.toBeInstanceOf(BadRequestException)
    await expect(
      mock.workspace.save(classId, exerciseId, { code: 'ls', revision: 0, language: 'shell' }, req),
    ).rejects.toBeInstanceOf(BadRequestException)
    expect(mock.query).not.toHaveBeenCalled()
  })
})

describe('language-aware submissions and projections', () => {
  it('can submit Python independently when C++ has the same revision and resubmission is disabled', async () => {
    const mock = setup((sql, params) => {
      if (sql.startsWith('select id,status,filename,language')) return { rows: [exercise] }
      if (sql.startsWith('select * from submissions'))
        return {
          rows: params[3] === 'cpp' ? [{ id: 'existing-cpp', revision: 2, language: 'cpp' }] : [],
        }
      if (sql.startsWith('insert into submissions'))
        return { rows: [{ id: 'python-submission', language: params[5] }], rowCount: 1 }
      return undefined
    })
    expect(
      await mock.teaching.submit(classId, { exerciseId, revision: 2, language: 'python' }, req),
    ).toEqual({ id: 'python-submission', language: 'python' })
    const write = mock.query.mock.calls.find(([sql]) => sql.startsWith('insert into submissions'))!
    expect(write[0]).toContain('and language=$6')
    expect(write[1][3]).toBe(`exercise-${exerciseId}.py`)
    expect(
      await mock.teaching.submit(classId, { exerciseId, revision: 2, language: 'cpp' }, req),
    ).toMatchObject({ id: 'existing-cpp', language: 'cpp' })
  })

  it('groups latest submissions separately for each language', async () => {
    const mock = setup()
    await mock.teaching.submissions(classId, { latest: 'true', language: 'python' }, req)
    const [sql, params] = mock.query.mock.calls[0]!
    expect(sql).toContain('partition by s.user_id,s.exercise_id,s.language')
    expect(sql).toContain('s.language=$6')
    expect(params[5]).toBe('python')
  })

  it('freezes a Python draft projection with its language and matching starter', async () => {
    let snapshot: Record<string, unknown> | undefined
    const mock = setup((sql, params) => {
      if (sql.includes('from memberships')) return { rows: [{}], rowCount: 1 }
      if (sql.startsWith('insert into projections')) {
        snapshot = JSON.parse(String(params[2]))
        return { rows: [{ id: 'projection' }] }
      }
      return undefined
    })
    await mock.teaching.project(classId, { student: userId, exerciseId, language: 'python' }, req)
    expect(snapshot).toMatchObject({
      code: 'print("你好")',
      language: 'python',
      filename: `exercise-${exerciseId}.py`,
      kind: 'draft',
    })
    const query = mock.query.mock.calls.find(([sql]) => sql.includes('from drafts'))!
    expect(query[0]).toContain('language=$4')
    expect(query[1][3]).toBe('python')
  })
})
