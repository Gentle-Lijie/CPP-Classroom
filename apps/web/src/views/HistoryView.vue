<script setup lang="ts">
import PythonBeta from '@/components/classroom/PythonBeta.vue'
import { sourceLanguage } from '@/lib/source-language'
import CodeBlock from '@/components/classroom/CodeBlock.vue'
import { Alert } from '@/components/ui/alert'
import { Select, SelectOption } from '@/components/ui/select'
import { computed, ref, watch } from 'vue'
import { History, Download, CodeXml, RefreshCw } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import CodeEditor from '@/components/classroom/CodeEditor.vue'
import RunOutput from '@/components/classroom/RunOutput.vue'
import Pagination from '@/components/classroom/Pagination.vue'
import ContentPanel from '@/components/classroom/ContentPanel.vue'
import {
  currentUser,
  download,
  tone,
  demo,
  exercises,
  classPath,
  type RunRecord,
} from '@/data/demo'
import { api } from '@/lib/api'
import { compilerLabel, formatTime } from '@/lib/display'
import { useI18n } from 'vue-i18n'
const { t } = useI18n()
import { statusLabel } from '@/lib/status-labels'
const records = ref<RunRecord[]>([])
const run = ref<RunRecord>()
const page = ref(1),
  pageSize = ref(10),
  total = ref(0),
  loading = ref(false),
  error = ref(''),
  filter = ref(''),
  status = ref('')
const filtered = computed(() => !!filter.value || !!status.value)
const statusOptions = computed(() => [
  { value: 'finished', label: t('student.history.status.runCompleted') },
  { value: 'compile_error', label: t('student.history.status.compileFailed') },
  { value: 'runtime_error', label: t('student.history.status.runFailed') },
  { value: 'resource_limited', label: t('student.history.status.resourceLimited') },
  { value: 'timeout', label: t('student.history.status.timeout') },
  { value: 'stopped', label: t('student.history.status.stopped') },
  { value: 'platform_error', label: t('student.history.status.platformFailed') },
])
const owner = computed(() =>
  currentUser.value?.name && currentUser.value.name !== currentUser.value.username
    ? `${currentUser.value.name} · ${currentUser.value.username}`
    : (currentUser.value?.username ?? t('student.history.currentUser')),
)
function exerciseTitle(record: RunRecord) {
  return exercises.find((exercise) => exercise.id === record.exerciseId)?.title || record.filename
}
function clearFilters() {
  filter.value = ''
  status.value = ''
}
let generation = 0

