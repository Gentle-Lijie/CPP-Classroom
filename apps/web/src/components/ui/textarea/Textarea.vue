<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
defineOptions({ inheritAttrs: false })
const { t } = useI18n()
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
    @invalid.prevent="error = element?.validationMessage ?? t('ui.textarea.invalid')"
    @input="error = ''" />
</template>
