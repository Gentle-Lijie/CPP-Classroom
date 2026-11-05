import { describe, expect, it } from 'vitest'
import { createI18n, type LocaleMessageValue, type VueMessageType } from 'vue-i18n'

const modules = import.meta.glob('./locales/{zh,en}/*.ts', { eager: true })

type LocaleMessage = Record<string, LocaleMessageValue<VueMessageType>>
const locales = Object.fromEntries(
  Object.entries(modules).map(([path, mod]) => [
    path.match(/\/locales\/([^/]+)\//)?.[1] ?? '',
    (mod as { default: LocaleMessage }).default,
  ]),
) as Record<'zh' | 'en', LocaleMessage>

function flatten(value: unknown, prefix = ''): string[] {
  if (typeof value === 'string') return [prefix]
  if (!value || Array.isArray(value) || typeof value !== 'object') return []
  return Object.entries(value).flatMap(([key, item]) =>
    flatten(item, prefix ? `${prefix}.${key}` : key),
  )
}

describe('translation message syntax', () => {
  it('compiles every message in every supported locale', () => {
    const failures: string[] = []
    for (const [locale, messages] of Object.entries(locales) as [
      keyof typeof locales,
      LocaleMessage,
    ][]) {
      const i18n = createI18n({
        legacy: false,
        locale,
        fallbackLocale: 'zh',
        messages: { [locale]: messages },
      })
      for (const key of flatten(messages)) {
        try {
          i18n.global.t(key)
        } catch (error) {
          failures.push(
            `${locale}.${key}: ${error instanceof Error ? error.message : String(error)}`,
          )
        }
      }
    }
    expect(failures).toEqual([])
  })
})
