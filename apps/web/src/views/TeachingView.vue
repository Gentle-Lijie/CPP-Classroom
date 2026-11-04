<script setup lang="ts">
import { Alert } from '@/components/ui/alert'
import { exerciseSourceFilename, type SourceLanguage } from '@classroom/contracts'
import LanguageSelect from '@/components/classroom/LanguageSelect.vue'
import PythonBeta from '@/components/classroom/PythonBeta.vue'
import { sourceLanguage, preferredLanguage, rememberLanguage } from '@/lib/source-language'
import { compilerLabel } from '@/lib/display'
import ThemeToggle from '@/components/classroom/ThemeToggle.vue'
import { Select, SelectOption } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Monitor,
  Users,
  Maximize,
  Minimize,
  BookOpen,
  CodeXml,
  Columns2,
  Minus,
  Plus,
  Pencil,
  Download,
  Play,
  Square,
} from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { SplitterGroup, SplitterPanel, SplitterResizeHandle } from 'reka-ui'
import MarkdownContent from '@/components/classroom/MarkdownContent.vue'
import CodeBlock from '@/components/classroom/CodeBlock.vue'
import CodeEditor from '@/components/classroom/CodeEditor.vue'
import RunOutput from '@/components/classroom/RunOutput.vue'
import {
  activeClassroom,
  counts,
  demo,
  exercises,
  notify,
  download,
  currentUser,
  executionSettings,
  type RunRecord,
} from '@/data/demo'
import { confirmAction } from '@/lib/confirm'
import { api, ApiError } from '@/lib/api'
import { openTeachingWindow } from '@/lib/teaching-windows'
const route = useRoute()
const router = useRouter()
const { t } = useI18n()
import { statusLabel } from '@/lib/status-labels'
const initial = String(route.query.exercise ?? demo.recommended)
const selected = ref(exercises.some((e) => e.id === initial) ? initial : (exercises[0]?.id ?? ''))
const language = ref<SourceLanguage>(
  route.query.language === 'python' || route.query.language === 'cpp'
    ? route.query.language
    : preferredLanguage(
        currentUser.value?.id,
        demo.classroomId,
        selected.value,
        sourceLanguage(exercises.find((e) => e.id === selected.value)),
      ),
)
const runtimeProfile = computed(() =>
  language.value === 'python' ? 'cpython3-stdlib' : executionSettings.compilerProfile,
)
const mode = ref<'problem' | 'code' | 'split'>('problem'),
  fontSize = ref(20),
  teacherCode = ref(''),
  fullscreen = ref(false)
const loading = ref(true),
  dirty = ref(false),
  error = ref(''),
  conflict = ref(false),
  saveStatus = ref(t('teaching.status.loading')),
  switching = ref(false),
  monitorBlocked = ref(false)
const viewModes = computed(
  () =>
    [
      { key: 'problem', label: t('teaching.view.problem'), icon: BookOpen },
      { key: 'code', label: t('teaching.view.code'), icon: CodeXml },
      { key: 'split', label: t('teaching.view.split'), icon: Columns2 },
    ] as const,
)
type TeachingRun = RunRecord & { interactive?: boolean }
const run = ref<TeachingRun>(),
  otherRun = ref<TeachingRun>(),
  input = ref(''),
  interactive = ref(false),
  runningRequest = ref(false),
  stopping = ref(false),
  runError = ref('')
const isActive = (record?: TeachingRun) =>
  !!record && ['queued', 'compiling', 'running'].includes(record.status)
const activeRun = computed(() => (isActive(run.value) ? run.value : otherRun.value))
const runBusy = computed(() => runningRequest.value || stopping.value || !!activeRun.value)
const exercise = computed(() => {
  const found = exercises.find((e) => e.id === selected.value)
  return found
    ? {
        ...found,
        filename: exerciseSourceFilename(found, language.value),
        title: found.title || t('teaching.untitled'),
      }
    : undefined
})
const index = computed(() => exercises.findIndex((e) => e.id === selected.value))
const readonly = computed(
  () =>
    loading.value ||
    !!error.value ||
    conflict.value ||
    activeClassroom.value.status !== 'ongoing' ||
    exercise.value?.status !== 'published',
)
const readonlyReason = computed(() => {
  if (loading.value) return t('teaching.readonlyReason.loading')
  if (error.value) return t('teaching.readonlyReason.error')
  if (conflict.value) return t('teaching.readonlyReason.conflict')
  if (activeClassroom.value.status !== 'ongoing') return t('teaching.readonlyReason.notActive')
  if (exercise.value?.status !== 'published') return t('teaching.readonlyReason.notPublished')
  return ''
})
const runBusyReason = computed(() => {
  if (runningRequest.value) return t('teaching.busyReason.creating')
  if (stopping.value) return t('teaching.busyReason.stopping')
  if (otherRun.value) return t('teaching.busyReason.otherRun')
  return t('teaching.busyReason.notFinished')
})
const switchingReason = computed(() => {
  if (loading.value) return t('teaching.switchingReason.loading')
  if (switching.value) return t('teaching.switchingReason.switching')
  return runBusyReason.value
})
let revision = 0,
  generation = 0
