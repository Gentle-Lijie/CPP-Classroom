import type { GuideRole } from './guide-catalog'

export interface GuideIdentity {
  id: string
  role: GuideRole
}
type GuideStorage = Pick<Storage, 'getItem' | 'setItem'>

export function isGuideRole(role?: string): role is GuideRole {
  return role === 'student' || role === 'teacher' || role === 'admin'
}

export function isGuideWorkspace(role: GuideRole, path: string) {
  if (role === 'student') return path === '/student/workspace'
  if (role === 'teacher')
    return (
      path.startsWith('/teacher/') &&
      path !== '/teacher/monitor' &&
      !path.startsWith('/teacher/inspect/')
    )
  return path.startsWith('/admin/')
}

export function createGuideVisitTracker(storage: () => GuideStorage) {
  const seenThisSession = new Set<string>()
  const key = (user: GuideIdentity) =>
    `cpp-classroom:guide-seen:v1:${user.role}:${encodeURIComponent(user.id)}`
  return {
    hasSeen(user: GuideIdentity) {
      const name = key(user)
      if (seenThisSession.has(name)) return true
      try {
        return storage().getItem(name) === '1'
      } catch {
        return false
      }
    },
    remember(user: GuideIdentity) {
      const name = key(user)
      seenThisSession.add(name)
      try {
        storage().setItem(name, '1')
      } catch {
        // Restricted browser storage still allows one automatic tour per page session.
      }
    },
  }
}

export const guideVisits = createGuideVisitTracker(() => window.localStorage)
