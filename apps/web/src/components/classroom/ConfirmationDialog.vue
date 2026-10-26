<script setup lang="ts">
import { Button } from '@/components/ui/button'
import Modal from './Modal.vue'
import { confirmation, resolveConfirmation } from '@/lib/confirm'
</script>
<template>
  <Modal
    :open="!!confirmation"
    title="确认离开？"
    :description="confirmation?.message"
    @update:open="!$event && resolveConfirmation(false)"
  >
    <div class="modal-actions">
      <Button variant="outline" @click="resolveConfirmation(false)">留在当前页面</Button
      ><Button @click="resolveConfirmation(true)">确认并继续</Button>
    </div>
  </Modal>
</template>
