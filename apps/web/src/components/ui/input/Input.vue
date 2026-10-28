<script setup lang="ts">
import { computed, ref } from 'vue'
import type { InputHTMLAttributes } from 'vue'
defineOptions({ inheritAttrs: false })
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
    @invalid.prevent="error = element?.validationMessage ?? '请核对输入内容'"
    @input="error = ''" />
</template>
