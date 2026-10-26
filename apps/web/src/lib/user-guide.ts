import { currentUser, demo, exercises } from '@/data/demo'
import { chapterAvailable, guideCatalog } from './guide-catalog'
import { startGuide } from './spotlight'

export function startUserGuide() {
  const role = currentUser.value?.role
  if (role !== 'student' && role !== 'teacher' && role !== 'admin') return
  if (role === 'student') {
    startGuide(role, guideCatalog.student)
    return
  }
  startGuide(
    role,
    guideCatalog[role].filter((chapter) =>
      chapterAvailable(chapter, !!demo.classroomId, exercises.length > 0),
    ),
  )
}
