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
import { exerciseStarterCode, sourceLanguages } from '@classroom/contracts'
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
    const data = parse(
      z.object({ exerciseId: z.uuid().optional(), language: z.enum(sourceLanguages).optional() }),
      body,
    )
    if (data.exerciseId) await this.service.exercise(user, id, data.exerciseId)
    await this.service.pool.query(
      'update memberships set last_seen=now(),exercise_id=coalesce($3,exercise_id),language=coalesce($4,language) where classroom_id=$1 and user_id=$2',
      [id, user.id, data.exerciseId, data.language],
    )
    return { ok: true }
  }
  @Get('workspace/:exerciseId') async get(
    @Param('id') id: string,
    @Param('exerciseId') exerciseId: string,
    @Query('student') student: string | undefined,
    @Query('language') requestedLanguage: string | undefined,
    @Req() req: AuthRequest,
  ) {
    const user = actor(req)
    const { e } = await this.service.exercise(user, id, exerciseId)
    if (student && student !== user.id) await this.service.access(user, id, true)
    const userId = student ? parse(z.uuid(), student) : user.id
    const language = parse(z.enum(sourceLanguages), requestedLanguage ?? e.language ?? 'cpp')
    const draft = (
      await this.service.pool.query(
        'select code,revision,updated_at as "updatedAt" from drafts where classroom_id=$1 and exercise_id=$2 and user_id=$3 and language=$4',
        [id, exerciseId, userId, language],
      )
    ).rows[0]
    const [submission, help] = await Promise.all([
      this.service.pool.query(
        'select created_at from submissions where classroom_id=$1 and exercise_id=$2 and user_id=$3 and language=$4 order by created_at desc limit 1',
        [id, exerciseId, userId, language],
      ),
      this.service.pool.query(
        'select id,message,created_at,exercise_id,resolved,language from help_requests where classroom_id=$1 and exercise_id=$2 and user_id=$3 and language=$4 and not resolved order by created_at desc limit 1',
        [id, exerciseId, userId, language],
      ),
    ])
    return {
      ...(draft ?? { code: exerciseStarterCode(e, language), revision: 0, updatedAt: null }),
      language,
      submitted: !!submission.rows[0],
      submittedAt: submission.rows[0]?.created_at ?? null,
      help: help.rows[0] ?? null,
    }
  }
  @Put('workspace/:exerciseId') async save(
    @Param('id') id: string,
    @Param('exerciseId') exerciseId: string,
    @Body() body: unknown,
    @Req() req: AuthRequest,
  ) {
    const user = actor(req)
    role(user, 'student', 'teacher')
    const { e } = await this.service.exercise(user, id, exerciseId, true)
    const data = parse(
      z.object({
        code: z.string().max(100000),
        revision: z.number().int().min(0),
        language: z.enum(sourceLanguages).optional(),
      }),
      body,
    )
    const language = data.language ?? e.language ?? 'cpp'
    const client = await this.service.pool.connect()
    try {
      await client.query('begin')
      await this.service.lockWritable(client, user, id, exerciseId)
      const result = await client.query(
        `insert into drafts(classroom_id,exercise_id,user_id,code,revision,language) select $1,$2,$3,$4,1,$6 where $5=0 on conflict(user_id,exercise_id,language) do nothing returning revision,language`,
        [id, exerciseId, user.id, data.code, data.revision, language],
      )
      if (result.rows[0]) {
        await client.query('commit')
        return result.rows[0]
      }
      const updated = await client.query(
        'update drafts set code=$4,revision=revision+1,updated_at=now() where classroom_id=$1 and exercise_id=$2 and user_id=$3 and revision=$5 and language=$6 returning revision,language',
        [id, exerciseId, user.id, data.code, data.revision, language],
      )
      if (!updated.rowCount)
        throw new ConflictException(
          '另一窗口已保存新版本。当前修改保留在本机，请比较服务器版本后再保存。',
        )
      await client.query('commit')
      return updated.rows[0]
    } catch (error) {
      await client.query('rollback')
      throw error
    } finally {
      client.release()
    }
  }
}
