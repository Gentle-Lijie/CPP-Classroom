import hljs from 'highlight.js/lib/core'
import cpp from 'highlight.js/lib/languages/cpp'
import python from 'highlight.js/lib/languages/python'
import javascript from 'highlight.js/lib/languages/javascript'
import typescript from 'highlight.js/lib/languages/typescript'
import json from 'highlight.js/lib/languages/json'
import bash from 'highlight.js/lib/languages/bash'
import sql from 'highlight.js/lib/languages/sql'
import java from 'highlight.js/lib/languages/java'
import xml from 'highlight.js/lib/languages/xml'
import css from 'highlight.js/lib/languages/css'
import markdown from 'highlight.js/lib/languages/markdown'
import diff from 'highlight.js/lib/languages/diff'

for (const [name, language] of Object.entries({
  cpp,
  python,
  javascript,
  typescript,
  json,
  bash,
  sql,
  java,
  xml,
  css,
  markdown,
  diff,
}))
  hljs.registerLanguage(name, language)

const aliases: Record<string, string> = {
  c: 'cpp',
  'c++': 'cpp',
  cc: 'cpp',
  cxx: 'cpp',
  h: 'cpp',
  hpp: 'cpp',
  py: 'python',
  js: 'javascript',
  ts: 'typescript',
  sh: 'bash',
  shell: 'bash',
  html: 'xml',
  svg: 'xml',
  md: 'markdown',
  text: 'text',
  txt: 'text',
  plaintext: 'text',
}
export function escapeCode(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// highlight.js spans may cross line boundaries (comments, strings, etc.). Close
// and reopen their stack so each numbered line remains valid, highlighted HTML.
export function highlightedLines(html: string) {
  const stack: string[] = []
  return html.split('\n').map((line) => {
    const prefix = stack.join('')
    for (const match of line.matchAll(/<span\b[^>]*>|<\/span>/g)) {
      if (match[0] === '</span>') stack.pop()
      else stack.push(match[0])
    }
    return prefix + line + '</span>'.repeat(stack.length)
  })
}
export function renderCodeBlock(
  source: string,
  options: {
    language?: string
    label?: string
    toolbar?: boolean
    emptyText?: string
  } = {},
) {
  const normalized = source.replace(/\r\n?/g, '\n')
  const terminalNewline = normalized.endsWith('\n')
  const display = terminalNewline ? normalized.slice(0, -1) : normalized
  const requested = options.language?.trim().split(/\s+/)[0]?.toLowerCase() ?? ''
  const language = aliases[requested] ?? requested
  let highlighted = escapeCode(display)
  let detected = language || 'text'
  if (language && hljs.getLanguage(language)) {
    highlighted = hljs.highlight(display, { language, ignoreIllegals: true }).value
  } else if (!language && display.trim() && display.length <= 20000) {
    const result = hljs.highlightAuto(display, [
      'cpp',
      'python',
      'javascript',
      'json',
      'bash',
      'sql',
    ])
    highlighted = result.value
    detected = result.language ?? 'text'
  }
  const lines = highlightedLines(highlighted)
  const title =
    options.label || (detected === 'text' ? '纯文本' : detected === 'cpp' ? 'C++' : detected)
  const toolbar =
    options.toolbar === false
      ? ''
      : `<div class="code-block-toolbar"><span class="code-block-label">${escapeCode(title)}</span><button type="button" class="code-copy-button" data-disabled-reason="${source ? '正在复制，请稍候' : '没有可复制的内容'}" ${!source ? 'disabled ' : ''}aria-label="复制${escapeCode(title)}" title="复制${escapeCode(title)}" data-code-copy><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h4"/></svg><span class="code-copy-label">复制</span></button></div>`
  const content = source
    ? `<pre class="code-block-pre" tabindex="0" aria-label="${escapeCode(title)}"><code class="code-block-code">${lines.map((line, index) => `<span class="code-block-line"><span class="code-block-number" aria-hidden="true">${index + 1}</span><span class="code-block-line-content">${line}</span></span>`).join('\n')}</code></pre>`
    : `<p class="code-block-empty">${escapeCode(options.emptyText || '空内容')}</p>`
  return `<div class="rendered-code-block" data-code-block data-terminal-newline="${terminalNewline ? 'true' : 'false'}" style="--code-gutter: ${String(lines.length).length + 2}ch">${toolbar}${content}</div>`
}

export function codeBlockText(block: Element) {
  return (
    Array.from(
      block.querySelectorAll('.code-block-line-content'),
      (line) => line.textContent ?? '',
    ).join('\n') + (block.getAttribute('data-terminal-newline') === 'true' ? '\n' : '')
  )
}
