import { currentUser, demo, exercises } from '@/data/demo'
import { chapterAvailable, guideCatalog } from './guide-catalog'
import { guideVisits, isGuideRole } from './guide-visit'
import { startGuide } from './spotlight'

export function startUserGuide() {
  const user = currentUser.value
  if (!user || !isGuideRole(user.role)) return
  const role = user.role
  const chapters =
    role === 'student'
      ? guideCatalog.student
      : guideCatalog[role].filter((chapter) =>
          chapterAvailable(chapter, !!demo.classroomId, exercises.length > 0),
        )
  if (!chapters.length) return
  startGuide(role, chapters)
  guideVisits.remember({ id: user.id, role })
}
