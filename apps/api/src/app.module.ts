import { APP_GUARD } from '@nestjs/core'
import { AuthController, AuthGuard } from './modules/auth.js'
import { Module } from '@nestjs/common'
import { loadEnvironment } from '@classroom/config'
import { ENVIRONMENT } from './environment.js'
import { DatabaseService } from './database.service.js'
import { RunnerService } from './runner.service.js'
import { HealthController } from './health.controller.js'

@Module({
  controllers: [HealthController, AuthController],
  providers: [
    { provide: ENVIRONMENT, useFactory: loadEnvironment },
    DatabaseService,
    { provide: APP_GUARD, useClass: AuthGuard },
    RunnerService,
  ],
})
export class AppModule {}
