import { describe, expect, it, vi } from 'vitest'
import { ConflictException, ForbiddenException } from '@nestjs/common'
import { RunsController, runDto } from './runs.js'
import { executionDefaults } from '@classroom/contracts'
import type { ClassroomService } from './classroom.js'
import type { AuthRequest } from './common.js'

const userId = '11111111-1111-4111-8111-111111111111'
const classId = '22222222-2222-4222-8222-222222222222'
const exerciseId = '33333333-3333-4333-8333-333333333333'
const body = { exerciseId, revision: 2, input: '7\n', interactive: false }
function setup(
  options: {
    role?: 'teacher' | 'student'
    owner?: string
    disabled?: boolean
    accountRole?: string
    membership?: string
    status?: string
    allowRun?: boolean
    exerciseStatus?: string
    revision?: number
    active?: boolean
    queueSize?: number
    savedSettings?: Record<string, unknown>
  } = {},
) {
  const role = options.role ?? 'teacher'
  const settings = { allowRun: options.allowRun ?? true }
  const query = vi.fn(async (sql: string, values?: unknown[]) => {
    if (sql.startsWith('select status,settings,owner_id'))
      return {
        rows: [{ status: options.status ?? '进行中', settings, owner_id: options.owner ?? userId }],
      }
    if (sql.startsWith('select status,filename,language from exercises'))
      return { rows: [{ status: options.exerciseStatus ?? '已发布' }] }
    if (sql.startsWith('select status from memberships'))
      return { rows: [{ status: options.membership ?? 'active' }] }
    if (sql.startsWith('select disabled,role'))
      return { rows: [{ disabled: options.disabled ?? false, role: options.accountRole ?? role }] }
    if (sql.startsWith('select id from runs')) return { rows: [], rowCount: options.active ? 1 : 0 }
    if (sql.startsWith('select count(*)')) return { rows: [{ n: options.queueSize ?? 0 }] }
    if (sql.startsWith('select value from platform_settings'))
      return { rows: [{ value: options.savedSettings ?? {} }] }
    if (sql.startsWith('select code,revision from drafts'))
      return { rows: [{ code: 'saved teacher source', revision: options.revision ?? 2 }] }
    if (sql.startsWith('insert into runs'))
      return { rows: [{ id: 'run-id', user_id: values?.[2], code: values?.[3], status: '排队' }] }
    return { rows: [] }
  })
  const client = { query, release: vi.fn() }
  const exercise = vi.fn(async () => ({
    c: { settings },
    e: { id: exerciseId, filename: 'demo.cpp' },
  }))
  const controller = new RunsController({
    exercise,
    pool: { connect: vi.fn(async () => client) },
  } as unknown as ClassroomService)
  const req = { actor: { id: userId, role } } as AuthRequest
  return { controller, req, query, client, exercise }
}

