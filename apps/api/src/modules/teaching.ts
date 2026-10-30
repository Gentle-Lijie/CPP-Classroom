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
  BadRequestException,
} from '@nestjs/common'
import { z } from 'zod'
import { exerciseSourceFilename, exerciseStarterCode, sourceLanguages } from '@classroom/contracts'
import { ClassroomService } from './classroom.js'
import { actor, parse, role, text, type AuthRequest } from './common.js'

const selectionSchema = z.object({
  exercise: z.uuid().optional(),
  exerciseId: z.uuid().optional(),
  student: z.uuid().optional(),
  language: z.enum(sourceLanguages).optional(),
})

@Controller('classes/:id')
export class TeachingController {
  constructor(@Inject(ClassroomService) private readonly service: ClassroomService) {}

  @Get('overview') async overview(@Param('id') id: string, @Req() req: AuthRequest) {
    await this.service.access(actor(req), id, true)
    return (
      await this.service.pool.query(
        `select u.id,u.name,u.number,m.exercise_id as "exerciseId",m.language,
          coalesce(m.last_seen>now()-interval '15 seconds',false) as online,m.last_seen as activity,
          coalesce(r.status,'尚未运行') as status,coalesce(r.exit,'尚未运行') as summary,
          (h.id is not null) as help,h.id as "helpRequestId",h.message as "helpMessage",
          h.created_at as "helpCreatedAt",h.exercise_id as "helpExerciseId",h.language as "helpLanguage",
          exists(select 1 from submissions s where s.classroom_id=m.classroom_id and s.user_id=u.id and s.exercise_id=m.exercise_id and s.language=m.language) as submitted,
          exists(select 1 from submissions s where s.classroom_id=m.classroom_id and s.user_id=u.id and s.exercise_id=c.recommended) as "recommendedSubmitted"
        from memberships m join users u on u.id=m.user_id join classrooms c on c.id=m.classroom_id
        left join lateral(select status,exit from runs where classroom_id=m.classroom_id and user_id=u.id and exercise_id=m.exercise_id and language=m.language order by created_at desc,id desc limit 1) r on true
        left join lateral(select id,message,created_at,exercise_id,language from help_requests where classroom_id=m.classroom_id and user_id=u.id and not resolved order by created_at desc,id desc limit 1) h on true
        where m.classroom_id=$1 and m.status='active' order by u.number,u.name,u.id`,
        [id],
      )
    ).rows
  }

  @Post('help') async help(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuthRequest,
  ) {
    const user = actor(req)
    role(user, 'student')
    const data = parse(
      z.object({
        exerciseId: z.uuid(),
        message: text(1000),
        language: z.enum(sourceLanguages).optional(),
      }),
      body,
    )
    const { e } = await this.service.exercise(user, id, data.exerciseId, true)
    const language = data.language ?? e.language ?? 'cpp'
    const client = await this.service.pool.connect()
    try {
      await client.query('begin')
      await client.query('select pg_advisory_xact_lock(hashtextextended($1,0))', [
        `help:${id}:${user.id}:${data.exerciseId}:${language}`,
      ])
      await this.service.lockWritable(client, user, id, data.exerciseId)
      const existing = (
        await client.query(
          'select id from help_requests where classroom_id=$1 and user_id=$2 and exercise_id=$3 and language=$4 and not resolved order by created_at desc limit 1 for update',
          [id, user.id, data.exerciseId, language],
        )
      ).rows[0]
      const result = existing
        ? await client.query(
            'update help_requests set message=$2,created_at=now() where id=$1 returning *',
            [existing.id, data.message],
          )
        : await client.query(
            'insert into help_requests(classroom_id,exercise_id,user_id,message,language) values($1,$2,$3,$4,$5) returning *',
            [id, data.exerciseId, user.id, data.message, language],
          )
      await client.query('commit')
      return result.rows[0]
    } catch (e) {
      await client.query('rollback').catch(() => {})
      throw e
    } finally {
      client.release()
    }
  }

