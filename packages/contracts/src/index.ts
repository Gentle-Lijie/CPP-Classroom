export type DependencyState = 'healthy' | 'unavailable' | 'unconfigured'

// Leave headroom below the API and reverse proxy's 512 KiB JSON body limit.
export const exerciseImportLimits = {
  files: 50,
  fileBytes: 1024 * 1024,
  bodyBytes: 500 * 1024,
} as const

export const sourceLanguages = ['cpp', 'python'] as const
export type SourceLanguage = (typeof sourceLanguages)[number]
export type SourceStarters = Partial<Record<SourceLanguage, string>>

export const runtimeProfiles = {
  'gcc13-cpp17': { language: 'cpp', label: 'GCC 13 / C++17', beta: false },
  'gcc13-cpp20': { language: 'cpp', label: 'GCC 13 / C++20', beta: false },
  'cpython3-stdlib': { language: 'python', label: 'CPython 3 / 标准库', beta: true },
} as const
export type RuntimeProfile = keyof typeof runtimeProfiles
export const defaultRuntimeProfiles = { cpp: 'gcc13-cpp17', python: 'cpython3-stdlib' } as const

export function validSourceFilename(filename: string, language?: SourceLanguage): boolean {
  return (
    filename.length <= 80 &&
    /^[\p{L}\p{N}_][\p{L}\p{N}_.-]*\.(cpp|cc|cxx|py)$/iu.test(filename) &&
    !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])\./i.test(filename) &&
    (!language ||
      (language === 'python' ? /\.py$/i.test(filename) : /\.(cpp|cc|cxx)$/i.test(filename)))
  )
}

interface ExerciseSource {
  id?: string
  filename?: string
  language?: SourceLanguage
  starters?: SourceStarters
  code?: string
  content?: { code?: string; language?: SourceLanguage; starters?: SourceStarters }
}

/** Alternate-language files use the exercise ID to avoid collisions with named exercises. */
export function exerciseSourceFilename(
  exercise: ExerciseSource & { id: string; filename: string },
  language: SourceLanguage = exercise.language ?? 'cpp',
): string {
  if (exercise.filename && validSourceFilename(exercise.filename, language))
    return exercise.filename
  return `exercise-${exercise.id}.${language === 'python' ? 'py' : 'cpp'}`
}

export function exerciseStarterCode(exercise: ExerciseSource, language: SourceLanguage): string {
  const starters = exercise.starters ?? exercise.content?.starters
  const starter = starters?.[language]
  if (starter !== undefined) return starter
  if (language === (exercise.language ?? exercise.content?.language ?? 'cpp'))
    return exercise.code ?? exercise.content?.code ?? ''
  return ''
}

export interface DependencyCheck {
  status: DependencyState
  message: string
  latencyMs?: number
}

export interface ReadinessResponse {
  service: 'cpp-classroom-api'
  status: 'ready' | 'degraded'
  timestamp: string
  checks: { database: DependencyCheck; runner: DependencyCheck }
}

export const PROBE_QUEUE = 'infrastructure.probe'
export interface ProbeJob {
  requestedAt: string
}

export const executionLimits = { maxConcurrentRuns: 16 } as const

export const executionDefaults = {
  compilerProfile: 'gcc13-cpp17',
  compileTimeMs: 10000,
  compileMemoryMb: 512,
  runTimeMs: 2000,
  runMemoryMb: 256,
  outputLimitKb: 1024,
  executionConcurrency: 16,
}

export const languageExecutionDefaults = {
  cpp: {
    compilerProfile: 'gcc13-cpp17' as 'gcc13-cpp17' | 'gcc13-cpp20',
    compileTimeMs: 10000,
    compileMemoryMb: 512,
    runTimeMs: 2000,
    runMemoryMb: 256,
    outputLimitKb: 1024,
    optimization: 'O0' as 'O0' | 'O1' | 'O2' | 'O3',
    warnings: true,
    macros: '',
  },
  python: {
    runTimeMs: 2000,
    runMemoryMb: 256,
    outputLimitKb: 1024,
    optimization: 'none' as 'none' | 'O' | 'OO',
  },
}
export type LanguageExecutionSettings = typeof languageExecutionDefaults

