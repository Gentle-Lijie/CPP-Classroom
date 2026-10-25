import { Inject, Injectable, Logger } from '@nestjs/common'
import type { OnModuleDestroy } from '@nestjs/common'
import type { Environment } from '@classroom/config'
import type { DependencyCheck } from '@classroom/contracts'
import { createDatabase } from '@classroom/database'
import { ENVIRONMENT } from './environment.js'

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name)
  private readonly database

  constructor(@Inject(ENVIRONMENT) environment: Environment) {
    this.database = createDatabase(environment.DATABASE_URL)
    this.database.pool.on('error', () => this.logger.error('PostgreSQL 空闲连接异常'))
  }

  async check(): Promise<DependencyCheck> {
    const start = performance.now()
    try {
      await this.database.pool.query('select 1')
      return {
        status: 'healthy',
        message: 'PostgreSQL 连接正常',
        latencyMs: Math.round(performance.now() - start),
      }
    } catch {
      return { status: 'unavailable', message: '数据库不可用，请检查本地服务和迁移配置' }
    }
  }

  async onModuleDestroy() {
    await this.database.pool.end()
  }
}
