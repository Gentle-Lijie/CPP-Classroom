<script setup lang="ts">
import { Select, SelectOption } from '@/components/ui/select'
import { ref, watch } from 'vue'
import { History, Download, CodeXml, RefreshCw } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import CodeEditor from '@/components/classroom/CodeEditor.vue'
import RunOutput from '@/components/classroom/RunOutput.vue'
import Pagination from '@/components/classroom/Pagination.vue'
import { download, tone, demo, exercises, classPath, type RunRecord } from '@/data/demo'
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
      <p>查看当次代码、输入与诊断，不会重新执行程序。</p>
    </div>
    <div class="heading-actions">
      <Button variant="outline" :disabled="loading" @click="load"><RefreshCw />刷新</Button
      ><Button
        :disabled="!run"
        variant="outline"
        @click="run && download(run.id + '-' + run.filename, run.code)"
        ><Download />下载当前快照</Button
      >
    </div>
  </div>
  <div class="history-filter">
    <label
      >练习<Select v-model="filter" aria-label="按练习筛选历史">
        <SelectOption value="">全部练习</SelectOption>
        <SelectOption v-for="e in exercises" :key="e.id" :value="e.id">{{ e.title }}</SelectOption>
      </Select></label
    ><label
      >状态<Select v-model="status" aria-label="按状态筛选历史">
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
          :key="s"
        >
          {{ s }}
        </SelectOption>
      </Select></label
    ><span>{{ total }} 条运行记录</span>
  </div>
  <div v-if="error" class="error-box" role="alert">
    {{ error }} <Button variant="outline" size="sm" @click="load">重试</Button>
  </div>
  <div v-if="loading && !records.length" class="panel empty-state" role="status">
    正在读取运行历史…
  </div>
  <div v-else-if="!records.length && !error" class="panel empty-state">
    <History :size="32" />
    <h2>还没有运行记录</h2>
    <p>
      {{
        filter
          ? '这道练习尚未运行，可以切换其他练习。'
          : '进入课堂编写并运行程序后，代码与结果会保存在这里。'
      }}
    </p>
    <RouterLink to="/student/classes" class="text-button">前往我的课堂 →</RouterLink>
  </div>
  <div v-else-if="records.length" class="history-page-layout" :aria-busy="loading">
    <section class="panel">
      <div class="panel-heading">
        <h2>运行记录</h2>
        <History :size="17" class="muted" />
      </div>
      <div class="history-list">
        <Button
          v-for="r in records"
          :key="r.id"
          variant="plain"
          class="history-item"
          :class="{ selected: run?.id === r.id }"
          @click="run = r"
        >
          <span
            ><strong
              ><span class="status" :class="tone(r.status)">{{ r.status }}</span></strong
            ><small>{{ formatTime(r.time) }} · {{ r.id.slice(0, 8) }}</small></span
          >
        </Button>
      </div>
      <Pagination
        v-model:page="page"
        v-model:page-size="pageSize"
        :total="total"
        :busy="loading"
        unit="条记录"
      />
    </section>
    <section v-if="run" class="panel">
      <div class="panel-heading">
        <div class="inline-items">
          <h2>运行 {{ run.id.slice(0, 8) }}</h2>
          <span class="status" :class="tone(run.status)">{{ run.status }}</span>
        </div>
        <span class="muted text-xs">只读代码快照</span>
      </div>
      <div class="code-toolbar">
        <CodeXml :size="14" />{{ run.filename
        }}<span class="language-label ml-auto">{{ compilerLabel(run.compilerProfile) }}</span>
      </div>
      <div class="history-editor">
        <CodeEditor :model-value="run.code" :filename="run.filename" readonly />
      </div>
      <div class="detail-io">
        <section class="detail-input">
          <div class="code-toolbar">当次输入</div>
          <pre>{{ run.input || '（无预填输入）' }}</pre>
        </section>
        <RunOutput :key="run.id" :run="run" readonly-context />
      </div>
    </section>
  </div>
</template>
<style scoped>
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
.history-page-layout > section {
  min-width: 0;
  align-self: start;
}
.history-page-layout .panel-heading .inline-items {
  flex-wrap: wrap;
}
.history-list {
  max-height: 560px;
  overflow: auto;
}
.detail-input pre {
  max-height: 220px;
  overflow: auto;
}
</style>
