import { executionDefaults } from '@classroom/contracts'
import { setTimeout as delay } from 'node:timers/promises'
import { StringDecoder } from 'node:string_decoder'
import WebSocket from 'ws'
import type { Environment } from '@classroom/config'
import { createDatabase } from '@classroom/database'

type Pool = ReturnType<typeof createDatabase>['pool']
interface Run {
  id: string
  code: string
  filename: string
  input: string
  interactive: boolean
}
interface Result {
  status: string
  exitStatus: number
  time: number
  memory: number
  runTime: number
  files?: Record<string, string>
  fileIds?: Record<string, string>
  error?: string
}
const MiB = 1024 * 1024
const active = ['编译中', '运行中／可输入']
const env = ['PATH=/usr/bin:/bin', 'LANG=C.UTF-8', 'HOME=/w']
export function resultStatus(result: Result) {
  if (result.status === 'Accepted') return result.exitStatus === 0 ? '运行完成' : '运行失败'
  if (/Time Limit/.test(result.status)) return '超时'
  if (/Memory Limit|Output Limit/.test(result.status)) return '资源超限'
  if (/Internal|File Error/.test(result.status)) return '平台执行失败'
  return '运行失败'
}
export async function execute(pool: Pool, environment: Environment, run: Run) {
  const settings = {
    ...executionDefaults,
    ...(await pool.query("select value from platform_settings where id='execution'")).rows[0]
      ?.value,
  } as typeof executionDefaults
  const base = environment.GO_JUDGE_URL.replace(/\/$/, '')
  const headers = {
    Authorization: `Bearer ${environment.GO_JUDGE_AUTH_TOKEN}`,
    'Content-Type': 'application/json',
  }
  let executable: string | undefined
  let stopping = false
  let output = ''
  let stderr = ''
  let input = run.input
  let outputLimit = false
  let socket: WebSocket | undefined
  const abort = new AbortController()
  let polling = false
  let closed = false
  const persist = () =>
    pool.query(
      'update runs set output=$2,stderr=$3,input=$4,updated_at=now() where id=$1 and status=any($5)',
      [run.id, output, stderr, input, active],
    )
  const poll = async () => {
    if (polling || closed) return
    polling = true
    try {
      const state = (await pool.query('select stop_requested from runs where id=$1', [run.id]))
        .rows[0]
      if (!state || state.stop_requested) {
        stopping = true
        abort.abort()
        if (socket?.readyState === WebSocket.OPEN) socket.send(Buffer.from([4]))
      }
      if (!stopping && socket?.readyState === WebSocket.OPEN) {
        const messages = (
          await pool.query(
            'select * from run_inputs where run_id=$1 and not delivered order by created_at,id',
            [run.id],
          )
        ).rows
        for (const message of messages) {
          if (message.content) {
            socket.send(Buffer.concat([Buffer.from([3, 0]), Buffer.from(message.content)]))
            input += message.content
          }
          if (message.eof) socket.send(Buffer.from([5, 0]))
          await pool.query('update run_inputs set delivered=true where id=$1', [message.id])
        }
      }
      await persist()
    } finally {
      polling = false
    }
  }
  const timer = setInterval(() => {
    void poll().catch(() => {
      abort.abort()
      socket?.terminate()
    })
  }, 150)
  const finish = async (status: string, exit: string, metrics: unknown = {}) => {
    await pool.query(
      'update runs set status=$2,exit=$3,output=$4,stderr=$5,input=$6,metrics=$7,updated_at=now() where id=$1 and status=any($8)',
      [
        run.id,
        stopping ? '已停止' : status,
        stopping ? '用户停止' : exit,
        output,
        stderr,
        input,
        JSON.stringify(metrics),
        active,
      ],
    )
  }
  try {
    if (!base) throw new Error('执行节点尚未配置')
    const response = await fetch(`${base}/run`, {
      method: 'POST',
      headers,
      signal: AbortSignal.any([abort.signal, AbortSignal.timeout(25000)]),
      body: JSON.stringify({
        cmd: [
          {
            args: [
              '/usr/bin/g++',
              settings.compilerProfile === 'gcc13-cpp20' ? '-std=c++20' : '-std=c++17',
              '-O0',
              '-Wall',
              '-Wextra',
              run.filename,
              '-o',
              'program',
            ],
            env,
            files: [{ content: '' }, { name: 'stdout', max: MiB }, { name: 'stderr', max: MiB }],
            cpuLimit: settings.compileTimeMs * 1e6,
            clockLimit: 20e9,
            memoryLimit: settings.compileMemoryMb * MiB,
            stackLimit: 64 * MiB,
            procLimit: 64,
            copyIn: { [run.filename]: { content: run.code } },
            copyOutCached: ['program'],
            copyOutMax: 16 * MiB,
          },
        ],
      }),
    })
    if (!response.ok) throw new Error(`执行节点编译请求失败 (${response.status})`)
    const compiled = ((await response.json()) as Result[])[0]
    if (!compiled) throw new Error('执行节点未返回编译结果')
    executable = compiled.fileIds?.program
    const log = (compiled.files?.stderr ?? '') + (compiled.files?.stdout ?? '')
    await pool.query('update runs set log=$2,updated_at=now() where id=$1', [
      run.id,
      log || '编译成功，无诊断。',
    ])
    if (compiled.status !== 'Accepted' || !executable) {
      await finish(
        /Internal|File Error/.test(compiled.status) ? '平台执行失败' : '编译失败',
        `编译器 ${compiled.status} / ${compiled.exitStatus}`,
        { compile: compiled },
      )
      return
    }
    if (stopping) {
      await finish('已停止', '用户停止')
      return
    }
    await pool.query("update runs set status='运行中／可输入',updated_at=now() where id=$1", [
      run.id,
    ])
    const result = await new Promise<Result>((resolve, reject) => {
      socket = new WebSocket(`${base.replace(/^http/, 'ws')}/stream`, {
        headers,
        handshakeTimeout: 5000,
        maxPayload: 2 * MiB,
      })
      const decoders = { 1: new StringDecoder('utf8'), 2: new StringDecoder('utf8') }
      let completed = false
      const timeout = setTimeout(() => {
        socket?.terminate()
        reject(new Error('执行节点运行响应超时'))
      }, 70000)
      socket.on('open', () => {
        socket!.send(
          Buffer.concat([
            Buffer.from([1]),
            Buffer.from(
              JSON.stringify({
                requestId: run.id,
                cmd: [
                  {
                    args: ['/w/program'],
                    env,
                    files: [{ streamIn: true }, { streamOut: true }, { streamOut: true }],
                    cpuLimit: settings.runTimeMs * 1e6,
                    clockLimit: run.interactive ? 60e9 : 5e9,
                    memoryLimit: settings.runMemoryMb * MiB,
                    stackLimit: 64 * MiB,
                    procLimit: 32,
                    copyIn: { program: { fileId: executable } },
                  },
                ],
              }),
            ),
          ]),
        )
        if (run.input) socket!.send(Buffer.concat([Buffer.from([3, 0]), Buffer.from(run.input)]))
        if (!run.interactive) socket!.send(Buffer.from([5, 0]))
      })
      socket.on('message', (data) => {
        const packet = Buffer.from(data as Buffer)
        if (packet[0] === 2) {
          const fd = packet[1]! & 15
          if (fd === 1 || fd === 2) {
            const chunk = decoders[fd].write(packet.subarray(2))
            if (fd === 1) output += chunk
            else stderr += chunk
            if (
              Buffer.byteLength(output) + Buffer.byteLength(stderr) >
              settings.outputLimitKb * 1024
            ) {
              output = output.slice(0, settings.outputLimitKb * 512)
              stderr = stderr.slice(0, settings.outputLimitKb * 512)
              outputLimit = true
              socket!.send(Buffer.from([4]))
            }
          }
        } else if (packet[0] === 1) {
          clearTimeout(timeout)
          try {
            const response = JSON.parse(packet.subarray(1).toString()) as {
              results?: Result[]
              error?: string
            }
            if (response.error || !response.results?.[0]) throw new Error('执行节点未返回运行结果')
            output += decoders[1].end()
            stderr += decoders[2].end()
            completed = true
            resolve(response.results[0])
          } catch (e) {
            reject(e)
          }
        }
      })
      socket.on('error', reject)
      socket.on('close', () => {
        clearTimeout(timeout)
        if (!completed) reject(new Error('执行节点连接中断'))
      })
    })
    await finish(
      outputLimit ? '资源超限' : resultStatus(result),
      outputLimit ? '输出超过 1 MiB' : `${result.exitStatus} · ${result.status}`,
      { engine: 'go-judge 1.13.3 + stdin-eof', compiler: 'GCC 13 / C++17', ...result },
    )
  } catch (e) {
    await finish(
      outputLimit ? '资源超限' : '平台执行失败',
      outputLimit
        ? '输出超过配置上限'
        : e instanceof Error && !e.message.includes(base)
          ? e.message
          : '执行节点不可用，请稍后重试',
    )
  } finally {
    closed = true
    clearInterval(timer)
    while (polling) await delay(10)
    socket?.close()
    if (executable)
      await fetch(`${base}/file/${encodeURIComponent(executable)}`, {
        method: 'DELETE',
        headers,
        signal: AbortSignal.timeout(5000),
      }).catch(() => {})
  }
}

