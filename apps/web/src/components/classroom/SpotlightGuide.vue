<script setup lang="ts">
import { Alert } from '@/components/ui/alert'
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, ArrowRight, List, ScanLine, X } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { currentUser } from '@/data/demo'
import { spotlight, stopGuide } from '@/lib/spotlight'
import StudentGuideWorkspace from './StudentGuideWorkspace.vue'
import { roleLabels } from '@/lib/guide-catalog'

const router = useRouter()
const route = useRoute()
const steps = computed(() =>
  spotlight.chapters.flatMap((chapter) => chapter.steps.map((step) => ({ ...step, chapter }))),
)
const current = computed(() => steps.value[spotlight.index])
const loading = ref(false)
const message = ref('')
const fallback = ref(false)
const contents = ref(false)
const card = ref<HTMLElement>()
const bounds = ref<{ x: number; y: number; width: number; height: number }>()
const viewport = ref({ width: window.innerWidth, height: window.innerHeight })
const position = ref({ left: '24px', top: '24px' })
let target: HTMLElement | undefined
let generation = 0
let frame = 0
let previousFocus: HTMLElement | null = null
let expectedPath = ''
let observer: ResizeObserver | undefined
let mutation: MutationObserver | undefined
let appWasInert = false
const mockStudent = computed(() => spotlight.role === 'student' && !!current.value?.scene)
const inputShield = computed(() => {
  const b = bounds.value
  const outer = `M0,0 H${viewport.value.width} V${viewport.value.height} H0 Z`
  return !b ? outer : `${outer} M${b.x},${b.y} H${b.x + b.width} V${b.y + b.height} H${b.x} Z`
})

