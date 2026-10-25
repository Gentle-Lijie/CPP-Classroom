import { randomBytes } from 'node:crypto'
import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Inject,
  Injectable,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  ConflictException,
} from '@nestjs/common'
import { z } from 'zod'
import { DatabaseService } from '../database.service.js'
import { passwordHash } from './auth.js'
import { actor, parse, role, text, type Actor, type AuthRequest } from './common.js'

const defaults = {
  access: 'approval',
  allowJoin: true,
  allowRun: true,
  allowResubmit: true,
  readonly: true,
  capacity: 50,
}
const settingsSchema = z
  .object({
    access: z.enum(['approval', 'roster']),
    allowJoin: z.boolean(),
    allowRun: z.boolean(),
    allowResubmit: z.boolean(),
    readonly: z.boolean(),
    capacity: z.number().int().min(1).max(50),
  })
  .partial()
export const exerciseSchema = z.object({
  title: text(100),
  topic: text(100),
  filename: z.string().regex(/^[a-zA-Z0-9_-][a-zA-Z0-9_.-]{0,100}\.(cpp|cc|cxx)$/),
  status: z.enum(['草稿', '已发布', '已关闭']),
  description: text(100000),
  input: z.string().max(10000),
  output: z.string().max(10000),
  sampleInput: z.string().max(65536),
  sampleOutput: z.string().max(65536),
  code: z.string().max(100000),
  position: z.number().int().min(0).max(10000).optional(),
  version: z.number().int().optional(),
})
export interface ClassroomRow {
  id: string
  owner_id: string
  name: string
  description: string
  status: string
  invite_code: string
  invite_expires_at: Date
  settings: typeof defaults
  recommended: string | null
}
@Injectable()
export class ClassroomService {
  constructor(@Inject(DatabaseService) readonly database: DatabaseService) {}
  get pool() {
    return this.database.database.pool
  }
  async access(user: Actor, id: string, teacher = false, write = false): Promise<ClassroomRow> {
    parse(z.uuid(), id)
    const c = (await this.pool.query('select * from classrooms where id=$1', [id])).rows[0] as
      ClassroomRow | undefined
    if (!c) throw new NotFoundException('课堂不存在')
    c.settings = { ...defaults, ...c.settings }
    if (user.role === 'teacher' && c.owner_id === user.id) return c
    if (teacher || user.role !== 'student') throw new ForbiddenException('无权访问此课堂')
    const member = await this.pool.query(
      "select 1 from memberships where classroom_id=$1 and user_id=$2 and status='active'",
      [id, user.id],
    )
    if (!member.rowCount) throw new ForbiddenException('尚未加入课堂或已被移除')
    if (c.status === '已归档' && !c.settings.readonly)
      throw new ForbiddenException('归档作品访问已关闭')
    if (write && c.status !== '进行中') throw new ForbiddenException('课堂当前只读')
    return c
  }
  async exercise(user: Actor, classId: string, exerciseId: string, write = false) {
    const c = await this.access(user, classId, false, write)
    parse(z.uuid(), exerciseId)
    const e = (
      await this.pool.query('select * from exercises where classroom_id=$1 and id=$2', [
        classId,
        exerciseId,
      ])
    ).rows[0]
    if (!e || (user.role === 'student' && e.status === '草稿'))
      throw new NotFoundException('练习不可访问')
    if (write && e.status !== '已发布') throw new ForbiddenException('练习已关闭')
    return { c, e }
  }
  async audit(user: Actor, event: string, details: Record<string, unknown>) {
    await this.pool.query('insert into audit_events(event,source,details) values($1,$2,$3)', [
      event,
      user.id,
      JSON.stringify(details),
    ])
  }
}
@Controller('classes')
export class ClassroomController {
  constructor(@Inject(ClassroomService) private readonly service: ClassroomService) {}
  @Get() async list(@Req() req: AuthRequest) {
    const user = actor(req)
    const rows = await this.service.pool.query(
      `select c.*,u.name as teacher,(select count(*)::int from memberships m where m.classroom_id=c.id and m.status='active') as students,(select count(*)::int from exercises e where e.classroom_id=c.id and ($2='teacher' or e.status<>'草稿')) as exercises from classrooms c join users u on u.id=c.owner_id where c.owner_id=$1 or exists(select 1 from memberships m where m.classroom_id=c.id and m.user_id=$1 and m.status='active') order by c.created_at desc`,
      [user.id, user.role],
    )
    return rows.rows.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      status: c.status,
      students: c.students,
      exercises: c.exercises,
      teacher: c.teacher,
      color: 'green',
      settings: { ...defaults, ...c.settings },
      recommended: c.recommended,
      ...(c.owner_id === user.id
        ? { inviteCode: c.invite_code, inviteExpiresAt: c.invite_expires_at }
        : {}),
    }))
  }
  @Post() async create(@Body() body: unknown, @Req() req: AuthRequest) {
    const user = actor(req)
    role(user, 'teacher')
    const data = parse(
      z.object({ name: text(100), description: z.string().max(5000).default('') }),
      body,
    )
    const result = await this.service.pool.query(
      `insert into classrooms(owner_id,name,description,invite_code,invite_expires_at,settings) values($1,$2,$3,$4,now()+interval '7 days',$5) returning id`,
      [
        user.id,
        data.name,
        data.description,
        randomBytes(6).toString('hex').toUpperCase(),
        JSON.stringify(defaults),
      ],
    )
    await this.service.audit(user, 'classroom.created', { classroomId: result.rows[0].id })
    return result.rows[0]
  }
  @Post('join') async join(@Body() body: unknown, @Req() req: AuthRequest) {
    const user = actor(req)
    role(user, 'student')
    const data = parse(z.object({ code: text(30) }), body)
    const client = await this.service.pool.connect()
    try {
      await client.query('begin')
      const c = (
        await client.query('select * from classrooms where invite_code=$1 for update', [
          data.code.toUpperCase(),
        ])
      ).rows[0]
      if (!c || new Date(c.invite_expires_at).getTime() < Date.now())
        throw new NotFoundException('邀请无效或已过期')
      const settings = { ...defaults, ...c.settings }
      if (c.status === '已归档' || c.status === '已关闭' || !settings.allowJoin)
        throw new ForbiddenException('课堂已关闭加入')
      const member = (
        await client.query('select * from memberships where classroom_id=$1 and user_id=$2', [
          c.id,
          user.id,
        ])
      ).rows[0]
      if (member?.status === 'removed') throw new ForbiddenException('已移除，请联系教师重新授权')
      if (settings.access === 'roster' && member?.status !== 'active')
        throw new ForbiddenException('不在教师名册中')
      await client.query(
        `insert into memberships(classroom_id,user_id) values($1,$2) on conflict(classroom_id,user_id) do nothing`,
        [c.id, user.id],
      )
      await client.query('commit')
      return { id: c.id, status: member?.status ?? 'pending' }
    } catch (e) {
      await client.query('rollback')
      throw e
    } finally {
      client.release()
    }
  }
  @Patch(':id') async update(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuthRequest,
  ) {
    const user = actor(req)
    const c = await this.service.access(user, id, true)
    const data = parse(
      z.object({
        name: text(100).optional(),
        description: z.string().max(5000).optional(),
        status: z.enum(['未开始', '进行中', '已关闭', '已归档']).optional(),
        settings: settingsSchema.optional(),
        recommended: z.uuid().nullable().optional(),
      }),
      body,
    )
    if (
      data.recommended &&
      !(
        await this.service.pool.query('select 1 from exercises where classroom_id=$1 and id=$2', [
          id,
          data.recommended,
        ])
      ).rowCount
    )
      throw new NotFoundException('练习不属于课堂')
    await this.service.pool.query(
      'update classrooms set name=$2,description=$3,status=$4,settings=$5,recommended=$6 where id=$1',
      [
        id,
        data.name ?? c.name,
        data.description ?? c.description,
        data.status ?? c.status,
        JSON.stringify({ ...c.settings, ...data.settings }),
        data.recommended === undefined ? c.recommended : data.recommended,
      ],
    )
    if ((data.status && data.status !== '进行中') || data.settings?.allowRun === false)
      await this.service.pool.query(
        "update runs set stop_requested=true where classroom_id=$1 and status in ('排队','编译中','运行中／可输入')",
        [id],
      )
    await this.service.audit(user, 'classroom.updated', { classroomId: id, ...data })
    return { ok: true }
  }
  @Post(':id/invite') async invite(@Param('id') id: string, @Req() req: AuthRequest) {
    await this.service.access(actor(req), id, true)
    return (
      await this.service.pool.query(
        `update classrooms set invite_code=$2,invite_expires_at=now()+interval '7 days' where id=$1 returning invite_code as "inviteCode"`,
        [id, randomBytes(6).toString('hex').toUpperCase()],
      )
    ).rows[0]
  }
  @Get(':id/members') async members(@Param('id') id: string, @Req() req: AuthRequest) {
    await this.service.access(actor(req), id, true)
    return (
      await this.service.pool.query(
        `select u.id,u.name,u.username,u.number,m.status as membership,m.exercise_id as "exerciseId",m.last_seen as "lastSeen",coalesce(m.last_seen>now()-interval '15 seconds',false) as online from memberships m join users u on u.id=m.user_id where m.classroom_id=$1 and m.status<>'removed' order by u.number,u.name`,
        [id],
      )
    ).rows
  }
  @Post(':id/members') async addMember(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuthRequest,
  ) {
    await this.service.access(actor(req), id, true)
    const data = parse(
      z.object({
        name: text(50),
        number: text(50),
        password: z.string().min(10).max(200).optional(),
      }),
      body,
    )
    const client = await this.service.pool.connect()
    try {
      await client.query('begin')
      const c = (await client.query('select settings from classrooms where id=$1 for update', [id]))
        .rows[0]
      const size = (
        await client.query(
          "select count(*)::int as count from memberships where classroom_id=$1 and status='active'",
          [id],
        )
      ).rows[0].count
      if (size >= { ...defaults, ...c.settings }.capacity)
        throw new ConflictException('课堂人数已满')
      const username = 'student.' + data.number
      let user = (await client.query('select id,role from users where username=$1', [username]))
        .rows[0]
      const password = randomBytes(10).toString('base64url')
      const created = !user
      if (!user)
        user = (
          await client.query(
            "insert into users(username,name,number,role,password_hash) values($1,$2,$3,'student',$4) returning id,role",
            [username, data.name, data.number, passwordHash(data.password ?? password)],
          )
        ).rows[0]
      if (user.role !== 'student') throw new ConflictException('账号类型不匹配')
      await client.query(
        `insert into memberships(classroom_id,user_id,status) values($1,$2,'active') on conflict(classroom_id,user_id) do update set status='active'`,
        [id, user.id],
      )
      await client.query('commit')
      return {
        id: user.id,
        username,
        created,
        ...(created ? { password: data.password ?? password } : {}),
      }
    } catch (e) {
      await client.query('rollback')
      throw e
    } finally {
      client.release()
    }
  }
  @Patch(':id/members/:userId') async member(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Body() body: unknown,
    @Req() req: AuthRequest,
  ) {
    await this.service.access(actor(req), id, true)
    const data = parse(z.object({ status: z.enum(['active', 'removed']) }), body)
    parse(z.uuid(), userId)
    const client = await this.service.pool.connect()
    try {
      await client.query('begin')
      const c = (await client.query('select settings from classrooms where id=$1 for update', [id]))
        .rows[0]
      if (data.status === 'active') {
        const n = (
          await client.query(
            "select count(*)::int as count from memberships where classroom_id=$1 and status='active' and user_id<>$2",
            [id, userId],
          )
        ).rows[0].count
        if (n >= { ...defaults, ...c.settings }.capacity)
          throw new ConflictException('课堂人数已满')
      }
      const result = await client.query(
        'update memberships set status=$3 where classroom_id=$1 and user_id=$2 returning id',
        [id, userId, data.status],
      )
      if (!result.rowCount) throw new NotFoundException('成员不存在')
      if (data.status === 'removed')
        await client.query(
          "update runs set stop_requested=true where classroom_id=$1 and user_id=$2 and status in ('排队','编译中','运行中／可输入')",
          [id, userId],
        )
      await client.query('commit')
      return { ok: true }
    } catch (e) {
      await client.query('rollback')
      throw e
    } finally {
      client.release()
    }
  }
  @Get(':id/exercises') async exercises(@Param('id') id: string, @Req() req: AuthRequest) {
    const user = actor(req)
    await this.service.access(user, id)
    return (
      await this.service.pool.query(
        "select * from exercises where classroom_id=$1 and ($2='teacher' or status<>'草稿') order by position,updated_at",
        [id, user.role],
      )
    ).rows.map((e) => ({
      ...e.content,
      id: e.id,
      filename: e.filename,
      status: e.status,
      position: e.position,
      version: e.version,
    }))
  }
  @Post(':id/exercises') async createExercise(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuthRequest,
  ) {
    await this.service.access(actor(req), id, true)
    const data = parse(exerciseSchema, body)
    try {
      return (
        await this.service.pool.query(
          'insert into exercises(classroom_id,filename,status,position,content) values($1,$2,$3,$4,$5) returning id',
          [id, data.filename, data.status, data.position ?? 0, JSON.stringify(data)],
        )
      ).rows[0]
    } catch (e) {
      if ((e as { code: string }).code === '23505') throw new ConflictException('文件名已存在')
      throw e
    }
  }
  @Post(':id/exercises/reorder') async reorder(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuthRequest,
  ) {
    await this.service.access(actor(req), id, true)
    const data = parse(z.object({ ids: z.array(z.uuid()).max(500) }), body)
    const client = await this.service.pool.connect()
    try {
      await client.query('begin')
      await client.query('select id from classrooms where id=$1 for update', [id])
      const existing = (
        await client.query('select id from exercises where classroom_id=$1', [id])
      ).rows.map((r) => r.id as string)
      if (
        data.ids.length !== existing.length ||
        new Set(data.ids).size !== existing.length ||
        data.ids.some((e) => !existing.includes(e))
      )
        throw new ConflictException('练习列表已变更，请刷新后重试')
      await client.query(
        'update exercises e set position=t.n::int from unnest($2::uuid[]) with ordinality as t(id,n) where e.classroom_id=$1 and e.id=t.id',
        [id, data.ids],
      )
      await client.query('commit')
      return { ok: true }
    } catch (e) {
      await client.query('rollback')
      throw e
    } finally {
      client.release()
    }
  }
  @Patch(':id/exercises/:exerciseId') async updateExercise(
    @Param('id') id: string,
    @Param('exerciseId') exerciseId: string,
    @Body() body: unknown,
    @Req() req: AuthRequest,
  ) {
    await this.service.access(actor(req), id, true)
    const data = parse(exerciseSchema, body)
    parse(z.uuid(), exerciseId)
    try {
      const result = await this.service.pool.query(
        'update exercises set filename=$3,status=$4,position=$5,content=$6,version=version+1,updated_at=now() where classroom_id=$1 and id=$2 and version=$7 returning version',
        [
          id,
          exerciseId,
          data.filename,
          data.status,
          data.position ?? 0,
          JSON.stringify(data),
          data.version,
        ],
      )
      if (!result.rowCount) throw new ConflictException('题目已被修改，请刷新后重试')
      return result.rows[0]
    } catch (e) {
      if ((e as { code: string }).code === '23505') throw new ConflictException('文件名已存在')
      throw e
    }
  }
  @Delete(':id/exercises/:exerciseId') async closeExercise(
    @Param('id') id: string,
    @Param('exerciseId') exerciseId: string,
    @Req() req: AuthRequest,
  ) {
    await this.service.access(actor(req), id, true)
    await this.service.pool.query(
      "update exercises set status='已关闭' where classroom_id=$1 and id=$2",
      [id, parse(z.uuid(), exerciseId)],
    )
    return { ok: true }
  }
}
