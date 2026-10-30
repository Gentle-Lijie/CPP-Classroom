import { Inject, Injectable } from '@nestjs/common'
import type { Environment } from '@classroom/config'
import type { DependencyCheck } from '@classroom/contracts'
import { ENVIRONMENT } from './environment.js'
import { DatabaseService } from './database.service.js'

@Injectable()
export class RunnerService {
  constructor(
    @Inject(ENVIRONMENT) private readonly environment: Environment,
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}

  async check(): Promise<DependencyCheck> {
    let nodes: { url: string; auth_token: string; enabled: boolean }[]
    try {
      nodes = (
        await this.database.database.pool.query('select url,auth_token,enabled from runner_nodes')
      ).rows
    } catch {
      return { status: 'unavailable', message: '无法读取执行节点配置' }
    }
    const enabled = nodes.length
      ? nodes.filter((node) => node.enabled)
      : this.environment.GO_JUDGE_URL
        ? [
            {
              url: this.environment.GO_JUDGE_URL,
              auth_token: this.environment.GO_JUDGE_AUTH_TOKEN,
              enabled: true,
            },
          ]
        : []
    if (!enabled.length) return { status: 'unconfigured', message: '没有启用的执行节点' }
    const start = performance.now()
    const results = await Promise.all(
      enabled.map(async (node) => {
        try {
          const response = await fetch(`${node.url.replace(/\/$/, '')}/version`, {
            headers: {
              Connection: 'close',
              ...(node.auth_token ? { Authorization: `Bearer ${node.auth_token}` } : {}),
            },
            signal: AbortSignal.timeout(this.environment.GO_JUDGE_TIMEOUT_MS),
          })
          await response.arrayBuffer()
          return response.ok
        } catch {
          return false
        }
      }),
    )
    const healthy = results.filter(Boolean).length
    return {
      status: healthy ? 'healthy' : 'unavailable',
      message: `${healthy}/${enabled.length} 个执行节点探活成功；探活不验证执行功能`,
      latencyMs: Math.round(performance.now() - start),
    }
  }
}
