import { push } from 'notivue'

export type NotificationKind = 'success' | 'error' | 'info' | 'warning'

export function notify(message: string, kind: NotificationKind = 'success') {
  return push[kind]({ message, duration: 6000 })
}

export function clearNotifications() {
  push.destroyAll()
}
