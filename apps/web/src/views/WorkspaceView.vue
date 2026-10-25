<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch, nextTick } from 'vue'
import { onBeforeRouteLeave, useRoute } from 'vue-router'
import {
  ArrowLeft,
  Play,
  Square,
  CloudCheck,
  Download,
  RotateCcw,
  Hand,
  Send,
  BookOpen,
  History,
  CodeXml,
  Check,
  ChevronDown,
  Settings2,
  WifiOff,
  Monitor,
} from '@lucide/vue'
import { Button } from '@/components/ui/button'
import Modal from '@/components/classroom/Modal.vue'
import CodeEditor from '@/components/classroom/CodeEditor.vue'
import RunOutput from '@/components/classroom/RunOutput.vue'
import MarkdownContent from '@/components/classroom/MarkdownContent.vue'
import LocalDirectoryPanel from '@/components/classroom/LocalDirectoryPanel.vue'
import {
  exercises,
  executionSettings,
  activeClassroom,
  notify,
  demo,
  download,
  classPath,
  loadRuns,
  reportError,
  draftStorageKey,
  currentUser,
  type RunRecord,
} from '@/data/demo'
import { api, ApiError } from '@/lib/api'
const route = useRoute()
const selected = ref(String(route.query.exercise ?? demo.recommended ?? exercises[0]?.id))
const exercise = computed(() => exercises.find((e) => e.id === selected.value) ?? exercises[0]!)
const code = ref('')
const input = ref('')
const panel = ref('题目')
const help = ref(false)
const helpText = ref('')
const submit = ref(false)
const submitted = ref(false)
const reset = ref(false)
const run = ref<RunRecord>()
const viewing = ref<RunRecord>()
const fontSize = ref(14)
const saveState = ref('读取中…')
const undo = ref('')
const history = ref<RunRecord[]>([])
const interactive = ref(false)
const revision = ref(0)
const conflict = ref(false)
const directoryPanel = ref<InstanceType<typeof LocalDirectoryPanel>>()
const isArchived = computed(
  () => activeClassroom.value.status !== '进行中' || exercise.value.status !== '已发布',
)
const readonly = computed(() => !!viewing.value || isArchived.value || conflict.value)
const runtime = computed(() => run.value?.status === '运行中／可输入')
const active = () => !!run.value && ['排队', '编译中', '运行中／可输入'].includes(run.value.status)
let loading = false
let dirty = false
let saving: Promise<boolean> | undefined
let saveTimer: ReturnType<typeof setTimeout>
let polling = false
function backup() {
  localStorage.setItem(
    draftStorageKey(selected.value),
    JSON.stringify({ code: code.value, revision: revision.value, pending: dirty }),
  )
}
async function loadCode() {
  loading = true
  conflict.value = false
  dirty = false
  viewing.value = undefined
  run.value = undefined
  submitted.value = false
  input.value = exercise.value.sampleInput
  try {
    const remote = await api<{ code: string; revision: number }>(
      classPath('/workspace/' + selected.value),
    )
    code.value = remote.code
    revision.value = remote.revision
    const stored = localStorage.getItem(draftStorageKey(selected.value))
    if (stored) {
      try {
        const local = JSON.parse(stored)
        if (local.pending && typeof local.code === 'string') {
          code.value = local.code
          dirty = true
          if (local.revision !== remote.revision) {
            conflict.value = true
            saveState.value = '版本冲突：本机修改已保留'
          }
        }
      } catch {
        /* Older browser-only backups are never used as server revisions. */
      }
    }
    if (!conflict.value) saveState.value = dirty ? '本机修改待同步' : '已同步到服务器'
    history.value = await loadRuns(undefined, selected.value)
    run.value = history.value.find((r) => ['排队', '编译中', '运行中／可输入'].includes(r.status))
  } catch (e) {
    reportError(e)
    saveState.value = '读取失败，请刷新后重试'
    conflict.value = true
  }
  await nextTick()
  loading = false
  if (dirty && !conflict.value) void saveNow()
  void heartbeat()
}
async function saveNow(): Promise<boolean> {
  clearTimeout(saveTimer)
  if (saving) {
    await saving
    if (dirty) return saveNow()
    return true
  }
  if (!dirty && revision.value > 0) return true
  if (conflict.value || isArchived.value) return false
  const content = code.value
  const id = selected.value
  saveState.value = '同步中…'
  saving = (async () => {
    try {
      const result = await api<{ revision: number }>(classPath('/workspace/' + id), 'PUT', {
        code: content,
        revision: revision.value,
      })
      revision.value = result.revision
      dirty = code.value !== content
      backup()
      saveState.value = dirty ? '待同步' : '已同步到服务器'
      return true
    } catch (e) {
      backup()
      saveState.value =
        e instanceof ApiError && e.status === 409
          ? '版本冲突：请先比较服务器版本'
          : '网络异常：本机已备份，等待重试'
      if (e instanceof ApiError && e.status === 409) conflict.value = true
      return false
    }
  })()
  const result = await saving
  saving = undefined
  return result
}
watch(code, () => {
  if (loading || readonly.value) return
  dirty = true
  saveState.value = '待同步'
  backup()
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => void saveNow(), 600)
})
watch(selected, () => void loadCode(), { immediate: true })
async function useServer() {
  try {
    const remote = await api<{ code: string; revision: number }>(
      classPath('/workspace/' + selected.value),
    )
    download('本机未同步-' + exercise.value.filename, code.value)
    loading = true
    code.value = remote.code
    revision.value = remote.revision
    dirty = false
    conflict.value = false
    backup()
    await nextTick()
    loading = false
    saveState.value = '已采用服务器版本；本机修改已下载备份'
  } catch (e) {
    reportError(e)
  }
}
async function startRun() {
  try {
    if (!(await saveNow())) throw new Error('请先完成草稿同步')
    viewing.value = undefined
    run.value = await api<RunRecord>(classPath('/runs'), 'POST', {
      exerciseId: selected.value,
      revision: revision.value,
      input: input.value,
      interactive: interactive.value,
    })
    history.value.unshift(run.value)
  } catch (e) {
    reportError(e)
  }
}
async function stop() {
  try {
    await api(classPath('/runs/' + run.value?.id + '/stop'), 'POST', {})
  } catch (e) {
    reportError(e)
  }
}
async function sendLine(text: string) {
  try {
    await api(classPath('/runs/' + run.value?.id + '/input'), 'POST', { text: text + '\n' })
  } catch (e) {
    reportError(e)
  }
}
async function eof() {
  try {
    await api(classPath('/runs/' + run.value?.id + '/input'), 'POST', { eof: true })
    notify('EOF 已发送，等待程序结束')
  } catch (e) {
    reportError(e)
  }
}
async function doSubmit() {
  try {
    if (!(await saveNow())) throw new Error('请先同步草稿')
    await api(classPath('/submissions'), 'POST', {
      exerciseId: selected.value,
      revision: revision.value,
    })
    submitted.value = true
    submit.value = false
    notify('固定版本已提交')
  } catch (e) {
    reportError(e)
  }
}
function resetCode() {
  undo.value = code.value
  code.value = exercise.value.code
  reset.value = false
}
async function sendHelp() {
  try {
    await api(classPath('/help'), 'POST', { exerciseId: selected.value, message: helpText.value })
    demo.helpSent = true
    help.value = false
    notify('求助已发送给教师')
  } catch (e) {
    reportError(e)
  }
}
async function heartbeat() {
  try {
    await api(classPath('/heartbeat'), 'POST', { exerciseId: selected.value })
  } catch {
    saveState.value = '无法连接课堂，请检查网络或成员权限'
  }
}
async function changeExercise(event: Event) {
  const select = event.target as HTMLSelectElement
  if ((await directoryPanel.value?.flush()) === false || (dirty && !(await saveNow()))) {
    select.value = selected.value
    notify('当前修改尚未同步，请先处理保存问题')
    return
  }
  selected.value = select.value
}
const poll = setInterval(async () => {
  if (polling || loading) return
  polling = true
  try {
    if (active()) {
      const next = await api<RunRecord>(classPath('/runs/' + run.value!.id))
      run.value = next
      const i = history.value.findIndex((r) => r.id === next.id)
      if (i >= 0) history.value[i] = next
    }
    if (dirty && !conflict.value && !isArchived.value) await saveNow()
  } catch {
    /* Saved snapshots remain visible while reconnecting. */
  } finally {
    polling = false
  }
}, 500)
const pulse = setInterval(() => void heartbeat(), 5000)
function unload(event: BeforeUnloadEvent) {
  if (dirty) {
    backup()
    event.preventDefault()
    event.returnValue = ''
  }
}
window.addEventListener('beforeunload', unload)
onBeforeUnmount(() => {
  clearTimeout(saveTimer)
  clearInterval(poll)
  clearInterval(pulse)
  window.removeEventListener('beforeunload', unload)
})
onBeforeRouteLeave(async () => {
  await directoryPanel.value?.flush()
  return !dirty || (await saveNow())
})
</script>
<template>
  <div class="ide-page">
    <header class="ide-header">
      <div class="inline-items">
        <RouterLink to="/student/classes" class="icon-button" aria-label="返回我的课堂"
          ><ArrowLeft :size="18" /></RouterLink
        ><span class="ide-brand"><CodeXml :size="21" />码上课堂</span
        ><span class="ide-divider" /><span class="desktop-only">{{ activeClassroom.name }}</span>
      </div>
      <div class="inline-items">
        <span class="demo-tag">课堂工作区</span
        ><span class="avatar small">{{ currentUser?.name.slice(-1) }}</span>
      </div>
    </header>
    <div class="ide-actionbar">
      <div class="inline-items">
        <BookOpen :size="17" class="positive-text" /><select
          :value="selected"
          aria-label="选择练习"
          @change="changeExercise"
        >
          <option
            v-for="e in exercises.filter((e) => e.status === '已发布' || e.id === selected)"
            :key="e.id"
            :value="e.id"
          >
            {{ e.title }}
          </option></select
        ><span v-if="submitted" class="status positive"><Check :size="12" />已提交</span
        ><span class="save-label desktop-only"><CloudCheck :size="14" />{{ saveState }}</span>
      </div>
      <div class="inline-items">
        <Button variant="ghost" size="sm" @click="panel = panel === '历史' ? '题目' : '历史'"
          ><History />历史</Button
        ><Button variant="outline" size="sm" :disabled="isArchived" @click="help = true"
          ><Hand />{{ demo.helpSent ? '已发起求助' : '求助' }}</Button
        ><Button size="sm" :disabled="readonly" @click="submit = true"><Send />提交作品</Button>
      </div>
    </div>
    <LocalDirectoryPanel
      ref="directoryPanel"
      v-model="code"
      :classroom-id="demo.classroomId"
      :exercise-id="selected"
      :filename="exercise.filename"
      :readonly="readonly"
    />
    <div v-if="viewing" class="workspace-alert amber">
      <History :size="14" />正在查看 {{ viewing.id }} 的只读代码快照，当前草稿独立保留。<button
        @click="viewing = undefined"
      >
        返回当前草稿 <ArrowLeft :size="13" />
      </button>
    </div>
    <div v-if="conflict" class="workspace-alert amber">
      <WifiOff :size="14" />{{ saveState
      }}<button @click="useServer">下载本机修改并读取服务器版本</button>
    </div>
    <div v-else-if="isArchived" class="workspace-alert amber">
      当前课堂或练习只读，作品与历史保留。
    </div>
    <div class="ide-layout">
      <div class="ide-main">
        <section class="editor-area">
          <div class="code-toolbar">
            <span class="file-tab"
              ><CodeXml :size="15" />{{ viewing?.filename ?? exercise.filename }}
              <i v-if="!readonly" class="file-dot" /><span v-if="readonly" class="muted"
                >只读</span
              ></span
            >
            <div class="inline-items ml-auto">
              <label class="compact-select"
                ><Settings2 :size="13" /><select v-model.number="fontSize" aria-label="编辑器字号">
                  <option :value="14">14 px</option>
                  <option :value="16">16 px</option>
                  <option :value="18">18 px</option>
                </select></label
              ><button
                class="icon-button"
                aria-label="下载当前代码"
                @click="download(viewing?.filename ?? exercise.filename, viewing?.code ?? code)"
              >
                <Download :size="14" /></button
              ><button
                v-if="undo"
                class="text-button"
                :disabled="readonly"
                @click="
                  () => {
                    code = undo
                    undo = ''
                    notify('已恢复重置前的本机代码')
                  }
                "
              >
                撤销重置</button
              ><button
                v-else
                class="icon-button"
                aria-label="重置初始代码"
                :disabled="readonly"
                @click="reset = true"
              >
                <RotateCcw :size="14" /></button
              ><span class="language-label">C++17<ChevronDown :size="11" /></span>
            </div>
          </div>
          <CodeEditor
            :model-value="viewing?.code ?? code"
            :readonly="readonly"
            :font-size="fontSize"
            :filename="viewing?.filename ?? exercise.filename"
            :error-line="viewing?.status === '编译失败' ? 10 : undefined"
            @update:model-value="!readonly && (code = $event)"
          />
        </section>
        <div class="ide-bottom">
          <section class="stdin-panel">
            <div class="code-toolbar">
              <span>输入</span><span class="muted text-xs">stdin</span
              ><button
                class="text-button ml-auto"
                :disabled="!!viewing"
                @click="
                  () => {
                    input = exercise.sampleInput
                    notify('已填入题目样例')
                  }
                "
              >
                填入样例
              </button>
            </div>
            <textarea
              v-if="!viewing"
              v-model="input"
              aria-label="标准输入"
              placeholder="运行前填写标准输入…"
              :readonly="isArchived"
            />
            <pre v-else class="snapshot-input">{{ viewing.input }}</pre>
            <div class="stdin-note">
              {{ viewing ? '本次运行使用的固定输入' : '预填输入与运行快照关联' }}
            </div>
          </section>
          <RunOutput
            :key="(viewing ?? run)?.id"
            :run="viewing ?? run"
            :interactive="runtime && !viewing"
            @send="sendLine"
            @eof="eof"
          />
        </div>
        <div class="ide-runbar">
          <div class="inline-items">
            <label class="inline-items"
              ><input v-model="interactive" type="checkbox" :disabled="active()" />运行时输入（最长
              60 秒）</label
            >
          </div>
          <div class="inline-items">
            <Button
              v-if="runtime || run?.status === '排队' || run?.status === '编译中'"
              variant="outline"
              size="sm"
              @click="stop"
              ><Square />停止</Button
            ><Button
              :disabled="readonly || runtime || run?.status === '排队' || run?.status === '编译中'"
              size="sm"
              @click="startRun"
              ><Play />编译运行</Button
            >
          </div>
        </div>
      </div>
      <aside class="ide-problem">
        <div class="problem-tabs">
          <button :class="{ selected: panel === '题目' }" @click="panel = '题目'">
            <BookOpen :size="15" />题目说明</button
          ><button :class="{ selected: panel === '历史' }" @click="panel = '历史'">
            <History :size="15" />运行历史
          </button>
        </div>
        <div v-if="panel === '题目'" class="problem-content">
          <span class="topic-label"
            >练习 {{ exercises.findIndex((e) => e.id === selected) + 1 }} ·
            {{ exercise.topic }}</span
          >
          <h1>{{ exercise.title }}</h1>
          <div class="problem-limits">
            <span>{{ executionSettings.runTimeMs }} ms</span
            ><span>{{ executionSettings.runMemoryMb }} MiB</span>
          </div>
          <MarkdownContent :source="exercise.description" />
          <h3>输入说明</h3>
          <MarkdownContent :source="exercise.input" />
          <h3>输出说明</h3>
          <MarkdownContent :source="exercise.output" />
          <h3>样例</h3>
          <div class="sample-grid stacked">
            <div>
              <span>输入</span>
              <pre>{{ exercise.sampleInput }}</pre>
            </div>
            <div>
              <span>输出</span>
              <pre>{{ exercise.sampleOutput }}</pre>
            </div>
          </div>
          <div class="problem-tip">
            <strong>想一想</strong>
            <p>先检查样例的输入和预期输出，再逐步编写程序。</p>
          </div>
          <div class="privacy-note">
            <Monitor :size="15" /><span
              >课堂内的教师可以查看你的代码和运行记录，及时提供辅导。</span
            >
          </div>
        </div>
        <div v-else class="history-list">
          <p class="form-hint">服务器固定快照，查看历史不会重新运行。</p>
          <button
            v-for="r in history"
            :key="r.id"
            class="history-item"
            :class="{ selected: viewing?.id === r.id }"
            @click="viewing = r"
          >
            <span
              ><strong>{{ r.status }}</strong
              ><small>{{ r.time }} · {{ r.id }}</small></span
            ><History :size="15" />
          </button>
        </div>
      </aside>
    </div>
    <footer class="ide-statusbar">
      <span><span class="live-dot" />{{ readonly ? '只读工作区' : '服务器同步' }}</span
      ><span class="ml-auto"
        >UTF-8
        <span class="desktop-only"
          >· GCC 13.3 /
          {{ executionSettings.compilerProfile === 'gcc13-cpp20' ? 'C++20' : 'C++17' }}</span
        ></span
      >
    </footer>
  </div>
  <Modal
    v-model:open="help"
    title="告诉老师，你遇到了什么？"
    description="教师会结合你的代码和运行上下文提供帮助。"
    ><form class="form-stack" @submit.prevent="sendHelp">
      <label
        >求助说明<textarea
          v-model="helpText"
          rows="4"
          placeholder="例如：循环里的变量应该怎么初始化？"
          maxlength="300"
          required
        />
      </label>
      <div class="info-box">
        关联练习：{{ exercise.title }}<br />关联运行：{{ run?.id ?? '无最近运行' }}
      </div>
      <div class="modal-actions">
        <Button type="button" variant="outline" @click="help = false">取消</Button
        ><Button type="submit"><Hand />{{ demo.helpSent ? '更新求助' : '发起求助' }}</Button>
      </div>
    </form></Modal
  >
  <Modal
    v-model:open="submit"
    title="提交当前作品？"
    description="提交会保存固定代码版本，你仍然可以继续修改。"
    ><div class="info-box">
      {{ exercise.title }} · {{ exercise.filename }}<br />提交保存到服务器。提交不等于通过判题。
    </div>
    <div class="modal-actions">
      <Button variant="outline" @click="submit = false">继续修改</Button
      ><Button @click="doSubmit"><Send />确认提交</Button>
    </div></Modal
  >
  <Modal
    v-model:open="reset"
    title="重置为初始代码？"
    description="当前代码会保留在本次页面的恢复区，可通过工具栏撤销。"
    ><div class="modal-actions">
      <Button variant="outline" @click="reset = false">保留当前代码</Button
      ><Button variant="destructive" @click="resetCode">确认重置</Button>
    </div></Modal
  >
</template>
