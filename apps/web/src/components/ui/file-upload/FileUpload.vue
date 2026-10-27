<script setup lang="ts">
import { ref } from 'vue'
import { Upload } from '@lucide/vue'
import { Button } from '@/components/ui/button'
defineProps<{ accept?: string; disabled?: boolean; multiple?: boolean }>()
const emit = defineEmits<{ change: [event: Event] }>()
const input = ref<HTMLInputElement>()
</script>
<template>
  <span class="ui-file-upload">
    <Button type="button" variant="outline" :disabled="disabled" @click="input?.click()"
      ><Upload :size="16" /><slot>选择文件</slot></Button
    >
    <input
      ref="input"
      type="file"
      :accept="accept"
      :multiple="multiple"
      :disabled="disabled"
      hidden
      tabindex="-1"
      @change="emit('change', $event)"
    />
  </span>
</template>
