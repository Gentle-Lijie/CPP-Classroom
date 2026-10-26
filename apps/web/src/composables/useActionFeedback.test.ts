import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope, ref } from 'vue'
import { notify } from '../lib/notifications'
import { useActionFeedback } from './useActionFeedback'

vi.mock('../lib/notifications', () => ({ notify: vi.fn() }))
afterEach(() => vi.clearAllMocks())

describe('action feedback', () => {
  it('reports repeated failed attempts even when their reset and result share an event', () => {
    const scope = effectScope()
    const error = ref('')
    scope.run(() => useActionFeedback(error))
    error.value = '保存失败'
    error.value = ''
    error.value = '保存失败'
    expect(notify).toHaveBeenCalledTimes(2)
    expect(notify).toHaveBeenLastCalledWith('保存失败', 'error')
    scope.stop()
  })
  it('stops feedback when the source page is disposed', () => {
    const scope = effectScope()
    const error = ref('')
    scope.run(() => useActionFeedback(error))
    scope.stop()
    error.value = '旧请求返回的失败'
    expect(notify).not.toHaveBeenCalled()
  })
})
