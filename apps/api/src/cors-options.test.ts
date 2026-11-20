import { describe, expect, it } from 'vitest'
import { corsOptions } from './cors-options.js'

describe('corsOptions', () => {
  it('allows the configured browser origin with credentials', () => {
    expect(corsOptions('https://cpp.lijie.space')).toEqual({
      origin: 'https://cpp.lijie.space',
      credentials: true,
      allowedHeaders: ['Accept', 'Content-Type'],
      methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    })
  })

  it('does not reflect arbitrary origins when a browser origin is configured', () => {
    expect(corsOptions('https://cpp.lijie.space').origin).not.toBe(true)
  })
})
