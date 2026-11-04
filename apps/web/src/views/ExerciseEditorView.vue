<script setup lang="ts">
import {
  exerciseSourceFilename,
  exerciseStarterCode,
  type SourceLanguage,
} from '@classroom/contracts'
import LanguageSelect from '@/components/classroom/LanguageSelect.vue'
import PythonBeta from '@/components/classroom/PythonBeta.vue'
import { sourceLanguage, normalizeExerciseSources } from '@/lib/source-language'
import { readExerciseImport } from '@/lib/exercise-import'
import CodeBlock from '@/components/classroom/CodeBlock.vue'
import { useActionFeedback } from '@/composables/useActionFeedback'
import { Alert } from '@/components/ui/alert'
import { FileUpload } from '@/components/ui/file-upload'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute, useRouter } from 'vue-router'
import { ArrowLeft, Save, Send, CodeXml, FileText, FileCode2, Download } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import Modal from '@/components/classroom/Modal.vue'
import ContentPanel from '@/components/classroom/ContentPanel.vue'
import MarkdownEditor from '@/components/classroom/MarkdownEditor.vue'
import MarkdownContent from '@/components/classroom/MarkdownContent.vue'
import CodeEditor from '@/components/classroom/CodeEditor.vue'
import {
  exercises,
  notify,
  saveExercise,
  download,
  classPath,
  currentUser,
  demo,
  executionSettings,
  type Exercise,
} from '@/data/demo'
import { api, ApiError } from '@/lib/api'
import { confirmAction } from '@/lib/confirm'
import { validSourceFilename } from '@/lib/source-file'
import { exerciseFields, parseExerciseMarkdown, type MarkdownImport } from '@/lib/exercise-markdown'
import { useI18n } from 'vue-i18n'
const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const existing = computed(() => exercises.find((e) => e.id === route.params.id))
const missing = computed(() => !!route.params.id && !existing.value)
const draft = reactive<Exercise>(
  existing.value
    ? JSON.parse(JSON.stringify(existing.value))
    : {
        id: '',
        language: 'cpp',
        starters: { cpp: '', python: '' },
        title: '',
        topic: '',
        filename: '',
        status: 'draft',
        description: '',
        input: '',
        output: '',
        sampleInput: '',
        sampleOutput: '',
        code: '',
      },
)
Object.assign(draft, normalizeExerciseSources(draft))
const editingLanguage = ref<SourceLanguage>(draft.language ?? 'cpp')
const starter = computed({
  get: () => exerciseStarterCode(draft, editingLanguage.value),
  set: (value: string) => {
    draft.starters = { ...draft.starters, [editingLanguage.value]: value }
    if (editingLanguage.value === draft.language) draft.code = value
  },
})
function changeDefaultLanguage(language: SourceLanguage) {
  draft.starters = { ...draft.starters, [draft.language ?? 'cpp']: draft.code }
  draft.code = exerciseStarterCode(draft, language)
  if (draft.filename)
    draft.filename = draft.filename.replace(
      /\.(cpp|cc|cxx|py)$/i,
      language === 'python' ? '.py' : '.cpp',
    )
  draft.language = language
  draft.starters[language] = draft.code
  editingLanguage.value = language
}
const initial = ref(JSON.stringify(draft))
const error = ref('')
const busy = ref(false)
const readingMarkdown = ref(false)
const markdownImport = ref<MarkdownImport>()
const markdownFilename = ref('')
const importFields = ref<string[]>([])
const detectedFields = computed(() =>
  exerciseFields.filter(({ key }) => markdownImport.value?.fields[key] !== undefined),
)
async function importMarkdown(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return
  error.value = ''
  readingMarkdown.value = true
  try {
    if (!/\.(md|markdown)$/i.test(file.name))
      throw new Error(t('exercises.editor.markdownFileError'))
    if (file.size > 1024 * 1024) throw new Error(t('exercises.editor.markdownTooLarge'))
    let source: string
    try {
      source = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer())
    } catch {
      throw new Error(t('exercises.editor.markdownDecode'))
    }
    if (source.includes('\0')) throw new Error(t('exercises.editor.markdownInvalidChar'))
    markdownImport.value = parseExerciseMarkdown(source)
    markdownFilename.value = file.name
    importFields.value = detectedFields.value.map(({ key }) => key)
  } catch (e) {
    error.value = e instanceof Error ? e.message : t('exercises.editor.markdownFailed')
  } finally {
    readingMarkdown.value = false
    target.value = ''
  }
}
function applyMarkdown() {
  if (!markdownImport.value || markdownImport.value.errors.length || !importFields.value.length)
    return
  if (
    markdownImport.value.language &&
    (importFields.value.includes('code') || importFields.value.includes('filename'))
  )
    changeDefaultLanguage(markdownImport.value.language)
  for (const { key } of detectedFields.value) {
    if (importFields.value.includes(key)) draft[key] = markdownImport.value.fields[key]!
  }
  if (importFields.value.includes('code'))
    draft.starters = { ...draft.starters, [draft.language ?? 'cpp']: draft.code }
  markdownImport.value = undefined
  notify(t('exercises.editor.markdownApplied'))
}
const tab = ref('problem')
const leaveDialog = ref(false)
const dirty = computed(() => JSON.stringify(draft) !== initial.value)
const conflict = ref<Exercise>()
const restore = ref<Exercise>()
function restoreDraft() {
  if (!restore.value) return
  Object.assign(
    draft,
    JSON.parse(JSON.stringify(restore.value)),
    normalizeExerciseSources(restore.value),
  )
  editingLanguage.value = sourceLanguage(draft)
  restore.value = undefined
}
const backupKey = `cpp-teacher-exercise:${currentUser.value?.id}:${demo.classroomId}:${route.params.id ?? 'new'}`
let backupTimer: ReturnType<typeof setTimeout> | undefined
function keepBackup() {
  try {
    if (dirty.value) localStorage.setItem(backupKey, JSON.stringify(draft))
    else localStorage.removeItem(backupKey)
  } catch {
    notify(t('exercises.editor.backupUnavailable'), 'error')
  }
}
watch(
  draft,
  () => {
    clearTimeout(backupTimer)
    backupTimer = setTimeout(keepBackup, 500)
  },
  { deep: true },
)
onMounted(() => {
  try {
    const saved = JSON.parse(localStorage.getItem(backupKey) ?? 'null') as Exercise | null
    if (
      saved &&
      typeof saved.title === 'string' &&
      typeof saved.description === 'string' &&
      saved.id === draft.id &&
      JSON.stringify(saved) !== initial.value
    )
      restore.value = saved
  } catch {
    /* Invalid backup data must not prevent editing. */
  }
})
onBeforeUnmount(() => {
  clearTimeout(backupTimer)
  keepBackup()
})
function downloadDraft() {
  download(
    t('exercises.editor.backupFilename', { name: draft.filename || t('exercises.unnamed') }),
    JSON.stringify(draft, null, 2),
    'application/json',
  )
  notify(t('exercises.editor.backupDownloaded'))
}
async function importDraft(event: Event) {
  const target = event.target as HTMLInputElement,
    file = target.files?.[0]
  if (!file) return
  error.value = ''
  try {
    if (file.size > 1024 * 1024) throw new Error(t('exercises.editor.backupTooLarge'))
    const imported = await readExerciseImport(file)
    if (imported.errors.length || !imported.exercise)
      throw new Error(imported.errors.join('；') || t('exercises.editor.invalidBackup'))
    const value = imported.exercise
    const fields = [
      'title',
      'topic',
      'description',
      'input',
      'output',
      'sampleInput',
      'sampleOutput',
      'code',
      'filename',
    ] as const
    if (fields.some((field) => typeof value[field] !== 'string'))
      throw new Error(t('exercises.editor.invalidBackup'))
    for (const field of fields) draft[field] = value[field]
    draft.language = sourceLanguage(value)
    draft.starters = { ...value.starters, [draft.language]: value.code }
    editingLanguage.value = draft.language
    notify(t('exercises.editor.backupImported'))
  } catch (e) {
    error.value = e instanceof Error ? e.message : t('exercises.editor.backupFailed')
  }
  target.value = ''
}
async function loadConflict() {
  try {
    conflict.value = (await api<Exercise[]>(classPath('/exercises'))).find(
      (item) => item.id === draft.id,
    )
  } catch {
    error.value += t('exercises.editor.serverUnavailableSuffix')
  }
}
function useServer() {
  if (!conflict.value) return
  Object.assign(
    draft,
    JSON.parse(JSON.stringify(conflict.value)),
    normalizeExerciseSources(conflict.value),
  )
  editingLanguage.value = sourceLanguage(draft)
  initial.value = JSON.stringify(draft)
  conflict.value = undefined
  error.value = ''
  keepBackup()
}
function keepLocal() {
  if (!conflict.value) return
  initial.value = JSON.stringify(conflict.value)
  draft.version = conflict.value.version
  draft.position = conflict.value.position
  conflict.value = undefined
  notify(t('exercises.editor.keepLocalNotify'), 'info')
}
function beforeUnload(event: BeforeUnloadEvent) {
  keepBackup()
  if (dirty.value) {
    event.preventDefault()
    event.returnValue = ''
  }
}
onMounted(() => window.addEventListener('beforeunload', beforeUnload))
onBeforeUnmount(() => window.removeEventListener('beforeunload', beforeUnload))
let leaveResolve: ((value: boolean) => void) | undefined
function guardLeave() {
  if (busy.value) {
    notify(t('exercises.editor.savingLeave'), 'info')
    return false
  }
  if (!dirty.value) return true
  leaveDialog.value = true
  return new Promise<boolean>((resolve) => {
    leaveResolve = resolve
  })
}
onBeforeRouteLeave(guardLeave)
onBeforeRouteUpdate(guardLeave)
function settleLeave(allowed: boolean) {
  const resolve = leaveResolve
  leaveResolve = undefined
  leaveDialog.value = false
  resolve?.(allowed)
}
async function save(publish: boolean) {
  if (busy.value) return
  error.value = ''
  const filename = draft.filename.trim()
  if (filename && !validSourceFilename(filename, draft.language ?? 'cpp'))
    error.value = t('exercises.editor.filenameError')
  else if (
    filename &&
    exercises.some(
      (e) => e.id !== draft.id && e.filename.toLocaleLowerCase() === filename.toLocaleLowerCase(),
    )
  )
    error.value = t('exercises.editor.filenameDup')

  if (error.value) return
  const value: Exercise = {
    ...draft,
    title: draft.title.trim(),
    filename,
    id: draft.id,
    status: publish ? 'published' : draft.status,
  }
  if (
    (publish || value.status === 'published') &&
    !(await confirmAction(
      t('exercises.editor.publishConfirm', {
        action: publish
          ? t('exercises.editor.publishConfirmPublish')
          : t('exercises.editor.publishConfirmUpdate'),
        title: value.title || t('exercises.unnamed'),
      }),
    ))
  )
    return
  busy.value = true
  try {
    value.id = await saveExercise(value)
    Object.assign(draft, value)
    initial.value = JSON.stringify(draft)
    keepBackup()
    notify(publish ? t('exercises.published') : t('exercises.editor.saved'))
  } catch (e) {
    error.value = e instanceof Error ? e.message : t('exercises.editor.saveFailed')
    keepBackup()
    if (e instanceof ApiError && e.status === 409) await loadConflict()
    return
  } finally {
    busy.value = false
  }
  router.push('/teacher/exercises?exercise=' + value.id)
}
function saveShortcut(event: KeyboardEvent) {
  if (
    !(event.metaKey || event.ctrlKey) ||
    event.altKey ||
    event.shiftKey ||
    event.key.toLowerCase() !== 's'
  )
    return
  event.preventDefault()
  if (!busy.value && !readingMarkdown.value && !missing.value) void save(false)
}
onMounted(() => window.addEventListener('keydown', saveShortcut, true))
onBeforeUnmount(() => window.removeEventListener('keydown', saveShortcut, true))
useActionFeedback(error)
</script>
<template>
  <div v-if="!missing" class="exercise-editor-page fill-stack">
    <div class="page-heading">
      <div>
        <RouterLink to="/teacher/exercises" class="back-link">
          <ArrowLeft :size="15" />
          {{ t('exercises.editor.back') }}
        </RouterLink>
        <h1>
          {{ existing ? t('exercises.editor.editTitle') : t('exercises.editor.createTitle') }}
        </h1>
        <p>
          {{
            dirty
              ? t('exercises.editor.dirtyHint')
              : draft.id
                ? t('exercises.editor.savedHint')
                : t('exercises.editor.newHint')
          }}
        </p>
      </div>
      <div class="heading-actions">
        <Button
          variant="outline"
          :disabled="busy || readingMarkdown"
          :data-disabled-reason="
            busy ? t('exercises.editor.savingTitle') : t('exercises.editor.parsingMarkdown')
          "
          @click="save(false)">
          <Save />
          {{
            draft.status === 'published'
              ? t('exercises.editor.saveChanges')
              : t('exercises.editor.saveDraft')
          }}
        </Button>
        <Button
          variant="success"
          :disabled="busy || readingMarkdown"
          :data-disabled-reason="
            busy ? t('exercises.editor.savingTitle') : t('exercises.editor.parsingMarkdown')
          "
          @click="save(true)">
          <Send />
          {{ busy ? t('exercises.editor.saving') : t('exercises.editor.savePublish') }}
        </Button>
      </div>
    </div>
    <Alert v-if="restore" type="warning">
      <span>{{ t('exercises.editor.restoreFound') }}</span>

      <template #actions>
        <Button variant="outline" size="sm" @click="restoreDraft">
          {{ t('exercises.editor.restore') }}
        </Button>
        <Button variant="ghost" size="sm" @click="restore = undefined">
          {{ t('exercises.editor.skipRestore') }}
        </Button>
      </template>
    </Alert>
    <div
      class="exercise-editor-body"
      role="region"
      :aria-label="t('exercises.editor.editorAria')"
      tabindex="0">
      <div class="draft-tools">
        <FileUpload
          accept=".md,.markdown"
          :disabled="busy || readingMarkdown"
          :disabled-reason="
            busy ? t('exercises.editor.savingTitle') : t('exercises.editor.parsingMarkdown')
          "
          @change="importMarkdown">
          {{
            readingMarkdown ? t('exercises.editor.parsing') : t('exercises.editor.importMarkdown')
          }}
        </FileUpload>
        <Button
          variant="outline"
          size="sm"
          :disabled="busy"
          :data-disabled-reason="t('exercises.editor.savingTitle')"
          @click="downloadDraft">
          <Download />
          {{ t('exercises.editor.downloadBackup') }}
        </Button>
        <FileUpload
          accept=".json"
          :disabled="busy"
          :disabled-reason="t('exercises.editor.savingTitle')"
          @change="importDraft">
          {{ t('exercises.editor.importBackup') }}
        </FileUpload>
        <span>{{ t('exercises.editor.autoBackupHint') }}</span>
      </div>

      <ContentPanel as="section" class="exercise-meta-panel" :inert="busy">
        <div class="exercise-meta-fields">
          <label>
            {{ t('exercises.editor.defaultLanguage') }}
            <LanguageSelect
              :model-value="draft.language ?? 'cpp'"
              @update:model-value="changeDefaultLanguage" />
          </label>
          <label>
            {{ t('exercises.editor.titleLabel') }}
            <Input
              v-model="draft.title"
              maxlength="100"
              :placeholder="t('exercises.editor.titlePlaceholder')" />
          </label>
          <label>
            {{ t('exercises.editor.topicLabel') }}
            <Input
              v-model="draft.topic"
              maxlength="100"
              :placeholder="t('exercises.editor.topicPlaceholder')" />
          </label>
          <label>
            {{ t('exercises.editor.filenameLabel') }}
            <div class="filename-field">
              <FileCode2 :size="16" />
              <Input
                v-model="draft.filename"
                maxlength="80"
                :placeholder="t('exercises.editor.filenamePlaceholder')"
                spellcheck="false" />
            </div>
          </label>
        </div>
        <p class="form-hint">{{ t('exercises.editor.languageHint') }}</p>
      </ContentPanel>
      <div class="editor-page-tabs">
        <Button variant="plain" :class="{ selected: tab === 'problem' }" @click="tab = 'problem'">
          <FileText :size="16" />
          {{ t('exercises.editor.problemTab') }}
        </Button>
        <Button variant="plain" :class="{ selected: tab === 'starter' }" @click="tab = 'starter'">
          <CodeXml :size="16" />
          {{ t('exercises.editor.starterTab') }}
        </Button>
      </div>
      <template v-if="tab === 'problem'">
        <div :inert="busy"><MarkdownEditor v-model="draft.description" /></div>
        <ContentPanel as="section" class="exercise-samples-editor" :inert="busy">
          <div class="form-grid">
            <label>
              {{ t('exercises.editor.inputLabel') }}
              <Textarea
                v-model="draft.input"
                rows="3"
                :placeholder="t('exercises.editor.inputPlaceholder')" />
            </label>
            <label>
              {{ t('exercises.editor.outputLabel') }}
              <Textarea
                v-model="draft.output"
                rows="3"
                :placeholder="t('exercises.editor.outputPlaceholder')" />
            </label>
            <label>
              {{ t('exercises.editor.sampleInputLabel') }}
              <Textarea v-model="draft.sampleInput" rows="5" spellcheck="false" placeholder="5" />
            </label>
            <label>
              {{ t('exercises.editor.sampleOutputLabel') }}
              <Textarea v-model="draft.sampleOutput" rows="5" spellcheck="false" placeholder="15" />
            </label>
          </div>
        </ContentPanel>
      </template>
      <ContentPanel v-else as="section" direct class="initial-code-page" :inert="busy">
        <div class="code-toolbar">
          <CodeXml :size="15" />
          <LanguageSelect
            v-model="editingLanguage"
            :label="t('exercises.editor.starterLanguageLabel')" />
          {{
            draft.filename
              ? exerciseSourceFilename(draft, editingLanguage)
              : t('exercises.editor.starterFilenameFallback')
          }}
          <span class="language-label ml-auto">
            {{
              editingLanguage === 'python'
                ? 'Python 3'
                : executionSettings.compilerProfile === 'gcc13-cpp20'
                  ? 'C++20'
                  : 'C++17'
            }}
            · {{ t('exercises.editor.starterLabel') }}
            <PythonBeta v-if="editingLanguage === 'python'" />
          </span>
        </div>
        <CodeEditor
          v-model="starter"
          :language="editingLanguage"
          :filename="exerciseSourceFilename(draft, editingLanguage)" />
        <Alert type="info">{{ t('exercises.editor.starterHint') }}</Alert>
      </ContentPanel>
    </div>
  </div>
  <div v-else class="empty-state">
    <h1>{{ t('exercises.editor.notFound') }}</h1>
    <RouterLink to="/teacher/exercises">{{ t('exercises.editor.back') }}</RouterLink>
  </div>
  <Modal
    :open="!!markdownImport"
    :title="t('exercises.editor.markdownModal.title')"
    :description="t('exercises.editor.markdownModal.description', { filename: markdownFilename })"
    wide
    @update:open="!$event && (markdownImport = undefined)">
    <template v-if="markdownImport">
      <p class="form-hint">{{ t('exercises.editor.markdownModal.hint') }}</p>
      <Alert v-for="message in markdownImport.errors" :key="message" type="error">
        {{ message }}
      </Alert>
      <Alert v-for="message in markdownImport.warnings" :key="message" type="warning">
        {{ message }}
      </Alert>
      <div class="markdown-import-preview">
        <section v-for="{ key, label } in detectedFields" :key="key" class="markdown-import-field">
          <label class="inline-items">
            <Checkbox v-model="importFields" :value="key" />
            <strong>{{ label }}</strong>
            <span v-if="draft[key]" class="muted">
              {{ t('exercises.editor.markdownModal.willOverride') }}
            </span>
          </label>
          <CodeBlock
            v-if="['sampleInput', 'sampleOutput', 'code', 'filename'].includes(key)"
            :source="markdownImport.fields[key] ?? ''"
            :language="key === 'code' ? (draft.language ?? 'cpp') : 'text'"
            :label="label" />
          <MarkdownContent v-else :source="markdownImport.fields[key] ?? ''" />
        </section>
      </div>
      <div class="modal-actions">
        <Button variant="outline" @click="markdownImport = undefined">
          {{ t('common.cancel') }}
        </Button>
        <Button
          :disabled="!!markdownImport.errors.length || !importFields.length"
          :data-disabled-reason="
            markdownImport.errors.length
              ? t('exercises.editor.markdownModal.errorsReason')
              : t('exercises.editor.markdownModal.noFieldsReason')
          "
          @click="applyMarkdown">
          {{ t('exercises.editor.markdownModal.apply', { count: importFields.length }) }}
        </Button>
      </div>
    </template>
  </Modal>
  <Modal
    :open="leaveDialog"
    :title="t('exercises.editor.leaveModal.title')"
    :description="t('exercises.editor.leaveModal.description')"
    @update:open="!$event && settleLeave(false)">
    <div class="modal-actions">
      <Button variant="outline" @click="downloadDraft">
        {{ t('exercises.editor.leaveModal.download') }}
      </Button>
      <Button variant="outline" @click="settleLeave(false)">
        {{ t('exercises.editor.leaveModal.continueEdit') }}
      </Button>
      <Button variant="destructive" @click="settleLeave(true)">
        {{ t('exercises.editor.leaveModal.discard') }}
      </Button>
    </div>
  </Modal>
  <Modal
    :open="!!conflict"
    :title="t('exercises.editor.conflictModal.title')"
    :description="t('exercises.editor.conflictModal.description')"
    wide
    @update:open="!$event && (conflict = undefined)">
    <div class="conflict-comparison">
      <section>
        <h3>{{ t('exercises.editor.conflictModal.local') }}</h3>
        <CodeBlock :source="JSON.stringify(draft, null, 2)" language="json" label="JSON" />
      </section>
      <section>
        <h3>{{ t('exercises.editor.conflictModal.server') }}</h3>
        <CodeBlock :source="JSON.stringify(conflict, null, 2)" language="json" label="JSON" />
      </section>
    </div>
    <div class="modal-actions">
      <Button variant="outline" @click="downloadDraft">
        {{ t('exercises.editor.conflictModal.downloadLocal') }}
      </Button>
      <Button variant="outline" @click="useServer">
        {{ t('exercises.editor.conflictModal.useServer') }}
      </Button>
      <Button @click="keepLocal">{{ t('exercises.editor.conflictModal.keepLocal') }}</Button>
    </div>
  </Modal>
