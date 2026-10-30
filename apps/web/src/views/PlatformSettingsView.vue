<script setup lang="ts">
import { useActionFeedback } from '@/composables/useActionFeedback'
import { Alert } from '@/components/ui/alert'
import { NumberInput } from '@/components/ui/number-input'
import { Form } from '@/components/ui/form'
import { Select, SelectOption } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { computed, onMounted, onBeforeUnmount, reactive, ref } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import {
  Activity,
  Database,
  Server,
  RefreshCw,
  Save,
  ShieldCheck,
  LockKeyhole,
  CircleAlert,
  Check,
} from '@lucide/vue'
import { Button } from '@/components/ui/button'
import ContentPanel from '@/components/classroom/ContentPanel.vue'
import { confirmAction } from '@/lib/confirm'
import { api } from '@/lib/api'
import { notify, executionSettings } from '@/data/demo'
import { probePlatform, type ProbeResult, type ProbeState } from '@/lib/platform-health'
import { executionDefaults, executionLimits, wallClockLimitMs } from '@classroom/contracts'

const form = reactive({ ...executionDefaults, goJudgeUrl: '', goJudgeTimeoutMs: 2000 })
const loading = ref(true),
  saving = ref(false),
  checking = ref(false)
const loadError = ref(''),
  saveError = ref(''),
  savedSnapshot = ref('')
const checkedAt = ref(''),
  savedAt = ref('')
