import { AdminController } from './modules/admin.js'
import { TeachingController } from './modules/teaching.js'
import { RunsController } from './modules/runs.js'
import { WorkspaceController } from './modules/workspace.js'
import { ClassroomController, ClassroomService } from './modules/classroom.js'
import { APP_GUARD } from '@nestjs/core'
import { AuthController, AuthGuard } from './modules/auth.js'
import { Module } from '@nestjs/common'
import { loadEnvironment } from '@classroom/config'
import { ENVIRONMENT } from './environment.js'
import { DatabaseService } from './database.service.js'
import { RunnerService } from './runner.service.js'
import { HealthController } from './health.controller.js'

@Module({
  controllers: [
    HealthController,
    AuthController,
    ClassroomController,
    WorkspaceController,
    RunsController,
    TeachingController,
    AdminController,
  ],
  providers: [
    { provide: ENVIRONMENT, useFactory: loadEnvironment },
    DatabaseService,
    ClassroomService,
    { provide: APP_GUARD, useClass: AuthGuard },
    RunnerService,
  ],
})
export class AppModule {}
