import { onScopeDispose } from 'vue'
import { notify } from '@/lib/notifications'
import { t } from '../i18n'
import { codeBlockText } from '@/lib/code-block'

export function useCodeBlockCopy() {
  const timers = new Set<ReturnType<typeof setTimeout>>()
  let disposed = false
  onScopeDispose(() => {
    disposed = true
    timers.forEach(clearTimeout)
  })
  return async (event: MouseEvent) => {
    const button = (event.target as Element).closest<HTMLButtonElement>('[data-code-copy]')
    const block = button?.closest('[data-code-block]')
    if (!button || !block || button.disabled) return
    button.disabled = true
    try {
      await navigator.clipboard.writeText(codeBlockText(block))
      if (disposed) return
      const label = button.querySelector('.code-copy-label')
      if (label) label.textContent = t('lib.copy.copied')
      const timer = setTimeout(() => {
        if (label) label.textContent = t('lib.copy.copy')
        timers.delete(timer)
      }, 1600)
      timers.add(timer)
    } catch {
      notify(t('lib.copy.failed'), 'error')
    } finally {
      button.disabled = false
    }
  }
}
