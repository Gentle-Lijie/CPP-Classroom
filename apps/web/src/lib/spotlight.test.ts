import { afterEach, describe, expect, it } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import { chapterAvailable, guideCatalog } from './guide-catalog'
import { spotlight, startGuide, stopGuide, useGuideSurfaces } from './spotlight'

afterEach(async () => {
  stopGuide()
  await nextTick()
})

describe('role guide access', () => {
  it('keeps each role on its own routes and shared guide surfaces', () => {
    for (const [role, chapters] of Object.entries(guideCatalog)) {
      expect(new Set(chapters.map((chapter) => chapter.id)).size).toBe(chapters.length)
      for (const chapter of chapters) {
        expect(
          chapter.path.startsWith(`/${role}/`) || (role === 'student' && chapter.path === '/join'),
        ).toBe(true)
        expect(chapter.steps.length).toBeGreaterThan(0)
      }
    }
  })
  it('makes every student demo available without a real classroom or exercise', () => {
    expect(guideCatalog.student.every((chapter) => chapterAvailable(chapter, false, false))).toBe(
      true,
    )
    expect(
      guideCatalog.student.flatMap((chapter) => chapter.steps).every((step) => !!step.scene),
    ).toBe(true)
  })
})

describe('temporary guide surfaces', () => {
  it('restores tabs and closes guide-opened dialogs on navigation and exit', async () => {
    const panel = ref('题目'),
      dialog = ref(false)
    const scope = effectScope()
    scope.run(() =>
      useGuideSurfaces({
        history: () => {
          const before = panel.value
          panel.value = '历史'
          return () => {
            panel.value = before
          }
        },
        help: () => {
          const before = dialog.value
          dialog.value = true
          return () => {
            dialog.value = before
          }
        },
      }),
    )
    startGuide('student', guideCatalog.student)
    spotlight.surface = 'history'
    await nextTick()
    expect(panel.value).toBe('历史')
    spotlight.surface = 'help'
    await nextTick()
    expect(panel.value).toBe('题目')
    expect(dialog.value).toBe(true)
    stopGuide()
    await nextTick()
    expect(dialog.value).toBe(false)
    scope.stop()
  })
  it('preserves a surface that was already open, including component unmount', async () => {
    const dialog = ref(true)
    const scope = effectScope()
    scope.run(() =>
      useGuideSurfaces({
        help: () => {
          const before = dialog.value
          dialog.value = true
          return () => {
            dialog.value = before
          }
        },
      }),
    )
    startGuide('student', guideCatalog.student)
    spotlight.surface = 'help'
    await nextTick()
    scope.stop()
    expect(dialog.value).toBe(true)
    stopGuide()
    expect(spotlight.surface).toBe('')
  })
})
