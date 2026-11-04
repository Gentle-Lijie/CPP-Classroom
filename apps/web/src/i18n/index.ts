import { createI18n } from 'vue-i18n'

export const SUPPORTED_LOCALES = ['zh', 'en'] as const
export type Locale = (typeof SUPPORTED_LOCALES)[number]

const STORAGE_KEY = 'classroom.locale'

function loadLocaleModules(glob: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(glob).map(([path, mod]) => [
      path.slice(path.lastIndexOf('/') + 1).replace(/\.ts$/, ''),
      (mod as { default: Record<string, unknown> }).default,
    ]),
  )
}

const messages = {
  zh: loadLocaleModules(import.meta.glob('./locales/zh/*.ts', { eager: true })),
  en: loadLocaleModules(import.meta.glob('./locales/en/*.ts', { eager: true })),
}

function initialLocale(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved && (SUPPORTED_LOCALES as readonly string[]).includes(saved)) return saved as Locale
  } catch {
    // localStorage may be unavailable (private mode); fall back to Chinese.
  }
  return 'zh'
}

export const i18n = createI18n({
  legacy: false,
  locale: initialLocale(),
  fallbackLocale: 'zh',
  messages,
})

// For plain TypeScript modules outside components (lib/, composables helpers).
export const t = i18n.global.t

export function setLocale(locale: Locale) {
  i18n.global.locale.value = locale
  document.documentElement.lang = locale
  try {
    localStorage.setItem(STORAGE_KEY, locale)
  } catch {
    // Ignore unavailable localStorage; the choice just stays for this session.
  }
  window.dispatchEvent(new CustomEvent('classroom:locale-changed'))
}
