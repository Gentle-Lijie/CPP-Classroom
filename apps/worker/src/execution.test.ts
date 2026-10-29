import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WebSocketServer } from 'ws'
import { environmentSchema } from '@classroom/config'
import { executionDefaults } from '@classroom/contracts'
import { execute, resultStatus, type Run } from './execution.js'
import { pythonArguments, type JudgeResult } from './runtime.js'

const accepted: JudgeResult = {
  status: 'Accepted',
  exitStatus: 0,
  time: 1000000,
  memory: 8 * 1024 * 1024,
  runTime: 2000000,
}
const servers: { http: Server; ws: WebSocketServer }[] = []
afterEach(async () => {
  for (const { http, ws } of servers.splice(0)) {
    for (const client of ws.clients) client.terminate()
    await new Promise<void>((resolve) => ws.close(() => resolve()))
    await new Promise<void>((resolve) => http.close(() => resolve()))
  }
})

interface Command {
  args: string[]
  copyIn?: Record<string, { content?: string; fileId?: string }>
  cpuLimit: number
  memoryLimit: number
  files: unknown[]
}

async function fakeJudge(
  options: {
    result?: JudgeResult
    compilerResult?: JudgeResult
    missingPython?: boolean
    output?: { fd: number; bytes: Buffer }[]
    finishOn?: 'eof' | 'stop'
  } = {},
) {
  const requests: { path: string; body?: { cmd: Command[] } }[] = []
  const frames: Buffer[] = []
  let streamCommand: Command | undefined
  const http = createServer(async (req, res) => {
    const chunks: Buffer[] = []
    for await (const chunk of req) chunks.push(Buffer.from(chunk))
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : undefined
    requests.push({ path: req.url!, body })
    if (req.method === 'DELETE') {
      res.writeHead(204).end()
      return
    }
    const python = body.cmd[0].args[0] === '/usr/bin/python3'
    const result = python
      ? options.missingPython
        ? { ...accepted, status: 'Internal Error', error: 'execve: no such file' }
        : { ...accepted, files: { stdout: 'Python 3.12.3\n' } }
      : (options.compilerResult ?? { ...accepted, fileIds: { program: 'program-cache' } })
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify([result]))
  })
  const ws = new WebSocketServer({ server: http })
  ws.on('connection', (socket) => {
    let completed = false
    socket.on('message', (data) => {
      const frame = Buffer.from(data as Buffer)
      frames.push(frame)
      if (frame[0] === 1) {
        streamCommand = JSON.parse(frame.subarray(1).toString()).cmd[0]
        for (const output of options.output ?? [])
          socket.send(Buffer.concat([Buffer.from([2, output.fd]), output.bytes]))
      }
      if (!completed && ((frame[0] === 5 && options.finishOn !== 'stop') || frame[0] === 4)) {
        completed = true
        socket.send(
          Buffer.concat([
            Buffer.from([1]),
            Buffer.from(JSON.stringify({ results: [options.result ?? accepted] })),
          ]),
        )
      }
    })
  })
  await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve))
  servers.push({ http, ws })
  const address = http.address() as AddressInfo
  return {
    requests,
    frames,
    command: () => streamCommand,
    environment: environmentSchema.parse({
      DATABASE_URL: 'postgresql://unused:unused@127.0.0.1/unused',
      GO_JUDGE_URL: `http://127.0.0.1:${address.port}`,
      GO_JUDGE_AUTH_TOKEN: 'test-only',
    }),
  }
}

function fakePool(
  options: { stop?: () => boolean; inputs?: { content: string; eof: boolean }[] } = {},
) {
  let delivered = false
  const query = vi.fn(async (sql: string, values?: unknown[]) => {
    if (sql.startsWith('select stop_requested'))
      return { rows: [{ stop_requested: options.stop?.() ?? false }] }
    if (sql.startsWith('select * from run_inputs'))
      return {
        rows: delivered
          ? []
          : (options.inputs ?? []).map((input, id) => ({ ...input, id: `input-${id}` })),
      }
    if (sql.startsWith('update run_inputs')) delivered = true
    return { rows: [], values }
  })
  return {
    pool: { query } as unknown as Parameters<typeof execute>[0],
    query,
    result: () => {
      const values = query.mock.calls.find(([sql]) =>
        sql.startsWith('update runs set status=$2'),
      )?.[1]
      return values
        ? {
            status: values[1],
            exit: values[2],
            output: values[3],
            stderr: values[4],
            input: values[5],
            metrics: JSON.parse(values[6] as string),
          }
        : undefined
    },
  }
}

const pythonRun: Run = {
  id: 'python-test',
  language: 'python',
  runtime_profile: 'cpython3-stdlib',
  code: 'print(input())\n',
  filename: '练习.py',
  input: '你好\n',
  interactive: false,
  execution_config: { ...executionDefaults, runTimeMs: 1500, runMemoryMb: 128 },
}

