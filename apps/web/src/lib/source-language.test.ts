import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  preferredLanguage,
  rememberLanguage,
  sourceLanguage,
  normalizeExerciseSources,
} from './source-language'

afterEach(() => vi.unstubAllGlobals())
describe('language context', () => {
  it('restores old backup source without borrowing current starter metadata', () => {
    const current = {
      language: 'cpp' as const,
      code: 'server',
      starters: { cpp: 'server', python: 'print(1)' },
    }
    const legacy = { code: 'local backup', filename: 'work.cpp' }
    const restored = { ...current, ...legacy, ...normalizeExerciseSources(legacy) }
    expect(restored.code).toBe('local backup')
    expect(restored.starters).toEqual({ cpp: 'local backup' })
    expect(
      normalizeExerciseSources({
        language: 'python',
        code: 'alias',
        starters: { cpp: 'cpp source', python: 'python source' },
      }),
    ).toEqual({
      language: 'python',
      code: 'python source',
      starters: { cpp: 'cpp source', python: 'python source' },
    })
  })
  it('keeps language selections separate by account, classroom and exercise', () => {
    const values = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    })
    rememberLanguage('one', 'class', 'exercise', 'python')
    expect(preferredLanguage('one', 'class', 'exercise', 'cpp')).toBe('python')
    expect(preferredLanguage('two', 'class', 'exercise', 'cpp')).toBe('cpp')
    expect(preferredLanguage('one', 'other', 'exercise', 'cpp')).toBe('cpp')
    expect(preferredLanguage('one', 'class', 'other', 'cpp')).toBe('cpp')
  })
  it('uses defaults when browser storage is unavailable and preserves legacy snapshot inference', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    })
    expect(() => rememberLanguage('a', 'b', 'c', 'python')).not.toThrow()
    expect(preferredLanguage('a', 'b', 'c', 'python')).toBe('python')
    expect(sourceLanguage({ filename: 'hello.py' })).toBe('python')
    expect(sourceLanguage({ language: 'cpp', filename: 'hello.py' })).toBe('cpp')
    expect(sourceLanguage({ filename: 'hello.cpp' })).toBe('cpp')
  })
})
