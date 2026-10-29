<script setup lang="ts">
import { computed } from 'vue'
import { renderMarkdown } from '@/lib/markdown'
import { useCodeBlockCopy } from '@/composables/useCodeBlockCopy'
const props = defineProps<{ source: string }>()
const copy = useCodeBlockCopy()
const html = computed(() => renderMarkdown(props.source))
</script>
<template>
  <!-- Raw HTML and unsafe URL protocols are rejected by the shared renderer. -->
  <!-- eslint-disable-next-line vue/no-v-html -->
  <div class="markdown-content" @click="copy" v-html="html" />
</template>
