<script setup lang="ts">
import { ref } from 'vue'
import {
  NumberFieldRoot,
  NumberFieldInput,
  NumberFieldIncrement,
  NumberFieldDecrement,
} from 'reka-ui'
import { Plus, Minus } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
defineOptions({ inheritAttrs: false })
const { t } = useI18n()
const model = defineModel<number>({ required: true })
defineProps<{
  min?: number | string
  max?: number | string
  step?: number | string
  disabled?: boolean
  disabledReason?: string
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
      :format-options="{ useGrouping: false }"
      :disabled="disabled"
      :name="name"
      class="ui-number-root">
      <NumberFieldInput
        v-bind="$attrs"
        :required="required"
        class="ui-number-input"
        :aria-invalid="error ? true : undefined"
        @invalid.prevent="error = t('ui.numberInput.invalid')"
        @input="error = ''" />
      <span class="ui-number-actions">
        <NumberFieldIncrement
          :aria-label="t('ui.numberInput.increase')"
          :data-disabled-reason="disabled ? disabledReason : t('ui.numberInput.max', { max })">
          <Plus :size="12" />
        </NumberFieldIncrement>
        <NumberFieldDecrement
          :aria-label="t('ui.numberInput.decrease')"
          :data-disabled-reason="disabled ? disabledReason : t('ui.numberInput.min', { min })">
          <Minus :size="12" />
        </NumberFieldDecrement>
      </span>
    </NumberFieldRoot>
    <small v-if="error" class="ui-field-error">{{ error }}</small>
  </div>
</template>
