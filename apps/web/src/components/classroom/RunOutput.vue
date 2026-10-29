<script setup lang="ts">
import CodeBlock from './CodeBlock.vue'
import PythonBeta from './PythonBeta.vue'
import { sourceLanguage } from '@/lib/source-language'
import type { SourceLanguage } from '@classroom/contracts'
import { Form } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { computed, ref, watch } from 'vue'
import { Copy, Trash2, CircleAlert, Terminal, FileText, RotateCcw } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { notify, type RunRecord, tone } from '@/data/demo'
import { formatTime } from '@/lib/display'
const props = defineProps<{
  language?: SourceLanguage
  run?: RunRecord
  interactive?: boolean
  readonlyContext?: boolean
  sendInput?: (text: string) => Promise<boolean>
  closeInput?: () => Promise<boolean>
}>()
const python = computed(() =>
  props.run ? sourceLanguage(props.run) === 'python' : props.language === 'python',
)
const initialTab = () =>
  props.run?.status === '编译失败'
    ? '编译诊断'
    : python.value && props.run?.stderr && !['排队', '运行中／可输入'].includes(props.run.status)
      ? '标准错误'
      : '运行输出'
const tab = ref(initialTab()),
  line = ref(''),
  cleared = ref(false),
  busy = ref(false)
const busyReason = ref('')
const value = computed(() =>
  !props.run
    ? ''
    : tab.value === '编译诊断'
      ? props.run.log
      : tab.value === '标准错误'
        ? (props.run.stderr ?? '')
        : props.run.output,
)
watch(
  () => props.run?.id,
  () => {
    cleared.value = false
    tab.value = initialTab()
    line.value = ''
  },
)
watch(
  () => props.run?.status,
  (status) => {
    if (
      status === '编译失败' ||
      (python.value && props.run?.stderr && !['排队', '运行中／可输入'].includes(status ?? ''))
    ) {
      tab.value = initialTab()
      cleared.value = false
    }
  },
)
function select(value: string) {
  tab.value = value
  cleared.value = false
}

