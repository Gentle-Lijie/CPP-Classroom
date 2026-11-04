<script setup lang="ts">
import { useActionFeedback } from '@/composables/useActionFeedback'
import {
  exerciseSourceFilename,
  exerciseStarterCode,
  type SourceLanguage,
} from '@classroom/contracts'
import LanguageSelect from '@/components/classroom/LanguageSelect.vue'
import PythonBeta from '@/components/classroom/PythonBeta.vue'
import { sourceLanguage, preferredLanguage, rememberLanguage } from '@/lib/source-language'
import { Alert } from '@/components/ui/alert'
import ThemeToggle from '@/components/classroom/ThemeToggle.vue'
import { Select, SelectOption } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Form } from '@/components/ui/form'
import { useI18n } from 'vue-i18n'
import { computed, onBeforeUnmount, ref, watch, nextTick } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import {
  ArrowLeft,
  Play,
  Square,
  CloudCheck,
  Download,
  RotateCcw,
  Hand,
  Send,
  BookOpen,
  History,
  CodeXml,
  Check,
  Settings2,
  WifiOff,
  HelpCircle,
} from '@lucide/vue'
import { SplitterGroup, SplitterPanel, SplitterResizeHandle } from 'reka-ui'
import { Button } from '@/components/ui/button'
import Modal from '@/components/classroom/Modal.vue'
import CodeEditor from '@/components/classroom/CodeEditor.vue'
import RunOutput from '@/components/classroom/RunOutput.vue'
import MarkdownContent from '@/components/classroom/MarkdownContent.vue'
import CodeBlock from '@/components/classroom/CodeBlock.vue'
import LocalDirectoryPanel from '@/components/classroom/LocalDirectoryPanel.vue'
import Pagination from '@/components/classroom/Pagination.vue'
import { compilerLabel } from '@/lib/display'
import {
  exercises,
  executionSettings,
  activeClassroom,
  notify,
  demo,
  download,
  classPath,
  reportError,
  draftStorageKey,
  currentUser,
  selectClass,
  classrooms,
  type RunRecord,
} from '@/data/demo'
import { confirmAction } from '@/lib/confirm'
import { api, ApiError } from '@/lib/api'
import { studentGuideActive, useGuideSurfaces } from '@/lib/spotlight'
import { startUserGuide } from '@/lib/user-guide'
const route = useRoute(),
  router = useRouter()
const { t, locale } = useI18n()
import { statusLabel } from '@/lib/status-labels'
const formatTime = (value: string | number | Date, hour12 = false) =>
  new Date(value).toLocaleString(locale.value === 'en' ? 'en-US' : 'zh-CN', { hour12 })
const initial = String(route.query.exercise ?? demo.recommended ?? '')
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
const displayLanguage = computed(() =>
  viewing.value ? sourceLanguage(viewing.value) : language.value,
)
const runtimeProfile = computed(() =>
  language.value === 'python' ? 'cpython3-stdlib' : executionSettings.compilerProfile,
)
const exercise = computed(() => {
  const found = exercises.find((e) => e.id === selected.value)
  return found
    ? {
        ...found,
        filename: exerciseSourceFilename(found, language.value),
        title: found.title || t('workspace.untitled'),
      }
    : undefined
})
const code = ref(''),
  input = ref(''),
  panel = ref('题目'),
  helpText = ref(''),
  fontSize = ref(16)
const help = ref(false),
  submit = ref(false),
  submitted = ref(false),
  reset = ref(false)
useGuideSurfaces({
  'workspace-problem': () => {
    const previous = panel.value
    panel.value = '题目'
    return () => {
      panel.value = previous
    }
  },
  'workspace-history': () => {
    const previous = panel.value
    panel.value = '历史'
    return () => {
      panel.value = previous
    }
  },
  'workspace-help': () => {
    const previous = help.value
    help.value = true
    return () => {
      help.value = previous
    }
  },
  'workspace-submit': () => {
    const previous = submit.value
    submit.value = true
    return () => {
      submit.value = previous
    }
  },
  'workspace-reset': () => {
    const previous = reset.value
    reset.value = true
    return () => {
      reset.value = previous
    }
  },
})
const helpSent = ref(false),
  submittedAt = ref(''),
  undo = ref<string>()
const otherRun = ref<RunRecord & { classroomId?: string }>()
const run = ref<RunRecord>(),
  viewing = ref<RunRecord>(),
  history = ref<RunRecord[]>([])
const historyPage = ref(1),
  historySize = ref(10),
  historyTotal = ref(0),
  historyError = ref('')
const saveState = ref('loading'),
  loadError = ref(''),
  actionError = ref('')
// 保存状态以 locale 键存储，错误态通过键集合判断，避免依赖译文文本
const saveErrorStates = new Set(['backupUnavailable', 'networkError', 'disconnected'])
const saveError = computed(
  () => conflict.value || !!loadError.value || saveErrorStates.has(saveState.value),
)
const revision = ref(0),
  conflict = ref(false),
  loading = ref(true),
  dirty = ref(false)
const runningRequest = ref(false),
  submitting = ref(false),
  helping = ref(false),
  stopping = ref(false)
function openHelp() {
  actionError.value = ''
  help.value = true
}
function openSubmit() {
  actionError.value = ''
  submit.value = true
}
const pendingExercise = ref(''),
  switching = ref(false)
