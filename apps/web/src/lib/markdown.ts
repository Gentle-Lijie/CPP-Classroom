import MarkdownIt from 'markdown-it'
import { renderCodeBlock } from './code-block'
// Raw HTML is disabled; markdown-it also rejects unsafe link protocols.
const markdown = new MarkdownIt({ html: false, linkify: true })
markdown.renderer.rules.fence = (tokens, index) => {
  const token = tokens[index]!
  return renderCodeBlock(token.content, { language: token.info }) + '\n'
}
markdown.renderer.rules.code_block = (tokens, index) =>
  renderCodeBlock(tokens[index]!.content) + '\n'
export function renderMarkdown(source: string) {
  return markdown.render(source)
}
