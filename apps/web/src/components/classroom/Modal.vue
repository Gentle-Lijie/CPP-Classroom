<script setup lang="ts">
import {
  DialogRoot,
  DialogPortal,
  DialogOverlay,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from 'reka-ui'
import { X } from '@lucide/vue'
defineProps<{ open: boolean; title: string; description?: string; wide?: boolean }>()
defineEmits<{ 'update:open': [value: boolean] }>()
</script>
<template>
  <DialogRoot :open="open" @update:open="$emit('update:open', $event)">
    <DialogPortal
      ><DialogOverlay class="modal-overlay" /><DialogContent
        class="modal-content"
        :class="{ wide }"
      >
        <div class="modal-heading">
          <div>
            <DialogTitle class="modal-title">{{ title }}</DialogTitle
            ><DialogDescription class="muted">{{
              description || '所有更改仅用于本次前端演示。'
            }}</DialogDescription>
          </div>
          <DialogClose class="icon-button" aria-label="关闭对话框"><X :size="18" /></DialogClose>
        </div>
        <slot /> </DialogContent
    ></DialogPortal>
  </DialogRoot>
</template>
