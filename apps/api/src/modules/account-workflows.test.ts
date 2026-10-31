import { describe, expect, it, vi } from 'vitest'
import { ForbiddenException } from '@nestjs/common'
import { ClassroomController, type ClassroomService } from './classroom.js'
import { AdminController } from './admin.js'
import { AuthController, passwordHash, verifyPassword } from './auth.js'
import type { AuthRequest } from './common.js'
import type { DatabaseService } from '../database.service.js'
import type { Environment } from '@classroom/config'

const teacherId = '11111111-1111-4111-8111-111111111111'
const studentId = '22222222-2222-4222-8222-222222222222'
const classId = '33333333-3333-4333-8333-333333333333'
const req = (role = 'teacher') =>
  ({ actor: { id: teacherId, username: 'teacher', name: '教师', number: '', role } }) as AuthRequest
function service(query: ReturnType<typeof vi.fn>) {
  const client = { query, release: vi.fn() }
  const pool = { connect: vi.fn(async () => client), query }
  return { client, value: { access: vi.fn(), pool, audit: vi.fn() } as unknown as ClassroomService }
}

describe('account recovery authorization and atomicity', () => {
  it('refuses teacher resets unless every selected student is created by that teacher and remains an active enabled member', async () => {
    const query = vi.fn(async () => ({ rows: [], rowCount: 0 }))
    const mock = service(query)
    await expect(
      new ClassroomController(mock.value).resetPasswords(classId, { userIds: [studentId] }, req()),
    ).rejects.toBeInstanceOf(ForbiddenException)
    const statements = query.mock.calls.map((call) => String(call[0]))
    expect(statements.find((sql) => sql.startsWith('select u.id'))).toContain(
      'u.created_by=$3 and not u.disabled',
    )
    expect(statements).toContain('rollback')
    expect(statements.some((sql) => sql.startsWith('update users'))).toBe(false)
    expect(mock.client.release).toHaveBeenCalledOnce()
  })
  it('returns generated credentials only after hashing and revoking prior sessions, without auditing the password', async () => {
    const query = vi.fn(async (sql: string) => ({
      rows: sql.startsWith('select u.id')
        ? [{ id: studentId, name: '学生', number: '001', username: 'student.example' }]
        : [],
      rowCount: 1,
    }))
    const mock = service(query)
    const result = await new ClassroomController(mock.value).resetPasswords(
      classId,
      { userIds: [studentId] },
      req(),
    )
    expect(result).toHaveLength(1)
    const updated = query.mock.calls.find((call) =>
      call[0].startsWith('update users'),
    ) as unknown as [string, unknown[]]
    expect(await verifyPassword(result[0]!.password, String(updated[1][1]))).toBe(true)
    const audit = query.mock.calls.find((call) =>
      call[0].startsWith('insert into audit_events'),
    ) as unknown as [string, unknown[]]
    expect(JSON.stringify(audit)).not.toContain(result[0]!.password)
    expect(query.mock.calls.map((call) => call[0])).toContain(
      'delete from sessions where user_id=any($1::uuid[])',
    )
    expect(query.mock.calls.at(-1)?.[0]).toBe('commit')
  })
  it('does not resolve recovery requests merely when enabling or disabling an account', async () => {
    const query = vi.fn(async (sql: string) => ({
      rows: sql.startsWith('select id,username')
        ? [{ id: studentId, username: 'student.example' }]
        : [],
      rowCount: 1,
    }))
    const mock = service(query)
    await new AdminController(mock.value, {} as Environment).update(req('admin'), studentId, {
      disabled: true,
    })
    expect(query.mock.calls.some((call) => call[0].includes('update recovery_requests'))).toBe(
      false,
    )
    expect(query.mock.calls.at(-1)?.[0]).toBe('commit')
  })
  it('rolls back the complete admin change when session revocation fails', async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.startsWith('delete from sessions')) throw new Error('database unavailable')
      return {
        rows: sql.startsWith('select id,username')
          ? [{ id: studentId, username: 'student.example' }]
          : [],
        rowCount: 1,
      }
    })
    const mock = service(query)
    await expect(
      new AdminController(mock.value, {} as Environment).update(req('admin'), studentId, {
        password: '123456',
      }),
    ).rejects.toThrow('database unavailable')
    expect(query.mock.calls.at(-1)?.[0]).toBe('rollback')
    expect(query.mock.calls.some((call) => call[0] === 'commit')).toBe(false)
  })
  it('preserves whitespace in the current password and accepts short replacements while rejecting empty passwords', async () => {
    const current = '  existing password  '
    const query = vi.fn(async (sql: string) => ({
      rows: sql.startsWith('select password_hash')
        ? [{ password_hash: await passwordHash(current) }]
        : [],
      rowCount: 1,
    }))
    const mock = service(query)
    const controller = new AuthController({
      database: { pool: { connect: async () => mock.client } },
    } as unknown as DatabaseService)
    await expect(controller.password({ current, password: '123456' }, req())).resolves.toEqual({
      ok: true,
    })
    const update = query.mock.calls.find((call) =>
      call[0].startsWith('update users'),
    ) as unknown as [string, unknown[]]
    expect(await verifyPassword('123456', String(update[1][0]))).toBe(true)
    expect(await verifyPassword(current, String(update[1][0]))).toBe(false)
    await expect(controller.password({ current, password: '' }, req())).rejects.toThrow()
    expect(query.mock.calls.some((call) => call[0] === 'commit')).toBe(true)
  })
})

