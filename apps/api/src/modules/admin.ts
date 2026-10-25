import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Req,
  ConflictException,
} from '@nestjs/common'
import { z } from 'zod'
import { ClassroomService } from './classroom.js'
import { passwordHash } from './auth.js'
import { actor, parse, role, text, type AuthRequest } from './common.js'
import { ENVIRONMENT } from '../environment.js'
import type { Environment } from '@classroom/config'
import { executionDefaults } from '@classroom/contracts'
const executeFile = promisify(execFile)
const settings = z.object({
  compilerProfile: z.enum(['gcc13-cpp17', 'gcc13-cpp20']),
  compileTimeMs: z.number().int().min(1000).max(20000),
  compileMemoryMb: z.number().int().min(128).max(1024),
  runTimeMs: z.number().int().min(100).max(10000),
  runMemoryMb: z.number().int().min(16).max(512),
  outputLimitKb: z.number().int().min(16).max(2048),
  executionConcurrency: z.number().int().min(1).max(4),
})
@Controller('admin')
export class AdminController {
  constructor(
    @Inject(ClassroomService) private readonly service: ClassroomService,
    @Inject(ENVIRONMENT) private readonly environment: Environment,
  ) {}
  private admin(req: AuthRequest) {
    const u = actor(req)
    role(u, 'admin')
    return u
  }
  @Get('users') async users(@Req() req: AuthRequest) {
    this.admin(req)
    return (
      await this.service.pool.query(
        'select id,name,username,number,role,disabled from users order by created_at desc',
      )
    ).rows
  }
  @Post('users') async create(@Req() req: AuthRequest, @Body() body: unknown) {
    const user = this.admin(req)
    const data = parse(
      z.object({
        username: text(80).regex(/^[a-zA-Z0-9._@-]+$/),
        name: text(50),
        number: z.string().max(50).default(''),
        role: z.enum(['teacher', 'student']),
        password: z.string().min(12).max(200),
      }),
      body,
    )
    try {
      const result = await this.service.pool.query(
        'insert into users(username,name,number,role,password_hash) values($1,$2,$3,$4,$5) returning id',
        [data.username, data.name, data.number, data.role, passwordHash(data.password)],
      )
      await this.service.audit(user, 'user.created', { id: result.rows[0].id, role: data.role })
      return result.rows[0]
    } catch (e) {
      if ((e as { code: string }).code === '23505') throw new ConflictException('账号已存在')
      throw e
    }
  }
  @Patch('users/:id') async update(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const user = this.admin(req)
    parse(z.uuid(), id)
    const data = parse(
      z.object({
        disabled: z.boolean().optional(),
        password: z.string().min(12).max(200).optional(),
      }),
      body,
    )
    if (id === user.id) throw new ConflictException('请使用个人密码接口修改自身账号')
    await this.service.pool.query(
      'update users set disabled=coalesce($2,disabled),password_hash=coalesce($3,password_hash) where id=$1',
      [id, data.disabled, data.password ? passwordHash(data.password) : null],
    )
    await this.service.pool.query('delete from sessions where user_id=$1', [id])
    await this.service.pool.query('update runs set stop_requested=true where user_id=$1', [id])
    await this.service.pool.query(
      'update recovery_requests set resolved=true where username=(select username from users where id=$1)',
      [id],
    )
    await this.service.audit(user, 'user.updated', {
      id,
      disabled: data.disabled,
      passwordReset: !!data.password,
    })
    return { ok: true }
  }
  @Get('overview') async overview(@Req() req: AuthRequest) {
    this.admin(req)
    return (
      await this.service.pool.query(
        `select (select count(*)::int from classrooms where status='进行中') as classrooms,(select count(*)::int from memberships where status='active' and last_seen>now()-interval '15 seconds') as online,(select count(*)::int from runs where status='排队') as queued,(select count(*)::int from runs where status='平台执行失败') as failed`,
      )
    ).rows[0]
  }
  @Get('tasks') async tasks(@Req() req: AuthRequest) {
    this.admin(req)
    return (
      await this.service.pool.query(
        "select r.id,r.status,r.exit,r.created_at,c.name as classroom from runs r join classrooms c on c.id=r.classroom_id where r.status='平台执行失败' order by r.created_at desc limit 200",
      )
    ).rows
  }
  @Get('audit') async audit(@Req() req: AuthRequest) {
    this.admin(req)
    return (
      await this.service.pool.query('select * from audit_events order by created_at desc limit 200')
    ).rows
  }
  @Get('recoveries') async recoveries(@Req() req: AuthRequest) {
    this.admin(req)
    return (
      await this.service.pool.query(
        'select * from recovery_requests where not resolved order by created_at desc limit 100',
      )
    ).rows
  }
  @Get('settings') async getSettings(@Req() req: AuthRequest) {
    this.admin(req)
    const saved = (
      await this.service.pool.query("select value from platform_settings where id='execution'")
    ).rows[0]?.value
    return {
      ...executionDefaults,
      ...saved,
      goJudgeUrl: this.environment.GO_JUDGE_URL,
      goJudgeTimeoutMs: this.environment.GO_JUDGE_TIMEOUT_MS,
    }
  }
  @Post('settings') async saveSettings(@Req() req: AuthRequest, @Body() body: unknown) {
    const user = this.admin(req)
    const data = parse(settings, body)
    await this.service.pool.query(
      "insert into platform_settings(id,value) values('execution',$1) on conflict(id) do update set value=excluded.value",
      [JSON.stringify(data)],
    )
    await this.service.audit(user, 'settings.updated', data)
    return data
  }
  @Post('backup') async backup(@Req() req: AuthRequest) {
    const user = this.admin(req)
    const { stdout } = await executeFile(
      process.execPath,
      [fileURLToPath(new URL('../../../../scripts/backup.mjs', import.meta.url))],
      { timeout: 120000, maxBuffer: 1024 * 1024 },
    )
    const result = JSON.parse(stdout.trim()) as Record<string, unknown>
    await this.service.audit(user, 'backup.verified', result)
    return result
  }
}
