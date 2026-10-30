<script setup lang="ts">
import {
  DialogRoot,
  DialogPortal,
  DialogOverlay,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from 'reka-ui'
import { X } from '@lucide/vue'
import { Button } from '@/components/ui/button'

defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()
</script>

<template>
  <DialogRoot :open="open" @update:open="!$event && emit('close')">
    <DialogPortal>
      <DialogOverlay class="welcome-overlay" />
      <DialogContent class="welcome-content">
        <DialogTitle class="welcome-sr-only">欢迎使用 Codemia</DialogTitle>
        <DialogDescription class="welcome-sr-only">Codemia 编程课堂介绍</DialogDescription>
        <Button
          class="welcome-close"
          variant="plain"
          type="button"
          aria-label="关闭欢迎海报"
          @click="emit('close')">
          <X :size="20" />
        </Button>
        <img
          class="welcome-image"
          src="/brand/poster.png"
          alt="Codemia 编程课堂：在浏览器中编写代码、授课与管理课堂。" />
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

<style scoped>
.welcome-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgb(5 13 30 / 70%);
}
.welcome-content {
  position: fixed;
  top: 50%;
  left: 50%;
  z-index: 1001;
  width: min(1200px, calc(100vw - 96px));
  max-height: calc(100vh - 96px);
  transform: translate(-50%, -50%);
  outline: none;
}
.welcome-image {
  display: block;
  width: 100%;
  max-height: calc(100vh - 96px);
  object-fit: contain;
  border-radius: 20px;
  box-shadow: 0 24px 80px rgb(0 0 0 / 35%);
}
.welcome-close {
  position: absolute;
  top: 14px;
  right: 14px;
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  border: 1px solid rgb(9 25 53 / 12%);
  border-radius: 50%;
  background: white;
  color: #14213d;
  cursor: pointer;
  box-shadow: 0 2px 12px rgb(0 0 0 / 12%);
}
.welcome-close:focus-visible {
  outline: 3px solid #2563eb;
  outline-offset: 2px;
}
.welcome-sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
}
</style>
