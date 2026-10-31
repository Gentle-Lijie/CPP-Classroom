import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  ConflictException,
} from '@nestjs/common'
import { z } from 'zod'
import { exerciseSourceFilename, executionSnapshot, sourceLanguages } from '@classroom/contracts'
import { ClassroomService } from './classroom.js'
import { actor, parse, type AuthRequest } from './common.js'
export const activeStatuses = ['排队', '编译中', '运行中／可输入']
export function runDto(r: Record<string, unknown>) {
  return {
    ...r,
    time: r.created_at,
    exerciseId: r.exercise_id,
    userId: r.user_id,
    classroomId: r.classroom_id,
    language: r.language ?? 'cpp',
    runtimeProfile: r.runtime_profile ?? r.compiler_profile ?? null,
    executionConfig: r.execution_config ?? null,
    compilerProfile: r.compiler_profile ?? null,
  }
}
@Controller('classes/:id')
export class RunsController {
  constructor(@Inject(ClassroomService) private readonly service: ClassroomService) {}
  private async access(req: AuthRequest, id: string, runId: string, own = false) {
    const user = actor(req)
    await this.service.access(user, id)
    const r = (
      await this.service.pool.query('select * from runs where classroom_id=$1 and id=$2', [
        id,
        parse(z.uuid(), runId),
      ])
    ).rows[0]
    if (!r) throw new NotFoundException('运行记录不存在')
    if (r.user_id !== user.id) {
      if (own) throw new ForbiddenException('仅可控制自己的运行')
      await this.service.access(user, id, true)
    }
    return r
  }
  @Post('runs') async create(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuthRequest,
  ) {
    const user = actor(req)
    const data = parse(
      z.object({
        exerciseId: z.uuid(),
        language: z.enum(sourceLanguages).optional(),
        revision: z.number().int().min(1),
        input: z.string().max(65536),
        interactive: z.boolean().default(false),
      }),
      body,
    )
    const { c, e } = await this.service.exercise(user, id, data.exerciseId, true)
    const language = data.language ?? e.language ?? 'cpp'
    if (!c.settings.allowRun) throw new ForbiddenException('教师已关闭运行')
    const client = await this.service.pool.connect()
    try {
      await client.query('begin')
      // Lock the same records changed by permission revocation before admission.
      // A revoker either precedes this check, or waits until the new run is visible
      // to its stop-request scan. Lock classrooms first, like classroom mutations.
      const classroom = (
        await client.query(
          'select status,settings,owner_id from classrooms where id=$1 for share',
          [id],
        )
      ).rows[0]
      const exercise = (
        await client.query(
          'select status,filename,language from exercises where classroom_id=$1 and id=$2 for share',
          [id, e.id],
        )
      ).rows[0]
      const membership = (
        await client.query(
          'select status,role from memberships where classroom_id=$1 and user_id=$2 for share',
          [id, user.id],
        )
      ).rows[0]
      const account = (
        await client.query('select disabled,role from users where id=$1 for update', [user.id])
      ).rows[0]
      if (
        !account ||
        account.disabled ||
        account.role !== user.role ||
        membership?.status !== 'active' ||
        !['student', 'teacher'].includes(membership.role)
      )
        throw new ForbiddenException('账号或课堂访问权限已变更，请刷新')
      if (
        classroom?.status !== '进行中' ||
        classroom.settings?.allowRun === false ||
        exercise?.status !== '已发布'
      )
        throw new ForbiddenException('课堂或练习已停止接受运行，请刷新')
      const existing = await client.query(
        'select id from runs where user_id=$1 and status=any($2)',
        [user.id, activeStatuses],
      )
      if (existing.rowCount) throw new ConflictException('已有运行任务，请先停止或等待完成')
      // Share the worker's transaction lock so count + admission is atomic globally.
      await client.query('select pg_advisory_xact_lock(782132)')
      const size = (
        await client.query('select count(*)::int as n from runs where status=any($1)', [
          activeStatuses,
        ])
      ).rows[0].n
      if (size >= 100) throw new ConflictException('队列已满，请稍后重试')
      const draft = (
        await client.query(
          'select code,revision from drafts where user_id=$1 and exercise_id=$2 and language=$3',
          [user.id, e.id, language],
        )
      ).rows[0]
      if (!draft || draft.revision !== data.revision)
        throw new ConflictException('草稿版本不一致，请先保存')
      const settings = (
        await client.query("select value from platform_settings where id='execution'")
      ).rows[0]?.value
      const snapshot = executionSnapshot(language, settings)
      const r = (
        await client.query(
          'insert into runs(classroom_id,exercise_id,user_id,code,filename,revision,input,interactive,language,runtime_profile,execution_config,compiler_profile) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning *',
          [
            id,
            e.id,
            user.id,
            draft.code,
            exerciseSourceFilename({ ...e, ...exercise }, language),
            draft.revision,
            data.input,
            data.interactive,
            language,
            snapshot.runtimeProfile,
            JSON.stringify(snapshot.executionConfig),
            language === 'cpp' ? snapshot.runtimeProfile : null,
          ],
        )
      ).rows[0]
      await client.query('commit')
      return runDto(r)
    } catch (e) {
      await client.query('rollback').catch(() => {})
      throw e
    } finally {
      client.release()
    }
  }
  @Get('runs') async list(
    @Param('id') id: string,
    @Query('student') student: string | undefined,
    @Query('exercise') exercise: string | undefined,
    @Query('page') page: string | undefined,
    @Query('pageSize') pageSize: string | undefined,
    @Query('active') active: string | undefined,
    @Query('status') status: string | undefined,
    @Query('scope') scope: string | undefined,
    @Query('language') language: string | undefined,
    @Req() req: AuthRequest,
  ) {
    const user = actor(req)
    await this.service.access(user, id)
    if (student && student !== user.id) await this.service.access(user, id, true)
    const paging = page !== undefined || pageSize !== undefined
    const currentPage = parse(z.coerce.number().int().min(1).max(100000).default(1), page)
    const size = parse(z.coerce.number().int().min(1).max(100).default(20), pageSize)
    const params = [
      id,
      student ? parse(z.uuid(), student) : user.id,
      exercise ? parse(z.uuid(), exercise) : null,
      active === 'true',
      status ? parse(z.string().max(40), status) : null,
      scope === 'all' && active === 'true' && (!student || student === user.id),
      language ? parse(z.enum(sourceLanguages), language) : null,
    ]
    const where =
      "($6::boolean or classroom_id=$1) and user_id=$2 and ($3::uuid is null or exercise_id=$3) and (not $4::boolean or status in ('排队','编译中','运行中／可输入')) and ($5::text is null or status=$5) and ($7::text is null or language=$7)"
    const result = await this.service.pool.query(
      `select * from runs where ${where} order by created_at desc,id desc limit $8 offset $9`,
      [...params, paging ? size : 100, paging ? (currentPage - 1) * size : 0],
    )
    if (!paging) return result.rows.map(runDto)
    const total = (
      await this.service.pool.query(`select count(*)::int as n from runs where ${where}`, params)
    ).rows[0].n
    return { items: result.rows.map(runDto), total, page: currentPage, pageSize: size }
  }
  @Get('runs/:runId') async get(
    @Param('id') id: string,
    @Param('runId') runId: string,
    @Req() req: AuthRequest,
  ) {
    return runDto(await this.access(req, id, runId))
  }
  @Post('runs/:runId/stop') async stop(
    @Param('id') id: string,
    @Param('runId') runId: string,
    @Req() req: AuthRequest,
  ) {
    await this.access(req, id, runId, true)
    await this.service.pool.query(
      "update runs set stop_requested=true,status=case when status='排队' then '已停止' else status end,updated_at=now() where id=$1 and status=any($2)",
      [runId, activeStatuses],
    )
    return { ok: true }
  }
  @Post('runs/:runId/input') async input(
    @Param('id') id: string,
    @Param('runId') runId: string,
    @Body() body: unknown,
    @Req() req: AuthRequest,
  ) {
    await this.access(req, id, runId, true)
    const data = parse(
      z.object({ text: z.string().max(4096).default(''), eof: z.boolean().default(false) }),
      body,
    )
    const client = await this.service.pool.connect()
    try {
      await client.query('begin')
      await this.service.access(actor(req), id, false, true, client)
      const r = (await client.query('select * from runs where id=$1 for update', [runId])).rows[0]
      if (r.status !== '运行中／可输入' || !r.interactive || r.eof)
        throw new ConflictException('当前无法输入或已发送 EOF')
      const length = (
        await client.query(
          'select coalesce(sum(octet_length(content)),0)::int as n from run_inputs where run_id=$1',
          [runId],
        )
      ).rows[0].n
      if (length + Buffer.byteLength(data.text) > 65536)
        throw new ConflictException('输入达到 64 KiB 上限')
      await client.query('insert into run_inputs(run_id,content,eof) values($1,$2,$3)', [
        runId,
        data.text,
        data.eof,
      ])
      if (data.eof) await client.query('update runs set eof=true where id=$1', [runId])
      await client.query('commit')
      return { ok: true }
    } catch (e) {
      await client.query('rollback').catch(() => {})
      throw e
    } finally {
      client.release()
    }
  }
}
