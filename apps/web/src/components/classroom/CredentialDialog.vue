<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Copy, Download, Trash2 } from '@lucide/vue'
import Modal from './Modal.vue'
import { Button } from '@/components/ui/button'
import { notify } from '@/data/demo'
const { t } = useI18n()
export interface LoginCredential {
  id?: string
  name: string
  number?: string
  username: string
  password?: string
  generatedAt?: string
}
defineProps<{ open: boolean; credentials: readonly LoginCredential[]; title?: string }>()
const emit = defineEmits<{ 'update:open': [value: boolean]; export: []; clear: [] }>()
const confirmClear = ref(false)
async function copy(c: LoginCredential) {
  try {
    await navigator.clipboard.writeText(
      t('shell.credentials.copyText', {
        name: c.name,
        username: c.username,
        password: c.password ?? '',
        generatedAt: c.generatedAt ?? t('shell.credentials.unknown'),
        url: `${location.origin}/login`,
      }),
    )
    notify(t('shell.credentials.copied'))
  } catch {
    notify(t('shell.credentials.copyFailed'), 'error')
  }
}
function clear() {
  emit('clear')
  confirmClear.value = false
  emit('update:open', false)
}
</script>
<template>
  <Modal
    :open="open"
    :title="title ?? t('shell.credentials.title')"
    :description="t('shell.credentials.description')"
    wide
    @update:open="emit('update:open', $event)">
    <div class="credential-actions">
      <Button
        :disabled="!credentials.length"
        :data-disabled-reason="t('shell.credentials.noneReason')"
        @click="emit('export')">
        <Download />
        {{ t('shell.credentials.export') }}
      </Button>
      <Button variant="outline" @click="emit('update:open', false)">
        {{ t('shell.credentials.later') }}
      </Button>
    </div>
    <!-- <Alert type="warning">
      这是生成时的密码副本，并非当前密码验证。学生改密或其他恢复操作后可能失效，请核对生成时间。
    </Alert> -->
    <div class="table-scroll credential-table">
      <table>
        <thead>
          <tr>
            <th>{{ t('shell.credentials.colName') }}</th>
            <th>{{ t('shell.credentials.colAccount') }}</th>
            <th>{{ t('shell.credentials.colSecret') }}</th>
            <th>{{ t('shell.credentials.colDelivery') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="c in credentials" :key="c.username">
            <td>
              {{ c.name }}
              <small v-if="c.number" class="cell-secondary">{{ c.number }}</small>
            </td>
            <td class="credential-account">
              <code>{{ c.username }}</code>
            </td>
            <td class="credential-secret">
              <code>{{ c.password }}</code>
              <small class="cell-secondary">
                {{
                  c.generatedAt
                    ? new Date(c.generatedAt).toLocaleString()
                    : t('shell.credentials.generatedUnknown')
                }}
              </small>
            </td>
            <td>
              <Button size="sm" variant="ghost" @click="copy(c)">
                <Copy />
                {{ t('common.copy') }}
              </Button>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-if="!credentials.length" class="empty-state">{{ t('shell.credentials.empty') }}</p>
    </div>
    <!-- <p class="form-hint">
      账号可能用于多个课堂。已有账号的原密码不在此表；需要重新交付时请按名册权限重置，历史或其他教师创建的账号由管理员协助恢复。
    </p> -->
    <div class="modal-actions">
      <Button
        variant="outline"
        :disabled="!credentials.length"
        :data-disabled-reason="t('shell.credentials.noneReason')"
        @click="confirmClear = true">
        <Trash2 />
        {{ t('shell.credentials.clear') }}
      </Button>
      <Button @click="emit('update:open', false)">{{ t('shell.credentials.done') }}</Button>
    </div>
  </Modal>
  <Modal
    v-model:open="confirmClear"
    :title="t('shell.credentials.clearTitle')"
    :description="t('shell.credentials.clearDescription')">
    <div class="modal-actions">
      <Button variant="outline" @click="confirmClear = false">{{ t('common.cancel') }}</Button>
      <Button variant="destructive" @click="clear">
        {{ t('shell.credentials.confirmClear') }}
      </Button>
    </div>
  </Modal>
</template>
<style scoped>
.credential-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
.credential-table {
  max-height: 360px;
  border: 1px solid var(--ui-line);
  border-radius: 6px;
}
.credential-account {
  min-width: 200px;
  max-width: 240px;
  white-space: normal;
  overflow-wrap: anywhere;
}
.credential-secret {
  min-width: 190px;
}
.credential-table td {
  vertical-align: top;
}
</style>
