<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { ArrowLeft, Save, Send, CodeXml, FileText, FileCode2, Monitor } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import Modal from '@/components/classroom/Modal.vue'
import MarkdownEditor from '@/components/classroom/MarkdownEditor.vue'
import CodeEditor from '@/components/classroom/CodeEditor.vue'
import { exercises, starterCode, notify, type Exercise } from '@/data/demo'
import { validSourceFilename } from '@/lib/source-file'
const route = useRoute()
const router = useRouter()
const existing = exercises.find((e) => e.id === route.params.id)
const missing = !!route.params.id && !existing
const draft = reactive<Exercise>(
  existing
    ? { ...existing }
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
const tab = ref('题面与样例')
const leaveDialog = ref(false)
const dirty = computed(() => JSON.stringify(draft) !== initial.value)
watch(
  draft,
  () => {
    if (error.value) error.value = ''
  },
  { deep: true },
)
function beforeUnload(event: BeforeUnloadEvent) {
  if (dirty.value) {
    event.preventDefault()
    event.returnValue = ''
  }
}
onMounted(() => window.addEventListener('beforeunload', beforeUnload))
onBeforeUnmount(() => window.removeEventListener('beforeunload', beforeUnload))
let leaveResolve: ((value: boolean) => void) | undefined
onBeforeRouteLeave(() => {
  if (!dirty.value) return true
  leaveDialog.value = true
  return new Promise<boolean>((resolve) => {
    leaveResolve = resolve
  })
})
function settleLeave(allowed: boolean) {
  const resolve = leaveResolve
  leaveResolve = undefined
  leaveDialog.value = false
  resolve?.(allowed)
}
function save(publish: boolean) {
  error.value = ''
  const filename = draft.filename.trim()
  if (!draft.title.trim() || !draft.description.trim()) error.value = '请填写题目标题和题面。'
  else if (!validSourceFilename(filename))
    error.value =
      '请输入单个 C++ 文件名，例如 sum.cpp；支持 .cpp、.cc、.cxx，不允许路径或特殊字符。'
  else if (
    exercises.some(
      (e) => e.id !== draft.id && e.filename.toLocaleLowerCase() === filename.toLocaleLowerCase(),
    )
  )
    error.value = '该文件名已被另一道练习使用，请选择不同的文件名，避免本地文件互相覆盖。'
  else if (
    publish &&
    [draft.input, draft.output, draft.sampleInput, draft.sampleOutput].some((s) => !s.trim())
  )
    error.value = '发布前请补全输入、输出说明和样例。'
  if (error.value) return
  const value: Exercise = {
    ...draft,
    title: draft.title.trim(),
    filename,
    id: draft.id || 'e-' + crypto.randomUUID(),
    status: publish ? '已发布' : draft.status,
  }
  const index = exercises.findIndex((e) => e.id === value.id)
  if (index >= 0) Object.assign(exercises[index]!, value)
  else exercises.push(value)
  Object.assign(draft, value)
  initial.value = JSON.stringify(draft)
  notify(publish ? '练习已发布到本机原型，各演示窗口会同步更新' : '练习已保存到本机')
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
        <p>Markdown 题面与实时预览 · {{ dirty ? '有尚未保存的修改' : '内容已保存' }}</p>
      </div>
      <div class="heading-actions">
        <Button variant="outline" @click="save(false)"
          ><Save />{{ draft.status === '已发布' ? '保存更改' : '保存草稿' }}</Button
        ><Button @click="save(true)"><Send />保存并发布</Button>
      </div>
    </div>
    <div v-if="error" role="alert" class="error-box editor-error">{{ error }}</div>
    <section class="panel exercise-meta-panel">
      <div class="exercise-meta-fields">
        <label
          >题目标题<input
            v-model="draft.title"
            maxlength="60"
            placeholder="例如：累加求和"
            required /></label
        ><label
          >知识点<input v-model="draft.topic" maxlength="40" placeholder="例如：for 循环" /></label
        ><label
          >学生源文件名
          <div class="filename-field">
            <FileCode2 :size="16" /><input
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
      <button :class="{ selected: tab === '题面与样例' }" @click="tab = '题面与样例'">
        <FileText :size="16" />题面与样例</button
      ><button :class="{ selected: tab === '初始代码' }" @click="tab = '初始代码'">
        <CodeXml :size="16" />初始代码</button
      ><span class="muted"><Monitor :size="14" />授课页与学生端共用题面</span>
    </div>
    <template v-if="tab === '题面与样例'"
      ><MarkdownEditor v-model="draft.description" />
      <section class="panel exercise-samples-editor">
        <div class="form-grid">
          <label
            >输入说明<textarea
              v-model="draft.input"
              rows="3"
              placeholder="描述输入格式和数据范围"
            /></label
          ><label
            >输出说明<textarea v-model="draft.output" rows="3" placeholder="描述输出格式" /></label
          ><label
            >样例输入<textarea
              v-model="draft.sampleInput"
              rows="5"
              spellcheck="false"
              placeholder="5"
            /></label
          ><label
            >样例输出<textarea
              v-model="draft.sampleOutput"
              rows="5"
              spellcheck="false"
              placeholder="15"
            />
          </label>
        </div></section
    ></template>
    <section v-else class="panel initial-code-page">
      <div class="code-toolbar">
        <CodeXml :size="15" />{{ draft.filename || '请先设置源文件名'
        }}<span class="language-label ml-auto">C++17 · 初始代码</span>
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
      <Button variant="outline" @click="settleLeave(false)">继续编辑</Button
      ><Button variant="destructive" @click="settleLeave(true)">放弃修改并离开</Button>
    </div></Modal
  >
</template>