async function copy() {
  try {
    await navigator.clipboard.writeText(cleared.value ? '' : (value.value ?? ''))
    notify('已复制可见内容')
  } catch {
    notify('无法访问剪贴板，请选中文本复制', 'error')
  }
}
async function send() {
  if (busy.value || !props.sendInput) return
  busyReason.value = '正在发送输入，请稍候'
  busy.value = true
  try {
    if (await props.sendInput(line.value)) line.value = ''
  } finally {
    busy.value = false
  }
}
async function eof() {
  if (busy.value || !props.closeInput) return
  busyReason.value = '正在关闭标准输入，请稍候'
  busy.value = true
  try {
    await props.closeInput()
  } finally {
    busy.value = false
  }
}
</script>
<template>
  <section class="run-output">
    <div class="code-toolbar output-toolbar">
      <div class="output-tabs" role="tablist" aria-label="运行结果">
        <Button
          variant="plain"
          role="tab"
          :aria-selected="tab === '运行输出'"
          :class="{ selected: tab === '运行输出' }"
          data-guide="output-tab"
          @click="select('运行输出')">
          <Terminal :size="14" />
          运行输出
        </Button>
        <Button
          v-if="!python"
          variant="plain"
          role="tab"
          :aria-selected="tab === '编译诊断'"
          :class="{ selected: tab === '编译诊断' }"
          data-guide="diagnostic-tab"
          @click="select('编译诊断')">
          <CircleAlert :size="14" />
          编译诊断
          <span v-if="run?.status === '编译失败'" class="error-count">失败</span>
        </Button>
        <Button
          v-if="run?.stderr"
          variant="plain"
          role="tab"
          :aria-selected="tab === '标准错误'"
          :class="{ selected: tab === '标准错误' }"
          data-guide="stderr-tab"
          @click="select('标准错误')">
          标准错误
        </Button>
      </div>
      <div class="inline-items output-actions">
        <Button
          variant="plain"
          class="icon-button"
          aria-label="复制可见输出"
          :disabled="!run || cleared"
          :data-disabled-reason="!run ? '尚无运行记录' : '输出已清空，请先恢复显示输出'"
          @click="copy">
          <Copy :size="14" />
        </Button>
        <Button
          variant="plain"
          class="icon-button"
          :aria-label="cleared ? '恢复显示输出' : '清空可见输出（保留记录）'"
          :disabled="!run"
          data-disabled-reason="尚无运行记录"
          data-guide="clear-output"
          @click="cleared = !cleared">
          <RotateCcw v-if="cleared" :size="14" />
          <Trash2 v-else :size="14" />
        </Button>
      </div>
    </div>
    <div v-if="run" class="output-body">
      <div class="output-meta">
        <span class="status" :class="tone(run.status)">{{ run.status }}</span>
        <span v-if="python" class="inline-items">
          Python
          <PythonBeta />
        </span>
        <span v-if="run.id" :title="run.id">{{ run.id.slice(0, 8) }} · 快照</span>
        <span>{{ formatTime(run.time) }}</span>
      </div>
      <CodeBlock
        v-if="!cleared"
        :source="value ?? ''"
        :toolbar="false"
        :class="{ 'diagnostic-text': tab === '编译诊断' && run.status === '编译失败' }"
        :empty-text="
          tab === '编译诊断'
            ? '没有编译诊断。'
            : run.status === '编译失败'
              ? '编译失败，程序未执行。请查看编译诊断。'
              : '暂无标准输出。'
        " />
      <p v-else class="muted">已隐藏输出，点击恢复按钮可重新显示，原始记录保留。</p>
      <div class="output-exit">
        <span>
          {{ tab === '编译诊断' ? 'compiler' : tab === '标准错误' ? 'stderr' : 'stdout' }}
        </span>
        <span v-if="run.exit">退出码 / 原因：{{ run.exit }}</span>
      </div>
    </div>
    <div v-else class="output-placeholder">
      <FileText :size="24" />
      <p>暂无运行结果</p>
      <small>
        {{
          readonlyContext
            ? '该学生尚未留下运行记录。当前代码仅供只读查看。'
            : '点击“运行”，结果将与当次代码一同保存。'
        }}
      </small>
    </div>
    <p v-if="run?.eof && run.status === '运行中／可输入'" class="stdin-closed">
      stdin 已关闭 · 等待程序结束，可随时停止运行。
    </p>
    <Form v-if="interactive && !run?.eof" class="runtime-input" @submit.prevent="send">
      <Input
        v-model="line"
        aria-label="运行时输入"
        placeholder="输入一行文本…"
        :disabled="busy"
        :data-disabled-reason="busyReason"
        maxlength="4095" />
      <Button
        data-guide="send-input"
        type="submit"
        size="sm"
        :disabled="busy"
        :data-disabled-reason="busyReason">
        {{ busy ? '发送中…' : '发送' }}
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        :disabled="busy"
        :data-disabled-reason="busyReason"
        title="关闭标准输入，之后不能继续发送文本"
        data-guide="send-eof"
        @click="eof">
        EOF
      </Button>
    </Form>
  </section>
</template>
<style scoped>
.run-output {
  min-width: 0;
  min-height: 0;
}
.output-toolbar {
  flex-wrap: wrap;
  height: auto;
  min-height: 42px;
  gap: 6px;
}
.output-tabs {
  flex: 1;
  min-width: 0;
  overflow-x: auto;
  gap: 14px;
  height: 40px;
}
.output-tabs button {
  font-size: 14px;
  white-space: nowrap;
  flex-shrink: 0;
}
.output-tabs button.selected {
  color: var(--ui-action);
  border-bottom-color: var(--ui-action);
}
.output-actions {
  margin-left: auto;
  flex-shrink: 0;
  gap: 2px;
}
.error-count {
  color: var(--ui-error);
  background: var(--ui-error-bg);
  font-size: 13px;
}
.output-meta {
  flex-wrap: wrap;
  font-size: 14px;
  line-height: 1.6;
  gap: 8px;
}
.output-body {
  min-width: 0;
}
.output-body pre {
  font-size: 15px;
  line-height: 1.8;
}
.output-body pre.diagnostic-text {
  color: var(--ui-error);
  font-size: 14px;
}
.output-exit {
  font-size: 14px;
  gap: 12px;
  flex-wrap: wrap;
  overflow-wrap: anywhere;
}
.output-placeholder p {
  font-size: 16px;
}
.output-placeholder small {
  font-size: 14px;
  line-height: 1.7;
}
.runtime-input {
  flex-wrap: wrap;
  flex-shrink: 0;
}
.runtime-input input {
  min-width: 80px;
  flex: 1;
  width: 0;
  font-size: 15px;
}
.runtime-input [data-slot='button'] {
  font-size: 14px;
}
.stdin-closed {
  font-size: 14px;
  padding: 8px 12px;
  line-height: 1.6;
  border-top: 1px solid var(--ui-line);
}
.stdin-closed {
  color: var(--ui-secondary);
  background: var(--ui-surface);
}
</style>
