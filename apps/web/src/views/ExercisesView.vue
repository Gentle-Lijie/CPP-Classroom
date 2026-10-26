<script setup lang="ts">
import { Alert } from '@/components/ui/alert'
import { Input } from '@/components/ui/input'
import { Select, SelectOption } from '@/components/ui/select'
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  Plus,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  Search,
  BookOpen,
  Eye,
  Send,
  Star,
  Check,
  Archive,
  Monitor,
  FileCode2,
  Pencil,
} from '@lucide/vue'
import { Button } from '@/components/ui/button'
import Modal from '@/components/classroom/Modal.vue'
import Pagination from '@/components/classroom/Pagination.vue'
import { usePagination } from '@/composables/usePagination'
import MarkdownContent from '@/components/classroom/MarkdownContent.vue'
import CodeEditor from '@/components/classroom/CodeEditor.vue'
import {
  exercises,
  activeClassroom,
  tone,
  notify,
  saveExercise,
  classPath,
  refresh,
  updateClass,
  reportError,
  executionSettings,
  type Exercise,
} from '@/data/demo'
import { api } from '@/lib/api'
const router = useRouter()
const route = useRoute()
const selected = ref(String(route.query.exercise ?? exercises[0]?.id ?? ''))
const search = ref(''),
  status = ref('')
