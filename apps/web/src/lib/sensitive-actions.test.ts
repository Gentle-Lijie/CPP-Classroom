import { describe, expect, it } from 'vitest'
import { classroomPolicyChanges, type ClassroomPolicy } from './sensitive-actions'

const policy: ClassroomPolicy = {
  access: 'approval',
  capacity: 50,
  allowJoin: true,
  allowRun: true,
  allowResubmit: true,
  readonly: true,
}

describe('classroom policy confirmation', () => {
  it('does not prompt when no policy changes', () => {
    expect(classroomPolicyChanges(policy, { ...policy })).toEqual([])
  })
  it('identifies each changed access and runtime policy for the confirmation', () => {
    expect(
      classroomPolicyChanges(policy, {
        access: 'roster',
        capacity: 30,
        allowJoin: false,
        allowRun: false,
        allowResubmit: false,
        readonly: false,
      }),
    ).toEqual([
      '入班方式',
      '人数上限',
      '新成员加入',
      '编译运行权限',
      '重复提交权限',
      '归档后的访问权限',
    ])
  })
})
