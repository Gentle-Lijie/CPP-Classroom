<script setup lang="ts">
import { notify } from '@/lib/notifications'
const emit = defineEmits<{ submit: [event: Event] }>()
function submit(event: Event) {
  const form = event.currentTarget as HTMLFormElement
  if (form.checkValidity()) emit('submit', event)
  else {
    const invalid = [
      ...form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
        'input:invalid, textarea:invalid, select:invalid',
      ),
    ]
    const errors = invalid
      .filter((field) => field.validationMessage)
      .map((field) => {
        const label =
          field.labels?.[0]?.textContent?.trim() || field.getAttribute('aria-label') || ''
        return (label ? label + '：' : '') + field.validationMessage
      })
    notify(errors.join('\n') || '请核对表单内容后重试', 'error')
    invalid[0]?.focus()
  }
}
</script>
<template>
  <form novalidate @submit.prevent="submit">
    <slot />
  </form>
</template>