describe('native go-judge language execution', () => {
  it('runs Python source with isolated UTF-8 stdlib settings, preserved limits and real EOF', async () => {
    const bytes = Buffer.from('你好\n')
    const judge = await fakeJudge({
      output: [
        { fd: 1, bytes: bytes.subarray(0, 2) },
        { fd: 1, bytes: bytes.subarray(2) },
      ],
    })
    const db = fakePool()
    await execute(db.pool, judge.environment, pythonRun)
    expect(judge.requests).toHaveLength(1)
    expect(judge.requests[0]?.body?.cmd[0]?.args).toEqual([
      ...pythonArguments,
      '-c',
      'import sys; print("Python " + sys.version.split()[0])',
    ])
    expect(judge.command()).toMatchObject({
      args: [...pythonArguments, '/w/练习.py'],
      copyIn: { '练习.py': { content: pythonRun.code } },
      cpuLimit: 1500e6,
      memoryLimit: 128 * 1024 * 1024,
    })
    expect(
      judge.frames
        .find((frame) => frame[0] === 3)
        ?.subarray(2)
        .toString(),
    ).toBe('你好\n')
    expect(judge.frames.some((frame) => frame.equals(Buffer.from([5, 0])))).toBe(true)
    expect(db.result()).toMatchObject({
      status: '运行完成',
      output: '你好\n',
      input: '你好\n',
      metrics: {
        language: 'python',
        runtimeProfile: 'cpython3-stdlib',
        runtimeVersion: 'Python 3.12.3',
      },
    })
    expect(db.query.mock.calls.some(([sql]) => sql.includes('platform_settings'))).toBe(false)
    expect(db.query.mock.calls.some(([sql]) => sql.startsWith('update runs set log='))).toBe(false)
  })

  it('keeps C++20 compilation, cached executable cleanup and recorded compiler accurate', async () => {
    const judge = await fakeJudge()
    const db = fakePool()
    await execute(db.pool, judge.environment, {
      ...pythonRun,
      language: 'cpp',
      runtime_profile: 'gcc13-cpp20',
      filename: 'main.cpp',
      code: 'int main() {}',
    })
    expect(judge.requests[0]?.body?.cmd[0]?.args).toContain('-std=c++20')
    expect(judge.command()).toMatchObject({
      args: ['/w/program'],
      copyIn: { program: { fileId: 'program-cache' } },
    })
    expect(judge.requests.at(-1)?.path).toBe('/file/program-cache')
    expect(db.result()?.metrics.compiler).toBe('GCC 13 / C++20')
  })

  it.each(['SyntaxError: invalid syntax', 'ValueError: invalid literal for int()'])(
    'retains Python stderr: %s',
    async (error) => {
      const judge = await fakeJudge({
        result: { ...accepted, status: 'Nonzero Exit Status', exitStatus: 1 },
        output: [{ fd: 2, bytes: Buffer.from(error) }],
      })
      const db = fakePool()
      await execute(db.pool, judge.environment, pythonRun)
      expect(db.result()).toMatchObject({ status: '运行失败', stderr: error })
    },
  )

  it('reports a missing interpreter as a platform failure before sending student code', async () => {
    const judge = await fakeJudge({ missingPython: true })
    const db = fakePool()
    await execute(db.pool, judge.environment, pythonRun)
    expect(judge.frames).toHaveLength(0)
    expect(db.result()).toMatchObject({ status: '平台执行失败' })
    expect(db.result()?.exit).toContain('/usr/bin/python3')
  })

  it('delivers queued interactive input and closes stdin without cancelling', async () => {
    const judge = await fakeJudge()
    const db = fakePool({
      inputs: [
        { content: 'second\n', eof: false },
        { content: '', eof: true },
      ],
    })
    await execute(db.pool, judge.environment, { ...pythonRun, interactive: true })
    expect(
      judge.frames.filter((frame) => frame[0] === 3).map((frame) => frame.subarray(2).toString()),
    ).toEqual(['你好\n', 'second\n'])
    expect(judge.frames.some((frame) => frame[0] === 4)).toBe(false)
    expect(db.result()).toMatchObject({ status: '运行完成', input: '你好\nsecond\n' })
  })

  it('cancels interactive Python through the existing stop frame', async () => {
    const judge = await fakeJudge({ finishOn: 'stop' })
    const db = fakePool({ stop: () => Boolean(judge.command()) })
    await execute(db.pool, judge.environment, { ...pythonRun, interactive: true })
    expect(judge.frames.some((frame) => frame.equals(Buffer.from([4])))).toBe(true)
    expect(db.result()).toMatchObject({ status: '已停止', exit: '用户停止' })
  })

  it('caps combined Python output and terminates the process', async () => {
    const judge = await fakeJudge({
      finishOn: 'stop',
      output: [{ fd: 1, bytes: Buffer.from('中'.repeat(1000)) }],
    })
    const db = fakePool()
    await execute(db.pool, judge.environment, {
      ...pythonRun,
      execution_config: { ...executionDefaults, outputLimitKb: 1 },
    })
    expect(db.result()?.status).toBe('资源超限')
    expect(Buffer.byteLength(db.result()?.output as string)).toBeLessThanOrEqual(1024)
    expect(db.result()?.output).not.toContain('�')
    expect(judge.frames.some((frame) => frame[0] === 4)).toBe(true)
  })

  it('rejects unsupported profiles instead of turning metadata into executable commands', async () => {
    const judge = await fakeJudge()
    const db = fakePool()
    await execute(db.pool, judge.environment, { ...pythonRun, runtime_profile: '/bin/sh' })
    expect(judge.requests).toHaveLength(0)
    expect(db.result()?.status).toBe('平台执行失败')
  })

  it.each([
    ['Time Limit Exceeded', '超时'],
    ['Memory Limit Exceeded', '资源超限'],
    ['Output Limit Exceeded', '资源超限'],
    ['Internal Error', '平台执行失败'],
  ])('preserves resource and platform outcomes: %s', (status, expected) => {
    expect(resultStatus({ ...accepted, status })).toBe(expected)
  })
})