export function startExecutionQueue(pool: Pool, environment: Environment) {
  let closing = false
  let scanning = false
  const tasks = new Set<Promise<void>>()
  const scan = async () => {
    if (scanning || closing) return
    scanning = true
    try {
      await pool.query(
        "update runs set status='平台执行失败',exit='Worker 失联或重启；请重新运行',updated_at=now() where status=any($1) and updated_at<now()-interval '120 seconds'",
        [active],
      )
      await pool.query(
        "update runs set status='已停止',exit='用户停止' where status='排队' and stop_requested",
      )
      const settings = {
        ...executionDefaults,
        ...(await pool.query("select value from platform_settings where id='execution'")).rows[0]
          ?.value,
      } as typeof executionDefaults
      while (tasks.size < settings.executionConcurrency && !closing) {
        const r = (
          await pool.query(
            `update runs set status='编译中',updated_at=now() where id=(select id from runs where status='排队' and not stop_requested order by created_at for update skip locked limit 1) returning *`,
          )
        ).rows[0] as Run | undefined
        if (!r) break
        const task = execute(pool, environment, r).catch(() =>
          console.error('运行结果写入失败；由过期任务检测恢复'),
        )
        tasks.add(task)
        void task.finally(() => tasks.delete(task))
      }
    } finally {
      scanning = false
    }
  }
  const timer = setInterval(() => {
    void scan().catch(() => console.error('执行队列暂时不可用'))
  }, 250)
  void scan().catch(() => console.error('执行队列暂时不可用'))
  return async () => {
    closing = true
    clearInterval(timer)
    await pool.query('update runs set stop_requested=true where status=any($1)', [active])
    await Promise.allSettled(tasks)
  }
}
