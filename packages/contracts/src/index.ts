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

export interface ExecutionConfig {
  compileTimeMs: number
  compileMemoryMb: number
  runTimeMs: number
  runMemoryMb: number
  outputLimitKb: number
}

/** Only controlled profiles and numeric limits enter a run snapshot. */
export function executionSnapshot(
  language: SourceLanguage,
  settings: Record<string, unknown> = {},
): { runtimeProfile: RuntimeProfile; executionConfig: ExecutionConfig } {
  const limits = {
    compileTimeMs: [1000, 20000],
    compileMemoryMb: [128, 1024],
    runTimeMs: [100, 10000],
    runMemoryMb: [16, 512],
    outputLimitKb: [16, 2048],
  } as const
  const executionConfig = {} as ExecutionConfig
  for (const name of Object.keys(limits) as (keyof ExecutionConfig)[]) {
    const value = settings[name]
    const [min, max] = limits[name]
    executionConfig[name] =
      typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
        ? value
        : executionDefaults[name]
  }
  return {
    runtimeProfile:
      language === 'python'
        ? defaultRuntimeProfiles.python
        : settings.compilerProfile === 'gcc13-cpp20'
          ? 'gcc13-cpp20'
          : 'gcc13-cpp17',
    executionConfig,
  }
}
