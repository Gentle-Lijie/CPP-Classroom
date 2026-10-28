<script setup lang="ts">
import { Alert } from '@/components/ui/alert'
import { exerciseSourceFilename } from '@classroom/contracts'
import ThemeToggle from '@/components/classroom/ThemeToggle.vue'
import { Select, SelectOption } from '@/components/ui/select'
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
} from '@lucide/vue'
import { Button } from '@/components/ui/button'
import MarkdownContent from '@/components/classroom/MarkdownContent.vue'
import CodeEditor from '@/components/classroom/CodeEditor.vue'
import {
  activeClassroom,
  counts,
  demo,
  exercises,
  notify,
  download,
  currentUser,
  executionSettings,
} from '@/data/demo'
import { confirmAction } from '@/lib/confirm'
import { api, ApiError } from '@/lib/api'
import { openTeachingWindow } from '@/lib/teaching-windows'
const route = useRoute()
const router = useRouter()
const initial = String(route.query.exercise ?? demo.recommended)
const selected = ref(exercises.some((e) => e.id === initial) ? initial : (exercises[0]?.id ?? ''))
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
const exercise = computed(() => {
  const found = exercises.find((e) => e.id === selected.value)
  return found
    ? { ...found, filename: exerciseSourceFilename(found), title: found.title || '未命名题目' }
    : undefined
})
const index = computed(() => exercises.findIndex((e) => e.id === selected.value))
const readonly = computed(
  () =>
    loading.value || !!error.value || conflict.value || activeClassroom.value.status !== '进行中',
)
let revision = 0,
  generation = 0
let timer: ReturnType<typeof setTimeout>
let saving: Promise<boolean> | undefined
function context() {
  return {
    id: selected.value,
    classroom: demo.classroomId,
    user: currentUser.value?.id,
    generation,
  }
}
function matches(c: ReturnType<typeof context>) {
  return (
    c.id === selected.value &&
    c.classroom === demo.classroomId &&
    c.user === currentUser.value?.id &&
    c.generation === generation
  )
}
const draftPath = (c: ReturnType<typeof context>) =>
  '/classes/' + c.classroom + '/workspace/' + c.id
