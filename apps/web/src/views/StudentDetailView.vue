<script setup lang="ts">
import CodeBlock from '@/components/classroom/CodeBlock.vue'
import { Alert } from '@/components/ui/alert'
import { exerciseSourceFilename, type SourceLanguage } from '@classroom/contracts'
import LanguageSelect from '@/components/classroom/LanguageSelect.vue'
import PythonBeta from '@/components/classroom/PythonBeta.vue'
import { sourceLanguage } from '@/lib/source-language'
import ThemeToggle from '@/components/classroom/ThemeToggle.vue'
import { Select, SelectOption } from '@/components/ui/select'
import { computed, ref, watch, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Radio,
  Monitor,
  History,
  CodeXml,
  Hand,
  CircleCheck,
  LockKeyhole,
  Download,
} from '@lucide/vue'
import { Button } from '@/components/ui/button'
import CodeEditor from '@/components/classroom/CodeEditor.vue'
import RunOutput from '@/components/classroom/RunOutput.vue'
import Pagination from '@/components/classroom/Pagination.vue'
import {
  students,
  exercises,
  demo,
  reportError,
  notify,
  download,
  type RunRecord,
  type Student,
  executionSettings,
} from '@/data/demo'
import { api } from '@/lib/api'
import { confirmAction } from '@/lib/confirm'
import { compilerLabel, formatTime } from '@/lib/display'
import { useI18n } from 'vue-i18n'
const { t } = useI18n()
import { statusLabel } from '@/lib/status-labels'
const route = useRoute()
const router = useRouter()
type Snapshot = RunRecord & { kind?: 'run' | 'submission' }
const pendingSubmission = ref(String(route.query.submission ?? '')),
  snapshotError = ref('')
const viewing = ref<Snapshot>(),
  sidebarTab = ref(pendingSubmission.value ? 'submissions' : 'runs')
const student = computed(
  () =>
    students.find((s) => s.id === route.params.id) as
      | (Student & { helpMessage?: string; helpExerciseId?: string; helpRequestId?: string })
      | undefined,
)
const chosenExercise = ref(String(route.query.exercise ?? ''))
const language = ref<SourceLanguage>(
  route.query.language === 'python' ? 'python' : sourceLanguage(student.value),
)
const displayLanguage = computed(() =>
  viewing.value ? sourceLanguage(viewing.value) : language.value,
)
const popup = computed(() => route.path.startsWith('/teacher/inspect/'))
const sidebarTabs = computed(
  () =>
    [
      { key: 'runs', label: t('student.detail.tabRuns') },
      { key: 'submissions', label: t('student.detail.tabSubmissions') },
    ] as const,
)
const exercise = computed(() => {
  const found =
    exercises.find(
      (e) => e.id === (chosenExercise.value || student.value?.exerciseId || demo.recommended),
    ) ?? exercises[0]
  return found
    ? {
        ...found,
        filename: exerciseSourceFilename(found, language.value),
        title: found.title || t('student.detail.unnamedExercise'),
      }
    : undefined
})
const index = computed(() => students.findIndex((s) => s.id === student.value?.id))
const currentCode = ref(''),
  records = ref<Snapshot[]>([]),
  submissions = ref<Snapshot[]>([]),
  latestRun = ref<RunRecord>()
const loading = ref(true),
  error = ref(''),
  projecting = ref(false),
  resolving = ref(false)
const recordPage = ref(1),
  submissionPage = ref(1),
  pageSize = ref(10),
  recordTotal = ref(0),
  submissionTotal = ref(0)
type Submitted = {
  language?: SourceLanguage
  runtime_profile?: string
  id: string
  filename: string
  code: string
  created_at: string
}
function submissionSnapshot(record: Submitted): Snapshot {
  return {
    ...record,
    runtimeProfile: record.runtime_profile,
    kind: 'submission',
    status: 'submitted',
    time: record.created_at,
    input: '',
    output: '',
    log: '',
    exit: '',
  }
}
type HelpRequest = { id: string; message: string; exercise_id: string; created_at: string }
const currentHelp = ref<HelpRequest>()
let generation = 0,
  inFlight = false
