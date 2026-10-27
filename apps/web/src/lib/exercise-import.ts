import { exerciseImportLimits } from '@classroom/contracts'
import { exerciseFields, parseExerciseMarkdown, type ExerciseField } from './exercise-markdown'
import { validSourceFilename } from './source-file'

export type ImportedExercise = Record<ExerciseField, string> & { status: '草稿' }
export interface ExerciseImportEntry {
  name: string
  exercise?: ImportedExercise
  errors: string[]
  warnings: string[]
}

export async function readExerciseImport(file: File): Promise<ExerciseImportEntry> {
  const entry: ExerciseImportEntry = { name: file.name, errors: [], warnings: [] }
  try {
    if (!/\.(md|markdown|json)$/i.test(file.name))
      throw new Error('请选择 .md、.markdown 或题目备份 .json 文件')
    if (file.size > exerciseImportLimits.fileBytes) throw new Error('文件过大，最多 1 MiB')
    let source: string
    try {
      source = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer())
    } catch {
      throw new Error('无法读取文件，请使用 UTF-8 编码')
    }
    if (source.includes('\0')) throw new Error('文件包含无效字符，请上传文本文件')
    let fields: Partial<Record<ExerciseField, string>>
    if (/\.json$/i.test(file.name)) {
      let value: unknown
      try {
        value = JSON.parse(source.replace(/^\uFEFF/, ''))
      } catch {
        throw new Error('JSON 格式无效，请上传题目备份文件')
      }
      if (
        !value ||
        typeof value !== 'object' ||
        exerciseFields.some(
          ({ key }) => typeof (value as Record<string, unknown>)[key] !== 'string',
        )
      )
        throw new Error('这不是有效的题目备份文件')
      fields = value as Record<ExerciseField, string>
    } else {
      const parsed = parseExerciseMarkdown(source)
      fields = parsed.fields
      entry.errors.push(...parsed.errors)
      entry.warnings.push(...parsed.warnings)
    }
    const exercise = Object.fromEntries(
      exerciseFields.map(({ key }) => [key, fields[key] ?? '']),
    ) as Record<ExerciseField, string>
    if (Object.values(exercise).some((value) => value.includes('\0')))
      entry.errors.push('题目包含无效的空字符，请修改文件后重新上传')
    for (const key of ['title', 'topic', 'filename'] as const) exercise[key] = exercise[key].trim()
    for (const { key, label, limit } of exerciseFields) {
      if (exercise[key].length > limit && !entry.errors.some((error) => error.startsWith(label)))
        entry.errors.push(`${label}超过 ${limit} 字符，请缩短后重新上传。`)
    }
    if (exercise.filename && !validSourceFilename(exercise.filename) && !entry.errors.length)
      entry.errors.push('源文件名格式无效，请使用单个 .cpp、.cc 或 .cxx 文件名')
    entry.exercise = { ...exercise, status: '草稿' }
  } catch (error) {
    entry.errors.push(error instanceof Error ? error.message : '文件读取失败')
  }
  return entry
}

export function exerciseImportConflicts(
  entries: ExerciseImportEntry[],
  selected: number[],
  existing: { filename: string }[],
): Map<number, string> {
  const conflicts = new Map<number, string>()
  const used = new Set(
    existing.map(({ filename }) => filename.trim().toLowerCase()).filter(Boolean),
  )
  const batch = new Map<string, number>()
  for (const index of selected) {
    const filename = entries[index]?.exercise?.filename
    if (!filename) continue
    const key = filename.toLowerCase()
    if (used.has(key)) conflicts.set(index, `源文件名「${filename}」已在课堂中使用`)
    const previous = batch.get(key)
    if (previous !== undefined) {
      const message = `所选文件的源文件名「${filename}」重复（不区分大小写）`
      conflicts.set(index, message)
      conflicts.set(previous, message)
    } else batch.set(key, index)
  }
  return conflicts
}

export function exerciseImportBodySize(exercises: ImportedExercise[]): number {
  return new TextEncoder().encode(JSON.stringify({ exercises })).byteLength
}
