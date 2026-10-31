import { randomBytes, createHash } from 'node:crypto'
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
  BadRequestException,
} from '@nestjs/common'
import { z } from 'zod'
import {
  classroomPermissions,
  exerciseImportLimits,
  type ClassroomRole,
  type ClassroomPermission,
  exerciseStarterCode,
  sourceLanguages,
  validSourceFilename,
} from '@classroom/contracts'
import type { PoolClient } from '@classroom/database'
import { DatabaseService } from '../database.service.js'
import { passwordHash } from './auth.js'
import { actor, parse, role, text, passwordInput, type Actor, type AuthRequest } from './common.js'

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
const exerciseBaseSchema = z.object({
  language: z.enum(sourceLanguages).default('cpp'),
  starters: z
    .object({ cpp: z.string().max(100000).optional(), python: z.string().max(100000).optional() })
    .default({}),
  title: z.string().trim().max(100).default(''),
  topic: z.string().trim().max(100).default(''),
  filename: z
    .string()
    .trim()
    .refine((value) => !value || validSourceFilename(value), '无效的 C++ / Python 源文件名')
    .default(''),
  status: z.enum(['草稿', '已发布', '已关闭']).default('草稿'),
  description: z.string().max(100000).default(''),
  input: z.string().max(10000).default(''),
  output: z.string().max(10000).default(''),
  sampleInput: z.string().max(65536).default(''),
  sampleOutput: z.string().max(65536).default(''),
  code: z.string().max(100000).default(''),
  position: z.number().int().min(0).max(10000).optional(),
  version: z.number().int().optional(),
})
const matchesExerciseLanguage = (exercise: z.infer<typeof exerciseBaseSchema>) =>
  !exercise.filename || validSourceFilename(exercise.filename, exercise.language)
const noExerciseNullCharacters = (exercise: Record<string, unknown>) =>
  Object.values(exercise).every((value) =>
    typeof value === 'string'
      ? !value.includes('\0')
      : typeof value === 'object' && value !== null
        ? Object.values(value).every(
            (starter) => typeof starter !== 'string' || !starter.includes('\0'),
          )
        : true,
  )
