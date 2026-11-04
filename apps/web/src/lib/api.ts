import { ref } from 'vue'
import { t } from '../i18n'
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
        ? t('lib.api.timeout')
        : t('lib.api.disconnected'),
    )
  }
  const data: unknown = await response.json().catch((error: unknown) => {
    if (!response.ok) return {}
    connectionState.value = 'disconnected'
    throw new ApiError(
      0,
      error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name)
        ? t('lib.api.timeout')
        : t('lib.api.invalidResponse'),
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
          : t('lib.api.requestFailed'),
    )
  }
  connectionState.value = 'connected'
  return data as T
}
