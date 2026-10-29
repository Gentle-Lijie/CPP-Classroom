import type * as Monaco from 'monaco-editor'
import workerUrl from 'monaco-pyright-lsp/dist/worker.js?url'
import { openPyrightWorker } from './browser-pyright-worker'
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

export interface PyrightStatus {
  state: 'loading' | 'ready' | 'analyzing' | 'error' | 'unsupported'
  errors: number
  warnings: number
  message: string
}
export interface BrowserPyright {
  dispose(): void
}
type MonacoApi = typeof import('monaco-editor/esm/vs/editor/editor.api.js')
const markerOwner = 'classroom-pyright-browser'
type Documentation = string | { value: string }
interface SignatureHelp {
  signatures: {
    label: string
    documentation?: Documentation
    parameters?: { label: string | [number, number]; documentation?: Documentation }[]
    activeParameter?: number
  }[]
  activeSignature?: number
  activeParameter?: number
}
interface Definition {
  uri?: string
  range?: LspRange
  targetUri?: string
  targetSelectionRange?: LspRange
}

export async function attachBrowserPyright(
  api: MonacoApi,
  model: Monaco.editor.ITextModel,
  onStatus: (status: PyrightStatus) => void,
  signal: AbortSignal,
): Promise<BrowserPyright> {
  signal.throwIfAborted()
  onStatus({
    state: 'loading',
    errors: 0,
    warnings: 0,
    message: '正在加载 Python 语言服务与标准库类型信息…',
  })
  const session = await openPyrightWorker(workerUrl, signal)
  let disposed = false
  let changeTimer: ReturnType<typeof setTimeout> | undefined
  let sentVersion = 0
  const disposables: Monaco.IDisposable[] = []
  const connection: MessageConnection = createMessageConnection(
    new BrowserMessageReader(session.worker),
    new BrowserMessageWriter(session.worker),
  )
  function status(state: PyrightStatus['state'], message: string, errors = 0, warnings = 0) {
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
  disposables.push(model.onWillDispose(dispose))
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
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      return await Promise.race([
        connection.sendRequest<T>(method, params, source.token),
        new Promise<null>((resolve) => {
          timer = setTimeout(() => {
            source.cancel()
            resolve(null)
          }, 8000)
        }),
      ])
    } catch {
      return null
    } finally {
      clearTimeout(timer)
      canceled?.dispose()
      source.dispose()
    }
  }
  const currentResult = (version: number, token: Monaco.CancellationToken) =>
    !disposed &&
    !signal.aborted &&
    !model.isDisposed() &&
    !token.isCancellationRequested &&
    version === model.getVersionId()
  const documentPosition = (position: Monaco.Position) => ({
    textDocument: { uri: model.uri.toString() },
    position: { line: position.lineNumber - 1, character: position.column - 1 },
  })
  const markdown = (value?: Documentation) => ({
    value: documentationText(value),
    isTrusted: false,
    supportHtml: false,
  })
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
          source: 'Pyright · 浏览器 · Beta',
          ...(diagnostic.code !== undefined ? { code: String(diagnostic.code) } : {}),
        })
      }
      api.editor.setModelMarkers(model, markerOwner, markers)
      status(
        'ready',
        'Python · 浏览器内分析 · Beta',
        markers.filter((m) => m.severity === api.MarkerSeverity.Error).length,
        markers.filter((m) => m.severity === api.MarkerSeverity.Warning).length,
      )
    },
  )
  connection.onRequest('workspace/configuration', (params: { items?: unknown[] }) =>
    (params.items ?? []).map(() => null),
  )
  connection.listen()
  try {
    const initialized = await request<{ capabilities?: { positionEncoding?: string } }>(
      'initialize',
      {
        processId: null,
        rootUri: 'file:///',
        initializationOptions: {},
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
    if (!initialized || signal.aborted || disposed) throw new Error('Python 语言服务初始化未完成')
    if (
      initialized.capabilities?.positionEncoding &&
      initialized.capabilities.positionEncoding !== 'utf-16'
    )
      throw new Error('Python 语言服务字符位置编码不兼容')
    await connection.sendNotification('initialized', {})
    await connection.sendNotification('workspace/didChangeConfiguration', {
      settings: {
        python: {
          analysis: {
            typeshedPaths: ['/typeshed-fallback'],
            typeCheckingMode: 'basic',
            diagnosticMode: 'openFilesOnly',
            autoSearchPaths: false,
            useLibraryCodeForTypes: false,
          },
        },
      },
    })
    sentVersion = model.getVersionId()
    await connection.sendNotification('textDocument/didOpen', {
      textDocument: {
        uri: model.uri.toString(),
        languageId: 'python',
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
      api.languages.registerCompletionItemProvider('python', {
        triggerCharacters: ['.', '[', '"', "'"],
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
      api.languages.registerHoverProvider('python', {
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
    disposables.push(
      api.languages.registerSignatureHelpProvider('python', {
        signatureHelpTriggerCharacters: ['(', ','],
        signatureHelpRetriggerCharacters: [')'],
        async provideSignatureHelp(current, position, token) {
          if (current !== model || disposed) return null
          syncModel()
          const version = model.getVersionId()
          const result = await request<SignatureHelp>(
            'textDocument/signatureHelp',
            documentPosition(position),
            token,
          )
          if (!result?.signatures?.length || !currentResult(version, token)) return null
          return {
            value: {
              signatures: result.signatures.map((signature) => ({
                ...signature,
                documentation: markdown(signature.documentation),
                parameters: (signature.parameters ?? []).map((parameter) => ({
                  ...parameter,
                  documentation: markdown(parameter.documentation),
                })),
              })),
              activeSignature: result.activeSignature ?? 0,
              activeParameter: result.activeParameter ?? 0,
            },
            dispose() {},
          }
        },
      }),
      api.languages.registerDefinitionProvider('python', {
        async provideDefinition(current, position, token) {
          if (current !== model || disposed) return null
          syncModel()
          const version = model.getVersionId()
          const result = await request<Definition | Definition[]>(
            'textDocument/definition',
            documentPosition(position),
            token,
          )
          if (!result || !currentResult(version, token)) return null
          // Standard-library stubs are private to the worker. Only open definitions
          // in this document; never create inaccessible virtual-file editor tabs.
          return (Array.isArray(result) ? result : [result]).flatMap((definition) => {
            const uri = definition.targetUri ?? definition.uri
            const range = definition.targetSelectionRange ?? definition.range
            const mapped = range ? safeRange(range) : null
            return uri === model.uri.toString() && mapped ? [{ uri: model.uri, range: mapped }] : []
          })
        },
      }),
      api.languages.registerRenameProvider('python', {
        async provideRenameEdits(current, position, newName, token) {
          if (current !== model || disposed) return null
          syncModel()
          const version = model.getVersionId()
          type Edit = { range: LspRange; newText: string }
          const result = await request<{
            changes?: Record<string, Edit[]>
            documentChanges?: { textDocument: { uri: string }; edits: Edit[] }[]
          }>('textDocument/rename', { ...documentPosition(position), newName }, token)
          if (!result || !currentResult(version, token)) return null
          const edits =
            result.changes?.[model.uri.toString()] ??
            result.documentChanges
              ?.filter((change) => change.textDocument?.uri === model.uri.toString())
              .flatMap((change) => change.edits) ??
            []
          return {
            edits: edits.flatMap((edit) => {
              const range = safeRange(edit.range)
              return range && typeof edit.newText === 'string'
                ? [
                    {
                      resource: model.uri,
                      textEdit: { range, text: edit.newText },
                      versionId: version,
                    },
                  ]
                : []
            }),
          }
        },
      }),
    )
    status('analyzing', '正在分析当前代码…')
    void session.closed.then((error) => {
      if (!disposed) {
        status('error', 'Python 语言服务已停止：' + error.message)
        dispose()
      }
    })
    return { dispose }
  } catch (error) {
    dispose()
    throw error
  }
}
