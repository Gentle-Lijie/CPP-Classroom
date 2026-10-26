<script setup lang="ts">
import { computed } from 'vue'
import {
  SelectRoot,
  SelectTrigger,
  SelectValue,
  SelectIcon,
  SelectPortal,
  SelectContent,
  SelectViewport,
  SelectScrollUpButton,
  SelectScrollDownButton,
} from 'reka-ui'
import { ChevronDown, ChevronUp } from '@lucide/vue'
import { selectValue, EMPTY_SELECT_VALUE } from './value'
defineOptions({ inheritAttrs: false })
const props = defineProps<{
  modelValue?: string | number
  modelModifiers?: { number?: boolean }
  disabled?: boolean
  required?: boolean
  name?: string
  placeholder?: string
}>()
const emit = defineEmits<{ 'update:modelValue': [value: string | number] }>()
const value = computed(() => selectValue(props.modelValue ?? ''))
function update(value: unknown) {
  const next = value === EMPTY_SELECT_VALUE ? '' : String(value ?? '')
  emit(
    'update:modelValue',
    props.modelModifiers?.number || typeof props.modelValue === 'number' ? Number(next) : next,
  )
}
</script>
<template>
  <SelectRoot
    :model-value="value"
    :disabled="disabled"
    :required="required"
    :name="name"
    @update:model-value="update"
  >
    <SelectTrigger v-bind="$attrs" class="ui-select-trigger" data-ui="select">
      <SelectValue :placeholder="placeholder ?? '请选择'" />
      <SelectIcon as-child><ChevronDown :size="16" /></SelectIcon>
    </SelectTrigger>
    <SelectPortal>
      <SelectContent
        class="ui-select-content"
        position="popper"
        :side-offset="5"
        :collision-padding="8"
      >
        <SelectScrollUpButton class="ui-select-scroll"
          ><ChevronUp :size="16"
        /></SelectScrollUpButton>
        <SelectViewport class="ui-select-viewport"><slot /></SelectViewport>
        <SelectScrollDownButton class="ui-select-scroll"
          ><ChevronDown :size="16"
        /></SelectScrollDownButton>
      </SelectContent>
    </SelectPortal>
  </SelectRoot>
</template>
