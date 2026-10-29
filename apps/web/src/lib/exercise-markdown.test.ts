import { describe, expect, it } from 'vitest'
import { parseExerciseMarkdown } from './exercise-markdown'

describe('Markdown exercise import', () => {
  it('detects Python starters while keeping language-like lines inside code literal', () => {
    const result = parseExerciseMarkdown(
      '# 问候\n## 初始代码\n```python\n# language: cpp\nprint("你好")\n```',
    )
    expect(result.language).toBe('python')
    expect(result.fields.code).toBe('# language: cpp\nprint("你好")')
    expect(result.errors).toEqual([])
    expect(parseExerciseMarkdown('# 问候练习\n语言：ruby').errors.length).toBeGreaterThan(0)
  })
  it('splits a Chinese exercise and preserves code, whitespace, and fenced headings', () => {
    const result = parseExerciseMarkdown(
      [
        '# 累加求和',
        '',
        '知识点：for 循环',
        '源文件名：`sum.cpp`',
        '',
        '## 题目描述',
        '计算 **1 到 n** 的和。',
        '',
        '### 数据范围',
        '`n <= 100`',
        '',
        '## 输入格式',
        '一个整数 n。',
        '',
        '## 输出格式',
        '一个整数。',
        '',
        '## 样例输入',
        '```text',
        '  5',
        '```',
        '',
        '## 样例输出',
        '```',
        '15',
        '```',
        '',
        '## 初始代码',
        '```cpp',
        '#include <iostream>',
        '// 保留下面的 Markdown 标题',
        '## 输入说明',
        'int main() {',
        '  return 0;',
        '}',
        '```',
      ].join('\n'),
    )
    expect(result.errors).toEqual([])
    expect(result.warnings).toEqual([])
    expect(result.fields).toEqual({
      title: '累加求和',
      topic: 'for 循环',
      filename: 'sum.cpp',
      description: '计算 **1 到 n** 的和。\n\n### 数据范围\n`n <= 100`',
      input: '一个整数 n。',
      output: '一个整数。',
      sampleInput: '  5',
      sampleOutput: '15',
      code: '#include <iostream>\n// 保留下面的 Markdown 标题\n## 输入说明\nint main() {\n  return 0;\n}',
    })
  })
  it('supports English and setext headings, BOM, CRLF, and tilde fences', () => {
    const result = parseExerciseMarkdown(
      '\uFEFFSum\r\n===\r\n\r\n## Input\r\nn\r\n## Sample Input 1\r\n~~~text\r\n5\r\n~~~\r\n## Sample Output\r\n15\r\n## Starter Code\r\n~~~cpp\r\nint main() {}\r\n~~~',
    )
    expect(result.fields).toEqual({
      title: 'Sum',
      input: 'n',
      sampleInput: '5',
      sampleOutput: '15',
      code: 'int main() {}',
    })
    expect(result.errors).toEqual([])
  })
  it('imports plain Markdown as description and keeps unknown top-level sections', () => {
    expect(parseExerciseMarkdown('一个 **没有标题** 的题面。').fields).toEqual({
      description: '一个 **没有标题** 的题面。',
    })
    const result = parseExerciseMarkdown('# 题名\n## 输入\nn\n## 提示\n不要溢出\n## 输出\n答案')
    expect(result.fields).toEqual({
      title: '题名',
      input: 'n',
      output: '答案',
      description: '## 提示\n不要溢出',
    })
  })
  it('does not interpret headings or metadata in fenced or quoted content', () => {
    const source = '```md\n# 不是题名\n知识点：不提取\n```\n\n> ## 输入\n> filename: not.cpp'
    expect(parseExerciseMarkdown(source).fields).toEqual({ description: source })
  })
  it('preserves repeated samples and warns that they require review', () => {
    const result = parseExerciseMarkdown('## 样例输入 1\n```\n5\n```\n## 样例输入 2\n```\n7\n```')
    expect(result.fields.sampleInput).toBe('5\n\n7')
    expect(result.warnings).toHaveLength(1)
  })
  it('recognizes input and output inside a samples group without inventing a missing title', () => {
    const result = parseExerciseMarkdown(
      '# 题目描述\n计算和。\n# 输入格式\n一个整数。\n# 输入输出样例\n## 输入 #1\n```\n5\n```\n## 输出 #1\n```\n15\n```\n# 提示\n注意数据范围。',
    )
    expect(result.fields).toEqual({
      description: '计算和。\n\n# 提示\n注意数据范围。',
      input: '一个整数。',
      sampleInput: '5',
      sampleOutput: '15',
    })
    expect(result.warnings).toEqual([])
  })
  it('reports empty files, oversized fields, and unsafe filenames before filling', () => {
    expect(parseExerciseMarkdown(' \n').errors).toHaveLength(1)
    expect(parseExerciseMarkdown('## 文件名\n../sum.cpp').errors[0]).toContain('源文件名格式无效')
    expect(parseExerciseMarkdown('# ' + '长'.repeat(101)).errors[0]).toContain('题目标题超过')
    expect(parseExerciseMarkdown('## 输入\n' + 'x'.repeat(10001)).errors[0]).toContain(
      '输入说明超过',
    )
  })
})
