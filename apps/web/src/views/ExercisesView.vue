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
  Trash,
} from '@lucide/vue'
import { Button } from '@/components/ui/button'
import Modal from '@/components/classroom/Modal.vue'
import ContentPanel from '@/components/classroom/ContentPanel.vue'
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
import { useI18n } from 'vue-i18n'
const { t } = useI18n()
function statusText(status: string) {
  if (status === 'draft') return t('exercises.status.draft')
  if (status === 'published') return t('exercises.status.published')
  if (status === 'closed') return t('exercises.status.closed')
  return status
}
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
      notify(t('exercises.changedSelection'), 'info')
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
    notify(t('exercises.updatedCount', { count: batchTargets.value.length }))
    await refresh().catch(() => notify(t('exercises.batchSavedRefreshFailed'), 'error'))
  } catch (error) {
    batchError.value = error instanceof Error ? error.message : t('exercises.batchFailed')
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
    if (!found) notify(t('exercises.notFoundFallback'), 'info')
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
    !(await confirmAction(t('exercises.recommendConfirm', { title: exercise.value.title })))
  )
    return
  busy.value = true
  try {
    await updateClass({ recommended: exercise.value.id })
    notify(t('exercises.recommended'))
  } catch (e) {
    reportError(e)
  } finally {
    busy.value = false
  }
}
async function publish() {
  if (
    busy.value ||
    !(await confirmAction(t('exercises.publishConfirm', { title: exercise.value.title })))
  )
    return
  busy.value = true
  try {
    await saveExercise({ ...exercise.value, status: 'published' })
    notify(t('exercises.published'))
  } catch (e) {
    reportError(e)
  } finally {
    busy.value = false
  }
}
async function close() {
  if (busy.value) return
  if (
    exercise.value.status === 'closed' &&
    !(await confirmAction(t('exercises.closeConfirm', { title: exercise.value.title })))
  )
    return
  busy.value = true
  try {
    await saveExercise({
      ...exercise.value,
      status: exercise.value.status === 'closed' ? 'draft' : 'closed',
    })
    confirmClose.value = false
    notify(t('exercises.statusUpdated'))
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
    !(await confirmAction(t('exercises.deleteConfirm', { title: target.title }), {
      destructive: true,
    }))
  )
    return
  busy.value = true
  try {
    await api(classPath('/exercises/' + target.id + '/permanent'), 'DELETE')
    await refresh()
    notify(t('exercises.deleted'))
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
      await refresh().catch(() => notify(t('exercises.reorderRefreshFailed'), 'error'))
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
    notify(t('exercises.importedRefreshFailed'), 'error')
  }
}
</script>
<template>
  <div class="exercise-management-page">
    <div class="page-heading">
      <div>
        <div class="heading-meta">{{ t('exercises.meta') }}</div>
        <h1>{{ t('exercises.pageTitle') }}</h1>
      </div>
      <div class="heading-actions">
        <ExerciseBatchImport @imported="imported" />
        <Button
          variant="outline"
          :disabled="!exercise"
          :data-disabled-reason="t('exercises.startTeachDisabled')"
          @click="router.push('/teacher/teach?exercise=' + exercise.id)">
          <Monitor />
          {{ t('exercises.startTeach') }}
        </Button>
        <Button @click="router.push('/teacher/exercises/new')">
          <Plus />
          {{ t('exercises.create') }}
        </Button>
      </div>
    </div>
    <section v-if="!exercise" class="panel empty-state">
      <BookOpen :size="32" />
      <h2>{{ t('exercises.emptyTitle') }}</h2>
      <Button @click="router.push('/teacher/exercises/new')">
        <Plus />
        {{ t('exercises.createFirst') }}
      </Button>
    </section>
    <div v-else class="exercise-layout">
      <ContentPanel as="section" direct class="exercise-list-panel">
        <div class="panel-heading">
          <h2>
            {{ t('exercises.listTitle') }}
            <span class="muted">{{ exercises.length }}</span>
          </h2>
          <span class="muted text-xs">{{ t('exercises.byOrder') }}</span>
        </div>
        <div class="exercise-list-filters">
          <label class="search-field">
            <Search :size="15" />
            <Input
              v-model="search"
              :aria-label="t('exercises.searchAria')"
              :placeholder="t('exercises.searchPlaceholder')" />
          </label>
          <Select v-model="status" :aria-label="t('exercises.filterAria')">
            <SelectOption value="">{{ t('exercises.allStatus') }}</SelectOption>
            <SelectOption value="draft">{{ t('exercises.status.draft') }}</SelectOption>
            <SelectOption value="published">{{ t('exercises.status.published') }}</SelectOption>
            <SelectOption value="closed">{{ t('exercises.status.closed') }}</SelectOption>
          </Select>
        </div>
        <div class="exercise-batch-toolbar">
          <label class="inline-items">
            <Checkbox
              :checked="!!paged.length && checkedOnPage.length === paged.length"
              :indeterminate="!!checkedOnPage.length && checkedOnPage.length < paged.length"
              :disabled="!paged.length"
              :data-disabled-reason="t('exercises.selectPageDisabled')"
              :aria-label="t('exercises.selectPageAria')"
              @change="selectPage" />
            {{ t('exercises.selectPage') }}
          </label>
          <span class="muted" aria-live="polite">
            {{ t('exercises.selectedCount', { count: checkedIds.length }) }}
          </span>
          <Button
            variant="plain"
            size="sm"
            :disabled="!checkedIds.length"
            :data-disabled-reason="t('exercises.noneSelected')"
            @click="checkedIds = []">
            {{ t('exercises.clearSelection') }}
          </Button>
          <Button
            variant="outline"
            size="sm"
            style="margin-left: auto"
            :disabled="!checkedIds.length || busy || batchBusy"
            :data-disabled-reason="
              busy || batchBusy ? t('exercises.savingExercise') : t('exercises.batchPickFirst')
            "
            @click="openBatch">
            <Pencil />
            {{ t('exercises.batchEdit') }}
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
              :aria-label="
                t('exercises.selectExerciseAria', {
                  title: e.title || t('exercises.unnamed'),
                })
              " />
            <Button
              variant="plain"
              class="exercise-list-item"
              :class="{ selected: selected === e.id }"
              @click="selected = e.id">
              <span class="exercise-order">
                {{ String(exercises.indexOf(e) + 1).padStart(2, '0') }}
              </span>
              <div class="exercise-list-title">
                <strong>{{ e.title || t('exercises.unnamed') }}</strong>
                <small
                  v-if="sourceLanguage(e) === 'python' || activeClassroom.recommended === e.id">
                  <span v-if="sourceLanguage(e) === 'python'" class="exercise-list-language">
                    Python
                    <PythonBeta />
                  </span>
                  <span v-if="activeClassroom.recommended === e.id">
                    {{ t('exercises.currentRecommend') }}
                  </span>
                </small>
              </div>
              <span class="status" :class="tone(e.status)">{{ statusText(e.status) }}</span>
              <ArrowRight :size="15" />
            </Button>
          </div>
          <div v-if="!filtered.length" class="small-empty">{{ t('exercises.noMatch') }}</div>
        </div>
        <Pagination
          v-model:page="page"
          v-model:page-size="pageSize"
          :total="filtered.length"
          :unit="t('exercises.unit')" />
      </ContentPanel>
      <ContentPanel as="section" direct class="exercise-preview">
        <div class="panel-heading">
          <div class="inline-items">
            <span class="status" :class="tone(exercise.status)">
              {{ statusText(exercise.status) }}
            </span>
            <span v-if="activeClassroom.recommended === exercise.id" class="recommended">
              <Star :size="13" />
              {{ t('exercises.currentRecommend') }}
            </span>
          </div>
          <div class="inline-items">
            <Button
              variant="plain"
              class="icon-button"
              :aria-label="t('exercises.moveUpAria')"
              :disabled="busy || exercises.indexOf(exercise) === 0"
              :data-disabled-reason="
                busy ? t('exercises.savingExercise') : t('exercises.firstExercise')
              "
              @click="move(-1)">
              <ArrowUp :size="16" />
            </Button>
            <Button
              variant="plain"
              class="icon-button"
              :aria-label="t('exercises.moveDownAria')"
              :disabled="busy || exercises.indexOf(exercise) === exercises.length - 1"
              :data-disabled-reason="
                busy ? t('exercises.savingExercise') : t('exercises.lastExercise')
              "
              @click="move(1)">
              <ArrowDown :size="16" />
            </Button>
            <Button variant="outline" size="sm" @click="edit(exercise)">
              <Pencil />
              {{ t('exercises.editTitle') }}
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
          <h2>{{ exercise.title || t('exercises.unnamed') }}</h2>
          <div class="problem-limits">
            <span>{{ t('exercises.timeLimit', { ms: executionSettings.runTimeMs }) }}</span>
            <span>{{ t('exercises.memoryLimit', { mb: executionSettings.runMemoryMb }) }}</span>
            <span class="inline-items">
              <FileCode2 :size="13" />
              {{ exercise.filename || t('exercises.autoFilename') }}
            </span>
          </div>
          <MarkdownContent :source="exercise.description" />
          <h3>{{ t('exercises.inputDesc') }}</h3>
          <MarkdownContent :source="exercise.input" />
          <h3>{{ t('exercises.outputDesc') }}</h3>
          <MarkdownContent :source="exercise.output" />
          <h3>{{ t('exercises.samples') }}</h3>
          <div class="sample-grid">
            <CodeBlock
              :source="exercise.sampleInput"
              :label="t('exercises.sampleInput')"
              :empty-text="t('exercises.noInput')" />
            <CodeBlock :source="exercise.sampleOutput" :label="t('exercises.sampleOutput')" />
          </div>
        </div>
        <div class="exercise-preview-actions">
          <div class="inline-items">
            <Button variant="outline" @click="preview = true">
              <Eye />
              {{ t('exercises.studentPreview') }}
            </Button>

            <Button
              v-if="exercise.status !== 'published'"
              variant="success"
              :disabled="busy"
              :data-disabled-reason="t('exercises.savingExercise')"
              @click="publish">
              <Send />
              {{ t('exercises.publish') }}
            </Button>
            <Button
              v-else
              :variant="activeClassroom.recommended === exercise.id ? 'outline' : 'default'"
              :disabled="busy || activeClassroom.recommended === exercise.id"
              :data-disabled-reason="
                busy ? t('exercises.savingExercise') : t('exercises.alreadyRecommend')
              "
              @click="recommend">
              <Check v-if="activeClassroom.recommended === exercise.id" />
              <Star v-else />
              {{
                activeClassroom.recommended === exercise.id
                  ? t('exercises.currentRecommendExercise')
                  : t('exercises.setRecommend')
              }}
            </Button>
          </div>
          <div class="exercise-danger-actions">
            <div class="inline-items">
              <Button
                variant="warning"
                :disabled="busy"
                :data-disabled-reason="t('exercises.savingExercise')"
                @click="exercise.status === 'closed' ? close() : (confirmClose = true)">
                <Archive />
                {{
                  exercise.status === 'closed'
                    ? t('exercises.moveToDraft')
                    : t('exercises.closeExercise')
                }}
              </Button>
              <Button variant="destructive" :disabled="busy" @click="deleteExercise">
                <Trash />
                {{ t('exercises.permanentDelete') }}
              </Button>
            </div>
          </div>
        </div>
      </ContentPanel>
    </div>
  </div>
  <Modal
    v-model:open="batchOpen"
    :title="t('exercises.batch.title')"
    :description="t('exercises.batch.description', { count: batchTargets.length })"
    :busy="batchBusy">
    <div class="batch-edit-fields" :inert="batchBusy">
      <label>
        {{ t('exercises.batch.statusLabel') }}
        <Select v-model="batchStatus" :aria-label="t('exercises.batch.statusAria')">
          <SelectOption value="">{{ t('exercises.batch.keepStatus') }}</SelectOption>
          <SelectOption value="draft">{{ t('exercises.status.draft') }}</SelectOption>
          <SelectOption value="published">{{ t('exercises.status.published') }}</SelectOption>
          <SelectOption value="closed">{{ t('exercises.status.closed') }}</SelectOption>
        </Select>
      </label>
      <label class="inline-items">
        <Checkbox v-model="changeTopic" />
        {{ t('exercises.batch.changeTopic') }}
      </label>
      <Input
        v-model="batchTopic"
        :aria-label="t('exercises.batch.topicAria')"
        maxlength="100"
        :placeholder="t('exercises.batch.topicPlaceholder')"
        :disabled="!changeTopic"
        :data-disabled-reason="t('exercises.batch.topicDisabled')" />
      <Alert v-if="batchStatus === 'draft' || batchStatus === 'closed'" type="warning">
        {{
          batchStatus === 'draft'
            ? t('exercises.batch.draftWarning')
            : t('exercises.batch.closeWarning')
        }}{{ t('exercises.batch.warningTail') }}
      </Alert>
    </div>
    <Alert v-if="batchError" type="error" role="alert">{{ batchError }}</Alert>
    <div class="modal-actions">
      <Button
        variant="outline"
        :disabled="batchBusy"
        :data-disabled-reason="t('exercises.batch.savingBatch')"
        @click="batchOpen = false">
        {{ t('common.cancel') }}
      </Button>
      <Button
        :disabled="batchBusy || (!batchStatus && !changeTopic)"
        :data-disabled-reason="
          batchBusy ? t('exercises.batch.savingBatch') : t('exercises.batch.pickChange')
        "
        @click="saveBatch">
        {{
          batchBusy
            ? t('exercises.batch.saving')
            : t('exercises.batch.saveCount', { count: batchTargets.length })
        }}
      </Button>
    </div>
  </Modal>
  <Modal v-if="exercise" v-model:open="preview" :title="t('exercises.studentPreview')" wide>
    <h2>{{ exercise.title || t('exercises.unnamed') }}</h2>
    <MarkdownContent :source="exercise.description" />
    <h3>{{ t('exercises.inputDesc') }}</h3>
    <MarkdownContent :source="exercise.input" />
    <h3>{{ t('exercises.outputDesc') }}</h3>
    <MarkdownContent :source="exercise.output" />
    <div class="sample-grid">
      <CodeBlock
        :source="exercise.sampleInput"
        :label="t('exercises.sampleInput')"
        :empty-text="t('exercises.noInput')" />
      <CodeBlock :source="exercise.sampleOutput" :label="t('exercises.sampleOutput')" />
    </div>
    <div class="initial-editor">
      <div class="code-toolbar">
        <LanguageSelect v-model="previewLanguage" :label="t('exercises.previewLanguageLabel')" />
        {{ exerciseSourceFilename(exercise, previewLanguage) }}
      </div>
      <CodeEditor
        :model-value="exerciseStarterCode(exercise, previewLanguage)"
        :language="previewLanguage"
        readonly
        :filename="exerciseSourceFilename(exercise, previewLanguage)" />
    </div>
    <div class="modal-actions">
      <Button variant="outline" @click="preview = false">{{ t('common.close') }}</Button>
    </div>
  </Modal>
  <Modal
    v-model:open="confirmClose"
    :title="t('exercises.closeModal.title')"
    :description="t('exercises.closeModal.description')">
    <div class="modal-actions">
      <Button
        variant="outline"
        :disabled="busy"
        :data-disabled-reason="t('exercises.savingExercise')"
        @click="confirmClose = false">
        {{ t('common.cancel') }}
      </Button>
      <Button
        variant="warning"
        :disabled="busy"
        :data-disabled-reason="t('exercises.savingExercise')"
        @click="close">
        {{ busy ? t('exercises.closeModal.closing') : t('exercises.closeModal.confirm') }}
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
  padding: 14px 12px;
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
.exercise-danger-actions,
.exercise-danger-actions > .inline-items,
.exercise-preview-actions > .inline-items,
.exercise-preview .panel-heading > .inline-items {
  flex-wrap: wrap;
  gap: 10px;
}
.exercise-list-item > div {
  flex: 1;
  min-width: 0;
}
.exercise-list-title small {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.exercise-list-language {
  display: inline-flex;
  align-items: center;
  gap: 4px;
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
