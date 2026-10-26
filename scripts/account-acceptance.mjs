/** Account regressions. Creates only synthetic fixtures; never changes existing classroom accounts. */
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { config } from 'dotenv'
import pg from 'pg'
config({ path: '.env', quiet: true })
const base = process.env.ACCEPTANCE_API || 'http://127.0.0.1:3000/api'
const initial = JSON.parse(await readFile('.local/initial-accounts.json', 'utf8'))
const suffix = Date.now().toString(36) + randomBytes(3).toString('hex')
const prefix = `account.${suffix}`
const password = randomBytes(18).toString('base64url')
const checks = [],
  accounts = [],
  classrooms = []
function client() {
  let cookie = ''
  return async (path, method = 'GET', body, expected) => {
    const response = await fetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(30000),
    })
    if (response.headers.get('set-cookie'))
      cookie = response.headers.get('set-cookie').split(';')[0]
    const data = await response.json()
    assert.equal(
      response.status,
      expected ?? (method === 'POST' ? 201 : 200),
      `${method} ${path}: status ${response.status} ${data.message ?? ''}`,
    )
    return data
  }
}
const admin = client(),
  teacherA = client(),
  teacherB = client(),
  studentA = client(),
  studentB = client(),
  legacy = client()
await admin('/auth/login', 'POST', initial.admin)
async function createUser(key, role) {
  const credentials = { username: `${prefix}.${key}`, password }
  const value = await admin('/admin/users', 'POST', {
    ...credentials,
    name: `账号回归 ${key}`,
    number: `${suffix}.${key}`,
    role,
  })
  accounts.push({ id: value.id, ...credentials, role })
  return { ...value, ...credentials }
}
const aTeacher = await createUser('teacherA', 'teacher'),
  bTeacher = await createUser('teacherB', 'teacher')
await teacherA('/auth/login', 'POST', aTeacher)
await teacherB('/auth/login', 'POST', bTeacher)
const aClass = await teacherA('/classes', 'POST', {
  name: `账号权限回归 A ${suffix}`,
  description: '合成账号回归，不执行学生程序。',
})
const bClass = await teacherB('/classes', 'POST', {
  name: `账号权限回归 B ${suffix}`,
  description: '合成账号回归，不执行学生程序。',
})
classrooms.push({ id: aClass.id, teacher: teacherA }, { id: bClass.id, teacher: teacherB })
const pathA = `/classes/${aClass.id}`,
  pathB = `/classes/${bClass.id}`
