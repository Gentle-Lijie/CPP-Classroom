import { Module } from '@nestjs/common'
import { loadEnvironment } from '@classroom/config'
import { ENVIRONMENT } from './environment.js'
import { DatabaseService } from './database.service.js'
import { RunnerService } from './runner.service.js'
import { HealthController } from './health.controller.js'

@Module({
  controllers: [HealthController],
  providers: [
    { provide: ENVIRONMENT, useFactory: loadEnvironment },
    DatabaseService,
    RunnerService,
  ],
})
export class AppModule {}