function visible(selector?: string) {
  if (!selector) return undefined
  return Array.from(document.querySelectorAll<HTMLElement>(selector)).find((el) => {
    const rect = el.getBoundingClientRect()
    return rect.width > 0 && rect.height > 0 && getComputedStyle(el).visibility !== 'hidden'
  })
}
function measure() {
  viewport.value = { width: window.innerWidth, height: window.innerHeight }
  const width = window.innerWidth,
    height = window.innerHeight
  let rect = target?.isConnected ? target.getBoundingClientRect() : undefined
  if (rect && target) {
    for (const child of target.querySelectorAll<HTMLElement>('[data-spotlight-extent]')) {
      const extra = child.getBoundingClientRect()
      const x = Math.min(rect.left, extra.left),
        y = Math.min(rect.top, extra.top)
      rect = new DOMRect(
        x,
        y,
        Math.max(rect.right, extra.right) - x,
        Math.max(rect.bottom, extra.bottom) - y,
      )
    }
  }
  bounds.value =
    rect && rect.right > 0 && rect.bottom > 0 && rect.left < width && rect.top < height
      ? {
          x: Math.max(6, rect.left - 6),
          y: Math.max(6, rect.top - 6),
          width: Math.max(0, Math.min(width - 6, rect.right + 6) - Math.max(6, rect.left - 6)),
          height: Math.max(0, Math.min(height - 6, rect.bottom + 6) - Math.max(6, rect.top - 6)),
        }
      : undefined
  const w = card.value?.offsetWidth ?? 400,
    h = card.value?.offsetHeight ?? 330
  const b = bounds.value
  let left = (width - w) / 2,
    top = (height - h) / 2
  if (b) {
    const candidates = [
      { left: b.x + b.width + 20, top: b.y, fits: width - b.x - b.width >= w + 36 },
      { left: b.x - w - 20, top: b.y, fits: b.x >= w + 36 },
      {
        left: b.x + (b.width - w) / 2,
        top: b.y + b.height + 20,
        fits: height - b.y - b.height >= h + 36,
      },
      { left: b.x + (b.width - w) / 2, top: b.y - h - 20, fits: b.y >= h + 36 },
    ]
    const fit = candidates.find((candidate) => candidate.fits)
    if (fit) ({ left, top } = fit)
    else {
      left = width - w - 24
      top = height - h - 24
    }
  }
  position.value = {
    left: `${Math.max(16, Math.min(left, width - w - 16))}px`,
    top: `${Math.max(16, Math.min(top, height - h - 16))}px`,
  }
}
function scheduleMeasure() {
  cancelAnimationFrame(frame)
  frame = requestAnimationFrame(measure)
}
function resolveTarget() {
  if (loading.value || !current.value) return
  const found = visible(current.value.target)
  fallback.value = !found
  target = found ?? visible(current.value.fallback)
  measure()
}
async function locate() {
  const token = ++generation
  const value = current.value
  if (!spotlight.active || !value) return
  loading.value = true
  message.value = ''
  target = undefined
  bounds.value = undefined
  try {
    expectedPath = mockStudent.value ? route.path : value.chapter.path
    if (route.path !== expectedPath) {
      spotlight.surface = ''
      const failure = await router.push(expectedPath)
      if (token !== generation) return
      if (failure || route.path !== expectedPath) {
        message.value = '当前页面暂时无法进入。请先处理未保存内容，或退出导览后选择可用章节。'
        return
      }
    }
    // Keep a surface open across adjacent steps, restoring its state only when leaving it.
    spotlight.surface = value.surface ?? ''
    await nextTick()
    // Async lists and teleported popovers may need a few frames to mount.
    for (let attempt = 0; attempt < 12; attempt++) {
      if (token !== generation || !spotlight.active) return
      if (visible(value.target)) break
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    if (token !== generation) return
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    )
    if (token !== generation || !spotlight.active) return
    target = visible(value.target)
    fallback.value = !target
    target ??= visible(value.fallback)
    target?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' })
    await nextTick()
  } catch {
    if (token === generation) message.value = '页面读取失败，请检查连接后重试此步骤。'
  } finally {
    if (token === generation && spotlight.active) {
      loading.value = false
      await nextTick()
      measure()
      card.value?.focus({ preventScroll: true })
    }
  }
}
function move(delta: number) {
  if (loading.value) return
  contents.value = false
  const next = spotlight.index + delta
  if (next >= steps.value.length) {
    finish()
    return
  }
  spotlight.index = Math.max(0, next)
}
function jump(id: string) {
  if (loading.value) return
  const index = steps.value.findIndex((step) => step.chapter.id === id)
  if (index >= 0) spotlight.index = index
  contents.value = false
}
function finish() {
  stopGuide()
}
function keyboard(event: KeyboardEvent) {
  if (!spotlight.active) return
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopImmediatePropagation()
    finish()
    return
  }
  if (event.key === 'Tab') {
    const selector = 'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), [href]'
    const focusable = [
      ...(mockStudent.value && current.value?.interactive
        ? Array.from(target?.querySelectorAll<HTMLElement>(selector) ?? [])
        : []),
      ...Array.from(card.value?.querySelectorAll<HTMLElement>(selector) ?? []),
    ].filter((el) => el.getBoundingClientRect().width > 0)
    const index = focusable.indexOf(document.activeElement as HTMLElement)
    const next = event.shiftKey
      ? index <= 0
        ? focusable.length - 1
        : index - 1
      : (index + 1) % focusable.length
    event.preventDefault()
    focusable[next]?.focus()
  }
  if ((event.target as HTMLElement)?.closest('input, textarea, [contenteditable=true]')) return
  if (event.key === 'ArrowRight') {
    event.preventDefault()
    move(1)
  }
  if (event.key === 'ArrowLeft') {
    event.preventDefault()
    move(-1)
  }
}
watch(
  () => [spotlight.active, spotlight.index],
  async () => {
    if (spotlight.active) await locate()
  },
)
watch(
  () => spotlight.active,
  (active) => {
    if (active) {
      previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
      const app = document.getElementById('app')
      if (mockStudent.value && app) {
        appWasInert = app.inert
        app.inert = true
      }
      document.addEventListener('keydown', keyboard, true)
      window.addEventListener('resize', scheduleMeasure)
      window.addEventListener('scroll', scheduleMeasure, true)
      observer = new ResizeObserver(scheduleMeasure)
      if (card.value) observer.observe(card.value)
      mutation = new MutationObserver((records) => {
        if (
          records.some(
            (record) =>
              record.target instanceof Element &&
              !record.target.closest('.spotlight-card, .spotlight-shade'),
          )
        ) {
          cancelAnimationFrame(frame)
          frame = requestAnimationFrame(resolveTarget)
        }
      })
      mutation.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['style', 'class', 'hidden', 'data-state'],
      })
      void nextTick(() => {
        if (card.value) observer?.observe(card.value)
      })
    } else {
      cleanup()
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true })
    }
  },
)
watch(
  () => currentUser.value?.id,
  () => stopGuide(),
)
watch(
  () => route.path,
  (path) => {
    if (spotlight.active && !loading.value && path !== expectedPath) stopGuide()
  },
)
watch(contents, async () => {
  await nextTick()
  measure()
})
function cleanup() {
  const app = document.getElementById('app')
  if (app && mockStudent.value) app.inert = appWasInert
  generation++
  loading.value = false
  contents.value = false
  observer?.disconnect()
  mutation?.disconnect()
  cancelAnimationFrame(frame)
  document.removeEventListener('keydown', keyboard, true)
  window.removeEventListener('resize', scheduleMeasure)
  window.removeEventListener('scroll', scheduleMeasure, true)
}
onBeforeUnmount(() => {
  cleanup()
  stopGuide()
})
</script>
<template>
  <Teleport to="body">
    <div
      v-if="spotlight.active && current"
      class="spotlight-guide"
      data-guide-overlay
      :role="mockStudent ? 'dialog' : undefined"
      :aria-modal="mockStudent ? true : undefined"
      :aria-labelledby="mockStudent ? 'spotlight-title' : undefined">
      <StudentGuideWorkspace v-if="mockStudent && current.scene" :scene="current.scene" />
      <svg
        class="spotlight-shade"
        :viewBox="`0 0 ${viewport.width} ${viewport.height}`"
        preserveAspectRatio="none"
        aria-hidden="true">
        <defs>
          <mask id="classroom-spotlight-mask">
            <rect width="100%" height="100%" fill="white" />
            <rect
              v-if="bounds"
              :x="bounds.x"
              :y="bounds.y"
              :width="bounds.width"
              :height="bounds.height"
              rx="8"
              fill="black" />
          </mask>
        </defs>
        <rect
          width="100%"
          height="100%"
          fill="rgba(7, 12, 24, .68)"
          mask="url(#classroom-spotlight-mask)" />
        <rect
          v-if="bounds"
          :x="bounds.x"
          :y="bounds.y"
          :width="bounds.width"
          :height="bounds.height"
          rx="8"
          fill="none"
          stroke="var(--ui-action)"
          stroke-width="2" />
        <path
          v-if="mockStudent && current.interactive && !loading"
          :d="inputShield"
          fill="transparent"
          fill-rule="evenodd"
          pointer-events="all" />
        <rect v-else width="100%" height="100%" fill="transparent" pointer-events="all" />
      </svg>
      <section
        ref="card"
        class="spotlight-card"
        :style="position"
        :role="mockStudent ? 'region' : 'dialog'"
        :aria-modal="mockStudent ? undefined : true"
        aria-labelledby="spotlight-title"
        aria-describedby="spotlight-description"
        :aria-busy="loading"
        tabindex="-1">
        <div class="spotlight-topline">
          <span>
            <ScanLine :size="16" />
            {{ roleLabels[spotlight.role] }}导览 · {{ current.chapter.title }}
          </span>
          <Button variant="plain" size="icon-sm" aria-label="退出导览" @click="finish">
            <X :size="17" />
          </Button>
        </div>
        <div
          class="spotlight-progress"
          role="progressbar"
          :aria-valuenow="spotlight.index + 1"
          :aria-valuemin="1"
          :aria-valuemax="steps.length"
          aria-label="导览进度">
          <i :style="{ width: `${((spotlight.index + 1) / steps.length) * 100}%` }" />
        </div>
        <div class="spotlight-copy" aria-live="polite" aria-atomic="true">
          <span class="spotlight-counter">
            {{ String(spotlight.index + 1).padStart(2, '0') }} / {{ steps.length }}
          </span>
          <h2 id="spotlight-title">{{ loading ? '正在定位…' : current.title }}</h2>
          <p id="spotlight-description">{{ current.description }}</p>
          <Alert v-if="message" role="alert" type="warning">{{ message }}</Alert>
          <Alert v-else-if="!loading && fallback" type="info">
            {{
              current.condition ?? '当前页面暂无此功能区域；数据加载完成或满足使用条件后可查看。'
            }}
          </Alert>
        </div>
        <div v-if="contents" class="spotlight-contents" aria-label="导览章节">
          <Button
            v-for="chapter in spotlight.chapters"
            :key="chapter.id"
            variant="plain"
            :aria-current="chapter.id === current.chapter.id ? 'step' : undefined"
            :disabled="loading"
            @click="jump(chapter.id)">
            {{ chapter.title }}
            <span>{{ chapter.steps.length }} 步</span>
          </Button>
        </div>
        <div class="spotlight-controls">
          <Button
            variant="plain"
            size="sm"
            :aria-expanded="contents"
            :disabled="loading"
            @click="contents = !contents">
            <List :size="15" />
            目录
          </Button>
          <span class="ml-auto" />
          <Button
            variant="outline"
            size="sm"
            :disabled="loading || spotlight.index === 0"
            @click="move(-1)">
            <ArrowLeft :size="14" />
            上一步
          </Button>
          <Button v-if="message" size="sm" :disabled="loading" @click="locate">重试定位</Button>
          <Button v-else size="sm" :disabled="loading" @click="move(1)">
            {{ spotlight.index === steps.length - 1 ? '完成导览' : '下一步' }}
            <ArrowRight :size="14" />
          </Button>
        </div>
        <p class="spotlight-keyboard">
          {{
            mockStudent
              ? current.interactive
                ? '可操作聚光区域 · 全部为模拟数据 · Esc 退出'
                : '模拟数据演示 · ← → 切换 · Esc 退出'
              : 'Esc 退出 · ← → 切换 · 导览不会自动执行功能操作'
          }}
        </p>
      </section>
    </div>
  </Teleport>
