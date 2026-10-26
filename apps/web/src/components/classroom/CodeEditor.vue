<script setup lang="ts">
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type * as Monaco from 'monaco-editor'
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
  }>(),
  { readonly: false, fontSize: 16, filename: 'source.cpp' },
)
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const container = ref<HTMLElement>()
const editorError = ref(''),
  editorLoading = ref(true)
let editor: Monaco.editor.IStandaloneCodeEditor | undefined
let disposed = false
let monacoApi: typeof import('monaco-editor/esm/vs/editor/editor.api.js') | undefined
const languageEnabled = ref(false)
const languageStatus = ref<ClangdStatus>()
let languageConnection: BrowserClangd | undefined
let languageController: AbortController | undefined
let languageGeneration = 0
function stopLanguageService() {
  languageGeneration++
  languageController?.abort()
  languageController = undefined
  languageConnection?.dispose()
  languageConnection = undefined
  languageStatus.value = undefined
}
async function startLanguageService() {
  stopLanguageService()
  const model = editor?.getModel()
  if (!model || !monacoApi || !languageEnabled.value || props.readonly || disposed) return
  const generation = languageGeneration
  const controller = new AbortController()
  languageController = controller
  languageStatus.value = {
    state: 'loading',
    errors: 0,
    warnings: 0,
    message: '正在准备浏览器 clangd…',
  }
  const timer = setTimeout(
    () => controller.abort(new Error('语言服务加载超时，请检查静态资源后重试')),
    120000,
  )
  try {
    const { attachBrowserClangd } = await import('@/lib/browser-clangd')
    if (generation !== languageGeneration || disposed) return
    const connection = await attachBrowserClangd(
      monacoApi,
      model,
      (status) => {
        if (generation === languageGeneration && !disposed) languageStatus.value = status
      },
      controller.signal,
    )
    if (generation === languageGeneration && !disposed) languageConnection = connection
    else connection.dispose()
  } catch (error) {
    if (generation === languageGeneration && !disposed)
      languageStatus.value = {
        state: 'error',
        errors: 0,
        warnings: 0,
        message: error instanceof Error ? error.message : 'clangd 加载失败，请重试',
      }
  } finally {
    clearTimeout(timer)
  }
}
function createModel() {
  const filename = validSourceFilename(props.filename) ? props.filename : 'source.cpp'
  return monacoApi!.editor.createModel(
    props.modelValue,
    'cpp',
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
    currentEditor.onDidChangeModelContent(() => emit('update:modelValue', currentEditor.getValue()))
    markError()
    if (languageEnabled.value) void startLanguageService()
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
      editor.setValue(value)
      markError()
    }
  },
)
watch(resolvedTheme, (theme) => {
  monacoApi?.editor.setTheme(theme === 'dark' ? 'classroom-monokai' : 'classroom-light')
})
watch(languageEnabled, (enabled) => {
  if (enabled) void startLanguageService()
  else stopLanguageService()
})
watch(
  () => props.filename,
  () => {
    if (!editor || !monacoApi || disposed) return
    stopLanguageService()
    const previous = editor.getModel()
    errorDecoration?.clear()
    editor.setModel(null)
    previous?.dispose()
    editor.setModel(createModel())
    markError()
    if (languageEnabled.value) void startLanguageService()
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
      languageEnabled.value = false
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

      <template #actions
        ><Button
          variant="plain"
          class="text-button"
          data-guide="editor-reload"
          @click="initializeEditor"
          >重新加载编辑器</Button
        ></template
      >
    </Alert>
    <Alert v-else-if="editorLoading" class="editor-resource-alert" role="status" type="info">
      正在加载代码编辑器…
    </Alert>
    <div
      ref="container"
      class="code-editor"
      :aria-label="readonly ? 'C++ 代码，只读' : 'C++ 代码编辑器'"
    />
    <div v-if="!readonly" class="editor-language-bar">
      <label
        class="editor-language-toggle"
        title="仅为当前编辑器启用补全和诊断。首次开启需加载约 75 MB 的本地语言服务资源。"
      >
        <Switch v-model="languageEnabled" aria-label="clangd 语言服务" /><span>clangd</span>
      </label>
      <RefreshCw
        v-if="languageStatus?.state === 'loading' || languageStatus?.state === 'analyzing'"
        :size="12"
        class="probe-spinning"
      /><span
        class="editor-language-message"
        :class="languageStatus?.state"
        role="status"
        :title="languageStatus?.message"
        >{{
          !languageEnabled
            ? '补全与诊断已关闭'
            : languageStatus?.state === 'ready'
              ? `浏览器分析 · ${languageStatus.errors} 个错误 / ${languageStatus.warnings} 个警告`
              : (languageStatus?.message ?? '正在准备…')
        }}</span
      ><Button
        v-if="languageStatus?.state === 'error'"
        variant="plain"
        type="button"
        class="text-button"
        data-guide="language-retry"
        @click="startLanguageService"
      >
        重试</Button
      ><span v-if="languageEnabled" class="editor-local-indicator">浏览器内分析</span>
    </div>
  </div>
</template>
