<script setup lang="ts">
import { ref } from 'vue'
const emit = defineEmits<{ submit: [event: Event] }>()
const errors = ref<string[]>([])
function submit(event: Event) {
  const form = event.currentTarget as HTMLFormElement
  errors.value = []
  if (form.checkValidity()) emit('submit', event)
  else {
    const invalid = [
      ...form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
        'input:invalid, textarea:invalid, select:invalid',
      ),
    ]
    errors.value = invalid
      .filter((field) => field.validationMessage)
      .map((field) => {
        const label =
          field.labels?.[0]?.textContent?.trim() || field.getAttribute('aria-label') || ''
        return (label ? label + '：' : '') + field.validationMessage
      })
    invalid[0]?.focus()
  }
}
</script>
<template>
  <form novalidate @submit.prevent="submit" @input="errors = []">
    <div v-if="errors.length" class="ui-form-errors" role="alert">
      <p v-for="(error, index) in errors" :key="index" class="ui-field-error">{{ error }}</p>
    </div>
    <slot />
  </form>
</template>
