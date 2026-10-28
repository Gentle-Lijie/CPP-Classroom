<script setup lang="ts">
import { Alert } from '@/components/ui/alert'
import { exerciseSourceFilename } from '@classroom/contracts'
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
import { compilerLabel, formatTime } from '@/lib/display'
const route = useRoute()
const router = useRouter()
type Snapshot = RunRecord & { kind?: 'run' | 'submission' }
const pendingSubmission = ref(String(route.query.submission ?? '')),
  snapshotError = ref('')
const viewing = ref<Snapshot>(),
  sidebarTab = ref(pendingSubmission.value ? '提交记录' : '运行记录')
const student = computed(
  () =>
    students.find((s) => s.id === route.params.id) as
      | (Student & { helpMessage?: string; helpExerciseId?: string; helpRequestId?: string })
      | undefined,
)
const chosenExercise = ref(String(route.query.exercise ?? ''))
const popup = computed(() => route.path.startsWith('/teacher/inspect/'))
const exercise = computed(() => {
  const found =
    exercises.find(
      (e) => e.id === (chosenExercise.value || student.value?.exerciseId || demo.recommended),
    ) ?? exercises[0]
  return found
    ? { ...found, filename: exerciseSourceFilename(found), title: found.title || '未命名题目' }
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
type Submitted = { id: string; filename: string; code: string; created_at: string }
function submissionSnapshot(record: Submitted): Snapshot {
  return {
    ...record,
    kind: 'submission',
    status: '已提交',
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
    exercise: exercise.value?.id,
    classroom: demo.classroomId,
    generation,
  }
}
function matches(c: ReturnType<typeof context>) {
  return (
    c.student === student.value?.id &&
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
      path(c, '/workspace/' + c.exercise + '?student=' + c.student),
    )
    if (!matches(c)) return
    currentCode.value = draft.code
    currentHelp.value = draft.help?.exercise_id === c.exercise ? draft.help : undefined
    if (sidebarTab.value !== '运行记录' || recordPage.value !== 1) {
      const latest = await api<{ items: RunRecord[] }>(
        path(c, `/runs?student=${c.student}&exercise=${c.exercise}&page=1&pageSize=1`),
      )
      if (!matches(c)) return
      latestRun.value = latest.items[0]
    }
    if (sidebarTab.value === '运行记录') {
      const result = await api<{ items: RunRecord[]; total: number }>(
        path(
          c,
          `/runs?student=${c.student}&exercise=${c.exercise}&page=${recordPage.value}&pageSize=${pageSize.value}`,
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
          `/submissions?student=${c.student}&exercise=${c.exercise}&page=${submissionPage.value}&pageSize=${pageSize.value}`,
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
      } else snapshotError.value = '未找到链接对应的提交快照，请核对课堂、学生与练习。'
    }
    error.value = snapshotError.value
  } catch (e) {
    if (matches(c)) error.value = e instanceof Error ? e.message : '读取学生作品失败'
  } finally {
    inFlight = false
    if (matches(c)) loading.value = false
  }
}
watch(
  [() => route.params.id, () => exercise.value?.id, () => demo.classroomId],
  () => {
    generation++
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
watch([() => route.query.exercise, () => route.query.submission], () => {
  pendingSubmission.value = String(route.query.submission ?? '')
  snapshotError.value = ''
  chosenExercise.value = String(route.query.exercise ?? '')
  sidebarTab.value = pendingSubmission.value ? '提交记录' : '运行记录'
  generation++
  viewing.value = undefined
  void reload(true)
})
watch(
  pageSize,
  () => {
    recordPage.value = 1
    submissionPage.value = 1
  },
  { flush: 'sync' },
)
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
  projecting.value = true
  const c = context(),
    snapshot = viewing.value
  try {
    const result = await api<{ id: string }>(path(c, '/projections'), 'POST', {
      student: c.student,
      exerciseId: c.exercise,
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
    notify('此求助已解决')
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
    <span><Monitor :size="15" />学生详情 · 独立窗口<span class="demo-tag">实时数据</span></span>
    <div class="inline-items">
      <ThemeToggle /><Button variant="outline" size="sm" @click="closeWindow">关闭此窗口</Button>
    </div>
  </div>
  <div v-if="student && exercise" class="detail-page" :class="{ 'inspect-detail': popup }">
    <div class="detail-heading">
      <div class="inline-items">
        <RouterLink to="/teacher/overview" class="icon-button" aria-label="返回课堂总览"
          ><ArrowLeft :size="20" /></RouterLink
        ><span class="student-avatar large">{{ student.name.slice(-2) }}</span>
        <div>
          <h1>
            {{ student.name }}<span class="heading-count">{{ student.number }}</span>
          </h1>
          <p>
            <i class="presence" :class="{ online: student.online }" />{{
              student.online ? '在线' : '离线'
            }}
            <span class="footer-dot">·</span> {{ exercise.title }}
            <span class="footer-dot">·</span> 最近活动
            {{ student.activity }}
          </p>
        </div>
      </div>
      <div class="inline-items">
        <Button :disabled="projecting || loading || !!error" @click="project"
          ><Monitor />{{ projecting ? '准备投屏…' : '投屏讲解' }}</Button
        >
        <div class="student-pager">
          <Button
            variant="plain"
            class="icon-button"
            :disabled="index === 0"
            aria-label="上一位学生"
            @click="navigate(-1)"
          >
            <ChevronLeft :size="18" /></Button
          ><span>{{ index + 1 }} / {{ students.length }}</span
          ><Button
            variant="plain"
            class="icon-button"
            :disabled="index === students.length - 1"
            aria-label="下一位学生"
            @click="navigate(1)"
          >
            <ChevronRight :size="18" />
          </Button>
        </div>
      </div>
    </div>
    <Alert v-if="error" role="alert" type="error">
      {{ error }}

      <template #actions
        ><Button variant="outline" size="sm" @click="reload(true)">重新读取</Button></template
      >
    </Alert>
    <Alert v-if="loading" role="status" type="info">正在读取学生作品…</Alert>
    <label class="detail-exercise-select"
      >查看练习<Select v-model="chosenExercise" aria-label="选择查看学生的练习">
        <SelectOption value="">跟随学生当前练习</SelectOption>
        <SelectOption v-for="e in exercises" :key="e.id" :value="e.id">{{ e.title }}</SelectOption>
      </Select></label
    >
    <div class="detail-workbench">
      <div class="detail-code-panel panel">
        <div class="detail-followbar">
          <div class="inline-items">
            <Radio v-if="!viewing" :size="15" class="positive-text" /><History
              v-else
              :size="15"
              class="amber-text"
            /><strong>{{
              viewing
                ? viewing.kind === 'submission'
                  ? '提交代码快照'
                  : '运行代码快照'
                : '跟随当前代码'
            }}</strong
            ><span class="muted text-xs">{{
              viewing
                ? viewing.id.slice(0, 8) + ' · ' + formatTime(viewing.time)
                : '当前草稿 · 服务器同步'
            }}</span>
          </div>
          <Button v-if="viewing" variant="outline" size="sm" @click="viewing = undefined"
            >返回当前代码<ArrowRight /></Button
          ><span v-else class="readonly-label"><LockKeyhole :size="12" />教师只读</span>
        </div>
        <Alert v-if="viewing" type="info" class="app-alert--banner">
          所选快照固定保留。学生后续修改不会改变此处代码；提交快照不代表已通过运行。
        </Alert>
        <div class="code-toolbar">
          <span class="file-tab"
            ><CodeXml :size="14" />{{ viewing?.filename ?? exercise.filename }}</span
          ><Button
            variant="plain"
            class="icon-button ml-auto"
            aria-label="下载当前查看的代码"
            @click="
              download(
                student.number + '-' + (viewing?.filename ?? exercise.filename),
                viewing?.code ?? currentCode,
              )
            "
          >
            <Download :size="14" /></Button
          ><span class="language-label">{{
            compilerLabel(viewing ? viewing.compilerProfile : executionSettings.compilerProfile)
          }}</span>
        </div>
        <div class="detail-editor">
          <CodeEditor
            :model-value="viewing?.code ?? currentCode"
            :filename="viewing?.filename ?? exercise.filename"
            readonly
          />
        </div>
        <div class="detail-io">
          <section class="detail-input">
            <div class="code-toolbar">输入 <span class="muted">stdin</span></div>
            <pre>{{ (viewing ?? latestRun)?.input }}</pre>
          </section>
          <RunOutput
            v-if="viewing?.kind !== 'submission'"
            :key="viewing?.id ?? 'current'"
            :run="viewing ?? latestRun"
            readonly-context
          />
          <Alert v-else type="info">这是提交时的代码版本，不包含运行结果。</Alert>
        </div>
        <Alert
          v-if="viewing?.kind !== 'submission'"
          type="info"
          :icon="History"
          class="app-alert--banner"
        >
          结果来自{{ viewing ? '所选历史运行' : '最近一次真实运行' }}；{{
            viewing ? '代码与结果对应同一快照。' : '运行结果属于最近一次快照，可能与当前草稿不同。'
          }}
        </Alert>
      </div>
      <aside class="detail-aside">
        <section v-if="currentHelp" class="help-detail-panel">
          <div class="inline-items amber-text">
            <Hand :size="17" /><strong>学生请求帮助</strong
            ><span class="ml-auto text-xs">待处理</span>
          </div>
          <p>
            {{ currentHelp.message }}
          </p>
          <span class="muted text-xs"
            >关联练习：{{ exercise.title }} · {{ formatTime(currentHelp.created_at) }}</span
          ><Button class="w-full" variant="success" :disabled="resolving" @click="resolveHelp"
            ><CircleCheck />{{ resolving ? '处理中…' : '解决此求助' }}</Button
          >
        </section>
        <section class="panel">
          <div class="filter-tabs">
            <Button
              v-for="t in ['运行记录', '提交记录']"
              :key="t"
              variant="plain"
              :class="{ selected: sidebarTab === t }"
              @click="sidebarTab = t"
            >
              {{ t }}
            </Button>
          </div>
          <div v-if="sidebarTab === '运行记录'" class="history-list">
            <Button
              v-for="r in records"
              :key="r.id"
              variant="plain"
              class="history-item"
              :class="{ selected: viewing?.id === r.id }"
              @click="viewing = r"
            >
              <span
                class="history-state-dot"
                :class="
                  r.status === '编译失败' ? 'red' : r.status === '运行完成' ? 'positive' : 'amber'
                "
              /><span
                ><strong>{{ r.status }}</strong
                ><small>{{ formatTime(r.time) }} · {{ r.id.slice(0, 8) }}</small></span
              ><ArrowUpRight :size="14" />
            </Button>
            <p v-if="!records.length && !loading" class="small-empty">这道练习还没有运行记录。</p>
          </div>
          <div v-else class="history-list">
            <Button
              v-for="s in submissions"
              :key="s.id"
              variant="plain"
              class="history-item"
              @click="viewing = s"
            >
              <CircleCheck :size="22" class="positive-text" /><span
                ><strong>固定提交快照</strong
                ><small>{{ new Date(s.time).toLocaleString() }}</small></span
              >
            </Button>
            <div v-if="!submissions.length" class="small-empty">
              <History :size="25" />
              <h3>尚未主动提交</h3>
            </div>
          </div>
          <Pagination
            v-if="sidebarTab === '运行记录'"
            v-model:page="recordPage"
            v-model:page-size="pageSize"
            :total="recordTotal"
            :busy="loading"
            unit="次运行"
          /><Pagination
            v-else
            v-model:page="submissionPage"
            v-model:page-size="pageSize"
            :total="submissionTotal"
            :busy="loading"
            unit="次提交"
          />
        </section>
      </aside>
    </div>
  </div>
  <div v-else class="empty-state">
    <h1>{{ student ? '课堂还没有练习' : '未找到这位学生' }}</h1>
    <p>
      {{ student ? '先创建练习，再查看学生代码。' : '学生可能已移出课堂，或链接对应其他课堂。' }}
    </p>
    <RouterLink :to="student ? '/teacher/exercises/new' : '/teacher/roster'">{{
      student ? '创建练习' : '返回学生名册'
    }}</RouterLink>
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
