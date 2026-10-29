/** Real API + worker + Linux sandbox acceptance using only new synthetic classroom data. */
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'

const base = process.env.ACCEPTANCE_API || 'http://127.0.0.1:3000/api'
const credentials = JSON.parse(await readFile('.local/initial-accounts.json', 'utf8'))
const report = { date: new Date().toISOString(), ok: false, archived: false, checks: [], runs: [] }
const activeStatuses = new Set(['排队', '编译中', '运行中／可输入'])
let classroomPath
let activeRunId

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
      `${method} ${path}: ${response.status} ${data.message ?? ''}`,
    )
    return data
  }
}
const admin = client()
const teacher = client()
const student = client()
const check = (name) => {
  report.checks.push(name)
  console.log(`PASS ${name}`)
}
async function awaitRun(id, condition = (run) => !activeStatuses.has(run.status)) {
  const deadline = Date.now() + 90000
  while (Date.now() < deadline) {
    const run = await student(`${classroomPath}/runs/${id}`)
    if (condition(run)) return run
    if (!activeStatuses.has(run.status))
      throw new Error(`Run ended before expected output: ${run.status}; ${run.exit}; ${run.stderr}`)
    await delay(250)
  }
  throw new Error(`Run ${id} did not finish within 90 seconds`)
}
async function execute(exerciseId, language, revision, options = {}) {
  const admitted = await student(classroomPath + '/runs', 'POST', {
    exerciseId,
    language,
    revision,
    input: '',
    ...options,
    // Neither an untrusted path nor command may override the controlled snapshot.
    filename: '../untrusted.py',
    runtimeProfile: '/bin/sh',
    executionConfig: { runTimeMs: 999999 },
  })
  activeRunId = admitted.id
  assert.equal(admitted.language, language)
  assert.equal(admitted.revision, revision)
  assert.ok(admitted.executionConfig.runTimeMs <= 10000)
  assert.ok(!admitted.filename.includes('/'))
  if (language === 'python') {
    assert.equal(admitted.runtimeProfile, 'cpython3-stdlib')
    assert.equal(admitted.compilerProfile, null)
  } else assert.match(admitted.runtimeProfile, /^gcc13-cpp(17|20)$/)
  const finished = options.interactive ? admitted : await awaitRun(admitted.id)
  if (!options.interactive) recordRun(finished)
  return finished
}
function recordRun(run) {
  activeRunId = undefined
  report.runs.push({
    id: run.id,
    language: run.language,
    runtimeProfile: run.runtimeProfile,
    runtimeVersion: run.metrics.runtimeVersion ?? run.metrics.compiler,
    status: run.status,
  })
}

