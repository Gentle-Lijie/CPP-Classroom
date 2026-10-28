<script setup lang="ts">
import { CollapsibleRoot, CollapsibleTrigger, CollapsibleContent } from 'reka-ui'
import { ChevronRight } from '@lucide/vue'
defineProps<{ title: string }>()
</script>
<template>
  <CollapsibleRoot class="ui-disclosure">
    <CollapsibleTrigger class="ui-disclosure-trigger">
      <ChevronRight :size="16" />
      {{ title }}
    </CollapsibleTrigger>
    <CollapsibleContent class="ui-disclosure-content"><slot /></CollapsibleContent>
  </CollapsibleRoot>
</template>
