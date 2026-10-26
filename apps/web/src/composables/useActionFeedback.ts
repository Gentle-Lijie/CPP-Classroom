import { watch, type WatchSource } from 'vue'
import { notify, type NotificationKind } from '../lib/notifications'

export function useActionFeedback(source: WatchSource<string>, kind: NotificationKind = 'error') {
  // Observe the reset between retries, including when both writes happen in one event.
  watch(
    source,
    (message) => {
      if (message) notify(message, kind)
    },
    { flush: 'sync' },
  )
}
