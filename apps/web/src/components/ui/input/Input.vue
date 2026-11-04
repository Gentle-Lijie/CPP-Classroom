<script setup lang="ts">
import { computed, ref } from 'vue'
import type { InputHTMLAttributes } from 'vue'
import { useI18n } from 'vue-i18n'
defineOptions({ inheritAttrs: false })
const { t } = useI18n()
const [model, modifiers] = defineModel<string | number, 'number' | 'trim'>()
const props = defineProps<{ type?: InputHTMLAttributes['type']; value?: string | number }>()
const element = ref<HTMLInputElement>()
const error = ref('')
const value = computed({
  get: () => model.value ?? props.value ?? '',
  set: (value) => {
    const next = modifiers.trim && typeof value === 'string' ? value.trim() : value
    model.value = modifiers.number && next !== '' ? Number(next) : next
  },
})
defineExpose({ element, focus: () => element.value?.focus() })
</script>
<template>
  <input
    ref="element"
    v-bind="$attrs"
    v-model="value"
    :type="type ?? 'text'"
    data-ui="input"
    :aria-invalid="error ? true : undefined"
    @invalid.prevent="error = element?.validationMessage ?? t('ui.input.invalid')"
    @input="error = ''" />
</template>
