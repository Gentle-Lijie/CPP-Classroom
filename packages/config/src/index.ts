import { fileURLToPath } from 'node:url'
import { config } from 'dotenv'
import { z } from 'zod'

const databaseUrl = z
  .string()
  .url()
  .refine((value) => {
    try {
      const protocol = new URL(value).protocol
      return protocol === 'postgres:' || protocol === 'postgresql:'
    } catch {
      return false
    }
  }, 'DATABASE_URL 必须使用 PostgreSQL 协议')

export const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_HOST: z.string().default('127.0.0.1'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: databaseUrl,
  GO_JUDGE_URL: z.union([z.literal(''), z.url({ protocol: /^https?$/ })]).default(''),
  GO_JUDGE_AUTH_TOKEN: z.string().default(''),
  GO_JUDGE_TIMEOUT_MS: z.coerce.number().int().min(100).max(30000).default(2000),
})

export type Environment = z.infer<typeof environmentSchema>

export function loadEnvironment(): Environment {
  config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true })
  const result = environmentSchema.safeParse(process.env)
  if (!result.success) {
    // Do not print invalid values: they may contain database credentials or tokens.
    throw new Error(
      `环境配置错误：${result.error.issues.map((issue) => issue.path.join('.')).join(', ')}`,
    )
  }
  return result.data
}
