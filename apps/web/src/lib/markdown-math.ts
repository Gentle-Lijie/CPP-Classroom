import katex from 'katex'
import texmath from 'markdown-it-texmath'
import type MarkdownIt from 'markdown-it'

export function enableMarkdownMath(markdown: MarkdownIt) {
  return markdown.use(texmath, { engine: katex, delimiters: 'dollars' })
}
