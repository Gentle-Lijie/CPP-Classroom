import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openPyrightWorker } from './browser-pyright-worker'

class TestWorker extends EventTarget {
  static instances: TestWorker[] = []
  postMessage = vi.fn()
  terminate = vi.fn()
  constructor() {
    super()
    TestWorker.instances.push(this)
  }
  message(type: string) {
    this.dispatchEvent(new MessageEvent('message', { data: { type } }))
  }
}

describe('browser Python worker lifecycle', () => {
  beforeEach(() => {
    TestWorker.instances = []
    vi.stubGlobal('Worker', TestWorker)
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('initializes once and terminates when its editor closes', async () => {
    const controller = new AbortController()
    const opening = openPyrightWorker('/python.js', controller.signal)
    const worker = TestWorker.instances[0]!
    worker.message('serverLoaded')
    expect(worker.postMessage).toHaveBeenCalledWith({ type: 'initServer', userFiles: {} })
    worker.message('serverInitialized')
    const session = await opening
    controller.abort()
    session.dispose()
    expect(worker.terminate).toHaveBeenCalledTimes(1)
  })

  it('rejects a pending initialization when the language changes', async () => {
    const controller = new AbortController()
    const opening = openPyrightWorker('/python.js', controller.signal)
    const rejection = expect(opening).rejects.toThrow('取消')
    controller.abort()
    await rejection
    expect(TestWorker.instances[0]!.terminate).toHaveBeenCalledTimes(1)
  })

  it('does not leave a stalled worker running after startup timeout', async () => {
    const opening = openPyrightWorker('/python.js', new AbortController().signal)
    const rejection = expect(opening).rejects.toThrow('超时')
    await vi.advanceTimersByTimeAsync(90000)
    await rejection
    expect(TestWorker.instances[0]!.terminate).toHaveBeenCalledTimes(1)
  })

  it('reports a runtime worker error and releases it', async () => {
    const opening = openPyrightWorker('/python.js', new AbortController().signal)
    const worker = TestWorker.instances[0]!
    worker.message('serverLoaded')
    worker.message('serverInitialized')
    const session = await opening
    worker.dispatchEvent(new Event('error'))
    await expect(session.closed).resolves.toBeInstanceOf(Error)
    expect(worker.terminate).toHaveBeenCalledTimes(1)
  })

  it('never creates a worker for an already cancelled editor', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(openPyrightWorker('/python.js', controller.signal)).rejects.toThrow()
    expect(TestWorker.instances).toHaveLength(0)
  })
})
