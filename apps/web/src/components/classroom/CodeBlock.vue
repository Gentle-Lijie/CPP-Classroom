<script setup lang="ts">
import { computed } from 'vue'
import { renderCodeBlock } from '@/lib/code-block'
import { useCodeBlockCopy } from '@/composables/useCodeBlockCopy'
const props = withDefaults(
  defineProps<{
    source: string
    language?: string
    label?: string
    toolbar?: boolean
    emptyText?: string
  }>(),
  { language: 'text', toolbar: true },
)
const html = computed(() => renderCodeBlock(props.source, props))
const copy = useCodeBlockCopy()
</script>
<template>
  <!-- Source and labels are escaped; markup comes only from the shared renderer. -->
  <!-- eslint-disable-next-line vue/no-v-html -->
  <div class="code-block-host" @click="copy" v-html="html" />
</template>
