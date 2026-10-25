import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import {
  Body,
  Controller,
  Get,
  Query,
  NotFoundException,
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
import { executionDefaults, executionLimits } from '@classroom/contracts'
const executeFile = promisify(execFile)
const settings = z.object({
  compilerProfile: z.enum(['gcc13-cpp17', 'gcc13-cpp20']),
  compileTimeMs: z.number().int().min(1000).max(20000),
  compileMemoryMb: z.number().int().min(128).max(1024),
  runTimeMs: z.number().int().min(100).max(10000),
  runMemoryMb: z.number().int().min(16).max(512),
  outputLimitKb: z.number().int().min(16).max(2048),
  executionConcurrency: z.number().int().min(1).max(executionLimits.maxConcurrentRuns),
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
  private pagination(query: Record<string, string>) {
    return parse(
      z.object({
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(100).default(20),
        search: z.string().max(200).default(''),
        role: z.enum(['all', 'admin', 'teacher', 'student']).default('all'),
        status: z.enum(['all', 'active', 'disabled']).default('all'),
      }),
      query,
    )
  }
  @Get('users') async users(@Req() req: AuthRequest, @Query() query: Record<string, string>) {
    this.admin(req)
    if (!query.page && !query.pageSize)
      return (
        await this.service.pool.query(
          'select id,name,username,number,role,disabled from users order by created_at desc,id',
        )
      ).rows
    const q = this.pagination(query)
    const args = ['%' + q.search + '%', q.role, q.status]
    const where = `where (name ilike $1 or username ilike $1) and ($2='all' or role=$2) and ($3='all' or disabled=($3='disabled'))`
    const count = (
      await this.service.pool.query('select count(*)::int as total from users ' + where, args)
    ).rows[0].total
    const items = (
      await this.service.pool.query(
        'select id,name,username,number,role,disabled from users ' +
          where +
          ' order by created_at desc,id limit $4 offset $5',
        [...args, q.pageSize, (q.page - 1) * q.pageSize],
      )
    ).rows
    return { items, total: count, page: q.page, pageSize: q.pageSize }
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
    const client = await this.service.pool.connect()
    try {
      await client.query('begin')
      const result = await client.query(
        'insert into users(username,name,number,role,password_hash,created_by) values($1,$2,$3,$4,$5,$6) returning id',
        [data.username, data.name, data.number, data.role, passwordHash(data.password), user.id],
      )
      await client.query('insert into audit_events(event,source,details) values($1,$2,$3)', [
        'user.created',
        user.id,
        JSON.stringify({ id: result.rows[0].id, username: data.username, role: data.role }),
      ])
      await client.query('commit')
      return result.rows[0]
    } catch (e) {
      await client.query('rollback')
      if ((e as { code: string }).code === '23505') throw new ConflictException('账号已存在')
      throw e
    } finally {
      client.release()
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
    if (data.disabled === undefined && !data.password)
      throw new ConflictException('请选择需要更新的账号状态或密码')
    const client = await this.service.pool.connect()
    try {
      await client.query('begin')
      const target = (
        await client.query('select id,username from users where id=$1 for update', [id])
      ).rows[0]
      if (!target) throw new NotFoundException('账号不存在')
      await client.query(
        'update users set disabled=coalesce($2,disabled),password_hash=coalesce($3,password_hash) where id=$1',
        [id, data.disabled, data.password ? passwordHash(data.password) : null],
      )
      if (data.password || data.disabled === true) {
        await client.query('delete from sessions where user_id=$1', [id])
        await client.query(
          "update runs set stop_requested=true where user_id=$1 and status in ('排队','编译中','运行中／可输入')",
          [id],
        )
      }
      if (data.password)
        await client.query('update recovery_requests set resolved=true where username=$1', [
          target.username,
        ])
      await client.query('insert into audit_events(event,source,details) values($1,$2,$3)', [
        'user.updated',
        user.id,
        JSON.stringify({
          id,
          username: target.username,
          disabled: data.disabled,
          passwordReset: !!data.password,
        }),
      ])
      await client.query('commit')
      return { ok: true }
    } catch (e) {
      await client.query('rollback')
      throw e
    } finally {
      client.release()
    }
  }
  @Get('overview') async overview(@Req() req: AuthRequest) {
    this.admin(req)
    return (
      await this.service.pool.query(
        `select (select count(*)::int from classrooms where status='进行中') as classrooms,(select count(*)::int from memberships where status='active' and last_seen>now()-interval '15 seconds') as online,(select count(*)::int from runs where status='排队') as queued,(select count(*)::int from runs where status='平台执行失败') as failed`,
      )
    ).rows[0]
  }
  @Get('tasks') async tasks(@Req() req: AuthRequest, @Query() query: Record<string, string>) {
    this.admin(req)
    const q = this.pagination(query)
    if (!query.page && !query.pageSize) q.pageSize = 200
    const where = `from runs r join classrooms c on c.id=r.classroom_id where r.status='平台执行失败' and (c.name ilike $1 or r.exit ilike $1 or r.id::text ilike $1)`
    const args = ['%' + q.search + '%']
    const items = (
      await this.service.pool.query(
        'select r.id,r.status,r.exit,r.created_at,r.metrics,c.name as classroom ' +
          where +
          ' order by r.created_at desc,r.id limit $2 offset $3',
        [...args, q.pageSize, (q.page - 1) * q.pageSize],
      )
    ).rows
    if (!query.page && !query.pageSize) return items
    const total = (await this.service.pool.query('select count(*)::int as total ' + where, args))
      .rows[0].total
    return { items, total, page: q.page, pageSize: q.pageSize }
  }
  @Get('audit') async audit(@Req() req: AuthRequest, @Query() query: Record<string, string>) {
    this.admin(req)
    const q = this.pagination(query)
    if (!query.page && !query.pageSize) q.pageSize = 200
    const where = `from audit_events a left join users u on a.source=u.id::text where (a.event ilike $1 or a.details::text ilike $1 or coalesce(u.name,'') ilike $1)`
    const args = ['%' + q.search + '%']
    const items = (
      await this.service.pool.query(
        'select a.*,coalesce(u.name,a.source) as actor_name ' +
          where +
          ' order by a.created_at desc,a.id limit $2 offset $3',
        [...args, q.pageSize, (q.page - 1) * q.pageSize],
      )
    ).rows
    if (!query.page && !query.pageSize) return items
    const total = (await this.service.pool.query('select count(*)::int as total ' + where, args))
      .rows[0].total
    return { items, total, page: q.page, pageSize: q.pageSize }
  }
  @Get('recoveries') async recoveries(
    @Req() req: AuthRequest,
    @Query() query: Record<string, string>,
  ) {
    this.admin(req)
    const q = this.pagination(query)
    if (!query.page && !query.pageSize) q.pageSize = 100
    const where = `from recovery_requests r left join users u on u.username=r.username where not r.resolved and (r.username ilike $1 or coalesce(u.name,'') ilike $1)`
    const args = ['%' + q.search + '%']
    const items = (
      await this.service.pool.query(
        'select r.*,u.id as user_id,u.name,u.role ' +
          where +
          ' order by r.created_at desc,r.id limit $2 offset $3',
        [...args, q.pageSize, (q.page - 1) * q.pageSize],
      )
    ).rows
    if (!query.page && !query.pageSize) return items
    const total = (await this.service.pool.query('select count(*)::int as total ' + where, args))
      .rows[0].total
    return { items, total, page: q.page, pageSize: q.pageSize }
  }
  @Post('recoveries/:id/resolve') async resolveRecovery(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const admin = this.admin(req)
    parse(z.uuid(), id)
    const data = parse(z.object({ reason: text(500) }), body)
    const client = await this.service.pool.connect()
    try {
      await client.query('begin')
      const request = (
        await client.query(
          'update recovery_requests set resolved=true where id=$1 and not resolved returning username',
          [id],
        )
      ).rows[0]
      if (!request) throw new NotFoundException('申请已处理或不存在')
      await client.query('insert into audit_events(event,source,details) values($1,$2,$3)', [
        'recovery.closed',
        admin.id,
        JSON.stringify({ requestId: id, username: request.username, reason: data.reason }),
      ])
      await client.query('commit')
      return { ok: true }
    } catch (e) {
      await client.query('rollback')
      throw e
    } finally {
      client.release()
    }
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