function context() {
  return {
    student: student.value?.id,
    language: language.value,
    exercise: exercise.value?.id,
    classroom: demo.classroomId,
    generation,
  }
}
function matches(c: ReturnType<typeof context>) {
  return (
    c.student === student.value?.id &&
    c.language === language.value &&
    c.exercise === exercise.value?.id &&
    c.classroom === demo.classroomId &&
    c.generation === generation
  )
}
function path(c: ReturnType<typeof context>, suffix: string) {
  return '/classes/' + c.classroom + suffix
}
async function reload(initial = false) {
  const c = context()
  if (!c.student || !c.exercise) {
    loading.value = false
    return
  }
  if (initial) loading.value = true
  inFlight = true
  try {
    const draft = await api<{ code: string; help?: HelpRequest | null }>(
      path(c, '/workspace/' + c.exercise + '?student=' + c.student + '&language=' + c.language),
    )
    if (!matches(c)) return
    currentCode.value = draft.code
    currentHelp.value = draft.help?.exercise_id === c.exercise ? draft.help : undefined
    if (sidebarTab.value !== 'runs' || recordPage.value !== 1) {
      const latest = await api<{ items: RunRecord[] }>(
        path(
          c,
          `/runs?student=${c.student}&exercise=${c.exercise}&language=${c.language}&page=1&pageSize=1`,
        ),
      )
      if (!matches(c)) return
      latestRun.value = latest.items[0]
    }
    if (sidebarTab.value === 'runs') {
      const result = await api<{ items: RunRecord[]; total: number }>(
        path(
          c,
          `/runs?student=${c.student}&exercise=${c.exercise}&language=${c.language}&page=${recordPage.value}&pageSize=${pageSize.value}`,
        ),
      )
      if (!matches(c)) return
      records.value = result.items.map((r) => ({ ...r, kind: 'run' as const }))
      recordTotal.value = result.total
      if (recordPage.value === 1) latestRun.value = result.items[0]
    } else {
      const result = await api<{
        items: Submitted[]
        total: number
      }>(
        path(
          c,
          `/submissions?student=${c.student}&exercise=${c.exercise}&language=${c.language}&page=${submissionPage.value}&pageSize=${pageSize.value}`,
        ),
      )
      if (!matches(c)) return
      submissions.value = result.items.map(submissionSnapshot)
      submissionTotal.value = result.total
    }
    if (pendingSubmission.value) {
      const requested = pendingSubmission.value
      const result = await api<{ items: Submitted[] }>(
        path(
          c,
          `/submissions?student=${c.student}&exercise=${c.exercise}&submissionId=${requested}&page=1&pageSize=1`,
        ),
      )
      if (!matches(c) || pendingSubmission.value !== requested) return
      const selected = result.items.find((item) => item.id === requested)
      pendingSubmission.value = ''
      if (selected) {
        viewing.value = submissionSnapshot(selected)
        snapshotError.value = ''
      } else snapshotError.value = t('student.detail.snapshotNotFound')
    }
    error.value = snapshotError.value
  } catch (e) {
    if (matches(c)) error.value = e instanceof Error ? e.message : t('student.detail.loadFailed')
  } finally {
    inFlight = false
    if (matches(c)) loading.value = false
  }
}
watch(
  [() => route.params.id, () => exercise.value?.id, () => demo.classroomId],
  () => {
    generation++
    language.value =
      route.query.language === 'python' || route.query.language === 'cpp'
        ? route.query.language
        : sourceLanguage(student.value)
    viewing.value = undefined
    currentCode.value = ''
    currentHelp.value = undefined
    latestRun.value = undefined
    records.value = []
    submissions.value = []
    recordPage.value = 1
    submissionPage.value = 1
    error.value = ''
    void reload(true)
  },
  { immediate: true },
)
watch(
  [() => route.query.exercise, () => route.query.submission, () => route.query.language],
  () => {
    pendingSubmission.value = String(route.query.submission ?? '')
    snapshotError.value = ''
    chosenExercise.value = String(route.query.exercise ?? '')
    language.value =
      route.query.language === 'python' || route.query.language === 'cpp'
        ? route.query.language
        : sourceLanguage(student.value)
    sidebarTab.value = pendingSubmission.value ? 'submissions' : 'runs'
    generation++
    viewing.value = undefined
    void reload(true)
  },
)
watch(
  pageSize,
  () => {
    recordPage.value = 1
    submissionPage.value = 1
  },
  { flush: 'sync' },
)
watch(language, () => {
  generation++
  viewing.value = undefined
  recordPage.value = 1
  submissionPage.value = 1
  void reload(true)
})
watch([recordPage, submissionPage, pageSize, sidebarTab], () => {
  generation++
  void reload()
})
const poll = setInterval(() => {
  if (!inFlight && !document.hidden) void reload()
}, 2500)
onBeforeUnmount(() => {
  generation++
  clearInterval(poll)
})
function navigate(step: number) {
  const next = students[index.value + step]
  if (next) void router.push((popup.value ? '/teacher/inspect/' : '/teacher/students/') + next.id)
}
async function project() {
  if (projecting.value || loading.value || !student.value || !exercise.value) return
  const c = context(),
    snapshot = viewing.value
  if (!(await confirmAction(t('student.detail.projectConfirm', { name: student.value.name }))))
    return
  if (!matches(c) || viewing.value !== snapshot) return
  projecting.value = true
  try {
    const result = await api<{ id: string }>(path(c, '/projections'), 'POST', {
      student: c.student,
      exerciseId: c.exercise,
      language: c.language,
      ...(snapshot
        ? snapshot.kind === 'submission'
          ? { submissionId: snapshot.id }
          : { runId: snapshot.id }
        : {}),
    })
    if (matches(c))
      await router.push({ path: '/projection/' + result.id, query: { class: c.classroom } })
  } catch (e) {
    reportError(e)
  } finally {
    projecting.value = false
  }
}
async function resolveHelp() {
  if (resolving.value || !student.value || !currentHelp.value) return
  resolving.value = true
  const c = context(),
    requestId = currentHelp.value.id,
    exerciseId = currentHelp.value.exercise_id
  try {
    await api(path(c, '/help/' + c.student + '/resolve'), 'POST', {
      ...(requestId ? { requestId } : {}),
      exerciseId,
    })
    if (matches(c) && currentHelp.value?.id === requestId) currentHelp.value = undefined
    notify(t('student.detail.helpResolved'))
    await reload()
  } catch (e) {
    reportError(e)
  } finally {
    resolving.value = false
  }
}

