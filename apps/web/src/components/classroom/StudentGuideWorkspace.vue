<script setup lang="ts">
import { Alert } from '@/components/ui/alert'
import { computed, reactive, ref, watch } from 'vue'
import {
  ArrowLeft,
  BookOpen,
  ChevronDown,
  CloudCheck,
  CodeXml,
  Download,
  FolderOpen,
  Hand,
  History,
  Play,
  Send,
  Square,
  Terminal,
  CircleAlert,
  Check,
} from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Form } from '@/components/ui/form'
import { Checkbox } from '@/components/ui/checkbox'
import {
  brokenCode,
  closeMockInput,
  compilerDiagnostic,
  createStudentGuideSession,
  guideExercises,
  interactiveCode,
  resolveMockFileConflict,
  runMockBatch,
  sendMockLine,
  sumCode,
  type StudentGuideScene,
} from '@/lib/student-guide-demo'

const props = defineProps<{ scene: StudentGuideScene }>()
const session = reactive(createStudentGuideSession())
const line = ref('4')
const exercise = computed(
  () => guideExercises.find((item) => item.id === session.exerciseId) ?? guideExercises[0],
)
const directoryOpen = computed(() => props.scene === 'directory' || props.scene === 'conflict')
const errorShown = computed(() => props.scene === 'diagnostics' && !session.errorFixed)
const code = computed(() => {
  if (props.scene === 'interactive') return interactiveCode
  if (props.scene === 'diagnostics')
    return session.errorFixed ? brokenCode.replace('std::endl\n', 'std::endl;\n') : brokenCode
  if (props.scene === 'conflict' && session.conflictResolved) return session.editorCode
  if (session.exerciseId === 'greeting')
    return '#include <iostream>\n#include <string>\n\nint main() {\n    std::string name;\n    std::cin >> name;\n    std::cout << "Hello, " << name << "!";\n}'
  return sumCode
})
const result = computed(() => {
  if (props.scene === 'interactive') return session.interactiveOutput
  if (props.scene === 'diagnostics') return session.errorFixed ? '5\n' : compilerDiagnostic
  return session.batchOutput
})
const resultStatus = computed(() =>
  errorShown.value
    ? '编译失败'
    : props.scene === 'interactive' && !session.interactiveClosed
      ? '运行中／可输入'
      : '运行完成',
)
function selectExercise(id: string) {
  session.exerciseId = id
  session.batchInput = exercise.value.input
  session.batchOutput = exercise.value.output + '\n'
}
function stopMockRunning() {
  session.interactiveClosed = true
  session.interactiveOutput += '程序已停止。\n'
}
function sendLine() {
  if (sendMockLine(session, line.value)) line.value = ''
}
watch(
  () => props.scene,
  (scene) => {
    if (scene === 'conflict') {
      session.editorCode = sumCode
      session.diskCode =
        '#include <iostream>\n\nint main() {\n    // 磁盘上保留的另一个版本\n    std::cout << "Hello, C++!";\n}'
      session.conflictResolved = ''
      session.backup = ''
    }
    if (scene === 'batch' || scene === 'interactive' || scene === 'diagnostics') {
      selectExercise('sum')
      if (scene === 'interactive') {
        const fresh = createStudentGuideSession()
        session.interactiveSum = fresh.interactiveSum
        session.interactiveInput = fresh.interactiveInput
        session.interactiveOutput = fresh.interactiveOutput
        session.interactiveClosed = false
        session.inputError = ''
        line.value = '4'
      }
      if (scene === 'diagnostics') session.errorFixed = false
    }
  },
  { immediate: true },
)
</script>
<template>
  <div class="mock-workspace" data-student-guide="overview" aria-label="学生工作区模拟演示">
    <Alert type="info" class="app-alert--banner" :icon="BookOpen" title="模拟导览 · 示例课堂">
      所有代码、文件和结果均为模拟，可放心尝试
    </Alert>
    <header class="mock-toolbar">
      <ArrowLeft :size="18" class="muted" />
      <div class="mock-exercise" data-student-guide="exercises">
        <span class="mock-class-name">C++ 入门 · 示例课堂</span>
        <Button
          variant="plain"
          class="mock-exercise-trigger"
          aria-label="切换示例题目"
          :aria-expanded="scene === 'exercises'">
          <BookOpen :size="16" />
          {{ exercise.title }}
          <ChevronDown :size="14" />
        </Button>
        <div v-if="scene === 'exercises'" class="mock-exercise-options" data-spotlight-extent>
          <span>选择课堂练习</span>
          <Button
            v-for="item in guideExercises"
            :key="item.id"
            variant="plain"
            :aria-pressed="session.exerciseId === item.id"
            @click="selectExercise(item.id)">
            <span>
              {{ item.title }}
              <small>{{ item.filename }}</small>
            </span>
            <Check v-if="session.exerciseId === item.id" :size="16" />
          </Button>
        </div>
      </div>
      <span class="mock-saved">
        <CloudCheck :size="15" />
        已同步到服务器
      </span>
      <Button variant="outline" size="sm">
        <FolderOpen />
        工作目录
      </Button>
      <div class="mock-actions" data-student-guide="actions">
        <Button variant="outline" size="sm" @click="session.helped = true">
          <Hand />
          {{ session.helped ? '模拟求助已发送' : '求助' }}
        </Button>
        <Button variant="outline" size="sm" @click="session.submitted = true">
          <Send />
          {{ session.submitted ? '模拟作品已提交' : '提交作品' }}
        </Button>
      </div>
      <Button size="sm" @click="runMockBatch(session)">
        <Play />
        编译运行
      </Button>
    </header>
    <div class="mock-layout">
      <aside class="mock-problem">
        <div class="mock-tabs">
          <span :class="{ active: scene !== 'history' }">
            <BookOpen :size="14" />
            题目说明
          </span>
          <span :class="{ active: scene === 'history' }">
            <History :size="14" />
            运行历史
          </span>
        </div>
        <div v-if="scene !== 'history'" class="mock-problem-copy">
          <span class="mock-eyebrow">
            ① 题目区 · 练习 {{ session.exerciseId === 'sum' ? '1' : '2' }}
          </span>
          <h1>{{ exercise.title }}</h1>
          <div class="mock-limits">
            2000 ms
            <span>256 MiB</span>
          </div>
          <p>
            {{
              scene === 'interactive'
                ? '逐行读取整数并输出累计值；读到输入结尾后输出总和。'
                : exercise.description
            }}
          </p>
          <h3>输入说明</h3>
          <p>
            {{
              session.exerciseId === 'sum'
                ? '两个整数 a 和 b，以空格或换行分隔。'
                : '一个名字，例如 Ada。'
            }}
          </p>
          <h3>输出说明</h3>
          <p>{{ session.exerciseId === 'sum' ? '输出 a + b 的结果。' : '输出 Hello, 名字!。' }}</p>
          <h3>样例</h3>
          <div class="mock-sample">
            <span>输入</span>
            <pre>{{ exercise.input }}</pre>
          </div>
          <div class="mock-sample">
            <span>输出</span>
            <pre>{{ exercise.output }}</pre>
          </div>
          <Alert type="info">教师可查看本课堂的代码与运行记录，为你提供辅导。</Alert>
        </div>
        <div v-else class="mock-history" data-student-guide="history">
          <span class="mock-eyebrow">本题运行快照 · 示例</span>
          <article class="selected">
            <span class="status positive">运行完成</span>
            <strong>补上分号后的版本</strong>
            <small>示例记录 B · stdout: 5</small>
          </article>
          <article>
            <span class="status red">编译失败</span>
            <strong>第 5 行缺少分号</strong>
            <small>示例记录 A · 保留原始编译诊断</small>
          </article>
          <p>每条快照保留当次代码、输入与结果，和当前草稿分别保存。</p>
        </div>
      </aside>
      <div class="mock-main" data-student-guide="diagnostics">
        <section class="mock-editor" data-student-guide="editor">
          <div class="mock-section-heading">
            <span>
              <CodeXml :size="15" />
              {{ exercise.filename }}
              <i />
            </span>
            <span class="mock-tools">
              16 px
              <Download :size="14" />
              GCC 13.3 / C++17
            </span>
          </div>
          <span class="mock-area-label">② 代码区</span>
          <div class="mock-code">
            <div
              v-for="(text, index) in code.split('\n')"
              :key="index"
              class="mock-code-line"
              :class="{ 'mock-error-line': errorShown && index === 4 }">
              <span class="mock-line-number">{{ index + 1 }}</span>
              <code>{{ text || ' ' }}</code>
              <span v-if="errorShown && index === 4" class="mock-code-error">缺少分号 ;</span>
            </div>
          </div>
          <div class="mock-editor-footnote">
            {{ errorShown ? '示例诊断：第 5 行语句未结束' : 'clangd · 可选的浏览器补全与诊断' }}
            <span>草稿自动保存</span>
          </div>
        </section>
        <div class="mock-io" data-student-guide="io">
          <section class="mock-input">
            <div class="mock-section-heading">
              <span>
                ③ 输入
                <small>stdin</small>
              </span>
              <Button
                variant="plain"
                class="mock-text-button"
                @click="session.batchInput = exercise.input">
                填入样例
              </Button>
            </div>
            <Textarea
              v-if="scene !== 'interactive'"
              v-model="session.batchInput"
              aria-label="模拟标准输入"
              spellcheck="false" />
            <div v-else class="mock-input-transcript">
              <span>已发送的输入</span>
              <pre>{{ session.interactiveInput }}</pre>
              <small>发送会在每一行末尾加上换行符。</small>
            </div>
            <label class="mock-interactive-label">
              <Checkbox :model-value="scene === 'interactive'" disabled />
              运行时输入
            </label>
            <Button
              v-if="scene === 'batch'"
              class="mock-batch-run"
              size="sm"
              @click="runMockBatch(session)">
              <Play />
              模拟运行
            </Button>
            <Alert v-if="session.batchError && scene === 'batch'" role="alert" type="error">
              {{ session.batchError }}
            </Alert>
          </section>
          <section class="mock-output">
            <div class="mock-section-heading">
              <span>
                <component :is="errorShown ? CircleAlert : Terminal" :size="14" />
                {{ errorShown ? '编译诊断' : '④ 运行输出' }}
              </span>
              <span v-if="errorShown" class="status red">失败</span>
              <small v-else>stdout</small>
            </div>
            <div class="mock-output-content">
              <span class="status" :class="errorShown ? 'red' : 'positive'">
                {{ resultStatus }}
              </span>
              <pre :class="{ 'mock-diagnostic-log': errorShown }">{{ result }}</pre>
              <Alert
                v-if="scene === 'diagnostics'"
                :type="session.errorFixed ? 'success' : 'warning'"
                :title="session.errorFixed ? '修正后编译成功' : '修正提示'">
                {{
                  session.errorFixed
                    ? '模拟程序已执行，输出 5。原来的失败快照会保留在历史中。'
                    : 'sum.cpp:5:36 表示文件名、第 5 行、第 36 列。该行末尾缺少 ;，编译器因此无法继续解析下一行。'
                }}
                <template v-if="!session.errorFixed" #actions>
                  <Button size="sm" @click="session.errorFixed = true">
                    补上分号并重新编译（模拟）
                  </Button>
                </template>
              </Alert>
            </div>
            <Form v-if="scene === 'interactive'" class="mock-runtime" @submit.prevent="sendLine">
              <Input
                v-model="line"
                aria-label="模拟运行时输入"
                placeholder="输入一个整数…"
                :disabled="session.interactiveClosed" />
              <Button type="submit" size="sm" :disabled="session.interactiveClosed">发送</Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                :disabled="session.interactiveClosed"
                @click="closeMockInput(session)">
                EOF
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                :disabled="session.interactiveClosed"
                @click="stopMockRunning">
                <Square :size="12" />
                停止
              </Button>
            </Form>
            <Alert v-if="scene === 'interactive' && session.inputError" role="alert" type="error">
              {{ session.inputError }}
            </Alert>
            <Alert v-if="scene === 'interactive' && session.interactiveClosed" type="info">
              stdin 已关闭 · 本次模拟已结束
            </Alert>
          </section>
        </div>
      </div>
    </div>
    <section
      v-if="directoryOpen && scene === 'directory'"
      class="mock-floating-panel mock-directory"
      data-student-guide="directory">
      <div class="mock-panel-heading">
        <FolderOpen :size="20" />
        <div>
          <h2>本地工作目录</h2>
          <p>把网页草稿与自己电脑上的源文件关联起来</p>
        </div>
      </div>
      <div class="mock-directory-path">
        <span>C++练习 / {{ exercise.filename }}</span>
        <Button
          size="sm"
          :variant="session.directoryConnected ? 'outline' : 'default'"
          @click="session.directoryConnected = !session.directoryConnected">
          {{ session.directoryConnected ? '断开模拟目录' : '模拟选择工作目录' }}
        </Button>
      </div>
      <Alert role="status" type="info">
        {{
          session.directoryConnected
            ? `已授权 · 已关联 ${exercise.filename} · 已同步到模拟磁盘`
            : '尚未关联 · 点击按钮演示授权与文件关联'
        }}
      </Alert>
      <div class="mock-sync-flow">
        <span>网页编辑器</span>
        <strong>↔</strong>
        <span>{{ exercise.filename }}</span>
        <strong>↔</strong>
        <span>授权的目录</span>
      </div>
      <dl>
        <div>
          <dt>从网页修改</dt>
          <dd>编辑后自动写入关联文件，服务器草稿独立保存。</dd>
        </div>
        <div>
          <dt>从其他编辑器修改</dt>
          <dd>每 2 秒检查磁盘；网页没有未保存改动时读取外部版本。</dd>
        </div>
        <div>
          <dt>换题或重新打开</dt>
          <dd>按当前题目文件名重新关联；权限失效时需重新授权。</dd>
        </div>
      </dl>
      <Alert type="info">
        实际目录读写需要支持此能力的浏览器（如 Chrome / Edge）；本演示不请求任何磁盘权限。
      </Alert>
    </section>
    <section
      v-if="scene === 'conflict'"
      class="mock-floating-panel mock-conflict"
      data-student-guide="conflict">
      <div class="mock-panel-heading">
        <CircleAlert :size="20" />
        <div>
          <h2>磁盘与编辑器都有修改</h2>
          <p>自动写入已暂停 · {{ exercise.filename }} · 模拟冲突</p>
        </div>
      </div>
      <div class="mock-versions">
        <div>
          <h3>编辑器草稿</h3>
          <pre>{{ session.editorCode }}</pre>
        </div>
        <div>
          <h3>磁盘文件</h3>
          <pre>{{ session.diskCode }}</pre>
        </div>
      </div>
      <div class="mock-conflict-actions">
        <Button variant="outline" size="sm" @click="session.backup = session.editorCode">
          保留模拟草稿备份
        </Button>
        <Button variant="outline" size="sm" @click="resolveMockFileConflict(session, 'editor')">
          用草稿覆盖模拟磁盘
        </Button>
        <Button size="sm" @click="resolveMockFileConflict(session, 'disk')">
          读取模拟磁盘文件
        </Button>
      </div>
      <Alert role="status" type="info">
        {{
          session.conflictResolved ||
          (session.backup ? '模拟草稿备份已保留。' : '没有版本会被自动覆盖，请对照后选择。')
        }}
      </Alert>
    </section>
    <footer class="mock-statusbar">
      <span>
        <i />
        已同步 · 模拟草稿
      </span>
      <span>UTF-8 · GCC 13.3 / C++17</span>
    </footer>
  </div>