/** Upgrade legacy shared limits in memory without changing persisted data. */
export function languageSettings(
  settings: Record<string, unknown> = {},
): LanguageExecutionSettings {
  const saved =
    settings.languages && typeof settings.languages === 'object'
      ? (settings.languages as Partial<LanguageExecutionSettings>)
      : {}
  const shared = Object.fromEntries(
    [
      'compileTimeMs',
      'compileMemoryMb',
      'runTimeMs',
      'runMemoryMb',
      'outputLimitKb',
      'compilerProfile',
    ]
      .filter((key) => settings[key] !== undefined)
      .map((key) => [key, settings[key]]),
  )
  return {
    cpp: { ...languageExecutionDefaults.cpp, ...shared, ...saved.cpp },
    python: {
      ...languageExecutionDefaults.python,
      ...Object.fromEntries(
        ['runTimeMs', 'runMemoryMb', 'outputLimitKb']
          .filter((key) => settings[key] !== undefined)
          .map((key) => [key, settings[key]]),
      ),
      ...saved.python,
    },
  }
}

/** Allow wall time above the CPU budget, with a longer window for interactive input. */
export function wallClockLimitMs(cpuTimeMs: number, interactive = false) {
  const limit = Math.max(2 * cpuTimeMs, cpuTimeMs + 1000)
  return interactive ? Math.max(60000, limit) : limit
}

export interface ExecutionConfig {
  compileTimeMs: number
  compileMemoryMb: number
  runTimeMs: number
  runMemoryMb: number
  outputLimitKb: number
  optimization?: 'O0' | 'O1' | 'O2' | 'O3' | 'none' | 'O' | 'OO'
  warnings?: boolean
  macros?: string
}

/** Only controlled profiles and numeric limits enter a run snapshot. */
export function executionSnapshot(
  language: SourceLanguage,
  settings: Record<string, unknown> = {},
): { runtimeProfile: RuntimeProfile; executionConfig: ExecutionConfig } {
  const configured = settings.languages && typeof settings.languages === 'object'
  const selected = configured ? languageSettings(settings)[language] : settings
  const limits = {
    compileTimeMs: [1000, 20000],
    compileMemoryMb: [128, 1024],
    runTimeMs: [100, 10000],
    runMemoryMb: [16, 512],
    outputLimitKb: [16, 2048],
  } as const
  const executionConfig = {} as ExecutionConfig
  for (const name of Object.keys(limits) as (keyof typeof limits)[]) {
    const value = selected[name as keyof typeof selected]
    const [min, max] = limits[name]
    executionConfig[name] =
      typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
        ? value
        : executionDefaults[name]
  }
  if (configured) {
    if (language === 'cpp') {
      const cpp = languageSettings(settings).cpp
      executionConfig.optimization = ['O0', 'O1', 'O2', 'O3'].includes(cpp.optimization)
        ? cpp.optimization
        : 'O0'
      executionConfig.warnings = typeof cpp.warnings === 'boolean' ? cpp.warnings : true
      executionConfig.macros =
        typeof cpp.macros === 'string' &&
        /^(?:[A-Za-z_]\w*(?:=[A-Za-z0-9_.+-]+)?(?:\s+|$))*$/.test(cpp.macros) &&
        cpp.macros.length <= 1000
          ? cpp.macros
          : ''
    } else {
      const python = languageSettings(settings).python
      executionConfig.optimization = ['none', 'O', 'OO'].includes(python.optimization)
        ? python.optimization
        : 'none'
    }
  }
  return {
    runtimeProfile:
      language === 'python'
        ? defaultRuntimeProfiles.python
        : (configured
              ? languageSettings(settings).cpp.compilerProfile
              : settings.compilerProfile) === 'gcc13-cpp20'
          ? 'gcc13-cpp20'
          : 'gcc13-cpp17',
    executionConfig,
  }
}