describe('teacher demonstration runs', () => {
  it('queues the owning teacher’s saved snapshot without requiring student membership', async () => {
    const mock = setup()
    await expect(
      mock.controller.create(classId, { ...body, code: 'untrusted request code' }, mock.req),
    ).resolves.toMatchObject({ userId, code: 'saved teacher source', status: '排队' })
    expect(mock.exercise).toHaveBeenCalledWith(mock.req.actor, classId, exerciseId, true)
    expect(mock.query.mock.calls.some(([sql]) => sql.includes('from memberships'))).toBe(false)
    expect(mock.query.mock.calls.find(([sql]) => sql.startsWith('insert into runs'))?.[1]).toEqual([
      classId,
      exerciseId,
      userId,
      'saved teacher source',
      'demo.cpp',
      2,
      '7\n',
      false,
      'cpp',
      'gcc13-cpp17',
      JSON.stringify({
        compileTimeMs: executionDefaults.compileTimeMs,
        compileMemoryMb: executionDefaults.compileMemoryMb,
        runTimeMs: executionDefaults.runTimeMs,
        runMemoryMb: executionDefaults.runMemoryMb,
        outputLimitKb: executionDefaults.outputLimitKb,
      }),
      'gcc13-cpp17',
    ])
    expect(mock.query.mock.calls.at(-1)?.[0]).toBe('commit')
    expect(mock.client.release).toHaveBeenCalledOnce()
  })

  it('preserves active students’ run access and membership checks', async () => {
    const mock = setup({ role: 'student' })
    await expect(mock.controller.create(classId, body, mock.req)).resolves.toMatchObject({
      status: '排队',
    })
    expect(mock.query.mock.calls.some(([sql]) => sql.includes('from memberships'))).toBe(true)
  })

  it.each([
    { owner: 'another-teacher' },
    { disabled: true },
    { accountRole: 'student' },
    { status: '已归档' },
    { exerciseStatus: '已关闭' },
    { role: 'student' as const, membership: 'removed' },
  ])('rejects revoked access or read-only state: %j', async (options) => {
    const mock = setup(options)
    await expect(mock.controller.create(classId, body, mock.req)).rejects.toBeInstanceOf(
      ForbiddenException,
    )
    expect(mock.query.mock.calls.some(([sql]) => sql.startsWith('insert into runs'))).toBe(false)
    expect(mock.query.mock.calls.at(-1)?.[0]).toBe('rollback')
    expect(mock.client.release).toHaveBeenCalledOnce()
  })

  it('respects the classroom run switch', async () => {
    const mock = setup({ allowRun: false })
    await expect(mock.controller.create(classId, body, mock.req)).rejects.toBeInstanceOf(
      ForbiddenException,
    )
    expect(mock.query).not.toHaveBeenCalled()
  })

  it.each([{ active: true }, { queueSize: 100 }, { revision: 3 }])(
    'rejects duplicate, full-queue, or stale-snapshot admission: %j',
    async (options) => {
      const mock = setup(options)
      await expect(mock.controller.create(classId, body, mock.req)).rejects.toBeInstanceOf(
        ConflictException,
      )
      expect(mock.query.mock.calls.some(([sql]) => sql.startsWith('insert into runs'))).toBe(false)
      expect(mock.query.mock.calls.at(-1)?.[0]).toBe('rollback')
    },
  )
})

describe('language and environment snapshots', () => {
  it('reads the Python draft and freezes controlled settings, ignoring request profiles', async () => {
    const mock = setup({
      savedSettings: { compilerProfile: 'gcc13-cpp20', runTimeMs: 3400, runMemoryMb: 512 },
    })
    await mock.controller.create(
      classId,
      {
        ...body,
        language: 'python',
        runtimeProfile: 'shell',
        executionConfig: { runTimeMs: 999999 },
      },
      mock.req,
    )
    const draft = mock.query.mock.calls.find(([sql]) =>
      sql.startsWith('select code,revision from drafts'),
    )!
    expect(draft[0]).toContain('language=$3')
    expect(draft[1]).toEqual([userId, exerciseId, 'python'])
    const write = mock.query.mock.calls.find(([sql]) => sql.startsWith('insert into runs'))![1]!
    expect(write[4]).toBe(`exercise-${exerciseId}.py`)
    expect(write[8]).toBe('python')
    expect(write[9]).toBe('cpython3-stdlib')
    expect(JSON.parse(String(write[10]))).toMatchObject({ runTimeMs: 3400, runMemoryMb: 512 })
    expect(write[11]).toBeNull()
  })

  it('preserves unknown historical runtime identity', () => {
    expect(runDto({ language: 'cpp', compiler_profile: null })).toMatchObject({
      language: 'cpp',
      runtimeProfile: null,
    })
    expect(
      runDto({
        language: 'python',
        runtime_profile: 'cpython3-stdlib',
        execution_config: { runTimeMs: 2000 },
      }),
    ).toMatchObject({ runtimeProfile: 'cpython3-stdlib', executionConfig: { runTimeMs: 2000 } })
  })
})