</template>

<style scoped>
.markdown-import-preview {
  display: grid;
  gap: 16px;
  margin-top: 16px;
}
.markdown-import-field {
  min-width: 0;
  border: 1px solid var(--ui-line);
  border-radius: 8px;
  padding: 16px;
}
.markdown-import-field > label {
  margin-bottom: 12px;
  cursor: pointer;
}
.markdown-import-field .muted {
  font-size: 13px;
}
.markdown-import-field pre {
  margin: 0;
  padding: 12px;
  overflow: auto;
  max-height: 260px;
  background: var(--ui-surface);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.draft-tools {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
}
.draft-tools > span {
  color: var(--ui-muted);
  font-size: 14px;
}
.backup-import {
  position: relative;
  overflow: hidden;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  cursor: pointer;
  color: var(--ui-action);
}
.backup-import input {
  position: absolute;
  opacity: 0;
  inset: 0;
  width: 100%;
  cursor: pointer;
}
.conflict-comparison {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}
.conflict-comparison section {
  min-width: 0;
}
.conflict-comparison h3 {
  font-size: 15px;
  margin-bottom: 8px;
}
.conflict-comparison pre {
  max-height: 340px;
  overflow: auto;
  background: var(--ui-surface);
  padding: 12px;
  font-size: 14px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
@media (max-width: 600px) {
  .conflict-comparison {
    grid-template-columns: minmax(0, 1fr);
  }
}
.exercise-editor-page {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}
.exercise-editor-page > :not(.exercise-editor-body) {
  flex-shrink: 0;
}
.exercise-editor-body {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  gap: 16px;
}
.exercise-editor-body > * {
  flex-shrink: 0;
}
.exercise-meta-fields > label,
.form-grid > label {
  min-width: 0;
}
.exercise-meta-fields input,
.form-grid textarea {
  width: 100%;
  min-width: 0;
}
.exercise-editor-page .heading-actions {
  flex-wrap: wrap;
}
@media (max-width: 600px) {
  .exercise-meta-fields,
  .form-grid {
    grid-template-columns: minmax(0, 1fr);
  }
  .exercise-meta-fields > label:first-child {
    grid-column: auto;
  }
  .editor-page-tabs {
    flex-wrap: wrap;
  }
}
</style>
