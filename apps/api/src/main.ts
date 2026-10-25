import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { loadEnvironment } from '@classroom/config'
import { AppModule } from './app.module.js'

const environment = loadEnvironment()
const app = await NestFactory.create(AppModule)
app.setGlobalPrefix('api')
app.enableShutdownHooks()
await app.listen(environment.API_PORT, environment.API_HOST)
