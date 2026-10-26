<script setup lang="ts">
import { FileUpload } from '@/components/ui/file-upload'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute, useRouter } from 'vue-router'
import { ArrowLeft, Save, Send, CodeXml, FileText, FileCode2, Monitor, Download } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import Modal from '@/components/classroom/Modal.vue'
import MarkdownEditor from '@/components/classroom/MarkdownEditor.vue'
import CodeEditor from '@/components/classroom/CodeEditor.vue'
import {
  exercises,
  starterCode,
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
import { validSourceFilename } from '@/lib/source-file'
const route = useRoute()
const router = useRouter()
const existing = computed(() => exercises.find((e) => e.id === route.params.id))
const missing = computed(() => !!route.params.id && !existing.value)
const draft = reactive<Exercise>(
  existing.value
    ? { ...existing.value }
    : {
        id: '',
        title: '',
        topic: '基础练习',
        filename: '',
        status: '草稿',
        description: '',
        input: '',
        output: '',
        sampleInput: '',
        sampleOutput: '',
        code: starterCode,
      },
)
const initial = ref(JSON.stringify(draft))
const error = ref('')
const busy = ref(false)
const tab = ref('题面与样例')
const leaveDialog = ref(false)
const dirty = computed(() => JSON.stringify(draft) !== initial.value)
const conflict = ref<Exercise>()
const restore = ref<Exercise>()
function restoreDraft() {
  if (!restore.value) return
  Object.assign(draft, restore.value)
  restore.value = undefined
}
const backupKey = `cpp-teacher-exercise:${currentUser.value?.id}:${demo.classroomId}:${route.params.id ?? 'new'}`
let backupTimer: ReturnType<typeof setTimeout> | undefined
function keepBackup() {
  try {
    if (dirty.value) localStorage.setItem(backupKey, JSON.stringify(draft))
    else localStorage.removeItem(backupKey)
  } catch {
    /* A manual download remains available when browser storage is full. */
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
  try {
    if (file.size > 1024 * 1024) throw new Error('备份文件过大，最多 1 MiB')
    const value = JSON.parse(await file.text()) as Exercise
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
  Object.assign(draft, conflict.value)
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
  error.value = '已保留本地内容并采用最新版本号，请核对差异后再次保存。'
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
  if (!draft.title.trim() || !draft.description.trim()) error.value = '请填写题目标题和题面。'
  else if (!draft.topic.trim()) error.value = '请填写知识点。'
  else if (!validSourceFilename(filename))
    error.value =
      '请输入单个 C++ 文件名，例如 sum.cpp；支持 .cpp、.cc、.cxx，不允许路径或特殊字符。'
  else if (
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
</script>
<template>
  <div v-if="!missing" class="exercise-editor-page">
    <div class="page-heading">
      <div>
        <RouterLink to="/teacher/exercises" class="back-link"
          ><ArrowLeft :size="15" />返回练习管理</RouterLink
        >
        <h1>{{ existing ? '编辑练习' : '创建练习' }}</h1>
        <p>
          Markdown 题面与实时预览 ·
          {{ dirty ? '有尚未保存的修改' : draft.id ? '内容已保存' : '填写题目后保存草稿或发布' }}
        </p>
      </div>
      <div class="heading-actions">
        <Button variant="outline" :disabled="busy" @click="save(false)"
          ><Save />{{ draft.status === '已发布' ? '保存更改' : '保存草稿' }}</Button
        ><Button variant="success" :disabled="busy" @click="save(true)"
          ><Send />{{ busy ? '保存中…' : '保存并发布' }}</Button
        >
      </div>
    </div>
    <div v-if="restore" class="warning-box backup-offer">
      <span>找到此题未保存的本机备份。</span
      ><Button variant="outline" size="sm" @click="restoreDraft">恢复编辑</Button
      ><Button variant="ghost" size="sm" @click="restore = undefined">暂不恢复</Button>
    </div>
    <div class="draft-tools">
      <Button variant="outline" size="sm" :disabled="busy" @click="downloadDraft"
        ><Download />下载题目备份</Button
      ><FileUpload accept=".json" :disabled="busy" @change="importDraft">导入备份</FileUpload>
      <span>未保存修改自动备份在本机浏览器</span>
    </div>
    <div v-if="error" role="alert" class="error-box editor-error">{{ error }}</div>
    <section class="panel exercise-meta-panel" :inert="busy">
      <div class="exercise-meta-fields">
        <label
          >题目标题<Input
            v-model="draft.title"
            maxlength="60"
            placeholder="例如：累加求和"
            required /></label
        ><label
          >知识点<Input v-model="draft.topic" maxlength="40" placeholder="例如：for 循环" /></label
        ><label
          >学生源文件名
          <div class="filename-field">
            <FileCode2 :size="16" /><Input
              v-model="draft.filename"
              maxlength="80"
              placeholder="例如：sum.cpp"
              spellcheck="false"
            /></div
        ></label>
      </div>
      <p class="form-hint">每道题使用独立文件名。修改文件名不会重命名或覆盖学生磁盘上的旧文件。</p>
    </section>
    <div class="editor-page-tabs">
      <Button
        variant="plain"
        :class="{ selected: tab === '题面与样例' }"
        @click="tab = '题面与样例'"
      >
        <FileText :size="16" />题面与样例</Button
      ><Button variant="plain" :class="{ selected: tab === '初始代码' }" @click="tab = '初始代码'">
        <CodeXml :size="16" />初始代码</Button
      ><span class="muted"><Monitor :size="14" />授课页与学生端共用题面</span>
    </div>
    <template v-if="tab === '题面与样例'"
      ><div :inert="busy"><MarkdownEditor v-model="draft.description" /></div>
      <section class="panel exercise-samples-editor" :inert="busy">
        <div class="form-grid">
          <label
            >输入说明<Textarea
              v-model="draft.input"
              rows="3"
              placeholder="描述输入格式和数据范围；无输入可留空" /></label
          ><label
            >输出说明<Textarea v-model="draft.output" rows="3" placeholder="描述输出格式" /></label
          ><label
            >样例输入<Textarea
              v-model="draft.sampleInput"
              rows="5"
              spellcheck="false"
              placeholder="5" /></label
          ><label
            >样例输出<Textarea
              v-model="draft.sampleOutput"
              rows="5"
              spellcheck="false"
              placeholder="15"
            />
          </label>
        </div></section
    ></template>
    <section v-else class="panel initial-code-page" :inert="busy">
      <div class="code-toolbar">
        <CodeXml :size="15" />{{ draft.filename || '请先设置源文件名'
        }}<span class="language-label ml-auto"
          >{{ executionSettings.compilerProfile === 'gcc13-cpp20' ? 'C++20' : 'C++17' }} ·
          初始代码</span
        >
      </div>
      <CodeEditor v-model="draft.code" :filename="draft.filename" />
      <div class="info-box">初始代码只用于创建学生的工作区，不会替换已经编辑的学生草稿。</div>
    </section>
  </div>
  <div v-else class="empty-state">
    <h1>没有找到这道练习</h1>
    <RouterLink to="/teacher/exercises">返回练习管理</RouterLink>
  </div>
  <Modal
    :open="leaveDialog"
    title="离开前保留修改？"
    description="本页的未保存内容将丢失，已保存的题目不受影响。"
    @update:open="!$event && settleLeave(false)"
    ><div class="modal-actions">
      <Button variant="outline" @click="downloadDraft">下载备份</Button
      ><Button variant="outline" @click="settleLeave(false)">继续编辑</Button
      ><Button variant="destructive" @click="settleLeave(true)">放弃修改并离开</Button>
    </div></Modal
  >
  <Modal
    :open="!!conflict"
    title="题目已有其他修改"
    description="你的内容已保留在本机。请比较两个版本，再选择继续编辑或采用服务器版本。"
    wide
    @update:open="!$event && (conflict = undefined)"
    ><div class="conflict-comparison">
      <section>
        <h3>本地修改</h3>
        <pre>{{ JSON.stringify(draft, null, 2) }}</pre>
      </section>
      <section>
        <h3>服务器最新版本</h3>
        <pre>{{ JSON.stringify(conflict, null, 2) }}</pre>
      </section>
    </div>
    <div class="modal-actions">
      <Button variant="outline" @click="downloadDraft">下载本地备份</Button
      ><Button variant="outline" @click="useServer">采用服务器版本</Button
      ><Button @click="keepLocal">保留本地修改继续编辑</Button>
    </div></Modal
  >
</template>

<style scoped>
.draft-tools,
.backup-offer {
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
.editor-error {
  position: sticky;
  top: 12px;
  z-index: 5;
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
