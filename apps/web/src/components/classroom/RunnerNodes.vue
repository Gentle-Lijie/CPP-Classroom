<script setup lang="ts">
import { onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Server, Plus, RefreshCw } from '@lucide/vue'
import { api } from '@/lib/api'
import { confirmAction } from '@/lib/confirm'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Form } from '@/components/ui/form'
import { Switch } from '@/components/ui/switch'
import Modal from './Modal.vue'

const { t } = useI18n()

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
    loadError.value = e instanceof Error ? e.message : t('runner.nodes.errors.loadFailed')
  }
}
async function remove(node: Node) {
  if (
    busy.value ||
    !(await confirmAction(t('runner.nodes.confirmDelete', { name: node.name }), {
      destructive: true,
    }))
  )
    return
  busy.value = true
  try {
    await api(`/admin/runners/${node.id}`, 'DELETE')
    await load()
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : t('runner.nodes.errors.deleteFailed')
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
    error.value = e instanceof Error ? e.message : t('runner.nodes.errors.saveFailed')
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
    testResult.value = { ok: false, message: t('runner.nodes.errors.fillUrl') }
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
    testResult.value = {
      ok: false,
      message: e instanceof Error ? e.message : t('runner.nodes.errors.testFailed'),
    }
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
          <h2>{{ t('runner.nodes.title') }}</h2>
        </div>
        <p class="runner-hint">{{ t('runner.nodes.hint') }}</p>
      </div>
      <Button type="button" variant="outline" size="sm" @click="add">
        <Plus />
        {{ t('runner.nodes.addNode') }}
      </Button>
    </div>
    <p v-if="loadError" role="alert" class="runner-error">{{ loadError }}</p>
    <p v-if="!nodes.length && !loadError" class="runner-empty">
      {{ t('runner.nodes.emptyHint') }}
    </p>
    <div v-for="node in nodes" :key="node.id" class="runner-row">
      <div>
        <strong>{{ node.name }}</strong>
        <p>{{ node.url }}</p>
        <small>
          {{ node.enabled ? t('common.enabled') : t('common.disabled') }} ·
          {{ t('runner.nodes.running', { active: node.activeCount, capacity: node.capacity }) }} ·
          {{ node.hasToken ? t('runner.nodes.tokenConfigured') : t('runner.nodes.tokenMissing') }}
        </small>
      </div>
      <div class="inline-items">
        <Button type="button" variant="outline" size="sm" @click="edit(node)">
          {{ t('common.edit') }}
        </Button>
        <Button
          type="button"
          variant="destructive"
          size="sm"
          :disabled="busy"
          @click="remove(node)">
          {{ t('common.delete') }}
        </Button>
      </div>
    </div>
    <Modal
      v-model:open="open"
      :title="editing ? t('runner.nodes.editTitle') : t('runner.nodes.addTitle')"
      :description="t('runner.nodes.modalDescription')"
      :busy="busy || testing">
      <Form id="runner-node-form" class="runner-form" @submit="save">
        <fieldset :disabled="busy || testing" class="runner-fieldset">
          <label>
            {{ t('runner.nodes.nameLabel') }}
            <Input
              v-model="form.name"
              required
              maxlength="100"
              :placeholder="t('runner.nodes.namePlaceholder')" />
          </label>
          <label>
            {{ t('runner.nodes.urlLabel') }}
            <Input
              v-model="form.url"
              type="url"
              required
              placeholder="https://runner.example.com" />
          </label>
          <label>
            {{ t('runner.nodes.tokenLabel') }}
            <Input
              v-model="form.token"
              type="password"
              autocomplete="new-password"
              :placeholder="
                editing
                  ? t('runner.nodes.tokenKeepPlaceholder')
                  : t('runner.nodes.tokenPlaceholder')
              " />
            <small>{{ t('runner.nodes.tokenHint') }}</small>
          </label>
          <label>
            {{ t('runner.nodes.capacityLabel') }}
            <Input v-model.number="form.capacity" type="number" min="1" max="128" required />
            <small>{{ t('runner.nodes.capacityHint') }}</small>
          </label>
          <label class="runner-option">
            <span>
              <strong>{{ t('runner.nodes.enableNode') }}</strong>
              <small>{{ t('runner.nodes.enableHint') }}</small>
            </span>
            <Switch v-model="form.enabled" :aria-label="t('runner.nodes.enableNode')" />
          </label>
          <label v-if="editing" class="runner-option">
            <span>
              <strong>{{ t('runner.nodes.clearToken') }}</strong>
              <small>{{ t('runner.nodes.clearTokenHint') }}</small>
            </span>
            <Switch
              v-model="form.clearToken"
              :disabled="!!form.token"
              :aria-label="t('runner.nodes.clearToken')" />
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
            {{ testing ? t('runner.nodes.testing') : t('runner.nodes.testConnection') }}
          </Button>
          <span class="runner-action-spacer" />
          <Button type="button" variant="outline" :disabled="busy || testing" @click="open = false">
            {{ t('common.cancel') }}
          </Button>
          <Button type="submit" :disabled="busy || testing">
            {{ busy ? t('runner.nodes.saving') : t('runner.nodes.saveNode') }}
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