  @Get('help') async helps(
    @Param('id') id: string,
    @Query() query: unknown,
    @Req() req: AuthRequest,
  ) {
    const user = actor(req)
    await this.service.access(user, id)
    const data = parse(selectionSchema, query)
    const student = user.role === 'student' ? user.id : (data.student ?? null)
    return (
      await this.service.pool.query(
        "select h.*,e.content->>'title' as title from help_requests h join exercises e on e.id=h.exercise_id where h.classroom_id=$1 and ($2::uuid is null or h.user_id=$2) and ($3::uuid is null or h.exercise_id=$3) and ($4::text is null or h.language=$4) order by h.created_at desc,h.id desc limit 200",
        [id, student, data.exerciseId ?? data.exercise ?? null, data.language ?? null],
      )
    ).rows
  }

  @Post('help/:student/resolve') async resolve(
    @Param('id') id: string,
    @Param('student') student: string,
    @Body() body: unknown,
    @Req() req: AuthRequest,
  ) {
    await this.service.access(actor(req), id, true)
    const data = parse(
      z
        .object({ requestId: z.uuid().optional(), exerciseId: z.uuid().optional() })
        .refine((value) => !!value.requestId || !!value.exerciseId, '请指定要处理的求助或练习'),
      body,
    )
    const result = await this.service.pool.query(
      'update help_requests set resolved=true where classroom_id=$1 and user_id=$2 and ($3::uuid is null or id=$3) and ($4::uuid is null or exercise_id=$4) and not resolved returning id',
      [id, parse(z.uuid(), student), data.requestId ?? null, data.exerciseId ?? null],
    )
    return { ok: true, resolved: result.rowCount }
  }