const directoryPanel = ref<InstanceType<typeof LocalDirectoryPanel>>()
const isArchived = computed(
  () => activeClassroom.value.status !== 'ongoing' || exercise.value?.status !== 'published',
)
const readonly = computed(
  () =>
    loading.value ||
    !!loadError.value ||
    !!viewing.value ||
    isArchived.value ||
    conflict.value ||
    switching.value,
)
const readonlyReason = computed(() => {
  if (loading.value) return t('workspace.reasons.loading')
  if (loadError.value) return t('workspace.reasons.loadFailed')
  if (viewing.value) return t('workspace.reasons.viewing')
  if (activeClassroom.value.status !== 'ongoing') return t('workspace.reasons.classNotActive')
  if (exercise.value?.status !== 'published') return t('workspace.reasons.notPublished')
  if (conflict.value) return t('workspace.reasons.conflict')
  if (switching.value) return t('workspace.reasons.switching')
  return ''
})
const runtime = computed(() => run.value?.status === 'running')
const active = () => !!run.value && ['queued', 'compiling', 'running'].includes(run.value.status)
let generation = 0,
  saving: Promise<boolean> | undefined
let saveTimer: ReturnType<typeof setTimeout>
let polling = false,
  historyGeneration = 0
const context = () => ({
  classroom: demo.classroomId,
  exercise: selected.value,
  language: language.value,
  user: currentUser.value?.id,
  generation,
})
const matches = (c: ReturnType<typeof context>) =>
  c.classroom === demo.classroomId &&
  c.exercise === selected.value &&
  c.language === language.value &&
  c.user === currentUser.value?.id &&
  c.generation === generation
