import { randomUUID } from 'node:crypto'
import { loadEnvironment } from '@classroom/config'
import { executionDefaults } from '@classroom/contracts'
import { execute, type Run } from './execution.js'

interface ProbeResult {
  status: string
  exit: string
  output: string
  stderr: string
  input: string
  metrics: Record<string, unknown>
}

interface ProbeCase {
  name: string
  code: string
  language?: 'cpp' | 'python'
  input?: string
  interactive?: boolean
  messages?: { content: string; eof: boolean }[]
  stopAfterOutput?: string
  limits?: Partial<typeof executionDefaults>
  verify: (result: ProbeResult) => boolean
}

// Exercise the configured execution node without a database, accounts or student data.
// The only programs submitted by this script are the fixed probes below.
const cases: ProbeCase[] = [
  {
    name: 'python-stdlib-isolation',
    code: `import json, statistics, sys
print(json.dumps({"mean": statistics.mean([2, 4, 6]), "isolated": sys.flags.isolated, "no_site": sys.flags.no_site, "encoding": sys.stdout.encoding}))
print(any("site-packages" in path or "dist-packages" in path for path in sys.path))
`,
    verify: (result) =>
      result.status === '运行完成' &&
      result.output.includes('"mean": 4') &&
      result.output.includes('"isolated": 1') &&
      result.output.includes('"no_site": 1') &&
      result.output.includes('"encoding": "utf-8"') &&
      result.output.endsWith('False\n'),
  },
  {
    name: 'python-utf8-input-eof',
    code: 'import sys\nfor line in sys.stdin:\n    print("echo:" + line.strip())\nprint("eof")\n',
    input: '中文输入\n',
    verify: (result) => result.status === '运行完成' && result.output === 'echo:中文输入\neof\n',
  },
  {
    name: 'python-interactive-eof',
    code: 'import sys\nfor line in sys.stdin:\n    print("echo:" + line.strip())\nprint("eof")\n',
    input: '第一行\n',
    interactive: true,
    messages: [{ content: '第二行\n', eof: true }],
    verify: (result) =>
      result.status === '运行完成' && result.output === 'echo:第一行\necho:第二行\neof\n',
  },
  {
    name: 'python-syntax-error',
    code: 'if True print("syntax")\n',
    verify: (result) => result.status === '运行失败' && result.stderr.includes('SyntaxError'),
  },
  {
    name: 'python-runtime-traceback',
    code: 'raise ValueError("probe traceback")\n',
    verify: (result) =>
      result.status === '运行失败' && result.stderr.includes('ValueError: probe traceback'),
  },
  {
    name: 'python-stop',
    code: 'print("ready")\nwhile True:\n    pass\n',
    interactive: true,
    stopAfterOutput: 'ready',
    verify: (result) => result.status === '已停止' && result.output.includes('ready'),
  },
  {
    name: 'python-cpu-limit',
    code: 'while True:\n    pass\n',
    limits: { runTimeMs: 100 },
    verify: (result) => result.status === '超时',
  },
  {
    name: 'python-memory-limit',
    code: 'data = bytearray(128 * 1024 * 1024)\nprint(len(data))\n',
    limits: { runMemoryMb: 32 },
    verify: (result) => result.status === '资源超限',
  },
  {
    name: 'python-output-limit',
    code: 'while True:\n    print("x" * 1024)\n',
    limits: { outputLimitKb: 8 },
    verify: (result) =>
      result.status === '资源超限' &&
      Buffer.byteLength(result.output) + Buffer.byteLength(result.stderr) <= 8 * 1024,
  },
  {
    name: 'cpp17-regression',
    language: 'cpp',
    code: '#include <iostream>\nint main() { int a,b; std::cin >> a >> b; std::cout << a+b << "\\n"; }\n',
    input: '4 12\n',
    verify: (result) => result.status === '运行完成' && result.output === '16\n',
  },
]

const environment = loadEnvironment()
if (!environment.GO_JUDGE_URL) throw new Error('请先配置 GO_JUDGE_URL')
if (!environment.GO_JUDGE_AUTH_TOKEN) throw new Error('请先配置 GO_JUDGE_AUTH_TOKEN')
let failed = false
for (const probe of cases) {
  let output = ''
  let messages = probe.messages ?? []
  let result: ProbeResult | undefined
  const pool = {
    query: async (sql: string, values: unknown[] = []) => {
      if (sql.startsWith('select stop_requested'))
        return {
          rows: [
            {
              stop_requested: Boolean(
                probe.stopAfterOutput && output.includes(probe.stopAfterOutput),
              ),
            },
          ],
        }
      if (sql.startsWith('select * from run_inputs')) {
        const pending = messages.map((message, index) => ({ ...message, id: String(index) }))
        messages = []
        return { rows: pending }
      }
      if (sql.startsWith('update runs set output=')) output = values[1] as string
      if (sql.startsWith('update runs set status=$2')) {
        result = {
          status: values[1] as string,
          exit: values[2] as string,
          output: values[3] as string,
          stderr: values[4] as string,
          input: values[5] as string,
          metrics: JSON.parse(values[6] as string),
        }
      }
      return { rows: [] }
    },
  } as unknown as Parameters<typeof execute>[0]
  const language = probe.language ?? 'python'
  const run: Run = {
    id: randomUUID(),
    language,
    runtime_profile: language === 'python' ? 'cpython3-stdlib' : 'gcc13-cpp17',
    execution_config: { ...executionDefaults, ...probe.limits },
    filename: language === 'python' ? 'probe.py' : 'probe.cpp',
    code: probe.code,
    input: probe.input ?? '',
    interactive: probe.interactive ?? false,
  }
  await execute(pool, environment, run)
  const ok = result && probe.verify(result)
  failed ||= !ok
  console.log(
    JSON.stringify({
      probe: probe.name,
      ok: Boolean(ok),
      ...result,
      output: result?.output.slice(0, 240),
      outputBytes: Buffer.byteLength(result?.output ?? ''),
    }),
  )
  // A missing/misconfigured node should not cause every probe to retry the same failure.
  if (result?.status === '平台执行失败') break
}
if (failed) process.exitCode = 1
