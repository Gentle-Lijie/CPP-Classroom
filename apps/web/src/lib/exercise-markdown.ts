import MarkdownIt from 'markdown-it'
import { t } from '../i18n'
import type { SourceLanguage } from '@classroom/contracts'
import { validSourceFilename } from './source-file'
import { enableMarkdownMath } from './markdown-math'

// Labels resolve lazily so they follow the active locale.
export const exerciseFields = [
  {
    key: 'title',
    get label() {
      return t('lib.fields.title')
    },
    limit: 100,
  },
  {
    key: 'topic',
    get label() {
      return t('lib.fields.topic')
    },
    limit: 100,
  },
  {
    key: 'filename',
    get label() {
      return t('lib.fields.filename')
    },
    limit: 80,
  },
  {
    key: 'description',
    get label() {
      return t('lib.fields.description')
    },
    limit: 100000,
  },
  {
    key: 'input',
    get label() {
      return t('lib.fields.input')
    },
    limit: 10000,
  },
  {
    key: 'output',
    get label() {
      return t('lib.fields.output')
    },
    limit: 10000,
  },
  {
    key: 'sampleInput',
    get label() {
      return t('lib.fields.sampleInput')
    },
    limit: 65536,
  },
  {
    key: 'sampleOutput',
    get label() {
      return t('lib.fields.sampleOutput')
    },
    limit: 65536,
  },
  {
    key: 'code',
    get label() {
      return t('lib.fields.code')
    },
    limit: 100000,
  },
] as const
export type ExerciseField = (typeof exerciseFields)[number]['key']
export interface MarkdownImport {
  language?: SourceLanguage
  fields: Partial<Record<ExerciseField, string>>
  warnings: string[]
  errors: string[]
}

const markdown = enableMarkdownMath(new MarkdownIt({ html: false }))
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
/** Parse heading sections from source line maps so fenced headings stay literal. */
export function parseExerciseMarkdown(source: string): MarkdownImport {
  const normalized = source.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
  const fields: MarkdownImport['fields'] = {}
  let language: SourceLanguage | undefined
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
    let content = value
    if (['sampleInput', 'sampleOutput', 'code'].includes(field)) {
      const sections = markdown.parse(value, {})
      const blocks = sections.filter((token) => ['fence', 'code_block'].includes(token.type))
      if (blocks.length) {
        content = blocks.map((token) => token.content.replace(/\n$/, '')).join('\n\n')
        if (sections.some((token) => token.type === 'paragraph_open'))
          warnings.push(
            t('lib.markdown.skippedProse', {
              label: exerciseFields.find((item) => item.key === field)!.label,
            }),
          )
        if (field === 'code' && !language) {
          const info = blocks
            .find((token) => token.type === 'fence')
            ?.info.trim()
            .toLowerCase()
          if (info && ['python', 'py', 'python3'].includes(info)) language = 'python'
          else if (info && ['cpp', 'c++', 'c++17', 'c++20'].includes(info)) language = 'cpp'
        }
      }
    } else if (['title', 'topic', 'filename'].includes(field))
      content = value.replace(/^`([^`\n]+)`$/, '$1')
    if (fields[field] !== undefined) {
      if (field !== 'description')
        warnings.push(
          t('lib.markdown.mergedSections', {
            label: exerciseFields.find((item) => item.key === field)!.label,
          }),
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
      if (
        ['fence', 'code_block', 'blockquote_open', 'math_block', 'math_block_eqno'].includes(
          token.type,
        ) &&
        token.map
      )
        for (let line = token.map[0]; line < token.map[1]; line++) excluded.add(line)
    }
    fields.description = body
      .filter((line, index) => {
        if (excluded.has(index)) return true
        const languageLine = line.match(/^\s*(?:语言|默认语言|language)\s*[:：]\s*(.*?)\s*$/i)
        if (languageLine) {
          const value = languageLine[1]!.trim().toLowerCase()
          if (['python', 'py', 'python3'].includes(value)) language = 'python'
          else if (['cpp', 'c++', 'c++17', 'c++20'].includes(value)) language = 'cpp'
          else errors.push(t('lib.markdown.unsupportedLanguage'))
          return false
        }
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
      errors.push(t('lib.markdown.fieldLimit', { label, limit }))
  }
  language ??= /\.py$/i.test(fields.filename ?? '') ? 'python' : undefined
  if (fields.filename && !validSourceFilename(fields.filename, language))
    errors.push(t('lib.markdown.filenameInvalid'))
  if (!Object.keys(fields).length) errors.push(t('lib.markdown.empty'))
  return { fields, warnings: [...new Set(warnings)], errors, ...(language ? { language } : {}) }
}
