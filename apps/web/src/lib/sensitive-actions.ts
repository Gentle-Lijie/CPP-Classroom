import { t } from '../i18n'

export interface ClassroomPolicy {
  access: string
  capacity: number
  allowJoin: boolean
  allowRun: boolean
  allowResubmit: boolean
  readonly: boolean
}

export function classroomPolicyChanges(previous: ClassroomPolicy, next: ClassroomPolicy): string[] {
  const changes: string[] = []
  if (previous.access !== next.access) changes.push(t('lib.sensitive.access'))
  if (previous.capacity !== next.capacity) changes.push(t('lib.sensitive.capacity'))
  if (previous.allowJoin !== next.allowJoin) changes.push(t('lib.sensitive.join'))
  if (previous.allowRun !== next.allowRun) changes.push(t('lib.sensitive.run'))
  if (previous.allowResubmit !== next.allowResubmit) changes.push(t('lib.sensitive.resubmit'))
  if (previous.readonly !== next.readonly) changes.push(t('lib.sensitive.archiveAccess'))
  return changes
}
