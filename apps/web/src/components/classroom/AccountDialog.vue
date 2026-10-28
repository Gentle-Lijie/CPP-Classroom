<script setup lang="ts">
import { useActionFeedback } from '@/composables/useActionFeedback'
import { Form } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Eye, EyeOff, KeyRound } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import Modal from './Modal.vue'
import { currentUser, clearSession, notify } from '@/data/demo'
import { api } from '@/lib/api'
const open = defineModel<boolean>('open', { default: false })
const router = useRouter()
const current = ref(''),
  password = ref(''),
  confirm = ref(''),
  visible = ref(false),
  busy = ref(false),
  error = ref('')
const roleLabels: Record<string, string> = { teacher: '教师', student: '学生', admin: '管理员' }
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
    error.value = '两次输入的新密码不一致'
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
    notify('密码已更新，所有旧登录已失效，请使用新密码登录')
  } catch (e) {
    error.value = e instanceof Error ? e.message : '密码更新失败，请重试'
  } finally {
    busy.value = false
  }
}
useActionFeedback(error)
</script>
<template>
  <Modal
    v-model:open="open"
    title="账号与密码"
    description="更新密码后，所有设备的旧登录都会失效，请重新登录。"
    :busy="busy">
    <div class="account-summary">
      <strong>{{ currentUser?.name }}</strong>
      <span>{{ currentUser?.username }} · {{ roleLabels[currentUser?.role ?? ''] }}</span>
    </div>
    <Form class="form-stack account-form" @submit.prevent="save">
      <label>
        当前密码
        <Input
          v-model="current"
          :type="visible ? 'text' : 'password'"
          required
          maxlength="200"
          autocomplete="current-password"
          :disabled="busy" />
      </label>
      <label>
        新密码
        <Input
          v-model="password"
          :type="visible ? 'text' : 'password'"
          required
          maxlength="200"
          autocomplete="new-password"
          :disabled="busy" />
      </label>
      <label>
        确认新密码
        <Input
          v-model="confirm"
          :type="visible ? 'text' : 'password'"
          required
          maxlength="200"
          autocomplete="new-password"
          :disabled="busy" />
      </label>
      <Button
        variant="plain"
        class="text-button"
        type="button"
        data-guide="password-visible"
        :aria-pressed="visible"
        @click="visible = !visible">
        <component :is="visible ? EyeOff : Eye" :size="15" />
        {{ visible ? '隐藏密码' : '显示密码' }}
      </Button>

      <div class="modal-actions">
        <Button
          type="button"
          variant="outline"
          :disabled="busy"
          data-guide="password-cancel"
          @click="open = false">
          取消
        </Button>
        <Button data-guide="password-save" type="submit" :disabled="busy">
          <KeyRound />
          {{ busy ? '正在更新…' : '更新密码' }}
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
