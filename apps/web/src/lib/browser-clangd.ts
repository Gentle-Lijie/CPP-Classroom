import type * as Monaco from 'monaco-editor'
import {
  BrowserMessageReader,
  BrowserMessageWriter,
  CancellationTokenSource,
  createMessageConnection,
  type MessageConnection,
} from 'vscode-jsonrpc/browser'
import {
  documentationText,
  editorRange,
  isLspRange,
  diagnosticsMatchVersion,
  type LspCompletionItem,
  type LspDiagnostic,
  type LspRange,
} from './clangd-protocol'

export interface ClangdStatus {
  state: 'loading' | 'ready' | 'analyzing' | 'error' | 'unsupported'
  errors: number
  warnings: number
  message: string
}
export interface BrowserClangd {
  dispose(): void
}
type MonacoApi = typeof import('monaco-editor/esm/vs/editor/editor.api.js')
const markerOwner = 'classroom-clangd-browser'

export async function attachBrowserClangd(
  api: MonacoApi,
  model: Monaco.editor.ITextModel,
  onStatus: (status: ClangdStatus) => void,
  signal: AbortSignal,
): Promise<BrowserClangd> {
  const { isClangdWasmSupported } = await import('@algoproclub/clangd-wasm/support')
  signal.throwIfAborted()
  if (!isClangdWasmSupported()) {
    onStatus({
      state: 'unsupported',
      errors: 0,
      warnings: 0,
      message: '此浏览器缺少 SharedWorker / WebAssembly JSPI，请使用新版 Chrome 或 Edge。',
    })
    return { dispose() {} }
  }
  onStatus({
    state: 'loading',
    errors: 0,
    warnings: 0,
    message: '正在加载浏览器 clangd 与 C++ 标准库…',
  })
  const { openClangdSession } = await import('@algoproclub/clangd-wasm')
  signal.throwIfAborted()
  const session = await openClangdSession({
    uri: model.uri.toString(),
    compilerArguments: ['-std=c++17', '-Wall', '-Wextra'],
    signal,
  })
  let disposed = false
  let changeTimer: ReturnType<typeof setTimeout> | undefined
  let sentVersion = 0
  const disposables: Monaco.IDisposable[] = []
  const connection: MessageConnection = createMessageConnection(
    new BrowserMessageReader(session.port),
    new BrowserMessageWriter(session.port),
  )
  function status(state: ClangdStatus['state'], message: string, errors = 0, warnings = 0) {
    if (!disposed && !signal.aborted) onStatus({ state, message, errors, warnings })
  }
  function dispose() {
    if (disposed) return
    disposed = true
    clearTimeout(changeTimer)
    disposables.forEach((d) => d.dispose())
    signal.removeEventListener('abort', dispose)
    connection.dispose()
    session.dispose()
    if (!model.isDisposed()) api.editor.setModelMarkers(model, markerOwner, [])
  }
  signal.addEventListener('abort', dispose, { once: true })
  if (signal.aborted) {
    dispose()
    signal.throwIfAborted()
  }
  function safeRange(range: LspRange) {
    if (
      !isLspRange(range) ||
      range.start.line >= model.getLineCount() ||
      range.end.line >= model.getLineCount()
    )
      return null
    const mapped = editorRange(range)
    if (
      mapped.startColumn > model.getLineMaxColumn(mapped.startLineNumber) ||
      mapped.endColumn > model.getLineMaxColumn(mapped.endLineNumber)
    )
      return null
    return mapped
  }
  function syncModel() {
    clearTimeout(changeTimer)
    if (disposed || model.isDisposed() || sentVersion === model.getVersionId()) return
    sentVersion = model.getVersionId()
    void connection
      .sendNotification('textDocument/didChange', {
        textDocument: { uri: model.uri.toString(), version: sentVersion },
        contentChanges: [{ text: model.getValue() }],
      })
      .catch(() => {})
  }
  async function request<T>(
    method: string,
    params: object,
    token?: Monaco.CancellationToken,
  ): Promise<T | null> {
    if (disposed || model.isDisposed()) return null
    const source = new CancellationTokenSource()
    const canceled = token?.onCancellationRequested(() => source.cancel())
    const timer = setTimeout(() => source.cancel(), 8000)
    try {
      return await connection.sendRequest<T>(method, params, source.token)
    } catch {
      return null
    } finally {
      clearTimeout(timer)
      canceled?.dispose()
      source.dispose()
    }
  }
  connection.onNotification(
    'textDocument/publishDiagnostics',
    (params: { uri?: string; version?: number; diagnostics?: LspDiagnostic[] }) => {
      if (
        disposed ||
        signal.aborted ||
        model.isDisposed() ||
        params.uri !== model.uri.toString() ||
        !diagnosticsMatchVersion(params.version, model.getVersionId()) ||
        !Array.isArray(params.diagnostics)
      )
        return
      const severity = [
        api.MarkerSeverity.Error,
        api.MarkerSeverity.Error,
        api.MarkerSeverity.Warning,
        api.MarkerSeverity.Info,
        api.MarkerSeverity.Hint,
      ]
      const markers: Monaco.editor.IMarkerData[] = []
      for (const diagnostic of params.diagnostics.slice(0, 300)) {
        const range = safeRange(diagnostic.range)
        if (!range || typeof diagnostic.message !== 'string') continue
        markers.push({
          ...range,
          message: diagnostic.message,
          severity: severity[diagnostic.severity ?? 1] ?? api.MarkerSeverity.Error,
          source: 'clangd · 浏览器',
          ...(diagnostic.code !== undefined ? { code: String(diagnostic.code) } : {}),
        })
      }
      api.editor.setModelMarkers(model, markerOwner, markers)
      status(
        'ready',
        'C++17 · 浏览器内分析',
        markers.filter((m) => m.severity === api.MarkerSeverity.Error).length,
        markers.filter((m) => m.severity === api.MarkerSeverity.Warning).length,
      )
    },
  )
  connection.listen()
  try {
    const initialized = await request<{ capabilities?: { positionEncoding?: string } }>(
      'initialize',
      {
        processId: null,
        rootUri: null,
        capabilities: {
          general: { positionEncodings: ['utf-16'] },
          textDocument: {
            completion: {
              completionItem: {
                snippetSupport: true,
                documentationFormat: ['markdown', 'plaintext'],
              },
            },
            publishDiagnostics: { versionSupport: true },
            hover: { contentFormat: ['markdown', 'plaintext'] },
          },
        },
      },
    )
    if (!initialized || signal.aborted || disposed) throw new Error('clangd 初始化未完成')
    if (
      initialized.capabilities?.positionEncoding &&
      initialized.capabilities.positionEncoding !== 'utf-16'
    )
      throw new Error('clangd 字符位置编码不兼容')
    await connection.sendNotification('initialized', {})
    sentVersion = model.getVersionId()
    await connection.sendNotification('textDocument/didOpen', {
      textDocument: {
        uri: model.uri.toString(),
        languageId: 'cpp',
        version: sentVersion,
        text: model.getValue(),
      },
    })
    disposables.push(
      model.onDidChangeContent(() => {
        if (disposed || model.isDisposed()) return
        api.editor.setModelMarkers(model, markerOwner, [])
        status('analyzing', '正在分析当前代码…')
        clearTimeout(changeTimer)
        changeTimer = setTimeout(syncModel, 250)
      }),
    )
    const kinds = api.languages.CompletionItemKind
    const kindMap: Record<number, Monaco.languages.CompletionItemKind> = {
      1: kinds.Text,
      2: kinds.Method,
      3: kinds.Function,
      4: kinds.Constructor,
      5: kinds.Field,
      6: kinds.Variable,
      7: kinds.Class,
      8: kinds.Interface,
      9: kinds.Module,
      10: kinds.Property,
      11: kinds.Unit,
      12: kinds.Value,
      13: kinds.Enum,
      14: kinds.Keyword,
      15: kinds.Snippet,
      16: kinds.Color,
      17: kinds.File,
      18: kinds.Reference,
      19: kinds.Folder,
      20: kinds.EnumMember,
      21: kinds.Constant,
      22: kinds.Struct,
      23: kinds.Event,
      24: kinds.Operator,
      25: kinds.TypeParameter,
    }
    disposables.push(
      api.languages.registerCompletionItemProvider('cpp', {
        triggerCharacters: ['.', ':', '>', '<', '"', '/'],
        async provideCompletionItems(current, position, _context, token) {
          if (current !== model || disposed) return null
          syncModel()
          const version = model.getVersionId()
          const result = await request<
            LspCompletionItem[] | { items: LspCompletionItem[]; isIncomplete?: boolean }
          >(
            'textDocument/completion',
            {
              textDocument: { uri: model.uri.toString() },
              position: { line: position.lineNumber - 1, character: position.column - 1 },
            },
            token,
          )
          if (
            !result ||
            disposed ||
            model.isDisposed() ||
            token.isCancellationRequested ||
            version !== model.getVersionId()
          )
            return null
          const items = Array.isArray(result) ? result : result.items
          if (!Array.isArray(items)) return null
          const word = model.getWordUntilPosition(position)
          const fallback = {
            startLineNumber: position.lineNumber,
            startColumn: word.startColumn,
            endLineNumber: position.lineNumber,
            endColumn: word.endColumn,
          }
          const suggestions: Monaco.languages.CompletionItem[] = []
          for (const item of items.slice(0, 300)) {
            if (typeof item.label !== 'string') continue
            const range = item.textEdit?.range ?? item.textEdit?.replace ?? item.textEdit?.insert
            const mapped = range ? safeRange(range) : fallback
            if (!mapped) continue
            const additionalTextEdits: Monaco.languages.TextEdit[] = []
            for (const edit of item.additionalTextEdits ?? []) {
              if (edit.range && typeof edit.newText === 'string') {
                const r = safeRange(edit.range)
                if (r) additionalTextEdits.push({ range: r, text: edit.newText })
              }
            }
            suggestions.push({
              label: item.label,
              kind: kindMap[item.kind ?? 1] ?? kinds.Text,
              detail: item.detail,
              documentation: {
                value: documentationText(item.documentation),
                isTrusted: false,
                supportHtml: false,
              },
              insertText: item.textEdit?.newText ?? item.insertText ?? item.label,
              ...(item.insertTextFormat === 2
                ? { insertTextRules: api.languages.CompletionItemInsertTextRule.InsertAsSnippet }
                : {}),
              range: mapped,
              filterText: item.filterText,
              sortText: item.sortText,
              additionalTextEdits,
            })
          }
          return { suggestions, incomplete: !Array.isArray(result) && result.isIncomplete === true }
        },
      }),
    )
    disposables.push(
      api.languages.registerHoverProvider('cpp', {
        async provideHover(current, position, token) {
          if (current !== model || disposed) return null
          syncModel()
          const version = model.getVersionId()
          const result = await request<{
            contents?: string | { value: string } | (string | { value: string })[]
            range?: LspRange
          }>(
            'textDocument/hover',
            {
              textDocument: { uri: model.uri.toString() },
              position: { line: position.lineNumber - 1, character: position.column - 1 },
            },
            token,
          )
          if (
            !result?.contents ||
            disposed ||
            model.isDisposed() ||
            version !== model.getVersionId()
          )
            return null
          const contents = (
            Array.isArray(result.contents) ? result.contents : [result.contents]
          ).map((value) => ({
            value: documentationText(value),
            isTrusted: false,
            supportHtml: false,
          }))
          return {
            contents,
            ...(result.range && safeRange(result.range) ? { range: safeRange(result.range)! } : {}),
          }
        },
      }),
    )
    status('analyzing', '正在分析当前代码…')
    void session.closed.then((error) => {
      if (!disposed) {
        status('error', 'clangd 已停止：' + error.message)
        dispose()
      }
    })
    return { dispose }
  } catch (error) {
    dispose()
    throw error
  }
}
