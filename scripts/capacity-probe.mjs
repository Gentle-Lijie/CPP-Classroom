import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import { setTimeout as sleep } from 'node:timers/promises'
const base = process.env.ACCEPTANCE_API || 'http://127.0.0.1:3000/api'
function client() {
  let cookie = ''
  return async (path, method = 'GET', body) => {
    const r = await fetch(base + path, {
      method,
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    if (r.headers.get('set-cookie')) cookie = r.headers.get('set-cookie').split(';')[0]
    const data = await r.json()
    if (!r.ok) throw Error(JSON.stringify(data))
    return data
  }
}
const teacher = client()
const credentials = JSON.parse(await readFile('.local/acceptance-credentials.json', 'utf8'))
await teacher('/auth/login', 'POST', credentials.teacher)
const suffix = Date.now().toString(36)
const c = await teacher('/classes', 'POST', { name: '50 人容量验收 ' + suffix })
const path = '/classes/' + c.id
await teacher(path, 'PATCH', { status: '进行中' })
const code = '#include <iostream>\nint main(){int n;std::cin>>n;std::cout<<n*n<<std::endl;}'
const e = await teacher(path + '/exercises', 'POST', {
  title: '并发平方计算',
  topic: '容量验收',
  filename: 'square.cpp',
  status: '已发布',
  description: '50 人同时保存和运行',
  input: '整数',
  output: '平方',
  sampleInput: '2',
  sampleOutput: '4',
  code,
})
const students = []
const password = randomBytes(16).toString('base64url')
for (let i = 0; i < 50; i++) {
  const account = await teacher(path + '/members', 'POST', {
    name: '容量验收' + String(i + 1).padStart(2, '0'),
    number: suffix + String(i + 1).padStart(2, '0'),
    password,
  })
  const call = client()
  await call('/auth/login', 'POST', { username: account.username, password })
  students.push(call)
}
const started = performance.now()
const samples = []
const runs = await Promise.all(
  students.map(async (call, i) => {
    const t = performance.now()
    const d = await call(path + '/workspace/' + e.id, 'PUT', { code, revision: 0 })
    await call(path + '/heartbeat', 'POST', { exerciseId: e.id })
    samples.push(performance.now() - t)
    const r = await call(path + '/runs', 'POST', {
      exerciseId: e.id,
      revision: d.revision,
      input: String(i + 1),
      interactive: false,
    })
    return { id: r.id, call, i, finished: false }
  }),
)
let peakQueued = 0,
  peakActive = 0
const deadline = Date.now() + 120000
const completions = []
while (Date.now() < deadline && runs.some((r) => !r.finished)) {
  await Promise.all(
    runs
      .filter((r) => !r.finished)
      .map(async (r) => {
        const data = await r.call(path + '/runs/' + r.id)
        if (!['排队', '编译中', '运行中／可输入'].includes(data.status)) {
          assert.equal(data.status, '运行完成', data.exit)
          assert.equal(data.output, String((r.i + 1) ** 2) + '\n')
          r.finished = true
          completions.push(performance.now() - started)
        }
      }),
  )
  const overview = await teacher(path + '/overview')
  peakQueued = Math.max(peakQueued, overview.filter((s) => s.status === '排队').length)
  peakActive = Math.max(
    peakActive,
    overview.filter((s) => ['编译中', '运行中／可输入'].includes(s.status)).length,
  )
  await sleep(150)
}
assert.equal(runs.filter((r) => r.finished).length, 50)
const percentile = (items, p) => items.sort((a, b) => a - b)[Math.ceil(items.length * p) - 1]
const result = {
  date: new Date().toISOString(),
  students: 50,
  passed: 50,
  classroomId: c.id,
  saveAndHeartbeatP95Ms: Math.round(percentile(samples, 0.95)),
  runTotalP95Ms: Math.round(percentile(completions, 0.95)),
  totalMs: Math.round(performance.now() - started),
  peakQueued,
  peakActive,
}
await writeFile('.local/capacity-result.json', JSON.stringify(result, null, 2))
console.log(JSON.stringify(result, null, 2))
await teacher(path, 'PATCH', { status: '已归档' })
