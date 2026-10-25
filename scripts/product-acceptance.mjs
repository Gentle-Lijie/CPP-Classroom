/** Product regressions using a new synthetic classroom. Does not execute student code. */
import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
const base = process.env.ACCEPTANCE_API || 'http://127.0.0.1:3000/api'
const initial = JSON.parse(await readFile('.local/initial-accounts.json', 'utf8'))
const checks = []
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
const teacher = client(),
  student = client(),
  peer = client(),
  admin = client()
await teacher('/auth/login', 'POST', initial.teacher)
await admin('/auth/login', 'POST', initial.admin)
const suffix = Date.now().toString(36)
const classroom = await teacher('/classes', 'POST', {
  name: `产品回归 ${suffix}`,
  description: '合成学生与题目，不执行学生代码，不修改原有课堂。',
})
const path = `/classes/${classroom.id}`
await teacher(path, 'PATCH', { status: '进行中' })
const a = await teacher(path + '/members', 'POST', {
  name: '回归学生甲',
  number: `product.${suffix}.a`,
})
const b = await teacher(path + '/members', 'POST', {
  name: '回归学生乙',
  number: `product.${suffix}.b`,
})
await student('/auth/login', 'POST', { username: a.username, password: a.password })
await peer('/auth/login', 'POST', { username: b.username, password: b.password })
const makeExercise = (filename, title) =>
  teacher(path + '/exercises', 'POST', {
    title,
    topic: '产品回归',
    filename,
    status: '已发布',
    description: '输出 Hello，无输入。',
    input: '',
    output: 'Hello',
    sampleInput: '',
    sampleOutput: 'Hello',
    code: 'int main(){return 0;}',
  })
const e1 = await makeExercise('hello.cpp', '无输入练习'),
  e2 = await makeExercise('other.cpp', '第二道练习')
