import 'reflect-metadata'
import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { describe, expect, it } from 'vitest'
import { ClassroomController, ClassroomService } from './classroom.js'
import type { DatabaseService } from '../database.service.js'
import type { AuthRequest } from './common.js'

const connectionString = process.env.CPP_CRUD_TEST_DATABASE_URL

describe.skipIf(!connectionString)('student deletion with PostgreSQL', () => {
  it('removes student records across owned classes while preserving other students, then rolls back fixtures', async () => {
    const db = new pg.Client({ connectionString })
    await db.connect()
    await db.query('begin')
    try {
      const teacher = randomUUID(),
        student = randomUUID(),
        peer = randomUUID()
      const first = randomUUID(),
        second = randomUUID(),
        exercise = randomUUID(),
        run = randomUUID()
      const username = `delete-test-${student}`
      await db.query(
        "insert into users(id,username,name,role,password_hash) values($1,$2,'teacher','teacher','hash')",
        [teacher, `delete-test-${teacher}`],
      )
      for (const id of [student, peer])
        await db.query(
          "insert into users(id,username,name,role,password_hash,created_by) values($1,$2,'student','student','hash',$3)",
          [id, `delete-test-${id}`, teacher],
        )
      for (const id of [first, second])
        await db.query(
          "insert into classrooms(id,owner_id,name,invite_code,invite_expires_at) values($1,$2,'class',$3,now()+interval '1 day')",
          [id, teacher, id],
        )
      for (const id of [first, second])
        await db.query(
          "insert into memberships(classroom_id,user_id,role,status) values($1,$2,'teacher','active')",
          [id, teacher],
        )
      for (const id of [first, second])
        await db.query(
          "insert into memberships(classroom_id,user_id,status) values($1,$2,'active')",
          [id, student],
        )
      await db.query(
        "insert into memberships(classroom_id,user_id,status) values($1,$2,'active')",
        [first, peer],
      )
      await db.query(
        "insert into exercises(id,classroom_id,filename,content) values($1,$2,'test.cpp','{}')",
        [exercise, first],
      )
      await db.query(
        "insert into drafts(classroom_id,exercise_id,user_id,code) values($1,$2,$3,'code')",
        [first, exercise, student],
      )
      await db.query(
        "insert into runs(id,classroom_id,exercise_id,user_id,code,filename,revision,input,status) values($1,$2,$3,$4,'code','test.cpp',1,'','已完成')",
        [run, first, exercise, student],
      )
      await db.query("insert into run_inputs(run_id,content) values($1,'input')", [run])
      await db.query(
        "insert into submissions(classroom_id,exercise_id,user_id,code,filename,revision) values($1,$2,$3,'code','test.cpp',1)",
        [first, exercise, student],
      )
      await db.query(
        "insert into help_requests(classroom_id,exercise_id,user_id,message) values($1,$2,$3,'help')",
        [first, exercise, student],
      )
      await db.query(
        "insert into projections(classroom_id,user_id,snapshot,expires_at) values($1,$2,'{}',now()+interval '1 day')",
        [first, student],
      )
      await db.query(
        "insert into sessions(token,user_id,expires_at) values($1,$2,now()+interval '1 day')",
        [`test-${student}`, student],
      )
      await db.query('insert into recovery_requests(username) values($1)', [username])
      const connection = {
        query: async (sql: string, values?: unknown[]) => {
          if (sql === 'begin') return db.query('savepoint delete_test')
          if (sql === 'commit') return db.query('release savepoint delete_test')
          if (sql === 'rollback') return db.query('rollback to savepoint delete_test')
          return db.query(sql, values)
        },
        release: () => {},
      }
      const pool = {
        query: (sql: string, values?: unknown[]) => db.query(sql, values),
        connect: async () => connection,
      }
      const service = new ClassroomService({ database: { pool } } as unknown as DatabaseService)
      const controller = new ClassroomController(service)
      const teacherRequest = { actor: { id: teacher, role: 'teacher' } } as AuthRequest
      const otherTeacher = randomUUID(),
        otherClass = randomUUID()
      await db.query(
        "insert into users(id,username,name,role,password_hash) values($1,$2,'other teacher','teacher','hash')",
        [otherTeacher, `delete-test-${otherTeacher}`],
      )
      await db.query(
        "insert into classrooms(id,owner_id,name,invite_code,invite_expires_at) values($1,$2,'other class',$3,now()+interval '1 day')",
        [otherClass, otherTeacher, otherClass],
      )
      await db.query(
        "insert into memberships(classroom_id,user_id,status) values($1,$2,'active')",
        [otherClass, student],
      )
      await expect(controller.deleteStudentAccount(first, student, teacherRequest)).rejects.toThrow(
        '其他教师',
      )
      expect(
        (await db.query('select count(*)::int as n from users where id=$1', [student])).rows[0].n,
      ).toBe(1)
      await db.query('delete from memberships where classroom_id=$1 and user_id=$2', [
        otherClass,
        student,
      ])
      await db.query("update runs set status='排队' where id=$1", [run])
      await expect(controller.deleteStudentAccount(first, student, teacherRequest)).rejects.toThrow(
        '执行中',
      )
      await db.query("update runs set status='已完成' where id=$1", [run])
      await controller.deleteStudentAccount(first, student, teacherRequest)
      for (const table of [
        'users',
        'memberships',
        'drafts',
        'runs',
        'help_requests',
        'submissions',
        'projections',
        'sessions',
      ]) {
        const column = table === 'users' ? 'id' : 'user_id'
        expect(
          (await db.query(`select count(*)::int as n from ${table} where ${column}=$1`, [student]))
            .rows[0].n,
        ).toBe(0)
      }
      expect(
        (await db.query('select count(*)::int as n from run_inputs where run_id=$1', [run])).rows[0]
          .n,
      ).toBe(0)
      expect(
        (
          await db.query('select count(*)::int as n from recovery_requests where username=$1', [
            username,
          ])
        ).rows[0].n,
      ).toBe(0)
      expect(
        (await db.query('select count(*)::int as n from memberships where user_id=$1', [peer]))
          .rows[0].n,
      ).toBe(1)
    } finally {
      await db.query('rollback')
      await db.end()
    }
  })
})