let timer: ReturnType<typeof setTimeout>
let saving: Promise<boolean> | undefined
let poll: ReturnType<typeof setInterval> | undefined
let polling = false
function context() {
  return {
    id: selected.value,
    language: language.value,
    classroom: demo.classroomId,
    user: currentUser.value?.id,
    generation,
  }
}
function matches(c: ReturnType<typeof context>) {
  return (
    c.id === selected.value &&
    c.language === language.value &&
    c.classroom === demo.classroomId &&
    c.user === currentUser.value?.id &&
    c.generation === generation
  )
}
const draftPath = (c: ReturnType<typeof context>) =>
  '/classes/' + c.classroom + '/workspace/' + c.id + '?language=' + c.language
const runPath = (c: ReturnType<typeof context>, suffix = '') =>
  '/classes/' + c.classroom + '/runs' + suffix
const backupKey = (c: ReturnType<typeof context>) =>
  `cpp-teacher-draft:${c.user}:${c.classroom}:${c.id}${c.language === 'cpp' ? '' : ':' + c.language}`
function backup() {
  try {
    localStorage.setItem(
      backupKey(context()),
      JSON.stringify({ code: teacherCode.value, revision, pending: dirty.value }),
    )
  } catch {
    saveStatus.value = t('teaching.status.backupUnavailable')
  }
}
async function load() {
  generation++
  const c = context()
  loading.value = true
  dirty.value = false
  error.value = ''
  conflict.value = false
  teacherCode.value = ''
  run.value = undefined
  otherRun.value = undefined
  runError.value = ''
  input.value = exercise.value?.sampleInput ?? ''
  revision = 0
  saveStatus.value = t('teaching.status.loading')
  clearTimeout(timer)
  if (!c.id) {
    loading.value = false
    return
  }
  try {
    const result = await api<{ code: string; revision: number }>(draftPath(c))
    if (!matches(c)) return
    teacherCode.value = result.code
    revision = result.revision
    try {
      const stored = JSON.parse(localStorage.getItem(backupKey(c)) ?? 'null')
      if (stored?.pending && typeof stored.code === 'string') {
        teacherCode.value = stored.code
        dirty.value = true
        conflict.value = stored.revision !== revision
      }
    } catch {
      /* Remote code remains available without local storage. */
    }
    saveStatus.value = conflict.value
      ? t('teaching.status.conflictKept')
      : dirty.value
        ? t('teaching.status.localPending')
        : t('teaching.status.synced')
    await loadRuns(c)
  } catch (e) {
    if (matches(c)) error.value = e instanceof Error ? e.message : t('teaching.status.readFailed')
  } finally {
    if (matches(c)) {
      await nextTick()
      loading.value = false
    }
  }
  if (matches(c) && dirty.value && !conflict.value) void persist()
}
async function loadRuns(c: ReturnType<typeof context>) {
  try {
    const [active, recent] = await Promise.all([
      api<TeachingRun[]>(runPath(c, '?active=true&scope=all')),
      api<{ items: TeachingRun[] }>(
        runPath(c, `?exercise=${c.id}&language=${c.language}&page=1&pageSize=1`),
      ),
    ])
    if (!matches(c)) return
    run.value =
      active.find(
        (r) =>
          r.classroomId === c.classroom &&
          r.exerciseId === c.id &&
          sourceLanguage(r) === c.language,
      ) ?? recent.items[0]
    otherRun.value = active.find(
      (r) =>
        r.classroomId !== c.classroom || r.exerciseId !== c.id || sourceLanguage(r) !== c.language,
    )
  } catch (e) {
    if (matches(c))
      runError.value = e instanceof Error ? e.message : t('teaching.status.runsReadFailed')
  }
}
watch([selected, language], () => void load(), { immediate: true })
watch(teacherCode, () => {
  if (readonly.value) return
  dirty.value = true
  saveStatus.value = t('teaching.status.pending')
  backup()
  clearTimeout(timer)
  timer = setTimeout(() => void persist(), 600)
})
async function persist(): Promise<boolean> {
  clearTimeout(timer)
  if (saving) {
    const ok = await saving
    return ok && dirty.value ? persist() : ok
  }
  if (!dirty.value) return true
  if (readonly.value) return false
  const c = context(),
    content = teacherCode.value,
    expected = revision
  saveStatus.value = t('teaching.status.syncing')
  saving = (async () => {
    try {
      const result = await api<{ revision: number }>(draftPath(c), 'PUT', {
        language: c.language,
        code: content,
        revision: expected,
      })
      if (!matches(c)) return false
      revision = result.revision
      dirty.value = teacherCode.value !== content
      saveStatus.value = dirty.value ? t('teaching.status.pending') : t('teaching.status.synced')
      backup()
      return true
    } catch (e) {
      if (!matches(c)) return false
      backup()
      saveStatus.value = e instanceof Error ? e.message : t('teaching.status.saveFailed')
      if (e instanceof ApiError && e.status === 409) conflict.value = true
      return false
    }
  })()
  const ok = await saving
  saving = undefined
  return ok && dirty.value ? persist() : ok
}
async function switchExercise(id: string, nextLanguage?: SourceLanguage) {
  if (runBusy.value) {
    notify(t('teaching.messages.stopBeforeSwitch'))
    return
  }
  if (
    switching.value ||
    loading.value ||
    (id === selected.value && (!nextLanguage || nextLanguage === language.value))
  )
    return
  switching.value = true
  try {
    if (
      dirty.value &&
      (activeClassroom.value.status !== 'ongoing' || exercise.value?.status !== 'published')
    ) {
      if (!(await confirmAction(t('teaching.messages.readonlySwitch')))) return
      download(
        t('teaching.draft.unsyncedFile', { name: exercise.value?.filename ?? 'source.cpp' }),
        teacherCode.value,
      )
    } else if (!(await persist())) {
      notify(t('teaching.draft.syncFirstSwitch'), 'error')
      return
    }
    language.value =
      nextLanguage ??
      preferredLanguage(
        currentUser.value?.id,
        demo.classroomId,
        id,
        sourceLanguage(exercises.find((e) => e.id === id)),
      )
    selected.value = id
    rememberLanguage(currentUser.value?.id, demo.classroomId, id, language.value)
  } finally {
    switching.value = false
  }
}
async function startRun() {
  if (
    runBusy.value ||
    readonly.value ||
    switching.value ||
    activeClassroom.value.settings?.allowRun === false
  )
    return
  runningRequest.value = true
  runError.value = ''
  const c = context()
  try {
    // A fresh exercise has revision 0 until its first saved snapshot.
    if (revision === 0) dirty.value = true
    if (!(await persist()) || !matches(c)) throw new Error(t('teaching.run.syncFirst'))
    const result = await api<TeachingRun>(runPath(c), 'POST', {
      exerciseId: c.id,
      language: c.language,
      revision,
      input: input.value,
      interactive: interactive.value,
    })
    if (matches(c)) run.value = result
  } catch (e) {
    if (matches(c)) {
      runError.value = e instanceof Error ? e.message : t('teaching.run.failed')
      await loadRuns(c)
    }
  } finally {
    runningRequest.value = false
  }
}
async function stopRun(): Promise<boolean> {
  const target = activeRun.value
  if (!target || stopping.value) return false
  stopping.value = true
  runError.value = ''
  const c = context()
  const path = '/classes/' + (target.classroomId ?? c.classroom) + '/runs/' + target.id
  try {
    await api(path + '/stop', 'POST', {})
    for (let attempt = 0; attempt < 30; attempt++) {
      const result = await api<TeachingRun>(path)
      if (!matches(c)) return false
      if (run.value?.id === target.id) run.value = result
      if (otherRun.value?.id === target.id) otherRun.value = isActive(result) ? result : undefined
      if (!isActive(result)) return true
      await new Promise((resolve) => setTimeout(resolve, 150))
    }
    throw new Error(t('teaching.run.stopSent'))
  } catch (e) {
    if (matches(c)) runError.value = e instanceof Error ? e.message : t('teaching.run.stopFailed')
    return false
  } finally {
    stopping.value = false
  }
}
async function sendInput(text: string): Promise<boolean> {
  if (!run.value || run.value.eof) return false
  try {
    await api(runPath(context(), '/' + run.value.id + '/input'), 'POST', { text: text + '\n' })
    return true
  } catch (e) {
    runError.value = e instanceof Error ? e.message : t('teaching.run.inputFailed')
    return false
  }
}
async function closeInput(): Promise<boolean> {
  const target = run.value
  if (!target || target.eof) return false
  try {
    await api(runPath(context(), '/' + target.id + '/input'), 'POST', { eof: true })
    if (run.value?.id === target.id) run.value = { ...run.value, eof: true }
    return true
  } catch (e) {
    runError.value = e instanceof Error ? e.message : t('teaching.run.eofFailed')
    return false
  }
}
async function pollRun() {
  const target = activeRun.value
  if (polling || loading.value || !target) return
  const c = context()
  polling = true
  try {
    const result = await api<TeachingRun>(
      '/classes/' + (target.classroomId ?? c.classroom) + '/runs/' + target.id,
    )
    if (!matches(c)) return
    if (run.value?.id === target.id) run.value = result
    if (otherRun.value?.id === target.id) otherRun.value = isActive(result) ? result : undefined
  } catch {
    // Keep the last result and retry after a temporary connection failure.
  } finally {
    polling = false
  }
}
function changeExercise(value: string | number) {
  const id = String(value)
  void switchExercise(id)
}
function next(step: number) {
  const e = exercises[index.value + step]
  if (e) void switchExercise(e.id)
}
function openMonitor() {
  monitorBlocked.value = !openTeachingWindow(
    '/teacher/monitor',
    'classroom-monitor-' + demo.classroomId,
    1120,
    820,
  )
}
async function useServer() {
  if (!(await confirmAction(t('teaching.messages.useServerConfirm')))) return
  download(
    t('teaching.draft.unsyncedFile', { name: exercise.value?.filename ?? 'source.cpp' }),
    teacherCode.value,
  )
  try {
    localStorage.removeItem(backupKey(context()))
  } catch {
    /* Download already preserves the local copy. */
  }
  await load()
}
function beforeUnload(event: BeforeUnloadEvent) {
  if (dirty.value || runBusy.value) {
    backup()
    event.preventDefault()
    event.returnValue = ''
  }
}
onBeforeRouteLeave(async (to) => {
  if (to.path === '/login' && !currentUser.value) {
    backup()
    return true
  }
  if (runningRequest.value) return false
  if (
    activeRun.value &&
    (!(await confirmAction(t('teaching.messages.leaveStop'))) || !(await stopRun()))
  )
    return false
  if (
    dirty.value &&
    (activeClassroom.value.status !== 'ongoing' || exercise.value?.status !== 'published')
  ) {
    if (!(await confirmAction(t('teaching.messages.leaveReadonly')))) return false
    download(
      t('teaching.draft.unsyncedFile', { name: exercise.value?.filename ?? 'source.cpp' }),
      teacherCode.value,
    )
    return true
  }
  const saved = await persist()
  if (!saved) notify(t('teaching.draft.syncFirstLeave'), 'error')
  return saved
})
async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen()
    else await document.documentElement.requestFullscreen()
  } catch {
    notify(t('teaching.messages.fullscreenBlocked'))
  }
}
function fullscreenChange() {
  fullscreen.value = !!document.fullscreenElement
}
function keyboard(event: KeyboardEvent) {
  const target = event.target as HTMLElement
  if (
    target.closest('.monaco-editor,input,textarea,select,[contenteditable=true],[role=separator]')
  )
    return
  if (event.key === 'ArrowRight' || event.key === 'PageDown') {
    event.preventDefault()
    next(1)
  } else if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
    event.preventDefault()
    next(-1)
  }
}
function saveShortcut(event: KeyboardEvent) {
  if (
    !(event.metaKey || event.ctrlKey) ||
    event.altKey ||
    event.shiftKey ||
    event.key.toLowerCase() !== 's'
  )
    return
  event.preventDefault()
  if (readonly.value) return
  void nextTick().then(async () => {
    if (!(await persist())) notify(t('teaching.draft.syncFirstCheck'), 'error')
  })
}
onMounted(() => {
  poll = setInterval(() => void pollRun(), 1000)
  window.addEventListener('beforeunload', beforeUnload)
  document.addEventListener('keydown', keyboard)
  window.addEventListener('keydown', saveShortcut, true)
  document.addEventListener('fullscreenchange', fullscreenChange)
})
onBeforeUnmount(() => {
  generation++
  clearTimeout(timer)
  clearInterval(poll)
  window.removeEventListener('beforeunload', beforeUnload)
  document.removeEventListener('keydown', keyboard)
  window.removeEventListener('keydown', saveShortcut, true)
  document.removeEventListener('fullscreenchange', fullscreenChange)
})
</script>
<template>
  <main v-if="exercise" class="teaching-page">
    <header class="teaching-toolbar">
      <div class="inline-items">
        <RouterLink
          to="/teacher/exercises"
          class="icon-button"
          :aria-label="t('teaching.toolbar.endTeaching')">
          <ArrowLeft :size="19" />
        </RouterLink>
        <span class="teaching-mark">
          <Monitor :size="19" />
          {{ t('teaching.toolbar.mode') }}
        </span>
        <span class="teaching-class-name">{{ activeClassroom.name }}</span>
      </div>
      <div class="teaching-slide-meta">
        <span class="inline-items">
          <span class="lesson-number">{{ String(index + 1).padStart(2, '0') }}</span>
          <span class="teaching-topic" :title="exercise.topic">{{ exercise.topic }}</span>
          <span class="status" :class="exercise.status === 'published' ? 'positive' : 'amber'">
            {{ statusLabel(exercise.status) }}
          </span>
        </span>
        <div class="inline-items">
          <span class="teaching-filename">{{ exercise.filename }}</span>
          <LanguageSelect
            :model-value="language"
            :disabled="loading || switching || runBusy || conflict"
            @update:model-value="switchExercise(selected, $event)" />
          <Button
            variant="plain"
            class="text-button"
            :aria-label="t('teaching.toolbar.editExercise')"
            @click="router.push('/teacher/exercises/' + exercise.id + '/edit')">
            <Pencil :size="13" />
            {{ t('teaching.toolbar.editExercise') }}
          </Button>
        </div>
      </div>
      <div class="teaching-view-switch" :aria-label="t('teaching.toolbar.layout')">
        <Button
          v-for="m in viewModes"
          :key="m.key"
          variant="plain"
          :class="{ selected: mode === m.key }"
          @click="mode = m.key">
          <component :is="m.icon" :size="16" />
          {{ m.label }}
        </Button>
      </div>
      <div class="teaching-pagination">
        <Button
          variant="plain"
          class="icon-button"
          :disabled="index <= 0 || loading || switching || runBusy"
          :data-disabled-reason="index <= 0 ? t('teaching.pagination.first') : switchingReason"
          :aria-label="t('teaching.pagination.prev')"
          @click="next(-1)">
          <ChevronLeft :size="20" />
        </Button>
        <Select
          :model-value="selected"
          :disabled="loading || switching || runBusy"
          :data-disabled-reason="switchingReason"
          :aria-label="t('teaching.pagination.select')"
          @update:model-value="changeExercise">
          <SelectOption v-for="(e, i) in exercises" :key="e.id" :value="e.id">
            {{ i + 1 }} / {{ exercises.length }} · {{ e.title || t('teaching.untitled') }}
          </SelectOption>
        </Select>
        <Button
          variant="plain"
          class="icon-button"
          :disabled="index === exercises.length - 1 || loading || switching || runBusy"
          :data-disabled-reason="
            index === exercises.length - 1 ? t('teaching.pagination.last') : switchingReason
          "
          :aria-label="t('teaching.pagination.next')"
          @click="next(1)">
          <ChevronRight :size="20" />
        </Button>
      </div>
      <div class="inline-items">
        <ThemeToggle />
        <Button variant="outline" @click="openMonitor">
          <Users />
          {{ t('teaching.toolbar.monitor') }}
          <span class="online-count">{{ counts.online }}</span>
        </Button>
        <Button
          variant="plain"
          class="icon-button"
          :aria-label="
            fullscreen ? t('teaching.toolbar.exitFullscreen') : t('teaching.toolbar.fullscreen')
          "
          @click="toggleFullscreen">
          <Minimize v-if="fullscreen" :size="19" />
          <Maximize v-else :size="19" />
        </Button>
      </div>
    </header>
    <div class="teaching-stage">
      <Alert v-if="monitorBlocked" type="warning">
        {{ t('teaching.alert.windowBlocked') }}
        <a href="/teacher/monitor" target="_blank" rel="noopener" class="text-button">
          {{ t('teaching.alert.openMonitor') }}
        </a>
      </Alert>
      <Alert v-if="runError" role="alert" type="error">{{ runError }}</Alert>
      <Alert v-if="otherRun" type="warning">
        {{ t('teaching.run.otherRunActive', { status: otherRun.status }) }}
        <template #actions>
          <Button
            variant="outline"
            size="sm"
            :disabled="stopping"
            :data-disabled-reason="t('teaching.busyReason.stopping')"
            @click="stopRun">
            {{ t('teaching.run.stopRun') }}
          </Button>
        </template>
      </Alert>
      <Alert v-if="error" role="alert" type="error">
        {{ error }}

        <template #actions>
          <Button variant="outline" size="sm" @click="load">
            {{ t('teaching.alert.retryRead') }}
          </Button>
        </template>
      </Alert>
      <Alert v-if="conflict" role="alert" type="warning">
        {{ t('teaching.alert.conflict') }}

        <template #actions>
          <Button variant="outline" size="sm" @click="useServer">
            {{ t('teaching.alert.useServer') }}
          </Button>
        </template>
      </Alert>

      <SplitterGroup
        :key="mode"
        as="article"
        direction="horizontal"
        :auto-save-id="'teacher-teaching-layout-' + mode"
        class="teaching-slide"
        :class="{ 'with-code': mode !== 'problem', 'teaching-split': mode === 'split' }"
        :keyboard-resize-by="2">
        <SplitterPanel
          v-if="mode !== 'code'"
          id="teaching-problem"
          as="section"
          class="teaching-problem"
          :style="{ overflow: 'auto' }"
          :default-size="mode === 'split' ? 40 : 100"
          :min-size="25">
          <div class="slide-title-row">
            <h1>{{ exercise.title }}</h1>
            <span>
              {{ compilerLabel(runtimeProfile) }}
              <PythonBeta v-if="language === 'python'" />
            </span>
          </div>
          <div class="slide-description"><MarkdownContent :source="exercise.description" /></div>
          <div class="slide-io-notes">
            <div>
              <h2>{{ t('teaching.slide.input') }}</h2>
              <MarkdownContent :source="exercise.input" />
            </div>
            <div>
              <h2>{{ t('teaching.slide.output') }}</h2>
              <MarkdownContent :source="exercise.output" />
            </div>
          </div>
          <div class="slide-samples">
            <CodeBlock
              :source="exercise.sampleInput"
              :label="t('teaching.slide.sampleInput')"
              :empty-text="t('teaching.slide.noInput')" />
            <CodeBlock :source="exercise.sampleOutput" :label="t('teaching.slide.sampleOutput')" />
          </div>
        </SplitterPanel>
        <SplitterResizeHandle
          v-if="mode === 'split'"
          class="teaching-resize-handle"
          :aria-label="t('teaching.resize.problemCode')"
          aria-orientation="vertical" />
        <SplitterPanel
          v-if="mode !== 'problem'"
          id="teaching-workspace"
          as="section"
          class="teaching-code"
          :default-size="mode === 'split' ? 60 : 100"
          :min-size="35">
          <SplitterGroup
            direction="vertical"
            auto-save-id="teacher-teaching-editor-io"
            class="teaching-editor-split"
            :keyboard-resize-by="2">
            <SplitterPanel
              id="teaching-editor"
              class="teaching-editor-panel"
              :default-size="64"
              :min-size="30">
              <div class="code-toolbar">
                <CodeXml :size="16" />
                <strong>{{ exercise.filename }}</strong>
                <span
                  class="teaching-save-status"
                  role="status"
                  :class="{ 'danger-text': conflict || error, 'amber-text': dirty }">
                  {{ loading ? t('teaching.status.loading') : saveStatus }}
                </span>
                <Button v-if="dirty && !conflict" variant="plain" size="sm" @click="persist">
                  {{ t('teaching.draft.retrySave') }}
                </Button>
                <div class="inline-items ml-auto">
                  <Button
                    variant="plain"
                    class="icon-button"
                    :aria-label="t('teaching.font.zoomOut')"
                    :disabled="fontSize <= 14"
                    :data-disabled-reason="t('teaching.font.min', { size: 14 })"
                    @click="fontSize -= 2">
                    <Minus :size="15" />
                  </Button>
                  <span>{{ fontSize }} px</span>
                  <Button
                    variant="plain"
                    class="icon-button"
                    :aria-label="t('teaching.font.zoomIn')"
                    :disabled="fontSize >= 34"
                    :data-disabled-reason="t('teaching.font.max', { size: 34 })"
                    @click="fontSize += 2">
                    <Plus :size="15" />
                  </Button>
                  <Button
                    variant="plain"
                    class="icon-button"
                    :aria-label="t('teaching.download.code')"
                    @click="download(exercise.filename, teacherCode)">
                    <Download :size="15" />
                  </Button>
                </div>
                <div class="teaching-run-action">
                  <Button
                    v-if="activeRun"
                    variant="outline"
                    size="sm"
                    :disabled="stopping"
                    :data-disabled-reason="t('teaching.busyReason.stopping')"
                    @click="stopRun">
                    <Square :size="14" />
                    {{ stopping ? t('teaching.run.stopping') : t('teaching.run.stop') }}
                  </Button>
                  <Button
                    v-else
                    size="sm"
                    :disabled="
                      readonly ||
                      switching ||
                      runningRequest ||
                      activeClassroom.settings?.allowRun === false
                    "
                    :data-disabled-reason="
                      readonly
                        ? readonlyReason
                        : switching
                          ? t('teaching.switchingReason.switching')
                          : runningRequest
                            ? t('teaching.busyReason.creating')
                            : t('teaching.run.disabled')
                    "
                    @click="startRun">
                    <Play :size="14" />
                    {{ runningRequest ? t('teaching.run.submitting') : t('teaching.run.label') }}
                  </Button>
                </div>
              </div>
              <CodeEditor
                v-model="teacherCode"
                :language="language"
                :readonly="readonly"
                :font-size="fontSize"
                :filename="exercise.filename" />
            </SplitterPanel>
            <SplitterResizeHandle
              class="teaching-resize-handle"
              :aria-label="t('teaching.resize.codeIo')"
              aria-orientation="horizontal" />
            <SplitterPanel
              id="teaching-io"
              class="teaching-run-panel"
              :default-size="36"
              :min-size="25">
              <SplitterGroup
                direction="horizontal"
                auto-save-id="teacher-teaching-input-output"
                class="teaching-io-split"
                :keyboard-resize-by="2">
                <SplitterPanel
                  id="teaching-input"
                  as="section"
                  class="teaching-input"
                  :default-size="30"
                  :min-size="20"
                  :max-size="65">
                  <div class="code-toolbar teaching-input-toolbar">
                    <label for="teaching-stdin">{{ t('teaching.input.stdin') }}</label>
                    <Button
                      variant="plain"
                      size="sm"
                      class="ml-auto"
                      :disabled="runBusy"
                      :data-disabled-reason="runBusyReason"
                      @click="input = exercise.sampleInput">
                      {{ t('teaching.input.fillSample') }}
                    </Button>
                  </div>
                  <Textarea
                    id="teaching-stdin"
                    v-model="input"
                    :disabled="runBusy"
                    :data-disabled-reason="runBusyReason"
                    :maxlength="65536"
                    :placeholder="t('teaching.input.placeholder')" />
                  <label class="teaching-interactive">
                    <Checkbox
                      v-model="interactive"
                      :disabled="runBusy"
                      :data-disabled-reason="runBusyReason" />
                    {{ t('teaching.input.interactive') }}
                  </label>
                </SplitterPanel>
                <SplitterResizeHandle
                  class="teaching-resize-handle"
                  :aria-label="t('teaching.resize.inputOutput')"
                  aria-orientation="vertical" />
                <SplitterPanel
                  id="teaching-output"
                  class="teaching-output"
                  :default-size="70"
                  :min-size="35">
                  <RunOutput
                    :run="run"
                    :language="language"
                    :interactive="run?.status === 'running' && run.interactive"
                    :send-input="sendInput"
                    :close-input="closeInput" />
                </SplitterPanel>
              </SplitterGroup>
            </SplitterPanel>
          </SplitterGroup>
        </SplitterPanel>
      </SplitterGroup>
    </div>
  </main>
  <div v-else class="empty-state">
    <BookOpen :size="32" />
    <h1>{{ t('teaching.empty.noExercises') }}</h1>
    <RouterLink to="/teacher/exercises/new">{{ t('teaching.empty.createFirst') }}</RouterLink>
  </div>
