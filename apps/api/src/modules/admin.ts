import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import {
  Body,
  Controller,
  Delete,
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
import { actor, parse, role, text, passwordInput, type AuthRequest } from './common.js'
import { ENVIRONMENT } from '../environment.js'
import type { Environment } from '@classroom/config'
import { executionDefaults, executionLimits, languageSettings } from '@classroom/contracts'
const executeFile = promisify(execFile)
const runnerUrl = z
  .url({ protocol: /^https?$/ })
  .max(500)
  .refine((value) => {
    const url = new URL(value)
    return !url.username && !url.password && !url.search && !url.hash
  }, '节点地址不能包含凭据、查询参数或片段')
const runnerNode = z.object({
  name: text(100),
  url: runnerUrl,
  token: z.string().max(4096).optional(),
  capacity: z.number().int().min(1).max(128),
  enabled: z.boolean(),
})
const settings = z.object({
  compilerProfile: z.enum(['gcc13-cpp17', 'gcc13-cpp20']),
  compileTimeMs: z.number().int().min(1000).max(20000),
  compileMemoryMb: z.number().int().min(128).max(1024),
  runTimeMs: z.number().int().min(100).max(10000),
  runMemoryMb: z.number().int().min(16).max(512),
  outputLimitKb: z.number().int().min(16).max(2048),
  executionConcurrency: z.number().int().min(1).max(executionLimits.maxConcurrentRuns),
  languages: z
    .object({
      cpp: z.object({
        compilerProfile: z.enum(['gcc13-cpp17', 'gcc13-cpp20']),
        compileTimeMs: z.number().int().min(1000).max(20000),
        compileMemoryMb: z.number().int().min(128).max(1024),
        runTimeMs: z.number().int().min(100).max(10000),
        runMemoryMb: z.number().int().min(16).max(512),
        outputLimitKb: z.number().int().min(16).max(2048),
        optimization: z.enum(['O0', 'O1', 'O2', 'O3']),
        warnings: z.boolean(),
        macros: z
          .string()
          .max(1000)
          .regex(/^(?:[A-Za-z_]\w*(?:=[A-Za-z0-9_.+-]+)?(?:\s+|$))*$/),
      }),
      python: z.object({
        runTimeMs: z.number().int().min(100).max(10000),
        runMemoryMb: z.number().int().min(16).max(512),
        outputLimitKb: z.number().int().min(16).max(2048),
        optimization: z.enum(['none', 'O', 'OO']),
      }),
    })
    .optional(),
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
        password: passwordInput,
      }),
      body,
    )
    const client = await this.service.pool.connect()
    try {
      await client.query('begin')
      const result = await client.query(
        'insert into users(username,name,number,role,password_hash,created_by) values($1,$2,$3,$4,$5,$6) returning id',
        [
          data.username,
          data.name,
          data.number,
          data.role,
          await passwordHash(data.password),
          user.id,
        ],
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
        name: text(50).optional(),
        number: z.string().max(50).optional(),
        username: text(80)
          .regex(/^[a-zA-Z0-9._@-]+$/)
          .optional(),
        role: z.enum(['teacher', 'student']).optional(),
        password: passwordInput.optional(),
      }),
      body,
    )
    if (id === user.id) throw new ConflictException('请使用个人密码接口修改自身账号')
    if (Object.keys(data).length === 0)
      throw new ConflictException('请选择需要更新的账号状态或密码')
    const client = await this.service.pool.connect()
    try {
      await client.query('begin')
      const target = (
        await client.query('select id,username,role from users where id=$1 for update', [id])
      ).rows[0]
      if (!target) throw new NotFoundException('账号不存在')
      if (data.role && target.role === 'admin') throw new ConflictException('不能更改管理员身份')
      if (data.role && data.role !== target.role) {
        const linked = await client.query(
          'select 1 from classrooms where owner_id=$1 union all select 1 from memberships where user_id=$1 limit 1',
          [id],
        )
        if (linked.rowCount) throw new ConflictException('账号已有课堂关联，不能更改身份')
      }
      await client.query(
        'update users set disabled=coalesce($2,disabled),password_hash=coalesce($3,password_hash),name=coalesce($4,name),number=coalesce($5,number),username=coalesce($6,username),role=coalesce($7,role) where id=$1',
        [
          id,
          data.disabled,
          data.password ? await passwordHash(data.password) : null,
          data.name,
          data.number,
          data.username,
          data.role,
        ],
      )
      if (data.password || data.disabled === true || data.username || data.role) {
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
          changedFields: Object.keys(data).filter((key) => key !== 'password'),
        }),
      ])
      await client.query('commit')
      return { ok: true }
    } catch (e) {
      await client.query('rollback')
      if ((e as { code?: string }).code === '23505') throw new ConflictException('账号已存在')
      throw e
    } finally {
      client.release()
    }
  }
  @Delete('users/:id') async deleteUser(@Req() req: AuthRequest, @Param('id') id: string) {
    const user = this.admin(req)
    parse(z.uuid(), id)
    if (id === user.id) throw new ConflictException('不能删除当前账号')
    const client = await this.service.pool.connect()
    try {
      await client.query('begin')
      const target = await client.query('select id,username from users where id=$1 for update', [
        id,
      ])
      if (!target.rows.length) throw new NotFoundException('账号不存在')
      await client.query('delete from sessions where user_id=$1', [id])
      await client.query('delete from users where id=$1', [id])
      await client.query('insert into audit_events(event,source,details) values($1,$2,$3)', [
        'user.deleted',
        user.id,
        JSON.stringify({ id, username: target.rows[0].username }),
      ])
      await client.query('commit')
      return { ok: true }
    } catch (e) {
      await client.query('rollback')
      if ((e as { code?: string }).code === '23503')
        throw new ConflictException('账号仍有关联的课堂、成员或作品等记录，不能删除；可先停用账号')
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
        'select r.id,r.status,r.exit,r.created_at,r.metrics,r.language,r.runtime_profile as "runtimeProfile",c.name as classroom ' +
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
      languages: languageSettings(saved),
      goJudgeUrl: this.environment.GO_JUDGE_URL,
      goJudgeTimeoutMs: this.environment.GO_JUDGE_TIMEOUT_MS,
    }
  }
  @Get('runners') async runners(@Req() req: AuthRequest) {
    this.admin(req)
    return (
      await this.service.pool.query(
        `select n.id,n.name,n.url,n.capacity,n.enabled,(n.auth_token <> '') as "hasToken",
         (select count(*)::int from runs r where r.runner_id=n.id and r.status in ('编译中','运行中／可输入')) as "activeCount"
         from runner_nodes n order by n.created_at,n.id`,
      )
    ).rows
  }
  @Get('runners/usage') async runnerUsage(@Req() req: AuthRequest) {
    this.admin(req)
    const result = await this.service.pool.query(`
      select n.id,n.name,n.capacity,n.enabled,
        (select count(*)::int from runs r where r.runner_id=n.id and r.status in ('编译中','运行中／可输入')) as "activeCount",
        coalesce(history.total,0)::int as "totalCalls",
        coalesce(history.points,'[]'::jsonb) as points
      from runner_nodes n
      cross join lateral (
        select sum(bucket.calls)::int as total,
          jsonb_agg(jsonb_build_object('at',bucket.hour,'calls',bucket.calls) order by bucket.hour) as points
        from (
          select hours.hour, count(r.id)::int as calls
          from generate_series(date_trunc('hour',now()) - interval '23 hours',date_trunc('hour',now()),interval '1 hour') as hours(hour)
          left join runs r on r.runner_id=n.id and r.created_at>=hours.hour and r.created_at<hours.hour+interval '1 hour'
          group by hours.hour
        ) bucket
      ) history
      order by n.created_at,n.id`)
    return result.rows
  }
  @Post('runners/test') async testRunner(@Req() req: AuthRequest, @Body() body: unknown) {
    this.admin(req)
    const data = parse(
      z.object({ url: runnerUrl, token: z.string().max(4096).optional(), id: z.uuid().optional() }),
      body,
    )
    const url = data.url.replace(/\/$/, '')
    let token = data.token ?? ''
    if (data.id && data.token === undefined) {
      const saved = (
        await this.service.pool.query('select url,auth_token from runner_nodes where id=$1', [
          data.id,
        ])
      ).rows[0]
      if (!saved) throw new NotFoundException('执行节点不存在')
      if (saved.url.replace(/\/$/, '') !== url)
        throw new ConflictException('节点地址已更改，请重新填写令牌后测试')
      token = saved.auth_token
    }
    const start = performance.now()
    try {
      const response = await fetch(`${url}/run`, {
        method: 'POST',
        redirect: 'error',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        signal: AbortSignal.timeout(Math.max(10000, this.environment.GO_JUDGE_TIMEOUT_MS || 2000)),
        body: JSON.stringify({
          cmd: [
            {
              args: ['/usr/bin/true'],
              env: ['PATH=/usr/bin:/bin'],
              files: [
                { content: '' },
                { name: 'stdout', max: 1024 },
                { name: 'stderr', max: 1024 },
              ],
              cpuLimit: 1e9,
              clockLimit: 3e9,
              memoryLimit: 64 * 1024 * 1024,
              procLimit: 4,
            },
          ],
        }),
      })
      if (!response.ok) return { ok: false, message: '节点请求失败，请检查地址和认证令牌。' }
      const results = (await response.json()) as { status?: string; exitStatus?: number }[]
      if (
        !Array.isArray(results) ||
        results[0]?.status !== 'Accepted' ||
        results[0]?.exitStatus !== 0
      )
        return { ok: false, message: '节点已连接，但沙箱测试未通过。' }
      return {
        ok: true,
        message: '连接和沙箱测试通过。',
        latencyMs: Math.round(performance.now() - start),
      }
    } catch {
      return { ok: false, message: '无法连接节点，请检查地址、网络和认证令牌。' }
    }
  }
  @Post('runners') async createRunner(@Req() req: AuthRequest, @Body() body: unknown) {
    const user = this.admin(req)
    const data = parse(runnerNode, body)
    const result = await this.service.pool.query(
      'insert into runner_nodes(name,url,auth_token,capacity,enabled) values($1,$2,$3,$4,$5) returning id',
      [data.name, data.url.replace(/\/$/, ''), data.token ?? '', data.capacity, data.enabled],
    )
    await this.service.audit(user, 'runner.created', { id: result.rows[0].id, name: data.name })
    return { id: result.rows[0].id }
  }
  @Patch('runners/:id') async updateRunner(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const user = this.admin(req)
    parse(z.uuid(), id)
    const data = parse(runnerNode, body)
    const result = await this.service.pool.query(
      'update runner_nodes set name=$2,url=$3,auth_token=coalesce($4,auth_token),capacity=$5,enabled=$6 where id=$1 returning id',
      [id, data.name, data.url.replace(/\/$/, ''), data.token ?? null, data.capacity, data.enabled],
    )
    if (!result.rows.length) throw new NotFoundException('执行节点不存在')
    await this.service.audit(user, 'runner.updated', { id, name: data.name, enabled: data.enabled })
    return { id }
  }
  @Delete('runners/:id') async deleteRunner(@Req() req: AuthRequest, @Param('id') id: string) {
    const user = this.admin(req)
    parse(z.uuid(), id)
    const client = await this.service.pool.connect()
    try {
      await client.query('begin')
      await client.query('select pg_advisory_xact_lock(782132)')
      const node = await client.query('select id,name from runner_nodes where id=$1 for update', [
        id,
      ])
      if (!node.rows.length) throw new NotFoundException('执行节点不存在')
      const active = await client.query(
        "select 1 from runs where runner_id=$1 and status in ('排队','编译中','运行中／可输入') limit 1",
        [id],
      )
      if (active.rowCount) throw new ConflictException('节点仍有执行中的任务，请等待任务结束')
      await client.query('update runs set runner_id=null where runner_id=$1', [id])
      await client.query('delete from runner_nodes where id=$1', [id])
      await client.query('insert into audit_events(event,source,details) values($1,$2,$3)', [
        'runner.deleted',
        user.id,
        JSON.stringify({ id, name: node.rows[0].name }),
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
