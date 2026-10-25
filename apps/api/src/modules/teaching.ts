import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  Req,
  ConflictException,
} from '@nestjs/common'
import { z } from 'zod'
import { ClassroomService } from './classroom.js'
import { actor, parse, role, text, type AuthRequest } from './common.js'
@Controller('classes/:id')
export class TeachingController {
  constructor(@Inject(ClassroomService) private readonly service: ClassroomService) {}
  @Get('overview') async overview(@Param('id') id: string, @Req() req: AuthRequest) {
    await this.service.access(actor(req), id, true)
    return (
      await this.service.pool.query(
        `select u.id,u.name,u.number,m.exercise_id as "exerciseId",coalesce(m.last_seen>now()-interval '15 seconds',false) as online,m.last_seen as activity,
    coalesce(r.status,'编写中') as status,coalesce(r.exit,'尚未运行') as summary,
    exists(select 1 from help_requests h where h.classroom_id=m.classroom_id and h.user_id=u.id and not h.resolved) as help,
    exists(select 1 from submissions s where s.classroom_id=m.classroom_id and s.user_id=u.id) as submitted
    from memberships m join users u on u.id=m.user_id left join lateral(select status,exit from runs where classroom_id=m.classroom_id and user_id=u.id order by created_at desc limit 1) r on true
    where m.classroom_id=$1 and m.status='active' order by u.number,u.name`,
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
    const data = parse(z.object({ exerciseId: z.uuid(), message: text(1000) }), body)
    await this.service.exercise(user, id, data.exerciseId, true)
    await this.service.pool.query(
      'insert into help_requests(classroom_id,exercise_id,user_id,message) values($1,$2,$3,$4)',
      [id, data.exerciseId, user.id, data.message],
    )
    return { ok: true }
  }
  @Get('help') async helps(@Param('id') id: string, @Req() req: AuthRequest) {
    await this.service.access(actor(req), id, true)
    return (
      await this.service.pool.query(
        'select * from help_requests where classroom_id=$1 order by created_at desc limit 200',
        [id],
      )
    ).rows
  }
  @Post('help/:student/resolve') async resolve(
    @Param('id') id: string,
    @Param('student') student: string,
    @Req() req: AuthRequest,
  ) {
    await this.service.access(actor(req), id, true)
    await this.service.pool.query(
      'update help_requests set resolved=true where classroom_id=$1 and user_id=$2',
      [id, parse(z.uuid(), student)],
    )
    return { ok: true }
  }
  @Post('submissions') async submit(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuthRequest,
  ) {
    const user = actor(req)
    role(user, 'student')
    const data = parse(z.object({ exerciseId: z.uuid(), revision: z.number().int().min(1) }), body)
    const { c, e } = await this.service.exercise(user, id, data.exerciseId, true)
    if (
      !c.settings.allowResubmit &&
      (
        await this.service.pool.query(
          'select 1 from submissions where user_id=$1 and exercise_id=$2',
          [user.id, e.id],
        )
      ).rowCount
    )
      throw new ForbiddenException('教师已关闭重复提交')
    const result = await this.service.pool.query(
      'insert into submissions(classroom_id,exercise_id,user_id,code,filename,revision) select classroom_id,exercise_id,user_id,code,$4,revision from drafts where classroom_id=$1 and exercise_id=$2 and user_id=$3 and revision=$5 returning *',
      [id, e.id, user.id, e.filename, data.revision],
    )
    if (!result.rowCount) throw new ConflictException('请先同步最新草稿版本')
    return result.rows[0]
  }
  @Get('submissions') async submissions(@Param('id') id: string, @Req() req: AuthRequest) {
    const user = actor(req)
    await this.service.access(user, id)
    return (
      await this.service.pool.query(
        `select s.*,u.name,u.number,e.content->>'title' as title from submissions s join users u on u.id=s.user_id join exercises e on e.id=s.exercise_id where s.classroom_id=$1 and ($2='teacher' or s.user_id=$3) order by s.created_at desc`,
        [id, user.role, user.id],
      )
    ).rows
  }
  @Get('export') async export(@Param('id') id: string, @Req() req: AuthRequest) {
    await this.service.access(actor(req), id, true)
    const [drafts, runs, submissions, exercises] = await Promise.all(
      ['drafts', 'runs', 'submissions', 'exercises'].map((table) =>
        this.service.pool.query(`select * from ${table} where classroom_id=$1`, [id]),
      ),
    )
    const roster = await this.service.pool.query(
      'select u.id,u.name,u.number,m.status from memberships m join users u on u.id=m.user_id where m.classroom_id=$1',
      [id],
    )
    await this.service.audit(actor(req), 'classroom.exported', { classroomId: id })
    return {
      classroomId: id,
      exportedAt: new Date().toISOString(),
      roster: roster.rows,
      drafts: drafts!.rows,
      runs: runs!.rows,
      submissions: submissions!.rows,
      exercises: exercises!.rows,
    }
  }
  @Post('projections') async project(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuthRequest,
  ) {
    await this.service.access(actor(req), id, true)
    const data = parse(
      z.object({ student: z.uuid(), exerciseId: z.uuid(), runId: z.uuid().optional() }),
      body,
    )
    const { e } = await this.service.exercise(actor(req), id, data.exerciseId)
    let snapshot: Record<string, unknown>
    if (data.runId) {
      const r = (
        await this.service.pool.query(
          'select code,filename,input,output,stderr,log,exit,status from runs where id=$1 and classroom_id=$2 and user_id=$3 and exercise_id=$4',
          [data.runId, id, data.student, data.exerciseId],
        )
      ).rows[0]
      if (!r) throw new NotFoundException('运行记录不存在')
      snapshot = { ...r, title: e.content.title }
    } else {
      const d = (
        await this.service.pool.query(
          'select code from drafts where classroom_id=$1 and user_id=$2 and exercise_id=$3',
          [id, data.student, data.exerciseId],
        )
      ).rows[0]
      snapshot = { code: d?.code ?? e.content.code, filename: e.filename, title: e.content.title }
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
        'select snapshot from projections where id=$1 and classroom_id=$2 and not revoked and expires_at>now()',
        [parse(z.uuid(), projection), id],
      )
    ).rows[0]
    if (!p) throw new NotFoundException('展示已过期或撤销')
    return p.snapshot
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
