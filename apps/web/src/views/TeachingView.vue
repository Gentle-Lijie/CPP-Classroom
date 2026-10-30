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
const initial = String(route.query.exercise ?? demo.recommended)
const selected = ref(exercises.some((e) => e.id === initial) ? initial : (exercises[0]?.id ?? ''))
const language = ref<SourceLanguage>(
  preferredLanguage(
    currentUser.value?.id,
    demo.classroomId,
    selected.value,
    sourceLanguage(exercises.find((e) => e.id === selected.value)),
  ),
)
const runtimeProfile = computed(() =>
  language.value === 'python' ? 'cpython3-stdlib' : executionSettings.compilerProfile,
)
const mode = ref('题面'),
  fontSize = ref(20),
  teacherCode = ref(''),
  fullscreen = ref(false)
const loading = ref(true),
  dirty = ref(false),
  error = ref(''),
  conflict = ref(false),
  saveStatus = ref('读取中…'),
  switching = ref(false),
  monitorBlocked = ref(false)
type TeachingRun = RunRecord & { interactive?: boolean }
const run = ref<TeachingRun>(),
  otherRun = ref<TeachingRun>(),
  input = ref(''),
  interactive = ref(false),
  runningRequest = ref(false),
  stopping = ref(false),
  runError = ref('')
const isActive = (record?: TeachingRun) =>
  !!record && ['排队', '编译中', '运行中／可输入'].includes(record.status)
