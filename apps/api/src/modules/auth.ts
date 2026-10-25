import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto'
import {
  Body,
  Controller,
  Get,
  Inject,
  Injectable,
  Post,
  Req,
  Res,
  UnauthorizedException,
  ConflictException,
  HttpException,
} from '@nestjs/common'
import type { CanActivate, ExecutionContext } from '@nestjs/common'
import type { Response } from 'express'
import { z } from 'zod'
import { DatabaseService } from '../database.service.js'
import { actor, parse, text, type Actor, type AuthRequest } from './common.js'

export function passwordHash(password: string) {
  const salt = randomBytes(16).toString('hex')
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`
}
export function verifyPassword(password: string, hash: string) {
  const [salt, value] = hash.split(':')
  if (!salt || !value) return false
  const expected = Buffer.from(value, 'hex')
  const actual = scryptSync(password, salt, 64)
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}
const digest = (token: string) => createHash('sha256').update(token).digest('hex')
const sessionCookie = (req: AuthRequest) =>
  req.headers.cookie
    ?.split(';')
    .map((s) => s.trim())
    .find((s) => s.startsWith('classroom_session='))
    ?.slice(18)
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}
  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<AuthRequest>()
    // Browser mutations must originate from the same host. JSON APIs reject simple cross-site forms.
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      if (req.headers.origin && new URL(req.headers.origin).host !== req.headers.host)
        throw new UnauthorizedException('请求来源不匹配')
      if (req.headers['sec-fetch-site'] === 'cross-site')
        throw new UnauthorizedException('跨站请求被拒绝')
      if (req.headers['content-type']?.split(';')[0] !== 'application/json')
        throw new UnauthorizedException('仅接受 JSON 请求')
    }
    const publicPaths = [
      '/api/auth/login',
      '/api/auth/recover',
      '/api/health',
      '/api/health/readiness',
    ]
    if (publicPaths.includes(req.path)) return true
    const token = sessionCookie(req)
    if (!token) throw new UnauthorizedException('请先登录')
    const result = await this.database.database.pool.query(
      `select u.id,u.username,u.name,u.number,u.role from sessions s join users u on u.id=s.user_id
       where s.token=$1 and s.expires_at>now() and not u.disabled`,
      [digest(token)],
    )
    if (!result.rows[0]) throw new UnauthorizedException('会话已失效，请重新登录')
    req.actor = result.rows[0]
    return true
  }
}
@Controller('auth')
export class AuthController {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}
  @Post('login')
  async login(
    @Body() body: unknown,
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = parse(z.object({ username: text(80), password: z.string().min(1).max(200) }), body)
    const db = this.database.database.pool
    const key = digest(`${req.ip}:${data.username}`)
    const attempt = await db.query(
      `insert into login_attempts(key,count) values($1,1) on conflict(key) do update set count=case when login_attempts.since<now()-interval '15 minutes' then 1 else login_attempts.count+1 end, since=case when login_attempts.since<now()-interval '15 minutes' then now() else login_attempts.since end returning count`,
      [key],
    )
    if (attempt.rows[0].count > 20) throw new HttpException('登录尝试过多，请 15 分钟后重试', 429)
    const client = await db.connect()
    let authenticated: { user: Actor; token: string }
    try {
      await client.query('begin')
      // Serialize password verification and session creation with password resets,
      // personal password changes and account disabling, which lock the same user.
      const user = (
        await client.query('select * from users where username=$1 and not disabled for update', [
          data.username,
        ])
      ).rows[0]
      if (
        !verifyPassword(data.password, user?.password_hash ?? 'dummy:' + '00'.repeat(64)) ||
        !user
      )
        throw new UnauthorizedException('账号或密码不正确')
      const token = randomBytes(32).toString('hex')
      await client.query('delete from login_attempts where key=$1', [key])
      await client.query('delete from sessions where user_id=$1 and expires_at<now()', [user.id])
      await client.query(
        `insert into sessions(token,user_id,expires_at) values($1,$2,now()+interval '7 days')`,
        [digest(token), user.id],
      )
      await client.query('commit')
      authenticated = { user, token }
    } catch (e) {
      await client.query('rollback')
      throw e
    } finally {
      client.release()
    }
    const { user, token } = authenticated
    res.cookie('classroom_session', token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: req.secure,
      maxAge: 604800000,
      path: '/',
    })
    return {
      id: user.id,
      username: user.username,
      name: user.name,
      number: user.number,
      role: user.role,
    }
  }
  @Get('me') me(@Req() req: AuthRequest) {
    return actor(req)
  }
  @Post('logout') async logout(@Req() req: AuthRequest, @Res({ passthrough: true }) res: Response) {
    await this.database.database.pool.query('delete from sessions where token=$1', [
      digest(sessionCookie(req) ?? ''),
    ])
    res.clearCookie('classroom_session', { path: '/' })
    return { ok: true }
  }
  @Post('password') async password(@Body() body: unknown, @Req() req: AuthRequest) {
    const data = parse(
      z.object({ current: z.string().min(1).max(200), password: z.string().min(12).max(200) }),
      body,
    )
    const client = await this.database.database.pool.connect()
    try {
      await client.query('begin')
      const user = (
        await client.query('select password_hash from users where id=$1 for update', [
          actor(req).id,
        ])
      ).rows[0]
      if (!verifyPassword(data.current, user.password_hash))
        throw new ConflictException('当前密码不正确')
      await client.query('update users set password_hash=$1 where id=$2', [
        passwordHash(data.password),
        actor(req).id,
      ])
      await client.query('delete from sessions where user_id=$1', [actor(req).id])
      await client.query('update recovery_requests set resolved=true where username=$1', [
        actor(req).username,
      ])
      await client.query('insert into audit_events(event,source,details) values($1,$2,$3)', [
        'user.password_changed',
        actor(req).id,
        JSON.stringify({ userId: actor(req).id }),
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
  @Post('recover') async recover(@Body() body: unknown, @Req() req: AuthRequest) {
    const data = parse(z.object({ username: text(80) }), body)
    const key = digest(`recovery:${req.ip}`)
    const attempt = await this.database.database.pool.query(
      `insert into login_attempts(key,count) values($1,1) on conflict(key) do update set count=case when login_attempts.since<now()-interval '1 hour' then 1 else login_attempts.count+1 end,since=case when login_attempts.since<now()-interval '1 hour' then now() else login_attempts.since end returning count`,
      [key],
    )
    if (attempt.rows[0].count > 10)
      throw new HttpException('恢复申请过于频繁，请 1 小时后重试或联系管理员', 429)
    await this.database.database.pool.query(
      `insert into recovery_requests(username) select $1 where not exists(select 1 from recovery_requests where username=$1 and created_at>now()-interval '1 hour')`,
      [data.username],
    )
    return { ok: true, message: '申请已记录，请联系平台管理员核实身份并重设密码。' }
  }
}
