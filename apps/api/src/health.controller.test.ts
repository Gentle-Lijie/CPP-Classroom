import 'reflect-metadata'
import { afterEach, describe, expect, it } from 'vitest'
import { Test } from '@nestjs/testing'
import type { INestApplication } from '@nestjs/common'
import type { DependencyCheck } from '@classroom/contracts'
import request from 'supertest'
import { HealthController } from './health.controller.js'
import { DatabaseService } from './database.service.js'
import { RunnerService } from './runner.service.js'

let app: INestApplication | undefined
afterEach(async () => {
  await app?.close()
})

async function createApp(database: DependencyCheck, runner: DependencyCheck) {
  const module = await Test.createTestingModule({
    controllers: [HealthController],
    providers: [
      { provide: DatabaseService, useValue: { check: async () => database } },
      { provide: RunnerService, useValue: { check: async () => runner } },
    ],
  }).compile()
  app = module.createNestApplication()
  app.setGlobalPrefix('api')
  await app.init()
  return app.getHttpServer()
}

describe('health endpoints', () => {
  it('keeps classroom services ready while the runner is unconfigured', async () => {
    const server = await createApp(
      { status: 'healthy', message: 'ok' },
      { status: 'unconfigured', message: 'not set' },
    )
    const response = await request(server).get('/api/health/readiness').expect(200)
    expect(response.body.status).toBe('ready')
    expect(response.body.checks.runner.status).toBe('unconfigured')
  })
  it('reports database failure with 503 while liveness remains available', async () => {
    const server = await createApp(
      { status: 'unavailable', message: 'down' },
      { status: 'healthy', message: 'ok' },
    )
    const response = await request(server).get('/api/health/readiness').expect(503)
    expect(response.body.status).toBe('degraded')
    await request(server).get('/api/health').expect(200)
  })
})
