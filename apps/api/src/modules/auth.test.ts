import { describe, expect, it } from 'vitest'
import { passwordHash, verifyPassword } from './auth.js'

describe('password storage', () => {
  it('salts independent hashes and rejects wrong or malformed credentials', () => {
    const hash = passwordHash('a-long-password')
    expect(hash).not.toContain('a-long-password')
    expect(hash).not.toBe(passwordHash('a-long-password'))
    expect(verifyPassword('a-long-password', hash)).toBe(true)
    expect(verifyPassword('wrong-password', hash)).toBe(false)
    expect(verifyPassword('a-long-password', 'invalid')).toBe(false)
  })
})
