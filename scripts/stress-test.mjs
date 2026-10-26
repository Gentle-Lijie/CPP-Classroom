import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { config } from 'dotenv'
import pg from 'pg'

config({ quiet: true })
const apiBase = process.env.ACCEPTANCE_API || 'http://127.0.0.1:3000/api'
const directory = '.local/stress'
await mkdir(directory, { recursive: true, mode: 0o700 })
const mode = process.argv.includes('--admission-only') ? 'admission' : 'full'
const only = process.env.STRESS_ONLY || ''
const stamp = new Date().toISOString().replaceAll(':', '-')
const output = `${directory}/${stamp}`
await mkdir(output, { mode: 0o700 })
const started = performance.now()
let phase = 'setup'
const requests = [],
  phases = [],
  snapshots = [],
  remoteMetrics = [],
  errors = []
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 })
const activeStatuses = ['排队', '编译中', '运行中／可输入']
const simple = '#include <iostream>\nint main(){long n;std::cin>>n;std::cout<<n*n<<std::endl;}\n'
const waiting =
  '#include <iostream>\nint main(){int n;std::cout<<"ready"<<std::endl;while(std::cin>>n)std::cout<<n<<std::endl;}\n'
const percentile = (values, p) =>
  values.length ? [...values].sort((a, b) => a - b)[Math.ceil(values.length * p) - 1] : 0
function log(message) {
  console.log(JSON.stringify({ phase, elapsed: Math.round(performance.now() - started), message }))
}
function client() {
  let cookie = ''
  return async (path, method = 'GET', body, options = {}) => {
    const t = performance.now()
    let status = 0,
      data
    try {
      const response = await fetch(apiBase + path, {
        method,
        headers: { Cookie: cookie, 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(options.timeout ?? 30000),
      })
      status = response.status
      if (response.headers.get('set-cookie'))
        cookie = response.headers.get('set-cookie').split(';')[0]
      data = await response.json()
      const expected = options.statuses ?? [200, 201]
      if (!expected.includes(status))
        throw new Error(`${method} ${path}: ${status} ${data.message ?? ''}`)
      return options.response ? { status, data } : data
    } finally {
      const elapsed = performance.now() - t
      requests.push({
        t: Math.round(t - started),
        phase,
        method,
        route: path.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, ':id').split('?')[0],
        status,
        ms: Math.round(elapsed * 10) / 10,
        expected: status > 0 && (options.statuses ?? [200, 201]).includes(status),
      })
    }
  }
}
const teacher = client()
const initial = JSON.parse(await readFile('.local/initial-accounts.json', 'utf8'))
await teacher('/auth/login', 'POST', initial.teacher)
let fixture
try {
  fixture = JSON.parse(await readFile(`${directory}/fixtures.json`, 'utf8'))
} catch {
  /* Optional prior fixtures or telemetry may not be available. */
}
if (!fixture) {
  const suffix = Date.now().toString(36)
  fixture = {
    createdAt: new Date().toISOString(),
    classes: [],
    students: [],
    teacher: initial.teacher,
  }
  for (let group = 0; group < 3; group++) {
    const classroom = await teacher('/classes', 'POST', {
      name: `压力测试 ${suffix} · ${group + 1}`,
      description: '自动压力测试专用；所有成员均为合成账号。',
    })
    const path = '/classes/' + classroom.id
    await teacher(path, 'PATCH', { status: '进行中' })
    const exercise = await teacher(path + '/exercises', 'POST', {
      title: '并发编译与输入输出',
      topic: '压力验收',
      filename: 'stress.cpp',
      status: '已发布',
      description: '输入整数，输出它的平方。此课堂用于压力测试。',
      input: '整数',
      output: '平方',
      sampleInput: '7',
      sampleOutput: '49',
      code: simple,
    })
    await teacher(path, 'PATCH', { recommended: exercise.id })
    fixture.classes.push({
      id: classroom.id,
      exerciseId: exercise.id,
      name: `压力测试 ${suffix} · ${group + 1}`,
    })
    const count = group === 2 ? 20 : 50
    for (let j = 0; j < count; j++) {
      const password = randomBytes(18).toString('base64url')
      const member = await teacher(path + '/members', 'POST', {
        name: `压力学生 ${String(group * 50 + j + 1).padStart(3, '0')}`,
        number: `stress.${suffix}.${group * 50 + j + 1}`,
        password,
      })
      fixture.students.push({
        id: member.id,
        username: member.username,
        password: member.password,
        classroomId: classroom.id,
        exerciseId: exercise.id,
      })
    }
    log(`prepared ${fixture.students.length}/120 synthetic accounts`)
  }
  await writeFile(`${directory}/fixtures.json`, JSON.stringify(fixture, null, 2), { mode: 0o600 })
}
for (const c of fixture.classes) await teacher('/classes/' + c.id, 'PATCH', { status: '进行中' })
const students = []
for (const account of fixture.students) {
  const call = client()
  await call('/auth/login', 'POST', { username: account.username, password: account.password })
  const path = '/classes/' + account.classroomId
  const draft = await call(path + '/workspace/' + account.exerciseId)
  students.push({ ...account, call, path, revision: draft.revision })
}
const classIds = fixture.classes.map((c) => c.id)
let sampling = false,
  sampleTimer,
  metricProcess,
  disposed = false
