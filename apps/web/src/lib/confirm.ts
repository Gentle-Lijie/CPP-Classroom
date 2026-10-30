import { shallowRef } from 'vue'
interface Confirmation {
  message: string
  destructive: boolean
  resolve: (confirmed: boolean) => void
}
export const confirmation = shallowRef<Confirmation>()
export function confirmAction(
  message: string,
  options: { destructive?: boolean } = {},
): Promise<boolean> {
  confirmation.value?.resolve(false)
  return new Promise((resolve) => {
    confirmation.value = { message, destructive: options.destructive === true, resolve }
  })
}
export function resolveConfirmation(confirmed: boolean) {
  const pending = confirmation.value
  confirmation.value = undefined
  pending?.resolve(confirmed)
}
