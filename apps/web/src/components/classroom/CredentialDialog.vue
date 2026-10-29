<script setup lang="ts">
import { ref } from 'vue'
import { Copy, Download, Trash2 } from '@lucide/vue'
import Modal from './Modal.vue'
import { Button } from '@/components/ui/button'
import { notify } from '@/data/demo'
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
      `姓名：${c.name}\n账号：${c.username}\n密码：${c.password ?? ''}\n生成时间：${c.generatedAt ?? '未知'}\n登录地址：${location.origin}/login`,
    )
    notify('登录信息已复制')
  } catch {
    notify('复制失败，请导出账号密码表', 'error')
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
    :title="title ?? '账号登录凭据'"
    description="本标签页临时保留，刷新后可重新导出，退出登录后清除。服务器不保存可查看的明文密码。"
    wide
    @update:open="emit('update:open', $event)">
    <div class="credential-actions">
      <Button
        :disabled="!credentials.length"
        data-disabled-reason="当前没有可操作的账号凭据"
        @click="emit('export')">
        <Download />
        导出账号密码 CSV
      </Button>
      <Button variant="outline" @click="emit('update:open', false)">稍后继续</Button>
    </div>
    <!-- <Alert type="warning">
      这是生成时的密码副本，并非当前密码验证。学生改密或其他恢复操作后可能失效，请核对生成时间。
    </Alert> -->
    <div class="table-scroll credential-table">
      <table>
        <thead>
          <tr>
            <th>姓名 / 学号</th>
            <th>登录账号</th>
            <th>密码 / 生成时间</th>
            <th>交付</th>
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
                {{ c.generatedAt ? new Date(c.generatedAt).toLocaleString() : '生成时间未知' }}
              </small>
            </td>
            <td>
              <Button size="sm" variant="ghost" @click="copy(c)">
                <Copy />
                复制
              </Button>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-if="!credentials.length" class="empty-state">没有保留的登录凭据</p>
    </div>
    <!-- <p class="form-hint">
      账号可能用于多个课堂。已有账号的原密码不在此表；需要重新交付时请按名册权限重置，历史或其他教师创建的账号由管理员协助恢复。
    </p> -->
    <div class="modal-actions">
      <Button
        variant="outline"
        :disabled="!credentials.length"
        data-disabled-reason="当前没有可操作的账号凭据"
        @click="confirmClear = true">
        <Trash2 />
        清除本页凭据
      </Button>
      <Button @click="emit('update:open', false)">完成</Button>
    </div>
  </Modal>
  <Modal
    v-model:open="confirmClear"
    title="清除本标签页的凭据？"
    description="此操作不会修改账号密码。请先确认已下载并保存交付文件；清除后无法找回原副本。">
    <div class="modal-actions">
      <Button variant="outline" @click="confirmClear = false">取消</Button>
      <Button variant="destructive" @click="clear">确认已保存，清除凭据</Button>
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
