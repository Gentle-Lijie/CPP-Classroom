<script setup lang="ts">
import { useActionFeedback } from '@/composables/useActionFeedback'
import { Alert } from '@/components/ui/alert'
import { NumberInputField } from '@/components/ui/number-input'
import { Form } from '@/components/ui/form'
import { Select, SelectOption } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { computed, onMounted, onBeforeUnmount, reactive, ref } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import {
  Activity,
  Database,
  Server,
  RefreshCw,
  Save,
  ShieldCheck,
  CircleAlert,
  ChevronRight,
  Settings2,
  SlidersHorizontal,
} from '@lucide/vue'
import { Button } from '@/components/ui/button'
import PythonBeta from '@/components/classroom/PythonBeta.vue'
import RunnerNodes from '@/components/classroom/RunnerNodes.vue'
import { confirmAction } from '@/lib/confirm'
import { api } from '@/lib/api'
import { notify, executionSettings } from '@/data/demo'
import { probePlatform, type ProbeResult, type ProbeState } from '@/lib/platform-health'
import {
  executionDefaults,
  executionLimits,
  wallClockLimitMs,
  languageSettings,
  type SourceLanguage,
} from '@classroom/contracts'

const form = reactive({
  ...executionDefaults,
  languages: languageSettings(),
})
const language = ref<SourceLanguage>('cpp')
const activeLanguage = computed(() => form.languages[language.value])
const command = computed(() =>
  language.value === 'cpp'
    ? [
        '/usr/bin/g++',
        form.languages.cpp.compilerProfile === 'gcc13-cpp20' ? '-std=c++20' : '-std=c++17',
        `-${form.languages.cpp.optimization}`,
        ...(form.languages.cpp.warnings ? ['-Wall', '-Wextra'] : []),
        ...form.languages.cpp.macros
          .split(/\s+/)
          .filter(Boolean)
          .map((m) => `-D${m}`),
        '<源文件>',
        '-o',
        'program',
      ].join(' ')
    : [
        '/usr/bin/python3',
        '-I',
        '-S',
        '-B',
        '-u',
        '-X',
        'utf8',
        ...(form.languages.python.optimization === 'none'
          ? []
          : [`-${form.languages.python.optimization}`]),
        '<源文件>',
      ].join(' '),
)
const loading = ref(true),
  saving = ref(false),
  checking = ref(false)
const loadError = ref(''),
  saveError = ref(''),
  savedSnapshot = ref('')
