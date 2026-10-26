import { computed, reactive, watch } from 'vue'
import type { GuideChapter, GuideRole } from './guide-catalog'

export const spotlight = reactive({
  active: false,
  role: 'student' as GuideRole,
  chapters: [] as GuideChapter[],
  index: 0,
  surface: '',
})
export const studentGuideActive = computed(() => spotlight.active && spotlight.role === 'student')

export function startGuide(role: GuideRole, chapters: GuideChapter[]) {
  if (!chapters.length) return
  spotlight.role = role
  spotlight.chapters = chapters
  spotlight.index = 0
  spotlight.surface = ''
  spotlight.active = true
}
export function stopGuide() {
  spotlight.active = false
  spotlight.surface = ''
}

// Surfaces only open local UI (tabs, dialogs, popovers). Each restores its previous state.
export function useGuideSurfaces(surfaces: Record<string, () => () => void>) {
  watch(
    () => (spotlight.active ? spotlight.surface : ''),
    (surface, _, onCleanup) => {
      const enter = surfaces[surface]
      if (enter) onCleanup(enter())
    },
    { immediate: true },
  )
}
