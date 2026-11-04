<script setup lang="ts">
import { notify } from '@/lib/notifications'
import { useI18n } from 'vue-i18n'
const { t } = useI18n()
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
        return (label ? label + t('ui.form.separator') : '') + field.validationMessage
      })
    notify(errors.join('\n') || t('ui.form.fallback'), 'error')
    invalid[0]?.focus()
  }
}
</script>
<template>
  <form novalidate @submit.prevent="submit">
    <slot />
  </form>
</template>
