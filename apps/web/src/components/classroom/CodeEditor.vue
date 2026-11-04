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
import { t } from '@/i18n'
import { resolvedTheme } from '@/lib/theme'
import { lightEditorTheme, monokaiEditorTheme } from '@/lib/editor-themes'
import { validSourceFilename } from '@/lib/source-file'
import {
  languageServicePreferred,
  setLanguageServicePreferred,
} from '@/lib/language-service-preference'
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
const languagePreferred = ref(languageServicePreferred(props.language))
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
    message: t('runner.editor.preparingService', { service: languageServiceLabel.value }),
  }
  function fail(error: unknown) {
    if (generation !== languageGeneration || disposed) return
    languageEnabled.value = false
    languagePending.value = false
    languageStatus.value = {
      state: 'error',
      errors: 0,
      warnings: 0,
      message: error instanceof Error ? error.message : t('runner.editor.serviceLoadFailed'),
    }
  }
  const aborted = () => fail(controller.signal.reason)
  controller.signal.addEventListener('abort', aborted, { once: true })
  const timer = setTimeout(
    () => controller.abort(new Error(t('runner.editor.serviceTimeout'))),
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
  languagePreferred.value = enabled
  setLanguageServicePreferred(props.language, enabled)
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
      label: t('runner.editor.formatAction'),
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
            formatError.value = t('runner.editor.formatChanged')
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
            formatError.value =
              t('runner.editor.formatFailedPrefix') +
              (error instanceof Error ? error.message : t('runner.editor.formatRetry'))
        }
      },
    })
    currentEditor.onDidChangeModelContent(() => {
      if (!applyingValue) emit('update:modelValue', currentEditor.getValue())
    })
    markError()
    if (!props.readonly && languagePreferred.value) void startLanguageService()
  } catch (error) {
    editorError.value = error instanceof Error ? error.message : t('runner.editor.loadFailed')
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
  () => [props.filename, props.language] as const,
  ([, language], [, previousLanguage]) => {
    if (language !== previousLanguage) languagePreferred.value = languageServicePreferred(language)
    if (!editor || !monacoApi || disposed) return
    stopLanguageService()
    const previous = editor.getModel()
    errorDecoration?.clear()
    editor.setModel(null)
    previous?.dispose()
    editor.setModel(createModel())
    editor.updateOptions({ detectIndentation: props.language !== 'python', insertSpaces: true })
    editor.getModel()?.updateOptions({ tabSize: 4, insertSpaces: true })
    markError()
    if (!props.readonly && languagePreferred.value) void startLanguageService()
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
    } else if (languagePreferred.value) void startLanguageService()
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
      <strong>{{ t('runner.editor.failedTitle') }}</strong>
      <p>{{ editorError }}</p>

      <p>{{ t('runner.editor.draftKept') }}</p>

      <template #actions>
        <Button
          variant="plain"
          class="text-button"
          data-guide="editor-reload"
          @click="initializeEditor">
          {{ t('runner.editor.reload') }}
        </Button>
      </template>
    </Alert>
    <Alert v-else-if="editorLoading" class="editor-resource-alert" role="status" type="info">
      {{ t('runner.editor.loading') }}
    </Alert>
    <div
      ref="container"
      class="code-editor"
      :aria-label="
        readonly
          ? t('runner.editor.codeReadonly', { language: languageLabel })
          : t('runner.editor.codeEditor', { language: languageLabel })
      " />
    <Alert v-if="formatError" role="alert" type="error">{{ formatError }}</Alert>
    <div v-if="!readonly" class="editor-language-bar">
      <label class="editor-language-toggle" :title="t('runner.editor.languageToggleTitle')">
        <Switch
          :model-value="languagePreferred"
          :disabled="editorLoading || !!editorError"
          :data-disabled-reason="
            editorLoading
              ? t('runner.editor.languageDisabledLoading')
              : t('runner.editor.languageDisabledError')
          "
          :aria-busy="languagePending"
          :aria-label="t('runner.editor.languageServiceAria', { service: languageServiceLabel })"
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
            ? t('runner.editor.starting', { message: languageStatus?.message })
            : languageStatus?.state === 'ready'
              ? t('runner.editor.ready', {
                  errors: languageStatus.errors,
                  warnings: languageStatus.warnings,
                })
              : (languageStatus?.message ?? t('runner.editor.serviceOff'))
        }}
      </span>
      <Button
        v-if="languageStatus?.state === 'error'"
        variant="plain"
        type="button"
        class="text-button"
        data-guide="language-retry"
        @click="startLanguageService">
        {{ t('common.retry') }}
      </Button>
      <span v-if="languageEnabled" class="editor-local-indicator">
        {{ t('runner.editor.localAnalysis') }}
      </span>
    </div>
  </div>
</template>
