import { beforeEach, describe, expect, it, vi } from 'vitest'

const push = vi.hoisted(() => ({
  success: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
  destroyAll: vi.fn(),
}))
vi.mock('notivue', () => ({ push }))

import { notify } from './notifications'

beforeEach(() => vi.clearAllMocks())

describe('notification lifetime', () => {
  it.each(['warning', 'error'] as const)('keeps %s visible until explicitly dismissed', (kind) => {
    notify('需要处理的问题', kind)
    expect(push[kind]).toHaveBeenCalledWith({ message: '需要处理的问题', duration: Infinity })
  })

  it.each(['success', 'info'] as const)('allows %s to expire automatically', (kind) => {
    notify('操作提示', kind)
    const { duration } = push[kind].mock.calls[0]![0]
    expect(Number.isFinite(duration)).toBe(true)
    expect(duration).toBeGreaterThan(0)
  })

  it('keeps the default success notification temporary', () => {
    notify('已保存')
    expect(push.success).toHaveBeenCalledWith({ message: '已保存', duration: 6000 })
  })
})