const checkedAt = ref('')
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
    title: '输出限制',
    // description: '控制平台总并发和单次程序的输出量。',
    fields: [{ key: 'outputLimitKb', name: '输出上限', unit: 'KiB', min: 16, max: 2048 }],
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
    ...form.languages.cpp,
    languages: JSON.parse(JSON.stringify(form.languages)) as typeof form.languages,
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
  if (!/^(?:[A-Za-z_]\w*(?:=[A-Za-z0-9_.+-]+)?(?:\s+|$))*$/.test(form.languages.cpp.macros)) {
    language.value = 'cpp'
    saveError.value = '宏定义格式无效，请使用空格分隔的名称或 NAME=VALUE。'
    return
  }
  saving.value = true
  saveError.value = ''
  const value = configuration()
  try {
    await api('/admin/settings', 'POST', value)
    Object.assign(executionSettings, value)
    savedSnapshot.value = JSON.stringify(value)
    notify('运行配置已保存，后续开始的任务将使用新配置')
  } catch (error) {
    saveError.value = error instanceof Error ? error.message : '保存失败，请重试。'
  } finally {
    saving.value = false
  }
}
const sections = ['服务状态', '执行节点', '运行环境', '资源限额']
const tab = ref(sections[0])
const panelEl = ref<HTMLElement | null>(null)
let spyRaf = 0
function goTo(name: string) {
  tab.value = name
  document
    .getElementById(`platform-section-${sections.indexOf(name)}`)
    ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
function spy() {
  spyRaf = 0
  const panel = panelEl.value
  if (!panel) return
  const panelTop = panel.getBoundingClientRect().top
  let current = sections[0]
  for (let i = 0; i < sections.length; i++) {
    const el = document.getElementById(`platform-section-${i}`)
    if (el && el.getBoundingClientRect().top - panelTop <= 24) current = sections[i]
  }
  if (panel.scrollTop + panel.clientHeight >= panel.scrollHeight - 4)
    current = sections[sections.length - 1]
  tab.value = current
}
function onScroll() {
  if (!spyRaf) spyRaf = requestAnimationFrame(spy)
}
onMounted(() => {
  void load()
  void check()
  panelEl.value?.addEventListener('scroll', onScroll, { passive: true })
  spy()
})
function beforeUnload(event: BeforeUnloadEvent) {
  if (!dirty.value && !saving.value) return
  event.preventDefault()
  event.returnValue = ''
}
window.addEventListener('beforeunload', beforeUnload)
onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', beforeUnload)
  panelEl.value?.removeEventListener('scroll', onScroll)
  if (spyRaf) cancelAnimationFrame(spyRaf)
})
onBeforeRouteLeave(async () => {
  if (saving.value) return false
  return !dirty.value || (await confirmAction('平台配置尚未保存。确认放弃本次更改并离开？'))
})
useActionFeedback(saveError)
</script>
<template>
  <div class="settings-page platform-settings-page">
    <div class="page-heading">
      <div>
        <div class="heading-meta">平台管理</div>
        <h1>平台配置</h1>
      </div>
      <Button
        type="submit"
        form="platform-runtime-form"
        :disabled="loading || saving || !!loadError || !dirty"
        :data-disabled-reason="
          loading
            ? '正在加载平台配置'
            : saving
              ? '正在保存配置'
              : loadError
                ? '配置加载失败'
                : '设置没有更改，无需保存'
        ">
        <Save />
        {{ saving ? '正在保存…' : dirty ? '保存设置' : '设置已保存' }}
      </Button>
    </div>
    <Alert v-if="dirty" role="status" type="warning">
      有尚未保存的运行配置，点击“保存设置”后生效。节点配置单独保存。
    </Alert>
    <Alert v-if="loadError" role="alert" type="error" :icon="CircleAlert">
      <span>{{ loadError }}</span>
      <template #actions>
        <Button variant="outline" size="sm" @click="load">重试读取</Button>
      </template>
    </Alert>
    <div class="settings-layout platform-layout">
      <nav class="settings-nav" aria-label="平台配置分区">
        <Button
          v-for="name in sections"
          :key="name"
          variant="plain"
          :class="{ selected: tab === name }"
          :aria-current="tab === name ? 'location' : undefined"
          @click="goTo(name)">
          {{ name }}
          <ChevronRight :size="14" />
        </Button>
      </nav>
      <section ref="panelEl" class="panel settings-panel platform-panel">
        <div id="platform-section-0" class="platform-section">
          <div class="section-heading">
            <div>
              <div class="settings-title">
                <Activity :size="19" />
                <h2>服务状态</h2>
              </div>
              <p class="section-description">查看平台服务与执行节点的连接情况。</p>
            </div>
            <Button variant="outline" size="sm" :disabled="checking" @click="check">
              <RefreshCw :class="{ 'probe-spinning': checking }" />
              {{ checking ? '检查中…' : '刷新状态' }}
            </Button>
          </div>
          <div class="service-list" aria-live="polite">
            <div v-for="service in services" :key="service.key" class="service-row">
              <span class="service-icon"><component :is="service.icon" :size="18" /></span>
              <div class="service-info">
                <strong>{{ service.title }}</strong>
                <small>{{ states[service.key].message }}</small>
              </div>
              <div class="service-result">
                <span class="service-state" :class="'is-' + states[service.key].status">
                  <i />
                  {{ labels[states[service.key].status] }}
                </span>
                <small v-if="states[service.key].latencyMs !== undefined">
                  {{ states[service.key].latencyMs }} ms
                </small>
              </div>
            </div>
          </div>
          <p class="section-note">
            {{ checkedAt ? '最近检查 ' + checkedAt + ' · ' : '' }}连接正常仅代表服务可达。
          </p>
        </div>
        <RunnerNodes id="platform-section-1" class="platform-section" />
        <Form id="platform-runtime-form" @submit="save">
          <fieldset :disabled="loading || saving || !!loadError" class="runtime-fields">
            <div id="platform-section-2" class="platform-section form-stack">
              <div>
                <div class="settings-title">
                  <Settings2 :size="19" />
                  <h2>运行环境</h2>
                </div>
                <p class="section-description">配置各语言的运行选项，保存后应用于后续任务。</p>
              </div>
              <div class="filter-tabs" role="tablist" aria-label="编程语言">
                <Button
                  v-for="item in [
                    { id: 'cpp', label: 'C++' },
                    { id: 'python', label: 'Python' },
                  ] as const"
                  :key="item.id"
                  variant="plain"
                  type="button"
                  role="tab"
                  :aria-selected="language === item.id"
                  :class="{ selected: language === item.id }"
                  @click="language = item.id">
                  {{ item.label }}
                  <PythonBeta v-if="item.id === 'python'" />
                </Button>
              </div>
              <div class="field-grid">
                <label v-if="language === 'cpp'">
                  C++ 标准
                  <Select v-model="form.languages.cpp.compilerProfile">
                    <SelectOption value="gcc13-cpp17">GCC 13.3 / C++17</SelectOption>
                    <SelectOption value="gcc13-cpp20">GCC 13.3 / C++20</SelectOption>
                  </Select>
                </label>
                <label>
                  {{ language === 'cpp' ? '优化等级' : 'Python 优化模式' }}
                  <Select v-if="language === 'cpp'" v-model="form.languages.cpp.optimization">
                    <SelectOption
                      v-for="option in ['O0', 'O1', 'O2', 'O3']"
                      :key="option"
                      :value="option">
                      {{ option }}
                    </SelectOption>
                  </Select>
                  <Select v-else v-model="form.languages.python.optimization">
                    <SelectOption value="none">默认</SelectOption>
                    <SelectOption value="O">-O</SelectOption>
                    <SelectOption value="OO">-OO</SelectOption>
                  </Select>
                </label>
              </div>
              <template v-if="language === 'cpp'">
                <label>
                  宏定义
                  <Input
                    v-model="form.languages.cpp.macros"
                    placeholder="例如 DEBUG LEVEL=2"
                    maxlength="1000" />
                  <small>以空格或换行分隔宏名称或 NAME=VALUE。</small>
                </label>
                <label class="toggle-row">
                  <span>
                    <strong>启用编译警告</strong>
                    <small>使用 -Wall 和 -Wextra 输出编译诊断。</small>
                  </span>
                  <Switch v-model="form.languages.cpp.warnings" />
                </label>
              </template>
              <div class="command-block">
                <span>{{ language === 'cpp' ? '编译指令' : '运行指令' }}</span>
                <code>{{ command }}</code>
                <small>执行程序与隔离参数由平台固定。</small>
              </div>
            </div>
            <div id="platform-section-3" class="platform-section form-stack">
              <div>
                <div class="settings-title">
                  <SlidersHorizontal :size="19" />
                  <h2>资源限额</h2>
                </div>
                <p class="section-description">
                  设置 {{ language === 'cpp' ? 'C++' : 'Python' }} 任务的资源上限及平台共享并发。
                </p>
              </div>
              <div class="filter-tabs" role="tablist" aria-label="资源限额语言">
                <Button
                  v-for="item in [
                    { id: 'cpp', label: 'C++' },
                    { id: 'python', label: 'Python' },
                  ] as const"
                  :key="item.id"
                  variant="plain"
                  type="button"
                  role="tab"
                  :aria-selected="language === item.id"
                  :class="{ selected: language === item.id }"
                  @click="language = item.id">
                  {{ item.label }}
                  <PythonBeta v-if="item.id === 'python'" />
                </Button>
              </div>
              <template v-for="group in groups" :key="group.title">
                <div v-if="language === 'cpp' || group.title !== '编译阶段'" class="limit-group">
                  <h3>{{ group.title }}</h3>
                  <div class="field-grid">
                    <NumberInputField
                      v-for="field in group.fields"
                      :key="field.key"
                      v-model.number="
                        (language === 'cpp'
                          ? form.languages.cpp
                          : (activeLanguage as typeof form.languages.cpp))[field.key]
                      "
                      :label="field.name"
                      :hint="`${field.min}–${field.max} ${field.unit}`"
                      :unit="field.unit"
                      :min="field.min"
                      :max="field.max"
                      :step="1"
                      required />
                  </div>
                </div>
              </template>
              <div class="limit-group">
                <h3>平台共享</h3>
                <div class="field-grid">
                  <NumberInputField
                    v-model.number="form.executionConcurrency"
                    label="执行槽位"
                    hint="所有语言共享"
                    unit="个"
                    :min="1"
                    :max="executionLimits.maxConcurrentRuns"
                    :step="1"
                    required />
                </div>
              </div>
              <div class="wall-clock">
                <strong>墙钟时间上限</strong>
                <span v-if="language === 'cpp'">
                  编译 {{ wallClockLimitMs(form.languages.cpp.compileTimeMs) / 1000 }} 秒
                </span>
                <span>非交互运行 {{ wallClockLimitMs(activeLanguage.runTimeMs) / 1000 }} 秒</span>
                <span>
                  交互运行 {{ wallClockLimitMs(activeLanguage.runTimeMs, true) / 1000 }} 秒
                </span>
              </div>
              <Alert type="info" :icon="ShieldCheck">
                学生代码在独立评测节点运行；更改不会影响已经开始的任务。
              </Alert>
            </div>
          </fieldset>
        </Form>
      </section>
    </div>
  </div>
