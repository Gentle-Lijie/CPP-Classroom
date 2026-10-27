import { describe, expect, it } from 'vitest'
import { createGuideVisitTracker, isGuideWorkspace } from './guide-visit'

describe('first workspace guide visits', () => {
  it('persists a visit across page sessions and keeps users and roles independent', () => {
    const values = new Map<string, string>()
    const storage = () => ({
      getItem: (name: string) => values.get(name) ?? null,
      setItem: (name: string, value: string) => {
        values.set(name, value)
      },
    })
    const student = { id: 'account-a', role: 'student' as const }
    const first = createGuideVisitTracker(storage)
    expect(first.hasSeen(student)).toBe(false)
    first.remember(student)
    const afterReload = createGuideVisitTracker(storage)
    expect(afterReload.hasSeen(student)).toBe(true)
    expect(afterReload.hasSeen({ id: 'account-b', role: 'student' })).toBe(false)
    expect(afterReload.hasSeen({ id: 'account-a', role: 'teacher' })).toBe(false)
  })

  it('does not crash or repeatedly open during the session when storage is blocked', () => {
    const tracker = createGuideVisitTracker(() => {
      throw new Error('Storage blocked')
    })
    const user = { id: 'student', role: 'student' as const }
    expect(tracker.hasSeen(user)).toBe(false)
    expect(() => tracker.remember(user)).not.toThrow()
    expect(tracker.hasSeen(user)).toBe(true)
    expect(tracker.hasSeen({ id: 'another-student', role: 'student' })).toBe(false)
  })

  it('waits for the student programming workspace and ignores auxiliary teaching windows', () => {
    expect(isGuideWorkspace('student', '/student/classes')).toBe(false)
    expect(isGuideWorkspace('student', '/student/workspace')).toBe(true)
    expect(isGuideWorkspace('teacher', '/teacher/classes')).toBe(true)
    expect(isGuideWorkspace('teacher', '/teacher/teach')).toBe(true)
    expect(isGuideWorkspace('teacher', '/teacher/monitor')).toBe(false)
    expect(isGuideWorkspace('teacher', '/teacher/inspect/student-id')).toBe(false)
    expect(isGuideWorkspace('admin', '/admin/health')).toBe(true)
    expect(isGuideWorkspace('admin', '/admin/settings')).toBe(true)
    expect(isGuideWorkspace('student', '/login')).toBe(false)
    expect(isGuideWorkspace('admin', '/guide')).toBe(false)
    expect(isGuideWorkspace('teacher', '/student/workspace')).toBe(false)
  })
})
