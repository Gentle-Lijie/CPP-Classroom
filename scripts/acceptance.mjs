import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { setTimeout as sleep } from 'node:timers/promises'
const base = process.env.ACCEPTANCE_API || 'http://127.0.0.1:3000/api'
const checks = []
const account = JSON.parse(await readFile('.local/admin-credentials.json', 'utf8'))
function client() {
  let cookie = ''
  return async (path, method = 'GET', body, status = 200) => {
    const r = await fetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    if (r.headers.get('set-cookie')) cookie = r.headers.get('set-cookie').split(';')[0]
    const data = await r.json()
    assert.equal(r.status, status, `${method} ${path}: ${JSON.stringify(data)}`)
    return data
  }
}
const admin = client(),
  teacher = client(),
  student = client(),
  other = client(),
  outsider = client()
const suffix = Date.now().toString(36),
  password = randomBytes(18).toString('base64url')
await admin('/auth/login', 'POST', account, 201)
for (const [key, role] of [
  ['teacher', 'teacher'],
  ['student', 'student'],
  ['other', 'student'],
  ['outsider', 'student'],
])
  await admin(
    '/admin/users',
    'POST',
    {
      username: `accept.${suffix}.${key}`,
      name: '验收' + key,
      number: suffix + key,
      role,
      password,
    },
    201,
  )
const teacherUser = await teacher(
  '/auth/login',
  'POST',
  { username: `accept.${suffix}.teacher`, password },
  201,
)
const studentUser = await student(
  '/auth/login',
  'POST',
  { username: `accept.${suffix}.student`, password },
  201,
)
await other('/auth/login', 'POST', { username: `accept.${suffix}.other`, password }, 201)
await outsider('/auth/login', 'POST', { username: `accept.${suffix}.outsider`, password }, 201)
const classroom = await teacher(
  '/classes',
  'POST',
  { name: '后端端到端验收 ' + suffix, description: '自动验收专用课堂' },
  201,
)
const path = '/classes/' + classroom.id
await teacher(path, 'PATCH', { status: '进行中' })
const c = (await teacher('/classes')).find((c) => c.id === classroom.id)
await student('/classes/join', 'POST', { code: c.inviteCode }, 201)
await student('/classes/join', 'POST', { code: c.inviteCode }, 201)
assert.equal((await teacher(path + '/members')).length, 1)
await student(path + '/exercises', 'GET', undefined, 403)
await teacher(path + '/members/' + studentUser.id, 'PATCH', { status: 'active' })
await other('/classes/join', 'POST', { code: c.inviteCode }, 201)
const members = await teacher(path + '/members')
const otherId = members.find((m) => m.id !== studentUser.id).id
await teacher(path + '/members/' + otherId, 'PATCH', { status: 'active' })
checks.push('登录、审批入班、重复加入、非成员拒绝')
const code = '#include <iostream>\nint main(){int n;std::cin>>n;std::cout<<n*3<<std::endl;}\n'
let exercise = {
  title: '真实编译运行',
  topic: '验收',
  filename: 'accept.cpp',
  status: '草稿',
  description: '端到端验收',
  input: '整数',
  output: '三倍',
  sampleInput: '7',
  sampleOutput: '21',
  code,
}
const e = await teacher(path + '/exercises', 'POST', exercise, 201)
assert.equal((await student(path + '/exercises')).length, 0)
exercise = { ...exercise, ...(await teacher(path + '/exercises'))[0], status: '已发布' }
await teacher(path + '/exercises/' + e.id, 'PATCH', exercise)
const workspace = path + '/workspace/' + e.id
assert.equal((await student(workspace)).code, code)
let revision = (await student(workspace, 'PUT', { code, revision: 0 })).revision
await student(workspace, 'PUT', { code: 'stale', revision: 0 }, 409)
await other(workspace + '?student=' + studentUser.id, 'GET', undefined, 403)
assert.equal((await teacher(workspace + '?student=' + studentUser.id)).code, code)
checks.push('草稿隐藏、发布、初始代码、独立工作区、CAS 冲突、教师读取')
async function runCode(
  source,
  { input = '7', interactive = false, expected = '运行完成', during } = {},
) {
  revision = (await student(workspace, 'PUT', { code: source, revision })).revision
  const r = await student(
    path + '/runs',
    'POST',
    { exerciseId: e.id, revision, input, interactive },
    201,
  )
  const deadline = Date.now() + 90000
  let latest = r
  let acted = false
  while (Date.now() < deadline) {
    latest = await student(path + '/runs/' + r.id)
    if (during && !acted && latest.status === '运行中／可输入') {
      acted = true
      await during(latest)
    }
    if (!['排队', '编译中', '运行中／可输入'].includes(latest.status)) break
    await sleep(150)
  }
  assert.equal(
    latest.status,
    expected,
    JSON.stringify({ status: latest.status, exit: latest.exit, log: latest.log.slice(0, 400) }),
  )
  return latest
}
const normal = await runCode(code)
assert.equal(normal.output, '21\n')
const compileError = await runCode('int main(){ broken syntax }', { expected: '编译失败' })
assert.match(compileError.log, /error:/)
assert.equal((await student(path + '/runs/' + normal.id)).code, code)
checks.push('GCC 编译成功、真实输出、完整编译错误、旧快照不随编辑改变')
const interactive = await runCode(
  '#include <iostream>\nint main(){std::cout<<"ready"<<std::endl;int n,s=0;while(std::cin>>n)s+=n;std::cout<<"sum="<<s<<std::endl;}',
  {
    interactive: true,
    input: '',
    during: async () => {
      await student(
        path + '/runs/' + (await student(path + '/runs'))[0].id + '/input',
        'POST',
        { text: '4\n8\n' },
        201,
      )
      await sleep(400)
      await student(
        path + '/runs/' + (await student(path + '/runs'))[0].id + '/input',
        'POST',
        { eof: true },
        201,
      )
    },
  },
)
assert.match(interactive.output, /ready/)
assert.match(interactive.output, /sum=12/)
checks.push('运行中输入、真实 stdin EOF、继续收集输出')
await runCode('int main(){while(true){}}', { expected: '超时' })
await runCode('#include <iostream>\nint main(){while(true)std::cout<<"abcdef0123456789";}', {
  expected: '资源超限',
})
await runCode('int main(){while(true){}}', {
  expected: '已停止',
  during: async (r) => {
    await student(path + '/runs/' + r.id + '/stop', 'POST', {}, 201)
  },
})
await runCode('int main(){return 7;}', { expected: '运行失败' })
checks.push('死循环限时、无限输出限制、停止、非零退出')
revision = (await student(workspace, 'PUT', { code, revision })).revision
const sub = await student(path + '/submissions', 'POST', { exerciseId: e.id, revision }, 201)
revision = (await student(workspace, 'PUT', { code: '// modified after submission', revision }))
  .revision