const path = (c: ReturnType<typeof context>, suffix: string) => '/classes/' + c.classroom + suffix
function backup() {
  if (!selected.value || !currentUser.value) return
  try {
    localStorage.setItem(
      draftStorageKey(selected.value, currentUser.value?.id, language.value),
      JSON.stringify({ code: code.value, revision: revision.value, pending: dirty.value }),
    )
  } catch {
    saveState.value = 'backupUnavailable'
  }
}
async function loadHistory() {
  const c = context(),
    request = ++historyGeneration
  historyError.value = ''
  try {
    const result = await api<{ items: RunRecord[]; total: number }>(
      path(
        c,
        `/runs?exercise=${c.exercise}&language=${c.language}&page=${historyPage.value}&pageSize=${historySize.value}`,
      ),
    )
    if (matches(c) && request === historyGeneration) {
      history.value = result.items
      historyTotal.value = result.total
    }
  } catch (e) {
    if (matches(c) && request === historyGeneration)
      historyError.value = e instanceof Error ? e.message : t('workspace.errors.historyFailed')
  }
}
async function loadCode() {
  generation++
  const c = context()
  clearTimeout(saveTimer)
  loading.value = true
  conflict.value = false
  loadError.value = ''
  dirty.value = false
  otherRun.value = undefined
  viewing.value = undefined
  run.value = undefined
  submitted.value = false
  helpSent.value = false
  undo.value = undefined
  code.value = ''
  revision.value = 0
  history.value = []
  historyPage.value = 1
  input.value = exercise.value?.sampleInput ?? ''
  saveState.value = 'loading'
  if (!c.exercise) {
    loading.value = false
    loadError.value = t('workspace.errors.noExercises')
    return
  }
  try {
    const remote = await api<{
      code: string
      revision: number
      submitted?: boolean
      submittedAt?: string
      help?: { message: string } | null
    }>(path(c, '/workspace/' + c.exercise + '?language=' + c.language))
    if (!matches(c)) return
    code.value = remote.code
    revision.value = remote.revision
    submitted.value = !!remote.submitted
    submittedAt.value = remote.submittedAt ?? ''
    helpSent.value = !!remote.help
    helpText.value = remote.help?.message ?? ''
    try {
      const local = JSON.parse(
        localStorage.getItem(draftStorageKey(c.exercise, c.user, c.language)) ?? 'null',
      )
      if (local?.pending && typeof local.code === 'string') {
        code.value = local.code
        dirty.value = true
        if (local.revision !== remote.revision) {
          conflict.value = true
          saveState.value = 'conflictKeep'
        }
      }
    } catch {
      /* Server content remains usable if browser storage is unavailable. */
    }
    if (!conflict.value) saveState.value = dirty.value ? 'localPending' : 'synced'
    const activeRuns = await api<(RunRecord & { classroomId?: string })[]>(
      path(c, '/runs?active=true&scope=all'),
    )
    if (!matches(c)) return
    run.value = activeRuns.find(
      (r) => r.exerciseId === c.exercise && sourceLanguage(r) === c.language,
    )
    otherRun.value = activeRuns.find(
      (r) => r.exerciseId !== c.exercise || sourceLanguage(r) !== c.language,
    )
    await loadHistory()
  } catch (e) {
    if (matches(c)) {
      loadError.value = e instanceof Error ? e.message : t('workspace.save.loadRetryFailed')
      saveState.value = 'loadFailed'
      code.value = ''
    }
  } finally {
    if (matches(c)) {
      await nextTick()
      loading.value = false
    }
  }
  if (matches(c) && dirty.value && !conflict.value && !loadError.value) void saveNow()
  if (matches(c) && !loadError.value) void heartbeat()
}
async function saveNow(): Promise<boolean> {
  if (studentGuideActive.value) return false
  clearTimeout(saveTimer)
  if (saving) {
    const ok = await saving
    if (!ok) return false
    return dirty.value ? saveNow() : true
  }
  if (loading.value || loadError.value || conflict.value || isArchived.value) return false
  if (!dirty.value && revision.value > 0) return true
  const c = context(),
    content = code.value,
    expectedRevision = revision.value
  saveState.value = 'syncing'
  saving = (async () => {
    try {
      const result = await api<{ revision: number }>(
        path(c, '/workspace/' + c.exercise + '?language=' + c.language),
        'PUT',
        {
          language: c.language,
          code: content,
          revision: expectedRevision,
        },
      )
      if (!matches(c)) return false
      revision.value = result.revision
      dirty.value = code.value !== content
      saveState.value = dirty.value ? 'pending' : 'synced'
      backup()
      return true
    } catch (e) {
      if (!matches(c)) return false
      backup()
      saveState.value = e instanceof ApiError && e.status === 409 ? 'conflictRetry' : 'networkError'
      if (e instanceof ApiError && e.status === 409) conflict.value = true
      return false
    }
  })()
  const ok = await saving
  saving = undefined
  return ok && dirty.value ? saveNow() : ok
}
watch(code, () => {
  if (loading.value || readonly.value) return
  dirty.value = true
  saveState.value = 'pending'
  backup()
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => void saveNow(), 600)
})
watch([selected, language], () => void loadCode(), { immediate: true })
watch(
  historySize,
  () => {
    historyPage.value = 1
  },
  { flush: 'sync' },
)
watch([historyPage, historySize], () => {
  if (!loading.value) void loadHistory()
})
async function useServer() {
  if (!(await confirmAction(t('workspace.confirm.useServer')))) return
  const c = context()
  try {
    const remote = await api<{ code: string; revision: number }>(
      path(c, '/workspace/' + c.exercise + '?language=' + c.language),
    )
    if (!matches(c)) return
    download(t('workspace.files.localUnsynced') + '-' + exercise.value!.filename, code.value)
    loading.value = true
    code.value = remote.code
    revision.value = remote.revision
    dirty.value = false
    conflict.value = false
    backup()
    await nextTick()
    loading.value = false
    saveState.value = 'serverAdopted'
  } catch (e) {
    reportError(e)
  }
}
async function startRun() {
  if (runningRequest.value || readonly.value || active() || otherRun.value) return
  runningRequest.value = true
  actionError.value = ''
  const c = context()
  try {
    if (!(await saveNow()) || !matches(c)) throw new Error(t('workspace.errors.syncDraftFirst'))
    const result = await api<RunRecord>(path(c, '/runs'), 'POST', {
      exerciseId: c.exercise,
      language: c.language,
      revision: revision.value,
      input: input.value,
      interactive: interactive.value,
    })
    if (matches(c)) {
      viewing.value = undefined
      run.value = result
      historyPage.value = 1
      await loadHistory()
    }
  } catch (e) {
    actionError.value = e instanceof Error ? e.message : t('workspace.errors.runFailed')
  } finally {
    runningRequest.value = false
  }
}
const interactive = ref(false)
async function stop(): Promise<boolean> {
  if (!run.value || stopping.value) return false
  stopping.value = true
  const c = context(),
    id = run.value.id
  try {
    await api(path(c, '/runs/' + id + '/stop'), 'POST', {})
    for (let attempt = 0; attempt < 30; attempt++) {
      const result = await api<RunRecord>(path(c, '/runs/' + id))
      if (!matches(c)) return false
      run.value = result
      if (!active()) {
        await loadHistory()
        return true
      }
      await new Promise((resolve) => setTimeout(resolve, 150))
    }
    throw new Error(t('workspace.errors.stopSent'))
  } catch (e) {
    reportError(e)
    return false
  } finally {
    stopping.value = false
  }
}
async function sendLine(text: string): Promise<boolean> {
  if (!run.value || run.value.eof) return false
  try {
    await api(classPath('/runs/' + run.value.id + '/input'), 'POST', { text: text + '\n' })
    return true
  } catch (e) {
    reportError(e)
    return false
  }
}
async function eof(): Promise<boolean> {
  if (!run.value || run.value.eof) return false
  const id = run.value.id
  try {
    await api(classPath('/runs/' + id + '/input'), 'POST', { eof: true })
    if (run.value?.id === id) run.value = { ...run.value, eof: true }
    notify(t('workspace.notify.stdinClosed'))
    return true
  } catch (e) {
    reportError(e)
    return false
  }
}
async function doSubmit() {
  if (submitting.value) return
  submitting.value = true
  actionError.value = ''
  const c = context()
  try {
    if (!(await saveNow()) || !matches(c))
      throw new Error(t('workspace.errors.syncDraftFirstSubmit'))
    await api(path(c, '/submissions'), 'POST', {
      exerciseId: c.exercise,
      language: c.language,
      revision: revision.value,
    })
    if (matches(c)) {
      submitted.value = true
      submittedAt.value = new Date().toISOString()
      submit.value = false
      notify(t('workspace.notify.submitted'))
    }
  } catch (e) {
    actionError.value = e instanceof Error ? e.message : t('workspace.errors.submitFailed')
  } finally {
    submitting.value = false
  }
}
function resetCode() {
  undo.value = code.value
  code.value = exerciseStarterCode(exercise.value!, language.value)
  reset.value = false
}
async function sendHelp() {
  if (helping.value) return
  helping.value = true
  actionError.value = ''
  const c = context()
  try {
    await api(path(c, '/help'), 'POST', {
      exerciseId: c.exercise,
      language: c.language,
      message: helpText.value.trim(),
    })
    if (matches(c)) {
      helpSent.value = true
      help.value = false
      notify(t('workspace.notify.helpSent'))
    }
  } catch (e) {
    actionError.value = e instanceof Error ? e.message : t('workspace.errors.sendFailed')
  } finally {
    helping.value = false
  }
}
async function heartbeat() {
  if (studentGuideActive.value || loading.value || loadError.value || !selected.value) return
  try {
    const c = context()
    await api(path(c, '/heartbeat'), 'POST', { exerciseId: c.exercise, language: c.language })
    const requests = await api<{ message: string; resolved: boolean }[]>(
      path(
        c,
        '/help?exerciseId=' +
          c.exercise +
          '&language=' +
          c.language +
          '&student=' +
          currentUser.value?.id,
      ),
    )
    if (matches(c)) {
      const unresolved = requests.find((request) => !request.resolved)
      helpSent.value = !!unresolved
      if (!help.value) helpText.value = unresolved?.message ?? ''
    }
  } catch {
    if (!dirty.value) saveState.value = 'disconnected'
  }
}
async function switchTo(id: string, nextLanguage?: SourceLanguage) {
  if (switching.value || loading.value || runningRequest.value) return
  switching.value = true
  try {
    if ((await directoryPanel.value?.flush()) === false) {
      notify(t('workspace.notify.unsavedChanges'), 'error')
      return
    }
    if (dirty.value && isArchived.value) {
      if (!(await confirmAction(t('workspace.confirm.readonlyDownloadSwitch')))) return
      download(
        t('workspace.files.unsynced') + '-' + (exercise.value?.filename ?? 'source.cpp'),
        code.value,
      )
    } else if (dirty.value && !(await saveNow())) {
      notify(t('workspace.notify.unsavedChanges'), 'error')
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
async function returnToRunning() {
  const target = otherRun.value
  if (!target?.exerciseId) return
  if (!target.classroomId || target.classroomId === demo.classroomId) {
    await switchTo(target.exerciseId, sourceLanguage(target))
    return
  }
  await router.push('/student/classes')
  if (router.currentRoute.value.path !== '/student/classes') return
  await selectClass(target.classroomId)
  await router.push({
    path:
      activeClassroom.value.classroomRole === 'teacher' ? '/teacher/teach' : '/student/workspace',
    query: { exercise: target.exerciseId, language: sourceLanguage(target), returnRun: '1' },
  })
}
async function changeLanguage(value: SourceLanguage) {
  if (value === language.value || active() || submitting.value || helping.value) return
  await switchTo(selected.value, value)
}
async function changeExercise(value: string | number) {
  const id = String(value)
  if (active()) {
    pendingExercise.value = id
    return
  }
  await switchTo(id)
}
async function stopAndSwitch() {
  const id = pendingExercise.value
  if (await stop()) {
    pendingExercise.value = ''
    await switchTo(id)
  }
}
const poll = setInterval(async () => {
  if (studentGuideActive.value || polling || loading.value || loadError.value) return
  polling = true
  const c = context(),
    id = run.value?.id
  try {
    if (otherRun.value?.classroomId) {
      const other = otherRun.value
      const result = await api<RunRecord>('/classes/' + other.classroomId + '/runs/' + other.id)
      if (
        matches(c) &&
        otherRun.value?.id === other.id &&
        !['queued', 'compiling', 'running'].includes(result.status)
      )
        otherRun.value = undefined
    }
    if (active() && id) {
      const result = await api<RunRecord>(path(c, '/runs/' + id))
      if (matches(c) && run.value?.id === id) {
        const wasActive = active()
        run.value = result
        if (wasActive && !active()) await loadHistory()
      }
    }
    if (matches(c) && dirty.value && !conflict.value && !isArchived.value) await saveNow()
  } catch {
    /* Preserve the last result while reconnecting. */
  } finally {
    polling = false
  }
}, 1000)
const pulse = setInterval(() => void heartbeat(), 5000)
function unload(event: BeforeUnloadEvent) {
  if (dirty.value || active()) {
    backup()
    event.preventDefault()
    event.returnValue = ''
  }
}
window.addEventListener('beforeunload', unload)
function saveShortcut(event: KeyboardEvent) {
  if (
    !(event.metaKey || event.ctrlKey) ||
    event.altKey ||
    event.shiftKey ||
    event.key.toLowerCase() !== 's'
  )
    return
  event.preventDefault()
  if (readonly.value || studentGuideActive.value) return
  void nextTick().then(async () => {
    if ((await directoryPanel.value?.flush()) === false) {
      notify(t('workspace.notify.localUnsaved'), 'error')
    }
    if (!(await saveNow())) notify(t('workspace.notify.draftNotSynced'), 'error')
  })
}
window.addEventListener('keydown', saveShortcut, true)
onBeforeUnmount(() => {
  generation++
  clearTimeout(saveTimer)
  clearInterval(poll)
  clearInterval(pulse)
  window.removeEventListener('beforeunload', unload)
  window.removeEventListener('keydown', saveShortcut, true)
})
onBeforeRouteLeave(async (to) => {
  if (to.path === '/login' && !currentUser.value) {
    backup()
    return true
  }
  if (runningRequest.value || submitting.value || helping.value || stopping.value) {
    notify(t('workspace.notify.leaveInProgress'))
    return false
  }
  if (active() && !(await confirmAction(t('workspace.confirm.leaveRunning')))) return false
  if ((await directoryPanel.value?.flush()) === false) {
    notify(t('workspace.notify.localUnsaved'), 'error')
    return false
  }
  if (dirty.value && isArchived.value) {
    if (!(await confirmAction(t('workspace.confirm.readonlyDownloadLeave')))) return false
    download(
      t('workspace.files.unsynced') + '-' + (exercise.value?.filename ?? 'source.cpp'),
      code.value,
    )
    return true
  }
  return !dirty.value || (await saveNow())
})
useActionFeedback(actionError)
</script>
<template>
  <div v-if="exercise" class="ide-page">
    <header class="workspace-toolbar">
      <RouterLink
        to="/student/classes"
        class="icon-button"
        :aria-label="t('workspace.toolbar.back')">
        <ArrowLeft :size="18" />
      </RouterLink>
      <div class="workspace-context">
        <span class="workspace-classroom" :title="activeClassroom.name">
          {{ activeClassroom.name }}
        </span>
        <label class="workspace-exercise">
          <BookOpen :size="16" />
          <Select
            :model-value="selected"
            :aria-label="t('workspace.toolbar.selectExercise')"
            :disabled="loading || switching || runningRequest"
            :data-disabled-reason="
              loading
                ? t('workspace.reasons.loading')
                : switching
                  ? t('workspace.reasons.switching')
                  : t('workspace.reasons.creatingRun')
            "
            @update:model-value="changeExercise">
            <SelectOption
              v-for="e in exercises.filter((e) => e.status === 'published' || e.id === selected)"
              :key="e.id"
              :value="e.id">
              {{ e.title || t('workspace.untitled') }}
            </SelectOption>
          </Select>
        </label>
      </div>
      <span v-if="submitted" class="status positive">
        <Check :size="12" />
        {{ t('workspace.toolbar.submitted') }}
      </span>
      <span
        class="save-label workspace-save"
        :class="{
          'save-error': saveError,
          'save-pending': dirty || loading,
        }"
        role="status"
        :title="t('workspace.save.' + saveState)">
        <WifiOff v-if="saveError" :size="15" />
        <CloudCheck v-else :size="15" />
        <span>{{ t('workspace.save.' + saveState) }}</span>
      </span>
      <div class="workspace-actions">
        <Button
          variant="plain"
          class="icon-button"
          :aria-label="t('workspace.toolbar.guide')"
          data-guide="workspace-guide"
          @click="startUserGuide">
          <HelpCircle :size="18" />
        </Button>
        <ThemeToggle />
        <LocalDirectoryPanel
          ref="directoryPanel"
          v-model="code"
          :classroom-id="demo.classroomId"
          :exercise-id="selected + ':' + language"
          :filename="exercise.filename"
          :readonly="loading || !!loadError || !!viewing || isArchived || conflict"
          compact />
        <Button
          variant="outline"
          size="sm"
          :disabled="readonly"
          :data-disabled-reason="readonlyReason"
          data-guide="help"
          @click="openHelp">
          <Hand />
          {{ helpSent ? t('workspace.toolbar.helpSent') : t('workspace.toolbar.help') }}
        </Button>
        <Button
          variant="outline"
          size="sm"
          :disabled="readonly || (submitted && activeClassroom.settings?.allowResubmit === false)"
          :data-disabled-reason="
            readonly ? readonlyReason : t('workspace.reasons.submittedNoResubmit')
          "
          data-guide="submit"
          @click="openSubmit">
          <Send />
          {{ t('workspace.toolbar.submit') }}
        </Button>
        <Button
          v-if="runtime || run?.status === 'queued' || run?.status === 'compiling'"
          variant="destructive"
          size="sm"
          :disabled="stopping"
          :data-disabled-reason="stopping ? t('workspace.reasons.stopping') : ''"
          data-guide="stop"
          @click="stop">
          <Square />
          {{ stopping ? t('workspace.toolbar.stopping') : t('workspace.toolbar.stop') }}
        </Button>
        <Button
          :disabled="readonly || runningRequest || active() || !!otherRun"
          :data-disabled-reason="
            readonly
              ? readonlyReason
              : runningRequest
                ? t('workspace.reasons.creatingRun')
                : active()
                  ? t('workspace.reasons.runActive')
                  : t('workspace.reasons.runOther')
          "
          size="sm"
          data-guide="run"
          @click="startRun">
          <Play />
          {{ runningRequest ? t('workspace.toolbar.creating') : t('workspace.toolbar.run') }}
          <PythonBeta v-if="language === 'python'" />
        </Button>
        <span class="avatar small" :title="currentUser?.name">
          {{ currentUser?.name.slice(-1) }}
        </span>
      </div>
    </header>
    <Alert v-if="otherRun" class="app-alert--banner" type="warning">
      {{
        t('workspace.alerts.otherRun', {
          name:
            classrooms.find((c) => c.id === otherRun?.classroomId)?.name ??
            t('workspace.alerts.otherExercise'),
        })
      }}

      <template #actions>
        <Button variant="plain" data-guide="other-run" @click="returnToRunning">
          {{ t('workspace.alerts.returnToRun') }}
        </Button>
      </template>
    </Alert>
    <Alert v-if="loading" class="app-alert--banner" role="status" type="info">
      {{ t('workspace.alerts.loadingDraft') }}
    </Alert>
    <Alert v-if="loadError" class="app-alert--banner" role="alert" type="error">
      {{ loadError }}

      <template #actions>
        <Button variant="plain" data-guide="draft-retry" @click="loadCode">
          {{ t('workspace.alerts.retryLoad') }}
        </Button>
      </template>
    </Alert>
    <Alert v-if="viewing" class="app-alert--banner" type="info" :icon="History">
      {{ t('workspace.alerts.viewingSnapshot', { id: viewing.id }) }}

      <template #actions>
        <Button variant="plain" data-guide="return-draft" @click="viewing = undefined">
          {{ t('workspace.alerts.backToDraft') }}
          <ArrowLeft :size="13" />
        </Button>
      </template>
    </Alert>
    <Alert v-if="conflict" class="app-alert--banner" type="warning" :icon="WifiOff">
      {{ t('workspace.save.' + saveState) }}

      <template #actions>
        <Button variant="plain" data-guide="server-conflict" @click="useServer">
          {{ t('workspace.alerts.downloadAndUseServer') }}
        </Button>
      </template>
    </Alert>
    <Alert v-else-if="isArchived" class="app-alert--banner" type="warning">
      {{ t('workspace.alerts.readonlyAsk') }}
    </Alert>
    <SplitterGroup
      direction="horizontal"
      auto-save-id="student-workspace-columns"
      class="workspace-layout"
      :keyboard-resize-by="2">
      <SplitterPanel
        id="workspace-problem"
        as="aside"
        class="ide-problem"
        :default-size="34"
        :min-size="26"
        :max-size="50">
        <div class="problem-tabs">
          <Button
            variant="plain"
            :class="{ selected: panel === '题目' }"
            data-guide="problem-tab"
            @click="panel = '题目'">
            <BookOpen :size="15" />
            {{ t('workspace.problem.tabProblem') }}
          </Button>
          <Button
            variant="plain"
            :class="{ selected: panel === '历史' }"
            data-guide="history-tab"
            @click="panel = '历史'">
            <History :size="15" />
            {{ t('workspace.problem.tabHistory') }}
          </Button>
        </div>
        <div v-if="panel === '题目'" class="problem-content">
          <span class="topic-label">
            {{
              t('workspace.problem.exerciseIndex', {
                index: exercises.findIndex((e) => e.id === selected) + 1,
              })
            }}
            · {{ exercise.topic }}
          </span>
          <h1>{{ exercise?.title }}</h1>
          <div class="problem-limits">
            <span>{{ executionSettings.runTimeMs }} ms</span>
            <span>{{ executionSettings.runMemoryMb }} MiB</span>
          </div>
          <MarkdownContent :source="exercise.description" />
          <h3>{{ t('workspace.problem.inputDesc') }}</h3>
          <MarkdownContent :source="exercise.input" />
          <h3>{{ t('workspace.problem.outputDesc') }}</h3>
          <MarkdownContent :source="exercise.output" />
          <h3>{{ t('workspace.problem.samples') }}</h3>
          <div class="sample-grid stacked">
            <CodeBlock
              :source="exercise.sampleInput"
              :label="t('workspace.problem.sampleInput')"
              :empty-text="t('workspace.problem.noInput')" />
            <CodeBlock
              :source="exercise.sampleOutput"
              :label="t('workspace.problem.sampleOutput')" />
          </div>
        </div>
        <div v-else class="workspace-history">
          <div class="history-list">
            <Button
              v-for="r in history"
              :key="r.id"
              variant="plain"
              class="history-item"
              :class="{ selected: viewing?.id === r.id }"
              @click="viewing = r">
              <span>
                <strong>{{ statusLabel(r.status) }}</strong>
                <PythonBeta v-if="sourceLanguage(r) === 'python'" />
                <small>
                  {{ formatTime(r.time) }} ·
                  {{ r.id.slice(0, 8) }}
                </small>
              </span>
              <History :size="15" />
            </Button>
            <Alert v-if="historyError" role="alert" type="error">
              {{ historyError }}

              <template #actions>
                <Button
                  variant="plain"
                  class="text-button"
                  data-guide="history-retry"
                  @click="loadHistory">
                  {{ t('common.retry') }}
                </Button>
              </template>
            </Alert>
            <p v-else-if="!history.length" class="small-empty">
              {{ t('workspace.problem.noRuns') }}
            </p>
          </div>
          <Pagination
            v-model:page="historyPage"
            v-model:page-size="historySize"
            :total="historyTotal"
            :busy="loading"
            :unit="t('workspace.problem.recordsUnit')" />
        </div>
      </SplitterPanel>
      <SplitterResizeHandle
        class="workspace-resize-handle"
        :aria-label="t('workspace.problem.resizeColumns')"
        aria-orientation="vertical" />
      <SplitterPanel id="workspace-main" :default-size="66" :min-size="50" class="workspace-main">
        <SplitterGroup
          direction="vertical"
          auto-save-id="student-workspace-rows"
          class="workspace-editor-split"
          :keyboard-resize-by="2">
          <SplitterPanel
            id="workspace-editor"
            as="section"
            class="editor-area"
            :default-size="64"
            :min-size="35">
            <div class="code-toolbar">
              <span class="file-tab">
                <CodeXml :size="15" />
                {{ viewing?.filename ?? exercise.filename }}
                <i v-if="!readonly" class="file-dot" />
                <span v-if="readonly" class="muted">{{ t('workspace.editor.readonly') }}</span>
              </span>
              <div class="inline-items ml-auto">
                <LanguageSelect
                  :model-value="displayLanguage"
                  :disabled="readonly || active() || runningRequest || submitting || helping"
                  @update:model-value="changeLanguage" />
                <label class="compact-select">
                  <Settings2 :size="13" />
                  <Select v-model.number="fontSize" :aria-label="t('workspace.editor.fontSize')">
                    <SelectOption :value="14">14 px</SelectOption>
                    <SelectOption :value="16">16 px</SelectOption>
                    <SelectOption :value="18">18 px</SelectOption>
                  </Select>
                </label>
                <Button
                  variant="plain"
                  class="icon-button"
                  :aria-label="t('workspace.editor.downloadCode')"
                  @click="download(viewing?.filename ?? exercise.filename, viewing?.code ?? code)">
                  <Download :size="14" />
                </Button>
                <Button
                  v-if="undo !== undefined"
                  data-guide="undo-reset"
                  variant="plain"
                  class="text-button"
                  :disabled="readonly"
                  :data-disabled-reason="readonlyReason"
                  @click="
                    () => {
                      code = undo ?? code
                      undo = undefined
                      notify(t('workspace.notify.codeRestored'))
                    }
                  ">
                  {{ t('workspace.editor.undoReset') }}
                </Button>
                <Button
                  v-else
                  variant="plain"
                  class="icon-button"
                  :aria-label="t('workspace.editor.resetCode')"
                  :disabled="readonly"
                  :data-disabled-reason="readonlyReason"
                  @click="reset = true">
                  <RotateCcw :size="14" />
                </Button>
                <span class="language-label">
                  {{
                    compilerLabel(
                      viewing
                        ? (viewing.runtimeProfile ?? viewing.compilerProfile)
                        : runtimeProfile,
                    )
                  }}
                </span>
              </div>
            </div>
            <CodeEditor
              :model-value="viewing?.code ?? code"
              :language="displayLanguage"
              :readonly="readonly"
              :font-size="fontSize"
              :filename="viewing?.filename ?? exercise.filename"
              @update:model-value="!readonly && (code = $event)" />
          </SplitterPanel>
          <SplitterResizeHandle
            class="workspace-resize-handle"
            :aria-label="t('workspace.problem.resizeRows')"
            aria-orientation="horizontal" />
          <SplitterPanel id="workspace-io" class="workspace-io" :default-size="36" :min-size="22">
            <SplitterGroup
              direction="horizontal"
              auto-save-id="student-workspace-input-output"
              class="workspace-io-split"
              :keyboard-resize-by="2">
              <SplitterPanel
                id="workspace-input"
                as="section"
                class="stdin-panel"
                :default-size="30"
                :min-size="22"
                :max-size="55">
                <div class="code-toolbar">
                  <span>{{ t('workspace.stdin.input') }}</span>
                  <span class="muted text-xs">stdin</span>
                  <Button
                    variant="plain"
                    class="text-button ml-auto"
                    :disabled="!!viewing"
                    :data-disabled-reason="t('workspace.reasons.snapshotReadonly')"
                    data-guide="fill-sample"
                    @click="
                      () => {
                        input = exercise?.sampleInput ?? ''
                        notify(t('workspace.notify.sampleFilled'))
                      }
                    ">
                    {{ t('workspace.stdin.fillSample') }}
                  </Button>
                </div>
                <Textarea
                  v-if="!viewing"
                  v-model="input"
                  :aria-label="t('workspace.stdin.stdinAria')"
                  :placeholder="t('workspace.stdin.placeholder')"
                  :readonly="isArchived" />
                <CodeBlock
                  v-else
                  class="snapshot-input"
                  :source="viewing.input"
                  :label="t('workspace.stdin.snapshotInput')"
                  :empty-text="t('workspace.stdin.noPrefill')" />
                <div class="stdin-note">
                  <span v-if="viewing">{{ t('workspace.stdin.fixedInput') }}</span>
                  <label
                    v-else
                    data-guide="interactive-toggle"
                    class="inline-items"
                    :title="t('workspace.stdin.interactiveHint')">
                    <Checkbox
                      v-model="interactive"
                      :disabled="active()"
                      :data-disabled-reason="t('workspace.reasons.interactiveLocked')" />
                    {{ t('workspace.stdin.interactive') }}
                  </label>
                </div>
              </SplitterPanel>
              <SplitterResizeHandle
                class="workspace-resize-handle"
                :aria-label="t('workspace.problem.resizeIo')"
                aria-orientation="vertical" />
              <SplitterPanel
                id="workspace-output"
                :default-size="70"
                :min-size="45"
                class="workspace-output">
                <RunOutput
                  :key="(viewing ?? run)?.id"
                  :run="viewing ?? run"
                  :language="displayLanguage"
                  :interactive="runtime && !viewing && !run?.eof"
                  :send-input="sendLine"
                  :close-input="eof" />
              </SplitterPanel>
            </SplitterGroup>
          </SplitterPanel>
        </SplitterGroup>
      </SplitterPanel>
    </SplitterGroup>
  </div>
  <Modal v-model:open="help" :title="t('workspace.help.title')">
    <Form class="form-stack" @submit.prevent="sendHelp">
      <label>
        {{ t('workspace.help.label') }}
        <Textarea
          v-model="helpText"
          data-guide="help-message"
          rows="4"
          :placeholder="t('workspace.help.placeholder')"
          maxlength="300"
          required />
      </label>
      <Alert data-guide="help-context" type="info">
        {{ t('workspace.help.linkedExercise', { title: exercise?.title }) }}
        <br />
        {{ t('workspace.help.linkedRun', { run: run?.id ?? t('workspace.help.noRun') }) }}
      </Alert>

      <div class="modal-actions">
        <Button
          type="button"
          variant="outline"
          :disabled="helping"
          :data-disabled-reason="t('workspace.help.sending')"
          data-guide="help-cancel"
          @click="help = false">
          {{ t('common.cancel') }}
        </Button>
        <Button
          data-guide="help-send"
          type="submit"
          :disabled="helping || !helpText.trim()"
          :data-disabled-reason="helping ? t('workspace.help.sending') : t('workspace.help.empty')">
          <Hand />
          {{
            helping
              ? t('workspace.help.sendSending')
              : helpSent
                ? t('workspace.help.sendUpdate')
                : t('workspace.help.sendNew')
          }}
        </Button>
      </div>
    </Form>
  </Modal>
  <Modal
    v-model:open="submit"
    :title="t('workspace.submitModal.title')"
    :description="t('workspace.submitModal.description')">
    <Alert data-guide="submit-info" type="info">
      {{ exercise?.title }} · {{ exercise?.filename }}
      <PythonBeta v-if="language === 'python'" />
      <br />
      {{ t('workspace.submitModal.note') }}
    </Alert>

    <p v-if="submittedAt" class="form-hint">
      {{ t('workspace.submitModal.lastSubmit', { time: formatTime(submittedAt) }) }}
    </p>
    <div class="modal-actions">
      <Button
        variant="outline"
        :disabled="submitting"
        :data-disabled-reason="t('workspace.submitModal.submitting')"
        data-guide="submit-cancel"
        @click="submit = false">
        {{ t('workspace.submitModal.keepEditing') }}
      </Button>
      <Button
        :disabled="submitting"
        :data-disabled-reason="t('workspace.submitModal.submitting')"
        data-guide="submit-confirm"
        @click="doSubmit">
        <Send />
        {{
          submitting
            ? t('workspace.submitModal.submittingLabel')
            : t('workspace.submitModal.confirm')
        }}
      </Button>
    </div>
  </Modal>
  <Modal
    v-model:open="reset"
    :title="t('workspace.resetModal.title')"
    :description="t('workspace.resetModal.description')">
    <div class="modal-actions">
      <Button variant="outline" data-guide="reset-cancel" @click="reset = false">
        {{ t('workspace.resetModal.keep') }}
      </Button>
      <Button variant="destructive" data-guide="reset-confirm" @click="resetCode">
        {{ t('workspace.resetModal.confirm') }}
      </Button>
    </div>
  </Modal>
  <Modal
    :open="!!pendingExercise"
    :title="t('workspace.switchModal.title')"
    :description="t('workspace.switchModal.description')"
    @update:open="!$event && !stopping && (pendingExercise = '')">
    <div class="modal-actions">
      <Button
        variant="outline"
        :disabled="stopping"
        :data-disabled-reason="t('workspace.reasons.stopping')"
        data-guide="switch-cancel"
        @click="pendingExercise = ''">
        {{ t('workspace.switchModal.stay') }}
      </Button>
      <Button
        variant="destructive"
        :disabled="stopping"
        :data-disabled-reason="t('workspace.reasons.stopping')"
        data-guide="switch-confirm"
        @click="stopAndSwitch">
        {{
          stopping ? t('workspace.switchModal.waiting') : t('workspace.switchModal.stopAndSwitch')
        }}
      </Button>
    </div>
  </Modal>
  <div v-if="!exercise" class="empty-state">
    <BookOpen :size="32" />
    <h1>{{ t('workspace.empty.title') }}</h1>
    <p>{{ t('workspace.empty.text') }}</p>
    <RouterLink to="/student/classes">{{ t('workspace.toolbar.back') }}</RouterLink>
  </div>
</template>

<style scoped>
.ide-page {
  min-width: 1000px;
  min-height: 600px;
  height: 100dvh;
  overflow: hidden;
}
.workspace-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 64px;
  padding: 8px 16px;
  flex-shrink: 0;
  border-bottom: 1px solid var(--ui-line);
}
.workspace-context {
  min-width: 120px;
  flex: 1;
}
.workspace-classroom {
  display: block;
  max-width: 260px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: 13px;
  color: var(--ui-muted);
}
.workspace-exercise {
  display: flex;
  align-items: center;
  gap: 7px;
  color: var(--ui-action);
}
.workspace-exercise .ui-select-trigger {
  width: 100%;
  max-width: 320px;
  border: 0;
  padding: 2px 18px 2px 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--ui-ink);
  text-overflow: ellipsis;
}
.workspace-save {
  margin-left: 0;
  font-size: 14px;
  color: var(--ui-success);
  min-width: 0;
}
.workspace-save > span {
  max-width: 140px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.save-label.save-error {
  color: var(--ui-error);
}
.save-label.save-pending {
  color: var(--ui-warning);
}
.workspace-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
.workspace-layout {
  flex: 1;
  min-height: 0;
}
.workspace-main,
.workspace-editor-split,
.workspace-io,
.workspace-io-split,
.workspace-output {
  min-width: 0;
  min-height: 0;
}
.workspace-resize-handle {
  position: relative;
  flex-shrink: 0;
  background: var(--ui-surface);
  border: 1px solid var(--ui-line);
  touch-action: none;
}
.workspace-resize-handle[data-orientation='horizontal'] {
  width: 7px;
  cursor: col-resize;
}
.workspace-resize-handle[data-orientation='vertical'] {
  height: 7px;
  cursor: row-resize;
}
.workspace-resize-handle::after {
  content: '';
  position: absolute;
  background: var(--ui-line-strong);
  border-radius: 3px;
  inset: calc(50% - 18px) 2px;
}
.workspace-resize-handle[data-orientation='vertical']::after {
  inset: 2px calc(50% - 18px);
}
.workspace-resize-handle:hover,
.workspace-resize-handle[data-state='drag'],
.workspace-resize-handle:focus-visible {
  background: var(--ui-selection);
}
.workspace-resize-handle:hover::after,
.workspace-resize-handle[data-state='drag']::after,
.workspace-resize-handle:focus-visible::after {
  background: var(--ui-action);
}
.editor-area {
  min-width: 0;
  min-height: 0;
}
.editor-area > .code-toolbar {
  flex-shrink: 0;
  flex-wrap: wrap;
  gap: 8px;
}
.file-tab {
  min-width: 0;
  max-width: 45%;
  overflow: hidden;
  white-space: nowrap;
}
.file-tab > svg {
  flex-shrink: 0;
}
.language-label {
  font-size: 13px;
}
.stdin-panel {
  min-height: 0;
  border: 0;
}
.stdin-panel .code-toolbar {
  flex-wrap: wrap;
  flex-shrink: 0;
  gap: 6px;
}
.stdin-panel textarea {
  min-height: 0;
  width: 100%;
  padding: 12px;
}
.stdin-note {
  font-size: 14px;
  padding: 8px 12px;
  flex-shrink: 0;
  border-top: 1px solid var(--ui-line);
}
.workspace-output :deep(.output-toolbar) {
  padding: 0 10px;
}
.workspace-output :deep(.output-placeholder) {
  min-height: 0;
  overflow: auto;
  padding: 12px;
}
.ide-problem {
  display: flex;
  flex-direction: column;
  min-height: 0;
  border: 0;
  overflow: hidden;
}
.problem-tabs {
  flex-shrink: 0;
  gap: 20px;
  padding: 0 16px;
}
.problem-tabs button {
  white-space: nowrap;
  font-size: 14px;
}
.ide-problem .problem-content {
  overflow: auto;
  min-height: 0;
  padding: 20px;
}
.workspace-history {
  min-height: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
}
.workspace-history .history-list {
  flex: 1;
  overflow: auto;
  min-height: 0;
  max-height: none;
}
.workspace-history :deep(.pagination) {
  padding: 10px;
  gap: 8px;
  flex-shrink: 0;
  flex-wrap: wrap;
}
.workspace-history :deep(.pagination-controls) {
  flex-wrap: wrap;
}
.snapshot-input {
  overflow: auto;
  min-height: 0;
  flex: 1;
}
</style>
