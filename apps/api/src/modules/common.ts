import { BadRequestException, ForbiddenException, UnauthorizedException } from '@nestjs/common'
import type { Request } from 'express'
import { z } from 'zod'

export interface Actor {
  id: string
  username: string
  name: string
  number: string
  role: string
}
export type AuthRequest = Request & { actor?: Actor }
export function actor(req: AuthRequest): Actor {
  if (!req.actor) throw new UnauthorizedException('请先登录')
  return req.actor
}
export function role(user: Actor, ...roles: string[]) {
  if (!roles.includes(user.role)) throw new ForbiddenException('无权执行此操作')
}
export function parse<T extends z.ZodType>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value)
  if (!result.success)
    throw new BadRequestException(result.error.issues.map((i) => i.message).join('；'))
  return result.data
}
export const idSchema = z.uuid()
export const text = (max = 200) => z.string().trim().min(1).max(max)
