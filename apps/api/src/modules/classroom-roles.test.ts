import { describe, expect, it, vi } from 'vitest'
import { ForbiddenException } from '@nestjs/common'
import { ClassroomService } from './classroom.js'
import type { DatabaseService } from '../database.service.js'
import type { Actor } from './common.js'

const classId = '11111111-1111-4111-8111-111111111111'
const userId = '22222222-2222-4222-8222-222222222222'
function setup(
  accountRole: string,
  membership?: { role: string; status: string },
  ownerId = userId,
) {
  const user = { id: userId, role: accountRole } as Actor
  const query = vi.fn(async (sql: string) => ({
    rows: sql.includes('from classrooms')
      ? [{ id: classId, owner_id: ownerId, status: '进行中', settings: {} }]
      : sql.includes('from memberships')
        ? membership
          ? [membership]
          : []
        : [],
  }))
  return {
    user,
    service: new ClassroomService({ database: { pool: { query } } } as unknown as DatabaseService),
  }
}
describe('classroom role authorization', () => {
  it('grants a student account its assigned classroom teacher rights without requiring ownership', async () => {
    const { user, service } = setup(
      'student',
      { role: 'teacher', status: 'active' },
      'another-owner',
    )
    await expect(service.access(user, classId, 'teacher')).resolves.toMatchObject({
      classroomRole: 'teacher',
    })
    await expect(service.access(user, classId, 'owner')).rejects.toBeInstanceOf(ForbiddenException)
  })
  it('does not inherit classroom teacher permissions from the account category', async () => {
    const { user, service } = setup('teacher', { role: 'student', status: 'active' })
    await expect(service.access(user, classId, 'student')).resolves.toMatchObject({
      classroomRole: 'student',
    })
    await expect(service.access(user, classId, true)).rejects.toBeInstanceOf(ForbiddenException)
  })
  it('allows TA observation while denying teacher management and own execution writes', async () => {
    const { user, service } = setup('student', { role: 'ta', status: 'active' })
    await expect(service.access(user, classId, true)).resolves.toMatchObject({
      classroomRole: 'ta',
    })
    await expect(service.access(user, classId, 'teacher')).rejects.toBeInstanceOf(
      ForbiddenException,
    )
    await expect(service.access(user, classId, false, true)).rejects.toBeInstanceOf(
      ForbiddenException,
    )
  })
  it.each([
    undefined,
    { role: 'teacher', status: 'removed' },
    { role: 'teacher', status: 'pending' },
  ])('never falls back to owner access for an inactive assignment: %j', async (membership) => {
    const { user, service } = setup('teacher', membership)
    await expect(service.access(user, classId)).rejects.toBeInstanceOf(ForbiddenException)
  })
  it('limits unassigned administrator access to explicit owner administration', async () => {
    const { user, service } = setup('admin')
    await expect(service.access(user, classId, 'owner')).resolves.toMatchObject({ id: classId })
    await expect(service.access(user, classId, true)).rejects.toBeInstanceOf(ForbiddenException)
  })
})