async function load() {
  const current = ++generation
  loading.value = true
  error.value = ''
  try {
    const params = new URLSearchParams({
      page: String(page.value),
      pageSize: String(pageSize.value),
    })
    if (filter.value) params.set('exercise', filter.value)
    if (status.value) params.set('status', status.value)
    const result = await api<{ items: RunRecord[]; total: number }>(classPath('/runs?' + params))
    if (current !== generation) return
    records.value = result.items
    total.value = result.total
    run.value = result.items.find((r) => r.id === run.value?.id) ?? result.items[0]
  } catch (e) {
    if (current === generation)
      error.value = e instanceof Error ? e.message : t('student.history.loadFailed')
  } finally {
    if (current === generation) loading.value = false
  }
}
watch([() => demo.classroomId, filter, status], () => {
  page.value = 1
  run.value = undefined
  records.value = []
  void load()
})
watch(
  pageSize,
  () => {
    page.value = 1
  },
  { flush: 'sync' },
)
watch([page, pageSize], () => void load())
void load()
</script>
<template>
  <div class="page-heading">
    <div>
      <div class="heading-meta">{{ t('student.history.meta') }}</div>
      <h1>{{ t('student.history.title') }}</h1>
    </div>
    <div class="heading-actions">
      <Button
        variant="outline"
        :disabled="loading"
        :data-disabled-reason="t('student.history.refreshReason')"
        data-guide="history-refresh"
        @click="load">
        <RefreshCw />
        {{ t('common.refresh') }}
      </Button>
      <Button
        data-guide="history-download"
        :disabled="!run"
        :data-disabled-reason="t('student.history.downloadReason')"
        variant="outline"
        @click="run && download(run.id + '-' + run.filename, run.code)">
        <Download />
        {{ t('student.history.downloadSnapshot') }}
      </Button>
    </div>
  </div>
  <div class="history-filter">
    <label>
      {{ t('student.history.exerciseLabel') }}
      <Select v-model="filter" :aria-label="t('student.history.filterExerciseAria')">
        <SelectOption value="">{{ t('student.history.allExercises') }}</SelectOption>
        <SelectOption v-for="e in exercises" :key="e.id" :value="e.id">{{ e.title }}</SelectOption>
      </Select>
    </label>
    <label>
      {{ t('student.history.statusLabel') }}
      <Select v-model="status" :aria-label="t('student.history.filterStatusAria')">
        <SelectOption value="">{{ t('student.history.allStatuses') }}</SelectOption>
        <SelectOption v-for="s in statusOptions" :key="s.value" :value="s.value">
          {{ s.label }}
        </SelectOption>
      </Select>
    </label>
    <span>{{ t('student.history.totalRuns', { count: total }) }}</span>
  </div>
  <Alert v-if="error" role="alert" type="error">
    {{ error }}

    <template #actions>
      <Button variant="outline" size="sm" @click="load">{{ t('common.retry') }}</Button>
    </template>
  </Alert>
  <ContentPanel v-if="loading && !records.length" content-class="empty-state" role="status">
    {{ t('student.history.loading') }}
  </ContentPanel>
  <ContentPanel v-else-if="!records.length && !error" content-class="empty-state">
    <History :size="32" />
    <h2>
      {{ filtered ? t('student.history.emptyFilteredTitle') : t('student.history.emptyTitle') }}
    </h2>
    <p>
      {{ filtered ? t('student.history.emptyFilteredBody') : t('student.history.emptyBody') }}
    </p>
    <div v-if="filtered">
      <Button variant="outline" @click="clearFilters">
        {{ t('student.history.clearFilters') }}
      </Button>
    </div>
    <RouterLink v-else data-guide="history-empty-back" to="/student/classes" class="text-button">
      {{ t('student.history.goClasses') }}
    </RouterLink>
  </ContentPanel>
  <div v-else-if="records.length" class="history-page-layout fill-stack" :aria-busy="loading">
    <ContentPanel as="section" direct class="panel-fill">
      <div class="panel-heading">
        <h2>{{ t('student.history.recordsTitle') }}</h2>
        <History :size="17" class="muted" />
      </div>
      <div class="history-list fill-body">
        <Button
          v-for="r in records"
          :key="r.id"
          variant="plain"
          class="history-item"
          :class="{ selected: run?.id === r.id }"
          @click="run = r">
          <span>
            <span class="history-record-heading">
              <strong>{{ exerciseTitle(r) }}</strong>
              <span class="status" :class="tone(r.status)">{{ statusLabel(r.status) }}</span>
            </span>
            <small>{{ owner }}</small>
            <small>{{ formatTime(r.time) }} · {{ r.id.slice(0, 8) }}</small>
          </span>
        </Button>
      </div>
      <Pagination
        v-model:page="page"
        v-model:page-size="pageSize"
        :total="total"
        :busy="loading"
        :unit="t('student.history.recordUnit')" />
    </ContentPanel>
    <ContentPanel v-if="run" as="section" direct class="panel-fill">
      <div class="panel-heading">
        <div class="history-detail-heading">
          <div class="inline-items">
            <h2>{{ exerciseTitle(run) }}</h2>
            <span class="status" :class="tone(run.status)">{{ statusLabel(run.status) }}</span>
          </div>
          <p class="muted text-sm">{{ owner }} · {{ run.id.slice(0, 8) }}</p>
        </div>
        <span class="muted text-xs">{{ t('student.history.readonlySnapshot') }}</span>
      </div>
      <div class="fill-body">
        <div class="code-toolbar">
          <CodeXml :size="14" />
          {{ run.filename }}
          <PythonBeta v-if="sourceLanguage(run) === 'python'" />
          <span class="language-label ml-auto">
            {{ compilerLabel(run.runtimeProfile ?? run.compilerProfile) }}
          </span>
        </div>
        <div class="history-editor">
          <CodeEditor
            :model-value="run.code"
            :language="sourceLanguage(run)"
            :filename="run.filename"
            readonly />
        </div>
        <div class="detail-io">
          <section class="detail-input">
            <CodeBlock
              :source="run.input"
              :label="t('student.detail.inputLabel')"
              :empty-text="t('student.detail.inputEmpty')" />
          </section>
          <RunOutput :key="run.id" :run="run" readonly-context />
        </div>
      </div>
    </ContentPanel>
  </div>
</template>
<style scoped>
.history-record-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}
.history-record-heading strong {
  min-width: 0;
  overflow-wrap: anywhere;
}
.history-record-heading .status {
  flex-shrink: 0;
}
.history-detail-heading {
  display: grid;
  gap: 4px;
  min-width: 0;
}
.history-filter {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 20px;
  color: var(--ui-secondary);
  font-size: 15px;
  flex-wrap: wrap;
}
.history-filter label {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.history-filter .ui-select-trigger {
  max-width: min(340px, 70vw);
}
.history-page-layout {
  align-items: stretch;
  grid-template-rows: minmax(0, 1fr);
}
.history-page-layout > section {
  min-width: 0;
  min-height: 0;
}
.history-page-layout .panel-heading .inline-items {
  flex-wrap: wrap;
}
.history-list {
  overflow: auto;
}
.detail-input pre {
  max-height: 220px;
  overflow: auto;
}
</style>