function closeWindow() {
  if (window.opener) window.close()
  else router.push('/teacher/overview')
}
</script>
<template>
  <div v-if="popup" class="inspect-banner">
    <span>
      <Monitor :size="15" />
      {{ t('student.detail.banner') }}
      <span class="demo-tag">{{ t('student.detail.liveTag') }}</span>
    </span>
    <div class="inline-items">
      <ThemeToggle />
      <Button variant="outline" size="sm" @click="closeWindow">
        {{ t('student.detail.closeWindow') }}
      </Button>
    </div>
  </div>
  <div v-if="student && exercise" class="detail-page" :class="{ 'inspect-detail': popup }">
    <div class="detail-heading">
      <div class="inline-items">
        <RouterLink
          to="/teacher/overview"
          class="icon-button"
          :aria-label="t('student.detail.backAria')">
          <ArrowLeft :size="20" />
        </RouterLink>
        <span class="student-avatar large">{{ student.name.slice(-2) }}</span>
        <div>
          <h1>
            {{ student.name }}
            <span class="heading-count">{{ student.number }}</span>
          </h1>
          <p>
            <i class="presence" :class="{ online: student.online }" />
            {{ student.online ? t('student.detail.online') : t('student.detail.offline') }}
            <span class="footer-dot">·</span>
            {{ exercise.title }}
            <span class="footer-dot">·</span>
            {{ t('student.detail.lastActivity') }}
            {{ student.activity }}
          </p>
        </div>
      </div>
      <div class="inline-items">
        <Button
          :disabled="projecting || loading || !!error"
          :data-disabled-reason="
            projecting
              ? t('student.detail.projectingReason')
              : loading
                ? t('student.detail.loadingReason')
                : t('student.detail.loadFailedReason')
          "
          @click="project">
          <Monitor />
          {{ projecting ? t('student.detail.projectPreparing') : t('student.detail.project') }}
        </Button>
        <div class="student-pager">
          <Button
            variant="plain"
            class="icon-button"
            :disabled="index === 0"
            :data-disabled-reason="t('student.detail.firstStudent')"
            :aria-label="t('student.detail.prevStudentAria')"
            @click="navigate(-1)">
            <ChevronLeft :size="18" />
          </Button>
          <span>{{ index + 1 }} / {{ students.length }}</span>
          <Button
            variant="plain"
            class="icon-button"
            :disabled="index === students.length - 1"
            :data-disabled-reason="t('student.detail.lastStudent')"
            :aria-label="t('student.detail.nextStudentAria')"
            @click="navigate(1)">
            <ChevronRight :size="18" />
          </Button>
        </div>
      </div>
    </div>
    <Alert v-if="error" role="alert" type="error">
      {{ error }}

      <template #actions>
        <Button variant="outline" size="sm" @click="reload(true)">
          {{ t('student.detail.reload') }}
        </Button>
      </template>
    </Alert>
    <Alert v-if="loading" role="status" type="info">{{ t('student.detail.loadingWork') }}</Alert>
    <label class="detail-exercise-select">
      {{ t('student.detail.viewExercise') }}
      <Select v-model="chosenExercise" :aria-label="t('student.detail.selectExerciseAria')">
        <SelectOption value="">{{ t('student.detail.followExercise') }}</SelectOption>
        <SelectOption v-for="e in exercises" :key="e.id" :value="e.id">{{ e.title }}</SelectOption>
      </Select>
    </label>
    <div class="detail-workbench">
      <div class="detail-code-panel panel">
        <div class="detail-followbar">
          <div class="inline-items">
            <Radio v-if="!viewing" :size="15" class="positive-text" />
            <History v-else :size="15" class="amber-text" />
            <strong>
              {{
                viewing
                  ? viewing.kind === 'submission'
                    ? t('student.detail.submissionSnapshot')
                    : t('student.detail.runSnapshot')
                  : t('student.detail.followCurrent')
              }}
            </strong>
            <span class="muted text-xs">
              {{
                viewing
                  ? viewing.id.slice(0, 8) + ' · ' + formatTime(viewing.time)
                  : t('student.detail.currentDraft')
              }}
            </span>
          </div>
          <Button v-if="viewing" variant="outline" size="sm" @click="viewing = undefined">
            {{ t('student.detail.backToCurrent') }}
            <ArrowRight />
          </Button>
          <span v-else class="readonly-label">
            <LockKeyhole :size="12" />
            {{ t('student.detail.teacherReadonly') }}
          </span>
        </div>
        <Alert v-if="viewing" type="info" class="app-alert--banner">
          {{ t('student.detail.snapshotNotice') }}
        </Alert>
        <div class="code-toolbar">
          <LanguageSelect
            :model-value="displayLanguage"
            :disabled="!!viewing || loading"
            @update:model-value="language = $event" />
          <span class="file-tab">
            <CodeXml :size="14" />
            {{ viewing?.filename ?? exercise.filename }}
          </span>
          <Button
            variant="plain"
            class="icon-button ml-auto"
            :aria-label="t('student.detail.downloadAria')"
            @click="
              download(
                student.number + '-' + (viewing?.filename ?? exercise.filename),
                viewing?.code ?? currentCode,
              )
            ">
            <Download :size="14" />
          </Button>
          <PythonBeta v-if="displayLanguage === 'python'" />
          <span class="language-label">
            {{
              compilerLabel(
                viewing
                  ? (viewing.runtimeProfile ?? viewing.compilerProfile)
                  : language === 'python'
                    ? 'cpython3-stdlib'
                    : executionSettings.compilerProfile,
              )
            }}
          </span>
        </div>
        <div class="detail-editor">
          <CodeEditor
            :model-value="viewing?.code ?? currentCode"
            :language="displayLanguage"
            :filename="viewing?.filename ?? exercise.filename"
            readonly />
        </div>
        <div class="detail-io">
          <section class="detail-input">
            <CodeBlock
              :source="(viewing ?? latestRun)?.input ?? ''"
              :label="t('student.detail.inputLabel')"
              :empty-text="t('student.detail.inputEmpty')" />
          </section>
          <RunOutput
            v-if="viewing?.kind !== 'submission'"
            :key="viewing?.id ?? 'current'"
            :run="viewing ?? latestRun"
            readonly-context />
          <Alert v-else type="info">{{ t('student.detail.submissionOnly') }}</Alert>
        </div>
      </div>
      <aside class="detail-aside">
        <section v-if="currentHelp" class="help-detail-panel">
          <div class="inline-items amber-text">
            <Hand :size="17" />
            <strong>{{ t('student.detail.helpTitle') }}</strong>
            <span class="ml-auto text-xs">{{ t('student.detail.helpPending') }}</span>
          </div>
          <p>
            {{ currentHelp.message }}
          </p>
          <span class="muted text-xs">
            {{
              t('student.detail.helpExercise', {
                title: exercise.title,
                time: formatTime(currentHelp.created_at),
              })
            }}
          </span>
          <Button
            class="w-full"
            variant="success"
            :disabled="resolving"
            :data-disabled-reason="t('student.detail.helpResolvingReason')"
            @click="resolveHelp">
            <CircleCheck />
            {{ resolving ? t('student.detail.helpResolving') : t('student.detail.resolveHelp') }}
          </Button>
        </section>
        <section class="panel">
          <div class="filter-tabs">
            <Button
              v-for="tab in sidebarTabs"
              :key="tab.key"
              variant="plain"
              :class="{ selected: sidebarTab === tab.key }"
              @click="sidebarTab = tab.key">
              {{ tab.label }}
            </Button>
          </div>
          <div v-if="sidebarTab === 'runs'" class="history-list">
            <Button
              v-for="r in records"
              :key="r.id"
              variant="plain"
              class="history-item"
              :class="{ selected: viewing?.id === r.id }"
              @click="viewing = r">
              <span
                class="history-state-dot"
                :class="
                  r.status === 'compile_error'
                    ? 'red'
                    : r.status === 'finished'
                      ? 'positive'
                      : 'amber'
                " />
              <span>
                <strong>{{ statusLabel(r.status) }}</strong>
                <small>{{ formatTime(r.time) }} · {{ r.id.slice(0, 8) }}</small>
              </span>
              <ArrowUpRight :size="14" />
            </Button>
            <p v-if="!records.length && !loading" class="small-empty">
              {{ t('student.detail.noRuns') }}
            </p>
          </div>
          <div v-else class="history-list">
            <Button
              v-for="s in submissions"
              :key="s.id"
              variant="plain"
              class="history-item"
              @click="viewing = s">
              <CircleCheck :size="22" class="positive-text" />
              <span>
                <strong>{{ t('student.detail.submissionFixed') }}</strong>
                <small>{{ new Date(s.time).toLocaleString() }}</small>
              </span>
            </Button>
            <div v-if="!submissions.length" class="small-empty">
              <History :size="25" />
              <h3>{{ t('student.detail.notSubmitted') }}</h3>
            </div>
          </div>
          <Pagination
            v-if="sidebarTab === 'runs'"
            v-model:page="recordPage"
            v-model:page-size="pageSize"
            :total="recordTotal"
            :busy="loading"
            :unit="t('student.detail.runUnit')" />
          <Pagination
            v-else
            v-model:page="submissionPage"
            v-model:page-size="pageSize"
            :total="submissionTotal"
            :busy="loading"
            :unit="t('student.detail.submissionUnit')" />
        </section>
      </aside>
    </div>
  </div>
  <div v-else class="empty-state">
    <h1>
      {{ student ? t('student.detail.noExerciseTitle') : t('student.detail.noStudentTitle') }}
    </h1>
    <p>
      {{ student ? t('student.detail.noExerciseBody') : t('student.detail.noStudentBody') }}
    </p>
    <RouterLink :to="student ? '/teacher/exercises/new' : '/teacher/roster'">
      {{ student ? t('student.detail.createExercise') : t('student.detail.backRoster') }}
    </RouterLink>
  </div>