</template>
<style scoped>
.spotlight-guide {
  position: fixed;
  inset: 0;
  z-index: 10000;
  isolation: isolate;
  pointer-events: none;
}
.spotlight-shade {
  pointer-events: none;
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
.spotlight-card {
  pointer-events: auto;
  position: absolute;
  width: 410px;
  max-height: calc(100dvh - 32px);
  overflow: auto;
  border: 1px solid var(--ui-line-strong);
  border-radius: 12px;
  background: var(--ui-page);
  color: var(--ui-ink);
  box-shadow: 0 20px 70px rgb(0 0 0 / 28%);
  outline: none;
}
.spotlight-topline {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 12px 14px 12px 20px;
}
.spotlight-topline > span {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--ui-secondary);
}
.spotlight-topline svg {
  color: var(--ui-action);
}
.spotlight-progress {
  height: 3px;
  background: var(--ui-line);
}
.spotlight-progress i {
  display: block;
  height: 100%;
  background: var(--ui-action);
  transition: width 0.18s;
}
.spotlight-copy {
  padding: 20px 22px 12px;
}
.spotlight-counter {
  color: var(--ui-muted);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
.spotlight-copy h2 {
  font-size: 20px;
  font-weight: 650;
  margin: 6px 0 10px;
  line-height: 1.5;
}
.spotlight-copy p {
  font-size: 14px;
  line-height: 1.85;
  color: var(--ui-secondary);
}
.spotlight-controls :deep(button) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}
.spotlight-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 18px;
}
.spotlight-keyboard {
  text-align: center;
  padding: 10px 16px;
  border-top: 1px solid var(--ui-line);
  font-size: 12px;
  color: var(--ui-muted);
}
.spotlight-contents {
  max-height: 235px;
  overflow: auto;
  margin: 0 20px;
  border: 1px solid var(--ui-line);
  border-radius: 6px;
}
.spotlight-contents button {
  display: flex;
  justify-content: space-between;
  width: 100%;
  padding: 9px 12px;
  font-size: 13px;
}
.spotlight-contents button[aria-current='step'] {
  background: var(--ui-selection);
  color: var(--ui-action);
}
.spotlight-contents span {
  color: var(--ui-muted);
}
@media (prefers-reduced-motion: reduce) {
  .spotlight-progress i {
    transition: none;
  }
}
</style>