describe('exercise publication validation', () => {
  it('accepts empty and omitted content fields for drafts and published exercises while rejecting unsafe filenames', async () => {
    const { exerciseSchema } = await import('./classroom.js')
    const exercise = {
      title: '输出 Hello',
      topic: '基础',
      filename: 'hello.cpp',
      status: '已发布',
      description: '输出 Hello',
      input: '',
      output: 'Hello',
      sampleInput: '',
      sampleOutput: 'Hello',
      code: 'int main() {}',
    }
    expect(exerciseSchema.safeParse(exercise).success).toBe(true)
    expect(exerciseSchema.parse({ status: '已发布' })).toMatchObject({
      title: '',
      topic: '',
      filename: '',
      description: '',
      input: '',
      output: '',
      sampleInput: '',
      sampleOutput: '',
      code: '',
      status: '已发布',
    })
    expect(exerciseSchema.parse({})).toMatchObject({ status: '草稿', title: '', filename: '' })
    expect(exerciseSchema.safeParse({ ...exercise, description: '   ' }).success).toBe(true)
    expect(exerciseSchema.safeParse({ ...exercise, filename: '../hello.cpp' }).success).toBe(false)
    expect(exerciseSchema.safeParse({ ...exercise, filename: 'CON.cpp' }).success).toBe(false)
    expect(exerciseSchema.safeParse({ ...exercise, filename: '求和.CPP' }).success).toBe(true)
    expect(exerciseSchema.safeParse({ ...exercise, title: 'x'.repeat(101) }).success).toBe(false)
  })
  it('creates and updates exercises with empty filenames without conflicting with other empty filenames', async () => {
    const query = vi.fn(async (sql: string) => ({
      rows: sql.startsWith('insert into exercises') ? [{ id: studentId }] : [{ version: 2 }],
      rowCount: 1,
    }))
    const mock = service(query)
    const controller = new ClassroomController(mock.value)
    await expect(controller.createExercise(classId, {}, req())).resolves.toEqual({ id: studentId })
    await expect(
      controller.updateExercise(classId, studentId, { version: 1 }, req()),
    ).resolves.toEqual({ version: 2 })
    expect(query.mock.calls.some(([sql]) => sql.includes('lower(filename)'))).toBe(false)
    expect(query.mock.calls.filter(([sql]) => sql === 'commit')).toHaveLength(2)
  })
})

describe('teacher classroom write policy', () => {
  it('keeps lesson content read-only outside an active class while allowing classroom management', async () => {
    const { ClassroomService } = await import('./classroom.js')
    const query = vi.fn(async (sql: string) => ({
      rows: sql.includes('from memberships')
        ? [{ status: 'active', role: 'teacher' }]
        : [{ id: classId, owner_id: teacherId, status: '已归档', settings: {} }],
      rowCount: 1,
    }))
    const classroom = new ClassroomService({
      database: { pool: { query } },
    } as unknown as DatabaseService)
    await expect(classroom.access(req().actor!, classId, false, true)).rejects.toBeInstanceOf(
      ForbiddenException,
    )
    await expect(classroom.access(req().actor!, classId, true, false)).resolves.toMatchObject({
      id: classId,
      status: '已归档',
    })
  })
})

