<script setup lang="ts">
import CodeBlock from '@/components/classroom/CodeBlock.vue'
import { computed, ref } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { exerciseImportLimits } from '@classroom/contracts'
import { Button } from '@/components/ui/button'
import { FileUpload } from '@/components/ui/file-upload'
import { Checkbox } from '@/components/ui/checkbox'
import { Alert } from '@/components/ui/alert'
import Modal from './Modal.vue'
import MarkdownContent from './MarkdownContent.vue'
import { api } from '@/lib/api'
import { classPath, exercises, notify } from '@/data/demo'
import { exerciseFields } from '@/lib/exercise-markdown'
import {
  readExerciseImport,
  exerciseImportConflicts,
  exerciseImportBodySize,
  type ExerciseImportEntry,
} from '@/lib/exercise-import'
import { Upload } from '@lucide/vue'

const emit = defineEmits<{ imported: [ids: string[]] }>()
const open = ref(false)
const reading = ref(false)
const saving = ref(false)
const entries = ref<ExerciseImportEntry[]>([])
const selected = ref<string[]>([])
const active = ref(0)
const error = ref('')
const busy = computed(() => reading.value || saving.value)
const indices = computed(() => selected.value.map(Number).sort((a, b) => a - b))
const conflicts = computed(() => exerciseImportConflicts(entries.value, indices.value, exercises))
const drafts = computed(() => indices.value.map((index) => entries.value[index]!.exercise!))
const oversized = computed(
  () => exerciseImportBodySize(drafts.value) > exerciseImportLimits.bodyBytes,
)
const current = computed(() => entries.value[active.value])
const fields = computed(() => exerciseFields.filter(({ key }) => current.value?.exercise?.[key]))
const canImport = computed(
  () =>
    !busy.value &&
    !!drafts.value.length &&
    !conflicts.value.size &&
    !oversized.value &&
    indices.value.every((index) => !entries.value[index]!.errors.length),
)

const importDisabledReason = computed(() => {
  if (reading.value) return '正在解析导入文件，请稍候'
  if (saving.value) return '正在导入练习，请稍候'
  if (!drafts.value.length) return '请先选择要导入的练习'
  if (conflicts.value.size) return '所选练习存在命名冲突，请取消冲突项或修改文件后重新选择'
  if (oversized.value) return '所选练习总大小超过导入限制，请减少本次选择'
  if (indices.value.some((index) => entries.value[index]!.errors.length))
    return '所选文件存在解析错误，请修正后重新选择'
  return ''
})

function show() {
  entries.value = []
  selected.value = []
  error.value = ''
  active.value = 0
  open.value = true
}
async function read(event: Event) {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  input.value = ''
  if (!files.length || busy.value) return
  error.value = ''
  entries.value = []
  selected.value = []
  active.value = 0
  if (files.length > exerciseImportLimits.files) {
    error.value = `每批最多 ${exerciseImportLimits.files} 个文件，请重新选择`
    return
  }
  reading.value = true
  try {
    const result: ExerciseImportEntry[] = []
    // Read sequentially to bound memory usage even when invalid files are large.
    for (const file of files) result.push(await readExerciseImport(file))
    entries.value = result
    selected.value = result.flatMap((entry, index) => (entry.errors.length ? [] : [String(index)]))
    active.value = 0
  } finally {
    reading.value = false
  }
}
async function save() {
  if (!canImport.value) return
  error.value = ''
  saving.value = true
  try {
    const result = await api<{ ids: string[] }>(classPath('/exercises/import'), 'POST', {
      exercises: drafts.value,
    })
    open.value = false
    entries.value = []
    selected.value = []
    notify(`已导入 ${result.ids.length} 道练习，均保存为草稿`)
    emit('imported', result.ids)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '导入失败，请稍后重试'
  } finally {
    saving.value = false
  }
}
onBeforeRouteLeave(() => !busy.value)
</script>

