import { ref } from 'vue'
export const connectionState = ref<'connected' | 'disconnected' | 'expired'>('connected')

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}
export async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  let response: Response
  try {
    response = await fetch('/api' + path, {
      method,
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(method === 'GET' ? 15000 : 60000),
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
  } catch (error) {
    connectionState.value = 'disconnected'
    throw new ApiError(
      0,
      error instanceof Error && error.name === 'TimeoutError'
        ? '请求超时，请确认操作是否已完成后重试。当前输入请先保留。'
        : '无法连接服务器，请检查网络后重试。当前输入请先保留。',
    )
  }
  const data: unknown = await response.json().catch((error: unknown) => {
    if (!response.ok) return {}
    connectionState.value = 'disconnected'
    throw new ApiError(
      0,
      error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name)
        ? '请求超时，请确认操作是否已完成后重试。当前输入请先保留。'
        : '服务器返回了无效响应，请稍后重试。当前输入请先保留。',
    )
  })
  if (!response.ok) {
    if (response.status === 401 && !['/auth/me', '/auth/login'].includes(path)) {
      connectionState.value = 'expired'
      window.dispatchEvent(new Event('classroom:session-expired'))
    } else connectionState.value = response.status >= 500 ? 'disconnected' : 'connected'
    const message = data && typeof data === 'object' && 'message' in data ? data.message : undefined
    throw new ApiError(
      response.status,
      Array.isArray(message)
        ? message.join('；')
        : typeof message === 'string'
          ? message
          : '请求失败',
    )
  }
  connectionState.value = 'connected'
  return data as T
}
