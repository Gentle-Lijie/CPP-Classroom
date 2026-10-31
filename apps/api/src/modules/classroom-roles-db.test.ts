import 'reflect-metadata'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import pg from 'pg'
import { beforeEach, afterEach, describe, expect, it } from 'vitest'
import { ForbiddenException } from '@nestjs/common'
import { ClassroomController, ClassroomService } from './classroom.js'
import { AssignmentsController, AdminClassesController } from './assignments.js'
import { TeachingController } from './teaching.js'
import { WorkspaceController } from './workspace.js'
import { RunsController } from './runs.js'
import type { DatabaseService } from '../database.service.js'
import type { AuthRequest } from './common.js'

const connectionString = process.env.CPP_CRUD_TEST_DATABASE_URL
const request = (id: string, role = 'student') => ({ actor: { id, role } }) as AuthRequest

describe.skipIf(!connectionString)('classroom roles with PostgreSQL', () => {
  let db: pg.Client
  let classroom: ClassroomController
  let assignments: AssignmentsController
  let teaching: TeachingController
  let workspace: WorkspaceController
  let runs: RunsController
  let service: ClassroomService
  let owner: string, admin: string, coTeacher: string, ta: string, student: string
  let id: string, second: string, exerciseId: string

  beforeEach(async () => {
    db = new pg.Client({ connectionString })
    await db.connect()
    await db.query('begin')
    let savepoint = 0
    let current = ''
    const connection = {
      query: async (sql: string, values?: unknown[]) => {
        if (sql === 'begin') {
          current = `role_test_${++savepoint}`
          return db.query(`savepoint ${current}`)
        }
        if (sql === 'commit') return db.query(`release savepoint ${current}`)
        if (sql === 'rollback') {
          await db.query(`rollback to savepoint ${current}`)
          return db.query(`release savepoint ${current}`)
        }
        return db.query(sql, values)
      },
      release: () => {},
    }
    const pool = {
      query: (sql: string, values?: unknown[]) => db.query(sql, values),
      connect: async () => connection,
    }
    service = new ClassroomService({ database: { pool } } as unknown as DatabaseService)
    classroom = new ClassroomController(service)
    assignments = new AssignmentsController(service)
    teaching = new TeachingController(service)
    workspace = new WorkspaceController(service)
    runs = new RunsController(service)
    ;[owner, admin, coTeacher, ta, student] = Array.from({ length: 5 }, () => randomUUID())
    for (const [userId, role] of [
      [owner, 'teacher'],
      [admin, 'admin'],
      [coTeacher, 'student'],
      [ta, 'student'],
      [student, 'student'],
    ]) {
      await db.query(
        "insert into users(id,username,name,role,password_hash) values($1,$2,$2,$3,'hash')",
        [userId, `role-test-${userId}`, role],
      )
    }
    id = (await classroom.create({ name: 'Role test' }, request(owner, 'teacher'))).id
    second = (await classroom.create({ name: 'Other classroom' }, request(owner, 'teacher'))).id
    for (const [userId, role] of [
      [coTeacher, 'teacher'],
      [ta, 'ta'],
      [student, 'student'],
    ]) {
      await assignments.assign(id, { userId, role }, request(owner, 'teacher'))
    }
    await assignments.assign(second, { userId: ta, role: 'student' }, request(owner, 'teacher'))
    await classroom.update(id, { status: '进行中' }, request(owner, 'teacher'))
    await classroom.update(second, { status: '进行中' }, request(owner, 'teacher'))
    exerciseId = (
      await classroom.createExercise(
        id,
        { filename: 'test.cpp', status: '已发布' },
        request(owner, 'teacher'),
      )
    ).id
  })
  afterEach(async () => {
    await db.query('rollback')
    await db.end()
  })

  it('allows multiple teachers and a student account teaching elsewhere without granting platform administration', async () => {
    await expect(classroom.update(id, { name: 'Co-taught' }, request(coTeacher))).resolves.toEqual({
      ok: true,
    })
    await expect(
      workspace.save(id, exerciseId, { code: 'int main(){}', revision: 0 }, request(coTeacher)),
    ).resolves.toMatchObject({ revision: 1 })
    await expect(
      new AdminClassesController(service).list(request(coTeacher)),
    ).rejects.toBeInstanceOf(ForbiddenException)
    await expect(
      classroom.create({ name: 'Not entitled' }, request(coTeacher)),
    ).rejects.toBeInstanceOf(ForbiddenException)
    const list = await classroom.list(request(owner, 'teacher'))
    expect(list.filter((c) => [id, second].includes(c.id))).toHaveLength(2)
    expect(list.find((c) => c.id === id)).toMatchObject({ students: 1, classroomRole: 'teacher' })
  })

  it('permits an assigned administrator to teach while an unassigned administrator has only assignment administration', async () => {
    await expect(service.access(request(admin, 'admin').actor!, id)).rejects.toBeInstanceOf(
      ForbiddenException,
    )
    await assignments.assign(id, { userId: admin, role: 'teacher' }, request(admin, 'admin'))
    await expect(
      classroom.update(id, { description: 'Administrator teaching' }, request(admin, 'admin')),
    ).resolves.toEqual({ ok: true })
    await expect(
      workspace.save(
        id,
        exerciseId,
        { code: 'int main(){}', revision: 0 },
        request(admin, 'admin'),
      ),
    ).resolves.toMatchObject({ revision: 1 })
    expect(
      (await classroom.list(request(admin, 'admin'))).find((c) => c.id === id)?.classroomRole,
    ).toBe('teacher')
  })

  it('lets a TA observe students, read drafts, resolve help and project, but denies management and execution writes', async () => {
    await workspace.save(id, exerciseId, { code: 'student source', revision: 0 }, request(student))
    const help = await teaching.help(id, { exerciseId, message: 'Need help' }, request(student))
    expect((await teaching.overview(id, request(ta))).map((s) => s.id)).toEqual([student])
    await expect(
      workspace.get(id, exerciseId, student, undefined, request(ta)),
    ).resolves.toMatchObject({ code: 'student source' })
    await expect(
      teaching.resolve(id, student, { requestId: help.id }, request(ta)),
    ).resolves.toEqual({ ok: true, resolved: 1 })
    const projection = await teaching.project(id, { student, exerciseId }, request(ta))
    await expect(teaching.projection(id, projection.id, request(ta))).resolves.toMatchObject({
      code: 'student source',
    })
    for (const action of [
      () => classroom.update(id, { name: 'Denied' }, request(ta)),
      () => classroom.createExercise(id, {}, request(ta)),
      () => classroom.addMember(id, { name: 'Denied', number: '001' }, request(ta)),
      () => classroom.deleteClass(id, request(ta)),
      () => assignments.assign(id, { userId: ta, role: 'teacher' }, request(ta)),
      () => workspace.save(id, exerciseId, { code: 'Denied', revision: 0 }, request(ta)),
      () => runs.create(id, { exerciseId, revision: 1, input: '' }, request(ta)),
      () => teaching.export(id, {}, request(ta)),
    ])
      await expect(action()).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('scopes a TA to their own work when the same account is a student in another classroom', async () => {
    await expect(service.access(request(ta).actor!, second)).resolves.toMatchObject({
      classroomRole: 'student',
    })
    await expect(teaching.overview(second, request(ta))).rejects.toBeInstanceOf(ForbiddenException)
    const otherExercise = (
      await classroom.createExercise(
        second,
        { filename: 'other.cpp', status: '已发布' },
        request(owner, 'teacher'),
      )
    ).id
    await expect(
      workspace.save(second, otherExercise, { code: 'student work', revision: 0 }, request(ta)),
    ).resolves.toMatchObject({ revision: 1 })
    await expect(
      teaching.submit(second, { exerciseId: otherExercise, revision: 1 }, request(ta)),
    ).resolves.toMatchObject({ user_id: ta })
    const list = await classroom.list(request(ta))
    expect(list.find((c) => c.id === id)?.classroomRole).toBe('ta')
    expect(list.find((c) => c.id === second)?.classroomRole).toBe('student')
  })

  it('preserves quick student creation, credentials, same-teacher number reuse, and teacher-only account operations', async () => {
    const added = await classroom.addMember(
      id,
      { name: 'Quick student', number: '2026001' },
      request(coTeacher),
    )
    expect(added).toMatchObject({ created: true, canResetPassword: true })
    expect(added.password).toBeTruthy()
    const reused = await classroom.addMember(
      id,
      { name: 'Quick student', number: '2026001' },
      request(coTeacher),
    )
    expect(reused).toMatchObject({ id: added.id, created: false })
    expect(reused).not.toHaveProperty('password')
    await expect(
      classroom.resetPasswords(id, { userIds: [added.id] }, request(owner, 'teacher')),
    ).rejects.toBeInstanceOf(ForbiddenException)
    await assignments.assign(second, { userId: added.id, role: 'ta' }, request(owner, 'teacher'))
    await expect(
      classroom.resetPasswords(id, { userIds: [added.id] }, request(coTeacher)),
    ).rejects.toBeInstanceOf(ForbiddenException)
    expect(
      (await classroom.members(id, request(coTeacher))).find((m) => m.id === added.id)
        ?.canResetPassword,
    ).toBe(false)
  })

  it('reuses a student promoted to classroom creator without changing credentials', async () => {
    const added = await classroom.addMember(
      id,
      { name: 'Promoted student', number: '2026002' },
      request(owner, 'teacher'),
    )
    const before = (await db.query('select password_hash from users where id=$1', [added.id]))
      .rows[0].password_hash
    await db.query("update users set role='teacher' where id=$1", [added.id])
    const reused = await classroom.addMember(
      second,
      { name: 'Promoted student', number: '2026002', username: 'unused-alternative' },
      request(owner, 'teacher'),
    )
    expect(reused).toMatchObject({ id: added.id, created: false, canResetPassword: false })
    expect(reused).not.toHaveProperty('password')
    expect(
      (await db.query('select password_hash from users where id=$1', [added.id])).rows[0]
        .password_hash,
    ).toBe(before)
  })

  it('protects the owner and teaching assignments from student endpoints, then allows explicit ownership transfer', async () => {
    await expect(
      classroom.member(id, ta, { status: 'removed' }, request(owner, 'teacher')),
    ).rejects.toThrow('学生成员不存在')
    await expect(
      assignments.assign(id, { userId: owner, role: 'ta' }, request(owner, 'teacher')),
    ).rejects.toThrow('先转移课堂负责人')
    await expect(
      assignments.transfer(id, { userId: ta }, request(owner, 'teacher')),
    ).rejects.toThrow('有效教师')
    await assignments.transfer(id, { userId: coTeacher }, request(owner, 'teacher'))
    await assignments.assign(
      id,
      { userId: owner, role: 'teacher', status: 'removed' },
      request(coTeacher),
    )
    await expect(service.access(request(owner, 'teacher').actor!, id)).rejects.toBeInstanceOf(
      ForbiddenException,
    )
    await expect(assignments.list(id, request(coTeacher))).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: coTeacher, owner: true })]),
    )
  })

  it('revokes a teaching assignment without deleting historic work or granting access through owner fallbacks', async () => {
    await workspace.save(
      id,
      exerciseId,
      { code: 'saved teaching source', revision: 0 },
      request(coTeacher),
    )
    const run = await runs.create(id, { exerciseId, revision: 1, input: '' }, request(coTeacher))
    await assignments.assign(
      id,
      { userId: coTeacher, role: 'teacher', status: 'removed' },
      request(owner, 'teacher'),
    )
    await expect(
      workspace.get(id, exerciseId, undefined, undefined, request(coTeacher)),
    ).rejects.toBeInstanceOf(ForbiddenException)
    expect(
      (await db.query('select stop_requested from runs where id=$1', [run.id])).rows[0]
        .stop_requested,
    ).toBe(true)
    expect(
      (
        await db.query('select code from drafts where classroom_id=$1 and user_id=$2', [
          id,
          coTeacher,
        ])
      ).rows[0].code,
    ).toBe('saved teaching source')
    expect((await classroom.list(request(coTeacher))).some((c) => c.id === id)).toBe(false)
  })
})

