import { nextTick, watch } from 'vue'
import { useRoute } from 'vue-router'
import { bootstrapError, currentUser, classroomRole, workspaceRole } from '@/data/demo'
import { guideVisits, isGuideRole, isGuideWorkspace } from '@/lib/guide-visit'
import { spotlight } from '@/lib/spotlight'
import { startUserGuide } from '@/lib/user-guide'

export function useFirstVisitGuide() {
  const route = useRoute()
  watch(
    () => [currentUser.value?.id, classroomRole.value, route.path, bootstrapError.value],
    async (_, __, onCleanup) => {
      let cancelled = false
      onCleanup(() => {
        cancelled = true
      })
      // Wait for the routed page and the global spotlight component to finish mounting.
      await nextTick()
      const user = currentUser.value
      const role = route.path.startsWith('/admin/') ? 'admin' : workspaceRole.value
      if (
        cancelled ||
        bootstrapError.value ||
        spotlight.active ||
        route.query.returnRun === '1' ||
        !user ||
        !isGuideRole(role) ||
        !isGuideWorkspace(role, route.path) ||
        guideVisits.hasSeen({ id: user.id, role })
      )
        return
      startUserGuide()
    },
    { immediate: true, flush: 'post' },
  )
}
