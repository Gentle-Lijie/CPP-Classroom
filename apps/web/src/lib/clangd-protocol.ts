export interface LspPosition {
  line: number
  character: number
}
export interface LspRange {
  start: LspPosition
  end: LspPosition
}
export interface LspTextEdit {
  range?: LspRange
  insert?: LspRange
  replace?: LspRange
  newText: string
}
export interface LspDiagnostic {
  range: LspRange
  severity?: number
  message: string
  code?: string | number
}
export interface LspCompletionItem {
  label: string
  kind?: number
  detail?: string
  documentation?: string | { kind?: string; value: string }
  insertText?: string
  insertTextFormat?: number
  filterText?: string
  sortText?: string
  textEdit?: LspTextEdit
  additionalTextEdits?: LspTextEdit[]
}
export function isLspRange(value: unknown): value is LspRange {
  if (!value || typeof value !== 'object') return false
  const range = value as LspRange
  return (
    [range.start, range.end].every(
      (p) =>
        p &&
        Number.isInteger(p.line) &&
        Number.isInteger(p.character) &&
        p.line >= 0 &&
        p.character >= 0,
    ) &&
    (range.end.line > range.start.line ||
      (range.end.line === range.start.line && range.end.character >= range.start.character))
  )
}
export function editorRange(range: LspRange) {
  return {
    startLineNumber: range.start.line + 1,
    startColumn: range.start.character + 1,
    endLineNumber: range.end.line + 1,
    endColumn: range.end.character + 1,
  }
}
export function documentationText(value: string | { value: string } | undefined) {
  return typeof value === 'string' ? value : (value?.value ?? '')
}
export function diagnosticsMatchVersion(received: unknown, current: number): boolean {
  return typeof received === 'number' && received === current
}
