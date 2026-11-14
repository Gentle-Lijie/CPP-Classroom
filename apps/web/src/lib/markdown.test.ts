import { describe, expect, it } from 'vitest'
import { renderMarkdown } from './markdown'
import { readExerciseImport } from './exercise-import'

describe('Markdown math', () => {
  it('renders inline and display math, preserving literal code and unsafe HTML', () => {
    const html = renderMarkdown(
      '中文 $n$\n\n$$\n\\frac{1}{2}\n$$\n\n`$x$`\n\n<script>alert(1)</script>',
    )
    expect(html).toContain('class="katex"')
    expect(html).toContain('class="katex-display"')
    expect(html).toContain('<code>$x$</code>')
    expect(html).not.toContain('<script>')
  })

  it('preserves equations and heading-like lines during Markdown and JSON import', async () => {
    const equation = '$$\n\\begin{aligned}\n# Input\nfilename: x.cpp\n\\end{aligned}\n$$'
    const md = await readExerciseImport(
      new File([`# Problem\n## Description\n$n$\n\n${equation}\n## Input\n$x$`], 'problem.md'),
    )
    expect(md.errors).toEqual([])
    expect(md.exercise?.description).toBe(`$n$\n\n${equation}`)
    expect(md.exercise?.input).toBe('$x$')
    const json = await readExerciseImport(
      new File([JSON.stringify({ ...md.exercise })], 'problem.json'),
    )
    expect(json.errors).toEqual([])
    expect(json.exercise?.description).toBe(md.exercise?.description)
  })
})