describe('adding a single student with optional credentials', () => {
  const body = { name: '刘亦安', number: '2026001' }
  function memberQueries(overrides: {
    user?: { rows: unknown[]; rowCount: number }
    taken?: { rows: unknown[]; rowCount: number }
    member?: { rows: unknown[]; rowCount: number }
    insert?: { rows: unknown[]; rowCount: number }
  }) {
    return vi.fn(async (sql: string) => {
      if (sql.startsWith('select settings')) return { rows: [{ settings: {} }], rowCount: 1 }
      if (sql.startsWith('select count(*)')) return { rows: [{ count: 0 }], rowCount: 1 }
      if (sql.includes('from users u where u.number'))
        return overrides.user ?? { rows: [], rowCount: 0 }
      if (sql.includes('from users where username'))
        return overrides.taken ?? { rows: [], rowCount: 0 }
      if (sql.includes('from memberships where classroom_id=$1 and user_id=$2'))
        return overrides.member ?? { rows: [], rowCount: 0 }
      if (sql.startsWith('insert into memberships'))
        return { rows: [{ id: studentId }], rowCount: 1 }
      if (sql.startsWith('insert into users')) return overrides.insert ?? { rows: [], rowCount: 0 }
      return { rows: [], rowCount: 0 }
    })
  }
  it('creates the account with the requested username and password', async () => {
    const query = memberQueries({
      insert: {
        rows: [
          {
            id: studentId,
            username: 'liu2026',
            role: 'student',
            name: body.name,
            number: body.number,
          },
        ],
        rowCount: 1,
      },
    })
    const result = await new ClassroomController(service(query).value).addMember(
      classId,
      { ...body, username: 'liu2026', password: '班级共享密码' },
      req(),
    )
    expect(result).toMatchObject({ username: 'liu2026', created: true, password: '班级共享密码' })
    const insert = query.mock.calls.find(([sql]) => sql.startsWith('insert into users'))!
    expect(insert[1][0]).toBe('liu2026')
    expect(await verifyPassword('班级共享密码', String(insert[1][3]))).toBe(true)
  })
  it('rejects a requested username that already belongs to another account', async () => {
    const query = memberQueries({ taken: { rows: [1], rowCount: 1 } })
    await expect(
      new ClassroomController(service(query).value).addMember(
        classId,
        { ...body, username: 'taken' },
        req(),
      ),
    ).rejects.toThrow('已被占用')
    expect(query.mock.calls.some(([sql]) => sql.startsWith('insert into users'))).toBe(false)
    expect(query.mock.calls.map(([sql]) => sql)).toContain('rollback')
  })
  it('reuses the existing account for the same student number and keeps its credentials', async () => {
    const query = memberQueries({
      user: {
        rows: [
          {
            id: studentId,
            username: 'student.existing',
            role: 'student',
            name: body.name,
            number: body.number,
            disabled: false,
            created_by: teacherId,
          },
        ],
        rowCount: 1,
      },
      member: { rows: [1], rowCount: 1 },
    })
    const result = await new ClassroomController(service(query).value).addMember(
      classId,
      { ...body, username: 'ignored', password: 'ignored' },
      req(),
    )
    expect(result).toEqual({
      id: studentId,
      username: 'student.existing',
      created: false,
      name: body.name,
      number: body.number,
      canResetPassword: true,
    })
    expect(query.mock.calls.some(([sql]) => sql.startsWith('insert into users'))).toBe(false)
  })
  it('reuses a promoted account without granting the teacher password-reset permission', async () => {
    const query = memberQueries({
      user: {
        rows: [
          {
            id: studentId,
            username: 'student.existing',
            role: 'teacher',
            name: body.name,
            number: body.number,
            disabled: false,
            created_by: teacherId,
          },
        ],
        rowCount: 1,
      },
    })
    const result = await new ClassroomController(service(query).value).addMember(
      classId,
      { ...body, username: 'different', password: 'ignored' },
      req(),
    )
    expect(result).toMatchObject({ id: studentId, created: false, canResetPassword: false })
    expect(result).not.toHaveProperty('password')
    expect(query.mock.calls.some(([sql]) => sql.startsWith('insert into users'))).toBe(false)
  })
  it('still derives the username and generates a password when none is requested', async () => {
    const query = memberQueries({
      insert: {
        rows: [
          {
            id: studentId,
            username: `student.${teacherId}.derived`,
            role: 'student',
            name: body.name,
            number: body.number,
          },
        ],
        rowCount: 1,
      },
    })
    const result = await new ClassroomController(service(query).value).addMember(
      classId,
      { ...body },
      req(),
    )
    expect(result.created).toBe(true)
    const insert = query.mock.calls.find(([sql]) => sql.startsWith('insert into users'))!
    expect(String(insert[1][0])).toMatch(
      /^student\.11111111-1111-4111-8111-111111111111\.[0-9a-f]{24}$/,
    )
    expect(result.password).toBeTruthy()
    expect(await verifyPassword(result.password!, String(insert[1][3]))).toBe(true)
  })
})