const filtered = computed(() =>
  exercises.filter(
    (e) =>
      (!status.value || e.status === status.value) &&
      `${e.title} ${e.filename} ${e.topic}`
        .toLowerCase()
        .includes(search.value.trim().toLowerCase()),
  ),
)
const { page, pageSize, paged } = usePagination(filtered, [search, status], 10)
const preview = ref(false)
const busy = ref(false)
const confirmClose = ref(false)
watch(
  () => route.query.exercise,
  (id) => {
    if (!id) return
    const found = exercises.find((e) => e.id === String(id))
    selected.value = found?.id ?? exercises[0]?.id ?? ''
    if (!found) notify('没有找到指定练习，已显示课堂第一道练习', 'info')
  },
)
watch(
  () => exercises.map((e) => e.id).join(','),
  () => {
    if (!exercises.some((e) => e.id === selected.value)) selected.value = exercises[0]?.id ?? ''
  },
  { immediate: true },
)
const exercise = computed(() => exercises.find((e) => e.id === selected.value)!)
async function recommend() {
  if (busy.value) return
  busy.value = true
  try {
    await updateClass({ recommended: exercise.value.id })
    notify('已设为当前推荐练习')
  } catch (e) {
    reportError(e)
  } finally {
    busy.value = false
  }
}
async function publish() {
  if (busy.value) return
  busy.value = true
  try {
    await saveExercise({ ...exercise.value, status: '已发布' })
    notify('练习已发布')
  } catch (e) {
    reportError(e)
  } finally {
    busy.value = false
  }
}
async function close() {
  if (busy.value) return
  busy.value = true
  try {
    await saveExercise({
      ...exercise.value,
      status: exercise.value.status === '已关闭' ? '草稿' : '已关闭',
    })
    confirmClose.value = false
    notify('状态已更新')
  } catch (e) {
    reportError(e)
  } finally {
    busy.value = false
  }
}
async function move(direction = -1) {
  if (busy.value) return
  busy.value = true
  try {
    const index = exercises.findIndex((e) => e.id === exercise.value.id)
    const target = index + direction
    if (target >= 0 && target < exercises.length) {
      const ids = exercises.map((e) => e.id)
      ;[ids[target], ids[index]] = [ids[index]!, ids[target]!]
      await api(classPath('/exercises/reorder'), 'POST', { ids })
      await refresh().catch(() => notify('排序已保存，列表刷新失败，请稍后重试', 'error'))
    }
  } catch (e) {
    reportError(e)
  } finally {
    busy.value = false
  }
}
function edit(e: Exercise) {
  router.push('/teacher/exercises/' + e.id + '/edit')
}
</script>
<template>
  <div class="page-heading">
    <div>
      <div class="heading-meta">课程内容</div>
      <h1>练习管理</h1>
      <p>编排课堂练习，可直接导入 Markdown；所有题目字段均可留空。</p>
    </div>
    <div class="heading-actions">
      <Button
        variant="outline"
        :disabled="!exercise"
        @click="router.push('/teacher/teach?exercise=' + exercise.id)"
        ><Monitor />开始授课</Button
      ><Button @click="router.push('/teacher/exercises/new')"><Plus />创建练习</Button>
    </div>
  </div>
  <section v-if="!exercise" class="panel empty-state">
    <BookOpen :size="32" />
    <h2>课堂还没有练习</h2>
    <p>创建第一道练习，准备题面、样例和初始代码。</p>
    <Button @click="router.push('/teacher/exercises/new')"><Plus />创建第一个练习</Button>
  </section>
  <div v-else class="exercise-layout">
    <section class="panel exercise-list-panel">
      <div class="panel-heading">
        <h2>
          课堂练习 <span class="muted">{{ exercises.length }}</span>
        </h2>
        <span class="muted text-xs">按教学顺序</span>
      </div>
      <div class="exercise-list-filters">
        <label class="search-field"
          ><Search :size="15" /><Input
            v-model="search"
            aria-label="搜索练习"
            placeholder="搜索题目、文件名…" /></label
        ><Select v-model="status" aria-label="筛选练习状态">
          <SelectOption value="">全部状态</SelectOption>
          <SelectOption>草稿</SelectOption>
          <SelectOption>已发布</SelectOption>
          <SelectOption>已关闭</SelectOption>
        </Select>
      </div>
      <div class="exercise-list-scroll">
        <Button
          v-for="e in paged"
          :key="e.id"
          variant="plain"
          class="exercise-list-item"
          :class="{ selected: selected === e.id }"
          @click="selected = e.id"
        >
          <span class="exercise-order">{{
            String(exercises.indexOf(e) + 1).padStart(2, '0')
          }}</span>
          <div>
            <strong>{{ e.title || '未命名题目' }}</strong
            ><small
              >{{ e.filename || '未指定源文件名'
              }}<span v-if="activeClassroom.recommended === e.id"> · 当前推荐</span></small
            >
          </div>
          <span class="status" :class="tone(e.status)">{{ e.status }}</span
          ><ArrowRight :size="15" />
        </Button>
        <div v-if="!filtered.length" class="small-empty">没有匹配的练习</div>
      </div>
      <Pagination
        v-model:page="page"
        v-model:page-size="pageSize"
        :total="filtered.length"
        unit="道练习"
      />
      <Alert type="info" :icon="BookOpen" class="app-alert--inset">
        <p>学生可查看已发布和已关闭练习。<br />题目编辑在独立页面完成。</p>
      </Alert>
    </section>
    <section class="panel exercise-preview">
      <div class="panel-heading">
        <div class="inline-items">
          <span class="status" :class="tone(exercise.status)">{{ exercise.status }}</span
          ><span v-if="activeClassroom.recommended === exercise.id" class="recommended"
            ><Star :size="13" />当前推荐</span
          >
        </div>
        <div class="inline-items">
          <Button
            variant="plain"
            class="icon-button"
            aria-label="练习向上移动"
            :disabled="busy || exercises.indexOf(exercise) === 0"
            @click="move(-1)"
          >
            <ArrowUp :size="16" /></Button
          ><Button
            variant="plain"
            class="icon-button"
            aria-label="练习向下移动"
            :disabled="busy || exercises.indexOf(exercise) === exercises.length - 1"
            @click="move(1)"
          >
            <ArrowDown :size="16" /></Button
          ><Button variant="outline" size="sm" @click="edit(exercise)"><Pencil />编辑题目</Button>
        </div>
      </div>
      <div class="problem-content">
        <span class="topic-label"
          >{{ exercise.topic }} ·
          {{ executionSettings.compilerProfile === 'gcc13-cpp20' ? 'C++20' : 'C++17' }}</span
        >
        <h2>{{ exercise.title || '未命名题目' }}</h2>
        <div class="problem-limits">
          <span>时间限制 {{ executionSettings.runTimeMs }} ms</span
          ><span>内存限制 {{ executionSettings.runMemoryMb }} MiB</span
          ><span class="inline-items"
            ><FileCode2 :size="13" />{{ exercise.filename || '自动文件名' }}</span
          >
        </div>
        <MarkdownContent :source="exercise.description" />
        <h3>输入说明</h3>
        <MarkdownContent :source="exercise.input" />
        <h3>输出说明</h3>
        <MarkdownContent :source="exercise.output" />
        <h3>样例</h3>
        <div class="sample-grid">
          <div>
            <span>输入</span>
            <pre>{{ exercise.sampleInput || '（无输入）' }}</pre>
          </div>
          <div>
            <span>输出</span>
            <pre>{{ exercise.sampleOutput }}</pre>
          </div>
        </div>
      </div>
      <div class="exercise-preview-actions">
        <div class="inline-items">
          <Button variant="outline" @click="preview = true"><Eye />学生预览</Button
          ><Button
            variant="warning"
            :disabled="busy"
            @click="exercise.status === '已关闭' ? close() : (confirmClose = true)"
            ><Archive />{{ exercise.status === '已关闭' ? '移回草稿' : '关闭练习' }}</Button
          >
        </div>
        <Button
          v-if="exercise.status !== '已发布'"
          variant="success"
          :disabled="busy"
          @click="publish"
          ><Send />发布练习</Button
        ><Button
          v-else
          :variant="activeClassroom.recommended === exercise.id ? 'outline' : 'default'"
          :disabled="busy || activeClassroom.recommended === exercise.id"
          @click="recommend"
          ><Check v-if="activeClassroom.recommended === exercise.id" /><Star v-else />{{
            activeClassroom.recommended === exercise.id ? '当前推荐练习' : '设为当前推荐'
          }}</Button
        >
      </div>
    </section>
  </div>
  <Modal
    v-if="exercise"
    v-model:open="preview"
    title="学生预览"
    description="查看学生会看到的题面、样例和初始代码。此处只读，不运行代码。"
    wide
    ><h2>{{ exercise.title || '未命名题目' }}</h2>
    <MarkdownContent :source="exercise.description" />
    <h3>输入说明</h3>
    <MarkdownContent :source="exercise.input" />
    <h3>输出说明</h3>
    <MarkdownContent :source="exercise.output" />
    <div class="sample-grid">
      <div>
        <span>样例输入</span>
        <pre>{{ exercise.sampleInput }}</pre>
      </div>
      <div>
        <span>样例输出</span>
        <pre>{{ exercise.sampleOutput }}</pre>
      </div>
    </div>
    <div class="initial-editor">
      <div class="code-toolbar">{{ exercise.filename }}</div>
      <CodeEditor :model-value="exercise.code" readonly :filename="exercise.filename" />
    </div>
    <div class="modal-actions">
      <Button variant="outline" @click="preview = false">关闭</Button>
    </div></Modal
  >
  <Modal
    v-model:open="confirmClose"
    title="关闭这道练习？"
    description="学生仍可查看已有作品，但不能继续编辑、运行或提交。当前运行任务会停止，可重新发布以恢复教学。"
    ><div class="modal-actions">
      <Button variant="outline" :disabled="busy" @click="confirmClose = false">取消</Button
      ><Button variant="warning" :disabled="busy" @click="close">{{
        busy ? '正在关闭…' : '确认关闭练习'
      }}</Button>
    </div></Modal
  >
</template>

<style scoped>
.exercise-list-filters {
  display: grid;
  gap: 10px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--ui-line);
}
.exercise-list-filters .search-field {
  width: 100%;
}
.exercise-list-filters .ui-select-trigger {
  font-size: 14px;
}
.exercise-list-panel :deep(.pagination) {
  padding: 12px;
  gap: 8px;
}
.exercise-list-panel :deep(.pagination-controls) {
  flex-wrap: wrap;
  justify-content: flex-start;
}
.problem-limits {
  flex-wrap: wrap;
}
.exercise-preview,
.exercise-list-panel,
.exercise-preview-actions > .inline-items {
  min-width: 0;
}
.exercise-preview-actions,
.exercise-preview-actions > .inline-items,
.exercise-preview .panel-heading > .inline-items {
  flex-wrap: wrap;
  gap: 10px;
}
.exercise-list-item > div {
  flex: 1;
  min-width: 0;
}
.exercise-list-item > .status {
  font-size: 13px;
}
.sample-grid > div {
  min-width: 0;
}
.sample-grid pre {
  overflow: auto;
  max-height: 300px;
}
</style>