describe.skipIf(!connectionString)('classroom role data migration', () => {
  it('backfills owners and preserves existing student states and IDs; fails atomically on ambiguous legacy membership', async () => {
    const db = new pg.Client({ connectionString })
    await db.connect()
    await db.query('begin')
    try {
      const namespace = 'roles_migration_' + randomUUID().replaceAll('-', '')
      await db.query(`create schema ${namespace}`)
      await db.query(`set local search_path to ${namespace},public`)
      await db.query('create table classrooms(id uuid primary key,owner_id uuid not null)')
      await db.query(
        "create table memberships(id uuid primary key default gen_random_uuid(),classroom_id uuid not null,user_id uuid not null,status text not null default 'pending', unique(classroom_id,user_id))",
      )
      const classId = randomUUID(),
        owner = randomUUID(),
        student = randomUUID(),
        membership = randomUUID()
      await db.query('insert into classrooms values($1,$2)', [classId, owner])
      await db.query(
        "insert into memberships(id,classroom_id,user_id,status) values($1,$2,$3,'removed')",
        [membership, classId, student],
      )
      const migration = await readFile(
        new URL('../../../../packages/database/migrations/0013_even_the_hood.sql', import.meta.url),
        'utf8',
      )
      await db.query('savepoint migration_test')
      await db.query(migration)
      expect(
        (await db.query('select user_id,role,status from memberships order by role')).rows,
      ).toEqual([
        { user_id: student, role: 'student', status: 'removed' },
        { user_id: owner, role: 'teacher', status: 'active' },
      ])
      expect(
        (await db.query('select id from memberships where user_id=$1', [student])).rows[0].id,
      ).toBe(membership)
      await db.query('rollback to savepoint migration_test')
      await db.query(
        "insert into memberships(classroom_id,user_id,status) values($1,$2,'active')",
        [classId, owner],
      )
      await db.query('savepoint conflict_test')
      await expect(db.query(migration)).rejects.toThrow('resolve the conflict')
      await db.query('rollback to savepoint conflict_test')
      expect(
        (
          await db.query(
            "select count(*)::int as n from information_schema.columns where table_schema=$1 and table_name='memberships' and column_name='role'",
            [namespace],
          )
        ).rows[0].n,
      ).toBe(0)
    } finally {
      await db.query('rollback')
      await db.end()
    }
  })
})
