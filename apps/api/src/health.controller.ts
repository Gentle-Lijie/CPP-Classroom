import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common'
import { executionDefaults } from '@classroom/contracts'
import type { ReadinessResponse } from '@classroom/contracts'
import { DatabaseService } from './database.service.js'
import { RunnerService } from './runner.service.js'

@Controller('health')
export class HealthController {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(RunnerService) private readonly runner: RunnerService,
  ) {}

  @Get('environment')
  async environment() {
    const saved = (
      await this.database.database.pool.query(
        "select value from platform_settings where id='execution'",
      )
    ).rows[0]?.value
    return {
      ...executionDefaults,
      ...saved,
      compiler: 'GCC 13.3.0',
      engine: 'go-judge v1.13.3-classroom-eof.1',
    }
  }

  @Get()
  live() {
    return { service: 'cpp-classroom-api', status: 'ok', timestamp: new Date().toISOString() }
  }

  @Get('readiness')
  async readiness(): Promise<ReadinessResponse> {
    const [database, runner] = await Promise.all([this.database.check(), this.runner.check()])
    const result: ReadinessResponse = {
      service: 'cpp-classroom-api',
      status: database.status === 'healthy' ? 'ready' : 'degraded',
      timestamp: new Date().toISOString(),
      checks: { database, runner },
    }
    // An unavailable execution node must not prevent editing or reading classroom data.
    if (result.status === 'degraded') throw new ServiceUnavailableException(result)
    return result
  }
}