  @Post('submissions') async submit(
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
        language: z.enum(sourceLanguages).optional(),
      }),
      body,
    )
    const { e } = await this.service.exercise(user, id, data.exerciseId, true)
    const language = data.language ?? e.language ?? 'cpp'
    const client = await this.service.pool.connect()
    try {
      await client.query('begin')
      await client.query('select pg_advisory_xact_lock(hashtextextended($1,0))', [
        `submit:${id}:${user.id}:${data.exerciseId}:${language}`,
      ])
      const classroom = await this.service.lockWritable(client, user, id, data.exerciseId)
      const exercise = (
        await client.query(
          'select id,status,filename,language from exercises where classroom_id=$1 and id=$2 for share',
          [id, data.exerciseId],
        )
      ).rows[0]
      if (classroom?.status !== '进行中' || exercise?.status !== '已发布')
        throw new ForbiddenException('课堂或练习当前只读')
      const previous = (
        await client.query(
          'select * from submissions where classroom_id=$1 and user_id=$2 and exercise_id=$3 and language=$4 order by created_at desc,id desc limit 1',
          [id, user.id, data.exerciseId, language],
        )
      ).rows[0]
      // Repeated clicks on the same saved revision are idempotent, even with resubmission disabled.
      if (previous?.revision === data.revision) {
        await client.query('commit')
        return previous
      }
      if (classroom.settings.allowResubmit === false && previous)
        throw new ForbiddenException('教师已关闭重复提交')
      const result = await client.query(
        'insert into submissions(classroom_id,exercise_id,user_id,code,filename,revision,language) select classroom_id,exercise_id,user_id,code,$4,revision,language from drafts where classroom_id=$1 and exercise_id=$2 and user_id=$3 and revision=$5 and language=$6 returning *',
        [
          id,
          data.exerciseId,
          user.id,
          exerciseSourceFilename(exercise, language),
          data.revision,
          language,
        ],
      )
      if (!result.rowCount) throw new ConflictException('请先同步最新草稿版本')
      await client.query('commit')
      return result.rows[0]
    } catch (e) {
      await client.query('rollback').catch(() => {})
      throw e
    } finally {
      client.release()
    }
  }

  @Get('submissions') async submissions(
    @Param('id') id: string,
    @Query() query: unknown,
    @Req() req: AuthRequest,
  ) {
    const user = actor(req)
    await this.service.access(user, id)
    const data = parse(
      selectionSchema.extend({
        page: z.coerce.number().int().min(1).optional(),
        pageSize: z.coerce.number().int().min(1).max(100).optional(),
        latest: z.enum(['true', 'false']).optional(),
        search: z.string().max(200).optional(),
        submissionId: z.uuid().optional(),
      }),
      query,
    )
    const values = [
      id,
      user.role === 'student' ? user.id : (data.student ?? null),
      data.exerciseId ?? data.exercise ?? null,
      data.search?.trim() ?? '',
      data.submissionId ?? null,
      data.language ?? null,
    ]
    const base = `select s.*,u.name,u.number,e.content->>'title' as title,
      row_number() over(partition by s.user_id,s.exercise_id,s.language order by s.created_at desc,s.id desc) as row_number
      from submissions s join users u on u.id=s.user_id join exercises e on e.id=s.exercise_id
      where s.classroom_id=$1 and ($2::uuid is null or s.user_id=$2) and ($3::uuid is null or s.exercise_id=$3)
      and ($4='' or position(lower($4) in lower(u.name||' '||u.number||' '||(e.content->>'title')))>0)
      and ($5::uuid is null or s.id=$5) and ($6::text is null or s.language=$6)`
    const filtered = `select * from (${base}) versions ${data.latest === 'true' ? 'where row_number=1' : ''}`
    if (data.page === undefined && data.pageSize === undefined)
      return (await this.service.pool.query(`${filtered} order by created_at desc,id desc`, values))
        .rows
    const page = data.page ?? 1,
      pageSize = data.pageSize ?? 20
    const result = await this.service.pool.query(
      `select *,count(*) over()::int as total_count from (${filtered}) filtered order by created_at desc,id desc limit $7 offset $8`,
      [...values, pageSize, (page - 1) * pageSize],
    )
    const total =
      result.rows[0]?.total_count ??
      Number(
        (
          await this.service.pool.query(
            `select count(*)::int as count from (${filtered}) filtered`,
            values,
          )
        ).rows[0].count,
      )
    return {
      items: result.rows.map(({ total_count: _total, row_number: _row, ...item }) => item),
      total,
      page,
      pageSize,
    }
  }

  @Get('export') async export(
    @Param('id') id: string,
    @Query() query: unknown,
    @Req() req: AuthRequest,
  ) {
    const user = actor(req)
    await this.service.access(user, id, true)
    const data = parse(
      selectionSchema.extend({
        includeRuns: z.enum(['true', 'false']).optional(),
        kind: z.enum(['all', 'drafts', 'submissions']).optional(),
      }),
      query,
    )
    const client = await this.service.pool.connect()
    try {
      await client.query('begin isolation level repeatable read read only')
      const values = [
        id,
        data.student ?? null,
        data.exerciseId ?? data.exercise ?? null,
        data.language ?? null,
      ]
      const result: Record<string, unknown> = {
        classroomId: id,
        exportedAt: new Date().toISOString(),
        filters: data,
      }
      let bytes = 0,
        count = 0
      for (const table of ['drafts', 'runs', 'submissions', 'exercises'] as const) {
        if (
          (table === 'runs' && data.includeRuns === 'false') ||
          (table === 'drafts' && data.kind === 'submissions') ||
          (table === 'submissions' && data.kind === 'drafts')
        ) {
          result[table] = []
          continue
        }
        const condition =
          table === 'exercises'
            ? 'classroom_id=$1 and ($2::uuid is null or id=$2)'
            : 'classroom_id=$1 and ($2::uuid is null or user_id=$2) and ($3::uuid is null or exercise_id=$3) and ($4::text is null or language=$4)'
        const parameters = table === 'exercises' ? [id, values[2]] : values
        // Check size in PostgreSQL before transferring source/log bodies to API memory.
        const stats = (
          await client.query(
            `select count(*)::int as count,coalesce(sum(octet_length(row_to_json(t)::text)),0)::bigint as bytes from ${table} t where ${condition}`,
            parameters,
          )
        ).rows[0]
        count += stats.count
        bytes += Number(stats.bytes)
        if (count > 10000)
          throw new BadRequestException('导出记录超过一万条，请按练习或学生分批导出')
        if (bytes > 64 * 1024 * 1024)
          throw new BadRequestException('导出内容超过 64 MiB，请按练习或学生分批导出')
        const rows = (
          await client.query(
            `select * from ${table} where ${condition} order by ${table === 'exercises' ? 'position,id' : 'id'}`,
            parameters,
          )
        ).rows
        result[table] = rows
      }
      result.roster = (
        await client.query(
          'select u.id,u.name,u.number,m.status from memberships m join users u on u.id=m.user_id where m.classroom_id=$1 and ($2::uuid is null or u.id=$2) order by u.number,u.id',
          [id, data.student ?? null],
        )
      ).rows
      await client.query('commit')
      await this.service.audit(user, 'classroom.exported', { classroomId: id, filters: data })
      return result
    } catch (e) {
      await client.query('rollback').catch(() => {})
      throw e
    } finally {
      client.release()
    }
  }

  @Post('projections') async project(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuthRequest,
  ) {
    await this.service.access(actor(req), id, true)
    const data = parse(
      z
        .object({
          student: z.uuid(),
          exerciseId: z.uuid(),
          runId: z.uuid().optional(),
          submissionId: z.uuid().optional(),
          language: z.enum(sourceLanguages).optional(),
        })
        .refine((value) => !(value.runId && value.submissionId), '运行记录和提交快照只能选择一种'),
      body,
    )
    const { e } = await this.service.exercise(actor(req), id, data.exerciseId)
    const language = data.language ?? e.language ?? 'cpp'
    const member = (
      await this.service.pool.query(
        'select 1 from memberships where classroom_id=$1 and user_id=$2',
        [id, data.student],
      )
    ).rowCount
    if (!member) throw new NotFoundException('学生不属于课堂')
    let snapshot: Record<string, unknown>
    if (data.runId || data.submissionId) {
      const table = data.runId ? 'runs' : 'submissions'
      const record = (
        await this.service.pool.query(
          `select * from ${table} where id=$1 and classroom_id=$2 and user_id=$3 and exercise_id=$4`,
          [data.runId ?? data.submissionId, id, data.student, data.exerciseId],
        )
      ).rows[0]
      if (!record) throw new NotFoundException(data.runId ? '运行记录不存在' : '提交记录不存在')
      const content = { ...record }
      delete content.user_id
      delete content.classroom_id
      snapshot = {
        ...content,
        language: record.language ?? 'cpp',
        runtimeProfile: record.runtime_profile ?? record.compiler_profile ?? null,
        kind: data.runId ? 'run' : 'submission',
        snapshotId: record.id,
        createdAt: record.created_at,
        title: e.content.title,
      }
    } else {
      const draft = (
        await this.service.pool.query(
          'select id,code,revision,updated_at from drafts where classroom_id=$1 and user_id=$2 and exercise_id=$3 and language=$4',
          [id, data.student, data.exerciseId, language],
        )
      ).rows[0]
      snapshot = {
        kind: 'draft',
        id: draft?.id ?? null,
        snapshotId: draft?.id ?? null,
        createdAt: draft?.updated_at ?? new Date().toISOString(),
        revision: draft?.revision ?? 0,
        code: draft?.code ?? exerciseStarterCode(e, language),
        language,
        filename: exerciseSourceFilename(e, language),
        title: e.content.title,
      }
    }
    return (
      await this.service.pool.query(
        `insert into projections(classroom_id,user_id,snapshot,expires_at) values($1,$2,$3,now()+interval '2 hours') returning id`,
        [id, data.student, JSON.stringify(snapshot)],
      )
    ).rows[0]
  }

  @Get('projections/:projection') async projection(
    @Param('id') id: string,
    @Param('projection') projection: string,
    @Req() req: AuthRequest,
  ) {
    await this.service.access(actor(req), id, true)
    const p = (
      await this.service.pool.query(
        'select snapshot,expires_at from projections where id=$1 and classroom_id=$2 and not revoked and expires_at>now()',
        [parse(z.uuid(), projection), id],
      )
    ).rows[0]
    if (!p) throw new NotFoundException('展示已过期或撤销')
    return { ...p.snapshot, expiresAt: p.expires_at }
  }

  @Post('projections/:projection/revoke') async revoke(
    @Param('id') id: string,
    @Param('projection') projection: string,
    @Req() req: AuthRequest,
  ) {
    await this.service.access(actor(req), id, true)
    await this.service.pool.query(
      'update projections set revoked=true where id=$1 and classroom_id=$2',
      [parse(z.uuid(), projection), id],
    )
    return { ok: true }
  }
}
