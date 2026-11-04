<script setup lang="ts">
import CodeBlock from '@/components/classroom/CodeBlock.vue'
import { Alert } from '@/components/ui/alert'
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
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
const { t } = useI18n()
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
    ? t('guide.workspace.statusFailed')
    : props.scene === 'interactive' && !session.interactiveClosed
      ? t('guide.workspace.statusRunning')
      : t('guide.workspace.statusDone'),
)
function selectExercise(id: string) {
  session.exerciseId = id
  session.batchInput = exercise.value.input
  session.batchOutput = exercise.value.output + '\n'
}
function stopMockRunning() {
  session.interactiveClosed = true
  session.interactiveOutput += `${t('guide.workspace.programStopped')}\n`
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
  <div
    class="mock-workspace"
    data-student-guide="overview"
    :aria-label="t('guide.workspace.ariaLabel')">
    <Alert
      type="info"
      class="app-alert--banner"
      :icon="BookOpen"
      :title="t('guide.workspace.bannerTitle')">
      {{ t('guide.workspace.bannerBody') }}
    </Alert>
    <header class="mock-toolbar">
      <ArrowLeft :size="18" class="muted" />
      <div class="mock-exercise" data-student-guide="exercises">
        <span class="mock-class-name">{{ t('guide.workspace.className') }}</span>
        <Button
          variant="plain"
          class="mock-exercise-trigger"
          :aria-label="t('guide.workspace.switchExercise')"
          :aria-expanded="scene === 'exercises'">
          <BookOpen :size="16" />
          {{ exercise.title }}
          <ChevronDown :size="14" />
        </Button>
        <div v-if="scene === 'exercises'" class="mock-exercise-options" data-spotlight-extent>
          <span>{{ t('guide.workspace.selectExercise') }}</span>
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
        {{ t('guide.workspace.saved') }}
      </span>
      <Button variant="outline" size="sm">
        <FolderOpen />
        {{ t('guide.workspace.workdir') }}
      </Button>
      <div class="mock-actions" data-student-guide="actions">
        <Button variant="outline" size="sm" @click="session.helped = true">
          <Hand />
          {{ session.helped ? t('guide.workspace.helpSent') : t('guide.workspace.help') }}
        </Button>
        <Button variant="outline" size="sm" @click="session.submitted = true">
          <Send />
          {{ session.submitted ? t('guide.workspace.submitted') : t('guide.workspace.submit') }}
        </Button>
      </div>
      <Button size="sm" @click="runMockBatch(session)">
        <Play />
        {{ t('guide.workspace.run') }}
      </Button>
    </header>
    <div class="mock-layout">
      <aside class="mock-problem">
        <div class="mock-tabs">
          <span :class="{ active: scene !== 'history' }">
            <BookOpen :size="14" />
            {{ t('guide.workspace.tabProblem') }}
          </span>
          <span :class="{ active: scene === 'history' }">
            <History :size="14" />
            {{ t('guide.workspace.tabHistory') }}
          </span>
        </div>
        <div v-if="scene !== 'history'" class="mock-problem-copy">
          <span class="mock-eyebrow">
            {{
              t('guide.workspace.problemArea', {
                index: session.exerciseId === 'sum' ? '1' : '2',
              })
            }}
          </span>
          <h1>{{ exercise.title }}</h1>
          <div class="mock-limits">
            2000 ms
            <span>256 MiB</span>
          </div>
          <p>
            {{
              scene === 'interactive' ? t('guide.workspace.interactiveDesc') : exercise.description
            }}
          </p>
          <h3>{{ t('guide.workspace.inputTitle') }}</h3>
          <p>
            {{
              session.exerciseId === 'sum'
                ? t('guide.workspace.inputHintSum')
                : t('guide.workspace.inputHintName')
            }}
          </p>
          <h3>{{ t('guide.workspace.outputTitle') }}</h3>
          <p>
            {{
              session.exerciseId === 'sum'
                ? t('guide.workspace.outputHintSum')
                : t('guide.workspace.outputHintName')
            }}
          </p>
          <h3>{{ t('guide.workspace.sample') }}</h3>
          <div class="mock-sample">
            <CodeBlock
              :source="exercise.input"
              language="text"
              :label="t('guide.workspace.sampleInput')" />
          </div>
          <div class="mock-sample">
            <CodeBlock
              :source="exercise.output"
              language="text"
              :label="t('guide.workspace.sampleOutput')" />
          </div>
          <Alert type="info">{{ t('guide.workspace.teacherVisible') }}</Alert>
        </div>
        <div v-else class="mock-history" data-student-guide="history">
          <span class="mock-eyebrow">{{ t('guide.workspace.historyTitle') }}</span>
          <article class="selected">
            <span class="status positive">{{ t('guide.workspace.statusDone') }}</span>
            <strong>{{ t('guide.workspace.snapshotBTitle') }}</strong>
            <small>{{ t('guide.workspace.snapshotBMeta') }}</small>
          </article>
          <article>
            <span class="status red">{{ t('guide.workspace.statusFailed') }}</span>
            <strong>{{ t('guide.workspace.snapshotATitle') }}</strong>
            <small>{{ t('guide.workspace.snapshotAMeta') }}</small>
          </article>
          <p>{{ t('guide.workspace.historyNote') }}</p>
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
          <span class="mock-area-label">{{ t('guide.workspace.areaCode') }}</span>
          <div class="mock-code">
            <div
              v-for="(text, index) in code.split('\n')"
              :key="index"
              class="mock-code-line"
              :class="{ 'mock-error-line': errorShown && index === 4 }">
              <span class="mock-line-number">{{ index + 1 }}</span>
              <code>{{ text || ' ' }}</code>
              <span v-if="errorShown && index === 4" class="mock-code-error">
                {{ t('guide.workspace.missingSemicolon') }}
              </span>
            </div>
          </div>
          <div class="mock-editor-footnote">
            {{
              errorShown ? t('guide.workspace.footnoteDiag') : t('guide.workspace.footnoteNormal')
            }}
            <span>{{ t('guide.workspace.autosave') }}</span>
          </div>
        </section>
        <div class="mock-io" data-student-guide="io">
          <section class="mock-input">
            <div class="mock-section-heading">
              <span>
                {{ t('guide.workspace.areaInput') }}
                <small>stdin</small>
              </span>
              <Button
                variant="plain"
                class="mock-text-button"
                @click="session.batchInput = exercise.input">
                {{ t('guide.workspace.fillSample') }}
              </Button>
            </div>
            <Textarea
              v-if="scene !== 'interactive'"
              v-model="session.batchInput"
              :aria-label="t('guide.workspace.mockStdin')"
              spellcheck="false" />
            <div v-else class="mock-input-transcript">
              <span>{{ t('guide.workspace.sentInput') }}</span>
              <CodeBlock
                :source="session.interactiveInput"
                language="text"
                :label="t('guide.workspace.sentInputLabel')" />
              <small>{{ t('guide.workspace.newlineNote') }}</small>
            </div>
            <label class="mock-interactive-label">
              <Checkbox
                :model-value="scene === 'interactive'"
                :data-disabled-reason="t('guide.workspace.runtimeReason')"
                disabled />
              {{ t('guide.workspace.runtimeInput') }}
            </label>
            <Button
              v-if="scene === 'batch'"
              class="mock-batch-run"
              size="sm"
              @click="runMockBatch(session)">
              <Play />
              {{ t('guide.workspace.mockRun') }}
            </Button>
            <Alert v-if="session.batchError && scene === 'batch'" role="alert" type="error">
              {{ session.batchError }}
            </Alert>
          </section>
          <section class="mock-output">
            <div class="mock-section-heading">
              <span>
                <component :is="errorShown ? CircleAlert : Terminal" :size="14" />
                {{
                  errorShown ? t('guide.workspace.compileDiag') : t('guide.workspace.areaOutput')
                }}
              </span>
              <span v-if="errorShown" class="status red">{{ t('guide.workspace.failed') }}</span>
              <small v-else>stdout</small>
            </div>
            <div class="mock-output-content">
              <span class="status" :class="errorShown ? 'red' : 'positive'">
                {{ resultStatus }}
              </span>
              <CodeBlock
                :class="{ 'mock-diagnostic-log': errorShown }"
                :source="result"
                language="text"
                :label="t('guide.workspace.outputLabel')" />
              <Alert
                v-if="scene === 'diagnostics'"
                :type="session.errorFixed ? 'success' : 'warning'"
                :title="
                  session.errorFixed
                    ? t('guide.workspace.fixedTitle')
                    : t('guide.workspace.fixTitle')
                ">
                {{
                  session.errorFixed ? t('guide.workspace.fixedBody') : t('guide.workspace.fixBody')
                }}
                <template v-if="!session.errorFixed" #actions>
                  <Button size="sm" @click="session.errorFixed = true">
                    {{ t('guide.workspace.fixButton') }}
                  </Button>
                </template>
              </Alert>
            </div>
            <Form v-if="scene === 'interactive'" class="mock-runtime" @submit.prevent="sendLine">
              <Input
                v-model="line"
                :aria-label="t('guide.workspace.mockRuntimeInput')"
                :placeholder="t('guide.workspace.inputPlaceholder')"
                :disabled="session.interactiveClosed"
                :data-disabled-reason="t('guide.workspace.runEndedReason')" />
              <Button
                type="submit"
                size="sm"
                :disabled="session.interactiveClosed"
                :data-disabled-reason="t('guide.workspace.runEndedReason')">
                {{ t('guide.workspace.send') }}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                :disabled="session.interactiveClosed"
                :data-disabled-reason="t('guide.workspace.runEndedReason')"
                @click="closeMockInput(session)">
                EOF
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                :disabled="session.interactiveClosed"
                :data-disabled-reason="t('guide.workspace.runEndedReason')"
                @click="stopMockRunning">
                <Square :size="12" />
                {{ t('guide.workspace.stop') }}
              </Button>
            </Form>
            <Alert v-if="scene === 'interactive' && session.inputError" role="alert" type="error">
              {{ session.inputError }}
            </Alert>
            <Alert v-if="scene === 'interactive' && session.interactiveClosed" type="info">
              {{ t('guide.workspace.stdinClosed') }}
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
          <h2>{{ t('guide.workspace.dirTitle') }}</h2>
          <p>{{ t('guide.workspace.dirSubtitle') }}</p>
        </div>
      </div>
      <div class="mock-directory-path">
        <span>{{ t('guide.workspace.dirPath', { file: exercise.filename }) }}</span>
        <Button
          size="sm"
          :variant="session.directoryConnected ? 'outline' : 'default'"
          @click="session.directoryConnected = !session.directoryConnected">
          {{
            session.directoryConnected
              ? t('guide.workspace.disconnect')
              : t('guide.workspace.connect')
          }}
        </Button>
      </div>
      <Alert role="status" type="info">
        {{
          session.directoryConnected
            ? t('guide.workspace.dirConnected', { file: exercise.filename })
            : t('guide.workspace.dirNotConnected')
        }}
      </Alert>
      <div class="mock-sync-flow">
        <span>{{ t('guide.workspace.webEditor') }}</span>
        <strong>↔</strong>
        <span>{{ exercise.filename }}</span>
        <strong>↔</strong>
        <span>{{ t('guide.workspace.authorizedDir') }}</span>
      </div>
      <dl>
        <div>
          <dt>{{ t('guide.workspace.fromWeb') }}</dt>
          <dd>{{ t('guide.workspace.fromWebDesc') }}</dd>
        </div>
        <div>
          <dt>{{ t('guide.workspace.fromOthers') }}</dt>
          <dd>{{ t('guide.workspace.fromOthersDesc') }}</dd>
        </div>
        <div>
          <dt>{{ t('guide.workspace.reopen') }}</dt>
          <dd>{{ t('guide.workspace.reopenDesc') }}</dd>
        </div>
      </dl>
      <Alert type="info">
        {{ t('guide.workspace.dirBrowserNote') }}
      </Alert>
    </section>
    <section
      v-if="scene === 'conflict'"
      class="mock-floating-panel mock-conflict"
      data-student-guide="conflict">
      <div class="mock-panel-heading">
        <CircleAlert :size="20" />
        <div>
          <h2>{{ t('guide.workspace.conflictTitle') }}</h2>
          <p>{{ t('guide.workspace.conflictSubtitle', { file: exercise.filename }) }}</p>
        </div>
      </div>
      <div class="mock-versions">
        <div>
          <h3>{{ t('guide.workspace.editorDraft') }}</h3>
          <CodeBlock
            :source="session.editorCode"
            language="cpp"
            :label="t('guide.workspace.codeLabel')" />
        </div>
        <div>
          <h3>{{ t('guide.workspace.diskFile') }}</h3>
          <CodeBlock
            :source="session.diskCode"
            language="cpp"
            :label="t('guide.workspace.codeLabel')" />
        </div>
      </div>
      <div class="mock-conflict-actions">
        <Button variant="outline" size="sm" @click="session.backup = session.editorCode">
          {{ t('guide.workspace.keepBackup') }}
        </Button>
        <Button variant="outline" size="sm" @click="resolveMockFileConflict(session, 'editor')">
          {{ t('guide.workspace.overwriteDisk') }}
        </Button>
        <Button size="sm" @click="resolveMockFileConflict(session, 'disk')">
          {{ t('guide.workspace.readDisk') }}
        </Button>
      </div>
      <Alert role="status" type="info">
        {{
          session.conflictResolved ||
          (session.backup ? t('guide.workspace.backupKept') : t('guide.workspace.noAutoOverwrite'))
        }}
      </Alert>
    </section>
    <footer class="mock-statusbar">
      <span>
        <i />
        {{ t('guide.workspace.statusSynced') }}
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
