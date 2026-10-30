<script setup lang="ts">
import { onMounted, reactive, ref, watch } from 'vue'
import { Server, Plus, RefreshCw } from '@lucide/vue'
import { api } from '@/lib/api'
import { confirmAction } from '@/lib/confirm'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Form } from '@/components/ui/form'
import { Switch } from '@/components/ui/switch'
import Modal from './Modal.vue'

type Node = {
  id: string
  name: string
  url: string
  capacity: number
  enabled: boolean
  hasToken: boolean
  activeCount: number
}
const nodes = ref<Node[]>([])
const editing = ref<string | null>(null)
const busy = ref(false)
const testing = ref(false)
const open = ref(false)
const error = ref('')
const loadError = ref('')
const testResult = ref<{ ok: boolean; message: string; latencyMs?: number } | null>(null)
const form = reactive({
  name: '',
  url: '',
  token: '',
  capacity: 4,
  enabled: true,
  clearToken: false,
})
function reset() {
  editing.value = null
  error.value = ''
  testResult.value = null
  Object.assign(form, {
    name: '',
    url: '',
    token: '',
    capacity: 4,
    enabled: true,
    clearToken: false,
  })
}
function add() {
  reset()
  open.value = true
}
function edit(node: Node) {
  reset()
  editing.value = node.id
  open.value = true
  Object.assign(form, {
    name: node.name,
    url: node.url,
    token: '',
    capacity: node.capacity,
    enabled: node.enabled,
    clearToken: false,
  })
}
async function load() {
  try {
    nodes.value = await api<Node[]>('/admin/runners')
    loadError.value = ''
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : '读取节点失败'
  }
}
async function remove(node: Node) {
  if (
    busy.value ||
    !(await confirmAction(`永久删除执行节点 ${node.name}？历史运行记录会保留，但不再关联此节点。`))
  )
    return
  busy.value = true
  try {
    await api(`/admin/runners/${node.id}`, 'DELETE')
    await load()
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : '删除节点失败'
  } finally {
    busy.value = false
  }
}
async function save() {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try {
    const value = {
      name: form.name,
      url: form.url,
      capacity: Number(form.capacity),
      enabled: form.enabled,
      ...(form.token || form.clearToken ? { token: form.token } : {}),
    }
    await api(
      editing.value ? `/admin/runners/${editing.value}` : '/admin/runners',
      editing.value ? 'PATCH' : 'POST',
      value,
    )
    open.value = false
    reset()
    await load()
  } catch (e) {
    error.value = e instanceof Error ? e.message : '保存节点失败'
  } finally {
    busy.value = false
  }
}
watch(
  () => [form.url, form.token, form.clearToken],
  () => {
    testResult.value = null
  },
)
async function test() {
  if (busy.value || testing.value) return
  if (!form.url.trim()) {
    testResult.value = { ok: false, message: '请先填写节点地址。' }
    return
  }
  testing.value = true
  error.value = ''
  testResult.value = null
  try {
    testResult.value = await api('/admin/runners/test', 'POST', {
      url: form.url,
      ...(editing.value ? { id: editing.value } : {}),
      ...(form.token || form.clearToken ? { token: form.token } : {}),
    })
  } catch (e) {
    testResult.value = { ok: false, message: e instanceof Error ? e.message : '测试失败，请重试。' }
  } finally {
    testing.value = false
  }
}
onMounted(() => {
  void load()
})
</script>
<template>
  <div>
    <div class="runner-heading">
      <div>
        <div class="settings-title">
          <Server :size="19" />
          <h2>执行节点</h2>
        </div>
        <p class="runner-hint">节点配置由所有 worker 共享，容量为该节点的并发上限。</p>
      </div>
      <Button type="button" variant="outline" size="sm" @click="add">
        <Plus />
        添加节点
      </Button>
    </div>
    <p v-if="loadError" role="alert" class="runner-error">{{ loadError }}</p>
    <p v-if="!nodes.length && !loadError" class="runner-empty">
      暂无数据库节点配置；系统将使用环境变量中配置的节点。
    </p>
    <div v-for="node in nodes" :key="node.id" class="runner-row">
      <div>
        <strong>{{ node.name }}</strong>
        <p>{{ node.url }}</p>
        <small>
          {{ node.enabled ? '已启用' : '已停用' }} · 运行 {{ node.activeCount }} /
          {{ node.capacity }} · {{ node.hasToken ? '令牌已配置' : '未配置令牌' }}
        </small>
      </div>
      <div class="inline-items">
        <Button type="button" variant="outline" size="sm" @click="edit(node)">编辑</Button>
        <Button type="button" variant="ghost" size="sm" :disabled="busy" @click="remove(node)">
          删除
        </Button>
      </div>
    </div>
    <Modal
      v-model:open="open"
      :title="editing ? '编辑节点' : '添加节点'"
      description="配置执行节点的连接方式和并发容量。"
      :busy="busy || testing">
      <Form id="runner-node-form" class="runner-form" @submit="save">
        <fieldset :disabled="busy || testing" class="runner-fieldset">
          <label>
            名称
            <Input v-model="form.name" required maxlength="100" placeholder="例如：教学评测节点" />
          </label>
          <label>
            节点地址
            <Input
              v-model="form.url"
              type="url"
              required
              placeholder="https://runner.example.com" />
          </label>
          <label>
            认证令牌
            <Input
              v-model="form.token"
              type="password"
              autocomplete="new-password"
              :placeholder="editing ? '留空以保留现有令牌' : '可选'" />
            <small>令牌保存后不会再次显示。</small>
          </label>
          <label>
            并发容量
            <Input v-model.number="form.capacity" type="number" min="1" max="128" required />
            <small>该节点同时处理的最大任务数。</small>
          </label>
          <label class="runner-option">
            <span>
              <strong>启用节点</strong>
              <small>停用不会中断正在运行的任务。</small>
            </span>
            <Switch v-model="form.enabled" aria-label="启用节点" />
          </label>
          <label v-if="editing" class="runner-option">
            <span>
              <strong>清除已保存令牌</strong>
              <small>保存后移除现有令牌。</small>
            </span>
            <Switch
              v-model="form.clearToken"
              :disabled="!!form.token"
              aria-label="清除已保存令牌" />
          </label>
        </fieldset>
        <p v-if="error" role="alert" class="runner-error">{{ error }}</p>
        <p
          v-if="testResult"
          role="status"
          class="runner-test-result"
          :class="{ 'is-error': !testResult.ok }">
          {{ testResult.message }}
          <span v-if="testResult.latencyMs !== undefined">· {{ testResult.latencyMs }} ms</span>
        </p>
        <div class="runner-actions">
          <Button type="button" variant="outline" :disabled="busy || testing" @click="test">
            <RefreshCw :class="{ 'probe-spinning': testing }" />
            {{ testing ? '测试中…' : '测试连接' }}
          </Button>
          <span class="runner-action-spacer" />
          <Button type="button" variant="outline" :disabled="busy || testing" @click="open = false">
            取消
          </Button>
          <Button type="submit" :disabled="busy || testing">
            {{ busy ? '保存中…' : '保存节点' }}
          </Button>
        </div>
      </Form>
    </Modal>
  </div>
