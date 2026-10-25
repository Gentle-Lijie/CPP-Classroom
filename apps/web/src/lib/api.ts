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
      ...(method === 'GET' ? { signal: AbortSignal.timeout(15000) } : {}),
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
  } catch {
    connectionState.value = 'disconnected'
    throw new ApiError(0, '无法连接服务器，请检查网络后重试。当前输入请先保留。')
  }
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    if (response.status === 401 && !['/auth/me', '/auth/login'].includes(path)) {
      connectionState.value = 'expired'
      window.dispatchEvent(new Event('classroom:session-expired'))
    } else if (response.status >= 500) connectionState.value = 'disconnected'
    throw new ApiError(
      response.status,
      Array.isArray(data.message) ? data.message.join('；') : data.message || '请求失败',
    )
  }
  return data as T
}
