import MarkdownIt from 'markdown-it'
import { validSourceFilename } from './source-file'

export const exerciseFields = [
  { key: 'title', label: '题目标题', limit: 100 },
  { key: 'topic', label: '知识点', limit: 100 },
  { key: 'filename', label: '学生源文件名', limit: 80 },
  { key: 'description', label: '题面', limit: 100000 },
  { key: 'input', label: '输入说明', limit: 10000 },
  { key: 'output', label: '输出说明', limit: 10000 },
  { key: 'sampleInput', label: '样例输入', limit: 65536 },
  { key: 'sampleOutput', label: '样例输出', limit: 65536 },
  { key: 'code', label: '初始代码', limit: 100000 },
] as const
export type ExerciseField = (typeof exerciseFields)[number]['key']
export interface MarkdownImport {
  fields: Partial<Record<ExerciseField, string>>
  warnings: string[]
  errors: string[]
}

const markdown = new MarkdownIt({ html: false })
const aliases: Record<ExerciseField, string[]> = {
  title: ['题目', '标题', '题目标题', 'title'],
  topic: ['知识点', '标签', 'topic', 'tags'],
  filename: ['源文件名', '学生源文件名', '文件名', 'filename', 'source filename'],
  description: ['题面', '题目描述', '问题描述', '描述', 'description', 'problem description'],
  input: ['输入', '输入说明', '输入描述', '输入格式', 'input', 'input description', 'input format'],
  output: [
    '输出',
    '输出说明',
    '输出描述',
    '输出格式',
    'output',
    'output description',
    'output format',
  ],
  sampleInput: [
    '样例输入',
    '输入样例',
    '示例输入',
    'sample input',
    'input sample',
    'example input',
  ],
  sampleOutput: [
    '样例输出',
    '输出样例',
    '示例输出',
    'sample output',
    'output sample',
    'example output',
  ],
  code: [
    '初始代码',
    '起始代码',
    '代码模板',
    '模板代码',
    'starter code',
    'initial code',
    'template code',
  ],
}
function headingName(heading: string) {
  return heading
    .trim()
    .replace(/[:：]\s*$/, '')
    .replace(/\s*(?:#\s*)?[(（]?\d+[)）]?$/, '')
    .trim()
    .toLowerCase()
}
function fieldForHeading(heading: string): ExerciseField | undefined {
  const name = headingName(heading)
  return exerciseFields.find(({ key }) => aliases[key].includes(name))?.key
}
function unwrapCode(source: string) {
  const tokens = markdown.parse(source, {})
  return tokens.length === 1 && ['fence', 'code_block'].includes(tokens[0]!.type)
    ? tokens[0]!.content.replace(/\n$/, '')
    : source
}

/** Parse heading sections from source line maps so fenced headings stay literal. */
export function parseExerciseMarkdown(source: string): MarkdownImport {
  const normalized = source.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
  const fields: MarkdownImport['fields'] = {}
  const warnings: string[] = []
  const errors: string[] = []
  const lines = normalized.split('\n')
  const tokens = markdown.parse(normalized, {})
  let current: ExerciseField = 'description'
  let depth = 6
  let start = 0
  let hasTitle = false
  let sawSection = false
  let sampleDepth: number | undefined
  function append(field: ExerciseField, raw: string) {
    const value = raw.trim()
    if (!value) return
    const content = ['sampleInput', 'sampleOutput', 'code'].includes(field)
      ? unwrapCode(value)
      : ['title', 'topic', 'filename'].includes(field)
        ? value.replace(/^`([^`\n]+)`$/, '$1')
        : value
    if (fields[field] !== undefined) {
      if (field !== 'description')
        warnings.push(
          `「${exerciseFields.find((item) => item.key === field)!.label}」出现多次，已按顺序合并，请核对。`,
        )
      fields[field] += '\n\n' + content
    } else fields[field] = content
  }
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index]!
    if (token.type !== 'heading_open' || token.level !== 0 || !token.map) continue
    const heading = tokens[index + 1]?.content ?? ''
    const level = Number(token.tag.slice(1))
    if (sampleDepth !== undefined && level <= sampleDepth) sampleDepth = undefined
    const sampleGroup = [
      '样例',
      '输入输出样例',
      '样例数据',
      '示例',
      'sample',
      'samples',
      'example',
      'examples',
    ].includes(headingName(heading))
    let field = fieldForHeading(heading)
    if (sampleDepth !== undefined && field === 'input') field = 'sampleInput'
    if (sampleDepth !== undefined && field === 'output') field = 'sampleOutput'
    const isTitle =
      !field &&
      !sampleGroup &&
      !sawSection &&
      level === 1 &&
      !hasTitle &&
      fields.title === undefined
    if (!field && !sampleGroup && !isTitle && level > depth) continue
    append(current, lines.slice(start, token.map[0]).join('\n'))
    if (isTitle) {
      fields.title = heading
      hasTitle = true
      current = 'description'
      depth = 1
      start = token.map[1]
    } else if (sampleGroup) {
      sampleDepth = level
      sawSection = true
      current = 'description'
      depth = level
      start = token.map[1]
    } else {
      if (field) sawSection = true
      current = field ?? 'description'
      depth = level
      start = field ? token.map[1] : token.map[0]
    }
  }
  append(current, lines.slice(start).join('\n'))
  // Also recognize simple metadata lines outside code fences in the problem body.
  if (fields.description) {
    const body = fields.description.split('\n')
    const excluded = new Set<number>()
    for (const token of markdown.parse(fields.description, {})) {
      if (['fence', 'code_block', 'blockquote_open'].includes(token.type) && token.map)
        for (let line = token.map[0]; line < token.map[1]; line++) excluded.add(line)
    }
    fields.description = body
      .filter((line, index) => {
        if (excluded.has(index)) return true
        const match = line.match(
          /^\s*(知识点|标签|topic|tags|源文件名|学生源文件名|文件名|filename)\s*[:：]\s*(.*?)\s*$/i,
        )
        if (!match) return true
        append(fieldForHeading(match[1]!)!, match[2]!)
        return false
      })
      .join('\n')
      .trim()
    if (!fields.description) delete fields.description
  }
  for (const { key, label, limit } of exerciseFields) {
    if ((fields[key]?.length ?? 0) > limit)
      errors.push(`${label}超过 ${limit} 字符，请拆分或缩短后重新上传。`)
  }
  if (fields.filename && !validSourceFilename(fields.filename))
    errors.push('源文件名格式无效，请使用单个 .cpp、.cc 或 .cxx 文件名后重新上传。')
  if (!Object.keys(fields).length) errors.push('文件没有可导入的内容。')
  return { fields, warnings: [...new Set(warnings)], errors }
}
