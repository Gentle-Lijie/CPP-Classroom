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
withDefaults(
  defineProps<{
    open: boolean
    title: string
    description?: string
    wide?: boolean
    busy?: boolean
    dismissible?: boolean
  }>(),
  { dismissible: true },
)
defineEmits<{ 'update:open': [value: boolean] }>()
</script>
<template>
  <DialogRoot :open="open" @update:open="!busy && dismissible && $emit('update:open', $event)">
    <DialogPortal
      ><DialogOverlay class="modal-overlay" /><DialogContent
        class="modal-content"
        :class="{ wide }"
        :aria-busy="busy"
        @escape-key-down="(busy || !dismissible) && $event.preventDefault()"
        @interact-outside="(busy || !dismissible) && $event.preventDefault()"
      >
        <div class="modal-heading">
          <div>
            <DialogTitle class="modal-title">{{ title }}</DialogTitle
            ><DialogDescription class="muted">{{
              description || '请核对信息后继续。'
            }}</DialogDescription>
          </div>
          <DialogClose class="icon-button" aria-label="关闭对话框" :disabled="busy || !dismissible"
            ><X :size="18"
          /></DialogClose>
        </div>
        <slot /> </DialogContent
    ></DialogPortal>
  </DialogRoot>
</template>
