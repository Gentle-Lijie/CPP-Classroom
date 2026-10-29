<script setup lang="ts">
import {
  DialogRoot,
  DialogPortal,
  DialogOverlay,
  DialogContent,
  DialogTitle,
  DialogClose,
} from 'reka-ui'
import { spotlight } from '@/lib/spotlight'
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
  <DialogRoot
    :modal="!spotlight.active"
    :open="open"
    @update:open="!busy && dismissible && $emit('update:open', $event)">
    <DialogPortal>
      <DialogOverlay class="modal-overlay" />
      <DialogContent
        class="modal-content"
        :class="{ wide }"
        :aria-busy="busy"
        @escape-key-down="(busy || !dismissible || spotlight.active) && $event.preventDefault()"
        @interact-outside="(busy || !dismissible || spotlight.active) && $event.preventDefault()">
        <div class="modal-heading">
          <div>
            <DialogTitle class="modal-title">{{ title }}</DialogTitle>
          </div>
          <DialogClose
            class="icon-button"
            aria-label="关闭对话框"
            :disabled="busy || !dismissible"
            :data-disabled-reason="busy ? '正在处理，请稍候再关闭对话框' : '请先完成当前操作'">
            <X :size="18" />
          </DialogClose>
        </div>
        <div class="modal-body"><slot /></div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
