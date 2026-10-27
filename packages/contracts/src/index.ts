export type DependencyState = 'healthy' | 'unavailable' | 'unconfigured'

// Leave headroom below the API and reverse proxy's 512 KiB JSON body limit.
export const exerciseImportLimits = {
  files: 50,
  fileBytes: 1024 * 1024,
  bodyBytes: 500 * 1024,
} as const

export function validSourceFilename(filename: string): boolean {
  return (
    filename.length <= 80 &&
    /^[\p{L}\p{N}_][\p{L}\p{N}_.-]*\.(cpp|cc|cxx)$/iu.test(filename) &&
    !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])\./i.test(filename)
  )
}

/** A stable per-exercise filename for disk operations when the optional field is blank. */
export function exerciseSourceFilename(exercise: { id: string; filename: string }): string {
  return exercise.filename || `exercise-${exercise.id}.cpp`
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
