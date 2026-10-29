/** The pinned browser bundle contains Pyright 1.1.386 and its typeshed. */
export async function openPyrightWorker(url: string, signal: AbortSignal) {
  signal.throwIfAborted()
  const worker = new Worker(url, { name: 'classroom-python-beta' })
  let disposed = false
  let rejectStartup: ((error: Error) => void) | undefined
  let reportClosed: (error: Error) => void = () => {}
  const closed = new Promise<Error>((resolve) => {
    reportClosed = resolve
  })
  const stop = () => {
    if (disposed) return
    disposed = true
    signal.removeEventListener('abort', aborted)
    worker.terminate()
    rejectStartup?.(new Error('Python 语言服务启动已取消'))
  }
  const aborted = () => stop()
  const failed = (event: ErrorEvent | MessageEvent) => {
    const error = new Error(
      'message' in event && typeof event.message === 'string' && event.message
        ? event.message
        : 'Python 语言服务无法加载，请检查网络后重试',
    )
    rejectStartup?.(error)
    reportClosed(error)
    stop()
  }
  worker.addEventListener('error', failed)
  worker.addEventListener('messageerror', failed)
  signal.addEventListener('abort', aborted, { once: true })
  const startup = new Promise<void>((resolve, reject) => {
    rejectStartup = reject
    worker.addEventListener('message', function handshake(event: MessageEvent) {
      if (event.data?.type === 'serverLoaded') {
        worker.postMessage({ type: 'initServer', userFiles: {} })
      } else if (event.data?.type === 'serverInitialized') {
        worker.removeEventListener('message', handshake)
        rejectStartup = undefined
        resolve()
      }
    })
  })
  const timer = setTimeout(() => {
    rejectStartup?.(new Error('Python 语言服务启动超时，请检查网络后重试'))
    stop()
  }, 90000)
  try {
    await startup
    signal.throwIfAborted()
    return { worker, closed, dispose: stop }
  } catch (error) {
    stop()
    throw error
  } finally {
    clearTimeout(timer)
  }
}
