<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
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
  saveDraft,
  classPath,
  reportError,
  download,
} from '@/data/demo'
import { api } from '@/lib/api'
import { openTeachingWindow } from '@/lib/teaching-windows'
const route = useRoute()
const router = useRouter()
const selected = ref(String(route.query.exercise ?? demo.recommended))
const mode = ref('题面')
const fontSize = ref(20)
const teacherCode = ref('')
const fullscreen = ref(false)
const exercise = computed(() => exercises.find((e) => e.id === selected.value) ?? exercises[0]!)
const index = computed(() => exercises.findIndex((e) => e.id === exercise.value.id))
let revision = 0
let loading = false
let timer: ReturnType<typeof setTimeout>
let saving = false
watch(
  () => exercise.value.id,
  async () => {
    loading = true
    try {
      const draft = await api<{ code: string; revision: number }>(
        classPath('/workspace/' + exercise.value.id),
      )
      teacherCode.value = draft.code
      revision = draft.revision
    } catch (e) {
      reportError(e)
    } finally {
      loading = false
    }
  },
  { immediate: true },
)
watch(teacherCode, () => {
  if (loading) return
  clearTimeout(timer)
  timer = setTimeout(() => void persist(), 600)
})
async function persist() {
  if (saving) return
  saving = true
  const content = teacherCode.value
  try {
    saveDraft(exercise.value.id, content, 'teacher')
    const result = await api<{ revision: number }>(
      classPath('/workspace/' + exercise.value.id),
      'PUT',
      { code: content, revision },
    )
    revision = result.revision
    if (teacherCode.value !== content) {
      timer = setTimeout(() => void persist(), 100)
    }
  } catch (e) {
    reportError(e)
  } finally {
    saving = false
  }
}
function next(step: number) {
  const e = exercises[index.value + step]
  if (e) selected.value = e.id
}
function openMonitor() {
  openTeachingWindow('/teacher/monitor', 'classroom-monitor-' + demo.classroomId, 1120, 820)
}
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
  document.addEventListener('keydown', keyboard)
  document.addEventListener('fullscreenchange', fullscreenChange)
})
onBeforeUnmount(() => {
  clearTimeout(timer)
  document.removeEventListener('keydown', keyboard)
  document.removeEventListener('fullscreenchange', fullscreenChange)
})
</script>
<template>
  <main class="teaching-page">
    <header class="teaching-toolbar">
      <div class="inline-items">
        <RouterLink to="/teacher/exercises" class="icon-button" aria-label="结束授课"
          ><ArrowLeft :size="19" /></RouterLink
        ><span class="teaching-mark"><Monitor :size="19" />授课模式</span
        ><span class="teaching-class-name">{{ activeClassroom.name }}</span
        ><span class="demo-tag">教师授课</span>
      </div>
      <div class="inline-items">
        <Button variant="outline" @click="openMonitor"
          ><Users />巡视窗口<span class="online-count">{{ counts.online }}</span></Button
        ><button
          class="icon-button"
          :aria-label="fullscreen ? '退出授课全屏' : '授课全屏'"
          @click="toggleFullscreen"
        >
          <Minimize v-if="fullscreen" :size="19" /><Maximize v-else :size="19" />
        </button>
      </div>
    </header>
    <div class="teaching-stage">
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
          ><button
            class="text-button"
            @click="router.push('/teacher/exercises/' + exercise.id + '/edit')"
          >
            <Pencil :size="13" />编辑题目
          </button>
        </div>
      </div>
      <article
        class="teaching-slide"
        :class="{ 'with-code': mode !== '题面', 'teaching-split': mode === '对照' }"
      >
        <section v-if="mode !== '代码'" class="teaching-problem">
          <div class="slide-title-row">
            <h1>{{ exercise.title }}</h1>
            <span>C++17</span>
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
              <button
                class="icon-button"
                aria-label="缩小示范代码字号"
                :disabled="fontSize <= 14"
                @click="fontSize -= 2"
              >
                <Minus :size="15" /></button
              ><span>{{ fontSize }} px</span
              ><button
                class="icon-button"
                aria-label="放大示范代码字号"
                :disabled="fontSize >= 34"
                @click="fontSize += 2"
              >
                <Plus :size="15" /></button
              ><button
                class="icon-button"
                aria-label="下载教师示范代码"
                @click="download(exercise.filename, teacherCode)"
              >
                <Download :size="15" />
              </button>
            </div>
          </div>
          <CodeEditor v-model="teacherCode" :font-size="fontSize" :filename="exercise.filename" />
          <div class="teaching-code-note">
            教师示范代码独立保存，不修改学生作品。编译执行尚未接入。
          </div>
        </section>
      </article>
      <div class="teaching-bottom">
        <div class="teaching-view-switch" aria-label="授课布局">
          <button
            v-for="m in [
              { label: '题面', icon: BookOpen },
              { label: '代码', icon: CodeXml },
              { label: '对照', icon: Columns2 },
            ]"
            :key="m.label"
            :class="{ selected: mode === m.label }"
            @click="mode = m.label"
          >
            <component :is="m.icon" :size="16" />{{ m.label }}
          </button>
        </div>
        <span class="teaching-keyboard-hint">← → 切换练习</span>
        <div class="teaching-pagination">
          <button
            class="icon-button"
            :disabled="index <= 0"
            aria-label="上一道授课练习"
            @click="next(-1)"
          >
            <ChevronLeft :size="20" /></button
          ><select v-model="selected" aria-label="授课练习">
            <option v-for="(e, i) in exercises" :key="e.id" :value="e.id">
              {{ i + 1 }} / {{ exercises.length }} · {{ e.title }}
            </option></select
          ><button
            class="icon-button"
            :disabled="index === exercises.length - 1"
            aria-label="下一道授课练习"
            @click="next(1)"
          >
            <ChevronRight :size="20" />
          </button>
        </div>
      </div>
    </div>
    <footer class="teaching-footer">
      <span>码上课堂 · 教师授课</span><span>巡视窗口可移至另一块屏幕，授课画面保持独立。</span>
    </footer>
  </main>
</template>