</template>

<style scoped>
.detail-exercise-select {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 0 0 18px;
  font-size: 15px;
  flex-wrap: wrap;
}
.detail-exercise-select .ui-select-trigger {
  max-width: min(420px, 100%);
}
.detail-heading,
.detail-heading > .inline-items {
  flex-wrap: wrap;
  min-width: 0;
}
.detail-heading h1 {
  overflow-wrap: anywhere;
}
.detail-heading p {
  flex-wrap: wrap;
  font-size: 15px;
  line-height: 1.7;
}
.detail-workbench > *,
.detail-followbar > .inline-items {
  min-width: 0;
}
.detail-followbar {
  flex-wrap: wrap;
  height: auto;
  min-height: 48px;
  gap: 10px;
}
.detail-followbar .inline-items {
  flex-wrap: wrap;
}
.detail-aside .history-list {
  max-height: 400px;
  overflow: auto;
}
.detail-aside :deep(.pagination) {
  padding: 12px;
}
.detail-aside :deep(.pagination-controls) {
  flex-wrap: wrap;
}
.detail-input pre {
  max-height: 240px;
  overflow: auto;
}
.detail-io :deep(.run-output) {
  min-height: 240px;
  max-height: 420px;
}
.help-detail-panel p {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
@media (max-width: 760px) {
  .detail-workbench {
    grid-template-columns: minmax(0, 1fr);
  }
  .detail-heading {
    gap: 16px;
  }
  .detail-heading .heading-count {
    display: block;
    width: fit-content;
    margin: 4px 0 0;
  }
  .detail-io {
    grid-template-columns: minmax(0, 1fr);
  }
  .detail-editor {
    height: 420px;
  }
}
</style>