const activeRun = computed(() => (isActive(run.value) ? run.value : otherRun.value))
const runBusy = computed(() => runningRequest.value || stopping.value || !!activeRun.value)
const exercise = computed(() => {
  const found = exercises.find((e) => e.id === selected.value)
  return found
    ? {
        ...found,
        filename: exerciseSourceFilename(found, language.value),
        title: found.title || '未命名题目',
      }
    : undefined
})
const index = computed(() => exercises.findIndex((e) => e.id === selected.value))
const readonly = computed(
  () =>
    loading.value ||
    !!error.value ||
    conflict.value ||
    activeClassroom.value.status !== '进行中' ||
    exercise.value?.status !== '已发布',
)
const readonlyReason = computed(() => {
  if (loading.value) return '正在读取示范代码，请稍候'
  if (error.value) return '示范代码读取失败，请重试后再运行'
  if (conflict.value) return '示范代码存在版本冲突，请先处理冲突'
  if (activeClassroom.value.status !== '进行中') return '课堂未在进行中，暂时不能运行'
  if (exercise.value?.status !== '已发布') return '当前练习未发布或已关闭'
  return ''
})
const runBusyReason = computed(() => {
  if (runningRequest.value) return '正在创建运行任务，请稍候'
  if (stopping.value) return '正在停止程序，请稍候'
  if (otherRun.value) return '其他练习或课堂仍有运行任务，请先停止运行'
  return '当前程序尚未结束，请等待或停止运行'
})
const switchingReason = computed(() => {
  if (loading.value) return '正在读取练习，请稍候'
  if (switching.value) return '正在切换练习，请稍候'
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
    saveStatus.value = '本机备份不可用，请及时下载示范代码'
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
  saveStatus.value = '读取中…'
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
      ? '发现版本冲突，本机修改已保留'
      : dirty.value
        ? '本机修改待同步'
        : '已同步到服务器'
    await loadRuns(c)
  } catch (e) {
    if (matches(c)) error.value = e instanceof Error ? e.message : '示范代码读取失败'
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
    if (matches(c)) runError.value = e instanceof Error ? e.message : '运行记录读取失败'
  }
}
watch([selected, language], () => void load(), { immediate: true })
watch(teacherCode, () => {
  if (readonly.value) return
  dirty.value = true
  saveStatus.value = '待同步'
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
  saveStatus.value = '同步中…'
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
      saveStatus.value = dirty.value ? '待同步' : '已同步到服务器'
      backup()
      return true
    } catch (e) {
      if (!matches(c)) return false
      backup()
      saveStatus.value = e instanceof Error ? e.message : '保存失败，请重试'
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
    notify('请先停止当前运行或等待完成，再切换练习')
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
      (activeClassroom.value.status !== '进行中' || exercise.value?.status !== '已发布')
    ) {
      if (!(await confirmAction('当前练习已只读，示范修改无法上传。下载代码备份后切换？'))) return
      download('未同步示范-' + (exercise.value?.filename ?? 'source.cpp'), teacherCode.value)
    } else if (!(await persist())) {
      notify('示范代码尚未同步，请先重试或下载备份', 'error')
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
    if (!(await persist()) || !matches(c)) throw new Error('请先完成示范代码同步')
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
      runError.value = e instanceof Error ? e.message : '运行失败'
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
    throw new Error('停止请求已发送，请等待程序结束')
  } catch (e) {
    if (matches(c)) runError.value = e instanceof Error ? e.message : '停止失败'
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
    runError.value = e instanceof Error ? e.message : '输入发送失败'
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
    runError.value = e instanceof Error ? e.message : 'EOF 发送失败'
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
  if (
    !(await confirmAction(
      '采用服务器版本？当前未同步的示范代码会先下载备份，然后替换编辑器中的代码。',
    ))
  )
    return
  download('未同步示范-' + (exercise.value?.filename ?? 'source.cpp'), teacherCode.value)
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
    (!(await confirmAction('程序仍在运行，停止运行并离开授课？')) || !(await stopRun()))
  )
    return false
  if (
    dirty.value &&
    (activeClassroom.value.status !== '进行中' || exercise.value?.status !== '已发布')
  ) {
    if (!(await confirmAction('课堂或练习已只读，示范修改无法上传。下载代码备份后离开？')))
      return false
    download('未同步示范-' + (exercise.value?.filename ?? 'source.cpp'), teacherCode.value)
    return true
  }
  const saved = await persist()
  if (!saved) notify('示范代码尚未同步，请重试保存或下载备份', 'error')
  return saved
})
async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen()
    else await document.documentElement.requestFullscreen()
  } catch {
    notify('浏览器未允许全屏，请使用系统全屏功能')
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
onMounted(() => {
  poll = setInterval(() => void pollRun(), 1000)
  window.addEventListener('beforeunload', beforeUnload)
  document.addEventListener('keydown', keyboard)
  document.addEventListener('fullscreenchange', fullscreenChange)
})
onBeforeUnmount(() => {
  generation++
  clearTimeout(timer)
  clearInterval(poll)
  window.removeEventListener('beforeunload', beforeUnload)
  document.removeEventListener('keydown', keyboard)
  document.removeEventListener('fullscreenchange', fullscreenChange)
})
</script>
<template>
  <main v-if="exercise" class="teaching-page">
    <header class="teaching-toolbar">
      <div class="inline-items">
        <RouterLink to="/teacher/exercises" class="icon-button" aria-label="结束授课">
          <ArrowLeft :size="19" />
        </RouterLink>
        <span class="teaching-mark">
          <Monitor :size="19" />
          授课模式
        </span>
        <span class="teaching-class-name">{{ activeClassroom.name }}</span>
      </div>
      <div class="teaching-slide-meta">
        <span class="inline-items">
          <span class="lesson-number">{{ String(index + 1).padStart(2, '0') }}</span>
          <span class="teaching-topic" :title="exercise.topic">{{ exercise.topic }}</span>
          <span class="status" :class="exercise.status === '已发布' ? 'positive' : 'amber'">
            {{ exercise.status }}
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
            aria-label="编辑题目"
            @click="router.push('/teacher/exercises/' + exercise.id + '/edit')">
            <Pencil :size="13" />
            编辑题目
          </Button>
        </div>
      </div>
      <div class="teaching-view-switch" aria-label="授课布局">
        <Button
          v-for="m in [
            { label: '题面', icon: BookOpen },
            { label: '代码', icon: CodeXml },
            { label: '对照', icon: Columns2 },
          ]"
          :key="m.label"
          variant="plain"
          :class="{ selected: mode === m.label }"
          @click="mode = m.label">
          <component :is="m.icon" :size="16" />
          {{ m.label }}
        </Button>
      </div>
      <div class="teaching-pagination">
        <Button
          variant="plain"
          class="icon-button"
          :disabled="index <= 0 || loading || switching || runBusy"
          :data-disabled-reason="index <= 0 ? '已经是第一道练习' : switchingReason"
          aria-label="上一道授课练习"
          @click="next(-1)">
          <ChevronLeft :size="20" />
        </Button>
        <Select
          :model-value="selected"
          :disabled="loading || switching || runBusy"
          :data-disabled-reason="switchingReason"
          aria-label="授课练习"
          @update:model-value="changeExercise">
          <SelectOption v-for="(e, i) in exercises" :key="e.id" :value="e.id">
            {{ i + 1 }} / {{ exercises.length }} · {{ e.title || '未命名题目' }}
          </SelectOption>
        </Select>
        <Button
          variant="plain"
          class="icon-button"
          :disabled="index === exercises.length - 1 || loading || switching || runBusy"
          :data-disabled-reason="
            index === exercises.length - 1 ? '已经是最后一道练习' : switchingReason
          "
          aria-label="下一道授课练习"
          @click="next(1)">
          <ChevronRight :size="20" />
        </Button>
      </div>
      <div class="inline-items">
        <ThemeToggle />
        <Button variant="outline" @click="openMonitor">
          <Users />
          巡视窗口
          <span class="online-count">{{ counts.online }}</span>
        </Button>
        <Button
          variant="plain"
          class="icon-button"
          :aria-label="fullscreen ? '退出授课全屏' : '授课全屏'"
          @click="toggleFullscreen">
          <Minimize v-if="fullscreen" :size="19" />
          <Maximize v-else :size="19" />
        </Button>
      </div>
    </header>
    <div class="teaching-stage">
      <Alert v-if="monitorBlocked" type="warning">
        独立窗口被拦截。
        <a href="/teacher/monitor" target="_blank" rel="noopener" class="text-button">
          点此打开巡视窗口
        </a>
      </Alert>
      <Alert v-if="runError" role="alert" type="error">{{ runError }}</Alert>
      <Alert v-if="otherRun" type="warning">
        其他练习或课堂仍有运行任务（{{ otherRun.status }}）。
        <template #actions>
          <Button
            variant="outline"
            size="sm"
            :disabled="stopping"
            data-disabled-reason="正在停止程序，请稍候"
            @click="stopRun">
            停止运行
          </Button>
        </template>
      </Alert>
      <Alert v-if="error" role="alert" type="error">
        {{ error }}

        <template #actions>
          <Button variant="outline" size="sm" @click="load">重试读取</Button>
        </template>
      </Alert>
      <Alert v-if="conflict" role="alert" type="warning">
        其他窗口已修改示范代码。先下载本机修改，再读取服务器版本。

        <template #actions>
          <Button variant="outline" size="sm" @click="useServer">
            下载本机修改并读取服务器版本
          </Button>
        </template>
      </Alert>

      <SplitterGroup
        :key="mode"
        as="article"
        direction="horizontal"
        :auto-save-id="'teacher-teaching-layout-' + mode"
        class="teaching-slide"
        :class="{ 'with-code': mode !== '题面', 'teaching-split': mode === '对照' }"
        :keyboard-resize-by="2">
        <SplitterPanel
          v-if="mode !== '代码'"
          id="teaching-problem"
          as="section"
          class="teaching-problem"
          :style="{ overflow: 'auto' }"
          :default-size="mode === '对照' ? 40 : 100"
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
              <h2>输入</h2>
              <MarkdownContent :source="exercise.input" />
            </div>
            <div>
              <h2>输出</h2>
              <MarkdownContent :source="exercise.output" />
            </div>
          </div>
          <div class="slide-samples">
            <CodeBlock :source="exercise.sampleInput" label="样例输入" empty-text="无输入" />
            <CodeBlock :source="exercise.sampleOutput" label="样例输出" />
          </div>
        </SplitterPanel>
        <SplitterResizeHandle
          v-if="mode === '对照'"
          class="teaching-resize-handle"
          aria-label="调整题面与代码宽度"
          aria-orientation="vertical" />
        <SplitterPanel
          v-if="mode !== '题面'"
          id="teaching-workspace"
          as="section"
          class="teaching-code"
          :default-size="mode === '对照' ? 60 : 100"
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
                  {{ loading ? '读取中…' : saveStatus }}
                </span>
                <Button v-if="dirty && !conflict" variant="plain" size="sm" @click="persist">
                  重试保存
                </Button>
                <div class="inline-items ml-auto">
                  <Button
                    variant="plain"
                    class="icon-button"
                    aria-label="缩小示范代码字号"
                    :disabled="fontSize <= 14"
                    data-disabled-reason="字号已达到最小值 14 px"
                    @click="fontSize -= 2">
                    <Minus :size="15" />
                  </Button>
                  <span>{{ fontSize }} px</span>
                  <Button
                    variant="plain"
                    class="icon-button"
                    aria-label="放大示范代码字号"
                    :disabled="fontSize >= 34"
                    data-disabled-reason="字号已达到最大值 34 px"
                    @click="fontSize += 2">
                    <Plus :size="15" />
                  </Button>
                  <Button
                    variant="plain"
                    class="icon-button"
                    aria-label="下载教师示范代码"
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
                    data-disabled-reason="正在停止程序，请稍候"
                    @click="stopRun">
                    <Square :size="14" />
                    {{ stopping ? '停止中…' : '停止' }}
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
                          ? '正在切换练习，请稍候'
                          : runningRequest
                            ? '正在创建运行任务，请稍候'
                            : '教师已关闭课堂运行功能'
                    "
                    @click="startRun">
                    <Play :size="14" />
                    {{ runningRequest ? '提交中…' : '运行' }}
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
              aria-label="调整代码与输入输出高度"
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
                    <label for="teaching-stdin">标准输入</label>
                    <Button
                      variant="plain"
                      size="sm"
                      class="ml-auto"
                      :disabled="runBusy"
                      :data-disabled-reason="runBusyReason"
                      @click="input = exercise.sampleInput">
                      填入样例
                    </Button>
                  </div>
                  <Textarea
                    id="teaching-stdin"
                    v-model="input"
                    :disabled="runBusy"
                    :data-disabled-reason="runBusyReason"
                    :maxlength="65536"
                    placeholder="运行前输入，默认使用题目样例" />
                  <label class="teaching-interactive">
                    <Checkbox
                      v-model="interactive"
                      :disabled="runBusy"
                      :data-disabled-reason="runBusyReason" />
                    交互输入
                  </label>
                </SplitterPanel>
                <SplitterResizeHandle
                  class="teaching-resize-handle"
                  aria-label="调整输入与输出宽度"
                  aria-orientation="vertical" />
                <SplitterPanel
                  id="teaching-output"
                  class="teaching-output"
                  :default-size="70"
                  :min-size="35">
                  <RunOutput
                    :run="run"
                    :language="language"
                    :interactive="run?.status === '运行中／可输入' && run.interactive"
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
    <h1>课堂还没有练习</h1>
    <RouterLink to="/teacher/exercises/new">创建第一个练习</RouterLink>
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
