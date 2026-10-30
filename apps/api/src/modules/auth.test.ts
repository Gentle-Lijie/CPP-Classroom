import { describe, expect, it } from 'vitest'
import { passwordHash, verifyPassword } from './auth.js'

describe('password storage', () => {
  it('salts independent hashes and rejects wrong or malformed credentials', async () => {
    const hash = await passwordHash('a-long-password')
    expect(hash).not.toContain('a-long-password')
    expect(hash).not.toBe(await passwordHash('a-long-password'))
    expect(await verifyPassword('a-long-password', hash)).toBe(true)
    expect(await verifyPassword('wrong-password', hash)).toBe(false)
    expect(await verifyPassword('a-long-password', 'invalid')).toBe(false)
  })
})
