import { executionDefaults, type ExecutionConfig } from '@classroom/contracts'

export interface JudgeResult {
  status: string
  exitStatus: number
  time: number
  memory: number
  runTime: number
  files?: Record<string, string>
  fileIds?: Record<string, string>
  error?: string
}

export interface RuntimeSnapshot {
  language?: string
  runtime_profile?: string | null
  compiler_profile?: string | null
  execution_config?: Partial<ExecutionConfig> | null
}

export const MiB = 1024 * 1024
export const judgeEnvironment = ['PATH=/usr/bin:/bin', 'LANG=C.UTF-8', 'HOME=/w']
export const pythonArguments = ['/usr/bin/python3', '-I', '-S', '-B', '-u', '-X', 'utf8']

/** Commands are selected here, never accepted from a task's source or metadata. */
export function resolveRuntime(run: RuntimeSnapshot) {
  const settings = { ...executionDefaults, ...run.execution_config }
  const language = run.language ?? 'cpp'
  if (language === 'python') {
    const profile = run.runtime_profile ?? 'cpython3-stdlib'
    if (profile !== 'cpython3-stdlib') throw new Error('不支持的 Python 运行环境')
    return { language, profile, settings, compiler: null }
  }
  if (language !== 'cpp') throw new Error('不支持的编程语言')
  const profile = run.runtime_profile ?? run.compiler_profile ?? settings.compilerProfile
  if (profile !== 'gcc13-cpp17' && profile !== 'gcc13-cpp20')
    throw new Error('不支持的 C++ 运行环境')
  return {
    language,
    profile,
    settings,
    compiler: profile === 'gcc13-cpp20' ? 'GCC 13 / C++20' : 'GCC 13 / C++17',
  }
}

/** Probe the same sandbox's interpreter so a missing runtime is a platform failure. */
export async function probePythonRuntime(
  base: string,
  headers: Record<string, string>,
  signal?: AbortSignal,
): Promise<string> {
  const response = await fetch(`${base}/run`, {
    method: 'POST',
    headers,
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(15000)])
      : AbortSignal.timeout(15000),
    body: JSON.stringify({
      cmd: [
        {
          args: [...pythonArguments, '-c', 'import sys; print("Python " + sys.version.split()[0])'],
          env: judgeEnvironment,
          files: [{ content: '' }, { name: 'stdout', max: 1024 }, { name: 'stderr', max: 4096 }],
          cpuLimit: 1e9,
          clockLimit: 3e9,
          memoryLimit: 64 * MiB,
          stackLimit: 8 * MiB,
          procLimit: 8,
        },
      ],
    }),
  })
  if (!response.ok) throw new Error(`Python 运行环境检查失败 (${response.status})`)
  const result = ((await response.json()) as JudgeResult[])[0]
  const version = result?.files?.stdout?.trim()
  if (
    result?.status !== 'Accepted' ||
    result.exitStatus !== 0 ||
    !version ||
    !/^Python 3\.\d+\.\d+(?:[a-z\d.+-]*)?$/i.test(version)
  )
    throw new Error('Python 运行环境不可用，请管理员检查执行节点的 /usr/bin/python3')
  return version
}
