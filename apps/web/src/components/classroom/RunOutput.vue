<script setup lang="ts">
import CodeBlock from './CodeBlock.vue'
import PythonBeta from './PythonBeta.vue'
import { sourceLanguage } from '@/lib/source-language'
import type { SourceLanguage } from '@classroom/contracts'
import { Form } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Copy, Trash2, CircleAlert, Terminal, FileText, RotateCcw } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { notify, type RunRecord, tone } from '@/data/demo'
import { formatTime } from '@/lib/display'

const { t } = useI18n()
import { statusLabel } from '@/lib/status-labels'

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
  props.run?.status === 'compile_error'
    ? 'diagnostic'
    : python.value && props.run?.stderr && !['queued', 'running'].includes(props.run.status)
      ? 'stderr'
      : 'output'
const tab = ref<'output' | 'diagnostic' | 'stderr'>(initialTab()),
  line = ref(''),
  cleared = ref(false),
  busy = ref(false)
const busyReason = ref('')
const value = computed(() =>
  !props.run
    ? ''
    : tab.value === 'diagnostic'
      ? props.run.log
      : tab.value === 'stderr'
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
      status === 'compile_error' ||
      (python.value && props.run?.stderr && !['queued', 'running'].includes(status ?? ''))
    ) {
      tab.value = initialTab()
      cleared.value = false
    }
  },
)
function select(value: 'output' | 'diagnostic' | 'stderr') {
  tab.value = value
  cleared.value = false
}

async function copy() {
  try {
    await navigator.clipboard.writeText(cleared.value ? '' : (value.value ?? ''))
    notify(t('runner.output.copied'))
  } catch {
    notify(t('runner.output.copyFailed'), 'error')
  }
}
async function send() {
  if (busy.value || !props.sendInput) return
  busyReason.value = t('runner.output.sendingInput')
  busy.value = true
  try {
    if (await props.sendInput(line.value)) line.value = ''
  } finally {
    busy.value = false
  }
}
async function eof() {
  if (busy.value || !props.closeInput) return
  busyReason.value = t('runner.output.closingInput')
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
      <div class="output-tabs" role="tablist" :aria-label="t('runner.output.tabsAria')">
        <Button
          variant="plain"
          role="tab"
          :aria-selected="tab === 'output'"
          :class="{ selected: tab === 'output' }"
          data-guide="output-tab"
          @click="select('output')">
          <Terminal :size="14" />
          {{ t('runner.output.tab.output') }}
        </Button>
        <Button
          v-if="!python"
          variant="plain"
          role="tab"
          :aria-selected="tab === 'diagnostic'"
          :class="{ selected: tab === 'diagnostic' }"
          data-guide="diagnostic-tab"
          @click="select('diagnostic')">
          <CircleAlert :size="14" />
          {{ t('runner.output.tab.diagnostic') }}
          <span v-if="run?.status === 'compile_error'" class="error-count">
            {{ t('runner.output.failedBadge') }}
          </span>
        </Button>
        <Button
          v-if="run?.stderr"
          variant="plain"
          role="tab"
          :aria-selected="tab === 'stderr'"
          :class="{ selected: tab === 'stderr' }"
          data-guide="stderr-tab"
          @click="select('stderr')">
          {{ t('runner.output.tab.stderr') }}
        </Button>
      </div>
      <div class="inline-items output-actions">
        <Button
          variant="plain"
          class="icon-button"
          :aria-label="t('runner.output.copyAria')"
          :disabled="!run || cleared"
          :data-disabled-reason="
            !run ? t('runner.output.noRunReason') : t('runner.output.clearedReason')
          "
          @click="copy">
          <Copy :size="14" />
        </Button>
        <Button
          variant="plain"
          class="icon-button"
          :aria-label="cleared ? t('runner.output.restoreAria') : t('runner.output.clearAria')"
          :disabled="!run"
          :data-disabled-reason="t('runner.output.noRunReason')"
          data-guide="clear-output"
          @click="cleared = !cleared">
          <RotateCcw v-if="cleared" :size="14" />
          <Trash2 v-else :size="14" />
        </Button>
      </div>
    </div>
    <div v-if="run" class="output-body">
      <div class="output-meta">
        <span class="status" :class="tone(run.status)">{{ statusLabel(run.status) }}</span>
        <span v-if="python" class="inline-items">
          Python
          <PythonBeta />
        </span>
        <span v-if="run.id" :title="run.id">
          {{ run.id.slice(0, 8) }} · {{ t('runner.output.snapshot') }}
        </span>
        <span>{{ formatTime(run.time) }}</span>
      </div>
      <CodeBlock
        v-if="!cleared"
        :source="value ?? ''"
        :toolbar="false"
        :class="{ 'diagnostic-text': tab === 'diagnostic' && run.status === 'compile_error' }"
        :empty-text="
          tab === 'diagnostic'
            ? t('runner.output.emptyDiagnostic')
            : run.status === 'compile_error'
              ? t('runner.output.compileFailedNoRun')
              : t('runner.output.noOutput')
        " />
      <p v-else class="muted">{{ t('runner.output.hidden') }}</p>
      <div class="output-exit">
        <span>
          {{ tab === 'diagnostic' ? 'compiler' : tab === 'stderr' ? 'stderr' : 'stdout' }}
        </span>
        <span v-if="run.exit">{{ t('runner.output.exitLabel') }}{{ run.exit }}</span>
      </div>
    </div>
    <div v-else class="output-placeholder">
      <FileText :size="24" />
      <p>{{ t('runner.output.noResults') }}</p>
      <small>
        {{ readonlyContext ? t('runner.output.readonlyHint') : t('runner.output.runHint') }}
      </small>
    </div>
    <p v-if="run?.eof && run.status === 'running'" class="stdin-closed">
      {{ t('runner.output.stdinClosed') }}
    </p>
    <Form v-if="interactive && !run?.eof" class="runtime-input" @submit.prevent="send">
      <Input
        v-model="line"
        :aria-label="t('runner.output.inputAria')"
        :placeholder="t('runner.output.inputPlaceholder')"
        :disabled="busy"
        :data-disabled-reason="busyReason"
        maxlength="4095" />
      <Button
        data-guide="send-input"
        type="submit"
        size="sm"
        :disabled="busy"
        :data-disabled-reason="busyReason">
        {{ busy ? t('runner.output.sending') : t('runner.output.send') }}
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        :disabled="busy"
        :data-disabled-reason="busyReason"
        :title="t('runner.output.eofTitle')"
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
