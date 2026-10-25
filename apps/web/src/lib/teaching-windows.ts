import { notify } from '@/data/demo'
export function openTeachingWindow(url: string, name: string, width = 1180, height = 820) {
  const left = Math.max(0, window.screenX + 60)
  const top = Math.max(0, window.screenY + 50)
  const popup = window.open(
    url,
    name,
    `popup=yes,width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`,
  )
  if (!popup) {
    notify('浏览器拦截了独立窗口，请允许本站弹出窗口后重试')
    return false
  }
  popup.focus()
  return true
}
