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
        status: '草稿',
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
    if (!/\.(md|markdown)$/i.test(file.name)) throw new Error('请选择 .md 或 .markdown 文件')
    if (file.size > 1024 * 1024) throw new Error('Markdown 文件过大，最多 1 MiB')
    let source: string
    try {
      source = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer())
    } catch {
      throw new Error('无法读取文件，请使用 UTF-8 编码的 Markdown 文件')
    }
    if (source.includes('\0')) throw new Error('文件包含无效字符，请上传 Markdown 文本')
    markdownImport.value = parseExerciseMarkdown(source)
    markdownFilename.value = file.name
    importFields.value = detectedFields.value.map(({ key }) => key)
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Markdown 导入失败'
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
  notify('已填入选中的 Markdown 内容，请核对后保存')
}
const tab = ref('题面与样例')
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
    notify('本机备份不可用，请及时下载或保存题目', 'error')
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
    (draft.filename || '练习') + '-题目备份.json',
    JSON.stringify(draft, null, 2),
    'application/json',
  )
  notify('题目备份已下载，可通过导入备份恢复')
}
async function importDraft(event: Event) {
  const target = event.target as HTMLInputElement,
    file = target.files?.[0]
  if (!file) return
  error.value = ''
  try {
    if (file.size > 1024 * 1024) throw new Error('备份文件过大，最多 1 MiB')
    const imported = await readExerciseImport(file)
    if (imported.errors.length || !imported.exercise)
      throw new Error(imported.errors.join('；') || '这不是有效的题目备份文件')
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
      throw new Error('这不是有效的题目备份文件')
    for (const field of fields) draft[field] = value[field]
    draft.language = sourceLanguage(value)
    draft.starters = { ...value.starters, [draft.language]: value.code }
    editingLanguage.value = draft.language
    notify('已导入备份内容，请核对后保存')
  } catch (e) {
    error.value = e instanceof Error ? e.message : '备份导入失败'
  }
  target.value = ''
}
async function loadConflict() {
  try {
    conflict.value = (await api<Exercise[]>(classPath('/exercises'))).find(
      (item) => item.id === draft.id,
    )
  } catch {
    error.value += '；服务器版本暂时无法获取，请先下载本地备份。'
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
  notify('已保留本地内容并采用最新版本号，请核对差异后再次保存。', 'info')
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
    notify('正在保存，请稍候再离开', 'info')
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
    error.value =
      '请输入与默认语言对应的源文件名；C++ 支持 .cpp、.cc、.cxx，Python 支持 .py，不允许路径。'
  else if (
    filename &&
    exercises.some(
      (e) => e.id !== draft.id && e.filename.toLocaleLowerCase() === filename.toLocaleLowerCase(),
    )
  )
    error.value = '该文件名已被另一道练习使用，请选择不同的文件名，避免本地文件互相覆盖。'

  if (error.value) return
  const value: Exercise = {
    ...draft,
    title: draft.title.trim(),
    filename,
    id: draft.id,
    status: publish ? '已发布' : draft.status,
  }
  if (
    (publish || value.status === '已发布') &&
    !(await confirmAction(
      `保存并${publish ? '发布' : '更新已发布的'}练习「${value.title || '未命名练习'}」？更改将对课堂学生可见。`,
    ))
  )
    return
  busy.value = true
  try {
    value.id = await saveExercise(value)
    Object.assign(draft, value)
    initial.value = JSON.stringify(draft)
    keepBackup()
    notify(publish ? '练习已发布' : '练习已保存')
  } catch (e) {
    error.value = e instanceof Error ? e.message : '保存失败'
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
  <div v-if="!missing" class="exercise-editor-page">
    <div class="page-heading">
      <div>
        <RouterLink to="/teacher/exercises" class="back-link">
          <ArrowLeft :size="15" />
          返回练习管理
        </RouterLink>
        <h1>{{ existing ? '编辑练习' : '创建练习' }}</h1>
        <p>
          {{ dirty ? '有尚未保存的修改' : draft.id ? '内容已保存' : '填写题目后保存草稿或发布' }}
        </p>
      </div>
      <div class="heading-actions">
        <Button
          variant="outline"
          :disabled="busy || readingMarkdown"
          :data-disabled-reason="busy ? '正在保存题目，请稍候' : '正在解析 Markdown，请稍候'"
          @click="save(false)">
          <Save />
          {{ draft.status === '已发布' ? '保存更改' : '保存草稿' }}
        </Button>
        <Button
          variant="success"
          :disabled="busy || readingMarkdown"
          :data-disabled-reason="busy ? '正在保存题目，请稍候' : '正在解析 Markdown，请稍候'"
          @click="save(true)">
          <Send />
          {{ busy ? '保存中…' : '保存并发布' }}
        </Button>
      </div>
    </div>
    <Alert v-if="restore" type="warning">
      <span>找到此题未保存的本机备份。</span>

      <template #actions>
        <Button variant="outline" size="sm" @click="restoreDraft">恢复编辑</Button>
        <Button variant="ghost" size="sm" @click="restore = undefined">暂不恢复</Button>
      </template>
    </Alert>
    <div class="draft-tools">
      <FileUpload
        accept=".md,.markdown"
        :disabled="busy || readingMarkdown"
        :disabled-reason="busy ? '正在保存题目，请稍候' : '正在解析 Markdown，请稍候'"
        @change="importMarkdown">
        {{ readingMarkdown ? '正在解析…' : '导入 Markdown' }}
      </FileUpload>
      <Button
        variant="outline"
        size="sm"
        :disabled="busy"
        data-disabled-reason="正在保存题目，请稍候"
        @click="downloadDraft">
        <Download />
        下载题目备份
      </Button>
      <FileUpload
        accept=".json"
        :disabled="busy"
        disabled-reason="正在保存题目，请稍候"
        @change="importDraft">
        导入备份
      </FileUpload>
      <span>未保存修改自动备份在本机浏览器</span>
    </div>

    <section class="panel exercise-meta-panel" :inert="busy">
      <div class="exercise-meta-fields">
        <label>
          默认语言
          <LanguageSelect
            :model-value="draft.language ?? 'cpp'"
            @update:model-value="changeDefaultLanguage" />
        </label>
        <label>
          题目标题
          <Input v-model="draft.title" maxlength="100" placeholder="例如：累加求和" />
        </label>
        <label>
          知识点
          <Input v-model="draft.topic" maxlength="100" placeholder="例如：for 循环" />
        </label>
        <label>
          学生源文件名
          <div class="filename-field">
            <FileCode2 :size="16" />
            <Input
              v-model="draft.filename"
              maxlength="80"
              placeholder="例如：sum.cpp"
              spellcheck="false" />
          </div>
        </label>
      </div>
      <p class="form-hint">
        学生可随时切换 C++ /
        Python，两种语言分别保存草稿。默认语言只影响首次打开；初始代码可以分别编辑。源文件名留空时使用按题目编号生成的独立文件名。
      </p>
    </section>
    <div class="editor-page-tabs">
      <Button
        variant="plain"
        :class="{ selected: tab === '题面与样例' }"
        @click="tab = '题面与样例'">
        <FileText :size="16" />
        题面与样例
      </Button>
      <Button variant="plain" :class="{ selected: tab === '初始代码' }" @click="tab = '初始代码'">
        <CodeXml :size="16" />
        初始代码
      </Button>
    </div>
    <template v-if="tab === '题面与样例'">
      <div :inert="busy"><MarkdownEditor v-model="draft.description" /></div>
      <section class="panel exercise-samples-editor" :inert="busy">
        <div class="form-grid">
          <label>
            输入说明
            <Textarea
              v-model="draft.input"
              rows="3"
              placeholder="描述输入格式和数据范围；无输入可留空" />
          </label>
          <label>
            输出说明
            <Textarea v-model="draft.output" rows="3" placeholder="描述输出格式" />
          </label>
          <label>
            样例输入
            <Textarea v-model="draft.sampleInput" rows="5" spellcheck="false" placeholder="5" />
          </label>
          <label>
            样例输出
            <Textarea v-model="draft.sampleOutput" rows="5" spellcheck="false" placeholder="15" />
          </label>
        </div>
      </section>
    </template>
    <section v-else class="panel initial-code-page" :inert="busy">
      <div class="code-toolbar">
        <CodeXml :size="15" />
        <LanguageSelect v-model="editingLanguage" label="初始代码语言" />
        {{ draft.filename ? exerciseSourceFilename(draft, editingLanguage) : '初始代码（可留空）' }}
        <span class="language-label ml-auto">
          {{
            editingLanguage === 'python'
              ? 'Python 3'
              : executionSettings.compilerProfile === 'gcc13-cpp20'
                ? 'C++20'
                : 'C++17'
          }}
          · 初始代码
          <PythonBeta v-if="editingLanguage === 'python'" />
        </span>
      </div>
      <CodeEditor
        v-model="starter"
        :language="editingLanguage"
        :filename="exerciseSourceFilename(draft, editingLanguage)" />
      <Alert type="info">初始代码只用于创建学生的工作区，不会替换已经编辑的学生草稿。</Alert>
    </section>
  </div>
  <div v-else class="empty-state">
    <h1>没有找到这道练习</h1>
    <RouterLink to="/teacher/exercises">返回练习管理</RouterLink>
  </div>
  <Modal
    :open="!!markdownImport"
    title="预览 Markdown 导入"
    :description="`${markdownFilename} · 勾选要填入的字段；确认后覆盖这些字段，未识别或未勾选的字段保留原内容。`"
    wide
    @update:open="!$event && (markdownImport = undefined)">
    <template v-if="markdownImport">
      <p class="form-hint">
        支持一级标题作为题目名，以及「题目描述 / 输入格式 / 输出格式 / 样例输入 / 样例输出 /
        初始代码」等中英文标题。代码块会保留原始内容；普通 Markdown 正文填入题面。
      </p>
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
            <span v-if="draft[key]" class="muted">将覆盖已有内容</span>
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
        <Button variant="outline" @click="markdownImport = undefined">取消</Button>
        <Button
          :disabled="!!markdownImport.errors.length || !importFields.length"
          :data-disabled-reason="
            markdownImport.errors.length
              ? '导入文件存在错误，请先修正文件后重新导入'
              : '没有可填充的字段，请先选择导入字段'
          "
          @click="applyMarkdown">
          确认填充（{{ importFields.length }} 个字段）
        </Button>
      </div>
    </template>
  </Modal>
  <Modal
    :open="leaveDialog"
    title="离开前保留修改？"
    description="本页的未保存内容将丢失，已保存的题目不受影响。"
    @update:open="!$event && settleLeave(false)">
    <div class="modal-actions">
      <Button variant="outline" @click="downloadDraft">下载备份</Button>
      <Button variant="outline" @click="settleLeave(false)">继续编辑</Button>
      <Button variant="destructive" @click="settleLeave(true)">放弃修改并离开</Button>
    </div>
  </Modal>
  <Modal
    :open="!!conflict"
    title="题目已有其他修改"
    description="你的内容已保留在本机。请比较两个版本，再选择继续编辑或采用服务器版本。"
    wide
    @update:open="!$event && (conflict = undefined)">
    <div class="conflict-comparison">
      <section>
        <h3>本地修改</h3>
        <CodeBlock :source="JSON.stringify(draft, null, 2)" language="json" label="JSON" />
      </section>
      <section>
        <h3>服务器最新版本</h3>
        <CodeBlock :source="JSON.stringify(conflict, null, 2)" language="json" label="JSON" />
      </section>
    </div>
    <div class="modal-actions">
      <Button variant="outline" @click="downloadDraft">下载本地备份</Button>
      <Button variant="outline" @click="useServer">采用服务器版本</Button>
      <Button @click="keepLocal">保留本地修改继续编辑</Button>
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
  margin-bottom: 18px;
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
  min-width: 0;
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
