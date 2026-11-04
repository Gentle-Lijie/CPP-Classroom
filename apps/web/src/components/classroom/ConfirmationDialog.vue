<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { Button } from '@/components/ui/button'
import Modal from './Modal.vue'
import { confirmation, resolveConfirmation } from '@/lib/confirm'
const { t } = useI18n()
</script>
<template>
  <Modal
    :open="!!confirmation"
    :title="t('shell.confirm.title')"
    :description="confirmation?.message"
    @update:open="!$event && resolveConfirmation(false)">
    <div class="modal-actions">
      <Button variant="outline" @click="resolveConfirmation(false)">
        {{ t('common.cancel') }}
      </Button>
      <Button
        :variant="confirmation?.destructive ? 'destructive' : 'default'"
        @click="resolveConfirmation(true)">
        {{ t('common.confirm') }}
      </Button>
    </div>
  </Modal>
</template>