</template>

<style scoped>
.teaching-page {
  height: 100dvh;
  min-height: 0;
  overflow: hidden;
}
.teaching-toolbar {
  display: flex;
  flex-wrap: nowrap;
  flex-shrink: 0;
  gap: 10px;
}
.teaching-toolbar > .inline-items {
  flex-wrap: nowrap;
  flex-shrink: 0;
}
.teaching-class-name {
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.teaching-slide-meta {
  flex: 1;
  flex-wrap: nowrap;
  margin: 0;
  gap: 10px;
}
.teaching-slide-meta > .inline-items {
  flex-wrap: nowrap;
  white-space: nowrap;
}
.teaching-slide-meta > .inline-items:first-child {
  overflow: hidden;
}
.teaching-slide-meta .lesson-number,
.teaching-slide-meta .status,
.teaching-slide-meta > .inline-items:last-child {
  flex-shrink: 0;
}
.teaching-topic,
.teaching-filename {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.teaching-filename {
  max-width: 100px;
}
.teaching-stage {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 10px;
  width: 100%;
  max-width: none;
  min-height: 0;
  margin: 0;
  padding: 0;
}
.teaching-slide {
  flex: 1;
  height: auto;
  min-height: 0;
  border: 0;
  border-radius: 0;
}
.teaching-view-switch,
.teaching-pagination {
  flex-shrink: 0;
}
.teaching-view-switch button {
  padding: 6px 9px;
  gap: 6px;
}
.teaching-pagination {
  gap: 4px;
}
.teaching-pagination :deep(.ui-select-trigger) {
  width: 200px;
}
@media (max-width: 1600px) {
  .teaching-class-name {
    max-width: 90px;
    margin-left: 0;
    padding-left: 10px;
  }
  .teaching-slide-meta > .inline-items:last-child {
    display: flex;
  }
  .teaching-slide-meta .teaching-filename {
    display: none;
  }
  .teaching-slide-meta .text-button {
    font-size: 0;
    gap: 0;
  }
  .teaching-pagination :deep(.ui-select-trigger) {
    width: 170px;
  }
}
.teaching-save-status {
  color: var(--ui-muted);
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.teaching-split .teaching-problem {
  width: auto;
  border-right: 0;
}
.teaching-editor-split,
.teaching-editor-panel,
.teaching-run-panel,
.teaching-io-split,
.teaching-input,
.teaching-output {
  min-width: 0;
  min-height: 0;
}
.teaching-editor-panel,
.teaching-input {
  display: flex;
  flex-direction: column;
}
.teaching-editor-panel > .code-toolbar {
  flex-shrink: 0;
  flex-wrap: wrap;
  height: auto;
  gap: 8px;
  padding: 6px 12px;
}
.teaching-save-status {
  max-width: 180px;
}
.teaching-run-action {
  display: flex;
  flex-shrink: 0;
}
.teaching-input-toolbar {
  flex-shrink: 0;
  flex-wrap: wrap;
  height: auto;
  min-height: 47px;
  padding: 4px 12px;
  font-size: 14px;
}
.teaching-input > textarea {
  flex: 1;
  min-height: 0;
  width: 100%;
  padding: 12px;
  border: 0;
  border-radius: 0;
  resize: none;
  font-family: var(--font-mono);
}
.teaching-interactive {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  gap: 6px;
  padding: 10px 12px;
  border-top: 1px solid var(--ui-line);
  font-size: 14px;
}
.teaching-resize-handle {
  position: relative;
  flex-shrink: 0;
  background: var(--ui-surface);
  border: 1px solid var(--ui-line);
  touch-action: none;
}
.teaching-resize-handle[data-orientation='horizontal'] {
  width: 7px;
  cursor: col-resize;
}
.teaching-resize-handle[data-orientation='vertical'] {
  height: 7px;
  cursor: row-resize;
}
.teaching-resize-handle::after {
  content: '';
  position: absolute;
  inset: calc(50% - 18px) 2px;
  background: var(--ui-line-strong);
  border-radius: 3px;
}
.teaching-resize-handle[data-orientation='vertical']::after {
  inset: 2px calc(50% - 18px);
}
.teaching-resize-handle:hover,
.teaching-resize-handle[data-state='drag'],
.teaching-resize-handle:focus-visible {
  background: var(--ui-selection);
  outline: none;
}
.teaching-resize-handle:hover::after,
.teaching-resize-handle[data-state='drag']::after,
.teaching-resize-handle:focus-visible::after {
  background: var(--ui-action);
}
.teaching-output :deep(.run-output) {
  height: 100%;
  min-height: 0;
}
.teaching-run-panel :deep(.output-placeholder) {
  min-height: 0;
  padding: 12px;
}
.teaching-run-panel :deep(.output-placeholder > svg) {
  display: none;
}
.teaching-run-panel :deep(.output-body) {
  padding: 10px 16px;
}
.teaching-run-panel :deep(.output-body pre) {
  margin: 6px 0;
}
</style>
