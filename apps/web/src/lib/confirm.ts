import { shallowRef } from 'vue'
interface Confirmation {
  message: string
  resolve: (confirmed: boolean) => void
}
export const confirmation = shallowRef<Confirmation>()
export function confirmAction(message: string): Promise<boolean> {
  confirmation.value?.resolve(false)
  return new Promise((resolve) => {
    confirmation.value = { message, resolve }
  })
}
export function resolveConfirmation(confirmed: boolean) {
  const pending = confirmation.value
  confirmation.value = undefined
  pending?.resolve(confirmed)
}
