import {
  Body,
  ConflictException,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common'
import { z } from 'zod'
import { classroomRoles } from '@classroom/contracts'
import { ClassroomService } from './classroom.js'
import { actor, parse, role, type AuthRequest } from './common.js'

@Controller('classes/:id')
export class AssignmentsController {
  constructor(@Inject(ClassroomService) private readonly service: ClassroomService) {}

  @Get('assignments') async list(@Param('id') id: string, @Req() req: AuthRequest) {
    await this.service.access(actor(req), id, 'assignments.manage')
    return (
      await this.service.pool.query(
        `select u.id,u.username,u.name,u.number,u.disabled,m.role,m.status,
        (u.id=c.owner_id) as owner
       from memberships m join users u on u.id=m.user_id join classrooms c on c.id=m.classroom_id
       where m.classroom_id=$1 order by (u.id=c.owner_id) desc,m.role,u.name,u.id`,
        [id],
      )
    ).rows
  }

  @Get('assignment-candidates') async candidates(
    @Param('id') id: string,
    @Query('search') search: string,
    @Req() req: AuthRequest,
  ) {
    await this.service.access(actor(req), id, 'assignments.manage')
    const term = parse(z.string().trim().min(2).max(80), search)
    return (
      await this.service.pool.query(
        `select id,username,name,number from users where not disabled and
       (username ilike $1 or name ilike $1 or number ilike $1) order by username,id limit 20`,
        ['%' + term.replace(/[\\%_]/g, '\\$&') + '%'],
      )
    ).rows
  }

  @Post('assignments') async assign(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuthRequest,
  ) {
    const user = actor(req)
    const data = parse(
      z.object({
        userId: z.uuid(),
        role: z.enum(classroomRoles),
        status: z.enum(['active', 'removed']).default('active'),
      }),
      body,
    )
    await this.service.access(user, id, 'assignments.manage')
    const client = await this.service.pool.connect()
    try {
      await client.query('begin')
      const classroom = await this.service.access(user, id, 'assignments.manage', false, client)
      if (
        data.userId === classroom.owner_id &&
        (data.role !== 'teacher' || data.status !== 'active')
      )
        throw new ConflictException('请先转移课堂负责人，再移除或调整原负责人的身份')
      const previous = (
        await client.query(
          'select role,status from memberships where classroom_id=$1 and user_id=$2 for update',
          [id, data.userId],
        )
      ).rows[0]
      const target = (
        await client.query('select disabled from users where id=$1 for share', [data.userId])
      ).rows[0]
      if (!target) throw new NotFoundException('账号不存在')
      if (target.disabled && data.status === 'active')
        throw new ConflictException('请先恢复已停用的账号')
      if (
        data.role === 'student' &&
        data.status === 'active' &&
        !(previous?.role === 'student' && previous.status === 'active')
      ) {
        const count = (
          await client.query(
            "select count(*)::int as count from memberships where classroom_id=$1 and role='student' and status='active'",
            [id],
          )
        ).rows[0].count
        if (count >= classroom.settings.capacity) throw new ConflictException('课堂人数已满')
      }
      await client.query(
        `insert into memberships(classroom_id,user_id,role,status) values($1,$2,$3,$4)
         on conflict(classroom_id,user_id) do update set role=excluded.role,status=excluded.status,
           last_seen=null,exercise_id=null`,
        [id, data.userId, data.role, data.status],
      )
      if (data.status === 'removed' || (previous && previous.role !== data.role)) {
        await client.query(
          "update runs set stop_requested=true where classroom_id=$1 and user_id=$2 and status in ('排队','编译中','运行中／可输入')",
          [id, data.userId],
        )
      }
      await client.query('insert into audit_events(event,source,details) values($1,$2,$3)', [
        'classroom.assignment_updated',
        user.id,
        JSON.stringify({ classroomId: id, ...data, previous }),
      ])
      await client.query('commit')
      return { ok: true }
    } catch (error) {
      await client.query('rollback').catch(() => {})
      throw error
    } finally {
      client.release()
    }
  }

  @Post('owner') async transfer(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuthRequest,
  ) {
    const user = actor(req)
    const data = parse(z.object({ userId: z.uuid() }), body)
    await this.service.access(user, id, 'classroom.transfer')
    const client = await this.service.pool.connect()
    try {
      await client.query('begin')
      const classroom = await this.service.access(user, id, 'classroom.transfer', false, client)
      const target = (
        await client.query(
          'select role,status from memberships where classroom_id=$1 and user_id=$2 for share',
          [id, data.userId],
        )
      ).rows[0]
      const account = (
        await client.query('select disabled from users where id=$1 for share', [data.userId])
      ).rows[0]
      if (target?.role !== 'teacher' || target.status !== 'active' || !account || account.disabled)
        throw new ConflictException('新负责人必须是当前课堂未停用的有效教师')
      await client.query('update classrooms set owner_id=$2 where id=$1', [id, data.userId])
      await client.query('insert into audit_events(event,source,details) values($1,$2,$3)', [
        'classroom.owner_transferred',
        user.id,
        JSON.stringify({ classroomId: id, previousOwner: classroom.owner_id, userId: data.userId }),
      ])
      await client.query('commit')
      return { ok: true }
    } catch (error) {
      await client.query('rollback').catch(() => {})
      throw error
    } finally {
      client.release()
    }
  }
}

@Controller('admin/classes')
export class AdminClassesController {
  constructor(@Inject(ClassroomService) private readonly service: ClassroomService) {}
  @Get() async list(@Req() req: AuthRequest) {
    role(actor(req), 'admin')
    return (
      await this.service.pool.query(
        `select c.id,c.name,c.status,c.owner_id as "ownerId",u.name as "ownerName"
       from classrooms c join users u on u.id=c.owner_id order by c.created_at desc,c.id`,
      )
    ).rows
  }
}