let completed = false
try {
  await teacherA(pathA, 'PATCH', { status: '进行中' })
  await teacherB(pathB, 'PATCH', { status: '进行中' })
  const sameNumber = `001.${suffix}`
  const a = await teacherA(pathA + '/members', 'POST', { name: '合成学生甲', number: sameNumber })
  const b = await teacherB(pathB + '/members', 'POST', { name: '合成学生乙', number: sameNumber })
  assert.notEqual(a.id, b.id)
  assert.notEqual(a.username, b.username)
  assert.ok(a.username.length <= 80 && b.username.length <= 80)
  accounts.push({ ...a, role: 'student' }, { ...b, role: 'student' })
  await studentA('/auth/login', 'POST', { username: a.username, password: a.password })
  await studentB('/auth/login', 'POST', { username: b.username, password: b.password })
  const same = await teacherA(pathA + '/members', 'POST', {
    name: '合成学生甲',
    number: sameNumber,
  })
  assert.equal(same.id, a.id)
  assert.equal(same.created, false)
  assert.equal(same.password, undefined)
  await teacherA(pathA + '/members', 'POST', { name: '不是同一学生', number: sameNumber }, 409)
  checks.push('相同学号按教师隔离；同教师复用核对姓名且保留原密码，重复添加幂等')

  const classA = (await teacherA('/classes')).find((c) => c.id === aClass.id)
  assert.ok(Number.isFinite(new Date(classA.inviteExpiresAt).getTime()))
  await studentB('/classes/join', 'POST', { code: classA.inviteCode })
  assert.equal(
    (await studentB('/classes')).find((c) => c.id === aClass.id).membershipStatus,
    'pending',
  )
  await studentB(pathA + '/exercises', 'GET', undefined, 403)
  await teacherA(pathA + '/members/' + b.id, 'PATCH', { status: 'active' })
  const shared = (await teacherA(pathA + '/members')).find((m) => m.id === b.id)
  assert.equal(shared.canResetPassword, false)
  await teacherA(pathA + '/members/reset-passwords', 'POST', { userIds: [b.id] }, 403)
  await studentB('/auth/me')
  checks.push('跨教师共享经学生本人邀请申请；待审批状态可见，审批后仍无越权重置权限')

  const reset = await teacherA(pathA + '/members/reset-passwords', 'POST', { userIds: [a.id] })
  assert.equal(reset.length, 1)
  assert.equal(reset[0].id, a.id)
  await studentA('/auth/me', 'GET', undefined, 401)
  await client()('/auth/login', 'POST', { username: a.username, password: a.password }, 401)
  const newStudent = client()
  await newStudent('/auth/login', 'POST', { username: a.username, password: reset[0].password })
  accounts.find((u) => u.id === a.id).password = reset[0].password
  await teacherA(pathA + '/members/reset-passwords', 'POST', { userIds: [a.id, b.id] }, 403)
  await newStudent('/auth/me')
  checks.push('创建教师重置成功，新密码可登录、旧密码/旧会话失效；混合无权批次原子拒绝')

  await admin('/admin/users/' + a.id, 'PATCH', { disabled: true })
  await teacherA(pathA + '/members', 'POST', { name: '合成学生甲', number: sameNumber }, 409)
  assert.equal((await teacherA(pathA + '/members')).find((m) => m.id === a.id).disabled, true)
  await admin('/admin/users/' + a.id, 'PATCH', { disabled: false })
  checks.push('停用账号添加拒绝并在名册显式显示停用，启用不更改原身份')

  const old = await createUser('legacy', 'student')
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
  try {
    // Guard both synthetic ID and this run's username; never infer or backfill existing account ownership.
    const changed = await pool.query(
      'update users set created_by=null where id=$1 and username=$2 returning id',
      [old.id, old.username],
    )
    assert.equal(changed.rowCount, 1)
  } finally {
    await pool.end()
  }
  await legacy('/auth/login', 'POST', { username: old.username, password: old.password })
  await legacy('/classes/join', 'POST', { code: classA.inviteCode })
  await teacherA(pathA + '/members/' + old.id, 'PATCH', { status: 'removed', action: 'reject' })
  await legacy('/classes/join', 'POST', { code: classA.inviteCode })
  await teacherA(pathA + '/members/' + old.id, 'PATCH', { status: 'active' })
  const oldMember = (await teacherA(pathA + '/members')).find((m) => m.id === old.id)
  assert.equal(oldMember.canResetPassword, false)
  await teacherA(pathA + '/members/reset-passwords', 'POST', { userIds: [old.id] }, 403)
  await teacherA(pathA + '/members/' + old.id, 'PATCH', { status: 'removed', action: 'remove' })
  await legacy('/classes/join', 'POST', { code: classA.inviteCode }, 403)
  await teacherA(pathA + '/members/' + old.id, 'PATCH', { status: 'active' })
  assert.equal((await teacherA(pathA + '/members')).find((m) => m.id === old.id).id, old.id)
  checks.push('未知创建者legacy账号不可教师重置；拒绝允许重申；主动移除需教师恢复且保留原identity')

  await teacherA(pathA, 'PATCH', { settings: { capacity: 2 } }, 409)
  await teacherA(pathA, 'PATCH', { settings: { capacity: 3 } })
  const newcomer = await createUser('newcomer', 'student'),
    newClient = client()
  await newClient('/auth/login', 'POST', {
    username: newcomer.username,
    password: newcomer.password,
  })
  await newClient('/classes/join', 'POST', { code: classA.inviteCode }, 409)
  checks.push('容量不允许低于现有人数，满员新申请明确拒绝')

  const page1 = await admin(
    '/admin/users?' + new URLSearchParams({ page: '1', pageSize: '1', search: prefix }),
  )
  const page2 = await admin(
    '/admin/users?' + new URLSearchParams({ page: '2', pageSize: '1', search: prefix }),
  )
  assert.ok(page1.total >= 4)
  assert.equal(page1.items.length, 1)
  assert.notEqual(page1.items[0].id, page2.items[0].id)
  assert.ok(Array.isArray(await admin('/admin/users')))
  await admin('/admin/users?page=1&pageSize=1000', 'GET', undefined, 400)
  const audit = await admin(
    '/admin/audit?' + new URLSearchParams({ page: '1', pageSize: '1', search: a.id }),
  )
  assert.ok(audit.total > 0)
  assert.ok(audit.items.every((item) => !JSON.stringify(item.details).includes(reset[0].password)))
  checks.push('管理员服务端分页/总数/筛选与旧数组调用兼容；审计不含明文密码')

  await client()('/auth/recover', 'POST', { username: old.username })
  const requests = () =>
    admin(
      '/admin/recoveries?' +
        new URLSearchParams({ page: '1', pageSize: '100', search: old.username }),
    )
  const pending = (await requests()).items.find((r) => r.username === old.username)
  assert.ok(pending && pending.user_id === old.id)
  await admin('/admin/users/' + old.id, 'PATCH', { disabled: true })
  assert.ok((await requests()).items.some((r) => r.id === pending.id))
  await admin('/admin/users/' + old.id, 'PATCH', { disabled: false })
  assert.ok((await requests()).items.some((r) => r.id === pending.id))
  await admin('/admin/recoveries/' + pending.id + '/resolve', 'POST', {
    reason: '合成回归：确认由其他渠道解决',
  })
  assert.ok(!(await requests()).items.some((r) => r.id === pending.id))
  const missing = `${prefix}.missing`
  await client()('/auth/recover', 'POST', { username: missing })
  const missingRequest = (
    await admin(
      '/admin/recoveries?' + new URLSearchParams({ page: '1', pageSize: '100', search: missing }),
    )
  ).items.find((r) => r.username === missing)
  assert.ok(missingRequest && !missingRequest.user_id)
  await admin('/admin/recoveries/' + missingRequest.id + '/resolve', 'POST', {
    reason: '合成回归：无对应账号',
  })
  checks.push('恢复申请关联真实用户；启停不误关；有原因关闭及无效申请处理可完成')
  await client()('/auth/recover', 'POST', { username: newcomer.username })
  const newcomerQuery =
    '/admin/recoveries?' +
    new URLSearchParams({ page: '1', pageSize: '100', search: newcomer.username })
  assert.ok((await admin(newcomerQuery)).items.some((r) => r.username === newcomer.username))
  await admin('/admin/users/' + newcomer.id, 'PATCH', { password })
  assert.ok(!(await admin(newcomerQuery)).items.some((r) => r.username === newcomer.username))
  checks.push('实际管理员重置会关闭匹配恢复申请，而普通启停不会关闭')
  const spacedPassword = '  Synthetic password with spaces  '
  await admin('/admin/users/' + old.id, 'PATCH', { password: spacedPassword })
  const oldFresh = client()
  await oldFresh('/auth/login', 'POST', { username: old.username, password: spacedPassword })
  await oldFresh('/auth/password', 'POST', { current: spacedPassword, password: '' }, 400)
  await oldFresh('/auth/password', 'POST', { current: spacedPassword, password: '123456' })
  await oldFresh('/auth/me', 'GET', undefined, 401)
  await oldFresh('/auth/login', 'POST', { username: old.username, password: '123456' })
  await oldFresh('/auth/password', 'POST', { current: '123456', password })
  await client()('/auth/login', 'POST', { username: old.username, password })
  accounts.find((u) => u.id === old.id).password = password
  checks.push('管理员恢复与个人改密支持原始空格密码和短密码，拒绝空密码，成功撤销旧会话')
  completed = true
} finally {
  const cleanup = []
  for (const c of classrooms) {
    try {
      await c.teacher('/classes/' + c.id, 'PATCH', { status: '已归档' })
      cleanup.push({ classroomId: c.id, archived: true })
    } catch {
      cleanup.push({ classroomId: c.id, archived: false })
    }
  }
  completed = completed && cleanup.every((item) => item.archived)
  await mkdir('.local', { recursive: true })
  await writeFile(
    '.local/account-acceptance-accounts.json',
    JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        prefix,
        accounts,
        classroomIds: classrooms.map((c) => c.id),
      },
      null,
      2,
    ) + '\n',
    { mode: 0o600 },
  )
  await writeFile(
    '.local/account-acceptance-report.json',
    JSON.stringify(
      {
        completed,
        checkedAt: new Date().toISOString(),
        prefix,
        checks,
        cleanup,
        classroomIds: classrooms.map((c) => c.id),
      },
      null,
      2,
    ) + '\n',
    { mode: 0o600 },
  )
}
assert.ok(completed, '账号验收或合成课堂归档未完成，请查看本地报告')
console.log(
  JSON.stringify({
    completed,
    checks: checks.length,
    report: '.local/account-acceptance-report.json',
  }),
)
