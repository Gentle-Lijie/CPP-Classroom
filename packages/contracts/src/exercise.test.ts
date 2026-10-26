import { describe, expect, it } from 'vitest'
import { exerciseSourceFilename, validSourceFilename } from './index.js'

describe('optional exercise source filename', () => {
  it('uses distinct stable portable names without changing blank exercise fields', () => {
    const first = { id: '11111111-1111-4111-8111-111111111111', filename: '' }
    const second = { id: '22222222-2222-4222-8222-222222222222', filename: '' }
    expect(exerciseSourceFilename(first)).toBe(exerciseSourceFilename({ ...first }))
    expect(exerciseSourceFilename(first)).not.toBe(exerciseSourceFilename(second))
    expect(validSourceFilename(exerciseSourceFilename(first))).toBe(true)
    expect(first.filename).toBe('')
    expect(exerciseSourceFilename({ ...first, filename: '自定义.cpp' })).toBe('自定义.cpp')
  })
})