let observerBusy = false
let activePeople = []
const observerTimer = setInterval(async () => {
  if (observerBusy || disposed) return
  observerBusy = true
  try {
    await Promise.all(fixture.classes.map((c) => teacher(`/classes/${c.id}/overview`)))
    if (activePeople[0])
      await teacher(
        activePeople[0].path +
          '/workspace/' +
          activePeople[0].exerciseId +
          '?student=' +
          activePeople[0].id,
      )
  } catch (e) {
    errors.push({ phase, error: e.message })
  } finally {
    observerBusy = false
  }
}, 1000)
let pulseBusy = false
const pulseTimer = setInterval(async () => {
  if (pulseBusy || disposed) return
  pulseBusy = true
  try {
    await Promise.all(activePeople.map(heartbeat))
  } catch (e) {
    errors.push({ phase, error: e.message })
  } finally {
    pulseBusy = false
  }
}, 5000)
async function sample() {
  if (sampling || disposed) return
  sampling = true
  try {
    const row = (
      await pool.query(
        `select count(*) filter(where status='排队')::int as queued,count(*) filter(where status in ('编译中','运行中／可输入'))::int as active,count(*) filter(where status='平台执行失败')::int as platform_failed from runs where classroom_id=any($1::uuid[])`,
        [classIds],
      )
    ).rows[0]
    snapshots.push({ t: Math.round(performance.now() - started), phase, ...row })
  } finally {
    sampling = false
  }
}
sampleTimer = setInterval(
  () => void sample().catch((e) => errors.push({ phase, error: e.message })),
  200,
)
try {
  metricProcess = spawn(
    'ssh',
    [
      '-T',
      '-o',
      'BatchMode=yes',
      '-o',
      'ClearAllForwardings=yes',
      '-o',
      'ConnectTimeout=8',
      'aim-radar',
      'python3',
      '-u',
      '-',
    ],
    { stdio: ['pipe', 'pipe', 'pipe'] },
  )
  metricProcess.stdin.end(
    `import json,time\nfrom pathlib import Path\nprevious=None\nfor _ in range(900):\n v=list(map(int,Path('/proc/stat').read_text().splitlines()[0].split()[1:]));total=sum(v);idle=v[3]+v[4]\n m={line.split(':')[0]:int(line.split()[1]) for line in Path('/proc/meminfo').read_text().splitlines()}\n cpu=0 if previous is None else 100*(1-(idle-previous[1])/max(1,total-previous[0]))\n previous=(total,idle)\n print(json.dumps({'at':time.time(),'cpu':round(cpu,2),'memoryUsedMiB':round((m['MemTotal']-m['MemAvailable'])/1024),'memoryTotalMiB':round(m['MemTotal']/1024)}),flush=True)\n time.sleep(1)\n`,
  )
  let pending = ''
  metricProcess.stdout.on('data', (chunk) => {
    pending += chunk
    const lines = pending.split('\n')
    pending = lines.pop()
    for (const line of lines) {
      try {
        remoteMetrics.push({
          t: Math.round(performance.now() - started),
          phase,
          ...JSON.parse(line),
        })
      } catch {
        /* Optional prior fixtures or telemetry may not be available. */
      }
    }
  })
  metricProcess.on('error', () => {})
} catch {
  /* Optional prior fixtures or telemetry may not be available. */
}
async function save(s, code) {
  const result = await s.call(s.path + '/workspace/' + s.exerciseId, 'PUT', {
    code,
    revision: s.revision,
  })
  s.revision = result.revision
  return result
}
async function heartbeat(s) {
  await s.call(s.path + '/heartbeat', 'POST', { exerciseId: s.exerciseId })
}
async function submit(s, interactive = false, input = '7', options) {
  return s.call(
    s.path + '/runs',
    'POST',
    { exerciseId: s.exerciseId, revision: s.revision, input, interactive },
    options,
  )
}
async function submitWithBackpressure(s, interactive = false, input = '7') {
  const deadline = Date.now() + 30000
  while (Date.now() < deadline) {
    const response = await submit(s, interactive, input, { statuses: [201, 409], response: true })
    if (response.status === 201) return response.data
    if (response.data.message !== '队列已满，请稍后重试') throw new Error(response.data.message)
    await sleep(200)
  }
  throw new Error('Queue admission still full after bounded backoff')
}
async function waitRun(s, run, timeout = 180000) {
  const until = Date.now() + timeout
  while (Date.now() < until) {
    const result = await s.call(s.path + '/runs/' + run.id)
    if (!activeStatuses.includes(result.status)) return result
    await sleep(300)
  }
  throw Error('run timed out at test harness')
}
async function cancelAll() {
  await pool.query(
    `update runs set stop_requested=true,status=case when status='排队' then '已停止' else status end where classroom_id=any($1::uuid[]) and status=any($2)`,
    [classIds, activeStatuses],
  )
  const until = Date.now() + 15000
  while (Date.now() < until) {
    const n = (
      await pool.query(
        'select count(*)::int as n from runs where classroom_id=any($1::uuid[]) and status=any($2)',
        [classIds, activeStatuses],
      )
    ).rows[0].n
    if (!n) return
    await sleep(200)
  }
}
async function inPhase(name, fn) {
  phase = name
  await writeFile(
    `${directory}/current.json`,
    JSON.stringify({ phase, output, classes: fixture.classes, at: new Date().toISOString() }),
  )
  const t = performance.now()
  const before = requests.length
  log('start')
  try {
    const result = await fn()
    const subset = requests.slice(before)
    const summary = {
      name,
      start: Math.round(t - started),
      end: Math.round(performance.now() - started),
      durationMs: Math.round(performance.now() - t),
      requests: subset.length,
      unexpectedErrors: subset.filter((r) => !r.expected).length,
      ...result,
    }
    phases.push(summary)
    log(summary)
    return summary
  } catch (e) {
    errors.push({ phase, error: e.message })
    phases.push({
      name,
      start: Math.round(t - started),
      end: Math.round(performance.now() - started),
      failed: true,
      error: e.message,
    })
    log('FAILED ' + e.message)
    throw e
  }
}
let failure
try {
  await cancelAll()
  const settings = await students[0].call('/health/environment')
  await writeFile(
    `${output}/environment.json`,
    JSON.stringify(
      {
        date: new Date().toISOString(),
        apiBase: 'local business API',
        runner: 'AIM-Radar native Linux via authenticated HTTPS/WSS',
        settings,
        fixtureStudents: students.length,
      },
      null,
      2,
    ),
  )
  const admission = await inPhase('admission-120', async () => {
    activePeople = students
    await Promise.all(
      students.map(async (s) => {
        await save(s, waiting)
        await heartbeat(s)
      }),
    )
    const responses = await Promise.all(
      students.map((s) => submit(s, true, '', { statuses: [201, 409], response: true })),
    )
    const accepted = responses.filter((r) => r.status === 201).length,
      rejected = responses.filter((r) => r.status === 409).length
    const backlog = (
      await pool.query(
        'select count(*)::int as n from runs where classroom_id=any($1::uuid[]) and status=any($2)',
        [classIds, activeStatuses],
      )
    ).rows[0].n
    await sample()
    const acceptedPeople = students.filter((_, i) => responses[i].status === 201).slice(0, 10)
    const duplicates = await Promise.all(
      acceptedPeople.map((s) => submit(s, true, '', { statuses: [409], response: true })),
    )
    await cancelAll()
    return {
      submitted: 120,
      accepted,
      rejected,
      backlog,
      duplicateRejects: duplicates.length,
      withinLimit: backlog <= 100 && accepted <= 100,
    }
  })
  if (!admission.withinLimit)
    throw Error(
      `global admission exceeded 100: ${admission.accepted} accepted / ${admission.backlog} backlog`,
    )
  if (mode === 'full') {
    if (!only || only === 'burst')
      for (const count of [10, 25, 50, 100]) {
        await inPhase(`burst-${count}`, async () => {
          const people = students.slice(0, count),
            durations = [],
            compileAndRunMs = []
          activePeople = people
          for (let round = 0; round < 2; round++) {
            const waveStart = performance.now()
            await Promise.all(
              people.map(async (s, i) => {
                await save(s, simple + `// burst ${count} round ${round} student ${i}\n`)
                await heartbeat(s)
                const r = await submitWithBackpressure(s, false, String(i + 1))
                const result = await waitRun(s, r)
                assert.equal(result.status, '运行完成', result.exit)
                assert.equal(result.output, String((i + 1) ** 2) + '\n')
                durations.push(performance.now() - waveStart)
                compileAndRunMs.push(Number(result.metrics?.runTime ?? 0) / 1e6)
              }),
            )
          }
          return {
            users: count,
            rounds: 2,
            completed: count * 2,
            totalP50Ms: Math.round(percentile(durations, 0.5)),
            totalP95Ms: Math.round(percentile(durations, 0.95)),
            totalP99Ms: Math.round(percentile(durations, 0.99)),
            maxMs: Math.round(Math.max(...durations)),
            engineRunP95Ms: Math.round(percentile(compileAndRunMs, 0.95)),
          }
        })
      }
    if (!only || only === 'soak')
      await inPhase('soak-50-120s', async () => {
        const people = students.slice(0, 50),
          until = Date.now() + 120000,
          latencies = [],
          completions = []
        activePeople = people
        let cycles = 0
        const startedSoak = Date.now()
        async function exclusive(s, fn) {
          const previous = s.pending ?? Promise.resolve()
          let release
          s.pending = new Promise((resolve) => (release = resolve))
          await previous
          try {
            return await fn()
          } finally {
            release()
          }
        }
        const editors = people.map(async (s, i) => {
          let iteration = 0
          while (Date.now() < until) {
            const t = performance.now()
            await exclusive(s, () =>
              save(s, simple + `// continuous editing ${i} save ${iteration}\n`),
            )
            latencies.push(performance.now() - t)
            iteration++
            cycles++
            await sleep(800)
          }
        })
        const runners = people.map(async (s, i) => {
          while (Date.now() < until) {
            const t = performance.now()
            const run = await exclusive(s, () => submitWithBackpressure(s, false, String(i + 2)))
            const end = await waitRun(s, run)
            assert.equal(end.status, '运行完成', end.exit)
            assert.equal(end.output, String((i + 2) ** 2) + '\n')
            completions.push(performance.now() - t)
            await sleep(500)
          }
        })
        await Promise.all([...editors, ...runners])
        return {
          users: 50,
          editDurationMs: 120000,
          durationMs: Date.now() - startedSoak,
          saveCycles: cycles,
          completed: completions.length,
          saveP95Ms: Math.round(percentile(latencies, 0.95)),
          totalP95Ms: Math.round(percentile(completions, 0.95)),
        }
      })
    if (!only || only === 'mixed')
      await inPhase('mixed-50', async () => {
        const people = students.slice(0, 50),
          counts = {}
        activePeople = people
        await Promise.all(
          people.map(async (s, i) => {
            const kind = i % 10
            const source =
              kind === 0
                ? 'int main(){while(true){}}'
                : kind === 1
                  ? '#include <cstdlib>\nint main(){auto p=(char*)malloc(1024UL*1024*1024);for(unsigned long i=0;i<1024UL*1024*1024;i+=4096)p[i]=42;return p[100];}'
                  : kind === 2
                    ? '#include <iostream>\nint main(){while(true)std::cout<<"中文无限输出";}'
                    : kind === 3
                      ? 'int main(){broken syntax}'
                      : simple
            const expected =
              kind === 0
                ? '超时'
                : kind === 1 || kind === 2
                  ? '资源超限'
                  : kind === 3
                    ? '编译失败'
                    : '运行完成'
            await save(s, source)
            const r = await submitWithBackpressure(s, false, String(i + 1))
            const result = await waitRun(s, r)
            assert.equal(result.status, expected, `${kind}: ${result.exit}`)
            if (expected === '运行完成') assert.equal(result.output, String((i + 1) ** 2) + '\n')
            if (kind === 2)
              assert.ok(
                Buffer.byteLength(result.output) + Buffer.byteLength(result.stderr) <=
                  settings.outputLimitKb * 1024,
              )
            counts[expected] = (counts[expected] ?? 0) + 1
          }),
        )
        return { users: 50, completed: 50, expectedStates: counts }
      })
    if (!only || only === 'mixed')
      await inPhase('interactive-20', async () => {
        activePeople = students.slice(0, 20)
        await Promise.all(
          students.slice(0, 20).map(async (s, i) => {
            await save(
              s,
              '#include <iostream>\nint main(){std::cout<<"ready"<<std::endl;int n,s=0;while(std::cin>>n)s+=n;std::cout<<"sum="<<s<<std::endl;}',
            )
            const run = await submitWithBackpressure(s, true, '')
            const deadline = Date.now() + 120000
            while (Date.now() < deadline) {
              const r = await s.call(s.path + '/runs/' + run.id)
              if (r.status === '运行中／可输入') break
              assert.ok(activeStatuses.includes(r.status), r.exit)
              await sleep(200)
            }
            await s.call(s.path + '/runs/' + run.id + '/input', 'POST', {
              text: `${i + 1}\n${i + 2}\n`,
            })
            await s.call(s.path + '/runs/' + run.id + '/input', 'POST', { eof: true })
            const result = await waitRun(s, run)
            assert.equal(result.status, '运行完成', result.exit)
            assert.match(result.output, new RegExp('sum=' + String(i * 2 + 3) + '\\b'))
          }),
        )
        return { users: 20, completed: 20, eofVerified: 20 }
      })
  }
} catch (e) {
  failure = e
} finally {
  phase = 'cleanup'
  await cancelAll().catch(() => {})
  disposed = true
  clearInterval(observerTimer)
  clearInterval(pulseTimer)
  clearInterval(sampleTimer)
  metricProcess?.kill('SIGTERM')
  while (sampling || observerBusy || pulseBusy) await sleep(10)
  await pool.end()
  const measured = requests.filter((r) => r.phase !== 'setup' && r.phase !== 'cleanup')
  const result = {
    date: new Date().toISOString(),
    mode,
    scope: only || mode,
    passed: !failure && !errors.length,
    durationMs: Math.round(performance.now() - started),
    phases,
    errors,
    summary: {
      requests: measured.length,
      unexpectedErrors: measured.filter((r) => !r.expected).length,
      expectedConflicts: measured.filter((r) => r.status === 409 && r.expected).length,
      requestP50Ms: Math.round(
        percentile(
          measured.map((r) => r.ms),
          0.5,
        ),
      ),
      requestP95Ms: Math.round(
        percentile(
          measured.map((r) => r.ms),
          0.95,
        ),
      ),
      requestP99Ms: Math.round(
        percentile(
          measured.map((r) => r.ms),
          0.99,
        ),
      ),
      teacherOverviewP95Ms: Math.round(
        percentile(
          measured.filter((r) => r.route.endsWith('/overview')).map((r) => r.ms),
          0.95,
        ),
      ),
      saveP95Ms: Math.round(
        percentile(
          measured.filter((r) => r.method === 'PUT').map((r) => r.ms),
          0.95,
        ),
      ),
      peakActive: Math.max(0, ...snapshots.map((s) => s.active)),
      peakQueued: Math.max(0, ...snapshots.map((s) => s.queued)),
      peakCpu: Math.max(0, ...remoteMetrics.map((m) => m.cpu)),
      peakMemoryMiB: Math.max(0, ...remoteMetrics.map((m) => m.memoryUsedMiB)),
    },
    requests,
    snapshots,
    remoteMetrics,
  }
  await writeFile(`${output}/result.json`, JSON.stringify(result, null, 2))
  await writeFile(
    `${directory}/latest.json`,
    JSON.stringify({ path: `${output}/result.json`, passed: !failure }, null, 2),
  )
  log({ result: `${output}/result.json`, passed: !failure, summary: result.summary })
  if (failure) {
    process.exitCode = 1
    console.error(failure.message)
  }
}