</template>
<style scoped>
.mock-workspace {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  background: var(--ui-page);
  color: var(--ui-ink);
  min-width: 1100px;
  pointer-events: auto;
}
.mock-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  height: 68px;
  padding: 8px 20px;
  flex-shrink: 0;
  border-bottom: 1px solid var(--ui-line);
}
.mock-exercise {
  position: relative;
  margin-right: auto;
  min-width: 200px;
}
.mock-class-name {
  color: var(--ui-muted);
  font-size: 12px;
}
.mock-exercise-trigger {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
  font-weight: 600;
}
.mock-exercise-options {
  position: absolute;
  top: 54px;
  left: -8px;
  width: 310px;
  z-index: 3;
  padding: 8px;
  background: var(--ui-page);
  border: 1px solid var(--ui-line);
  border-radius: 8px;
  box-shadow: 0 8px 30px var(--ui-shadow);
}
.mock-exercise-options > span {
  display: block;
  color: var(--ui-muted);
  font-size: 12px;
  padding: 6px 10px;
}
.mock-exercise-options button {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 10px;
  border-radius: 4px;
  text-align: left;
}
.mock-exercise-options button[aria-pressed='true'] {
  color: var(--ui-action);
  background: var(--ui-selection);
}
.mock-exercise-options small {
  display: block;
  font-size: 12px;
  color: var(--ui-muted);
  margin-top: 2px;
}
.mock-saved {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--ui-success);
  font-size: 12px;
}
.mock-actions {
  display: flex;
  gap: 8px;
}
.mock-layout {
  display: grid;
  grid-template-columns: 34% minmax(0, 1fr);
  flex: 1;
  min-height: 0;
}
.mock-problem {
  border-right: 6px solid var(--ui-canvas);
  overflow: auto;
}
.mock-tabs {
  display: flex;
  align-items: center;
  gap: 22px;
  padding: 0 20px;
  height: 44px;
  border-bottom: 1px solid var(--ui-line);
  font-size: 14px;
}
.mock-tabs span {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--ui-muted);
}
.mock-tabs .active {
  color: var(--ui-action);
}
.mock-problem-copy {
  padding: 22px;
}
.mock-eyebrow,
.mock-area-label {
  font-size: 12px;
  color: var(--ui-muted);
}
.mock-problem h1 {
  font-size: 26px;
  font-weight: 650;
  margin: 12px 0;
}
.mock-limits {
  display: flex;
  gap: 16px;
  font-size: 12px;
  color: var(--ui-secondary);
  margin-bottom: 24px;
}
.mock-problem p {
  font-size: 14px;
  line-height: 1.9;
  color: var(--ui-secondary);
}
.mock-problem h3 {
  font-size: 15px;
  font-weight: 600;
  margin: 24px 0 8px;
}
.mock-sample {
  border: 1px solid var(--ui-line);
  border-radius: 5px;
  margin-top: 12px;
}
.mock-sample > span {
  display: block;
  font-size: 12px;
  padding: 6px 10px;
  border-bottom: 1px solid var(--ui-line);
  color: var(--ui-muted);
}
.mock-sample pre {
  padding: 12px;
  font-size: 14px;
}
.mock-main {
  display: grid;
  grid-template-rows: minmax(0, 60fr) minmax(280px, 40fr);
  min-height: 0;
}
.mock-editor {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}
.mock-section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 42px;
  padding: 0 16px;
  border-bottom: 1px solid var(--ui-line);
  font-size: 13px;
  gap: 8px;
}
.mock-section-heading > span,
.mock-tools {
  display: flex;
  align-items: center;
  gap: 10px;
}
.mock-section-heading small {
  color: var(--ui-muted);
  font-size: 12px;
}
.mock-section-heading i {
  height: 6px;
  width: 6px;
  border-radius: 50%;
  background: var(--ui-faint);
}
.mock-tools {
  color: var(--ui-muted);
}
.mock-area-label {
  margin: 12px 18px 6px;
}
.mock-code {
  flex: 1;
  overflow: auto;
  padding: 6px 0 12px;
  font:
    14px/1.85 'SFMono-Regular',
    Consolas,
    monospace;
}
.mock-code-line {
  display: flex;
  min-height: 26px;
  white-space: pre;
}
.mock-line-number {
  width: 44px;
  padding-right: 12px;
  text-align: right;
  color: var(--ui-faint);
  flex-shrink: 0;
  user-select: none;
}
.mock-code-line code {
  color: var(--ui-code-fg);
}
.mock-error-line {
  background: var(--ui-error-bg);
}
.mock-error-line code {
  text-decoration: underline wavy var(--ui-error);
  text-underline-offset: 4px;
}
.mock-code-error {
  align-self: center;
  color: var(--ui-error);
  font: 12px/1.5 system-ui;
  padding: 0 12px;
}
.mock-editor-footnote {
  display: flex;
  justify-content: space-between;
  color: var(--ui-muted);
  font-size: 12px;
  padding: 9px 16px;
  border-top: 1px solid var(--ui-line);
}
.mock-io {
  display: grid;
  grid-template-columns: 30% minmax(0, 1fr);
  border-top: 6px solid var(--ui-canvas);
  min-height: 0;
}
.mock-input {
  border-right: 6px solid var(--ui-canvas);
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: auto;
}
.mock-text-button {
  color: var(--ui-action);
  font-size: 12px;
  white-space: nowrap;
}
.mock-input textarea {
  flex: 1;
  min-height: 68px;
  resize: none;
  border: 0;
  border-radius: 0;
  background: var(--ui-page);
  padding: 14px;
  font: 14px/1.8 monospace;
}
.mock-interactive-label {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  font-size: 12px;
  border-top: 1px solid var(--ui-line);
}
.mock-batch-run {
  margin: 0 12px 12px;
}
.mock-output {
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.mock-output-content {
  flex: 1;
  padding: 12px 16px;
  overflow: auto;
  min-height: 0;
}
.mock-output-content pre {
  white-space: pre-wrap;
  font:
    13px/1.8 'SFMono-Regular',
    Consolas,
    monospace;
  margin-top: 12px;
}
.mock-diagnostic-log {
  color: var(--ui-error);
}
.mock-runtime {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px;
  border-top: 1px solid var(--ui-line);
  flex-wrap: wrap;
}
.mock-runtime input {
  flex: 1;
  min-width: 90px;
  width: 0;
  font-size: 13px;
}
.mock-input-transcript {
  flex: 1;
  padding: 12px;
}
.mock-input-transcript span,
.mock-input-transcript small {
  font-size: 12px;
  color: var(--ui-muted);
}
.mock-input-transcript pre {
  font: 14px/1.8 monospace;
  margin: 10px 0;
}
.mock-floating-panel {
  position: absolute;
  top: 126px;
  right: 28px;
  width: 590px;
  border: 1px solid var(--ui-line-strong);
  border-radius: 10px;
  padding: 22px;
  box-shadow: 0 14px 50px var(--ui-shadow);
  background: var(--ui-page);
}
.mock-panel-heading {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  margin-bottom: 20px;
}
.mock-panel-heading > svg {
  color: var(--ui-action);
  margin-top: 4px;
}
.mock-panel-heading h2 {
  font-size: 18px;
  font-weight: 600;
}
.mock-panel-heading p {
  color: var(--ui-muted);
  font-size: 12px;
  margin-top: 6px;
}
.mock-directory-path {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px;
  background: var(--ui-surface);
  border: 1px solid var(--ui-line);
  border-radius: 6px;
  font-size: 13px;
}
.mock-sync-flow {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px;
  margin: 16px 0;
  border: 1px solid var(--ui-blue-line);
  border-radius: 5px;
  background: var(--ui-selection);
  font-size: 13px;
}
.mock-sync-flow strong {
  color: var(--ui-action);
}
.mock-directory dl > div {
  display: grid;
  grid-template-columns: 125px 1fr;
  gap: 12px;
  font-size: 13px;
  line-height: 1.8;
  padding: 10px 0;
  border-bottom: 1px solid var(--ui-line);
}
.mock-directory dt {
  font-weight: 600;
}
.mock-directory dd {
  color: var(--ui-secondary);
}
.mock-conflict {
  width: 670px;
}
.mock-versions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.mock-versions > div {
  min-width: 0;
}
.mock-versions h3 {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 10px;
}
.mock-versions pre {
  font: 11px/1.8 monospace;
  overflow: auto;
  background: var(--ui-surface);
  border: 1px solid var(--ui-line);
  padding: 10px;
  height: 190px;
  border-radius: 5px;
}
.mock-conflict-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin: 18px 0 12px;
}
.mock-history {
  padding: 20px;
}
.mock-history article {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
  padding: 16px;
  border: 1px solid var(--ui-line);
  border-radius: 6px;
  margin: 16px 0;
  font-size: 14px;
}
.mock-history .selected {
  background: var(--ui-selection);
  border-color: var(--ui-blue-line);
}
.mock-history small {
  color: var(--ui-muted);
}
.mock-statusbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 28px;
  border-top: 1px solid var(--ui-line);
  color: var(--ui-muted);
  font-size: 11px;
  padding: 0 14px;
  flex-shrink: 0;
}
.mock-statusbar i {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--ui-success);
  margin-right: 6px;
}
</style>
