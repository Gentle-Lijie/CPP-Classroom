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
import { ClassroomService } from './classroom.js'
import { actor, parse, role, type AuthRequest } from './common.js'
export const activeStatuses = ['排队', '编译中', '运行中／可输入']
export function runDto(r: Record<string, unknown>) {
  return { ...r, time: r.created_at, exerciseId: r.exercise_id, userId: r.user_id }
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
    role(user, 'student')
    const data = parse(
      z.object({
        exerciseId: z.uuid(),
        revision: z.number().int().min(1),
        input: z.string().max(65536),
        interactive: z.boolean().default(false),
      }),
      body,
    )
    const { c, e } = await this.service.exercise(user, id, data.exerciseId, true)
    if (!c.settings.allowRun) throw new ForbiddenException('教师已关闭运行')
    const client = await this.service.pool.connect()
    try {
      await client.query('begin')
      await client.query('select id from users where id=$1 for update', [user.id])
      const existing = await client.query(
        'select id from runs where user_id=$1 and status=any($2)',
        [user.id, activeStatuses],
      )
      if (existing.rowCount) throw new ConflictException('已有运行任务，请先停止或等待完成')
      const size = (
        await client.query('select count(*)::int as n from runs where status=any($1)', [
          activeStatuses,
        ])
      ).rows[0].n
      if (size >= 100) throw new ConflictException('队列已满，请稍后重试')
      const draft = (
        await client.query('select code,revision from drafts where user_id=$1 and exercise_id=$2', [
          user.id,
          e.id,
        ])
      ).rows[0]
      if (!draft || draft.revision !== data.revision)
        throw new ConflictException('草稿版本不一致，请先保存')
      const r = (
        await client.query(
          'insert into runs(classroom_id,exercise_id,user_id,code,filename,revision,input,interactive) values($1,$2,$3,$4,$5,$6,$7,$8) returning *',
          [id, e.id, user.id, draft.code, e.filename, draft.revision, data.input, data.interactive],
        )
      ).rows[0]
      await client.query('commit')
      return runDto(r)
    } catch (e) {
      await client.query('rollback')
      throw e
    } finally {
      client.release()
    }
  }
  @Get('runs') async list(
    @Param('id') id: string,
    @Query('student') student: string | undefined,
    @Query('exercise') exercise: string | undefined,
    @Req() req: AuthRequest,
  ) {
    const user = actor(req)
    await this.service.access(user, id)
    if (student && student !== user.id) await this.service.access(user, id, true)
    return (
      await this.service.pool.query(
        'select * from runs where classroom_id=$1 and user_id=$2 and ($3::uuid is null or exercise_id=$3) order by created_at desc limit 100',
        [
          id,
          student ? parse(z.uuid(), student) : user.id,
          exercise ? parse(z.uuid(), exercise) : null,
        ],
      )
    ).rows.map(runDto)
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
      await client.query('rollback')
      throw e
    } finally {
      client.release()
    }
  }
}
