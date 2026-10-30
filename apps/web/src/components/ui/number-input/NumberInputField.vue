<script setup lang="ts">
import { useId } from 'vue'
import NumberInput from './NumberInput.vue'

const model = defineModel<number>({ required: true })
defineProps<{
  label: string
  hint?: string
  unit?: string
  min?: number
  max?: number
  step?: number
  required?: boolean
}>()
const id = useId()
const hintId = `${id}-hint`
</script>

<template>
  <div class="number-input-field">
    <div class="number-input-field-heading">
      <label :for="id">{{ label }}</label>
      <small v-if="hint" :id="hintId">{{ hint }}</small>
    </div>
    <div class="number-input-field-control">
      <NumberInput
        :id="id"
        v-model="model"
        :min="min"
        :max="max"
        :step="step"
        :required="required"
        :aria-describedby="hint ? hintId : undefined"
        :class="{ 'has-unit': unit }" />
      <span v-if="unit" class="number-input-field-unit" aria-hidden="true">{{ unit }}</span>
    </div>
  </div>
</template>

<style scoped>
.number-input-field {
  min-width: 0;
}
.number-input-field-heading {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 4px 8px;
  margin-bottom: 5px;
  color: var(--ui-text);
  font-size: 15px;
  font-weight: 500;
}
.number-input-field-heading small {
  color: var(--ui-muted);
  font-size: 13px;
  font-weight: 400;
}
.number-input-field-control {
  position: relative;
}
.number-input-field-control :deep(.has-unit .ui-number-input) {
  padding-right: 64px;
}
.number-input-field-unit {
  position: absolute;
  right: 34px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--ui-muted);
  font-size: 13px;
  pointer-events: none;
}
</style>
