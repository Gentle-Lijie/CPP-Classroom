<script setup lang="ts">
import { Alert } from '@/components/ui/alert'
import PythonBeta from '@/components/classroom/PythonBeta.vue'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { computed, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'
import type * as Monaco from 'monaco-editor'
import type { SourceLanguage } from '@classroom/contracts'
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import { RefreshCw } from '@lucide/vue'
import { resolvedTheme } from '@/lib/theme'
import { lightEditorTheme, monokaiEditorTheme } from '@/lib/editor-themes'
import { validSourceFilename } from '@/lib/source-file'
import type { BrowserClangd, ClangdStatus } from '@/lib/browser-clangd'
const props = withDefaults(
  defineProps<{
    modelValue: string
    readonly?: boolean
    fontSize?: number
    errorLine?: number
    filename?: string
    language?: SourceLanguage
  }>(),
  { readonly: false, fontSize: 16, filename: 'source.cpp', language: 'cpp' },
)
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const container = ref<HTMLElement>()
const formatError = ref('')
const editorError = ref(''),
  editorLoading = ref(true)
let editor: Monaco.editor.IStandaloneCodeEditor | undefined
let disposed = false
let applyingValue = false
let monacoApi: typeof import('monaco-editor/esm/vs/editor/editor.api.js') | undefined
const languageEnabled = ref(false)
const languagePending = ref(false)
const languageStatusId = useId()
const languageStatus = ref<ClangdStatus>()
const languageLabel = computed(() => (props.language === 'python' ? 'Python' : 'C++'))
const languageServiceLabel = computed(() => (props.language === 'python' ? 'Pyright' : 'clangd'))
let languageConnection: BrowserClangd | undefined
let languageController: AbortController | undefined
let languageGeneration = 0
function stopLanguageService() {
  languageGeneration++
  languageController?.abort()
  languageController = undefined
  languageConnection?.dispose()
  languageConnection = undefined
  languageEnabled.value = false
  languagePending.value = false
  languageStatus.value = undefined
}
async function startLanguageService() {
  if (languagePending.value) return
  stopLanguageService()
  const model = editor?.getModel()
  if (!model || !monacoApi || props.readonly || disposed) return
  const generation = languageGeneration
  const controller = new AbortController()
  languageController = controller
  languagePending.value = true
  languageStatus.value = {
    state: 'loading',
    errors: 0,
    warnings: 0,
    message: `正在准备浏览器 ${languageServiceLabel.value}…`,
  }
  function fail(error: unknown) {
    if (generation !== languageGeneration || disposed) return
    languageEnabled.value = false
    languagePending.value = false
    languageStatus.value = {
      state: 'error',
      errors: 0,
      warnings: 0,
      message: error instanceof Error ? error.message : '语言服务加载失败，请重试',
    }
  }
  const aborted = () => fail(controller.signal.reason)
  controller.signal.addEventListener('abort', aborted, { once: true })
  const timer = setTimeout(
    () => controller.abort(new Error('语言服务加载超时，请检查网络后重试')),
    120000,
  )
  try {
    const attach =
      props.language === 'python'
        ? (await import('@/lib/browser-pyright')).attachBrowserPyright
        : (await import('@/lib/browser-clangd')).attachBrowserClangd
    if (generation !== languageGeneration || disposed || controller.signal.aborted) return
    const connection = await attach(
      monacoApi,
      model,
      (status) => {
        if (generation !== languageGeneration || disposed || controller.signal.aborted) return
        languageStatus.value = status
        if (status.state === 'error' || status.state === 'unsupported') {
          languageEnabled.value = false
          languagePending.value = false
        }
      },
      controller.signal,
    )
    if (
      generation === languageGeneration &&
      !disposed &&
      !controller.signal.aborted &&
      languageStatus.value?.state !== 'error' &&
      languageStatus.value?.state !== 'unsupported'
    ) {
      languageConnection = connection
      languageEnabled.value = true
    } else connection.dispose()
  } catch (error) {
    fail(error)
  } finally {
    clearTimeout(timer)
    controller.signal.removeEventListener('abort', aborted)
    if (generation === languageGeneration && !disposed) languagePending.value = false
  }
}
function toggleLanguageService(enabled: boolean) {
  if (enabled) void startLanguageService()
  else stopLanguageService()
}
function createModel() {
  const filename = validSourceFilename(props.filename, props.language)
    ? props.filename
    : props.language === 'python'
      ? 'source.py'
      : 'source.cpp'
  return monacoApi!.editor.createModel(
    props.modelValue,
    props.language,
    monacoApi!.Uri.from({ scheme: 'file', path: `/lsp/${crypto.randomUUID()}/${filename}` }),
  )
}
let errorDecoration: Monaco.editor.IEditorDecorationsCollection | undefined
function markError() {
  if (!editor) return
  errorDecoration?.clear()
  if (props.errorLine) {
    errorDecoration = editor.createDecorationsCollection([
      {
        range: {
          startLineNumber: props.errorLine,
          startColumn: 1,
          endLineNumber: props.errorLine,
          endColumn: 1,
        },
        options: {
          isWholeLine: true,
          className: 'diagnostic-line',
          linesDecorationsClassName: 'diagnostic-line-marker',
        },
      },
    ])
    editor.revealLineInCenter(props.errorLine)
  }
}
async function initializeEditor() {
  editorError.value = ''
  editorLoading.value = true
  try {
    const monaco = await import('monaco-editor/esm/vs/editor/editor.api.js')
    await import('monaco-editor/esm/vs/basic-languages/cpp/cpp.contribution.js')
    await import('monaco-editor/esm/vs/basic-languages/python/python.contribution.js')
    await import('monaco-editor/esm/vs/editor/contrib/contextmenu/browser/contextmenu.js')
    await import('monaco-editor/esm/vs/editor/standalone/browser/quickAccess/standaloneCommandsQuickAccess.js')
    if (disposed || !container.value) return
    monacoApi = monaco
    self.MonacoEnvironment = { getWorker: () => new EditorWorker() }
    monaco.editor.defineTheme('classroom-light', lightEditorTheme)
    monaco.editor.defineTheme('classroom-monokai', monokaiEditorTheme)
    editor = monaco.editor.create(container.value, {
      model: createModel(),
      theme: resolvedTheme.value === 'dark' ? 'classroom-monokai' : 'classroom-light',
      readOnly: props.readonly,
      fontSize: props.fontSize,
      fontFamily: "'SFMono-Regular', Consolas, 'Liberation Mono', monospace",
      minimap: { enabled: false },
      automaticLayout: true,
      scrollBeyondLastLine: false,
      lineNumbersMinChars: 3,
      padding: { top: 12, bottom: 12 },
      tabSize: 4,
      insertSpaces: true,
      detectIndentation: props.language !== 'python',
      autoIndent: 'full',
      bracketPairColorization: { enabled: false },
      // Avoid async WordHighlighter requests outliving models during rapid exercise switches.
      occurrencesHighlight: 'off',
      selectionHighlight: false,
      renderLineHighlight: 'line',
      overviewRulerLanes: 0,
      hideCursorInOverviewRuler: true,
      lineHeight: Math.round(props.fontSize * 1.75),
      fixedOverflowWidgets: true,
    })
    const currentEditor = editor
    currentEditor.addAction({
      id: 'classroom.format-document',
      label: '格式化文档',
      precondition: '!editorReadonly',
      contextMenuGroupId: '1_modification',
      contextMenuOrder: 1.5,
      keybindings: [monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.KeyF],
      run: async () => {
        const model = currentEditor.getModel()
        if (!model || props.readonly) return
        const version = model.getVersionId()
        const source = model.getValue()
        const language = props.language
        formatError.value = ''
        try {
          const formatted = await (
            await import('@/lib/format-source')
          ).formatSource(source, language, props.filename)
          if (
            disposed ||
            props.readonly ||
            currentEditor.getModel() !== model ||
            model.getVersionId() !== version
          ) {
            formatError.value = '格式化期间代码已更改，请重试。'
            return
          }
          if (formatted !== source) {
            currentEditor.pushUndoStop()
            currentEditor.executeEdits('classroom.format-document', [
              { range: model.getFullModelRange(), text: formatted },
            ])
            currentEditor.pushUndoStop()
          }
        } catch (error) {
          if (!disposed)
            formatError.value = `格式化失败：${error instanceof Error ? error.message : '请重试'}`
        }
      },
    })
    currentEditor.onDidChangeModelContent(() => {
      if (!applyingValue) emit('update:modelValue', currentEditor.getValue())
    })
    markError()
  } catch (error) {
    editorError.value = error instanceof Error ? error.message : '编辑器资源加载失败'
    const failedModel = editor?.getModel()
    editor?.setModel(null)
    editor?.dispose()
    failedModel?.dispose()
    editor = undefined
  } finally {
    editorLoading.value = false
  }
}
onMounted(() => void initializeEditor())
watch(
  () => props.modelValue,
  (value) => {
    if (editor && editor.getValue() !== value) {
      applyingValue = true
      try {
        editor.setValue(value)
      } finally {
        applyingValue = false
      }
      markError()
    }
  },
)
watch(resolvedTheme, (theme) => {
  monacoApi?.editor.setTheme(theme === 'dark' ? 'classroom-monokai' : 'classroom-light')
})
watch(
  () => [props.filename, props.language],
  () => {
    if (!editor || !monacoApi || disposed) return
    const restartLanguage = languageEnabled.value || languagePending.value
    stopLanguageService()
    const previous = editor.getModel()
    errorDecoration?.clear()
    editor.setModel(null)
    previous?.dispose()
    editor.setModel(createModel())
    editor.updateOptions({ detectIndentation: props.language !== 'python', insertSpaces: true })
    editor.getModel()?.updateOptions({ tabSize: 4, insertSpaces: true })
    markError()
    if (restartLanguage) void startLanguageService()
  },
)
watch(() => props.errorLine, markError)
watch(
  () => props.fontSize,
  (fontSize) => editor?.updateOptions({ fontSize, lineHeight: Math.round(fontSize * 1.75) }),
)
watch(
  () => props.readonly,
  (readOnly) => {
    editor?.updateOptions({ readOnly })
    if (readOnly) {
      stopLanguageService()
    }
  },
)
onBeforeUnmount(() => {
  disposed = true
  stopLanguageService()
  const model = editor?.getModel()
  editor?.setModel(null)
  editor?.dispose()
  model?.dispose()
})
</script>
<template>
  <div class="code-editor-shell">
    <Alert v-if="editorError" class="editor-resource-alert" role="alert" type="error">
      <strong>代码编辑器加载失败</strong>
      <p>{{ editorError }}</p>

      <p>草稿内容仍保留在页面，重试不会清空。</p>

      <template #actions>
        <Button
          variant="plain"
          class="text-button"
          data-guide="editor-reload"
          @click="initializeEditor">
          重新加载编辑器
        </Button>
      </template>
    </Alert>
    <Alert v-else-if="editorLoading" class="editor-resource-alert" role="status" type="info">
      正在加载代码编辑器…
    </Alert>
    <div
      ref="container"
      class="code-editor"
      :aria-label="readonly ? `${languageLabel} 代码，只读` : `${languageLabel} 代码编辑器`" />
    <Alert v-if="formatError" role="alert" type="error">{{ formatError }}</Alert>
    <div v-if="!readonly" class="editor-language-bar">
      <label
        class="editor-language-toggle"
        title="仅为当前编辑器启用补全和诊断。首次开启需下载语言服务资源，分析在浏览器内完成。">
        <Switch
          :model-value="languageEnabled"
          :disabled="editorLoading || !!editorError || languagePending"
          :data-disabled-reason="
            editorLoading
              ? '编辑器正在加载，请稍候'
              : editorError
                ? '编辑器加载失败，请重试后开启语言服务'
                : '语言服务正在切换，请稍候'
          "
          :aria-busy="languagePending"
          :aria-label="`${languageServiceLabel} 语言服务`"
          :aria-describedby="languageStatusId"
          @update:model-value="toggleLanguageService" />
        <span>{{ languageServiceLabel }}</span>
        <PythonBeta v-if="language === 'python'" />
      </label>
      <RefreshCw
        v-if="languageStatus?.state === 'loading' || languageStatus?.state === 'analyzing'"
        :size="12"
        class="probe-spinning" />
      <span
        :id="languageStatusId"
        class="editor-language-message"
        :class="languageStatus?.state"
        role="status"
        :title="languageStatus?.message">
        {{
          languagePending
            ? '正在启动 · ' + languageStatus?.message
            : languageStatus?.state === 'ready'
              ? `浏览器分析 · ${languageStatus.errors} 个错误 / ${languageStatus.warnings} 个警告`
              : (languageStatus?.message ?? '补全与诊断已关闭')
        }}
      </span>
      <Button
        v-if="languageStatus?.state === 'error'"
        variant="plain"
        type="button"
        class="text-button"
        data-guide="language-retry"
        @click="startLanguageService">
        重试
      </Button>
      <span v-if="languageEnabled" class="editor-local-indicator">浏览器内分析</span>
    </div>
  </div>
</template>
