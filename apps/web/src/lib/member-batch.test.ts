import { describe, expect, it } from 'vitest'
import { ApiError } from './api'
import { runMemberBatch } from './member-batch'

describe('member batch execution', () => {
  it('runs each member once in order and keeps individual permission failures for retry', async () => {
    const calls: number[] = []
    let running = 0
    const result = await runMemberBatch([1, 2, 3], async (member) => {
      expect(running++).toBe(0)
      await Promise.resolve()
      calls.push(member)
      running--
      if (member === 2) throw new ApiError(403, '只能操作自己创建的学生')
    })
    expect(calls).toEqual([1, 2, 3])
    expect(result).toEqual({
      succeeded: [1, 3],
      failed: [{ member: 2, message: '只能操作自己创建的学生' }],
      pending: [],
    })
  })
  it.each([0, 401])(
    'stops without retrying uncertain or unauthenticated writes (%s)',
    async (status) => {
      const calls: number[] = []
      const result = await runMemberBatch([1, 2, 3], async (member) => {
        calls.push(member)
        if (member === 2) throw new ApiError(status, '请求未完成')
      })
      expect(calls).toEqual([1, 2])
      expect(result.succeeded).toEqual([1])
      expect(result.failed).toEqual([{ member: 2, message: '请求未完成' }])
      expect(result.pending).toEqual([3])
    },
  )
  it('stops before the next member when the classroom context is no longer current', async () => {
    let current = true
    const result = await runMemberBatch(
      [1, 2, 3],
      async () => {
        current = false
      },
      { current: () => current },
    )
    expect(result.succeeded).toEqual([1])
    expect(result.pending).toEqual([2, 3])
  })
})