</template>
<style scoped>
.settings-page {
  display: flex;
  flex-direction: column;
  height: calc(100dvh - 128px);
}
.settings-page .page-heading {
  margin-bottom: 20px;
}
.platform-layout {
  flex: 1;
  min-height: 0;
  grid-template-rows: minmax(0, 1fr);
}
.platform-panel {
  align-self: stretch;
  min-height: 300px;
  overflow-y: auto;
}
.platform-section {
  scroll-margin-top: 20px;
  min-width: 0;
}
.platform-panel > .platform-section + .platform-section,
.runtime-fields > .platform-section {
  border-top: 1px solid var(--ui-line);
  margin-top: 30px;
  padding-top: 30px;
}
.runtime-fields {
  border: 0;
  padding: 0;
  margin: 0;
  min-width: 0;
}
.runtime-fields:disabled {
  opacity: 0.6;
}
.section-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
}
.section-description,
.section-note {
  color: var(--ui-muted);
  font-size: 13px;
  line-height: 1.6;
}
.section-note {
  margin-top: 12px;
}
.service-list {
  margin-top: 20px;
}
.service-row {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 0;
  border-bottom: 1px solid var(--ui-line);
}
.service-icon {
  display: flex;
  color: var(--ui-icon-slate);
}
.service-info {
  flex: 1;
  min-width: 0;
  display: grid;
  gap: 4px;
}
.service-info strong {
  font-size: 14px;
  font-weight: 600;
}
.service-info small,
.service-result small {
  font-size: 13px;
  color: var(--ui-muted);
}
.service-result {
  display: grid;
  grid-template-columns: 84px 56px;
  align-items: center;
  gap: 10px;
}
.service-result small {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.service-state {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 3px 8px;
  border-radius: 4px;
  background: var(--ui-hover);
  color: var(--ui-muted);
  font-size: 13px;
  white-space: nowrap;
}
.service-state i {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: currentColor;
}
.service-state.is-healthy {
  color: var(--ui-success);
  background: var(--ui-success-bg);
}
.service-state.is-unavailable {
  color: var(--ui-error);
  background: var(--ui-error-bg);
}
.service-state.is-unconfigured {
  color: var(--ui-warning);
  background: var(--ui-warning-bg);
}
.service-state.is-checking {
  color: var(--ui-action);
  background: var(--ui-selection);
}
.field-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}
.field-grid > label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 14px;
}
.filter-tabs {
  margin: 0;
}
.command-block {
  display: grid;
  gap: 6px;
  font-size: 14px;
}
.command-block code {
  padding: 10px;
  background: var(--ui-hover);
  overflow-wrap: anywhere;
  font-size: 13px;
}
.command-block small {
  color: var(--ui-muted);
}
.limit-group {
  display: grid;
  gap: 12px;
}
.limit-group h3 {
  font-size: 14px;
  font-weight: 600;
}
.wall-clock {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
  padding: 14px;
  background: var(--ui-hover);
  color: var(--ui-secondary);
  font-size: 13px;
}
.wall-clock strong {
  color: var(--ui-text);
}
</style>
