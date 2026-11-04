<script setup lang="ts">
import { isTeacher } from '@/data/demo'
import { exerciseSourceFilename, type SourceLanguage } from '@classroom/contracts'
import PythonBeta from '@/components/classroom/PythonBeta.vue'
import { sourceLanguage } from '@/lib/source-language'
import { useActionFeedback } from '@/composables/useActionFeedback'
import { Alert } from '@/components/ui/alert'
import { Select, SelectOption } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { computed, ref, watch, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { Search, Download, FileCode2, ArrowRight, PackageOpen, RefreshCw, X } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import Pagination from '@/components/classroom/Pagination.vue'
import ContentPanel from '@/components/classroom/ContentPanel.vue'
import { download, notify, classPath, activeClassroom, exercises, students } from '@/data/demo'
import { api } from '@/lib/api'
const { t } = useI18n()
import { csvDocument } from '@/lib/csv'
import { downloadBlob, safeArchivePart, sourceArchive } from '@/lib/source-archive'
interface Submission {
  language?: SourceLanguage
  id: string
  exercise_id: string
  user_id: string
  name: string
  number: string
  title: string
  filename: string
  code: string
  revision: number
  created_at: string
}
interface ExportWork {
  language?: SourceLanguage
  id: string
  exercise_id: string
  user_id: string
  code: string
  revision: number
  filename?: string
  created_at?: string
  updated_at?: string
}
interface ExportData {
  classroomId: string
  exportedAt: string
  roster: { id: string; name: string; number: string }[]
  exercises: { id: string; filename: string; content: { title: string } }[]
  drafts: ExportWork[]
  submissions: ExportWork[]
  runs?: ExportWork[]
}
const search = ref(''),
  exercise = ref(''),
  student = ref(''),
  latest = ref(true)
const selected = ref<string[]>([]),
  includeRuns = ref(false)
const submissions = ref<Submission[]>([]),
  page = ref(1),
  pageSize = ref(20),
  total = ref(0)
const loading = ref(false),
  exporting = ref(false),
  error = ref(''),
  exportError = ref(''),
  updatedAt = ref('')
const format = ref<'zip' | 'csv' | 'json'>('zip'),
  kind = ref<'all' | 'drafts' | 'submissions'>('all')
const pageSelected = computed(
  () =>
    submissions.value.length > 0 && submissions.value.every((s) => selected.value.includes(s.id)),
)
const somePageSelected = computed(() =>
  submissions.value.some((s) => selected.value.includes(s.id)),
)
let generation = 0,
  timer: ReturnType<typeof setTimeout> | undefined
onBeforeUnmount(() => {
  generation++
  clearTimeout(timer)
})
async function load() {
  const request = ++generation
  loading.value = true
  error.value = ''
  try {
    const params = new URLSearchParams({
      page: String(page.value),
      pageSize: String(pageSize.value),
      latest: String(latest.value),
      search: search.value.trim(),
    })
    if (exercise.value) params.set('exercise', exercise.value)
    if (student.value) params.set('student', student.value)
    const result = await api<{ items: Submission[]; total: number }>(
      classPath('/submissions?' + params),
    )
    if (request !== generation) return
    submissions.value = result.items
    total.value = result.total
    if (page.value > Math.max(1, Math.ceil(result.total / pageSize.value))) {
      page.value = Math.max(1, Math.ceil(result.total / pageSize.value))
      return
    }
    updatedAt.value = new Date().toLocaleTimeString('zh-CN')
  } catch (e) {
    if (request === generation)
      error.value = e instanceof Error ? e.message : t('overview.submissions.loadFailed')
  } finally {
    if (request === generation) loading.value = false
  }
}
watch([exercise, student, latest], () => {
  selected.value = []
  if (page.value !== 1) page.value = 1
  else void load()
})
watch(search, () => {
  selected.value = []
  clearTimeout(timer)
  timer = setTimeout(() => {
    if (page.value !== 1) page.value = 1
    else void load()
  }, 300)
})
watch([page, pageSize], () => void load(), { immediate: true })
function togglePage() {
  const ids = submissions.value.map((s) => s.id)
  selected.value = pageSelected.value
    ? selected.value.filter((id) => !ids.includes(id))
    : [...new Set([...selected.value, ...ids])]
}
async function exportWorks() {
  if (exporting.value) return
  exporting.value = true
  exportError.value = ''
  try {
    const params = new URLSearchParams({
      includeRuns: String(includeRuns.value && format.value === 'json'),
      kind: kind.value,
    })
    if (exercise.value) params.set('exercise', exercise.value)
    if (student.value) params.set('student', student.value)
    const data = await api<ExportData>(classPath('/export?' + params))
    if (selected.value.length && kind.value !== 'drafts') {
      data.submissions = data.submissions.filter((s) => selected.value.includes(s.id))
      const pairs = new Set(
        data.submissions.map((s) => `${s.user_id}:${s.exercise_id}:${sourceLanguage(s)}`),
      )
      data.drafts = data.drafts.filter((s) =>
        pairs.has(`${s.user_id}:${s.exercise_id}:${sourceLanguage(s)}`),
      )
      if (data.runs)
        data.runs = data.runs.filter((s) =>
          pairs.has(`${s.user_id}:${s.exercise_id}:${sourceLanguage(s)}`),
        )
    } else if (latest.value) {
      const newest = new Map<string, ExportWork>()
      for (const s of data.submissions) {
        const key = `${s.user_id}:${s.exercise_id}:${sourceLanguage(s)}`,
          previous = newest.get(key)
        if (!previous || `${s.created_at}:${s.id}` > `${previous.created_at}:${previous.id}`)
          newest.set(key, s)
      }
      data.submissions = [...newest.values()]
    }
    const records = [
      ...data.drafts.map((s) => ({ ...s, kind: t('overview.submissions.csv.draft') })),
      ...data.submissions.map((s) => ({ ...s, kind: t('overview.submissions.csv.submission') })),
    ]
    if (!records.length) {
      exportError.value = t('overview.submissions.emptyRange')
      return
    }
    const rows: (string | number)[][] = [
      [
        t('overview.submissions.csv.type'),
        t('overview.submissions.csv.name'),
        t('overview.submissions.csv.number'),
        t('overview.submissions.csv.exercise'),
        t('overview.submissions.csv.language'),
        t('overview.submissions.csv.filename'),
        t('overview.submissions.csv.revision'),
        t('overview.submissions.csv.time'),
        t('overview.submissions.csv.recordId'),
      ],
    ]
    const files = records.map((s) => {
      const person = data.roster.find((p) => p.id === s.user_id),
        problem = data.exercises.find((e) => e.id === s.exercise_id)
      const filename =
        s.filename ||
        exerciseSourceFilename(
          { id: s.exercise_id, filename: problem?.filename ?? '' },
          sourceLanguage(s),
        )
      rows.push([
        s.kind,
        person?.name ?? s.user_id,
        person?.number ?? '',
        problem?.content.title ?? s.exercise_id,
        sourceLanguage(s) === 'python' ? 'Python (Beta)' : 'C++',
        filename,
        s.revision,
        s.created_at ?? s.updated_at ?? '',
        s.id,
      ])
      return {
        name: `${safeArchivePart(`${person?.number ?? ''}-${person?.name ?? s.user_id}`)}/${safeArchivePart(problem?.content.title ?? s.exercise_id)}/${s.kind}-v${s.revision}-${s.id.slice(0, 8)}-${safeArchivePart(filename)}`,
        content: s.code,
      }
    })
    const name = `${safeArchivePart(activeClassroom.value.name)}-${kind.value === 'drafts' ? t('overview.submissions.fileNames.drafts') : kind.value === 'submissions' ? t('overview.submissions.fileNames.submissions') : t('overview.submissions.fileNames.all')}`
    if (format.value === 'json')
      download(name + '.json', JSON.stringify(data, null, 2), 'application/json')
    else if (format.value === 'csv')
      download(
        name + t('overview.submissions.fileNames.manifestSuffix'),
        csvDocument(rows),
        'text/csv;charset=utf-8',
      )
    else
      downloadBlob(
        name + '.zip',
        sourceArchive([
          ...files,
          { name: t('overview.submissions.fileNames.manifest'), content: csvDocument(rows) },
        ]),
      )
    notify(
      t('overview.submissions.exported', {
        count: records.length,
        type:
          format.value === 'csv'
            ? t('overview.submissions.exportedList')
            : t('overview.submissions.exportedWorks'),
      }),
    )
  } catch (e) {
    exportError.value = e instanceof Error ? e.message : t('overview.submissions.exportFailed')
  } finally {
    exporting.value = false
  }
}
useActionFeedback(exportError)
</script>

<template>
  <div class="page-heading">
    <div>
      <div class="heading-meta">{{ t('overview.submissions.metaTitle') }}</div>
      <h1>
        {{
          isTeacher
            ? t('overview.submissions.titleTeacher')
            : t('overview.submissions.titleStudent')
        }}
      </h1>
    </div>
    <Button
      variant="outline"
      :disabled="loading"
      :data-disabled-reason="t('overview.submissions.loadingReason')"
      @click="load">
      <RefreshCw :class="{ 'animate-spin': loading }" />
      {{ loading ? t('overview.submissions.refreshing') : t('overview.submissions.refresh') }}
    </Button>
  </div>
  <section v-if="isTeacher" class="panel export-panel">
    <div class="export-heading">
      <FileCode2 :size="22" />
      <div>
        <h2>{{ t('overview.submissions.exportTitle') }}</h2>
        <!-- <p>适用于当前学生、练习筛选；搜索关键词仅筛选下方提交列表。ZIP 内含源文件与 CSV 清单。</p> -->
      </div>
    </div>
    <div class="export-controls">
      <label>
        {{ t('overview.submissions.scopeLabel') }}
        <Select
          v-model="kind"
          :disabled="exporting"
          :data-disabled-reason="t('overview.submissions.preparingReason')">
          <SelectOption value="all">{{ t('overview.submissions.kindAll') }}</SelectOption>
          <SelectOption value="drafts">{{ t('overview.submissions.kindDrafts') }}</SelectOption>
          <SelectOption value="submissions">
            {{ t('overview.submissions.kindSubmissions') }}
          </SelectOption>
        </Select>
      </label>
      <label>
        {{ t('overview.submissions.formatLabel') }}
        <Select
          v-model="format"
          :disabled="exporting"
          :data-disabled-reason="t('overview.submissions.preparingReason')">
          <SelectOption value="zip">{{ t('overview.submissions.formatZip') }}</SelectOption>
          <SelectOption value="csv">{{ t('overview.submissions.formatCsv') }}</SelectOption>
          <SelectOption value="json">{{ t('overview.submissions.formatJson') }}</SelectOption>
        </Select>
      </label>
      <label v-if="format === 'json'" class="inline-items">
        <Checkbox
          v-model="includeRuns"
          :disabled="exporting"
          :data-disabled-reason="t('overview.submissions.preparingReason')" />
        {{ t('overview.submissions.includeRuns') }}
      </label>
      <Button
        :disabled="exporting"
        :data-disabled-reason="t('overview.submissions.preparingReason')"
        @click="exportWorks">
        <Download />
        {{
          exporting
            ? t('overview.submissions.preparing')
            : selected.length && kind !== 'drafts'
              ? t('overview.submissions.exportSelected', { count: selected.length })
              : t('overview.submissions.export')
        }}
      </Button>
    </div>
  </section>
  <ContentPanel as="section" direct class="panel-fill">
    <div class="panel-heading">
      <h2>
        {{ t('overview.submissions.panelTitle') }}
        <span class="muted">{{ total }}</span>
      </h2>
      <span class="muted text-xs">
        {{
          updatedAt
            ? t('overview.submissions.updatedAt', { time: updatedAt })
            : t('overview.submissions.notLoaded')
        }}
      </span>
    </div>
    <div class="table-controls">
      <label class="search-field">
        <Search :size="16" />
        <Input
          v-model="search"
          :aria-label="t('overview.submissions.searchAria')"
          :placeholder="t('overview.submissions.searchPlaceholder')" />
      </label>
      <div class="submission-filters">
        <Select v-model="exercise" :aria-label="t('overview.submissions.filterExerciseAria')">
          <SelectOption value="">{{ t('overview.patrol.allExercises') }}</SelectOption>
          <SelectOption v-for="e in exercises" :key="e.id" :value="e.id">
            {{ e.title }}
          </SelectOption>
        </Select>
        <Select v-model="student" :aria-label="t('overview.submissions.filterStudentAria')">
          <SelectOption value="">{{ t('overview.submissions.allStudents') }}</SelectOption>
          <SelectOption v-for="s in students" :key="s.id" :value="s.id">
            {{ s.number }} · {{ s.name }}
          </SelectOption>
        </Select>
        <label class="inline-items">
          <Checkbox v-model="latest" />
          {{ t('overview.submissions.latestOnly') }}
        </label>
      </div>
    </div>
    <div v-if="selected.length" class="selection-bar">
      <span>{{ t('overview.submissions.selectedCount', { count: selected.length }) }}</span>
      <Button variant="plain" class="text-button" @click="selected = []">
        <X :size="14" />
        {{ t('overview.submissions.clearSelection') }}
      </Button>
    </div>
    <Alert v-if="error" role="alert" type="error" class="app-alert--inset">
      {{ error }}

      <template #actions>
        <Button variant="outline" size="sm" @click="load">
          {{ t('overview.submissions.reload') }}
        </Button>
      </template>
    </Alert>
    <div class="table-scroll" :aria-busy="loading">
      <table>
        <thead>
          <tr>
            <th>
              <Checkbox
                :aria-label="t('overview.submissions.selectPage')"
                :checked="pageSelected"
                :indeterminate="somePageSelected && !pageSelected"
                :disabled="loading || !submissions.length"
                :data-disabled-reason="
                  loading
                    ? t('overview.submissions.loadingReason')
                    : t('overview.submissions.noPageRecords')
                "
                @change="togglePage" />
            </th>
            <th>{{ t('overview.submissions.columns.student') }}</th>
            <th>{{ t('overview.submissions.columns.exercise') }}</th>
            <th>{{ t('overview.submissions.columns.revision') }}</th>
            <th>{{ t('overview.submissions.columns.time') }}</th>
            <th>{{ t('overview.submissions.columns.work') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="s in submissions" :key="s.id">
            <td>
              <Checkbox
                v-model="selected"
                :value="s.id"
                :aria-label="
                  t('overview.submissions.selectOne', {
                    name: s.name,
                    title: s.title,
                    revision: s.revision,
                  })
                " />
            </td>
            <td>
              <div class="person-cell">
                <span class="student-avatar">{{ s.name.slice(-2) }}</span>
                <span class="person-text">
                  <strong>{{ s.name }}</strong>
                  <small>{{ s.number }}</small>
                </span>
              </div>
            </td>
            <td>
              <span class="table-exercise">{{ s.title }}</span>
              <small class="cell-secondary">
                {{ s.filename }}
                <PythonBeta v-if="sourceLanguage(s) === 'python'" />
              </small>
            </td>
            <td>
              <span class="status positive">
                {{ t('overview.submissions.submittedV', { revision: s.revision }) }}
              </span>
            </td>
            <td class="muted">{{ new Date(s.created_at).toLocaleString('zh-CN') }}</td>
            <td>
              <div class="inline-items">
                <Button
                  variant="plain"
                  class="text-button"
                  @click="download(`${s.number}-${s.name}-${s.filename}`, s.code)">
                  <Download :size="14" />
                  {{ t('overview.submissions.sourceFile') }}
                </Button>
                <RouterLink
                  :to="{
                    path: '/teacher/students/' + s.user_id,
                    query: {
                      exercise: s.exercise_id,
                      submission: s.id,
                      language: sourceLanguage(s),
                    },
                  }"
                  class="icon-button"
                  :aria-label="t('overview.submissions.viewSubmission')">
                  <ArrowRight :size="15" />
                </RouterLink>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-if="!submissions.length && !error" class="empty-state">
        <PackageOpen :size="30" />
        <h3>
          {{ loading ? t('overview.submissions.loadingMore') : t('overview.submissions.empty') }}
        </h3>
      </div>
    </div>
    <Pagination
      v-model:page="page"
      v-model:page-size="pageSize"
      :total="total"
      :busy="loading"
      :unit="t('overview.submissions.unit')" />
  </ContentPanel>
</template>
<style scoped>
.export-panel {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px 28px;
  padding: 18px 22px;
  margin-bottom: 24px;
}
.export-heading {
  display: flex;
  gap: 12px;
  align-items: center;
  color: var(--ui-action);
}
.export-heading > svg {
  flex-shrink: 0;
}
.export-heading h2 {
  font-size: 16px;
  font-weight: 600;
  color: var(--ui-ink);
}
.export-heading p {
  font-size: 15px;
  color: var(--ui-secondary);
  margin-top: 5px;
  line-height: 1.7;
}
.export-controls {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 14px;
}
.export-controls > label:not(.inline-items) {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: var(--ui-secondary);
  min-width: 0;
  white-space: nowrap;
}
.export-controls .ui-select-trigger {
  min-width: 180px;
  max-width: 100%;
  font-size: 15px;
}
.export-controls .inline-items {
  font-size: 15px;
  align-self: center;
}
.submission-filters {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  min-width: 0;
}
.submission-filters .ui-select-trigger {
  max-width: 200px;
  min-width: 0;
  font-size: 15px;
}
.submission-filters label {
  font-size: 14px;
}
.selection-bar {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  padding: 10px 20px;
  color: var(--ui-action);
  background: var(--ui-selection);
  font-size: 15px;
}
@media (max-width: 600px) {
  .export-panel {
    padding: 18px 16px;
  }
  .export-controls {
    flex-direction: column;
    align-items: stretch;
  }
  .export-controls > label:not(.inline-items),
  .export-controls > button {
    justify-content: flex-start;
    width: 100%;
  }
  .export-controls .ui-select-trigger {
    width: 100%;
  }
  .submission-filters {
    width: 100%;
  }
  .submission-filters .ui-select-trigger {
    flex: 1;
    max-width: 100%;
  }
  .submission-filters label {
    width: 100%;
  }
}
</style>