try {
  await admin('/auth/login', 'POST', credentials.admin)
  const suffix = Date.now().toString(36)
  const syntheticTeacher = {
    username: `languages.teacher.${suffix}`,
    password: randomBytes(24).toString('base64url'),
    name: '双语言验收教师',
    role: 'teacher',
  }
  const createdTeacher = await admin('/admin/users', 'POST', syntheticTeacher)
  report.teacherId = createdTeacher.id
  await teacher('/auth/login', 'POST', syntheticTeacher)
  const classroom = await teacher('/classes', 'POST', {
    name: `双语言验收 ${suffix}`,
    description: '自动验收新建的合成课堂；固定源码仅由独立 worker 发送到 Linux go-judge。',
  })
  report.classroomId = classroom.id
  classroomPath = `/classes/${classroom.id}`
  await teacher(classroomPath, 'PATCH', { status: '进行中' })
  const account = await teacher(classroomPath + '/members', 'POST', {
    name: '双语言验收学生',
    number: `languages.${suffix}`,
  })
  await student('/auth/login', 'POST', { username: account.username, password: account.password })
  const starters = {
    cpp: '#include <iostream>\nint main(){std::cout << "C++ starter\\n";}\n',
    python: 'print("Python 模板")\n',
  }
  const exercise = await teacher(classroomPath + '/exercises', 'POST', {
    title: '同题双语言',
    filename: 'languages.py',
    language: 'python',
    starters,
    code: starters.python,
    status: '已发布',
    description: '验证独立语言草稿和真实沙箱运行。',
  })
  report.exerciseId = exercise.id
  const workspace = `${classroomPath}/workspace/${exercise.id}`
  const readWorkspace = (language) => student(`${workspace}?language=${language}`)
  const save = async (language, code, revision) =>
    (await student(workspace, 'PUT', { language, code, revision })).revision
  const listed = (await student(classroomPath + '/exercises')).find(
    (item) => item.id === exercise.id,
  )
  assert.equal(listed.language, 'python')
  assert.deepEqual(listed.starters, starters)
  assert.equal((await student(workspace)).code, starters.python)
  assert.equal((await readWorkspace('cpp')).code, starters.cpp)
  check('Python 默认模板与独立 C++ 模板')

  const pythonCode =
    'import json, sys\nprint(json.dumps({"platform": sys.platform, "version": sys.version.split()[0], "isolated": sys.flags.isolated, "no_site": sys.flags.no_site, "input": sys.stdin.read()}, ensure_ascii=False))\n'
  const cppCode =
    '#include <iostream>\n#include <string>\nint main(){std::string text; std::getline(std::cin,text); std::cout << "cpp:" << text << "\\n";}\n'
  let cppRevision = await save('cpp', cppCode, 0)
  let pythonRevision = await save('python', pythonCode, 0)
  assert.equal(cppRevision, 1)
  assert.equal(pythonRevision, 1)
  await student(workspace, 'PUT', { language: 'python', code: 'stale', revision: 0 }, 409)
  await student(
    classroomPath + '/runs',
    'POST',
    { exerciseId: exercise.id, language: 'python', revision: 99, input: '' },
    409,
  )
  assert.equal((await readWorkspace('cpp')).code, cppCode)
  assert.equal((await readWorkspace('python')).code, pythonCode)
  check('双语言草稿互不覆盖，过期保存与运行版本被拒绝')

  const pythonRun = await execute(exercise.id, 'python', pythonRevision, { input: '中文输入\n' })
  assert.equal(pythonRun.status, '运行完成', pythonRun.exit)
  const pythonOutput = JSON.parse(pythonRun.output)
  assert.deepEqual(
    { ...pythonOutput, version: undefined },
    { platform: 'linux', version: undefined, isolated: 1, no_site: 1, input: '中文输入\n' },
  )
  assert.match(pythonOutput.version, /^3\./)
  assert.equal(pythonRun.metrics.runtimeVersion, `Python ${pythonOutput.version}`)
  assert.equal(pythonRun.log, '')
  assert.equal(pythonRun.filename, 'languages.py')
  check('真实 Linux Python 执行、UTF-8 输入、隔离标志、版本与运行环境快照')

  pythonRevision = await save('python', 'raise ValueError("验收 traceback")\n', pythonRevision)
  const failedRun = await execute(exercise.id, 'python', pythonRevision)
  assert.equal(failedRun.status, '运行失败', failedRun.exit)
  assert.match(failedRun.stderr, /Traceback \(most recent call last\):/)
  assert.ok(failedRun.stderr.includes('ValueError: 验收 traceback'))
  assert.ok(failedRun.stderr.includes('languages.py'))
  assert.equal(failedRun.log, '')
  check('Python 原始 traceback、文件名与运行失败状态')

  const interactiveCode =
    'import sys\nprint("ready")\nfor line in sys.stdin:\n    print("echo:" + line.strip())\nprint("EOF 完成")\n'
  pythonRevision = await save('python', interactiveCode, pythonRevision)
  const interactiveRun = await execute(exercise.id, 'python', pythonRevision, { interactive: true })
  await awaitRun(interactiveRun.id, (run) => run.output.includes('ready\n'))
  await student(`${classroomPath}/runs/${interactiveRun.id}/input`, 'POST', {
    text: '交互中文\n',
    eof: false,
  })
  const echoed = await awaitRun(interactiveRun.id, (run) => run.output.includes('echo:交互中文\n'))
  assert.equal(echoed.status, '运行中／可输入')
  await student(`${classroomPath}/runs/${interactiveRun.id}/input`, 'POST', { text: '', eof: true })
  const interactiveFinished = await awaitRun(interactiveRun.id)
  assert.equal(interactiveFinished.status, '运行完成', interactiveFinished.exit)
  assert.equal(interactiveFinished.output, 'ready\necho:交互中文\nEOF 完成\n')
  assert.equal(interactiveFinished.eof, true)
  await student(
    `${classroomPath}/runs/${interactiveRun.id}/input`,
    'POST',
    { text: 'late', eof: false },
    409,
  )
  recordRun(interactiveFinished)
  check('Python 交互输出及时刷新，UTF-8 输入与显式 EOF 正常，EOF 后拒绝输入')

  const cppRun = await execute(exercise.id, 'cpp', cppRevision, { input: '回归\n' })
  assert.equal(cppRun.status, '运行完成', cppRun.exit)
  assert.equal(cppRun.output, 'cpp:回归\n')
  assert.equal(cppRun.filename, `exercise-${exercise.id}.cpp`)
  assert.ok(cppRun.log.includes('编译成功'))
  check('同题切回 C++ 后保留原草稿并完成真实编译运行')

  await teacher(classroomPath, 'PATCH', { settings: { allowResubmit: false } })
  const submissionCpp = await student(classroomPath + '/submissions', 'POST', {
    exerciseId: exercise.id,
    language: 'cpp',
    revision: cppRevision,
  })
  const submissionPython = await student(classroomPath + '/submissions', 'POST', {
    exerciseId: exercise.id,
    language: 'python',
    revision: pythonRevision,
  })
  assert.equal(submissionCpp.language, 'cpp')
  assert.equal(submissionPython.language, 'python')
  assert.equal(submissionCpp.code, cppCode)
  assert.equal(submissionPython.code, interactiveCode)
  assert.equal((await readWorkspace('cpp')).submitted, true)
  assert.equal((await readWorkspace('python')).submitted, true)
  assert.equal(
    (
      await student(classroomPath + '/submissions', 'POST', {
        exerciseId: exercise.id,
        language: 'cpp',
        revision: cppRevision,
      })
    ).id,
    submissionCpp.id,
  )
  cppRevision = await save('cpp', cppCode + '// later draft\n', cppRevision)
  await student(
    classroomPath + '/submissions',
    'POST',
    { exerciseId: exercise.id, language: 'cpp', revision: cppRevision },
    403,
  )
  const latest = await teacher(`${classroomPath}/submissions?latest=true&page=1&pageSize=20`)
  assert.equal(latest.total, 2)
  assert.deepEqual(latest.items.map((item) => item.language).sort(), ['cpp', 'python'])
  assert.equal(
    (await teacher(`${classroomPath}/submissions?latest=true&language=python`)).length,
    1,
  )
  const pythonHistory = await student(
    `${classroomPath}/runs?exercise=${exercise.id}&language=python&page=1&pageSize=20`,
  )
  const cppHistory = await student(`${classroomPath}/runs?exercise=${exercise.id}&language=cpp`)
  assert.equal(pythonHistory.total, 3)
  assert.ok(pythonHistory.items.every((run) => run.language === 'python'))
  assert.equal(cppHistory.length, 1)
  assert.equal(cppHistory[0].language, 'cpp')
  check('按语言独立提交、幂等与重交限制、最新提交以及运行历史筛选')

  const pythonHelp = await student(classroomPath + '/help', 'POST', {
    exerciseId: exercise.id,
    language: 'python',
    message: 'Python 合成求助',
  })
  const cppHelp = await student(classroomPath + '/help', 'POST', {
    exerciseId: exercise.id,
    language: 'cpp',
    message: 'C++ 合成求助',
  })
  assert.notEqual(pythonHelp.id, cppHelp.id)
  assert.equal((await readWorkspace('python')).help.language, 'python')
  await student(classroomPath + '/heartbeat', 'POST', {
    exerciseId: exercise.id,
    language: 'python',
  })
  const overview = (await teacher(classroomPath + '/overview')).find(
    (item) => item.id === account.id,
  )
  assert.equal(overview.language, 'python')
  assert.equal(overview.status, '运行完成')
  assert.equal(overview.submitted, true)
  check('求助、学生当前语言与教师总览保持一致')

  for (const [kind, fields, code] of [
    ['run', { runId: pythonRun.id, language: 'cpp' }, pythonCode],
    ['submission', { submissionId: submissionPython.id }, interactiveCode],
    ['draft', { language: 'python' }, interactiveCode],
  ]) {
    const projection = await teacher(classroomPath + '/projections', 'POST', {
      student: account.id,
      exerciseId: exercise.id,
      ...fields,
    })
    const snapshot = await teacher(`${classroomPath}/projections/${projection.id}`)
    assert.equal(snapshot.kind, kind)
    assert.equal(snapshot.language, 'python')
    assert.equal(snapshot.code, code)
    assert.equal(snapshot.filename, 'languages.py')
    if (kind === 'run') assert.equal(snapshot.runtimeProfile, 'cpython3-stdlib')
    await teacher(`${classroomPath}/projections/${projection.id}/revoke`, 'POST', {})
  }
  const exported = await teacher(
    `${classroomPath}/export?student=${account.id}&exercise=${exercise.id}`,
  )
  assert.equal(exported.drafts.length, 2)
  assert.equal(exported.runs.length, 4)
  assert.equal(exported.submissions.length, 2)
  assert.deepEqual(exported.exercises[0].starters, starters)
  const pythonExport = await teacher(`${classroomPath}/export?language=python`)
  assert.equal(pythonExport.drafts.length, 1)
  assert.ok(
    [...pythonExport.drafts, ...pythonExport.runs, ...pythonExport.submissions].every(
      (item) => item.language === 'python',
    ),
  )
  check('草稿、提交、运行投屏冻结语言与源码；双语言导出与语言筛选正确')

  await student(`${workspace}?language=shell`, 'GET', undefined, 400)
  await student(
    workspace,
    'PUT',
    { language: 'shell', code: 'fixed invalid source', revision: 0 },
    400,
  )
  await student(
    classroomPath + '/runs',
    'POST',
    { exerciseId: exercise.id, language: 'shell', revision: 1, input: '' },
    400,
  )
  await teacher(
    classroomPath + '/exercises',
    'POST',
    { filename: '../escape.py', language: 'python' },
    400,
  )
  await teacher(
    classroomPath + '/exercises',
    'POST',
    { filename: 'mismatch.py', language: 'cpp' },
    400,
  )
  await teacher(
    classroomPath + '/exercises/import',
    'POST',
    { exercises: [{ filename: 'mismatch.cpp', language: 'python' }] },
    400,
  )
  assert.equal((await student(classroomPath + '/exercises')).length, 1)
  check('非法语言、目录穿越文件名和默认语言扩展名不匹配均被拒绝')
  report.ok = true
} catch (error) {
  report.error = error instanceof Error ? error.message : String(error)
  process.exitCode = 1
} finally {
  if (activeRunId && classroomPath)
    await student(`${classroomPath}/runs/${activeRunId}/stop`, 'POST', {}).catch(() => {})
  if (classroomPath) {
    try {
      await teacher(classroomPath, 'PATCH', { status: '已归档' })
      report.archived = true
    } catch (error) {
      report.cleanupError = error instanceof Error ? error.message : String(error)
      report.ok = false
      process.exitCode = 1
    }
  }
  await mkdir('.local', { recursive: true })
  await writeFile(
    '.local/multilanguage-acceptance-result.json',
    JSON.stringify(report, null, 2) + '\n',
    { mode: 0o600 },
  )
  console.log(JSON.stringify(report, null, 2))
}
