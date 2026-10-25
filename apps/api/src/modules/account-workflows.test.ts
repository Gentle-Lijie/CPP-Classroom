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
    expect(verifyPassword(result[0]!.password, String(updated[1][1]))).toBe(true)
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
        password: 'new-long-password',
      }),
    ).rejects.toThrow('database unavailable')
    expect(query.mock.calls.at(-1)?.[0]).toBe('rollback')
    expect(query.mock.calls.some((call) => call[0] === 'commit')).toBe(false)
  })
  it('preserves whitespace in the current password and enforces twelve characters for a replacement', async () => {
    const current = '  existing password  '
    const query = vi.fn(async (sql: string) => ({
      rows: sql.startsWith('select password_hash')
        ? [{ password_hash: passwordHash(current) }]
        : [],
      rowCount: 1,
    }))
    const mock = service(query)
    const controller = new AuthController({
      database: { pool: { connect: async () => mock.client } },
    } as unknown as DatabaseService)
    await expect(
      controller.password({ current, password: 'new-long-password' }, req()),
    ).resolves.toEqual({ ok: true })
    await expect(controller.password({ current, password: 'short' }, req())).rejects.toThrow()
    expect(query.mock.calls.some((call) => call[0] === 'commit')).toBe(true)
  })
})

describe('exercise publication validation', () => {
  it('accepts a complete no-input exercise and rejects missing problem content', async () => {
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
    expect(exerciseSchema.safeParse({ ...exercise, description: '   ' }).success).toBe(false)
    expect(exerciseSchema.safeParse({ ...exercise, filename: '../hello.cpp' }).success).toBe(false)
  })
})

describe('teacher classroom write policy', () => {
  it('keeps lesson content read-only outside an active class while allowing classroom management', async () => {
    const { ClassroomService } = await import('./classroom.js')
    const query = vi.fn(async () => ({
      rows: [{ id: classId, owner_id: teacherId, status: '已归档', settings: {} }],
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