</template>
<style scoped>
.runner-heading {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
}
.runner-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 20px;
  padding: 14px 0;
  border-bottom: 1px solid var(--ui-line);
}
.runner-row p {
  margin: 4px 0;
  overflow-wrap: anywhere;
}
.runner-row small,
.runner-hint,
.runner-empty {
  color: var(--ui-muted);
  font-size: 13px;
}
.runner-empty {
  margin-top: 18px;
}
.runner-error {
  color: var(--ui-error);
  font-size: 13px;
}
.runner-form {
  display: grid;
  gap: 16px;
}
.runner-fieldset {
  border: 0;
  padding: 0;
  margin: 0;
  min-width: 0;
  display: grid;
  gap: 16px;
}
.runner-fieldset > label:not(.runner-option) {
  display: grid;
  gap: 6px;
  font-size: 14px;
}
.runner-fieldset small {
  color: var(--ui-muted);
  font-size: 13px;
  font-weight: 400;
}
.runner-option {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  padding-top: 12px;
  border-top: 1px solid var(--ui-line);
}
.runner-option span {
  display: grid;
  gap: 4px;
}
.runner-option strong {
  font-size: 14px;
  font-weight: 500;
}
.runner-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.runner-action-spacer {
  flex: 1;
}
.runner-test-result {
  padding: 10px 12px;
  background: var(--ui-success-bg);
  color: var(--ui-success);
  font-size: 13px;
}
.runner-test-result.is-error {
  background: var(--ui-error-bg);
  color: var(--ui-error);
}
</style>
