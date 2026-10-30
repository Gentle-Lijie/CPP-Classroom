<script setup lang="ts">
import {
  exerciseSourceFilename,
  exerciseStarterCode,
  type SourceLanguage,
} from '@classroom/contracts'
import LanguageSelect from '@/components/classroom/LanguageSelect.vue'
import PythonBeta from '@/components/classroom/PythonBeta.vue'
import { sourceLanguage } from '@/lib/source-language'
import { Alert } from '@/components/ui/alert'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
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
import ExerciseBatchImport from '@/components/classroom/ExerciseBatchImport.vue'
import Pagination from '@/components/classroom/Pagination.vue'
import { usePagination } from '@/composables/usePagination'
import MarkdownContent from '@/components/classroom/MarkdownContent.vue'
import CodeBlock from '@/components/classroom/CodeBlock.vue'
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
import { confirmAction } from '@/lib/confirm'
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
const previewLanguage = ref<SourceLanguage>('cpp')
watch([preview, selected], () => {
  previewLanguage.value = sourceLanguage(exercises.find((e) => e.id === selected.value))
})
const busy = ref(false)
const confirmClose = ref(false)
const checkedIds = ref<string[]>([])
const batchOpen = ref(false)
const batchBusy = ref(false)
const batchError = ref('')
const batchStatus = ref('')
const changeTopic = ref(false)
const batchTopic = ref('')
const batchTargets = ref<{ id: string; version: number }[]>([])
const checkedOnPage = computed(() => paged.value.filter((e) => checkedIds.value.includes(e.id)))
function selectPage(checked: boolean) {
  const ids = new Set(checkedIds.value)
  for (const exercise of paged.value) {
    if (checked) ids.add(exercise.id)
    else ids.delete(exercise.id)
  }
  checkedIds.value = [...ids]
}
async function openBatch() {
  if (batchBusy.value || busy.value) return
  batchBusy.value = true
  try {
    const latest = await api<Exercise[]>(classPath('/exercises'))
    batchTargets.value = latest
      .filter((exercise) => checkedIds.value.includes(exercise.id))
      .map((exercise) => ({ id: exercise.id, version: exercise.version! }))
    if (batchTargets.value.length !== checkedIds.value.length || !batchTargets.value.length) {
      await refresh()
      notify('所选练习已变更，请重新选择后编辑', 'info')
      return
    }
    batchStatus.value = ''
    changeTopic.value = false
    batchTopic.value = ''
    batchError.value = ''
    batchOpen.value = true
  } catch (error) {
    reportError(error)
  } finally {
    batchBusy.value = false
  }
}
async function saveBatch() {
  if (batchBusy.value || (!batchStatus.value && !changeTopic.value) || !batchTargets.value.length)
    return
  batchBusy.value = true
  batchError.value = ''
  try {
    await api(classPath('/exercises/batch'), 'PATCH', {
      exercises: batchTargets.value,
      changes: {
        ...(batchStatus.value ? { status: batchStatus.value } : {}),
        ...(changeTopic.value ? { topic: batchTopic.value } : {}),
      },
    })
    batchOpen.value = false
    checkedIds.value = []
    notify(`已更新 ${batchTargets.value.length} 道练习`)
    await refresh().catch(() => notify('批量修改已保存，列表刷新失败，请刷新页面查看', 'error'))
  } catch (error) {
    batchError.value = error instanceof Error ? error.message : '批量修改失败，请重试'
  } finally {
    batchBusy.value = false
  }
}
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
    checkedIds.value = checkedIds.value.filter((id) =>
      exercises.some((exercise) => exercise.id === id),
    )
  },
  { immediate: true },
)
const exercise = computed(() => exercises.find((e) => e.id === selected.value)!)
async function recommend() {
  if (
    busy.value ||
    !(await confirmAction(`将「${exercise.value.title}」设为当前推荐练习？学生将看到新的推荐。`))
  )
    return
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
  if (
    busy.value ||
    !(await confirmAction(
      `发布练习「${exercise.value.title}」？课堂学生将可以查看练习并按课堂策略使用。`,
    ))
  )
    return
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
  if (
    exercise.value.status === '已关闭' &&
    !(await confirmAction(`将练习「${exercise.value.title}」移回草稿？学生将无法查看这道练习。`))
  )
    return
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
async function deleteExercise() {
  const target = exercise.value
  if (
    busy.value ||
    !target ||
    !(await confirmAction(
      `永久删除练习「${target.title}」？相关草稿、提交、求助及运行记录也会被删除，且无法恢复。`,
    ))
  )
    return
  busy.value = true
  try {
    await api(classPath('/exercises/' + target.id + '/permanent'), 'DELETE')
    await refresh()
    notify('练习已永久删除')
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
async function imported(ids: string[]) {
  try {
    await refresh()
    search.value = ''
    status.value = ''
    selected.value = ids[0] ?? selected.value
    const index = exercises.findIndex((exercise) => exercise.id === selected.value)
    if (index >= 0) page.value = Math.floor(index / pageSize.value) + 1
  } catch {
    notify('练习已导入，列表刷新失败，请刷新页面查看，勿重复导入', 'error')
  }
}
</script>
<template>
  <div class="exercise-management-page">
    <div class="page-heading">
      <div>
        <div class="heading-meta">课程内容</div>
        <h1>练习管理</h1>
      </div>
      <div class="heading-actions">
        <ExerciseBatchImport @imported="imported" />
        <Button
          variant="outline"
          :disabled="!exercise"
          data-disabled-reason="请先选择一道练习"
          @click="router.push('/teacher/teach?exercise=' + exercise.id)">
          <Monitor />
          开始授课
        </Button>
        <Button @click="router.push('/teacher/exercises/new')">
          <Plus />
          创建练习
        </Button>
      </div>
    </div>
    <section v-if="!exercise" class="panel empty-state">
      <BookOpen :size="32" />
      <h2>课堂还没有练习</h2>
      <Button @click="router.push('/teacher/exercises/new')">
        <Plus />
        创建第一个练习
      </Button>
    </section>
    <div v-else class="exercise-layout">
      <section class="panel exercise-list-panel">
        <div class="panel-heading">
          <h2>
            课堂练习
            <span class="muted">{{ exercises.length }}</span>
          </h2>
          <span class="muted text-xs">按教学顺序</span>
        </div>
        <div class="exercise-list-filters">
          <label class="search-field">
            <Search :size="15" />
            <Input v-model="search" aria-label="搜索练习" placeholder="搜索题目、文件名…" />
          </label>
          <Select v-model="status" aria-label="筛选练习状态">
            <SelectOption value="">全部状态</SelectOption>
            <SelectOption>草稿</SelectOption>
            <SelectOption>已发布</SelectOption>
            <SelectOption>已关闭</SelectOption>
          </Select>
        </div>
        <div class="exercise-batch-toolbar">
          <label class="inline-items">
            <Checkbox
              :checked="!!paged.length && checkedOnPage.length === paged.length"
              :indeterminate="!!checkedOnPage.length && checkedOnPage.length < paged.length"
              :disabled="!paged.length"
              data-disabled-reason="当前页没有可选择的练习"
              aria-label="选择本页练习"
              @change="selectPage" />
            本页全选
          </label>
          <span class="muted" aria-live="polite">已选 {{ checkedIds.length }} 道</span>
          <Button
            variant="plain"
            size="sm"
            :disabled="!checkedIds.length"
            data-disabled-reason="尚未选择练习"
            @click="checkedIds = []">
            清空
          </Button>
          <Button
            variant="outline"
            size="sm"
            style="margin-left: auto"
            :disabled="!checkedIds.length || busy || batchBusy"
            :data-disabled-reason="
              busy || batchBusy ? '正在保存练习，请稍候' : '请先选择要批量编辑的练习'
            "
            @click="openBatch">
            <Pencil />
            批量编辑
          </Button>
        </div>
        <div class="exercise-list-scroll">
          <div
            v-for="e in paged"
            :key="e.id"
            class="exercise-list-row"
            :class="{ selected: selected === e.id }">
            <Checkbox
              v-model="checkedIds"
              :value="e.id"
              :aria-label="`选择练习：${e.title || '未命名题目'}`" />
            <Button
              variant="plain"
              class="exercise-list-item"
              :class="{ selected: selected === e.id }"
              @click="selected = e.id">
              <span class="exercise-order">
                {{ String(exercises.indexOf(e) + 1).padStart(2, '0') }}
              </span>
              <div>
                <strong>{{ e.title || '未命名题目' }}</strong>
                <small>
                  {{ e.filename || '未指定源文件名' }}
                  <PythonBeta v-if="sourceLanguage(e) === 'python'" />
                  <span v-if="activeClassroom.recommended === e.id">· 当前推荐</span>
                </small>
              </div>
              <span class="status" :class="tone(e.status)">{{ e.status }}</span>
              <ArrowRight :size="15" />
            </Button>
          </div>
          <div v-if="!filtered.length" class="small-empty">没有匹配的练习</div>
        </div>
        <Pagination
          v-model:page="page"
          v-model:page-size="pageSize"
          :total="filtered.length"
          unit="道练习" />
      </section>
      <section class="panel exercise-preview">
        <div class="panel-heading">
          <div class="inline-items">
            <span class="status" :class="tone(exercise.status)">{{ exercise.status }}</span>
            <span v-if="activeClassroom.recommended === exercise.id" class="recommended">
              <Star :size="13" />
              当前推荐
            </span>
          </div>
          <div class="inline-items">
            <Button
              variant="plain"
              class="icon-button"
              aria-label="练习向上移动"
              :disabled="busy || exercises.indexOf(exercise) === 0"
              :data-disabled-reason="busy ? '正在保存练习，请稍候' : '已经是第一道练习'"
              @click="move(-1)">
              <ArrowUp :size="16" />
            </Button>
            <Button
              variant="plain"
              class="icon-button"
              aria-label="练习向下移动"
              :disabled="busy || exercises.indexOf(exercise) === exercises.length - 1"
              :data-disabled-reason="busy ? '正在保存练习，请稍候' : '已经是最后一道练习'"
              @click="move(1)">
              <ArrowDown :size="16" />
            </Button>
            <Button variant="outline" size="sm" @click="edit(exercise)">
              <Pencil />
              编辑题目
            </Button>
          </div>
        </div>
        <div class="problem-content">
          <span class="topic-label">
            {{ exercise.topic }} ·
            {{
              sourceLanguage(exercise) === 'python'
                ? 'Python 3'
                : executionSettings.compilerProfile === 'gcc13-cpp20'
                  ? 'C++20'
                  : 'C++17'
            }}
            <PythonBeta v-if="sourceLanguage(exercise) === 'python'" />
          </span>
          <h2>{{ exercise.title || '未命名题目' }}</h2>
          <div class="problem-limits">
            <span>时间限制 {{ executionSettings.runTimeMs }} ms</span>
            <span>内存限制 {{ executionSettings.runMemoryMb }} MiB</span>
            <span class="inline-items">
              <FileCode2 :size="13" />
              {{ exercise.filename || '自动文件名' }}
            </span>
          </div>
          <MarkdownContent :source="exercise.description" />
          <h3>输入说明</h3>
          <MarkdownContent :source="exercise.input" />
          <h3>输出说明</h3>
          <MarkdownContent :source="exercise.output" />
          <h3>样例</h3>
          <div class="sample-grid">
            <CodeBlock :source="exercise.sampleInput" label="样例输入" empty-text="无输入" />
            <CodeBlock :source="exercise.sampleOutput" label="样例输出" />
          </div>
        </div>
        <div class="exercise-preview-actions">
          <div class="inline-items">
            <Button variant="ghost" :disabled="busy" @click="deleteExercise">永久删除</Button>
            <Button variant="outline" @click="preview = true">
              <Eye />
              学生预览
            </Button>
            <Button
              variant="warning"
              :disabled="busy"
              data-disabled-reason="正在保存练习，请稍候"
              @click="exercise.status === '已关闭' ? close() : (confirmClose = true)">
              <Archive />
              {{ exercise.status === '已关闭' ? '移回草稿' : '关闭练习' }}
            </Button>
          </div>
          <Button
            v-if="exercise.status !== '已发布'"
            variant="success"
            :disabled="busy"
            data-disabled-reason="正在保存练习，请稍候"
            @click="publish">
            <Send />
            发布练习
          </Button>
          <Button
            v-else
            :variant="activeClassroom.recommended === exercise.id ? 'outline' : 'default'"
            :disabled="busy || activeClassroom.recommended === exercise.id"
            :data-disabled-reason="busy ? '正在保存练习，请稍候' : '这道练习已经是当前推荐练习'"
            @click="recommend">
            <Check v-if="activeClassroom.recommended === exercise.id" />
            <Star v-else />
            {{ activeClassroom.recommended === exercise.id ? '当前推荐练习' : '设为当前推荐' }}
          </Button>
        </div>
      </section>
    </div>
  </div>
  <Modal
    v-model:open="batchOpen"
    title="批量编辑练习"
    :description="`将修改已选的 ${batchTargets.length} 道练习（包含其他分页和筛选外的选择）。仅保存指定字段。`"
    :busy="batchBusy">
    <div class="batch-edit-fields" :inert="batchBusy">
      <label>
        练习状态
        <Select v-model="batchStatus" aria-label="批量修改状态">
          <SelectOption value="">保持原状态</SelectOption>
          <SelectOption>草稿</SelectOption>
          <SelectOption>已发布</SelectOption>
          <SelectOption>已关闭</SelectOption>
        </Select>
      </label>
      <label class="inline-items">
        <Checkbox v-model="changeTopic" />
        统一修改知识点
      </label>
      <Input
        v-model="batchTopic"
        aria-label="批量修改知识点"
        maxlength="100"
        placeholder="输入知识点，留空则清空所选练习的知识点"
        :disabled="!changeTopic"
        data-disabled-reason="请先勾选修改知识点" />
      <Alert v-if="batchStatus === '草稿' || batchStatus === '已关闭'" type="warning">
        {{
          batchStatus === '草稿'
            ? '移回草稿后，学生将无法查看这些练习。'
            : '关闭后，学生仍可查看题目，但不能编辑、运行或提交。'
        }}所选练习的运行任务会停止，当前推荐也会取消。
      </Alert>
    </div>
    <Alert v-if="batchError" type="error" role="alert">{{ batchError }}</Alert>
    <div class="modal-actions">
      <Button
        variant="outline"
        :disabled="batchBusy"
        data-disabled-reason="正在保存批量修改，请稍候"
        @click="batchOpen = false">
        取消
      </Button>
      <Button
        :disabled="batchBusy || (!batchStatus && !changeTopic)"
        :data-disabled-reason="
          batchBusy ? '正在保存批量修改，请稍候' : '请先选择要修改的状态或勾选修改知识点'
        "
        @click="saveBatch">
        {{ batchBusy ? '正在保存…' : `保存 ${batchTargets.length} 道练习` }}
      </Button>
    </div>
  </Modal>
  <Modal v-if="exercise" v-model:open="preview" title="学生预览" wide>
    <h2>{{ exercise.title || '未命名题目' }}</h2>
    <MarkdownContent :source="exercise.description" />
    <h3>输入说明</h3>
    <MarkdownContent :source="exercise.input" />
    <h3>输出说明</h3>
    <MarkdownContent :source="exercise.output" />
    <div class="sample-grid">
      <CodeBlock :source="exercise.sampleInput" label="样例输入" empty-text="无输入" />
      <CodeBlock :source="exercise.sampleOutput" label="样例输出" />
    </div>
    <div class="initial-editor">
      <div class="code-toolbar">
        <LanguageSelect v-model="previewLanguage" label="预览初始代码语言" />
        {{ exerciseSourceFilename(exercise, previewLanguage) }}
      </div>
      <CodeEditor
        :model-value="exerciseStarterCode(exercise, previewLanguage)"
        :language="previewLanguage"
        readonly
        :filename="exerciseSourceFilename(exercise, previewLanguage)" />
    </div>
    <div class="modal-actions">
      <Button variant="outline" @click="preview = false">关闭</Button>
    </div>
  </Modal>
  <Modal
    v-model:open="confirmClose"
    title="关闭这道练习？"
    description="学生仍可查看已有作品，但不能继续编辑、运行或提交。当前运行任务会停止，可重新发布以恢复教学。">
    <div class="modal-actions">
      <Button
        variant="outline"
        :disabled="busy"
        data-disabled-reason="正在保存练习，请稍候"
        @click="confirmClose = false">
        取消
      </Button>
      <Button
        variant="warning"
        :disabled="busy"
        data-disabled-reason="正在保存练习，请稍候"
        @click="close">
        {{ busy ? '正在关闭…' : '确认关闭练习' }}
      </Button>
    </div>
  </Modal>
</template>

<style scoped>
.exercise-management-page {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
}
.page-heading {
  flex-shrink: 0;
}
.exercise-layout {
  flex: 1;
  min-height: 0;
  align-items: stretch;
}
.exercise-list-panel,
.exercise-preview {
  display: flex;
  flex-direction: column;
  align-self: stretch;
  min-height: 0;
  overflow: hidden;
}
.exercise-list-panel > :not(.exercise-list-scroll),
.exercise-preview > :not(.problem-content) {
  flex-shrink: 0;
}
.exercise-list-scroll,
.exercise-preview .problem-content {
  flex: 1;
  min-height: 0;
  max-height: none;
  overflow: auto;
  overscroll-behavior: contain;
}
.exercise-batch-toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--ui-line);
  font-size: 13px;
}
.exercise-batch-toolbar label {
  cursor: pointer;
}
.exercise-list-row {
  display: flex;
  align-items: center;
  padding-left: 12px;
  border-bottom: 1px solid var(--ui-line);
}
.exercise-list-row.selected {
  background: var(--ui-surface);
}
.exercise-list-row .exercise-list-item {
  flex: 1;
  min-width: 0;
  border-bottom: 0;
  background: transparent;
  box-shadow: none;
  gap: 10px;
  padding: 18px 12px;
}
.batch-edit-fields {
  display: grid;
  gap: 12px;
}
.batch-edit-fields > label:first-child {
  display: grid;
  gap: 8px;
}
.exercise-list-filters {
  display: grid;
  gap: 10px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--ui-line);
}
.exercise-list-filters .search-field {
  max-width: none;
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
