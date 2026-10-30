import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  languageServicePreferred,
  setLanguageServicePreferred,
} from './language-service-preference'

afterEach(() => vi.unstubAllGlobals())

describe('language service preferences', () => {
  it('remembers each language independently until disabled', () => {
    const values = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    })
    expect(languageServicePreferred('cpp')).toBe(false)
    setLanguageServicePreferred('cpp', true)
    expect(languageServicePreferred('cpp')).toBe(true)
    expect(languageServicePreferred('python')).toBe(false)
    setLanguageServicePreferred('python', true)
    setLanguageServicePreferred('cpp', false)
    expect(languageServicePreferred('cpp')).toBe(false)
    expect(languageServicePreferred('python')).toBe(true)
  })

  it('continues safely when browser storage is unavailable', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('unavailable')
      },
      setItem: () => {
        throw new Error('unavailable')
      },
    })
    expect(languageServicePreferred('cpp')).toBe(false)
    expect(() => setLanguageServicePreferred('cpp', true)).not.toThrow()
  })
})
