import { t } from '../i18n'
import {
  exerciseImportLimits,
  type SourceLanguage,
  type SourceStarters,
} from '@classroom/contracts'
import { exerciseFields, parseExerciseMarkdown, type ExerciseField } from './exercise-markdown'
import { validSourceFilename } from './source-file'

export type ImportedExercise = Record<ExerciseField, string> & {
  status: 'draft'
  language?: SourceLanguage
  starters?: SourceStarters
}
export interface ExerciseImportEntry {
  name: string
  exercise?: ImportedExercise
  errors: string[]
  warnings: string[]
}

export async function readExerciseImport(file: File): Promise<ExerciseImportEntry> {
  const entry: ExerciseImportEntry = { name: file.name, errors: [], warnings: [] }
  try {
    if (!/\.(md|markdown|json)$/i.test(file.name)) throw new Error(t('lib.import.chooseFile'))
    if (file.size > exerciseImportLimits.fileBytes) throw new Error(t('lib.import.fileTooLarge'))
    let source: string
    try {
      source = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer())
    } catch {
      throw new Error(t('lib.import.utf8'))
    }
    if (source.includes('\0')) throw new Error(t('lib.import.invalidChars'))
    let fields: Partial<Record<ExerciseField, string>>
    let language: SourceLanguage | undefined
    let starters: SourceStarters | undefined
    if (/\.json$/i.test(file.name)) {
      let value: unknown
      try {
        value = JSON.parse(source.replace(/^\uFEFF/, ''))
      } catch {
        throw new Error(t('lib.import.invalidJson'))
      }
      if (
        !value ||
        typeof value !== 'object' ||
        exerciseFields.some(
          ({ key }) => typeof (value as Record<string, unknown>)[key] !== 'string',
        )
      )
        throw new Error(t('lib.import.notBackup'))
      fields = value as Record<ExerciseField, string>
      const metadata = value as Record<string, unknown>
      if (metadata.language !== undefined && !['cpp', 'python'].includes(String(metadata.language)))
        throw new Error(t('lib.import.unsupportedLanguage'))
      language = metadata.language as SourceLanguage | undefined
      if (metadata.starters !== undefined) {
        if (
          !metadata.starters ||
          typeof metadata.starters !== 'object' ||
          Array.isArray(metadata.starters)
        )
          throw new Error(t('lib.import.invalidStarters'))
        starters = {}
        for (const [key, source] of Object.entries(metadata.starters)) {
          if (
            !['cpp', 'python'].includes(key) ||
            typeof source !== 'string' ||
            source.length > 100000 ||
            source.includes('\0')
          )
            throw new Error(t('lib.import.startersInvalid'))
          starters[key as SourceLanguage] = source
        }
      }
    } else {
      const parsed = parseExerciseMarkdown(source)
      fields = parsed.fields
      language = parsed.language
      entry.errors.push(...parsed.errors)
      entry.warnings.push(...parsed.warnings)
    }
    const exercise = Object.fromEntries(
      exerciseFields.map(({ key }) => [key, fields[key] ?? '']),
    ) as Record<ExerciseField, string>
    if (Object.values(exercise).some((value) => value.includes('\0')))
      entry.errors.push(t('lib.import.nullChar'))
    for (const key of ['title', 'topic', 'filename'] as const) exercise[key] = exercise[key].trim()
    for (const { key, label, limit } of exerciseFields) {
      if (exercise[key].length > limit && !entry.errors.some((error) => error.startsWith(label)))
        entry.errors.push(t('lib.import.fieldLimit', { label, limit }))
    }
    language ??= /\.py$/i.test(exercise.filename) ? 'python' : 'cpp'
    if (
      exercise.filename &&
      !validSourceFilename(exercise.filename, language) &&
      !entry.errors.length
    )
      entry.errors.push(t('lib.import.filenameInvalid'))
    entry.exercise = {
      ...exercise,
      status: 'draft',
      language,
      starters: { ...starters, [language]: starters?.[language] ?? exercise.code },
    }
  } catch (error) {
    entry.errors.push(error instanceof Error ? error.message : t('lib.import.readFailed'))
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
    if (used.has(key)) conflicts.set(index, t('lib.import.filenameInUse', { filename }))
    const previous = batch.get(key)
    if (previous !== undefined) {
      const message = t('lib.import.filenameDuplicate', { filename })
      conflicts.set(index, message)
      conflicts.set(previous, message)
    } else batch.set(key, index)
  }
  return conflicts
}

export function exerciseImportBodySize(exercises: ImportedExercise[]): number {
  return new TextEncoder().encode(JSON.stringify({ exercises })).byteLength
}
