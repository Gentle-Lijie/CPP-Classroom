<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
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
  activeClassroom,
  notify,
  demo,
  download,
  exampleRuns,
  type RunRecord,
  students,
  readDraft,
  saveDraft,
  draftStorageKey,
} from '@/data/demo'
const route = useRoute()
const selected = ref(String(route.query.exercise ?? 'e01'))
const code = ref('')
const directoryPanel = ref<InstanceType<typeof LocalDirectoryPanel>>()
const input = ref('5')
const panel = ref('题目')
const help = ref(false)
const helpText = ref('')
const submit = ref(false)
const submitted = ref(false)
const reset = ref(false)
const runDemo = ref(false)
const scenario = ref('运行完成')
const run = ref<RunRecord>()
const viewing = ref<RunRecord>()
const runtime = ref(false)
const fontSize = ref(14)
const saveState = ref('已保存到本机')
const stateDemo = ref('正常')
const undo = ref('')
const history = ref<RunRecord[]>([])
const runTimer = ref<ReturnType<typeof setTimeout>>()
let saveTimer: ReturnType<typeof setTimeout>
const exercise = computed(() => exercises.find((e) => e.id === selected.value) ?? exercises[0]!)
const isArchived = computed(() => activeClassroom.value.status === '已归档')
const readonly = computed(
  () => !!viewing.value || stateDemo.value === '多标签页只读' || isArchived.value,
)
function loadCode() {
  undo.value = ''
  input.value = exercise.value.sampleInput
  try {
    code.value = readDraft(selected.value, exercise.value.code)
  } catch {
    code.value = exercise.value.code
  }
  submitted.value = false
  const student = students.find((s) => s.id === 's01')
  if (student) student.exerciseId = selected.value
  run.value = undefined
  viewing.value = undefined
  runtime.value = false
  history.value = []
  clearTimeout(runTimer.value)
}
watch(
  selected,
  (_value, previous) => {
    clearTimeout(saveTimer)
    if (previous) {
      try {
        saveDraft(previous, code.value)
      } catch {
        notify('上道练习保存失败，请下载备份')
      }
    }
    loadCode()
  },
  { immediate: true },
)
watch(code, (value) => {
  if (readonly.value) return
  saveState.value = '保存中…'
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    try {
      saveDraft(selected.value, value)
      saveState.value = '已保存到本机'
    } catch {
      saveState.value = '保存失败 · 请下载备份'
    }
  }, 600)
})
function startDemo() {
  runDemo.value = false
  viewing.value = undefined
  runtime.value = false
  run.value = {
    ...exampleRuns[1]!,
    filename: exercise.value.filename,
    id: 'DEMO-' + (history.value.length + 1),
    time: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
    status: '排队',
    output: '',
    log: '示例队列等待中…',
    exit: '—',
  }
  runTimer.value = setTimeout(() => {
    if (!run.value) return
    run.value = { ...run.value, status: '编译中', log: '编译阶段界面演示…' }
    runTimer.value = setTimeout(finishDemo, 500)
  }, 450)
  notify('正在展示固定示例，当前编辑代码未被执行')
}
function finishDemo() {
  if (!run.value) return
  const fixture =
    scenario.value === '编译失败'
      ? exampleRuns[0]!
      : scenario.value === '运行失败'
        ? exampleRuns[3]!
        : scenario.value === '超时'
          ? exampleRuns[2]!
          : exampleRuns[1]!
  const finalStatus = scenario.value
  run.value = {
    ...fixture,
    filename: exercise.value.filename,
    log: fixture.log.replaceAll(fixture.filename, exercise.value.filename),
    id: run.value.id,
    time: run.value.time,
    status: finalStatus,
    ...(finalStatus === '运行中／可输入'
      ? { output: '请输入一个数字：\n', exit: '运行中', log: '编译成功（示例）' }
      : {}),
    ...(finalStatus === '平台执行失败'
      ? {
          output: '',
          log: '示例：执行节点连接中断。此错误不归因于学生代码。',
          exit: '节点不可用',
        }
      : {}),
    ...(finalStatus === '资源超限' ? { output: '', exit: '超过示例内存限制 256 MB' } : {}),
  }
  runtime.value = finalStatus === '运行中／可输入'
  if (!runtime.value) history.value.unshift({ ...run.value })
}
function stop() {
  clearTimeout(runTimer.value)
  if (run.value) {
    run.value = { ...run.value, status: '已停止', exit: '用户停止（演示）' }
    history.value.unshift({ ...run.value })
  }
  runtime.value = false
}
function sendLine(text: string) {
  if (run.value && text.trim())
    run.value = { ...run.value, output: run.value.output + `[示例输入] ${text}\n` }
}
function eof() {
  if (run.value) {
    run.value = {
      ...run.value,
      status: '运行完成',
      output: run.value.output + '输入已结束（EOF 交互演示）\n',
      exit: '0（示例）',
    }
    history.value.unshift({ ...run.value })
  }
  runtime.value = false
  notify('EOF 界面演示完成，未连接执行进程')
}
function doSubmit() {
  try {
    localStorage.setItem(
      'cpp-ui-submission-v2:' + draftStorageKey(selected.value),
      JSON.stringify({
        code: code.value,
        filename: exercise.value.filename,
        input: input.value,
        time: new Date().toISOString(),
      }),
    )
    submitted.value = true
    submit.value = false
    notify('当前代码已作为本机演示提交保存')
  } catch {
    notify('本机存储失败，请下载代码备份')
  }
}
function resetCode() {
  undo.value = code.value
  code.value = exercise.value.code
  reset.value = false
  notify('已重置，可通过工具栏撤销')
}
onBeforeUnmount(() => {
  clearTimeout(saveTimer)
  clearTimeout(runTimer.value)
  try {
    saveDraft(selected.value, code.value)
  } catch {
    /* Download remains available when storage is full. */
  }
})
function sendHelp() {
  demo.helpSent = true
  help.value = false
  notify('已记录本次演示求助，未发送至服务器')
}
async function changeExercise(event: Event) {
  const select = event.target as HTMLSelectElement
  const next = select.value
  if ((await directoryPanel.value?.flush()) === false) {
    select.value = selected.value
    notify('请先处理本地文件未保存状态，或断开目录后再切换练习')
    return
  }
  selected.value = next
}
onBeforeRouteLeave(async () => {
  await directoryPanel.value?.flush()
  return true
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
        <span class="demo-tag">前端交互原型</span><span class="avatar small">陈</span>
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
        ><span v-if="submitted" class="status positive"><Check :size="12" />已提交至本机</span
        ><span class="save-label desktop-only"><CloudCheck :size="14" />{{ saveState }}</span>
      </div>
      <div class="inline-items">
        <Button variant="ghost" size="sm" @click="panel = panel === '历史' ? '题目' : '历史'"
          ><History />历史</Button
        ><Button variant="outline" size="sm" :disabled="isArchived" @click="help = true"
          ><Hand />{{ demo.helpSent ? '已发起演示求助' : '求助' }}</Button
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
    <div v-else-if="stateDemo !== '正常' || isArchived" class="workspace-alert amber">
      <WifiOff :size="14" />{{
        isArchived
          ? '课堂已归档，当前工作区只读。'
          : stateDemo === '离线／未同步'
            ? '网络断开示例：仅保存到本机，尚未同步给教师。'
            : stateDemo === '保存失败'
              ? '保存失败示例：请重试或下载备份，本地代码仍然保留。'
              : '另一标签页正在编辑，此页面为只读。'
      }}<button v-if="!isArchived" @click="stateDemo = '正常'">恢复正常示例</button>
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
            <span class="demo-tag">示例运行</span
            ><span class="muted text-xs desktop-only">固定示例结果，不编译当前草稿</span>
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
              @click="runDemo = true"
              ><Play />演示运行</Button
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
          <div class="problem-limits"><span>2,000 ms</span><span>256 MB</span></div>
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
          <p class="form-hint">仅展示预置示例与本次演示记录，查看历史不会重新运行。</p>
          <button
            v-for="r in [...history, ...exampleRuns]"
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
      <span><span class="live-dot" />{{ readonly ? '只读工作区' : '本机编辑模式' }}</span
      ><label class="state-demo-select"
        >状态预览<select v-model="stateDemo" aria-label="预览保存与冲突状态">
          <option>正常</option>
          <option>离线／未同步</option>
          <option>保存失败</option>
          <option>多标签页只读</option>
        </select></label
      ><span class="ml-auto"
        >UTF-8 <span class="desktop-only">· GCC 13.2 / C++17（配置示例）</span></span
      >
    </footer>
  </div>
  <Modal
    v-model:open="help"
    title="告诉老师，你遇到了什么？"
    description="教师会结合你的代码和运行上下文提供帮助。此处为本次界面演示。"
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
      {{ exercise.title }} · {{ exercise.filename
      }}<br />只保存到当前浏览器，不上传服务器。提交不等于通过判题。
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
  <Modal
    v-model:open="runDemo"
    title="运行状态交互演示"
    description="选择一个固定示例。不会编译或执行你正在编辑的 C++ 代码。"
    ><div class="form-stack">
      <label
        >示例场景<select v-model="scenario">
          <option>运行完成</option>
          <option>编译失败</option>
          <option>运行中／可输入</option>
          <option>运行失败</option>
          <option>超时</option>
          <option>资源超限</option>
          <option>平台执行失败</option>
        </select></label
      >
      <p class="form-hint">示例展示排队、编译与最终状态；输入、EOF、停止仅演示前端交互。</p>
      <div class="modal-actions">
        <Button variant="outline" @click="runDemo = false">取消</Button
        ><Button @click="startDemo"><Play />展示示例</Button>
      </div>
    </div></Modal
  >
</template>