<template>
  <Button variant="outline" @click="show">
    <Upload />
    批量导入
  </Button>
  <Modal
    v-model:open="open"
    title="批量导入练习"
    wide
    :busy="busy"
    description="每个文件创建一道练习，按选择顺序追加到课堂末尾，统一保存为草稿。">
    <div class="import-toolbar">
      <FileUpload
        accept=".md,.markdown,.json"
        multiple
        :disabled="busy"
        :disabled-reason="reading ? '正在解析导入文件，请稍候' : '正在导入练习，请稍候'"
        @change="read">
        {{ reading ? '正在解析…' : entries.length ? '重新选择文件' : '选择多个文件' }}
      </FileUpload>
      <span class="form-hint">Markdown 或题目 JSON 备份；每批最多 50 个，每个不超过 1 MiB。</span>
    </div>
    <Alert v-if="error" type="error">{{ error }}</Alert>
    <Alert v-if="oversized" type="error">所选题目内容超过 500 KiB，请减少勾选后分批导入。</Alert>
    <div v-if="entries.length" class="import-layout">
      <div class="import-list" aria-label="待导入文件">
        <div
          v-for="(entry, index) in entries"
          :key="index"
          class="import-row"
          :class="{ active: active === index }">
          <Checkbox
            v-model="selected"
            :value="String(index)"
            :disabled="busy || !!entry.errors.length"
            :data-disabled-reason="
              busy ? '正在处理导入文件，请稍候' : '此文件存在解析错误，请修正后重新选择'
            "
            :aria-label="'导入 ' + entry.name" />
          <Button
            variant="plain"
            class="import-file"
            :disabled="busy"
            :data-disabled-reason="reading ? '正在解析导入文件，请稍候' : '正在导入练习，请稍候'"
            @click="active = index">
            <strong>{{ entry.exercise?.title || '未命名题目' }}</strong>
            <span>{{ entry.name }}</span>
            <small>
              {{
                entry.errors.length
                  ? '无法导入'
                  : conflicts.has(index)
                    ? '文件名冲突'
                    : entry.warnings.length
                      ? '请核对警告'
                      : '可导入'
              }}
            </small>
          </Button>
        </div>
      </div>
      <section v-if="current" class="import-preview" aria-label="练习导入预览">
        <h3>{{ current.name }}</h3>
        <Alert v-for="message in current.errors" :key="message" type="error">{{ message }}</Alert>
        <Alert v-if="conflicts.has(active)" type="error">{{ conflicts.get(active) }}</Alert>
        <Alert v-for="message in current.warnings" :key="message" type="warning">
          {{ message }}
        </Alert>
        <p v-if="current.exercise && !fields.length" class="form-hint">备份中的题目字段均为空。</p>
        <section v-for="{ key, label } in fields" :key="key" class="import-field">
          <h4>{{ label }}</h4>
          <CodeBlock
            v-if="['code', 'sampleInput', 'sampleOutput', 'filename'].includes(key)"
            :source="current.exercise?.[key] ?? ''"
            :language="key === 'code' ? 'cpp' : 'text'"
            :label="label" />
          <MarkdownContent v-else :source="current.exercise?.[key] ?? ''" />
        </section>
      </section>
    </div>
    <p v-if="conflicts.size" class="form-error" role="alert">
      所选题目有源文件名冲突，请取消勾选冲突项或修改文件后重新选择。
    </p>
    <div class="modal-actions">
      <span class="form-hint">已选 {{ selected.length }} / {{ entries.length }} 道练习</span>
      <Button
        variant="outline"
        :disabled="busy"
        :data-disabled-reason="reading ? '正在解析导入文件，请稍候' : '正在导入练习，请稍候'"
        @click="open = false">
        取消
      </Button>
      <Button :disabled="!canImport" :data-disabled-reason="importDisabledReason" @click="save">
        {{ saving ? '正在导入…' : `导入为草稿（${selected.length}）` }}
      </Button>
    </div>
  </Modal>
</template>

<style scoped>
.import-toolbar {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 16px;
}
.import-layout {
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr);
  gap: 20px;
  margin-top: 16px;
}
.import-list,
.import-preview {
  max-height: 48vh;
  overflow: auto;
}
.import-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px;
  border-bottom: 1px solid var(--border);
  border-radius: 6px;
}
.import-row.active {
  background: var(--ui-surface);
}
.import-file {
  display: flex;
  flex: 1;
  min-width: 0;
  height: auto;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  text-align: left;
  white-space: normal;
  overflow-wrap: anywhere;
}
.import-file span,
.import-file small {
  font-size: 12px;
  color: var(--ui-muted);
}
.import-preview {
  min-width: 0;
  padding-right: 8px;
  overflow-wrap: anywhere;
}
.import-preview h3 {
  margin: 0 0 16px;
}
.import-field {
  margin-top: 16px;
}
.import-field h4 {
  margin-bottom: 8px;
}
.import-field pre {
  white-space: pre-wrap;
  font-size: 13px;
  padding: 12px;
  background: var(--ui-surface);
  border: 1px solid var(--border);
  border-radius: 6px;
}
</style>
