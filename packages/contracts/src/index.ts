export type DependencyState = 'healthy' | 'unavailable' | 'unconfigured'

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
