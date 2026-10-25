import {
  Body,
  Controller,
  ConflictException,
  Get,
  Inject,
  Param,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common'
import { z } from 'zod'
import { ClassroomService } from './classroom.js'
import { actor, parse, role, type AuthRequest } from './common.js'

@Controller('classes/:id')
export class WorkspaceController {
  constructor(@Inject(ClassroomService) private readonly service: ClassroomService) {}
  @Post('heartbeat') async heartbeat(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuthRequest,
  ) {
    const user = actor(req)
    await this.service.access(user, id)
    const data = parse(z.object({ exerciseId: z.uuid().optional() }), body)
    if (data.exerciseId) await this.service.exercise(user, id, data.exerciseId)
    await this.service.pool.query(
      'update memberships set last_seen=now(),exercise_id=coalesce($3,exercise_id) where classroom_id=$1 and user_id=$2',
      [id, user.id, data.exerciseId],
    )
    return { ok: true }
  }
  @Get('workspace/:exerciseId') async get(
    @Param('id') id: string,
    @Param('exerciseId') exerciseId: string,
    @Query('student') student: string | undefined,
    @Req() req: AuthRequest,
  ) {
    const user = actor(req)
    const { e } = await this.service.exercise(user, id, exerciseId)
    if (student && student !== user.id) await this.service.access(user, id, true)
    const userId = student ? parse(z.uuid(), student) : user.id
    const draft = (
      await this.service.pool.query(
        'select code,revision,updated_at as "updatedAt" from drafts where classroom_id=$1 and exercise_id=$2 and user_id=$3',
        [id, exerciseId, userId],
      )
    ).rows[0]
    return draft ?? { code: e.content.code, revision: 0, updatedAt: null }
  }
  @Put('workspace/:exerciseId') async save(
    @Param('id') id: string,
    @Param('exerciseId') exerciseId: string,
    @Body() body: unknown,
    @Req() req: AuthRequest,
  ) {
    const user = actor(req)
    role(user, 'student')
    await this.service.exercise(user, id, exerciseId, true)
    const data = parse(
      z.object({ code: z.string().max(100000), revision: z.number().int().min(0) }),
      body,
    )
    const result = await this.service.pool.query(
      `insert into drafts(classroom_id,exercise_id,user_id,code,revision) select $1,$2,$3,$4,1 where $5=0 on conflict(user_id,exercise_id) do nothing returning revision`,
      [id, exerciseId, user.id, data.code, data.revision],
    )
    if (result.rows[0]) return result.rows[0]
    const updated = await this.service.pool.query(
      'update drafts set code=$4,revision=revision+1,updated_at=now() where classroom_id=$1 and exercise_id=$2 and user_id=$3 and revision=$5 returning revision',
      [id, exerciseId, user.id, data.code, data.revision],
    )
    if (!updated.rowCount)
      throw new ConflictException(
        '另一窗口已保存新版本。当前修改保留在本机，请比较服务器版本后再保存。',
      )
    return updated.rows[0]
  }
}
