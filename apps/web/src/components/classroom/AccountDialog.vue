<script setup lang="ts">
import { useActionFeedback } from '@/composables/useActionFeedback'
import { Form } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { ref, watch, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { Eye, EyeOff, KeyRound } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import Modal from './Modal.vue'
import { currentUser, clearSession, notify } from '@/data/demo'
import { api } from '@/lib/api'
const { t } = useI18n()
const open = defineModel<boolean>('open', { default: false })
const router = useRouter()
const current = ref(''),
  password = ref(''),
  confirm = ref(''),
  visible = ref(false),
  busy = ref(false),
  error = ref('')
const roleLabels = computed<Record<string, string>>(() => ({
  teacher: t('shell.account.roleTeacher'),
  student: t('shell.account.roleStudent'),
  admin: t('shell.account.roleAdmin'),
}))
watch(open, (value) => {
  if (!value) {
    current.value = ''
    password.value = ''
    confirm.value = ''
    error.value = ''
    visible.value = false
  }
})
async function save() {
  if (busy.value) return
  error.value = ''
  if (password.value !== confirm.value) {
    error.value = t('shell.account.mismatch')
    return
  }
  busy.value = true
  try {
    await api('/auth/password', 'POST', { current: current.value, password: password.value })
    open.value = false
    current.value = ''
    password.value = ''
    confirm.value = ''
    clearSession()
    await router.replace('/login')
    notify(t('shell.account.updated'))
  } catch (e) {
    error.value = e instanceof Error ? e.message : t('shell.account.failed')
  } finally {
    busy.value = false
  }
}
useActionFeedback(error)
</script>
<template>
  <Modal
    v-model:open="open"
    :title="t('shell.account.title')"
    :description="t('shell.account.description')"
    :busy="busy">
    <div class="account-summary">
      <strong>{{ currentUser?.name }}</strong>
      <span>{{ currentUser?.username }} · {{ roleLabels[currentUser?.role ?? ''] }}</span>
    </div>
    <Form class="form-stack account-form" @submit.prevent="save">
      <label>
        {{ t('shell.account.currentPassword') }}
        <Input
          v-model="current"
          :type="visible ? 'text' : 'password'"
          required
          maxlength="200"
          autocomplete="current-password"
          :disabled="busy"
          :data-disabled-reason="t('shell.account.busyReason')" />
      </label>
      <label>
        {{ t('shell.account.newPassword') }}
        <Input
          v-model="password"
          :type="visible ? 'text' : 'password'"
          required
          maxlength="200"
          autocomplete="new-password"
          :disabled="busy"
          :data-disabled-reason="t('shell.account.busyReason')" />
      </label>
      <label>
        {{ t('shell.account.confirmNewPassword') }}
        <Input
          v-model="confirm"
          :type="visible ? 'text' : 'password'"
          required
          maxlength="200"
          autocomplete="new-password"
          :disabled="busy"
          :data-disabled-reason="t('shell.account.busyReason')" />
      </label>
      <Button
        variant="plain"
        class="text-button"
        type="button"
        data-guide="password-visible"
        :aria-pressed="visible"
        @click="visible = !visible">
        <component :is="visible ? EyeOff : Eye" :size="15" />
        {{ visible ? t('shell.account.hidePassword') : t('shell.account.showPassword') }}
      </Button>

      <div class="modal-actions">
        <Button
          type="button"
          variant="outline"
          :disabled="busy"
          :data-disabled-reason="t('shell.account.busyReason')"
          data-guide="password-cancel"
          @click="open = false">
          {{ t('common.cancel') }}
        </Button>
        <Button
          data-guide="password-save"
          type="submit"
          :disabled="busy"
          :data-disabled-reason="t('shell.account.busyReason')">
          <KeyRound />
          {{ busy ? t('shell.account.updating') : t('shell.account.update') }}
        </Button>
      </div>
    </Form>
  </Modal>
</template>
<style scoped>
.account-summary {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 14px;
  margin-bottom: 20px;
  border: 1px solid var(--ui-line);
  border-radius: 6px;
  background: var(--ui-surface);
}
.account-summary span {
  font-size: 15px;
  color: var(--ui-secondary);
  overflow-wrap: anywhere;
}
</style>
