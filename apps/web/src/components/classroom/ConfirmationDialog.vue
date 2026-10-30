<script setup lang="ts">
import { Button } from '@/components/ui/button'
import Modal from './Modal.vue'
import { confirmation, resolveConfirmation } from '@/lib/confirm'
</script>
<template>
  <Modal
    :open="!!confirmation"
    title="请确认操作"
    :description="confirmation?.message"
    @update:open="!$event && resolveConfirmation(false)">
    <div class="modal-actions">
      <Button variant="outline" @click="resolveConfirmation(false)">取消</Button>
      <Button
        :variant="confirmation?.destructive ? 'destructive' : 'default'"
        @click="resolveConfirmation(true)">
        确认
      </Button>
    </div>
  </Modal>
</template>
