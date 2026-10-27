import { nextTick, watch } from 'vue'
import { useRoute } from 'vue-router'
import { bootstrapError, currentUser } from '@/data/demo'
import { guideVisits, isGuideRole, isGuideWorkspace } from '@/lib/guide-visit'
import { spotlight } from '@/lib/spotlight'
import { startUserGuide } from '@/lib/user-guide'

export function useFirstVisitGuide() {
  const route = useRoute()
  watch(
    () => [currentUser.value?.id, currentUser.value?.role, route.path, bootstrapError.value],
    async (_, __, onCleanup) => {
      let cancelled = false
      onCleanup(() => {
        cancelled = true
      })
      // Wait for the routed page and the global spotlight component to finish mounting.
      await nextTick()
      const user = currentUser.value
      if (
        cancelled ||
        bootstrapError.value ||
        spotlight.active ||
        !user ||
        !isGuideRole(user.role) ||
        !isGuideWorkspace(user.role, route.path) ||
        guideVisits.hasSeen({ id: user.id, role: user.role })
      )
        return
      startUserGuide()
    },
    { immediate: true, flush: 'post' },
  )
}