const states = reactive<Record<'api' | 'database' | 'runner', ProbeResult>>({
  api: { status: 'idle', message: '尚未检查连接。' },
  database: { status: 'idle', message: '尚未检查连接。' },
  runner: { status: 'idle', message: '尚未检查连接。' },
})
const services = [
  { key: 'api', title: '业务服务', subtitle: '课堂与账号', icon: Activity },
  { key: 'database', title: '数据库', subtitle: '课堂数据与任务队列', icon: Database },
  { key: 'runner', title: '评测节点', subtitle: '原生 Linux · go-judge', icon: Server },
] as const
const groups = [
  {
    title: '编译阶段',
    // description: '限制每次编译可使用的 CPU 时间和内存。',
    fields: [
      { key: 'compileTimeMs', name: '编译 CPU 时间', unit: 'ms', min: 1000, max: 20000 },
      { key: 'compileMemoryMb', name: '编译内存', unit: 'MiB', min: 128, max: 1024 },
    ],
  },
  {
    title: '程序运行',
    // description: '限制单次学生程序的资源用量。',
    fields: [
      { key: 'runTimeMs', name: '运行 CPU 时间', unit: 'ms', min: 100, max: 10000 },
      { key: 'runMemoryMb', name: '运行内存', unit: 'MiB', min: 16, max: 512 },
    ],
  },
  {
    title: '并行与输出',
    // description: '控制平台总并发和单次程序的输出量。',
    fields: [
      {
        key: 'executionConcurrency',
        name: '执行槽位',
        unit: '个',
        min: 1,
        max: executionLimits.maxConcurrentRuns,
      },
      { key: 'outputLimitKb', name: '输出上限', unit: 'KiB', min: 16, max: 2048 },
    ],
  },
] as const
const labels: Record<ProbeState, string> = {
  idle: '未检查',
  checking: '检查中',
  healthy: '连接正常',
  unavailable: '不可用',
  unconfigured: '未配置',
}
function configuration() {
  return {
    compilerProfile: form.compilerProfile,
    compileTimeMs: form.compileTimeMs,
    compileMemoryMb: form.compileMemoryMb,
    runTimeMs: form.runTimeMs,
    runMemoryMb: form.runMemoryMb,
    outputLimitKb: form.outputLimitKb,
    executionConcurrency: form.executionConcurrency,
  }
}
const dirty = computed(
  () => !!savedSnapshot.value && JSON.stringify(configuration()) !== savedSnapshot.value,
)
async function load() {
  loading.value = true
  loadError.value = ''
  try {
    Object.assign(form, await api('/admin/settings'))
    savedSnapshot.value = JSON.stringify(configuration())
  } catch {
    loadError.value = '无法读取平台配置，请检查连接或重新登录后重试。'
  } finally {
    loading.value = false
  }
}
async function check() {
  if (checking.value) return
  checking.value = true
  for (const state of Object.values(states)) {
    state.status = 'checking'
    state.message = '正在检查服务连接…'
    delete state.latencyMs
  }
  try {
    Object.assign(states, await probePlatform(AbortSignal.timeout(12000)))
  } catch {
    for (const state of Object.values(states)) {
      state.status = 'unavailable'
      state.message = '连接检查失败，请稍后重试。'
    }
  } finally {
    checking.value = false
    checkedAt.value = new Date().toLocaleTimeString('zh-CN', { hour12: false })
  }
}
async function save() {
  if (loading.value || saving.value || loadError.value || !dirty.value) return
  saving.value = true
  saveError.value = ''
  const value = configuration()
  try {
    await api('/admin/settings', 'POST', value)
    Object.assign(executionSettings, value)
    savedSnapshot.value = JSON.stringify(value)
    savedAt.value = new Date().toLocaleTimeString('zh-CN', { hour12: false })
    notify('运行配置已保存，后续开始的任务将使用新配置')
  } catch (error) {
    saveError.value = error instanceof Error ? error.message : '保存失败，请重试。'
  } finally {
    saving.value = false
  }
}
onMounted(() => {
  void load()
  void check()
})
function beforeUnload(event: BeforeUnloadEvent) {
  if (!dirty.value && !saving.value) return
  event.preventDefault()
  event.returnValue = ''
}
window.addEventListener('beforeunload', beforeUnload)
onBeforeUnmount(() => window.removeEventListener('beforeunload', beforeUnload))
onBeforeRouteLeave(async () => {
  if (saving.value) return false
  return !dirty.value || (await confirmAction('平台配置尚未保存。确认放弃本次更改并离开？'))
})
useActionFeedback(saveError)
</script>
<template>
  <div class="runtime-settings-page">
    <div class="page-heading">
      <div>
        <div class="heading-meta">平台管理</div>
        <h1>平台配置</h1>
      </div>
    </div>
    <ContentPanel title="服务状态" :icon="Activity" class="runtime-health-panel">
      <template #actions>
        <Button
          variant="outline"
          size="sm"
          :disabled="checking"
          :data-disabled-reason="'正在检查服务连接，请稍候'"
          @click="check">
          <RefreshCw :class="{ 'probe-spinning': checking }" />
          {{ checking ? '检查中…' : '刷新状态' }}
        </Button>
      </template>
      <div class="runtime-service-grid" aria-live="polite">
        <article v-for="service in services" :key="service.key" class="runtime-service">
          <div class="runtime-service-top">
            <span class="runtime-service-icon"><component :is="service.icon" :size="19" /></span>
            <span class="runtime-service-state" :class="'is-' + states[service.key].status">
              <i />
              {{ labels[states[service.key].status] }}
            </span>
          </div>
          <h3>
            {{ service.title }}
            <!-- <small>{{ service.subtitle }}</small> -->
          </h3>
          <p>{{ states[service.key].message }}</p>
          <span v-if="states[service.key].latencyMs !== undefined" class="runtime-latency">
            响应 {{ states[service.key].latencyMs }} ms
          </span>
        </article>
      </div>
      <template #footer>
        <span class="runtime-check-time">
          {{ checkedAt ? '最近检查 ' + checkedAt : '正在获取连接状态…' }}
        </span>
        <span class="runtime-check-time">连接正常仅代表服务可达</span>
      </template>
    </ContentPanel>
    <Alert v-if="loadError" role="alert" type="error" :icon="CircleAlert">
      <span>{{ loadError }}</span>

      <template #actions>
        <Button variant="outline" size="sm" @click="load">重试读取</Button>
      </template>
    </Alert>
    <div class="runtime-settings-layout">
      <ContentPanel title="运行环境与限额" class="runtime-form-panel">
        <Form id="runtime-settings-form" class="runtime-settings-form" @submit.prevent="save">
          <fieldset
            :disabled="loading || saving || !!loadError"
            :data-disabled-reason="
              loading
                ? '正在加载平台配置，请稍候'
                : saving
                  ? '正在保存平台配置，请稍候'
                  : '配置加载失败，请先重新加载'
            "
            class="runtime-fields">
            <label class="runtime-profile">
              C++ 标准
              <Select v-model="form.compilerProfile">
                <SelectOption value="gcc13-cpp17">GCC 13.3 / C++17</SelectOption>
                <SelectOption value="gcc13-cpp20">GCC 13.3 / C++20</SelectOption>
              </Select>
            </label>
            <fieldset v-for="group in groups" :key="group.title" class="runtime-settings-group">
              <legend>{{ group.title }}</legend>
              <br />
              <div class="runtime-settings-grid">
                <label v-for="field in group.fields" :key="field.key">
                  {{ field.name }}
                  <span class="runtime-number-control">
                    <NumberInput
                      v-model.number="form[field.key]"
                      required
                      :min="field.min"
                      :max="field.max"
                      step="1"
                      :aria-describedby="'range-' + field.key" />
                    <span>{{ field.unit }}</span>
                  </span>
                  <small :id="'range-' + field.key">
                    {{ field.min.toLocaleString() }}–{{ field.max.toLocaleString() }}
                    {{ field.unit }}
                  </small>
                </label>
              </div>
            </fieldset>
          </fieldset>
        </Form>
        <template #footer>
          <span class="runtime-save-status" :class="{ pending: dirty }">
            <i v-if="dirty" />
            <Check v-else-if="savedAt" :size="14" />
            {{
              loading
                ? '正在读取配置…'
                : loadError
                  ? '配置读取失败，暂不可保存'
                  : dirty
                    ? '有未保存的更改'
                    : savedAt
                      ? '已保存于 ' + savedAt
                      : '配置已与服务器同步'
            }}
          </span>
          <Button
            type="submit"
            form="runtime-settings-form"
            :disabled="loading || saving || !!loadError || !dirty"
            :data-disabled-reason="
              loading
                ? '正在加载平台配置，请稍候'
                : saving
                  ? '正在保存平台配置，请稍候'
                  : loadError
                    ? '配置加载失败，请先重新加载'
                    : '配置没有更改，无需保存'
            ">
            <Save :size="15" />
            {{ saving ? '保存中…' : '保存更改' }}
          </Button>
        </template>
      </ContentPanel>
      <aside class="runtime-settings-aside">
        <ContentPanel title="评测节点" description="原生 Linux 执行服务" :icon="Server">
          <label class="runtime-node-address">
            连接地址
            <span>
              <LockKeyhole :size="13" />
              由服务端管理
            </span>
            <Input
              :value="form.goJudgeUrl"
              readonly
              :placeholder="
                loading ? '读取中…' : loadError ? '无法读取节点地址' : '尚未配置节点'
              " />
          </label>
          <div class="runtime-fixed-limits">
            <h3>墙钟时间上限</h3>
            <dl>
              <div>
                <dt>编译阶段</dt>
                <dd>{{ wallClockLimitMs(form.compileTimeMs) / 1000 }} 秒</dd>
              </div>
              <div>
                <dt>非交互运行</dt>
                <dd>{{ wallClockLimitMs(form.runTimeMs) / 1000 }} 秒</dd>
              </div>
              <div>
                <dt>交互运行</dt>
                <dd>{{ wallClockLimitMs(form.runTimeMs, true) / 1000 }} 秒</dd>
              </div>
            </dl>
            <p>包含等待输入的实际耗时，按当前 CPU 时间自动计算；保存后对后续任务生效。</p>
          </div>
        </ContentPanel>
        <Alert type="info" :icon="ShieldCheck">
          <div>
            <strong>独立执行与资源隔离</strong>
            <p>
              学生代码在独立评测节点运行。配置保存后，对后续开始的任务生效，不会重启正在运行的任务。
            </p>
          </div>
        </Alert>
      </aside>
    </div>
  </div>
