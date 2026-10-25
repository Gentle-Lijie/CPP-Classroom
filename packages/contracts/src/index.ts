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
