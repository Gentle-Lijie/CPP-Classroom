<script setup lang="ts">
import { useSlots, type VNode } from 'vue'
import { SelectItem, SelectItemText, SelectItemIndicator } from 'reka-ui'
import { Check } from '@lucide/vue'
import { selectValue } from './value'
const props = defineProps<{ value?: string | number; disabled?: boolean }>()
const slots = useSlots()
function text(nodes: VNode[]): string {
  return nodes
    .map((node) =>
      typeof node.children === 'string'
        ? node.children
        : Array.isArray(node.children)
          ? text(node.children as VNode[])
          : '',
    )
    .join('')
    .trim()
}
function optionValue() {
  return selectValue(props.value ?? text(slots.default?.() ?? []))
}
</script>
<template>
  <SelectItem :value="optionValue()" :disabled="disabled" class="ui-select-option">
    <SelectItemText><slot /></SelectItemText>
    <SelectItemIndicator class="ui-select-indicator"><Check :size="16" /></SelectItemIndicator>
  </SelectItem>
</template>
