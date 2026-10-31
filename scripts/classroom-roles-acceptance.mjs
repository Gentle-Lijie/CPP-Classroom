// Native local API + PostgreSQL acceptance. Only fresh synthetic fixtures are mutated.
import assert from 'node:assert/strict'
import { randomBytes, randomUUID, scryptSync } from 'node:crypto'
import { config } from 'dotenv'
import pg from 'pg'

config({ path: '.env', quiet: true })
const base = process.env.ACCEPTANCE_API || 'http://127.0.0.1:3000/api'
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
const users = Array.from({ length: 4 }, () => randomUUID())
const [ownerId, teacherId, taId, studentId] = users
const password = randomBytes(24).toString('base64url')
let classId
let otherClassId
const checks = []
function client() {
  let cookie = ''
  return async (path, method = 'GET', body, expected = method === 'POST' ? 201 : 200) => {
    const response = await fetch(base + path, {
      method,
      headers: { cookie, 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(15000),
    })
    if (response.headers.get('set-cookie'))
      cookie = response.headers.get('set-cookie').split(';')[0]
    const value = await response.json()
    assert.equal(
      response.status,
      expected,
      `${method} ${path}: ${value.message ?? response.status}`,
    )
    return value
  }
}
const owner = client(),
  teacher = client(),
  ta = client()
try {
  for (const [index, id] of users.entries()) {
    const salt = randomBytes(16).toString('hex')
    await pool.query(
      'insert into users(id,username,name,role,password_hash) values($1,$2,$3,$4,$5)',
      [
        id,
        `roles-acceptance-${id}`,
        '课堂角色合成验收',
        index === 0 ? 'teacher' : 'student',
        `${salt}:${scryptSync(password, salt, 64).toString('hex')}`,
      ],
    )
  }
  for (const [api, id] of [
    [owner, ownerId],
    [teacher, teacherId],
    [ta, taId],
  ])
    await api('/auth/login', 'POST', { username: `roles-acceptance-${id}`, password })
  await pool.query('update users set created_by=$2 where id=$1', [studentId, ownerId])
  classId = (await owner('/classes', 'POST', { name: '课堂角色撤权竞态合成验收' })).id
  otherClassId = (await owner('/classes', 'POST', { name: '跨课堂账号权限竞态合成验收' })).id
  const path = '/classes/' + classId
  await owner(path, 'PATCH', { status: '进行中' })
  for (const [userId, role] of [
    [teacherId, 'teacher'],
    [taId, 'ta'],
    [studentId, 'student'],
  ])
    await owner(path + '/assignments', 'POST', { userId, role })
  const exerciseId = (
    await owner(path + '/exercises', 'POST', { filename: 'roles.cpp', status: '已发布' })
  ).id
  const workspace = path + '/workspace/' + exerciseId
  const revision = (await teacher(workspace, 'PUT', { code: 'int main(){}', revision: 0 })).revision
  const helpId = randomUUID()
  await pool.query(
    'insert into help_requests(id,classroom_id,exercise_id,user_id,message) values($1,$2,$3,$4,$5)',
    [helpId, classId, exerciseId, studentId, 'test'],
  )

  for (const kind of ['remove', 'demote', 'disable']) {
    for (const action of ['save', 'run', 'manage']) {
      const lock = await pool.connect()
      let operation
      try {
        await lock.query('begin')
        const pid = (await lock.query('select pg_backend_pid() as id')).rows[0].id
        if (kind === 'disable')
          await lock.query('update users set disabled=true where id=$1', [teacherId])
        else
          await lock.query(
            'update memberships set status=$3,role=$4 where classroom_id=$1 and user_id=$2',
            [
              classId,
              teacherId,
              kind === 'remove' ? 'removed' : 'active',
              kind === 'demote' ? 'ta' : 'teacher',
            ],
          )
        operation =
          action === 'save'
            ? teacher(workspace, 'PUT', { code: '// denied', revision }, 403)
            : action === 'run'
              ? teacher(path + '/runs', 'POST', { exerciseId, revision, input: '' }, 403)
              : teacher(path, 'PATCH', { description: 'must be denied' }, 403)
        // Observe the actual PostgreSQL lock wait instead of assuming request timing.
        let blocked = false
        for (let attempt = 0; attempt < 100; attempt++) {
          blocked = (
            await pool.query(
              'select exists(select 1 from pg_stat_activity where $1::int=any(pg_blocking_pids(pid))) as waiting',
              [pid],
            )
          ).rows[0].waiting
          if (blocked) break
          await new Promise((resolve) => setTimeout(resolve, 25))
        }
        assert.equal(blocked, true, `${kind}/${action} did not reach its final authorization lock`)
        await lock.query('commit')
        await operation
        checks.push(`${kind}/${action}`)
      } finally {
        await lock.query('rollback')
        lock.release()
        if (operation) await operation.catch(() => {})
        await pool.query('update users set disabled=false where id=$1', [teacherId])
        await owner(path + '/assignments', 'POST', { userId: teacherId, role: 'teacher' })
      }
    }
  }
  // TA mutations also recheck membership inside the write transaction.
  for (const action of ['resolve', 'project']) {
    const lock = await pool.connect()
    let operation
    try {
      await lock.query('begin')
      const pid = (await lock.query('select pg_backend_pid() as id')).rows[0].id
      await lock.query(
        "update memberships set status='removed' where classroom_id=$1 and user_id=$2",
        [classId, taId],
      )
      operation =
        action === 'resolve'
          ? ta(path + '/help/' + studentId + '/resolve', 'POST', { requestId: helpId }, 403)
          : ta(path + '/projections', 'POST', { student: studentId, exerciseId }, 403)
      let blocked = false
      for (let attempt = 0; attempt < 100; attempt++) {
        blocked = (
          await pool.query(
            'select exists(select 1 from pg_stat_activity where $1::int=any(pg_blocking_pids(pid))) as waiting',
            [pid],
          )
        ).rows[0].waiting
        if (blocked) break
        await new Promise((resolve) => setTimeout(resolve, 25))
      }
      assert.equal(blocked, true, `TA/${action} did not reach its final authorization lock`)
      await lock.query('commit')
      await operation
      checks.push(`TA-remove/${action}`)
    } finally {
      await lock.query('rollback')
      lock.release()
      if (operation) await operation.catch(() => {})
      await owner(path + '/assignments', 'POST', { userId: taId, role: 'ta' })
    }
  }
  assert.equal((await teacher(workspace)).revision, revision)
  assert.equal(
    (await pool.query('select count(*)::int as n from runs where classroom_id=$1', [classId]))
      .rows[0].n,
    0,
  )
  assert.equal(
    (await pool.query('select resolved from help_requests where id=$1', [helpId])).rows[0].resolved,
    false,
  )
  assert.equal(
    (
      await pool.query('select count(*)::int as n from projections where classroom_id=$1', [
        classId,
      ])
    ).rows[0].n,
    0,
  )
  // A teaching role committed while a password reset waited for its account lock
  // must prevent that reset from issuing credentials based on a stale snapshot.
  const lock = await pool.connect()
  let reset
  try {
    const before = (await pool.query('select password_hash from users where id=$1', [studentId]))
      .rows[0].password_hash
    await lock.query('begin')
    const pid = (await lock.query('select pg_backend_pid() as id')).rows[0].id
    await lock.query('select id from users where id=$1 for share', [studentId])
    await lock.query(
      "insert into memberships(classroom_id,user_id,role,status) values($1,$2,'ta','active')",
      [otherClassId, studentId],
    )
    reset = owner(path + '/members/reset-passwords', 'POST', { userIds: [studentId] }, 403)
    let blocked = false
    for (let attempt = 0; attempt < 100; attempt++) {
      blocked = (
        await pool.query(
          'select exists(select 1 from pg_stat_activity where $1::int=any(pg_blocking_pids(pid))) as waiting',
          [pid],
        )
      ).rows[0].waiting
      if (blocked) break
      await new Promise((resolve) => setTimeout(resolve, 25))
    }
    assert.equal(
      blocked,
      true,
      'Password reset did not wait for the teaching assignment account lock',
    )
    await lock.query('commit')
    await reset
    assert.equal(
      (await pool.query('select password_hash from users where id=$1', [studentId])).rows[0]
        .password_hash,
      before,
    )
    checks.push('cross-class-promotion/password-reset')
  } finally {
    await lock.query('rollback')
    lock.release()
    if (reset) await reset.catch(() => {})
  }
  console.log(JSON.stringify({ ok: true, checks, noCodeExecuted: true }))
} finally {
  try {
    if (otherClassId) await owner('/classes/' + otherClassId, 'DELETE')
    if (classId) await owner('/classes/' + classId, 'DELETE')
    await pool.query('delete from sessions where user_id=any($1::uuid[])', [users])
    await pool.query('delete from users where id=any($1::uuid[])', [users])
    await pool.query('delete from audit_events where source=any($1::text[])', [users])
  } finally {
    await pool.end()
  }
}
