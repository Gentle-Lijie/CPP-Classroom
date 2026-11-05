import { t } from '../i18n'
import { ApiError } from './api'

export interface MemberBatchFailure<T> {
  member: T
  message: string
}
export interface MemberBatchResult<T> {
  succeeded: T[]
  failed: MemberBatchFailure<T>[]
  pending: T[]
}

// Each existing endpoint remains the authority for its own permission checks.
// Stop after an uncertain network result or an expired session; never retry a
// password reset or permanent deletion automatically.
export async function runMemberBatch<T>(
  members: readonly T[],
  perform: (member: T) => Promise<unknown>,
  options: { current?: () => boolean; progress?: (completed: number) => void } = {},
): Promise<MemberBatchResult<T>> {
  const result: MemberBatchResult<T> = { succeeded: [], failed: [], pending: [] }
  for (const [index, member] of members.entries()) {
    if (options.current && !options.current()) {
      result.pending = members.slice(index)
      break
    }
    try {
      await perform(member)
      result.succeeded.push(member)
    } catch (error) {
      result.failed.push({
        member,
        message: error instanceof Error ? error.message : t('roster.batch.result.operationFailed'),
      })
      if (error instanceof ApiError && [0, 401].includes(error.status)) {
        result.pending = members.slice(index + 1)
        options.progress?.(index + 1)
        break
      }
    }
    options.progress?.(index + 1)
  }
  return result
}

export function memberBatchMessage<T extends { name: string }>(result: MemberBatchResult<T>) {
  const summary = result.pending.length
    ? t('roster.batch.result.summaryPending', {
        succeeded: result.succeeded.length,
        failed: result.failed.length,
        pending: result.pending.length,
      })
    : t('roster.batch.result.summary', {
        succeeded: result.succeeded.length,
        failed: result.failed.length,
      })
  const details = result.failed
    .map(({ member, message }) => `${member.name}: ${message}`)
    .join(t('roster.batch.result.detailSeparator'))
  return [summary, details, t('roster.batch.result.retryNote')].filter(Boolean).join(' ')
}