assert.equal((await student(path + '/exercises')).length, 2)
checks.push('无输入练习可直接发布')
await teacher(path, 'PATCH', { recommended: e1.id, settings: { allowResubmit: false } })
const workspace = `${path}/workspace/${e1.id}`
const revision = (
  await student(workspace, 'PUT', { code: '// first immutable version', revision: 0 })
).revision
const repeated = await Promise.all(
  Array.from({ length: 6 }, () =>
    student(path + '/submissions', 'POST', { exerciseId: e1.id, revision }),
  ),
)
assert.equal(new Set(repeated.map((s) => s.id)).size, 1)
const submission = repeated[0]
assert.equal((await teacher(path + '/submissions')).length, 1)
const next = (await student(workspace, 'PUT', { code: '// newer draft', revision })).revision
await Promise.all(
  Array.from({ length: 3 }, () =>
    student(path + '/submissions', 'POST', { exerciseId: e1.id, revision: next }, 403),
  ),
)
assert.equal((await teacher(path + '/submissions'))[0].code, '// first immutable version')
checks.push('并发重复点击提交幂等；禁止重复提交在事务锁内生效；提交快照不可变')
await teacher(path, 'PATCH', { settings: { allowResubmit: true } })
await student(path + '/submissions', 'POST', { exerciseId: e1.id, revision: next })
await peer(workspace, 'PUT', { code: '// peer draft', revision: 0 })
const paged = await teacher(path + '/submissions?page=1&pageSize=1')
assert.equal(paged.total, 2)
assert.equal(paged.items.length, 1)
assert.equal((await teacher(path + '/submissions?page=2&pageSize=1')).items.length, 1)
assert.equal((await teacher(path + '/submissions?latest=true&page=1&pageSize=20')).total, 1)
assert.equal((await teacher(path + '/submissions?exercise=' + e2.id)).length, 0)
assert.equal((await teacher(path + '/submissions?student=' + b.id)).length, 0)
const exactSubmission = await teacher(
  path + '/submissions?submissionId=' + submission.id + '&page=1&pageSize=1',
)
assert.equal(exactSubmission.total, 1)
assert.equal(exactSubmission.items[0].id, submission.id)
assert.equal((await peer(path + '/submissions?submissionId=' + submission.id)).length, 0)
assert.equal((await student(path + '/submissions?student=' + b.id)).length, 2)
assert.equal((await peer(path + '/submissions?student=' + a.id)).length, 0)
await teacher(path + '/submissions?pageSize=1000', 'GET', undefined, 400)
checks.push('提交分页、最新版本、练习/学生筛选，学生只能读取自己的记录')
const helpA = await student(path + '/help', 'POST', {
  exerciseId: e1.id,
  message: '第一题需要帮助',
})
const helpUpdated = await student(path + '/help', 'POST', {
  exerciseId: e1.id,
  message: '第一题更新后的具体问题',
})
assert.equal(helpA.id, helpUpdated.id)
await student(path + '/help', 'POST', { exerciseId: e2.id, message: '第二题独立求助' })
await peer(path + '/help', 'POST', { exerciseId: e1.id, message: '同学乙的私有求助' })
assert.equal((await student(path + '/help')).length, 2)
assert.equal(
  (await student(path + '/help?exerciseId=' + e1.id))[0].message,
  '第一题更新后的具体问题',
)
await teacher(`${path}/help/${a.id}/resolve`, 'POST', {}, 400)
await teacher(`${path}/help/${a.id}/resolve`, 'POST', { requestId: helpA.id, exerciseId: e1.id })
const helps = await student(path + '/help')
assert.equal(helps.find((h) => h.exercise_id === e1.id).resolved, true)
assert.equal(helps.find((h) => h.exercise_id === e2.id).resolved, false)
await student(path + '/heartbeat', 'POST', { exerciseId: e2.id })
const overview = (await teacher(path + '/overview')).find((s) => s.id === a.id)
assert.equal(overview.submitted, false)
assert.equal(overview.recommendedSubmitted, true)
assert.equal(overview.helpExerciseId, e2.id)
assert.equal(overview.helpMessage, '第二题独立求助')
assert.equal(overview.status, '尚未运行')
checks.push('同题求助更新不刷屏、学生求助隔离、按请求解决不误清其他题、总览关联当前题与推荐题')
const projection = await teacher(path + '/projections', 'POST', {
  student: a.id,
  exerciseId: e1.id,
  submissionId: submission.id,
})
const snapshot = await teacher(path + '/projections/' + projection.id)
assert.equal(snapshot.kind, 'submission')
assert.equal(snapshot.id, submission.id)
assert.equal(snapshot.code, '// first immutable version')
assert.equal(snapshot.filename, 'hello.cpp')
assert.equal(snapshot.user_id, undefined)
assert.equal(snapshot.name, undefined)
const draftProjection = await teacher(path + '/projections', 'POST', {
  student: a.id,
  exerciseId: e1.id,
})
const draftSnapshot = await teacher(path + '/projections/' + draftProjection.id)
assert.equal(draftSnapshot.kind, 'draft')
assert.equal(draftSnapshot.code, '// newer draft')
assert.equal(draftSnapshot.status, undefined)
assert.equal(draftSnapshot.output, undefined)
await teacher(
  path + '/projections',
  'POST',
  { student: a.id, exerciseId: e1.id, submissionId: submission.id, runId: submission.id },
  400,
)
await peer(path + '/projections/' + projection.id, 'GET', undefined, 403)
await teacher(path + '/projections/' + projection.id + '/revoke', 'POST', {})
await teacher(path + '/projections/' + projection.id, 'GET', undefined, 404)
checks.push('提交独立投屏、草稿不冒充运行、匿名快照、投屏权限与撤销')
const exported = await teacher(
  `${path}/export?exercise=${e1.id}&student=${a.id}&kind=drafts&includeRuns=false`,
)
assert.equal(exported.drafts.length, 1)
assert.equal(exported.drafts[0].code, '// newer draft')
assert.equal(exported.submissions.length, 0)
assert.equal(exported.runs.length, 0)
assert.equal(exported.roster.length, 1)
assert.equal(exported.exercises.length, 1)
await admin(path + '/export', 'GET', undefined, 403)
await peer(path + '/export', 'GET', undefined, 403)
checks.push('草稿可独立导出、学生/练习范围、运行上下文排除、导出权限')
await teacher(path, 'PATCH', { status: '已归档' })
await mkdir('.local', { recursive: true })
await writeFile(
  '.local/product-acceptance-result.json',
  JSON.stringify({ date: new Date().toISOString(), classroomId: classroom.id, checks }, null, 2),
  { mode: 0o600 },
)
console.log(JSON.stringify({ ok: true, classroomId: classroom.id, checks }, null, 2))
