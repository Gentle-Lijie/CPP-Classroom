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
      const headers: Record<string, string> = {}
      if (this.environment.GO_JUDGE_AUTH_TOKEN) {
        headers.Authorization = `Bearer ${this.environment.GO_JUDGE_AUTH_TOKEN}`
      }
      const response = await fetch(`${this.environment.GO_JUDGE_URL.replace(/\/$/, '')}/version`, {
        headers,
        signal: AbortSignal.timeout(this.environment.GO_JUDGE_TIMEOUT_MS),
      })
      if (!response.ok) throw new Error('Unhealthy execution node')
      return {
        status: 'healthy',
        message: 'go-judge 可连接；尚未验证编译与隔离能力',
        latencyMs: Math.round(performance.now() - start),
      }
    } catch {
      return { status: 'unavailable', message: '执行节点连接失败或认证未通过' }
    }
  }
}
