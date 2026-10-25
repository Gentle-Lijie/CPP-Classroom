import MarkdownIt from 'markdown-it'
// Raw HTML is disabled; markdown-it also rejects unsafe link protocols.
const markdown = new MarkdownIt({ html: false, linkify: true, breaks: true })
export function renderMarkdown(source: string) {
  return markdown.render(source)
}
