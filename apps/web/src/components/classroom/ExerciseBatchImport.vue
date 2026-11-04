<script setup lang="ts">
import PythonBeta from './PythonBeta.vue'
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
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

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
  if (reading.value) return t('exercises.import.parsingReason')
  if (saving.value) return t('exercises.import.importingReason')
  if (!drafts.value.length) return t('exercises.import.pickFirst')
  if (conflicts.value.size) return t('exercises.import.conflictReason')
  if (oversized.value) return t('exercises.import.oversizedReason')
  if (indices.value.some((index) => entries.value[index]!.errors.length))
    return t('exercises.import.parseErrorReason')
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
    error.value = t('exercises.import.tooManyFiles', { count: exerciseImportLimits.files })
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
    notify(t('exercises.import.importedNotify', { count: result.ids.length }))
    emit('imported', result.ids)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : t('exercises.import.importFailed')
  } finally {
    saving.value = false
  }
}
onBeforeRouteLeave(() => !busy.value)
</script>

<template>
  <Button variant="outline" @click="show">
    <Upload />
    {{ t('exercises.import.button') }}
  </Button>
  <Modal
    v-model:open="open"
    :title="t('exercises.import.modalTitle')"
    wide
    :busy="busy"
    :description="t('exercises.import.description')">
    <div class="import-toolbar">
      <span v-if="current?.exercise?.language === 'python'" class="inline-items">
        Python
        <PythonBeta />
      </span>
      <FileUpload
        accept=".md,.markdown,.json"
        multiple
        :disabled="busy"
        :disabled-reason="
          reading ? t('exercises.import.parsingReason') : t('exercises.import.importingReason')
        "
        @change="read">
        {{
          reading
            ? t('exercises.import.parsing')
            : entries.length
              ? t('exercises.import.reselect')
              : t('exercises.import.chooseFiles')
        }}
      </FileUpload>
      <span class="form-hint">{{ t('exercises.import.hint') }}</span>
    </div>
    <Alert v-if="error" type="error">{{ error }}</Alert>
    <Alert v-if="oversized" type="error">{{ t('exercises.import.oversizedAlert') }}</Alert>
    <div v-if="entries.length" class="import-layout">
      <div class="import-list" :aria-label="t('exercises.import.listAria')">
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
              busy ? t('exercises.import.processing') : t('exercises.import.entryError')
            "
            :aria-label="t('exercises.import.importAria', { name: entry.name })" />
          <Button
            variant="plain"
            class="import-file"
            :disabled="busy"
            :data-disabled-reason="
              reading ? t('exercises.import.parsingReason') : t('exercises.import.importingReason')
            "
            @click="active = index">
            <strong>{{ entry.exercise?.title || t('exercises.unnamed') }}</strong>
            <span>{{ entry.name }}</span>
            <small>
              {{
                entry.errors.length
                  ? t('exercises.import.cannotImport')
                  : conflicts.has(index)
                    ? t('exercises.import.filenameConflict')
                    : entry.warnings.length
                      ? t('exercises.import.checkWarnings')
                      : t('exercises.import.importable')
              }}
            </small>
          </Button>
        </div>
      </div>
      <section
        v-if="current"
        class="import-preview"
        :aria-label="t('exercises.import.previewAria')">
        <h3>{{ current.name }}</h3>
        <Alert v-for="message in current.errors" :key="message" type="error">{{ message }}</Alert>
        <Alert v-if="conflicts.has(active)" type="error">{{ conflicts.get(active) }}</Alert>
        <Alert v-for="message in current.warnings" :key="message" type="warning">
          {{ message }}
        </Alert>
        <p v-if="current.exercise && !fields.length" class="form-hint">
          {{ t('exercises.import.emptyFields') }}
        </p>
        <section v-for="{ key, label } in fields" :key="key" class="import-field">
          <h4>{{ label }}</h4>
          <CodeBlock
            v-if="['code', 'sampleInput', 'sampleOutput', 'filename'].includes(key)"
            :source="current.exercise?.[key] ?? ''"
            :language="key === 'code' ? (current?.exercise?.language ?? 'cpp') : 'text'"
            :label="label" />
          <MarkdownContent v-else :source="current.exercise?.[key] ?? ''" />
        </section>
      </section>
    </div>
    <p v-if="conflicts.size" class="form-error" role="alert">
      {{ t('exercises.import.conflictAlert') }}
    </p>
    <div class="modal-actions">
      <span class="form-hint">
        {{
          t('exercises.import.selectedCount', { selected: selected.length, total: entries.length })
        }}
      </span>
      <Button
        variant="outline"
        :disabled="busy"
        :data-disabled-reason="
          reading ? t('exercises.import.parsingReason') : t('exercises.import.importingReason')
        "
        @click="open = false">
        {{ t('common.cancel') }}
      </Button>
      <Button :disabled="!canImport" :data-disabled-reason="importDisabledReason" @click="save">
        {{
          saving
            ? t('exercises.import.importing')
            : t('exercises.import.importAs', { count: selected.length })
        }}
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
