<script setup lang="ts">
import { ref } from 'vue'
defineOptions({ inheritAttrs: false })
const model = defineModel<string>({ default: '' })
const element = ref<HTMLTextAreaElement>()
const error = ref('')
defineExpose({ element, focus: () => element.value?.focus() })
</script>
<template>
  <textarea
    ref="element"
    v-model="model"
    v-bind="$attrs"
    data-ui="textarea"
    :aria-invalid="error ? true : undefined"
    @invalid.prevent="error = element?.validationMessage ?? '请填写内容'"
    @input="error = ''"
  />
</template>
