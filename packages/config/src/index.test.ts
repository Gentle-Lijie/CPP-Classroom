import { describe, expect, it } from 'vitest'
import { environmentSchema } from './index.js'

const baseline = { DATABASE_URL: 'postgresql://classroom:secret@127.0.0.1:5432/classroom' }

describe('environment validation', () => {
  it('allows API and database development without an execution node', () => {
    const env = environmentSchema.parse(baseline)
    expect(env.GO_JUDGE_URL).toBe('')
    expect(env.API_HOST).toBe('127.0.0.1')
  })
  it('rejects incorrect database protocols and invalid ports', () => {
    expect(environmentSchema.safeParse({ DATABASE_URL: 'https://example.com' }).success).toBe(false)
    expect(environmentSchema.safeParse({ ...baseline, API_PORT: 70000 }).success).toBe(false)
  })
  it('rejects a non-HTTP execution endpoint and an unlimited health-check timeout', () => {
    expect(
      environmentSchema.safeParse({ ...baseline, GO_JUDGE_URL: 'file:///etc/passwd' }).success,
    ).toBe(false)
    expect(environmentSchema.safeParse({ ...baseline, GO_JUDGE_TIMEOUT_MS: 0 }).success).toBe(false)
  })
})
