<script setup lang="ts">
import { ref } from 'vue'
import { Copy, Trash2, CircleAlert, Terminal, FileText } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { notify, type RunRecord, tone } from '@/data/demo'
const props = defineProps<{ run?: RunRecord; interactive?: boolean }>()
defineEmits<{ send: [text: string]; eof: [] }>()
const tab = ref('运行输出')
const line = ref('')
const cleared = ref(false)
async function copy() {
  try {
    await navigator.clipboard.writeText(
      props.run
        ? tab.value === '编译诊断'
          ? props.run.log
          : tab.value === '标准错误'
            ? (props.run.stderr ?? '')
            : props.run.output
        : '',
    )
    notify('已复制当前内容')
  } catch {
    notify('当前浏览器无法访问剪贴板')
  }
}
</script>
<template>
  <section class="run-output">
    <div class="code-toolbar">
      <div class="output-tabs">
        <button
          :class="{ selected: tab === '运行输出' }"
          @click="
            () => {
              tab = '运行输出'
              cleared = false
            }
          "
        >
          <Terminal :size="14" />运行输出</button
        ><button
          :class="{ selected: tab === '编译诊断' }"
          @click="
            () => {
              tab = '编译诊断'
              cleared = false
            }
          "
        >
          <CircleAlert :size="14" />编译诊断<span
            v-if="run?.status === '编译失败'"
            class="error-count"
            >1</span
          >
        </button>
        <button
          v-if="run?.stderr"
          :class="{ selected: tab === '标准错误' }"
          @click="tab = '标准错误'"
        >
          标准错误
        </button>
      </div>
      <div class="inline-items ml-auto">
        <button class="icon-button" aria-label="复制输出" @click="copy"><Copy :size="14" /></button
        ><button class="icon-button" aria-label="清空可见输出" @click="cleared = true">
          <Trash2 :size="14" />
        </button>
      </div>
    </div>
    <div v-if="run" class="output-body">
      <div class="output-meta">
        <span class="status" :class="tone(run.status)">{{ run.status }}</span
        ><span>{{ run.id }} · 固定快照</span><span class="ml-auto">{{ run.time }}</span>
      </div>
      <pre
        v-if="!cleared"
        :class="{ 'diagnostic-text': tab === '编译诊断' && run.status === '编译失败' }"
        >{{
          tab === '编译诊断'
            ? run.log
            : tab === '标准错误'
              ? run.stderr
              : run.output ||
                (run.status === '编译失败'
                  ? '编译失败，程序未执行。请查看编译诊断。'
                  : '暂无标准输出。')
        }}</pre>
      <p v-else class="muted text-xs">已清空可见输出，原始运行记录保留。</p>
      <div class="output-exit">
        <span>{{ tab === '编译诊断' ? 'compiler' : tab === '标准错误' ? 'stderr' : 'stdout' }}</span
        ><span>退出码 / 原因：{{ run.exit }}</span>
      </div>
    </div>
    <div v-else class="output-placeholder">
      <FileText :size="22" />
      <p>运行结果会显示在这里</p>
      <small>保存代码后点击“编译运行”，查看真实结果。</small>
    </div>
    <form
      v-if="interactive"
      class="runtime-input"
      @submit.prevent="
        () => {
          $emit('send', line)
          line = ''
        }
      "
    >
      <input v-model="line" aria-label="运行时输入" placeholder="输入一行文本…" /><Button
        type="submit"
        size="sm"
        >发送输入</Button
      ><Button type="button" variant="outline" size="sm" @click="$emit('eof')">EOF</Button>
    </form>
  </section>
</template>
