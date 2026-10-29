import { exerciseStarterCode, type SourceLanguage, type SourceStarters } from '@classroom/contracts'

/** Old snapshots predate language metadata and were all C++. */
export function sourceLanguage(source?: { language?: string; filename?: string }): SourceLanguage {
  return source?.language === 'python' ||
    (!source?.language && /\.py$/i.test(source?.filename ?? ''))
    ? 'python'
    : 'cpp'
}

export function preferredLanguage(
  user: string | undefined,
  classroom: string,
  exercise: string,
  fallback: SourceLanguage,
): SourceLanguage {
  try {
    const saved = localStorage.getItem(`classroom-language:${user}:${classroom}:${exercise}`)
    return saved === 'python' || saved === 'cpp' ? saved : fallback
  } catch {
    return fallback
  }
}

export function rememberLanguage(
  user: string | undefined,
  classroom: string,
  exercise: string,
  language: SourceLanguage,
) {
  try {
    localStorage.setItem(`classroom-language:${user}:${classroom}:${exercise}`, language)
  } catch {
    // Language selection remains usable without browser storage.
  }
}

/** Replace, rather than merge, legacy backup metadata with the active exercise. */
export function normalizeExerciseSources(source: {
  language?: SourceLanguage
  filename?: string
  code: string
  starters?: SourceStarters
}) {
  const language = sourceLanguage(source)
  const code = exerciseStarterCode({ ...source, language }, language)
  return { language, code, starters: { ...source.starters, [language]: code } }
}
