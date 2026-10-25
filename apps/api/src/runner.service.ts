import { Inject, Injectable } from '@nestjs/common'
import type { Environment } from '@classroom/config'
import type { DependencyCheck } from '@classroom/contracts'
import { ENVIRONMENT } from './environment.js'

@Injectable()
export class RunnerService {
  constructor(@Inject(ENVIRONMENT) private readonly environment: Environment) {}

  async check(): Promise<DependencyCheck> {
    if (!this.environment.GO_JUDGE_URL) {
      return { status: 'unconfigured', message: '尚未连接原生 Linux 执行节点' }
    }
    const start = performance.now()
    try {
      const headers: Record<string, string> = { Connection: 'close' }
      if (this.environment.GO_JUDGE_AUTH_TOKEN) {
        headers.Authorization = `Bearer ${this.environment.GO_JUDGE_AUTH_TOKEN}`
      }
      const response = await fetch(`${this.environment.GO_JUDGE_URL.replace(/\/$/, '')}/version`, {
        headers,
        signal: AbortSignal.timeout(this.environment.GO_JUDGE_TIMEOUT_MS),
      })
      await response.arrayBuffer()
      if (!response.ok) throw new Error('Unhealthy execution node')
      return {
        status: 'healthy',
        message: '已连接原生 Linux 评测节点（此接口仅探活）',
        latencyMs: Math.round(performance.now() - start),
      }
    } catch {
      return { status: 'unavailable', message: '执行节点连接失败或认证未通过' }
    }
  }
}
