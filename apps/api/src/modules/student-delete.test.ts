import 'reflect-metadata'
import { describe, expect, it, vi } from 'vitest'
import { ClassroomController, type ClassroomService } from './classroom.js'
import type { AuthRequest } from './common.js'

const teacher = '11111111-1111-4111-8111-111111111111'
const student = '22222222-2222-4222-8222-222222222222'
const classroom = '33333333-3333-4333-8333-333333333333'
const request = { actor: { id: teacher, role: 'teacher' } } as AuthRequest

function setup({
  foreign = false,
  active = false,
  owned = true,
  member = true,
  failure = '',
} = {}) {
  const query = vi.fn(async (sql: string) => {
    if (failure && sql.startsWith(failure)) throw new Error('database failure')
    if (sql.startsWith('select id from classrooms'))
      return { rows: [{ id: classroom }], rowCount: 1 }
    if (sql.startsWith('select id,username from users'))
      return { rows: owned ? [{ id: student, username: 'student' }] : [], rowCount: owned ? 1 : 0 }
    if (sql.startsWith('select id from memberships')) return { rows: [], rowCount: member ? 1 : 0 }
    if (sql.startsWith('select 1 from classrooms')) return { rows: [], rowCount: foreign ? 1 : 0 }
    if (sql.startsWith('select 1 from runs')) return { rows: [], rowCount: active ? 1 : 0 }
    return { rows: [], rowCount: 0 }
  })
  const client = { query, release: vi.fn() }
  const access = vi.fn(async () => {})
  const service = { pool: { connect: async () => client }, access } as unknown as ClassroomService
  return { query, client, access, controller: new ClassroomController(service) }
}

describe('teacher permanent student account deletion', () => {
  it('clears server data and sessions atomically, while recording an audit event', async () => {
    const m = setup()
    await expect(m.controller.deleteStudentAccount(classroom, student, request)).resolves.toEqual({
      ok: true,
    })
    expect(m.access).toHaveBeenCalledWith(request.actor, classroom, true)
    const calls = m.query.mock.calls.map(([sql]) => sql)
    for (const table of [
      'runs',
      'help_requests',
      'submissions',
      'drafts',
      'projections',
      'memberships',
      'sessions',
    ])
      expect(calls).toContain(`delete from ${table} where user_id=$1`)
    expect(
      calls.indexOf(
        'delete from run_inputs where run_id in (select id from runs where user_id=$1)',
      ),
    ).toBeLessThan(calls.indexOf('delete from runs where user_id=$1'))
    expect(calls).toContain('delete from users where id=$1')
    expect(calls).toContain('insert into audit_events(event,source,details) values($1,$2,$3)')
    expect(calls.at(-1)).toBe('commit')
    expect(m.client.release).toHaveBeenCalledOnce()
  })
  it.each([
    [{ owned: false }, '只能删除由你创建'],
    [{ member: false }, '不是当前课堂成员'],
    [{ foreign: true }, '其他教师'],
    [{ active: true }, '执行中'],
  ])('refuses unsafe deletion and rolls back: %o', async (scenario, message) => {
    const m = setup(scenario)
    await expect(m.controller.deleteStudentAccount(classroom, student, request)).rejects.toThrow(
      message,
    )
    expect(m.query.mock.calls.at(-1)?.[0]).toBe('rollback')
    expect(m.query.mock.calls.some(([sql]) => sql.startsWith('delete from'))).toBe(false)
  })
  it('rolls back every deletion on database failure', async () => {
    const m = setup({ failure: 'delete from drafts' })
    await expect(m.controller.deleteStudentAccount(classroom, student, request)).rejects.toThrow(
      'database failure',
    )
    expect(m.query.mock.calls.at(-1)?.[0]).toBe('rollback')
    expect(m.query.mock.calls.some(([sql]) => sql === 'commit')).toBe(false)
  })
})
