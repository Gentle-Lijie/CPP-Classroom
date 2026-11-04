<script setup lang="ts">
import { Select, SelectOption } from '@/components/ui/select'
import type { SourceLanguage } from '@classroom/contracts'
import PythonBeta from './PythonBeta.vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  modelValue: SourceLanguage
  disabled?: boolean
  label?: string
}>()
const { t } = useI18n()
const ariaLabel = computed(() => props.label ?? t('exercises.language.defaultLabel'))
const emit = defineEmits<{ 'update:modelValue': [value: SourceLanguage] }>()
</script>

<template>
  <Select
    :model-value="modelValue"
    :disabled="disabled"
    :aria-label="ariaLabel"
    class="language-select"
    @update:model-value="emit('update:modelValue', $event === 'python' ? 'python' : 'cpp')">
    <SelectOption value="cpp">C++</SelectOption>
    <SelectOption value="python">
      <span class="python-option">
        Python
        <PythonBeta />
      </span>
    </SelectOption>
  </Select>
</template>

<style scoped>
.language-select {
  min-width: 112px;
  width: auto;
}
.python-option {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
</style>