</template>
<style scoped>
.runtime-settings-page {
  max-width: 1180px;
  margin: 0 auto;
}
.runtime-health-panel {
  margin-bottom: 24px;
}
.runtime-service-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
}
.runtime-service + .runtime-service {
  border-left: 1px solid var(--ui-line);
  padding-left: 24px;
}
.runtime-service-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}
.runtime-service-icon {
  color: var(--ui-icon-slate);
  display: inline-flex;
}
.runtime-service-state {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 8px;
  border-radius: 4px;
  background: var(--ui-hover);
  color: var(--ui-muted);
  font-size: 13px;
  white-space: nowrap;
}
.runtime-service-state i {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: currentColor;
}
.runtime-service-state.is-healthy {
  color: var(--ui-success);
  background: var(--ui-success-bg);
}
.runtime-service-state.is-unavailable {
  color: var(--ui-error);
  background: var(--ui-error-bg);
}
.runtime-service-state.is-unconfigured {
  color: var(--ui-warning);
  background: var(--ui-warning-bg);
}
.runtime-service-state.is-checking {
  color: var(--ui-action);
  background: var(--ui-selection);
}
.runtime-service h3 {
  font-size: 16px;
  font-weight: 600;
}
.runtime-service h3 small {
  display: block;
  font-weight: 400;
  font-size: 13px;
  color: var(--ui-muted);
  margin-top: 3px;
}
.runtime-service p {
  font-size: 14px;
  line-height: 1.8;
  color: var(--ui-secondary);
  margin-top: 8px;
  min-height: 32px;
  overflow-wrap: anywhere;
}
.runtime-latency,
.runtime-check-time {
  font-size: 13px;
  color: var(--ui-muted);
  font-variant-numeric: tabular-nums;
}
.runtime-latency {
  display: block;
  margin-top: 6px;
}
.runtime-settings-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 290px;
  align-items: start;
  gap: 16px;
}
.runtime-settings-aside {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}
.runtime-fields {
  border: 0;
  margin: 0;
  padding: 0;
  min-width: 0;
}
.runtime-fields:disabled {
  opacity: 0.6;
}
.runtime-profile,
.runtime-settings-grid > label {
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 15px;
  font-weight: 500;
  color: var(--ui-text);
}
.runtime-profile {
  padding-bottom: 16px;
}
.runtime-profile .ui-select-trigger {
  width: 100%;
  font-size: 15px;
}
.runtime-profile small,
.runtime-settings-grid small {
  font-size: 13px;
  font-weight: 400;
  color: var(--ui-muted);
}
.runtime-settings-group {
  margin: 0;
  border: 0;
  border-top: 1px solid var(--ui-line);
  padding: 14px 0 16px;
  min-width: 0;
}
.runtime-settings-group:last-child {
  padding-bottom: 0;
}
.runtime-settings-group legend {
  float: left;
  width: 100%;
  padding: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--ui-ink);
}
.runtime-settings-group > p {
  clear: both;
  font-size: 13px;
  color: var(--ui-muted);
  padding-top: 4px;
  margin-bottom: 16px;
}
.runtime-settings-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}
.runtime-number-control {
  display: block;
  position: relative;
}
.runtime-number-control :deep(.ui-number-input) {
  width: 100%;
  font-size: 15px;
  padding-right: 64px;
  font-weight: 400;
  font-variant-numeric: tabular-nums;
}
.runtime-number-control > span:not(.ui-number-field) {
  position: absolute;
  right: 34px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--ui-muted);
  font-size: 13px;
  font-weight: 400;
  pointer-events: none;
}
.runtime-save-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--ui-muted);
}
.runtime-save-status.pending {
  color: var(--ui-warning);
}
.runtime-save-status i {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: currentColor;
}
.runtime-node-address {
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 14px;
  color: var(--ui-text);
}
.runtime-node-address > span {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--ui-muted);
  font-size: 13px;
}
.runtime-node-address input {
  width: 100%;
  font-size: 13px;
  background: var(--ui-surface);
  color: var(--ui-secondary);
}
.runtime-fixed-limits {
  border-top: 1px solid var(--ui-line);
  padding-top: 18px;
}
.runtime-fixed-limits h3 {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 12px;
}
.runtime-fixed-limits dl {
  display: flex;
  flex-direction: column;
  gap: 9px;
  margin: 0;
  font-size: 14px;
}
.runtime-fixed-limits dl div {
  display: flex;
  justify-content: space-between;
  gap: 16px;
}
.runtime-fixed-limits dt {
  color: var(--ui-muted);
}
.runtime-fixed-limits dd {
  margin: 0;
  font-variant-numeric: tabular-nums;
}
.runtime-fixed-limits p {
  font-size: 13px;
  color: var(--ui-muted);
  line-height: 1.8;
  margin-top: 14px;
}
@media (max-width: 1100px) {
  .runtime-settings-layout {
    grid-template-columns: minmax(0, 1fr);
  }
  .runtime-settings-aside {
    display: grid;
    grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr);
    align-items: start;
  }
}
@media (max-width: 760px) {
  .runtime-service-grid {
    grid-template-columns: 1fr;
    gap: 18px;
  }
  .runtime-service + .runtime-service {
    padding: 18px 0 0;
    border-left: 0;
    border-top: 1px solid var(--ui-line);
  }
  .runtime-service p {
    min-height: 0;
  }
  .runtime-settings-layout {
    gap: 16px;
  }
  .runtime-settings-aside,
  .runtime-settings-grid {
    grid-template-columns: 1fr;
  }
  .runtime-settings-grid {
    gap: 16px;
  }
}
</style>
