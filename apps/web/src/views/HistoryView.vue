<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { History, Download, CodeXml, ArrowUpRight } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import CodeEditor from '@/components/classroom/CodeEditor.vue'
import RunOutput from '@/components/classroom/RunOutput.vue'
import { loadRuns, download, tone, reportError, type RunRecord } from '@/data/demo'
const records = ref<RunRecord[]>([])
const run = ref<RunRecord>()
onMounted(async () => {
  try {
    records.value = await loadRuns()
    run.value = records.value[0]
  } catch (e) {
    reportError(e)
  }
})
</script>
<template>
  <div class="page-heading">
    <div>
      <div class="heading-meta">我的编程记录</div>
      <h1>运行历史</h1>
      <p>历史代码与当次输入、诊断一同保留，查看不需要重新执行。</p>
    </div>
    <Button
      :disabled="!run"
      variant="outline"
      @click="download(run!.id + '-' + run!.filename, run!.code)"
      ><Download />下载当前快照</Button
    >
  </div>
  <div v-if="run" class="history-page-layout">
    <section class="panel">
      <div class="panel-heading">
        <h2>运行历史</h2>
        <History :size="17" class="muted" />
      </div>
      <div class="history-list">
        <span class="topic-label">全部真实运行</span
        ><button
          v-for="r in records"
          :key="r.id"
          class="history-item"
          :class="{ selected: run.id === r.id }"
          @click="run = r"
        >
          <span
            ><strong>{{ r.status }}</strong
            ><small>{{ r.time }} · {{ r.id }}</small></span
          ><ArrowUpRight :size="14" />
        </button>
      </div>
      <p class="history-disclaimer">所有记录来自服务器保存的运行快照。</p>
    </section>
    <section class="panel">
      <div class="panel-heading">
        <div class="inline-items">
          <h2>{{ run.id }}</h2>
          <span class="status" :class="tone(run.status)">{{ run.status }}</span>
        </div>
        <span class="muted text-xs">只读代码快照</span>
      </div>
      <div class="code-toolbar">
        <CodeXml :size="14" />{{ run.filename }}
        <span class="language-label ml-auto">GCC 13.3 · C++17</span>
      </div>
      <div class="history-editor">
        <CodeEditor
          :model-value="run.code"
          :filename="run.filename"
          readonly
          :error-line="run.status === '编译失败' ? 10 : undefined"
        />
      </div>
      <div class="detail-io">
        <section class="detail-input">
          <div class="code-toolbar">当次输入</div>
          <pre>{{ run.input }}</pre>
        </section>
        <RunOutput :key="run.id" :run="run" />
      </div>
    </section>
  </div>
</template>
