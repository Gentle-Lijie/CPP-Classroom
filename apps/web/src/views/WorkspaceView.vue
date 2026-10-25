<script setup lang="ts">
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
  ChevronDown,
  Settings2,
  WifiOff,
  Monitor,
} from '@lucide/vue'
import { SplitterGroup, SplitterPanel, SplitterResizeHandle } from 'reka-ui'
import { Button } from '@/components/ui/button'
import Modal from '@/components/classroom/Modal.vue'
import CodeEditor from '@/components/classroom/CodeEditor.vue'
import RunOutput from '@/components/classroom/RunOutput.vue'
import MarkdownContent from '@/components/classroom/MarkdownContent.vue'
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
import { api, ApiError } from '@/lib/api'
const route = useRoute(),
  router = useRouter()
const initial = String(route.query.exercise ?? demo.recommended ?? '')
const selected = ref(exercises.some((e) => e.id === initial) ? initial : (exercises[0]?.id ?? ''))
const exercise = computed(() => exercises.find((e) => e.id === selected.value))
const code = ref(''),
  input = ref(''),
  panel = ref('题目'),
  helpText = ref(''),
  fontSize = ref(14)
const help = ref(false),
  submit = ref(false),
  submitted = ref(false),
  reset = ref(false)
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
const saveState = ref('读取中…'),
  loadError = ref(''),
  actionError = ref('')
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
  () => activeClassroom.value.status !== '进行中' || exercise.value?.status !== '已发布',
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
const runtime = computed(() => run.value?.status === '运行中／可输入')
const active = () => !!run.value && ['排队', '编译中', '运行中／可输入'].includes(run.value.status)
let generation = 0,
  saving: Promise<boolean> | undefined
let saveTimer: ReturnType<typeof setTimeout>
let polling = false,
  historyGeneration = 0
const context = () => ({
  classroom: demo.classroomId,
  exercise: selected.value,
  user: currentUser.value?.id,
  generation,
})
const matches = (c: ReturnType<typeof context>) =>
  c.classroom === demo.classroomId &&
  c.exercise === selected.value &&
  c.user === currentUser.value?.id &&
  c.generation === generation
