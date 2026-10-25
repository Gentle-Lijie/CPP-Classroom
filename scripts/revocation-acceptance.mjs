/** Controlled row locks exercise requests authorized immediately before revocation.
 * Only newly created synthetic accounts/classrooms are changed; no code is executed.
 */
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { config } from 'dotenv'
import pg from 'pg'
config({ path: '.env', quiet: true })
const initial = JSON.parse(await readFile('.local/initial-accounts.json', 'utf8'))
const base = process.env.ACCEPTANCE_API || 'http://127.0.0.1:3000/api'
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
      `${method} ${path}: ${response.status} ${value.message ?? ''}`,
    )
    return value
  }
}
const admin = client(),
  teacher = client(),
  student = client()
await admin('/auth/login', 'POST', initial.admin)
const suffix = Date.now().toString(36),
  credential = {
    username: 'revoke.teacher.' + suffix,
    password: randomBytes(24).toString('base64url'),
  }
await admin('/admin/users', 'POST', { ...credential, name: '撤权竞态验收', role: 'teacher' })
await teacher('/auth/login', 'POST', credential)
const classroom = await teacher('/classes', 'POST', { name: '撤权时序验收 ' + suffix })
const path = '/classes/' + classroom.id
await teacher(path, 'PATCH', { status: '进行中' })
const member = await teacher(path + '/members', 'POST', {
  name: '合成竞态学生',
  number: 'race.' + suffix,
})
await student('/auth/login', 'POST', { username: member.username, password: member.password })
const exercise = await teacher(path + '/exercises', 'POST', {
  title: '仅检查权限，不执行',
  topic: '验收',
  filename: 'race.cpp',
  status: '已发布',
  description: '受控锁测试',
  input: '',
  output: '',
  sampleInput: '',
  sampleOutput: '',
  code: 'int main(){}',
})
const workspace = path + '/workspace/' + exercise.id
const revision = (await student(workspace, 'PUT', { code: 'int main(){}', revision: 0 })).revision
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
const checks = []
try {
  for (const kind of ['membership', 'disabled']) {
    for (const action of ['save', 'help', 'submit', 'run']) {
      const lock = await pool.connect()
      try {
        await lock.query('begin')
        const pid = (await lock.query('select pg_backend_pid() as id')).rows[0].id
        if (kind === 'membership')
          await lock.query(
            "update memberships set status='removed' where classroom_id=$1 and user_id=$2",
            [classroom.id, member.id],
          )
        else await lock.query('update users set disabled=true where id=$1', [member.id])
        const operation =
          action === 'save'
            ? student(workspace, 'PUT', { code: '// must be rejected', revision }, 403)
            : student(
                path + { help: '/help', submit: '/submissions', run: '/runs' }[action],
                'POST',
                {
                  exerciseId: exercise.id,
                  revision,
                  message: 'must be rejected',
                  input: '',
                  interactive: false,
                },
                403,
              )
        let blocked = false
        for (let attempt = 0; attempt < 100; attempt++) {
          blocked = (
            await pool.query(
              'select exists(select 1 from pg_stat_activity where $1::int=any(pg_blocking_pids(pid))) as waiting',
              [pid],
            )
          ).rows[0].waiting
          if (blocked) break
          await new Promise((resolve) => setTimeout(resolve, 30))
        }
        assert.equal(blocked, true, `${kind}/${action} did not reach its final permission lock`)
        await lock.query('commit')
        await operation
        checks.push(
          `${kind}/${action}: pre-authorized request rechecked after revocation and returned 403`,
        )
      } finally {
        await lock.query('rollback')
        lock.release()
        await pool.query(
          "update memberships set status='active' where classroom_id=$1 and user_id=$2",
          [classroom.id, member.id],
        )
        await pool.query('update users set disabled=false where id=$1', [member.id])
      }
    }
  }
  assert.equal((await student(workspace)).revision, revision)
  assert.equal((await teacher(path + '/help')).length, 0)
  assert.equal((await teacher(path + '/submissions')).length, 0)
  assert.equal((await student(path + '/runs')).length, 0)
  await writeFile(
    '.local/revocation-acceptance-result.json',
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        classroomId: classroom.id,
        checks,
        noCodeExecuted: true,
      },
      null,
      2,
    ),
    { mode: 0o600 },
  )
  console.log(JSON.stringify({ ok: true, checks: checks.length, noCodeExecuted: true }))
} finally {
  await teacher(path, 'PATCH', { status: '已归档' })
  await pool.end()
}
