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
  if (previous.access !== next.access) changes.push('入班方式')
  if (previous.capacity !== next.capacity) changes.push('人数上限')
  if (previous.allowJoin !== next.allowJoin) changes.push('新成员加入')
  if (previous.allowRun !== next.allowRun) changes.push('编译运行权限')
  if (previous.allowResubmit !== next.allowResubmit) changes.push('重复提交权限')
  if (previous.readonly !== next.readonly) changes.push('归档后的访问权限')
  return changes
}