const backupKey = (c: ReturnType<typeof context>) =>
  `cpp-teacher-draft:${c.user}:${c.classroom}:${c.id}`
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
watch(selected, () => void load(), { immediate: true })
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
async function switchExercise(id: string) {
  if (switching.value || loading.value || id === selected.value) return
  switching.value = true
  try {
    if (!(await persist())) {
      notify('示范代码尚未同步，请先重试或下载备份', 'error')
      return
    }
    selected.value = id
  } finally {
    switching.value = false
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
  download('未同步示范-' + (exercise.value?.filename ?? 'source.cpp'), teacherCode.value)
  try {
    localStorage.removeItem(backupKey(context()))
  } catch {
    /* Download already preserves the local copy. */
  }
  await load()
}
function beforeUnload(event: BeforeUnloadEvent) {
  if (dirty.value) {
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
  if (dirty.value && activeClassroom.value.status !== '进行中') {
    if (!(await confirmAction('课堂已只读，示范修改无法上传。下载代码备份后离开？'))) return false
    download('未同步示范-' + (exercise.value?.filename ?? 'source.cpp'), teacherCode.value)
    return true
  }
  return persist()
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
  if (target.closest('.monaco-editor,input,textarea,select,[contenteditable=true]')) return
  if (event.key === 'ArrowRight' || event.key === 'PageDown') {
    event.preventDefault()
    next(1)
  } else if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
    event.preventDefault()
    next(-1)
  }
}
onMounted(() => {
  window.addEventListener('beforeunload', beforeUnload)
  document.addEventListener('keydown', keyboard)
  document.addEventListener('fullscreenchange', fullscreenChange)
})
onBeforeUnmount(() => {
  generation++
  clearTimeout(timer)
  window.removeEventListener('beforeunload', beforeUnload)
  document.removeEventListener('keydown', keyboard)
  document.removeEventListener('fullscreenchange', fullscreenChange)
})
</script>
<template>
  <main v-if="exercise" class="teaching-page">
    <header class="teaching-toolbar">
      <div class="inline-items">
        <RouterLink to="/teacher/exercises" class="icon-button" aria-label="结束授课"
          ><ArrowLeft :size="19" /></RouterLink
        ><span class="teaching-mark"><Monitor :size="19" />授课模式</span
        ><span class="teaching-class-name">{{ activeClassroom.name }}</span
        ><span class="demo-tag">教师授课</span>
      </div>
      <div class="inline-items">
        <ThemeToggle />
        <Button variant="outline" @click="openMonitor"
          ><Users />巡视窗口<span class="online-count">{{ counts.online }}</span></Button
        ><Button
          variant="plain"
          class="icon-button"
          :aria-label="fullscreen ? '退出授课全屏' : '授课全屏'"
          @click="toggleFullscreen"
        >
          <Minimize v-if="fullscreen" :size="19" /><Maximize v-else :size="19" />
        </Button>
      </div>
    </header>
    <div class="teaching-stage">
      <Alert v-if="monitorBlocked" type="warning">
        独立窗口被拦截。<a
          href="/teacher/monitor"
          target="_blank"
          rel="noopener"
          class="text-button"
          >点此打开巡视窗口</a
        >
      </Alert>
      <Alert v-if="error" role="alert" type="error">
        {{ error }}

        <template #actions
          ><Button variant="outline" size="sm" @click="load">重试读取</Button></template
        >
      </Alert>
      <Alert v-if="conflict" role="alert" type="warning">
        其他窗口已修改示范代码。先下载本机修改，再读取服务器版本。

        <template #actions
          ><Button variant="outline" size="sm" @click="useServer"
            >下载本机修改并读取服务器版本</Button
          ></template
        >
      </Alert>
      <div class="teaching-slide-meta">
        <span class="inline-items"
          ><span class="lesson-number">{{ String(index + 1).padStart(2, '0') }}</span
          >{{ exercise.topic
          }}<span class="status" :class="exercise.status === '已发布' ? 'positive' : 'amber'">{{
            exercise.status
          }}</span></span
        >
        <div class="inline-items">
          <span>{{ exercise.filename }}</span
          ><Button
            variant="plain"
            class="text-button"
            @click="router.push('/teacher/exercises/' + exercise.id + '/edit')"
          >
            <Pencil :size="13" />编辑题目
          </Button>
        </div>
      </div>
      <article
        class="teaching-slide"
        :class="{ 'with-code': mode !== '题面', 'teaching-split': mode === '对照' }"
      >
        <section v-if="mode !== '代码'" class="teaching-problem">
          <div class="slide-title-row">
            <h1>{{ exercise.title }}</h1>
            <span>{{
              executionSettings.compilerProfile === 'gcc13-cpp20' ? 'C++20' : 'C++17'
            }}</span>
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
            <div>
              <span>样例输入 <small>stdin</small></span>
              <pre>{{ exercise.sampleInput || '—' }}</pre>
            </div>
            <div>
              <span>样例输出 <small>stdout</small></span>
              <pre>{{ exercise.sampleOutput || '—' }}</pre>
            </div>
          </div>
        </section>
        <section v-if="mode !== '题面'" class="teaching-code">
          <div class="code-toolbar">
            <CodeXml :size="16" /><strong>{{ exercise.filename }}</strong
            ><span class="muted">教师示范草稿</span>
            <div class="inline-items ml-auto">
              <Button
                variant="plain"
                class="icon-button"
                aria-label="缩小示范代码字号"
                :disabled="fontSize <= 14"
                @click="fontSize -= 2"
              >
                <Minus :size="15" /></Button
              ><span>{{ fontSize }} px</span
              ><Button
                variant="plain"
                class="icon-button"
                aria-label="放大示范代码字号"
                :disabled="fontSize >= 34"
                @click="fontSize += 2"
              >
                <Plus :size="15" /></Button
              ><Button
                variant="plain"
                class="icon-button"
                aria-label="下载教师示范代码"
                @click="download(exercise.filename, teacherCode)"
              >
                <Download :size="15" />
              </Button>
            </div>
          </div>
          <CodeEditor
            v-model="teacherCode"
            :readonly="readonly"
            :font-size="fontSize"
            :filename="exercise.filename"
          />
          <div class="teaching-code-note">
            <span
              role="status"
              :class="{ 'danger-text': conflict || error, 'amber-text': dirty }"
              >{{ loading ? '读取中…' : saveStatus }}</span
            ><Button v-if="dirty && !conflict" variant="plain" class="text-button" @click="persist"
              >重试保存</Button
            ><span>教师示范代码独立保存，不修改学生作品。此处不执行程序。</span>
          </div>
        </section>
      </article>
      <div class="teaching-bottom">
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
            @click="mode = m.label"
          >
            <component :is="m.icon" :size="16" />{{ m.label }}
          </Button>
        </div>
        <span class="teaching-keyboard-hint">← → 切换练习</span>
        <div class="teaching-pagination">
          <Button
            variant="plain"
            class="icon-button"
            :disabled="index <= 0 || loading || switching"
            aria-label="上一道授课练习"
            @click="next(-1)"
          >
            <ChevronLeft :size="20" /></Button
          ><Select
            :model-value="selected"
            :disabled="loading || switching"
            aria-label="授课练习"
            @update:model-value="changeExercise"
          >
            <SelectOption v-for="(e, i) in exercises" :key="e.id" :value="e.id">
              {{ i + 1 }} / {{ exercises.length }} · {{ e.title || '未命名题目' }}
            </SelectOption></Select
          ><Button
            variant="plain"
            class="icon-button"
            :disabled="index === exercises.length - 1 || loading || switching"
            aria-label="下一道授课练习"
            @click="next(1)"
          >
            <ChevronRight :size="20" />
          </Button>
        </div>
      </div>
    </div>
  </main>
  <div v-else class="empty-state">
    <BookOpen :size="32" />
    <h1>课堂还没有练习</h1>
    <RouterLink to="/teacher/exercises/new">创建第一个练习</RouterLink>
  </div>
</template>
