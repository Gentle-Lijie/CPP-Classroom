import { describe, expect, it } from 'vitest'
import { codeBlockText, highlightedLines, renderCodeBlock } from './code-block'
import { renderMarkdown } from './markdown'

// Read rendered line content independently of the browser's layout and gutters.
function lines(html: string) {
  return [...html.matchAll(/<span class="code-block-line-content">(.*?)<\/span><\/span>/g)].map(
    ([, line]) =>
      line!
        .replace(/<\/?span[^>]*>/g, '')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, '&'),
  )
}

describe('shared Markdown code rendering', () => {
  it('renders CommonMark structure, GFM tables, fenced and indented code together', () => {
    const html = renderMarkdown(
      '# Title\n\n- **one**\n- `two`\n\n| A | B |\n| - | - |\n| x | y |\n\n```cpp\nstruct Student { int score; };\n```\n\n    std::cout << 1;\n',
    )
    expect(html).toContain('<h1>Title</h1>')
    expect(html).toContain('<strong>one</strong>')
    expect(html).toContain('<code>two</code>')
    expect(html).toContain('<table>')
    expect(html.match(/data-code-block /g)).toHaveLength(2)
    expect(html).toContain('hljs-keyword')
    expect(html.match(/data-code-copy/g)).toHaveLength(2)
  })

  it('highlights C++ aliases and preserves multiline comments across numbered lines', () => {
    const source = '/* comment\n   continued */\nstruct Student { int score; };\n'
    const html = renderCodeBlock(source, { language: 'c++' })
    expect(html.match(/class="code-block-number"/g)).toHaveLength(3)
    expect(lines(html)).toEqual(source.slice(0, -1).split('\n'))
    expect(html.match(/class="hljs-comment"/g)).toHaveLength(2)
  })

  it.each(['', '  1\n\n\t2  ', '<input>&"\n', 'a\r\nb\r\n', 'a\n\n'])(
    'keeps exact visible whitespace and trailing newlines for copying: %j',
    (source) => {
      const html = renderCodeBlock(source, { language: 'text', label: '样例输入' })
      const node = {
        querySelectorAll: () => lines(html).map((textContent) => ({ textContent })),
        getAttribute: () => (html.includes('data-terminal-newline="true"') ? 'true' : 'false'),
      } as unknown as Element
      expect(codeBlockText(node)).toBe(source.replace(/\r\n?/g, '\n'))
      expect(html).not.toContain('hljs-')
    },
  )

  it('treats unknown languages and hostile labels as text, without injecting attributes or HTML', () => {
    const html = renderCodeBlock('<img src=x onerror=alert(1)>', {
      language: 'unknown',
      label: '"><script>alert(1)</script>',
    })
    expect(html).not.toContain('<img')
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;img')
    expect(html).toContain('&lt;script&gt;')
    expect(
      renderMarkdown('[unsafe](javascript:alert(1))\n\n<script>alert(1)</script>'),
    ).not.toMatch(/<script>|href="javascript:/)
  })

  it('renders empty input without a phantom numbered line and disables its copy action', () => {
    const html = renderCodeBlock('', { label: '样例输入', emptyText: '无输入' })
    expect(html).toContain('class="code-block-empty">无输入</p>')
    expect(html).not.toContain('class="code-block-number"')
    expect(html).not.toContain('<pre')
    expect(html).toContain('disabled aria-label="复制样例输入"')
  })

  it('keeps nested syntax spans balanced on every line', () => {
    const result = highlightedLines(
      '<span class="outer">one\n<span class="inner">two\nthree</span>\nfour</span>',
    )
    expect(result).toHaveLength(4)
    for (const line of result)
      expect(line.match(/<span\b/g)?.length ?? 0).toBe(line.match(/<\/span>/g)?.length ?? 0)
  })
})
