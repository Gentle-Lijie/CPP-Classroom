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
const owner = computed(() =>
  currentUser.value?.name && currentUser.value.name !== currentUser.value.username
    ? `${currentUser.value.name} · ${currentUser.value.username}`
    : (currentUser.value?.username ?? '当前用户'),
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
    if (current === generation) error.value = e instanceof Error ? e.message : '历史记录加载失败'
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
      <div class="heading-meta">我的编程记录</div>
      <h1>运行历史</h1>
    </div>
    <div class="heading-actions">
      <Button
        variant="outline"
        :disabled="loading"
        data-disabled-reason="正在读取运行记录，请稍候"
        data-guide="history-refresh"
        @click="load">
        <RefreshCw />
        刷新
      </Button>
      <Button
        data-guide="history-download"
        :disabled="!run"
        data-disabled-reason="暂无可下载的运行快照，请先选择一条运行记录"
        variant="outline"
        @click="run && download(run.id + '-' + run.filename, run.code)">
        <Download />
        下载当前快照
      </Button>
    </div>
  </div>
  <div class="history-filter">
    <label>
      练习
      <Select v-model="filter" aria-label="按练习筛选历史">
        <SelectOption value="">全部练习</SelectOption>
        <SelectOption v-for="e in exercises" :key="e.id" :value="e.id">{{ e.title }}</SelectOption>
      </Select>
    </label>
    <label>
      状态
      <Select v-model="status" aria-label="按状态筛选历史">
        <SelectOption value="">全部状态</SelectOption>
        <SelectOption
          v-for="s in [
            '运行完成',
            '编译失败',
            '运行失败',
            '资源超限',
            '超时',
            '已停止',
            '平台执行失败',
          ]"
          :key="s">
          {{ s }}
        </SelectOption>
      </Select>
    </label>
    <span>{{ total }} 条运行记录</span>
  </div>
  <Alert v-if="error" role="alert" type="error">
    {{ error }}

    <template #actions><Button variant="outline" size="sm" @click="load">重试</Button></template>
  </Alert>
  <ContentPanel v-if="loading && !records.length" content-class="empty-state" role="status">
    正在读取运行历史…
  </ContentPanel>
  <ContentPanel v-else-if="!records.length && !error" content-class="empty-state">
    <History :size="32" />
    <h2>{{ filtered ? '没有符合筛选条件的运行记录' : '还没有运行记录' }}</h2>
    <p>
      {{
        filtered
          ? '可以清除筛选，或选择其他练习和运行状态。'
          : '进入课堂编写并运行程序后，代码与结果会保存在这里。'
      }}
    </p>
    <div v-if="filtered">
      <Button variant="outline" @click="clearFilters">清除筛选</Button>
    </div>
    <RouterLink v-else data-guide="history-empty-back" to="/student/classes" class="text-button">
      前往我的课堂 →
    </RouterLink>
  </ContentPanel>
  <div v-else-if="records.length" class="history-page-layout fill-stack" :aria-busy="loading">
    <ContentPanel as="section" direct class="panel-fill">
      <div class="panel-heading">
        <h2>运行记录</h2>
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
              <span class="status" :class="tone(r.status)">{{ r.status }}</span>
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
        unit="条记录" />
    </ContentPanel>
    <ContentPanel v-if="run" as="section" direct class="panel-fill">
      <div class="panel-heading">
        <div class="history-detail-heading">
          <div class="inline-items">
            <h2>{{ exerciseTitle(run) }}</h2>
            <span class="status" :class="tone(run.status)">{{ run.status }}</span>
          </div>
          <p class="muted text-sm">{{ owner }} · {{ run.id.slice(0, 8) }}</p>
        </div>
        <span class="muted text-xs">只读代码快照</span>
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
            <CodeBlock :source="run.input" label="当次输入" empty-text="无预填输入" />
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