const path = (c: ReturnType<typeof context>, suffix: string) => '/classes/' + c.classroom + suffix
function backup() {
  if (!selected.value || !currentUser.value) return
  try {
    localStorage.setItem(
      draftStorageKey(selected.value),
      JSON.stringify({ code: code.value, revision: revision.value, pending: dirty.value }),
    )
  } catch {
    saveState.value = '本机备份不可用，正在尝试服务器保存'
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
        `/runs?exercise=${c.exercise}&page=${historyPage.value}&pageSize=${historySize.value}`,
      ),
    )
    if (matches(c) && request === historyGeneration) {
      history.value = result.items
      historyTotal.value = result.total
    }
  } catch (e) {
    if (matches(c) && request === historyGeneration)
      historyError.value = e instanceof Error ? e.message : '历史加载失败'
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
  saveState.value = '读取中…'
  if (!c.exercise) {
    loading.value = false
    loadError.value = '课堂还没有可访问的练习'
    return
  }
  try {
    const remote = await api<{
      code: string
      revision: number
      submitted?: boolean
      submittedAt?: string
      help?: { message: string } | null
    }>(path(c, '/workspace/' + c.exercise))
    if (!matches(c)) return
    code.value = remote.code
    revision.value = remote.revision
    submitted.value = !!remote.submitted
    submittedAt.value = remote.submittedAt ?? ''
    helpSent.value = !!remote.help
    helpText.value = remote.help?.message ?? ''
    try {
      const local = JSON.parse(localStorage.getItem(draftStorageKey(c.exercise)) ?? 'null')
      if (local?.pending && typeof local.code === 'string') {
        code.value = local.code
        dirty.value = true
        if (local.revision !== remote.revision) {
          conflict.value = true
          saveState.value = '版本冲突：本机修改已保留'
        }
      }
    } catch {
      /* Server content remains usable if browser storage is unavailable. */
    }
    if (!conflict.value) saveState.value = dirty.value ? '本机修改待同步' : '已同步到服务器'
    const activeRuns = await api<(RunRecord & { classroomId?: string })[]>(
      path(c, '/runs?active=true&scope=all'),
    )
    if (!matches(c)) return
    run.value = activeRuns.find((r) => r.exerciseId === c.exercise)
    otherRun.value = activeRuns.find((r) => r.exerciseId !== c.exercise)
    await loadHistory()
  } catch (e) {
    if (matches(c)) {
      loadError.value = e instanceof Error ? e.message : '读取失败，请重试'
      saveState.value = '读取失败'
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
  saveState.value = '同步中…'
  saving = (async () => {
    try {
      const result = await api<{ revision: number }>(path(c, '/workspace/' + c.exercise), 'PUT', {
        code: content,
        revision: expectedRevision,
      })
      if (!matches(c)) return false
      revision.value = result.revision
      dirty.value = code.value !== content
      saveState.value = dirty.value ? '待同步' : '已同步到服务器'
      backup()
      return true
    } catch (e) {
      if (!matches(c)) return false
      backup()
      saveState.value =
        e instanceof ApiError && e.status === 409
          ? '版本冲突：请先下载本机修改再读取服务器版本'
          : '网络异常：等待重试，请保留本页面'
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
  saveState.value = '待同步'
  backup()
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => void saveNow(), 600)
})
watch(selected, () => void loadCode(), { immediate: true })
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
  const c = context()
  try {
    const remote = await api<{ code: string; revision: number }>(
      path(c, '/workspace/' + c.exercise),
    )
    if (!matches(c)) return
    download('本机未同步-' + exercise.value!.filename, code.value)
    loading.value = true
    code.value = remote.code
    revision.value = remote.revision
    dirty.value = false
    conflict.value = false
    backup()
    await nextTick()
    loading.value = false
    saveState.value = '已采用服务器版本，本机修改已下载'
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
    if (!(await saveNow()) || !matches(c)) throw new Error('请先完成草稿同步')
    const result = await api<RunRecord>(path(c, '/runs'), 'POST', {
      exerciseId: c.exercise,
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
    actionError.value = e instanceof Error ? e.message : '运行失败'
    reportError(e)
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
    throw new Error('停止请求已发送，程序尚在结束，请稍后重试')
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
    notify('stdin 已关闭，等待程序结束')
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
    if (!(await saveNow()) || !matches(c)) throw new Error('请先同步草稿')
    await api(path(c, '/submissions'), 'POST', { exerciseId: c.exercise, revision: revision.value })
    if (matches(c)) {
      submitted.value = true
      submittedAt.value = new Date().toISOString()
      submit.value = false
      notify('当前代码版本已提交，之后仍可继续修改')
    }
  } catch (e) {
    actionError.value = e instanceof Error ? e.message : '提交失败'
  } finally {
    submitting.value = false
  }
}
function resetCode() {
  undo.value = code.value
  code.value = exercise.value!.code
  reset.value = false
}
async function sendHelp() {
  if (helping.value) return
  helping.value = true
  actionError.value = ''
  const c = context()
  try {
    await api(path(c, '/help'), 'POST', { exerciseId: c.exercise, message: helpText.value.trim() })
    if (matches(c)) {
      helpSent.value = true
      help.value = false
      notify('求助已发送给教师')
    }
  } catch (e) {
    actionError.value = e instanceof Error ? e.message : '发送失败'
  } finally {
    helping.value = false
  }
}
async function heartbeat() {
  if (loading.value || loadError.value || !selected.value) return
  try {
    const c = context()
    await api(path(c, '/heartbeat'), 'POST', { exerciseId: c.exercise })
    const requests = await api<{ message: string; resolved: boolean }[]>(
      path(c, '/help?exerciseId=' + c.exercise),
    )
    if (matches(c)) {
      const unresolved = requests.find((request) => !request.resolved)
      helpSent.value = !!unresolved
      if (!help.value) helpText.value = unresolved?.message ?? ''
    }
  } catch {
    if (!dirty.value) saveState.value = '无法连接课堂，请检查网络或成员权限'
  }
}
async function switchTo(id: string) {
  if (switching.value || loading.value || runningRequest.value) return
  switching.value = true
  try {
    if ((await directoryPanel.value?.flush()) === false || (dirty.value && !(await saveNow()))) {
      notify('当前修改尚未保存，请先处理保存问题', 'error')
      return
    }
    selected.value = id
  } finally {
    switching.value = false
  }
}
async function returnToRunning() {
  const target = otherRun.value
  if (!target?.exerciseId) return
  if (!target.classroomId || target.classroomId === demo.classroomId) {
    await switchTo(target.exerciseId)
    return
  }
  await router.push('/student/classes')
  if (router.currentRoute.value.path !== '/student/classes') return
  await selectClass(target.classroomId)
  await router.push({ path: '/student/workspace', query: { exercise: target.exerciseId } })
}
async function changeExercise(event: Event) {
  const element = event.target as HTMLSelectElement,
    id = element.value
  element.value = selected.value
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
  if (polling || loading.value || loadError.value) return
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
        !['排队', '编译中', '运行中／可输入'].includes(result.status)
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
onBeforeUnmount(() => {
  generation++
  clearTimeout(saveTimer)
  clearInterval(poll)
  clearInterval(pulse)
  window.removeEventListener('beforeunload', unload)
})
onBeforeRouteLeave(async (to) => {
  if (to.path === '/login' && !currentUser.value) {
    backup()
    return true
  }
  if (runningRequest.value || submitting.value || helping.value || stopping.value) {
    notify('操作尚在进行，请稍后离开')
    return false
  }
  if (active() && !window.confirm('程序仍在运行。离开后程序会继续，可返回本练习停止。确认离开？'))
    return false
  if ((await directoryPanel.value?.flush()) === false) {
    notify('本地文件尚未保存，请先处理目录冲突或下载备份', 'error')
    return false
  }
  if (dirty.value && isArchived.value) {
    if (!window.confirm('课堂或练习已只读，未同步修改无法上传。下载本机代码备份后离开？'))
      return false
    download('未同步-' + (exercise.value?.filename ?? 'source.cpp'), code.value)
    return true
  }
  return !dirty.value || (await saveNow())
})
</script>
<template>
  <div v-if="exercise" class="ide-page">
    <header class="workspace-toolbar">
      <RouterLink to="/student/classes" class="icon-button" aria-label="返回我的课堂"
        ><ArrowLeft :size="18"
      /></RouterLink>
      <div class="workspace-context">
        <span class="workspace-classroom" :title="activeClassroom.name">{{
          activeClassroom.name
        }}</span>
        <label class="workspace-exercise"
          ><BookOpen :size="16" /><select
            :value="selected"
            aria-label="选择练习"
            :disabled="loading || switching || runningRequest"
            @change="changeExercise"
          >
            <option
              v-for="e in exercises.filter((e) => e.status === '已发布' || e.id === selected)"
              :key="e.id"
              :value="e.id"
            >
              {{ e.title }}
            </option>
          </select></label
        >
      </div>
      <span v-if="submitted" class="status positive"><Check :size="12" />已提交</span>
      <span
        class="save-label workspace-save"
        :class="{
          'save-error':
            conflict ||
            loadError ||
            saveState.includes('异常') ||
            saveState.includes('无法') ||
            saveState.includes('不可用'),
          'save-pending': dirty || loading,
        }"
        role="status"
        :title="saveState"
        ><WifiOff
          v-if="
            conflict ||
            loadError ||
            saveState.includes('异常') ||
            saveState.includes('无法') ||
            saveState.includes('不可用')
          "
          :size="15"
        /><CloudCheck v-else :size="15" /><span>{{ saveState }}</span></span
      >
      <div class="workspace-actions">
        <LocalDirectoryPanel
          ref="directoryPanel"
          v-model="code"
          :classroom-id="demo.classroomId"
          :exercise-id="selected"
          :filename="exercise.filename"
          :readonly="readonly"
          compact
        />
        <Button variant="outline" size="sm" :disabled="readonly" @click="openHelp"
          ><Hand />{{ helpSent ? '已求助' : '求助' }}</Button
        >
        <Button
          variant="outline"
          size="sm"
          :disabled="readonly || (submitted && activeClassroom.settings?.allowResubmit === false)"
          @click="openSubmit"
          ><Send />提交作品</Button
        >
        <Button
          v-if="runtime || run?.status === '排队' || run?.status === '编译中'"
          variant="destructive"
          size="sm"
          :disabled="stopping"
          @click="stop"
          ><Square />{{ stopping ? '停止中…' : '停止' }}</Button
        >
        <Button
          :disabled="readonly || runningRequest || active() || !!otherRun"
          size="sm"
          @click="startRun"
          ><Play />{{ runningRequest ? '正在创建…' : '编译运行' }}</Button
        >
        <span class="avatar small" :title="currentUser?.name">{{
          currentUser?.name.slice(-1)
        }}</span>
      </div>
    </header>
    <div v-if="otherRun" class="workspace-alert amber">
      {{
        classrooms.find((c) => c.id === otherRun?.classroomId)?.name ?? '另一道练习'
      }}仍有运行中的任务，结束后才能运行本题。<button @click="returnToRunning">
        返回该练习控制运行
      </button>
    </div>
    <div v-if="loading" class="workspace-alert" role="status">正在读取草稿，请稍候…</div>
    <div v-if="loadError" class="workspace-alert amber" role="alert">
      {{ loadError }}<button @click="loadCode">重新读取</button>
    </div>
    <div v-if="viewing" class="workspace-alert amber">
      <History :size="14" />正在查看 {{ viewing.id }} 的只读代码快照，当前草稿独立保留。<button
        @click="viewing = undefined"
      >
        返回当前草稿 <ArrowLeft :size="13" />
      </button>
    </div>
    <div v-if="conflict" class="workspace-alert amber">
      <WifiOff :size="14" />{{ saveState
      }}<button @click="useServer">下载本机修改并读取服务器版本</button>
    </div>
    <div v-else-if="isArchived" class="workspace-alert amber">
      当前课堂或练习只读，作品与历史保留。
    </div>
    <SplitterGroup
      direction="horizontal"
      auto-save-id="student-workspace-columns"
      class="workspace-layout"
      :keyboard-resize-by="2"
    >
      <SplitterPanel
        id="workspace-problem"
        as="aside"
        class="ide-problem"
        :default-size="34"
        :min-size="26"
        :max-size="50"
      >
        <div class="problem-tabs">
          <button :class="{ selected: panel === '题目' }" @click="panel = '题目'">
            <BookOpen :size="15" />题目说明</button
          ><button :class="{ selected: panel === '历史' }" @click="panel = '历史'">
            <History :size="15" />运行历史
          </button>
        </div>
        <div v-if="panel === '题目'" class="problem-content">
          <span class="topic-label"
            >练习 {{ exercises.findIndex((e) => e.id === selected) + 1 }} ·
            {{ exercise.topic }}</span
          >
          <h1>{{ exercise?.title }}</h1>
          <div class="problem-limits">
            <span>{{ executionSettings.runTimeMs }} ms</span
            ><span>{{ executionSettings.runMemoryMb }} MiB</span>
          </div>
          <MarkdownContent :source="exercise.description" />
          <h3>输入说明</h3>
          <MarkdownContent :source="exercise.input" />
          <h3>输出说明</h3>
          <MarkdownContent :source="exercise.output" />
          <h3>样例</h3>
          <div class="sample-grid stacked">
            <div>
              <span>输入</span>
              <pre>{{ exercise.sampleInput }}</pre>
            </div>
            <div>
              <span>输出</span>
              <pre>{{ exercise.sampleOutput }}</pre>
            </div>
          </div>
          <div class="problem-tip">
            <strong>想一想</strong>
            <p>先检查样例的输入和预期输出，再逐步编写程序。</p>
          </div>
          <div class="privacy-note">
            <Monitor :size="15" /><span
              >课堂内的教师可以查看你的代码和运行记录，及时提供辅导。</span
            >
          </div>
        </div>
        <div v-else class="workspace-history">
          <div class="history-list">
            <p class="form-hint">服务器固定快照，查看历史不会重新运行。</p>
            <button
              v-for="r in history"
              :key="r.id"
              class="history-item"
              :class="{ selected: viewing?.id === r.id }"
              @click="viewing = r"
            >
              <span
                ><strong>{{ r.status }}</strong
                ><small
                  >{{ new Date(r.time).toLocaleString('zh-CN', { hour12: false }) }} ·
                  {{ r.id.slice(0, 8) }}</small
                ></span
              ><History :size="15" />
            </button>
            <p v-if="historyError" class="error-box" role="alert">
              {{ historyError }} <button class="text-button" @click="loadHistory">重试</button>
            </p>
            <p v-else-if="!history.length" class="small-empty">本练习还没有运行记录。</p>
          </div>
          <Pagination
            v-model:page="historyPage"
            v-model:page-size="historySize"
            :total="historyTotal"
            :busy="loading"
            unit="条记录"
          />
        </div>
      </SplitterPanel>
      <SplitterResizeHandle
        class="workspace-resize-handle"
        aria-label="调整题目与代码区宽度"
        aria-orientation="vertical"
      />
      <SplitterPanel id="workspace-main" :default-size="66" :min-size="50" class="workspace-main">
        <SplitterGroup
          direction="vertical"
          auto-save-id="student-workspace-rows"
          class="workspace-editor-split"
          :keyboard-resize-by="2"
        >
          <SplitterPanel
            id="workspace-editor"
            as="section"
            class="editor-area"
            :default-size="64"
            :min-size="35"
          >
            <div class="code-toolbar">
              <span class="file-tab"
                ><CodeXml :size="15" />{{ viewing?.filename ?? exercise.filename }}
                <i v-if="!readonly" class="file-dot" /><span v-if="readonly" class="muted"
                  >只读</span
                ></span
              >
              <div class="inline-items ml-auto">
                <label class="compact-select"
                  ><Settings2 :size="13" /><select
                    v-model.number="fontSize"
                    aria-label="编辑器字号"
                  >
                    <option :value="14">14 px</option>
                    <option :value="16">16 px</option>
                    <option :value="18">18 px</option>
                  </select></label
                ><button
                  class="icon-button"
                  aria-label="下载当前代码"
                  @click="download(viewing?.filename ?? exercise.filename, viewing?.code ?? code)"
                >
                  <Download :size="14" /></button
                ><button
                  v-if="undo !== undefined"
                  class="text-button"
                  :disabled="readonly"
                  @click="
                    () => {
                      code = undo ?? code
                      undo = undefined
                      notify('已恢复重置前的本机代码')
                    }
                  "
                >
                  撤销重置</button
                ><button
                  v-else
                  class="icon-button"
                  aria-label="重置初始代码"
                  :disabled="readonly"
                  @click="reset = true"
                >
                  <RotateCcw :size="14" /></button
                ><span class="language-label"
                  >{{
                    compilerLabel(
                      viewing ? viewing.compilerProfile : executionSettings.compilerProfile,
                    )
                  }}<ChevronDown :size="11"
                /></span>
              </div>
            </div>
            <CodeEditor
              :model-value="viewing?.code ?? code"
              :readonly="readonly"
              :font-size="fontSize"
              :filename="viewing?.filename ?? exercise.filename"
              @update:model-value="!readonly && (code = $event)"
            />
          </SplitterPanel>
          <SplitterResizeHandle
            class="workspace-resize-handle"
            aria-label="调整代码与输入输出高度"
            aria-orientation="horizontal"
          />
          <SplitterPanel id="workspace-io" class="workspace-io" :default-size="36" :min-size="22">
            <SplitterGroup
              direction="horizontal"
              auto-save-id="student-workspace-input-output"
              class="workspace-io-split"
              :keyboard-resize-by="2"
            >
              <SplitterPanel
                id="workspace-input"
                as="section"
                class="stdin-panel"
                :default-size="30"
                :min-size="22"
                :max-size="55"
              >
                <div class="code-toolbar">
                  <span>输入</span><span class="muted text-xs">stdin</span
                  ><button
                    class="text-button ml-auto"
                    :disabled="!!viewing"
                    @click="
                      () => {
                        input = exercise?.sampleInput ?? ''
                        notify('已填入题目样例')
                      }
                    "
                  >
                    填入样例
                  </button>
                </div>
                <textarea
                  v-if="!viewing"
                  v-model="input"
                  aria-label="标准输入"
                  placeholder="运行前填写标准输入…"
                  :readonly="isArchived"
                />
                <pre v-else class="snapshot-input">{{ viewing.input }}</pre>
                <div class="stdin-note">
                  <span v-if="viewing">本次运行使用的固定输入</span>
                  <label v-else class="inline-items" title="运行后可逐行发送输入，最长 60 秒">
                    <input v-model="interactive" type="checkbox" :disabled="active()" />运行时输入
                  </label>
                </div>
              </SplitterPanel>
              <SplitterResizeHandle
                class="workspace-resize-handle"
                aria-label="调整输入与输出宽度"
                aria-orientation="vertical"
              />
              <SplitterPanel
                id="workspace-output"
                :default-size="70"
                :min-size="45"
                class="workspace-output"
              >
                <RunOutput
                  :key="(viewing ?? run)?.id"
                  :run="viewing ?? run"
                  :interactive="runtime && !viewing && !run?.eof"
                  :send-input="sendLine"
                  :close-input="eof"
                />
              </SplitterPanel>
            </SplitterGroup>
          </SplitterPanel>
        </SplitterGroup>
      </SplitterPanel>
    </SplitterGroup>
    <footer class="ide-statusbar">
      <span
        ><span
          class="live-dot"
          :class="{
            'sync-unavailable':
              !!loadError ||
              conflict ||
              dirty ||
              saveState.includes('异常') ||
              saveState.includes('无法') ||
              saveState.includes('不可用'),
          }"
        />{{ loading ? '读取中' : readonly ? '只读工作区' : dirty ? '等待同步' : saveState }}</span
      ><span class="ml-auto"
        >UTF-8
        <span class="desktop-only"
          >· GCC 13.3 /
          {{ executionSettings.compilerProfile === 'gcc13-cpp20' ? 'C++20' : 'C++17' }}</span
        ></span
      >
    </footer>
  </div>
  <Modal
    v-model:open="help"
    title="告诉老师，你遇到了什么？"
    description="教师会结合你的代码和运行上下文提供帮助。"
    ><form class="form-stack" @submit.prevent="sendHelp">
      <label
        >求助说明<textarea
          v-model="helpText"
          rows="4"
          placeholder="例如：循环里的变量应该怎么初始化？"
          maxlength="300"
          required
        />
      </label>
      <div class="info-box">
        关联练习：{{ exercise?.title }}<br />关联运行：{{ run?.id ?? '无最近运行' }}
      </div>
      <p v-if="actionError" class="error-box" role="alert">{{ actionError }}</p>
      <div class="modal-actions">
        <Button type="button" variant="outline" :disabled="helping" @click="help = false"
          >取消</Button
        ><Button type="submit" :disabled="helping || !helpText.trim()"
          ><Hand />{{ helping ? '发送中…' : helpSent ? '更新求助' : '发起求助' }}</Button
        >
      </div>
    </form></Modal
  >
  <Modal
    v-model:open="submit"
    title="提交当前作品？"
    description="提交会保存固定代码版本，你仍然可以继续修改。"
    ><div class="info-box">
      {{ exercise?.title }} · {{ exercise?.filename }}<br />提交保存到服务器。提交不等于通过判题。
    </div>
    <p v-if="actionError" class="error-box" role="alert">{{ actionError }}</p>
    <p v-if="submittedAt" class="form-hint">
      最近提交：{{ new Date(submittedAt).toLocaleString('zh-CN') }}
    </p>
    <div class="modal-actions">
      <Button variant="outline" :disabled="submitting" @click="submit = false">继续修改</Button
      ><Button :disabled="submitting" @click="doSubmit"
        ><Send />{{ submitting ? '提交中…' : '确认提交' }}</Button
      >
    </div></Modal
  >
  <Modal
    v-model:open="reset"
    title="重置为初始代码？"
    description="当前代码会保留在本次页面的恢复区，可通过工具栏撤销。"
    ><div class="modal-actions">
      <Button variant="outline" @click="reset = false">保留当前代码</Button
      ><Button variant="destructive" @click="resetCode">确认重置</Button>
    </div></Modal
  >
  <Modal
    :open="!!pendingExercise"
    title="先停止当前运行再切换练习？"
    description="当前程序尚未结束。停止后将保留代码与运行记录，再打开所选练习。"
    @update:open="!$event && !stopping && (pendingExercise = '')"
    ><div class="modal-actions">
      <Button variant="outline" :disabled="stopping" @click="pendingExercise = ''"
        >留在当前练习</Button
      ><Button variant="destructive" :disabled="stopping" @click="stopAndSwitch">{{
        stopping ? '等待程序停止…' : '停止并切换'
      }}</Button>
    </div></Modal
  >
  <div v-if="!exercise" class="empty-state">
    <BookOpen :size="32" />
    <h1>暂无可访问的练习</h1>
    <p>教师发布练习后即可进入工作区。</p>
    <RouterLink to="/student/classes">返回我的课堂</RouterLink>
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
  font-size: 11px;
  color: var(--ui-muted);
}
.workspace-exercise {
  display: flex;
  align-items: center;
  gap: 7px;
  color: var(--ui-action);
}
.workspace-exercise select {
  width: 100%;
  max-width: 320px;
  border: 0;
  padding: 2px 18px 2px 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--ui-ink);
  text-overflow: ellipsis;
}
.workspace-save {
  margin-left: 0;
  font-size: 12px;
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
  font-size: 11px;
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
  font-size: 12px;
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
.live-dot.sync-unavailable {
  background: var(--ui-warning);
}
.ide-statusbar {
  font-size: 12px;
  line-height: 1.6;
}
.workspace-alert {
  flex-wrap: wrap;
  font-size: 13px;
  line-height: 1.7;
  flex-shrink: 0;
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
  font-size: 12px;
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
