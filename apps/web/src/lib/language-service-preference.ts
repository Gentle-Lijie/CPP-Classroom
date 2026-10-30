import type { SourceLanguage } from '@classroom/contracts'

function key(language: SourceLanguage) {
  return `classroom-language-service:${language}`
}

export function languageServicePreferred(language: SourceLanguage): boolean {
  try {
    return localStorage.getItem(key(language)) === 'enabled'
  } catch {
    return false
  }
}

export function setLanguageServicePreferred(language: SourceLanguage, enabled: boolean): void {
  try {
    localStorage.setItem(key(language), enabled ? 'enabled' : 'disabled')
  } catch {
    // The current editor can still use the service when storage is unavailable.
  }
}