export const exerciseSchema = exerciseBaseSchema
  .refine(matchesExerciseLanguage, '源文件扩展名必须与默认语言一致')
  .refine(noExerciseNullCharacters, '题目包含无效的空字符')

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
  classroomRole: ClassroomRole
}
export type ClassroomRequirement = boolean | 'teacher' | 'student' | 'owner' | ClassroomPermission
@Injectable()
export class ClassroomService {
  constructor(@Inject(DatabaseService) readonly database: DatabaseService) {}
  get pool() {
    return this.database.database.pool
  }
  async lockWritable(client: PoolClient, user: Actor, classId: string, exerciseId: string) {
    const c = (await client.query('select * from classrooms where id=$1 for share', [classId]))
      .rows[0] as ClassroomRow | undefined
    const e = (
      await client.query('select status from exercises where classroom_id=$1 and id=$2 for share', [
        classId,
        exerciseId,
      ])
    ).rows[0]
    const member = (
      await client.query(
        'select status,role from memberships where classroom_id=$1 and user_id=$2 for share',
        [classId, user.id],
      )
    ).rows[0]
    const account = (
      await client.query('select disabled,role from users where id=$1 for share', [user.id])
    ).rows[0]
    if (
      !account ||
      account.disabled ||
      account.role !== user.role ||
      !c ||
      member?.status !== 'active' ||
      !['teacher', 'student', 'ta'].includes(member.role)
    )
      throw new ForbiddenException('账号或课堂访问权限已变更，请刷新')
    c.classroomRole = member.role
    if (c.status !== '进行中' || e?.status !== '已发布')
      throw new ForbiddenException('课堂或练习当前只读')
    c.settings = { ...defaults, ...c.settings }
    return c
  }
  async access(
    user: Actor,
    id: string,
    permission: ClassroomRequirement = false,
    write = false,
    client?: PoolClient,
  ): Promise<ClassroomRow> {
    parse(z.uuid(), id)
    const query = client ?? this.pool
    const c = (
      await query.query('select * from classrooms where id=$1' + (client ? ' for update' : ''), [
        id,
      ])
    ).rows[0] as ClassroomRow | undefined
    if (!c) throw new NotFoundException('课堂不存在')
    c.settings = { ...defaults, ...c.settings }
    const member = (
      await query.query(
        'select status,role from memberships where classroom_id=$1 and user_id=$2' +
          (client ? ' for share' : ''),
        [id, user.id],
      )
    ).rows[0]
    if (client) {
      const account = (
        await client.query('select disabled,role from users where id=$1 for share', [user.id])
      ).rows[0]
      if (!account || account.disabled || account.role !== user.role)
        throw new ForbiddenException('账号访问权限已变更，请刷新')
    }
    c.classroomRole = member?.role
    const ownerOperation =
      permission === 'owner' ||
      ['assignments.manage', 'classroom.delete', 'classroom.transfer'].includes(String(permission))
    if (ownerOperation && user.role === 'admin') return c
    if (member?.status !== 'active') throw new ForbiddenException('尚未加入课堂或已被移除')
    if (ownerOperation && (c.owner_id !== user.id || member.role !== 'teacher'))
      throw new ForbiddenException('仅课堂负责人或管理员可执行此操作')
    if (!['student', 'teacher', 'ta'].includes(member.role))
      throw new ForbiddenException('无效的课堂身份')
    const permissions = classroomPermissions(member.role, c.owner_id === user.id)
    const required =
      permission === true
        ? 'students.observe'
        : permission === 'teacher'
          ? 'classroom.manage'
          : permission === 'student'
            ? 'submission.own.create'
            : permission === 'owner'
              ? 'assignments.manage'
              : permission
    if (required && !permissions.includes(required))
      throw new ForbiddenException('当前课堂身份无权执行此操作')
    if (member.role === 'student' && c.status === '已归档' && !c.settings.readonly)
      throw new ForbiddenException('归档作品访问已关闭')
    if (write && (c.status !== '进行中' || !permissions.includes('workspace.own.write')))
      throw new ForbiddenException('课堂当前只读或当前身份无写入权限')
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
    if (!e || (c.classroomRole !== 'teacher' && e.status === '草稿'))
      throw new NotFoundException('练习不可访问')
    if (write && e.status !== '已发布') throw new ForbiddenException('练习已关闭')
    return { c, e }
  }
  async withAccess<T>(
    user: Actor,
    id: string,
    permission: ClassroomRequirement,
    operation: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect()
    try {
      await client.query('begin')
      await this.access(user, id, permission, false, client)
      const result = await operation(client)
      await client.query('commit')
      return result
    } catch (error) {
      await client.query('rollback').catch(() => {})
      throw error
    } finally {
      client.release()
    }
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
      `select c.*,u.name as teacher,m.status as membership_status,m.role as classroom_role,
      (select count(*)::int from memberships mm where mm.classroom_id=c.id and mm.status='active' and mm.role='student') as students,
      case when m.status='active' then (select count(*)::int from exercises e where e.classroom_id=c.id and (m.role='teacher' or e.status<>'草稿')) else 0 end as exercises
      from classrooms c join users u on u.id=c.owner_id
      join memberships m on m.classroom_id=c.id and m.user_id=$1
      where m.status in ('active','pending') order by c.created_at desc`,
      [user.id],
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
      membershipStatus: c.membership_status,
      classroomRole: c.classroom_role,
      ownerId: c.owner_id,
      canManageStaff: c.owner_id === user.id || user.role === 'admin',
      permissions:
        c.membership_status === 'active'
          ? classroomPermissions(c.classroom_role, c.owner_id === user.id || user.role === 'admin')
          : [],
      settings: { ...defaults, ...c.settings },
      recommended: c.membership_status === 'pending' ? null : c.recommended,
      ...(c.classroom_role === 'teacher' && c.membership_status === 'active'
        ? { inviteCode: c.invite_code, inviteExpiresAt: c.invite_expires_at }
        : {}),
    }))
  }

  @Post() async create(@Body() body: unknown, @Req() req: AuthRequest) {
    const user = actor(req)
    role(user, 'teacher', 'admin')
    const data = parse(
      z.object({ name: text(100), description: z.string().max(5000).default('') }),
      body,
    )
    const client = await this.service.pool.connect()
    try {
      await client.query('begin')
      const account = (
        await client.query('select disabled,role from users where id=$1 for share', [user.id])
      ).rows[0]
      if (!account || account.disabled || !['teacher', 'admin'].includes(account.role))
        throw new ForbiddenException('创建课堂权限已变更')
      const result = await client.query(
        `insert into classrooms(owner_id,name,description,invite_code,invite_expires_at,settings) values($1,$2,$3,$4,now()+interval '7 days',$5) returning id`,
        [
          user.id,
          data.name,
          data.description,
          randomBytes(6).toString('hex').toUpperCase(),
          JSON.stringify(defaults),
        ],
      )
      const id = result.rows[0].id
      await client.query(
        "insert into memberships(classroom_id,user_id,role,status) values($1,$2,'teacher','active')",
        [id, user.id],
      )
      await client.query('insert into audit_events(event,source,details) values($1,$2,$3)', [
        'classroom.created',
        user.id,
        JSON.stringify({ classroomId: id }),
      ])
      await client.query('commit')
      return { id }
    } catch (error) {
      await client.query('rollback').catch(() => {})
      throw error
    } finally {
      client.release()
    }
  }
  @Post('join') async join(@Body() body: unknown, @Req() req: AuthRequest) {
    const user = actor(req)
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
      if (member && member.role !== 'student') throw new ConflictException('你已是此课堂教师或助教')
      if (member?.status === 'removed') throw new ForbiddenException('已移除，请联系教师重新授权')
      if (settings.access === 'roster' && member?.status !== 'active')
        throw new ForbiddenException('不在教师名册中')
      if (!member) {
        const count = (
          await client.query(
            "select count(*)::int as count from memberships where classroom_id=$1 and role='student' and status='active'",
            [c.id],
          )
        ).rows[0].count
        if (count >= settings.capacity)
          throw new ConflictException('课堂人数已满，请联系教师增加名额后再申请')
      }
      await client.query(
        `insert into memberships(classroom_id,user_id) values($1,$2) on conflict(classroom_id,user_id) do nothing`,
        [c.id, user.id],
      )
      await client.query('commit')
      return { id: c.id, status: member?.status ?? 'pending' }
    } catch (e) {
      await client.query('rollback').catch(() => {})
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
    await this.service.access(user, id, 'teacher')
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
    const client = await this.service.pool.connect()
    try {
      await client.query('begin')
      await this.service.access(actor(req), id, 'teacher', false, client)
      const current = (await client.query('select * from classrooms where id=$1 for update', [id]))
        .rows[0] as ClassroomRow
      if (
        data.recommended &&
        !(
          await client.query(
            "select 1 from exercises where classroom_id=$1 and id=$2 and status='已发布'",
            [id, data.recommended],
          )
        ).rowCount
      )
        throw new ConflictException('只能推荐当前课堂已发布的练习')
      if (data.settings?.capacity !== undefined) {
        const count = (
          await client.query(
            "select count(*)::int as count from memberships where classroom_id=$1 and role='student' and status='active'",
            [id],
          )
        ).rows[0].count
        if (data.settings.capacity < count)
          throw new ConflictException(`人数上限不能小于当前 ${count} 位成员`)
      }
      await client.query(
        'update classrooms set name=$2,description=$3,status=$4,settings=$5,recommended=$6 where id=$1',
        [
          id,
          data.name ?? current.name,
          data.description ?? current.description,
          data.status ?? current.status,
          JSON.stringify({ ...current.settings, ...data.settings }),
          data.recommended === undefined ? current.recommended : data.recommended,
        ],
      )
      if ((data.status && data.status !== '进行中') || data.settings?.allowRun === false)
        await client.query(
          "update runs set stop_requested=true where classroom_id=$1 and status in ('排队','编译中','运行中／可输入')",
          [id],
        )
      await client.query('insert into audit_events(event,source,details) values($1,$2,$3)', [
        'classroom.updated',
        user.id,
        JSON.stringify({ classroomId: id, ...data }),
      ])
      await client.query('commit')
    } catch (e) {
      await client.query('rollback').catch(() => {})
      throw e
    } finally {
      client.release()
    }
    return { ok: true }
  }
  @Delete(':id') async deleteClass(@Param('id') id: string, @Req() req: AuthRequest) {
    const user = actor(req)
    await this.service.access(user, id, 'owner')
    const client = await this.service.pool.connect()
    try {
      await client.query('begin')
      await this.service.access(actor(req), id, 'owner', false, client)
      const classroom = await client.query('select id from classrooms where id=$1 for update', [id])
      if (!classroom.rowCount) throw new NotFoundException('课堂不存在')
      const active = await client.query(
        "select 1 from runs where classroom_id=$1 and status in ('排队','编译中','运行中／可输入') limit 1",
        [id],
      )
      if (active.rowCount) throw new ConflictException('课堂仍有执行中的任务，请等待任务结束')
      await client.query(
        'delete from run_inputs where run_id in (select id from runs where classroom_id=$1)',
        [id],
      )
      for (const table of [
        'runs',
        'help_requests',
        'submissions',
        'drafts',
        'projections',
        'memberships',
        'exercises',
      ])
        await client.query(`delete from ${table} where classroom_id=$1`, [id])
      await client.query('delete from classrooms where id=$1', [id])
      await client.query('insert into audit_events(event,source,details) values($1,$2,$3)', [
        'classroom.deleted',
        user.id,
        JSON.stringify({ classroomId: id }),
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
  @Post(':id/invite') async invite(@Param('id') id: string, @Req() req: AuthRequest) {
    await this.service.access(actor(req), id, 'teacher')
    return this.service.withAccess(
      actor(req),
      id,
      'teacher',
      async (client) =>
        (
          await client.query(
            `update classrooms set invite_code=$2,invite_expires_at=now()+interval '7 days' where id=$1 returning invite_code as "inviteCode",invite_expires_at as "inviteExpiresAt"`,
            [id, randomBytes(6).toString('hex').toUpperCase()],
          )
        ).rows[0],
    )
  }
  @Get(':id/members') async members(@Param('id') id: string, @Req() req: AuthRequest) {
    await this.service.access(actor(req), id, 'teacher')
    return (
      await this.service.pool.query(
        `select u.id,u.name,u.username,u.number,u.disabled,coalesce((u.created_by=$2 and u.role='student' and not u.disabled and not exists(select 1 from memberships staff where staff.user_id=u.id and staff.role<>'student')),false) as "canResetPassword",coalesce((u.created_by=$2 and u.role='student' and exists(select 1 from classrooms owned where owned.id=m.classroom_id and owned.owner_id=$2) and not exists(select 1 from memberships staff where staff.user_id=u.id and staff.role<>'student')),false) as "canDeleteAccount",m.status as membership,m.exercise_id as "exerciseId",m.last_seen as "lastSeen",coalesce(m.last_seen>now()-interval '15 seconds',false) as online from memberships m join users u on u.id=m.user_id where m.classroom_id=$1 and m.role='student' order by u.number,u.name`,
        [id, actor(req).id],
      )
    ).rows
  }
  @Post(':id/members') async addMember(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuthRequest,
  ) {
    const teacher = actor(req)
    await this.service.access(teacher, id, 'teacher')
    const data = parse(
      z.object({
        name: text(50),
        number: text(50),
        username: text(80)
          .regex(/^[a-zA-Z0-9._@-]+$/, '登录账号仅限字母、数字和 . _ @ -')
          .optional(),
        password: passwordInput.optional(),
      }),
      body,
    )
    const client = await this.service.pool.connect()
    try {
      await client.query('begin')
      await this.service.access(actor(req), id, 'teacher', false, client)
      const c = (await client.query('select settings from classrooms where id=$1 for update', [id]))
        .rows[0]
      const size = (
        await client.query(
          "select count(*)::int as count from memberships where classroom_id=$1 and role='student' and status='active'",
          [id],
        )
      ).rows[0].count
      const username =
        'student.' +
        teacher.id +
        '.' +
        createHash('sha256').update(data.number).digest('hex').slice(0, 24)
      await client.query('select pg_advisory_xact_lock(hashtext($1))', [username])
      let user = (
        await client.query(
          `select u.id,u.username,u.role,u.name,u.number,u.disabled,u.created_by,
            exists(select 1 from memberships staff where staff.user_id=u.id and staff.role<>'student') as has_staff
           from users u where u.number=$1 and u.created_by=$2 and u.role in ('student','teacher') for share of u`,
          [data.number, teacher.id],
        )
      ).rows[0]
      if (user?.disabled) throw new ConflictException('该账号已停用，请联系管理员恢复后添加')
      if (user && user.name !== data.name)
        throw new ConflictException(
          '此学号已关联另一姓名，请核对姓名或使用独立学号；跨教师共享账号请让学生通过邀请加入',
        )
      const password = randomBytes(12).toString('base64url')
      const created = !user
      if (created && data.username) {
        const taken = (await client.query('select 1 from users where username=$1', [data.username]))
          .rowCount
        if (taken) throw new ConflictException('登录账号已被占用，请更换或留空自动生成')
      }
      const existingMember =
        user &&
        (
          await client.query(
            "select 1 from memberships where classroom_id=$1 and user_id=$2 and role='student' and status='active'",
            [id, user.id],
          )
        ).rowCount
      if (!existingMember && size >= { ...defaults, ...c.settings }.capacity)
        throw new ConflictException('课堂人数已满')
      if (!user)
        user = (
          await client.query(
            "insert into users(username,name,number,role,password_hash,created_by) values($1,$2,$3,'student',$4,$5) returning id,username,role,name,number",
            [
              data.username ?? username,
              data.name,
              data.number,
              await passwordHash(data.password ?? password),
              teacher.id,
            ],
          )
        ).rows[0]
      const assigned = await client.query(
        `insert into memberships(classroom_id,user_id,status) values($1,$2,'active') on conflict(classroom_id,user_id) do update set status='active' where memberships.role='student' returning id`,
        [id, user.id],
      )
      if (!assigned.rowCount)
        throw new ConflictException('该账号已是课堂教师或助教，请使用人员分配调整身份')
      await client.query('insert into audit_events(event,source,details) values($1,$2,$3)', [
        'membership.added',
        actor(req).id,
        JSON.stringify({ classroomId: id, userId: user.id, created }),
      ])
      await client.query('commit')
      return {
        id: user.id,
        username: user.username,
        created,
        name: user.name,
        number: user.number,
        canResetPassword: user.role === 'student' && !user.has_staff,
        ...(created ? { password: data.password ?? password } : {}),
      }
    } catch (e) {
      await client.query('rollback').catch(() => {})
      throw e
    } finally {
      client.release()
    }
  }
  @Delete(':id/members/:userId/account') async deleteStudentAccount(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Req() req: AuthRequest,
  ) {
    const teacher = actor(req)
    await this.service.access(teacher, id, 'teacher')
    parse(z.uuid(), userId)
    const client = await this.service.pool.connect()
    try {
      await client.query('begin')
      await this.service.access(actor(req), id, 'teacher', false, client)
      const classroom = await client.query(
        'select id from classrooms where id=$1 and owner_id=$2 for update',
        [id, teacher.id],
      )
      if (!classroom.rowCount) throw new NotFoundException('课堂不存在')
      const student = (
        await client.query(
          "select id,username from users where id=$1 and role='student' and created_by=$2 for update",
          [userId, teacher.id],
        )
      ).rows[0]
      if (!student) throw new ForbiddenException('只能删除由你创建的学生账号')
      const teaching = await client.query(
        "select 1 from memberships where user_id=$1 and role<>'student' limit 1",
        [userId],
      )
      if (teaching.rowCount)
        throw new ConflictException('该账号有关联的教师或助教身份，请联系管理员')
      const member = await client.query(
        'select id from memberships where classroom_id=$1 and user_id=$2',
        [id, userId],
      )
      if (!member.rowCount) throw new NotFoundException('该学生不是当前课堂成员')
      const otherTeacher = await client.query(
        `select 1 from classrooms c where c.owner_id<>$2 and (
          exists(select 1 from memberships where classroom_id=c.id and user_id=$1) or
          exists(select 1 from drafts where classroom_id=c.id and user_id=$1) or
          exists(select 1 from runs where classroom_id=c.id and user_id=$1) or
          exists(select 1 from submissions where classroom_id=c.id and user_id=$1) or
          exists(select 1 from help_requests where classroom_id=c.id and user_id=$1) or
          exists(select 1 from projections where classroom_id=c.id and user_id=$1)
        ) limit 1`,
        [userId, teacher.id],
      )
      if (otherTeacher.rowCount)
        throw new ConflictException(
          '该账号关联其他教师的课堂或作品，不能由教师永久删除，请联系管理员',
        )
      const active = await client.query(
        "select 1 from runs where user_id=$1 and status in ('排队','编译中','运行中／可输入') limit 1",
        [userId],
      )
      if (active.rowCount) throw new ConflictException('该学生仍有执行中的任务，请等待任务结束')
      await client.query(
        'delete from run_inputs where run_id in (select id from runs where user_id=$1)',
        [userId],
      )
      for (const table of [
        'runs',
        'help_requests',
        'submissions',
        'drafts',
        'projections',
        'memberships',
        'sessions',
      ])
        await client.query(`delete from ${table} where user_id=$1`, [userId])
      await client.query('delete from recovery_requests where username=$1', [student.username])
      await client.query('delete from users where id=$1', [userId])
      await client.query('insert into audit_events(event,source,details) values($1,$2,$3)', [
        'student.deleted',
        teacher.id,
        JSON.stringify({ classroomId: id, userId }),
      ])
      await client.query('commit')
      return { ok: true }
    } catch (e) {
      await client.query('rollback')
      if ((e as { code?: string }).code === '23503')
        throw new ConflictException('账号仍有关联记录，无法删除，请联系管理员')
      throw e
    } finally {
      client.release()
    }
  }
  @Post(':id/members/reset-passwords') async resetPasswords(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuthRequest,
  ) {
    const teacher = actor(req)
    await this.service.access(teacher, id, 'teacher')
    const data = parse(z.object({ userIds: z.array(z.uuid()).min(1).max(50) }), body)
    const ids = [...new Set(data.userIds)]
    const client = await this.service.pool.connect()
    try {
      await client.query('begin')
      await this.service.access(actor(req), id, 'teacher', false, client)
      await client.query('select id from classrooms where id=$1 for update', [id])
      const users = (
        await client.query(
          "select u.id,u.name,u.number,u.username from users u join memberships m on m.user_id=u.id where m.classroom_id=$1 and m.status='active' and m.role='student' and u.role='student' and u.created_by=$3 and not u.disabled and u.id=any($2::uuid[]) and not exists(select 1 from memberships staff where staff.user_id=u.id and staff.role<>'student') order by u.id for update of u",
          [id, ids, teacher.id],
        )
      ).rows
      if (users.length !== ids.length)
        throw new ForbiddenException(
          '仅可重置由你创建且未停用的当前课堂学生；其他或历史账号请联系管理员',
        )
      // Recheck after the account locks: another classroom's staff assignment may
      // have committed while the preceding SELECT FOR UPDATE was waiting.
      const teaching = await client.query(
        "select 1 from memberships where user_id=any($1::uuid[]) and role<>'student' limit 1",
        [ids],
      )
      if (teaching.rows.length)
        throw new ForbiddenException('该账号已有教师或助教身份，请联系管理员重置密码')
      const credentials = []
      for (const user of users) {
        const password = randomBytes(12).toString('base64url')
        await client.query('update users set password_hash=$2 where id=$1', [
          user.id,
          await passwordHash(password),
        ])
        credentials.push({ ...user, password })
      }
      await client.query('delete from sessions where user_id=any($1::uuid[])', [ids])
      await client.query(
        "update runs set stop_requested=true where user_id=any($1::uuid[]) and status in ('排队','编译中','运行中／可输入')",
        [ids],
      )
      await client.query('insert into audit_events(event,source,details) values($1,$2,$3)', [
        'membership.passwords_reset',
        teacher.id,
        JSON.stringify({ classroomId: id, userIds: ids }),
      ])
      await client.query('commit')
      return credentials
    } catch (e) {
      await client.query('rollback').catch(() => {})
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
    await this.service.access(actor(req), id, 'teacher')
    const data = parse(
      z.object({
        status: z.enum(['active', 'removed']),
        action: z.enum(['reject', 'remove']).optional(),
      }),
      body,
    )
    parse(z.uuid(), userId)
    const client = await this.service.pool.connect()
    try {
      await client.query('begin')
      await this.service.access(actor(req), id, 'teacher', false, client)
      const c = (await client.query('select settings from classrooms where id=$1 for update', [id]))
        .rows[0]
      const membership = (
        await client.query(
          'select status,role from memberships where classroom_id=$1 and user_id=$2 for update',
          [id, userId],
        )
      ).rows[0]
      if (!membership || membership.role !== 'student')
        throw new NotFoundException('学生成员不存在')
      if (data.action === 'reject' && membership.status !== 'pending')
        throw new ConflictException('申请状态已改变，请刷新后重试')
      if (data.status === 'active') {
        if (
          (await client.query('select disabled from users where id=$1', [userId])).rows[0]?.disabled
        )
          throw new ConflictException('该学生账号已停用，请联系管理员恢复后审批')
        const n = (
          await client.query(
            "select count(*)::int as count from memberships where classroom_id=$1 and role='student' and status='active' and user_id<>$2",
            [id, userId],
          )
        ).rows[0].count
        if (n >= { ...defaults, ...c.settings }.capacity)
          throw new ConflictException('课堂人数已满')
      }
      if (data.action === 'reject') {
        await client.query(
          "delete from memberships where classroom_id=$1 and user_id=$2 and status='pending'",
          [id, userId],
        )
        await client.query('insert into audit_events(event,source,details) values($1,$2,$3)', [
          'membership.rejected',
          actor(req).id,
          JSON.stringify({ classroomId: id, userId }),
        ])
        await client.query('commit')
        return { ok: true }
      }
      const result = await client.query(
        "update memberships set status=$3 where classroom_id=$1 and user_id=$2 and role='student' returning id",
        [id, userId, data.status],
      )
      if (!result.rowCount) throw new NotFoundException('成员不存在')
      if (data.status === 'removed')
        await client.query(
          "update runs set stop_requested=true where classroom_id=$1 and user_id=$2 and status in ('排队','编译中','运行中／可输入')",
          [id, userId],
        )
      await client.query('insert into audit_events(event,source,details) values($1,$2,$3)', [
        'membership.updated',
        actor(req).id,
        JSON.stringify({ classroomId: id, userId, status: data.status }),
      ])
      await client.query('commit')
      return { ok: true }
    } catch (e) {
      await client.query('rollback').catch(() => {})
      throw e
    } finally {
      client.release()
    }
  }
  @Get(':id/exercises') async exercises(@Param('id') id: string, @Req() req: AuthRequest) {
    const user = actor(req)
    const classroom = await this.service.access(user, id)
    return (
      await this.service.pool.query(
        "select * from exercises where classroom_id=$1 and ($2='teacher' or status<>'草稿') order by position,updated_at",
        [id, classroom.classroomRole],
      )
    ).rows.map((e) => ({
      ...e.content,
      language: e.language,
      starters: e.starters,
      code: exerciseStarterCode(e, e.language),
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
    await this.service.access(actor(req), id, 'teacher')
    const data = parse(exerciseSchema, body)
    const client = await this.service.pool.connect()
    try {
      await client.query('begin')
      await this.service.access(actor(req), id, 'teacher', false, client)
      await client.query('select id from classrooms where id=$1 for update', [id])
      if (
        data.filename &&
        (
          await client.query(
            'select id from exercises where classroom_id=$1 and lower(filename)=lower($2)',
            [id, data.filename],
          )
        ).rowCount
      )
        throw new ConflictException('文件名已存在（不区分大小写）')
      const result = (
        await client.query(
          'insert into exercises(classroom_id,filename,status,position,content,language,starters) values($1,$2,$3,coalesce($4,(select coalesce(max(position),0)+1 from exercises where classroom_id=$1)),$5,$6,$7) returning id',
          [
            id,
            data.filename,
            data.status,
            data.position ?? null,
            JSON.stringify(data),
            data.language,
            JSON.stringify({
              ...data.starters,
              [data.language]: data.starters[data.language] ?? data.code,
            }),
          ],
        )
      ).rows[0]
      await client.query('insert into audit_events(event,source,details) values($1,$2,$3)', [
        'exercise.created',
        actor(req).id,
        JSON.stringify({ classroomId: id, exerciseId: result.id, status: data.status }),
      ])
      await client.query('commit')
      return result
    } catch (e) {
      await client.query('rollback').catch(() => {})
      if ((e as { code: string }).code === '23505') throw new ConflictException('文件名已存在')
      throw e
    } finally {
      client.release()
    }
  }
  @Post(':id/exercises/import') async importExercises(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuthRequest,
  ) {
    const user = actor(req)
    await this.service.access(user, id, 'teacher')
    if (Buffer.byteLength(JSON.stringify(body) ?? '') > exerciseImportLimits.bodyBytes)
      throw new BadRequestException('导入内容超过 500 KiB，请减少所选文件后分批导入')
    const { exercises } = parse(
      z.object({
        exercises: z
          .array(
            exerciseBaseSchema
              .omit({ status: true, position: true, version: true })
              .refine(
                (exercise) =>
                  !exercise.filename || validSourceFilename(exercise.filename, exercise.language),
                '源文件扩展名必须与默认语言一致',
              )
              .refine(noExerciseNullCharacters, '题目包含无效的空字符'),
          )
          .min(1)
          .max(exerciseImportLimits.files),
      }),
      body,
    )
    const client = await this.service.pool.connect()
    try {
      await client.query('begin')
      await this.service.access(actor(req), id, 'teacher', false, client)
      await client.query('select id from classrooms where id=$1 for update', [id])
      const existing = (
        await client.query('select filename from exercises where classroom_id=$1', [id])
      ).rows as { filename: string }[]
      const filenames = new Set(existing.map((e) => e.filename.toLowerCase()).filter(Boolean))
      for (const exercise of exercises) {
        if (!exercise.filename) continue
        const filename = exercise.filename.toLowerCase()
        if (filenames.has(filename))
          throw new ConflictException(
            `源文件名「${exercise.filename}」已存在或在本批次重复（不区分大小写），请核对后重试`,
          )
        filenames.add(filename)
      }
      const { position } = (
        await client.query(
          'select coalesce(max(position),0) as position from exercises where classroom_id=$1',
          [id],
        )
      ).rows[0] as { position: number }
      const ids: string[] = []
      for (const [index, exercise] of exercises.entries()) {
        const result = await client.query(
          'insert into exercises(classroom_id,filename,status,position,content,language,starters) values($1,$2,$3,$4,$5,$6,$7) returning id',
          [
            id,
            exercise.filename,
            '草稿',
            position + index + 1,
            JSON.stringify(exercise),
            exercise.language,
            JSON.stringify({
              ...exercise.starters,
              [exercise.language]: exercise.starters[exercise.language] ?? exercise.code,
            }),
          ],
        )
        ids.push(result.rows[0].id as string)
      }
      await client.query('insert into audit_events(event,source,details) values($1,$2,$3)', [
        'exercises.imported',
        user.id,
        JSON.stringify({ classroomId: id, ids }),
      ])
      await client.query('commit')
      return { ids }
    } catch (error) {
      await client.query('rollback').catch(() => {})
      if ((error as { code: string }).code === '23505')
        throw new ConflictException('文件名已存在，本批次未导入，请核对后重试')
      throw error
    } finally {
      client.release()
    }
  }
  @Post(':id/exercises/reorder') async reorder(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuthRequest,
  ) {
    await this.service.access(actor(req), id, 'teacher')
    const data = parse(z.object({ ids: z.array(z.uuid()).max(500) }), body)
    const client = await this.service.pool.connect()
    try {
      await client.query('begin')
      await this.service.access(actor(req), id, 'teacher', false, client)
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
        'update exercises e set position=t.n::int,version=version+1,updated_at=now() from unnest($2::uuid[]) with ordinality as t(id,n) where e.classroom_id=$1 and e.id=t.id',
        [id, data.ids],
      )
      await client.query('insert into audit_events(event,source,details) values($1,$2,$3)', [
        'exercises.reordered',
        actor(req).id,
        JSON.stringify({ classroomId: id, ids: data.ids }),
      ])
      await client.query('commit')
      return { ok: true }
    } catch (e) {
      await client.query('rollback').catch(() => {})
      throw e
    } finally {
      client.release()
    }
  }
  @Patch(':id/exercises/batch') async batchUpdateExercises(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuthRequest,
  ) {
    const user = actor(req)
    await this.service.access(user, id, 'teacher')
    const { exercises, changes } = parse(
      z.object({
        exercises: z
          .array(z.object({ id: z.uuid(), version: z.number().int().min(1) }))
          .min(1)
          .max(500)
          .refine(
            (items) => new Set(items.map((item) => item.id)).size === items.length,
            '练习重复',
          ),
        changes: z
          .object({
            status: z.enum(['草稿', '已发布', '已关闭']).optional(),
            topic: z
              .string()
              .trim()
              .max(100)
              .refine((value) => !value.includes('\0'))
              .optional(),
          })
          .strict()
          .refine(
            (value) => Object.values(value).some((field) => field !== undefined),
            '请选择要修改的字段',
          ),
      }),
      body,
    )
    const ids = exercises.map((exercise) => exercise.id)
    const client = await this.service.pool.connect()
    try {
      await client.query('begin')
      await this.service.access(actor(req), id, 'teacher', false, client)
      await client.query('select id from classrooms where id=$1 for update', [id])
      const current = (
        await client.query(
          'select id,version from exercises where classroom_id=$1 and id=any($2::uuid[]) order by id for update',
          [id, ids],
        )
      ).rows as { id: string; version: number }[]
      const versions = new Map(current.map((exercise) => [exercise.id, exercise.version]))
      if (exercises.some((exercise) => versions.get(exercise.id) !== exercise.version))
        throw new ConflictException('部分练习已被修改或移除，本批次未保存，请刷新后重新选择')
      await client.query(
        'update exercises set status=coalesce($3,status),content=content || $4::jsonb,version=version+1,updated_at=now() where classroom_id=$1 and id=any($2::uuid[])',
        [id, ids, changes.status ?? null, JSON.stringify(changes)],
      )
      if (changes.status && changes.status !== '已发布') {
        await client.query(
          'update classrooms set recommended=null where id=$1 and recommended=any($2::uuid[])',
          [id, ids],
        )
        await client.query(
          "update runs set stop_requested=true where classroom_id=$1 and exercise_id=any($2::uuid[]) and status in ('排队','编译中','运行中／可输入')",
          [id, ids],
        )
      }
      await client.query('insert into audit_events(event,source,details) values($1,$2,$3)', [
        'exercises.updated',
        user.id,
        JSON.stringify({ classroomId: id, ids, changes }),
      ])
      await client.query('commit')
      return { ids }
    } catch (error) {
      await client.query('rollback').catch(() => {})
      throw error
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
    await this.service.access(actor(req), id, 'teacher')
    const data = parse(exerciseSchema, body)
    parse(z.uuid(), exerciseId)
    const client = await this.service.pool.connect()
    try {
      await client.query('begin')
      await this.service.access(actor(req), id, 'teacher', false, client)
      await client.query('select id from classrooms where id=$1 for update', [id])
      if (
        data.filename &&
        (
          await client.query(
            'select id from exercises where classroom_id=$1 and lower(filename)=lower($2) and id<>$3',
            [id, data.filename, exerciseId],
          )
        ).rowCount
      )
        throw new ConflictException('文件名已存在（不区分大小写）')
      const result = await client.query(
        'update exercises set filename=$3,status=$4,position=coalesce($5,position),content=$6,language=$8,starters=$9,version=version+1,updated_at=now() where classroom_id=$1 and id=$2 and version=$7 returning version',
        [
          id,
          exerciseId,
          data.filename,
          data.status,
          data.position ?? null,
          JSON.stringify(data),
          data.version,
          data.language,
          JSON.stringify({
            ...data.starters,
            [data.language]: data.starters[data.language] ?? data.code,
          }),
        ],
      )
      if (!result.rowCount) throw new ConflictException('题目已被修改，请刷新后重试')
      if (data.status !== '已发布') {
        await client.query(
          'update classrooms set recommended=null where id=$1 and recommended=$2',
          [id, exerciseId],
        )
        await client.query(
          "update runs set stop_requested=true where classroom_id=$1 and exercise_id=$2 and status in ('排队','编译中','运行中／可输入')",
          [id, exerciseId],
        )
      }
      await client.query('insert into audit_events(event,source,details) values($1,$2,$3)', [
        'exercise.updated',
        actor(req).id,
        JSON.stringify({
          classroomId: id,
          exerciseId,
          status: data.status,
          version: result.rows[0].version,
        }),
      ])
      await client.query('commit')
      return result.rows[0]
    } catch (e) {
      await client.query('rollback').catch(() => {})
      if ((e as { code: string }).code === '23505') throw new ConflictException('文件名已存在')
      throw e
    } finally {
      client.release()
    }
  }
  @Delete(':id/exercises/:exerciseId/permanent') async deleteExercise(
    @Param('id') id: string,
    @Param('exerciseId') exerciseId: string,
    @Req() req: AuthRequest,
  ) {
    const user = actor(req)
    await this.service.access(user, id, 'teacher')
    parse(z.uuid(), exerciseId)
    const client = await this.service.pool.connect()
    try {
      await client.query('begin')
      await this.service.access(actor(req), id, 'teacher', false, client)
      await client.query('select id from classrooms where id=$1 for update', [id])
      const exercise = await client.query(
        'select id from exercises where classroom_id=$1 and id=$2 for update',
        [id, exerciseId],
      )
      if (!exercise.rowCount) throw new NotFoundException('练习不存在')
      const active = await client.query(
        "select 1 from runs where classroom_id=$1 and exercise_id=$2 and status in ('排队','编译中','运行中／可输入') limit 1",
        [id, exerciseId],
      )
      if (active.rowCount) throw new ConflictException('练习仍有执行中的任务，请等待任务结束')
      await client.query(
        'delete from run_inputs where run_id in (select id from runs where classroom_id=$1 and exercise_id=$2)',
        [id, exerciseId],
      )
      await client.query(
        `delete from projections where classroom_id=$1 and (
          snapshot->>'exercise_id'=$2::text or snapshot->>'exerciseId'=$2::text or
          snapshot->>'snapshotId' in (select id::text from drafts where classroom_id=$1 and exercise_id=$2::uuid)
        )`,
        [id, exerciseId],
      )
      for (const table of ['runs', 'help_requests', 'submissions', 'drafts'])
        await client.query(`delete from ${table} where classroom_id=$1 and exercise_id=$2`, [
          id,
          exerciseId,
        ])
      await client.query('update classrooms set recommended=null where id=$1 and recommended=$2', [
        id,
        exerciseId,
      ])
      await client.query(
        'update memberships set exercise_id=null where classroom_id=$1 and exercise_id=$2',
        [id, exerciseId],
      )
      await client.query('delete from exercises where classroom_id=$1 and id=$2', [id, exerciseId])
      await client.query('insert into audit_events(event,source,details) values($1,$2,$3)', [
        'exercise.deleted',
        user.id,
        JSON.stringify({ classroomId: id, exerciseId }),
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
  @Delete(':id/exercises/:exerciseId') async closeExercise(
    @Param('id') id: string,
    @Param('exerciseId') exerciseId: string,
    @Req() req: AuthRequest,
  ) {
    await this.service.access(actor(req), id, 'teacher')
    const client = await this.service.pool.connect()
    try {
      await client.query('begin')
      await this.service.access(actor(req), id, 'teacher', false, client)
      await client.query('select id from classrooms where id=$1 for update', [id])
      const result = await client.query(
        "update exercises set status='已关闭',version=version+1,updated_at=now() where classroom_id=$1 and id=$2 returning id",
        [id, parse(z.uuid(), exerciseId)],
      )
      if (!result.rowCount) throw new NotFoundException('练习不存在')
      await client.query('update classrooms set recommended=null where id=$1 and recommended=$2', [
        id,
        exerciseId,
      ])
      await client.query(
        "update runs set stop_requested=true where classroom_id=$1 and exercise_id=$2 and status in ('排队','编译中','运行中／可输入')",
        [id, exerciseId],
      )
      await client.query('insert into audit_events(event,source,details) values($1,$2,$3)', [
        'exercise.closed',
        actor(req).id,
        JSON.stringify({ classroomId: id, exerciseId }),
      ])
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
