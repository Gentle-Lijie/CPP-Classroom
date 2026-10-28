<script setup lang="ts" generic="T extends boolean | string[] = boolean">
import { computed } from 'vue'
import { CheckboxRoot, CheckboxIndicator } from 'reka-ui'
import { Check, Minus } from '@lucide/vue'
import { updateCheckedValue } from './value'
const props = withDefaults(
  defineProps<{
    modelValue?: T
    value?: string
    checked?: boolean
    indeterminate?: boolean
    disabled?: boolean
    required?: boolean
    name?: string
  }>(),
  { checked: undefined },
)
const emit = defineEmits<{ 'update:modelValue': [value: T]; change: [checked: boolean] }>()
const state = computed<boolean | 'indeterminate'>(() =>
  props.indeterminate
    ? 'indeterminate'
    : Array.isArray(props.modelValue)
      ? props.modelValue.includes(props.value ?? '')
      : (props.checked ?? props.modelValue === true),
)
function update(checked: boolean | 'indeterminate') {
  const next = checked === true
  emit(
    'update:modelValue',
    updateCheckedValue(props.modelValue ?? false, props.value ?? '', next) as T,
  )
  emit('change', next)
}
</script>
<template>
  <CheckboxRoot
    :model-value="state"
    :disabled="disabled"
    :required="required"
    :name="name"
    :value="value"
    class="ui-checkbox"
    data-ui="checkbox"
    @update:model-value="update">
    <CheckboxIndicator class="ui-checkbox-indicator">
      <Minus v-if="indeterminate" :size="13" />
      <Check v-else :size="13" />
    </CheckboxIndicator>
  </CheckboxRoot>
</template>
