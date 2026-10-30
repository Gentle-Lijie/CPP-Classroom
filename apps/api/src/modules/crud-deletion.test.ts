import 'reflect-metadata'
import { describe, expect, it, vi } from 'vitest'
import type { Environment } from '@classroom/config'
import { AdminController } from './admin.js'
import { ClassroomController, type ClassroomService } from './classroom.js'
import type { AuthRequest } from './common.js'

const id = '11111111-1111-4111-8111-111111111111'
const other = '22222222-2222-4222-8222-222222222222'
const request = (role: string) => ({ actor: { id: other, role } }) as AuthRequest
function setup(
  handler: (sql: string) => { rows: unknown[]; rowCount: number } = () => ({
    rows: [],
    rowCount: 0,
  }),
) {
  const query = vi.fn(async (sql: string) => handler(sql))
  const client = { query, release: vi.fn() }
  const service = {
    pool: { connect: async () => client },
    access: vi.fn(async () => {}),
  } as unknown as ClassroomService
  return { query, client, service }
}

describe('permanent deletion', () => {
  it('deletes a classroom and its dependent records atomically', async () => {
    const m = setup((sql) => ({
      rows: [],
      rowCount: sql.startsWith('select id from classrooms') ? 1 : 0,
    }))
    await expect(
      new ClassroomController(m.service).deleteClass(id, request('teacher')),
    ).resolves.toEqual({ ok: true })
    const calls = m.query.mock.calls.map(([sql]) => sql)
    expect(calls).toContain('delete from submissions where classroom_id=$1')
    expect(
      calls.indexOf(
        'delete from run_inputs where run_id in (select id from runs where classroom_id=$1)',
      ),
    ).toBeLessThan(calls.indexOf('delete from runs where classroom_id=$1'))
    expect(calls.at(-1)).toBe('commit')
  })
  it('rolls back classroom deletion when a run is active', async () => {
    const m = setup((sql) => ({
      rows: [],
      rowCount:
        sql.startsWith('select id from classrooms') || sql.startsWith('select 1 from runs') ? 1 : 0,
    }))
    await expect(
      new ClassroomController(m.service).deleteClass(id, request('teacher')),
    ).rejects.toThrow('执行中')
    expect(m.query.mock.calls.at(-1)?.[0]).toBe('rollback')
    expect(m.query.mock.calls.some(([sql]) => sql.startsWith('delete from'))).toBe(false)
  })
  it('deletes a specific exercise and clears classroom references', async () => {
    const m = setup((sql) => ({
      rows: [],
      rowCount: sql.startsWith('select id from exercises') ? 1 : 0,
    }))
    await new ClassroomController(m.service).deleteExercise(id, other, request('teacher'))
    const calls = m.query.mock.calls.map(([sql]) => sql)
    expect(calls).toContain('delete from drafts where classroom_id=$1 and exercise_id=$2')
    expect(calls).toContain(
      'update memberships set exercise_id=null where classroom_id=$1 and exercise_id=$2',
    )
    expect(calls.at(-1)).toBe('commit')
  })
  it('rejects account deletion with dependent records and rolls back session removal', async () => {
    const m = setup((sql) => {
      if (sql.startsWith('delete from users'))
        throw Object.assign(new Error('foreign key'), { code: '23503' })
      return {
        rows: sql.startsWith('select id,username') ? [{ id, username: 'student' }] : [],
        rowCount: 1,
      }
    })
    await expect(
      new AdminController(m.service, {} as Environment).deleteUser(request('admin'), id),
    ).rejects.toThrow('关联')
    expect(m.query.mock.calls.at(-1)?.[0]).toBe('rollback')
  })
  it('preserves historical runs when deleting an idle node', async () => {
    const m = setup((sql) => ({
      rows: sql.startsWith('select id,name') ? [{ id, name: 'runner' }] : [],
      rowCount: sql.startsWith('select 1 from runs') ? 0 : 1,
    }))
    await new AdminController(m.service, {} as Environment).deleteRunner(request('admin'), id)
    expect(m.query.mock.calls.map(([sql]) => sql)).toContain(
      'update runs set runner_id=null where runner_id=$1',
    )
    expect(m.query.mock.calls.at(-1)?.[0]).toBe('commit')
  })
  it('prevents non-admin access to node deletion', async () => {
    const m = setup()
    await expect(
      new AdminController(m.service, {} as Environment).deleteRunner(request('teacher'), id),
    ).rejects.toThrow()
    expect(m.query).not.toHaveBeenCalled()
  })
  it('updates account identity fields and invalidates sessions after a username change', async () => {
    const m = setup((sql) => ({
      rows: sql.startsWith('select id,username') ? [{ id, username: 'old', role: 'student' }] : [],
      rowCount: sql.startsWith('select id,username') ? 1 : 0,
    }))
    await new AdminController(m.service, {} as Environment).update(request('admin'), id, {
      name: '新名字',
      number: '123',
      username: 'new-account',
    })
    const calls = m.query.mock.calls.map(([sql]) => sql)
    expect(calls).toContain('delete from sessions where user_id=$1')
    expect(calls.at(-1)).toBe('commit')
  })
  it('refuses deletion of a node with active work', async () => {
    const m = setup((sql) => ({
      rows: sql.startsWith('select id,name') ? [{ id, name: 'runner' }] : [],
      rowCount: sql.startsWith('select 1 from runs') ? 1 : 0,
    }))
    await expect(
      new AdminController(m.service, {} as Environment).deleteRunner(request('admin'), id),
    ).rejects.toThrow('执行中')
    expect(m.query.mock.calls.at(-1)?.[0]).toBe('rollback')
  })
})