assert.equal((await teacher(path + '/submissions')).find((s) => s.id === sub.id).code, code)
await student(path + '/help', 'POST', { exerciseId: e.id, message: '请帮助检查' }, 201)
assert.equal((await teacher(path + '/overview')).find((s) => s.id === studentUser.id).help, true)
await teacher(path + '/help/' + studentUser.id + '/resolve', 'POST', {}, 201)
assert.equal((await teacher(path + '/overview')).find((s) => s.id === studentUser.id).help, false)
const projection = await teacher(
  path + '/projections',
  'POST',
  { student: studentUser.id, exerciseId: e.id, runId: normal.id },
  201,
)
const snap = await teacher(path + '/projections/' + projection.id)
assert.equal(snap.code, normal.code)
assert.equal(snap.name, undefined)
await student(path + '/projections/' + projection.id, 'GET', undefined, 403)
await teacher(path + '/projections/' + projection.id + '/revoke', 'POST', {}, 201)
await teacher(path + '/projections/' + projection.id, 'GET', undefined, 404)
const exported = await teacher(path + '/export')
assert.ok(exported.runs.length >= 7)
assert.equal(exported.submissions[0].code, code)
await teacher(path + '/members/' + studentUser.id, 'PATCH', { status: 'removed' })
await student(workspace, 'GET', undefined, 403)
await admin(path + '/export', 'GET', undefined, 403)
await teacher(path, 'PATCH', { status: '已归档' })
await other(workspace, 'PUT', { code: 'blocked', revision: 0 }, 403)
checks.push(
  '提交不可变、求助解决、匿名投屏与撤销、真实导出、移除即时失权、管理员无作品权限、归档只读',
)
await mkdir('.local', { recursive: true })
await writeFile(
  '.local/acceptance-result.json',
  JSON.stringify({ date: new Date().toISOString(), classroomId: classroom.id, checks }, null, 2),
)
await writeFile(
  '.local/acceptance-credentials.json',
  JSON.stringify({
    teacher: { username: teacherUser.username, password },
    student: { username: studentUser.username, password },
    classroomId: classroom.id,
    exerciseId: e.id,
  }),
  { mode: 0o600 },
)
console.log(JSON.stringify({ passed: checks.length, checks }, null, 2))
