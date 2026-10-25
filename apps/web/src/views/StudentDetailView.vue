<script setup lang="ts">
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
import {
  students,
  exercises,
  demo,
  loadRuns,
  classPath,
  reportError,
  notify,
  download,
  type RunRecord,
} from '@/data/demo'
import { api } from '@/lib/api'
const route = useRoute()
const router = useRouter()
const viewing = ref<RunRecord>()
const sidebarTab = ref('运行记录')
const student = computed(() => students.find((s) => s.id === route.params.id))
const popup = computed(() => route.path.startsWith('/teacher/inspect/'))
const exercise = computed(
  () =>
    exercises.find((e) => e.id === (student.value?.exerciseId ?? demo.recommended)) ??
    exercises[0]!,
)
const index = computed(() => students.findIndex((s) => s.id === student.value?.id))
const currentCode = ref('')
const records = ref<RunRecord[]>([])
const helpMessage = ref('')
const submissions = ref<RunRecord[]>([])
let loading = false
async function reload() {
  if (!student.value || !exercise.value || loading) return
  loading = true
  try {
    const id = student.value.id
    const eid = exercise.value.id
    const [draft, runs, helps, submitted] = await Promise.all([
      api<{ code: string }>(classPath('/workspace/' + eid + '?student=' + id)),
      loadRuns(id, eid),
      api<{ user_id: string; message: string; resolved: boolean }[]>(classPath('/help')),
      api<
        {
          id: string
          user_id: string
          exercise_id: string
          filename: string
          code: string
          created_at: string
        }[]
      >(classPath('/submissions')),
    ])
    currentCode.value = draft.code
    records.value = runs
    submissions.value = submitted
      .filter((s) => s.user_id === id && s.exercise_id === eid)
      .map((s) => ({
        id: s.id,
        code: s.code,
        filename: s.filename,
        status: '已提交',
        time: s.created_at,
        input: '',
        output: '',
        log: '提交保存代码快照，不代表运行成功。',
        exit: '提交快照',
      }))
    helpMessage.value = helps
      .filter((h) => h.user_id === id && !h.resolved)
      .map((h) => h.message)
      .join('\n')
  } catch (e) {
    reportError(e)
  } finally {
    loading = false
  }
}
watch(
  () => route.params.id,
  () => {
    viewing.value = undefined
    void reload()
  },
  { immediate: true },
)
const poll = setInterval(() => void reload(), 1000)
onBeforeUnmount(() => clearInterval(poll))
function navigate(step: number) {
  const s = students[index.value + step]
  if (s) router.push((popup.value ? '/teacher/inspect/' : '/teacher/students/') + s.id)
}
async function project() {
  try {
    const result = await api<{ id: string }>(classPath('/projections'), 'POST', {
      student: student.value?.id,
      exerciseId: exercise.value.id,
      ...(viewing.value ? { runId: viewing.value.id } : {}),
    })
    await router.push({ path: '/projection/' + result.id, query: { class: demo.classroomId } })
  } catch (e) {
    reportError(e)
  }
}
async function resolveHelp() {
  try {
    await api(classPath('/help/' + student.value?.id + '/resolve'), 'POST', {})
    notify('求助已解决')
    await reload()
  } catch (e) {
    reportError(e)
  }
}
function closeWindow() {
  if (window.opener) window.close()
  else router.push('/teacher/overview')
}
</script>
<template>
  <div v-if="popup" class="inspect-banner">
    <span><Monitor :size="15" />学生详情 · 独立窗口<span class="demo-tag">实时数据</span></span
    ><Button variant="outline" size="sm" @click="closeWindow">关闭此窗口</Button>
  </div>
  <div v-if="student" class="detail-page" :class="{ 'inspect-detail': popup }">
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
        <Button variant="outline" @click="project"><Monitor />投屏讲解</Button>
        <div class="student-pager">
          <button
            class="icon-button"
            :disabled="index === 0"
            aria-label="上一位学生"
            @click="navigate(-1)"
          >
            <ChevronLeft :size="18" /></button
          ><span>{{ index + 1 }} / {{ students.length }}</span
          ><button
            class="icon-button"
            :disabled="index === students.length - 1"
            aria-label="下一位学生"
            @click="navigate(1)"
          >
            <ChevronRight :size="18" />
          </button>
        </div>
      </div>
    </div>
    <div class="detail-workbench">
      <div class="detail-code-panel panel">
        <div class="detail-followbar">
          <div class="inline-items">
            <Radio v-if="!viewing" :size="15" class="positive-text" /><History
              v-else
              :size="15"
              class="amber-text"
            /><strong>{{ viewing ? '运行代码快照' : '跟随当前代码' }}</strong
            ><span class="muted text-xs">{{
              viewing ? viewing.id + ' · ' + viewing.time : '当前草稿 · 服务器同步'
            }}</span>
          </div>
          <Button v-if="viewing" variant="outline" size="sm" @click="viewing = undefined"
            >返回当前代码<ArrowRight /></Button
          ><span v-else class="readonly-label"><LockKeyhole :size="12" />教师只读</span>
        </div>
        <div v-if="viewing" class="snapshot-note">
          运行快照固定保留。学生后续修改不会改变此处的代码与原始诊断。
        </div>
        <div class="code-toolbar">
          <span class="file-tab"
            ><CodeXml :size="14" />{{ viewing?.filename ?? exercise.filename }}</span
          ><button
            class="icon-button ml-auto"
            aria-label="下载当前查看的代码"
            @click="
              download(
                student.number + '-' + (viewing?.filename ?? exercise.filename),
                viewing?.code ?? currentCode,
              )
            "
          >
            <Download :size="14" /></button
          ><span class="language-label">C++17</span>
        </div>
        <div class="detail-editor">
          <CodeEditor
            :model-value="viewing?.code ?? currentCode"
            :filename="viewing?.filename ?? exercise.filename"
            readonly
            :error-line="viewing?.status === '编译失败' ? 10 : undefined"
          />
        </div>
        <div class="detail-io">
          <section class="detail-input">
            <div class="code-toolbar">输入 <span class="muted">stdin</span></div>
            <pre>{{ (viewing ?? records[0])?.input }}</pre>
          </section>
          <RunOutput :key="viewing?.id ?? 'current'" :run="viewing ?? records[0]" />
        </div>
        <div class="detail-context-note">
          <History :size="13" />结果来自{{ viewing ? '所选历史运行' : '最近一次真实运行' }}；{{
            viewing
              ? '代码与结果对应同一快照。'
              : '当前草稿已发生修改，点击运行记录查看当时的代码。'
          }}
        </div>
      </div>
      <aside class="detail-aside">
        <section v-if="student.help" class="help-detail-panel">
          <div class="inline-items amber-text">
            <Hand :size="17" /><strong>学生请求帮助</strong
            ><span class="ml-auto text-xs">待处理</span>
          </div>
          <p>
            {{ helpMessage || '学生请求教师协助' }}
          </p>
          <span class="muted text-xs">关联当前练习</span
          ><Button class="w-full" variant="outline" @click="resolveHelp"
            ><CircleCheck />标记已解决</Button
          >
        </section>
        <section class="panel">
          <div class="filter-tabs">
            <button
              v-for="t in ['运行记录', '提交记录']"
              :key="t"
              :class="{ selected: sidebarTab === t }"
              @click="sidebarTab = t"
            >
              {{ t }}
            </button>
          </div>
          <div v-if="sidebarTab === '运行记录'" class="history-list">
            <p class="form-hint">完整保留每次代码、输入与原始结果。</p>
            <button
              v-for="r in records"
              :key="r.id"
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
                ><small>{{ r.time }} · {{ r.id }}</small></span
              ><ArrowUpRight :size="14" />
            </button>
          </div>
          <div v-else class="history-list">
            <button v-for="s in submissions" :key="s.id" class="history-item" @click="viewing = s">
              <CircleCheck :size="22" class="positive-text" /><span
                ><strong>固定提交快照</strong
                ><small>{{ new Date(s.time).toLocaleString() }}</small></span
              >
            </button>
            <div v-if="!submissions.length" class="small-empty">
              <History :size="25" />
              <h3>尚未主动提交</h3>
              <p>巡视不依赖学生提交。</p>
            </div>
          </div>
        </section>
        <div class="detail-readonly-note">
          <LockKeyhole :size="16" />
          <p>首版教师巡视为只读。查看与投屏均不会修改学生代码或触发重新运行。</p>
        </div>
      </aside>
    </div>
  </div>
  <div v-else class="empty-state">
    <h1>名册为空</h1>
    <RouterLink to="/teacher/roster">添加学生</RouterLink>
  </div>
</template>
