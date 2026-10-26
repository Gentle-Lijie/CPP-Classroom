import { computed, ref, watch } from 'vue'
export type ThemePreference = 'light' | 'dark' | 'system'
export const THEME_STORAGE_KEY = 'cpp-classroom-theme'
export function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system'
}
function storedPreference(): ThemePreference {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY)
    return isThemePreference(value) ? value : 'system'
  } catch {
    return 'system'
  }
}
const media = window.matchMedia('(prefers-color-scheme: dark)')
export const themePreference = ref<ThemePreference>(storedPreference())
const systemDark = ref(media.matches)
export const resolvedTheme = computed(() =>
  themePreference.value === 'system'
    ? systemDark.value
      ? 'dark'
      : 'light'
    : themePreference.value,
)
let initialized = false
export function initializeTheme() {
  if (initialized) return
  initialized = true
  watch(
    resolvedTheme,
    (theme) => {
      document.documentElement.classList.toggle('dark', theme === 'dark')
      document.documentElement.dataset.theme = theme
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute('content', theme === 'dark' ? '#18191c' : '#ffffff')
    },
    { immediate: true, flush: 'sync' },
  )
  media.addEventListener('change', (event) => {
    systemDark.value = event.matches
  })
  window.addEventListener('storage', (event) => {
    if (event.key === THEME_STORAGE_KEY || event.key === null)
      themePreference.value = isThemePreference(event.newValue) ? event.newValue : 'system'
  })
}
export function setThemePreference(value: unknown) {
  if (!isThemePreference(value)) return
  themePreference.value = value
  try {
    localStorage.setItem(THEME_STORAGE_KEY, value)
  } catch {
    /* Keep the current tab usable when storage is unavailable. */
  }
}
