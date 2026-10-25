import type { DependencyCheck } from '@classroom/contracts'
export type ProbeState = 'idle' | 'checking' | 'healthy' | 'unavailable' | 'unconfigured'
export interface ProbeResult {
  status: ProbeState
  message: string
  latencyMs?: number
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}
function dependency(value: unknown): DependencyCheck | null {
  if (
    !isRecord(value) ||
    !['healthy', 'unavailable', 'unconfigured'].includes(String(value.status)) ||
    typeof value.message !== 'string'
  )
    return null
  return {
    status: value.status as DependencyCheck['status'],
    message: value.message.slice(0, 400),
    ...(typeof value.latencyMs === 'number' &&
    Number.isFinite(value.latencyMs) &&
    value.latencyMs >= 0
      ? { latencyMs: value.latencyMs }
      : {}),
  }
}
export function parseReadiness(
  value: unknown,
): { database: DependencyCheck; runner: DependencyCheck } | null {
  if (!isRecord(value) || value.service !== 'cpp-classroom-api' || !isRecord(value.checks))
    return null
  const database = dependency(value.checks.database)
  const runner = dependency(value.checks.runner)
  return database && runner ? { database, runner } : null
}
export function isLivePayload(value: unknown): boolean {
  return isRecord(value) && value.service === 'cpp-classroom-api' && value.status === 'ok'
}
export async function probePlatform(
  signal: AbortSignal,
): Promise<{ api: ProbeResult; database: ProbeResult; runner: ProbeResult }> {
  const failed: ProbeResult = {
    status: 'unavailable',
    message: '无法读取业务服务的健康结果，请检查 API 与反向代理。',
  }
  const started = performance.now()
  const [live, readiness] = await Promise.allSettled([
    fetch('/api/health', {
      signal,
      cache: 'no-store',
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    }).then(async (response) => ({
      ok: response.ok,
      body: await response.json(),
      latencyMs: Math.round(performance.now() - started),
    })),
    // A valid 503 body still carries useful dependency diagnostics.
    fetch('/api/health/readiness', {
      signal,
      cache: 'no-store',
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    }).then(async (response) => ({ status: response.status, body: await response.json() })),
  ])
  const api: ProbeResult =
    live.status === 'fulfilled' && live.value.ok && isLivePayload(live.value.body)
      ? { status: 'healthy', message: '业务 API 存活检查通过。', latencyMs: live.value.latencyMs }
      : failed
  const checks =
    readiness.status === 'fulfilled' && [200, 503].includes(readiness.value.status)
      ? parseReadiness(readiness.value.body)
      : null
  return { api, database: checks?.database ?? failed, runner: checks?.runner ?? failed }
}
