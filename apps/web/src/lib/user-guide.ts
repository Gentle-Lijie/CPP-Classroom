import { currentUser, demo, exercises, workspaceRole, classroomRole } from '@/data/demo'
import { chapterAvailable, guideCatalog } from './guide-catalog'
import { guideVisits, isGuideRole } from './guide-visit'
import { startGuide } from './spotlight'

export function startUserGuide() {
  const user = currentUser.value
  const role = location.pathname.startsWith('/admin/') ? 'admin' : workspaceRole.value
  if (!user || !isGuideRole(role)) return
  const chapters =
    role === 'student'
      ? guideCatalog.student
      : guideCatalog[role].filter(
          (chapter) =>
            chapterAvailable(chapter, !!demo.classroomId, exercises.length > 0) &&
            (classroomRole.value !== 'ta' || role === 'admin' || chapter.id === 'overview'),
        )
  if (!chapters.length) return
  startGuide(role, chapters)
  guideVisits.remember({ id: user.id, role })
}
