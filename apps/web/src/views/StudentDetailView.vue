<script setup lang="ts">
import { computed, ref, watch } from 'vue'
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
  readDraft,
  exampleRuns,
  starterCode,
  notify,
  download,
  type RunRecord,
} from '@/data/demo'
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
const currentCode = computed(() =>
  readDraft(
    exercise.value.id,
    student.value?.status === '编译失败'
      ? starterCode.replace('int sum = 0;', 'int sum = 0; // 已开始修改')
      : exercise.value.code || starterCode,
    student.value?.id,
  ),
)
watch(
  () => route.params.id,
  () => {
    viewing.value = undefined
  },
)
function navigate(step: number) {
  const s = students[index.value + step]
  if (s) router.push((popup.value ? '/teacher/inspect/' : '/teacher/students/') + s.id)
}
function project() {
  router.push({
    path: '/projection/' + student.value?.id,
    query: viewing.value ? { run: viewing.value.id } : {},
  })
}
function resolveHelp() {
  if (student.value) student.value.help = false
  notify('已将此演示求助标记为解决')
}
function closeWindow() {
  if (window.opener) window.close()
  else router.push('/teacher/overview')
}
</script>
<template>
  <div v-if="popup" class="inspect-banner">
    <span><Monitor :size="15" />学生详情 · 独立窗口<span class="demo-tag">本机原型</span></span
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
              viewing ? viewing.id + ' · ' + viewing.time : '当前草稿 · 本机窗口同步'
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
            <pre>{{ (viewing ?? exampleRuns[0])?.input }}</pre>
          </section>
          <RunOutput :key="viewing?.id ?? 'current'" :run="viewing ?? exampleRuns[0]" />
        </div>
        <div class="detail-context-note">
          <History :size="13" />结果来自{{ viewing ? '所选历史运行' : '最近示例运行 RUN-1024' }}；{{
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
            {{
              student.id === 's01'
                ? '老师，这里为什么提示缺少分号？我已经改过一次了。'
                : '老师，可以帮我看看这段代码吗？'
            }}
          </p>
          <span class="muted text-xs">关联 RUN-1024 · 2 分钟前</span
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
            <p class="form-hint">完整保留每次代码、输入与原始结果。此处为预置示例。</p>
            <button
              v-for="r in exampleRuns"
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
            <div v-if="student.submitted" class="submission-mini">
              <CircleCheck :size="22" class="positive-text" /><strong>提交版本 v1</strong>
              <p>今天 14:28 · 累加求和</p>
              <Button size="sm" variant="outline" @click="viewing = exampleRuns[1]"
                >查看提交快照</Button
              >
            </div>
            <div v-else class="small-empty">
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
