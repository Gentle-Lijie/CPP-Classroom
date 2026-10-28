<script setup lang="ts">
import { ref } from 'vue'
import {
  NumberFieldRoot,
  NumberFieldInput,
  NumberFieldIncrement,
  NumberFieldDecrement,
} from 'reka-ui'
import { Plus, Minus } from '@lucide/vue'
defineOptions({ inheritAttrs: false })
const model = defineModel<number>({ required: true })
defineProps<{
  min?: number | string
  max?: number | string
  step?: number | string
  disabled?: boolean
  required?: boolean
  name?: string
}>()
const error = ref('')
</script>
<template>
  <div class="ui-number-field" data-ui="number-input">
    <NumberFieldRoot
      v-model="model"
      :min="min === undefined ? undefined : Number(min)"
      :max="max === undefined ? undefined : Number(max)"
      :step="Number(step ?? 1)"
      :disabled="disabled"
      :name="name"
      class="ui-number-root">
      <NumberFieldInput
        v-bind="$attrs"
        :required="required"
        class="ui-number-input"
        :aria-invalid="error ? true : undefined"
        @invalid.prevent="error = '请填写有效数值'"
        @input="error = ''" />
      <span class="ui-number-actions">
        <NumberFieldIncrement aria-label="增加数值"><Plus :size="12" /></NumberFieldIncrement>
        <NumberFieldDecrement aria-label="减少数值"><Minus :size="12" /></NumberFieldDecrement>
      </span>
    </NumberFieldRoot>
    <small v-if="error" class="ui-field-error">{{ error }}</small>
  </div>
</template>
