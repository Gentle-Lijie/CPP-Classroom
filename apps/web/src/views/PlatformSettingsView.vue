<script setup lang="ts">
import { useActionFeedback } from '@/composables/useActionFeedback'
import { Alert } from '@/components/ui/alert'
import { NumberInputField } from '@/components/ui/number-input'
import { Form } from '@/components/ui/form'
import { Select, SelectOption } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { computed, onMounted, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { useI18n } from 'vue-i18n'
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

const { t, locale } = useI18n()
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
        t('admin.settings.sourceFile'),
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
        t('admin.settings.sourceFile'),
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
  api: { status: 'idle', message: '' },
  database: { status: 'idle', message: '' },
  runner: { status: 'idle', message: '' },
})
// 初始“尚未检查连接”文案需要随语言切换响应
function syncIdleMessages() {
  for (const state of Object.values(states))
    if (state.status === 'idle') state.message = t('admin.settings.probeNotChecked')
}
syncIdleMessages()
watch(locale, syncIdleMessages)
const services = computed(
  () =>
    [
      {
        key: 'api',
        title: t('admin.settings.service.api.title'),
        subtitle: t('admin.settings.service.api.subtitle'),
        icon: Activity,
      },
      {
        key: 'database',
        title: t('admin.settings.service.database.title'),
        subtitle: t('admin.settings.service.database.subtitle'),
        icon: Database,
      },
      {
        key: 'runner',
        title: t('admin.settings.service.runner.title'),
        subtitle: t('admin.settings.service.runner.subtitle'),
        icon: Server,
      },
    ] as const,
)
const groups = [
  {
    key: 'compile',
    fields: [
      { key: 'compileTimeMs', unit: 'ms', min: 1000, max: 20000 },
      { key: 'compileMemoryMb', unit: 'MiB', min: 128, max: 1024 },
    ],
  },
  {
    key: 'run',
    fields: [
      { key: 'runTimeMs', unit: 'ms', min: 100, max: 10000 },
      { key: 'runMemoryMb', unit: 'MiB', min: 16, max: 512 },
    ],
  },
  {
    key: 'output',
    fields: [{ key: 'outputLimitKb', unit: 'KiB', min: 16, max: 2048 }],
  },
] as const
const labels = computed<Record<ProbeState, string>>(() => ({
  idle: t('admin.settings.probeState.idle'),
  checking: t('admin.settings.probeState.checking'),
  healthy: t('admin.settings.probeState.healthy'),
  unavailable: t('admin.settings.probeState.unavailable'),
  unconfigured: t('admin.settings.probeState.unconfigured'),
}))
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
    loadError.value = t('admin.settings.loadFailed')
  } finally {
    loading.value = false
  }
}
async function check() {
  if (checking.value) return
  checking.value = true
  for (const state of Object.values(states)) {
    state.status = 'checking'
    state.message = t('admin.settings.probeChecking')
    delete state.latencyMs
  }
  try {
    Object.assign(states, await probePlatform(AbortSignal.timeout(12000)))
  } catch {
    for (const state of Object.values(states)) {
      state.status = 'unavailable'
      state.message = t('admin.settings.probeFailed')
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
    saveError.value = t('admin.settings.macrosInvalid')
    return
  }
  const value = configuration()
  if (!(await confirmAction(t('admin.settings.saveConfirm')))) return
  saving.value = true
  saveError.value = ''
  try {
    await api('/admin/settings', 'POST', value)
    Object.assign(executionSettings, value)
    savedSnapshot.value = JSON.stringify(value)
    notify(t('admin.settings.saveNotify'))
  } catch (error) {
    saveError.value = error instanceof Error ? error.message : t('admin.settings.saveFailed')
  } finally {
    saving.value = false
  }
}
const sectionKeys = ['services', 'nodes', 'runtime', 'limits'] as const
const sections = computed(() => sectionKeys.map((key) => t(`admin.settings.section.${key}`)))
const tab = ref(sections.value[0])
const panelEl = ref<HTMLElement | null>(null)
let spyRaf = 0
function goTo(index: number) {
  tab.value = sections.value[index]
  document
    .getElementById(`platform-section-${index}`)
    ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
function spy() {
  spyRaf = 0
  const panel = panelEl.value
  if (!panel) return
  const panelTop = panel.getBoundingClientRect().top
  let current = sections.value[0]
  for (let i = 0; i < sections.value.length; i++) {
    const el = document.getElementById(`platform-section-${i}`)
    if (el && el.getBoundingClientRect().top - panelTop <= 24) current = sections.value[i]
  }
  if (panel.scrollTop + panel.clientHeight >= panel.scrollHeight - 4)
    current = sections.value[sections.value.length - 1]
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
  return !dirty.value || (await confirmAction(t('admin.settings.leaveConfirm')))
})
useActionFeedback(saveError)
</script>
<template>
  <div class="settings-page platform-settings-page">
    <div class="page-heading">
      <div>
        <div class="heading-meta">{{ t('admin.platformAdmin') }}</div>
        <h1>{{ t('admin.settings.title') }}</h1>
      </div>
      <Button
        type="submit"
        form="platform-runtime-form"
        :disabled="loading || saving || !!loadError || !dirty"
        :data-disabled-reason="
          loading
            ? t('admin.settings.loadingReason')
            : saving
              ? t('admin.settings.savingReason')
              : loadError
                ? t('admin.settings.loadFailReason')
                : t('admin.settings.noChangeReason')
        ">
        <Save />
        {{
          saving
            ? t('admin.settings.saving')
            : dirty
              ? t('admin.settings.save')
              : t('admin.settings.saved')
        }}
      </Button>
    </div>
    <Alert v-if="dirty" role="status" type="warning">
      {{ t('admin.settings.dirtyAlert') }}
    </Alert>
    <Alert v-if="loadError" role="alert" type="error" :icon="CircleAlert">
      <span>{{ loadError }}</span>
      <template #actions>
        <Button variant="outline" size="sm" @click="load">
          {{ t('admin.settings.retryRead') }}
        </Button>
      </template>
    </Alert>
    <div class="settings-layout platform-layout">
      <nav class="settings-nav" :aria-label="t('admin.settings.navAria')">
        <Button
          v-for="(name, index) in sections"
          :key="name"
          variant="plain"
          :class="{ selected: tab === name }"
          :aria-current="tab === name ? 'location' : undefined"
          @click="goTo(index)">
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
                <h2>{{ t('admin.settings.servicesTitle') }}</h2>
              </div>
              <p class="section-description">{{ t('admin.settings.servicesDescription') }}</p>
            </div>
            <Button variant="outline" size="sm" :disabled="checking" @click="check">
              <RefreshCw :class="{ 'probe-spinning': checking }" />
              {{ checking ? t('admin.settings.checking') : t('admin.settings.refreshStatus') }}
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
            {{
              (checkedAt ? t('admin.settings.noteRecent', { time: checkedAt }) : '') +
              t('admin.settings.noteReachable')
            }}
          </p>
        </div>
        <RunnerNodes id="platform-section-1" class="platform-section" />
        <Form id="platform-runtime-form" @submit="save">
          <fieldset :disabled="loading || saving || !!loadError" class="runtime-fields">
            <div id="platform-section-2" class="platform-section form-stack">
              <div>
                <div class="settings-title">
                  <Settings2 :size="19" />
                  <h2>{{ t('admin.settings.runtimeTitle') }}</h2>
                </div>
                <p class="section-description">{{ t('admin.settings.runtimeDescription') }}</p>
              </div>
              <div
                class="filter-tabs"
                role="tablist"
                :aria-label="t('admin.settings.languageAria')">
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
                  {{ t('admin.settings.cppStandard') }}
                  <Select v-model="form.languages.cpp.compilerProfile">
                    <SelectOption value="gcc13-cpp17">GCC 13.3 / C++17</SelectOption>
                    <SelectOption value="gcc13-cpp20">GCC 13.3 / C++20</SelectOption>
                  </Select>
                </label>
                <label>
                  {{
                    language === 'cpp'
                      ? t('admin.settings.optimization')
                      : t('admin.settings.pythonOptimization')
                  }}
                  <Select v-if="language === 'cpp'" v-model="form.languages.cpp.optimization">
                    <SelectOption
                      v-for="option in ['O0', 'O1', 'O2', 'O3']"
                      :key="option"
                      :value="option">
                      {{ option }}
                    </SelectOption>
                  </Select>
                  <Select v-else v-model="form.languages.python.optimization">
                    <SelectOption value="none">
                      {{ t('admin.settings.optimizationDefault') }}
                    </SelectOption>
                    <SelectOption value="O">-O</SelectOption>
                    <SelectOption value="OO">-OO</SelectOption>
                  </Select>
                </label>
              </div>
              <template v-if="language === 'cpp'">
                <label>
                  {{ t('admin.settings.macros') }}
                  <Input
                    v-model="form.languages.cpp.macros"
                    :placeholder="t('admin.settings.macrosPlaceholder')"
                    maxlength="1000" />
                  <small>{{ t('admin.settings.macrosHint') }}</small>
                </label>
                <label class="toggle-row">
                  <span>
                    <strong>{{ t('admin.settings.warningsTitle') }}</strong>
                    <small>{{ t('admin.settings.warningsHint') }}</small>
                  </span>
                  <Switch v-model="form.languages.cpp.warnings" />
                </label>
              </template>
              <div class="command-block">
                <span>
                  {{
                    language === 'cpp'
                      ? t('admin.settings.compileCommand')
                      : t('admin.settings.runCommand')
                  }}
                </span>
                <code>{{ command }}</code>
                <small>{{ t('admin.settings.commandNote') }}</small>
              </div>
            </div>
            <div id="platform-section-3" class="platform-section form-stack">
              <div>
                <div class="settings-title">
                  <SlidersHorizontal :size="19" />
                  <h2>{{ t('admin.settings.limitsTitle') }}</h2>
                </div>
                <p class="section-description">
                  {{
                    t('admin.settings.limitsDescription', {
                      language: language === 'cpp' ? 'C++' : 'Python',
                    })
                  }}
                </p>
              </div>
              <div
                class="filter-tabs"
                role="tablist"
                :aria-label="t('admin.settings.limitsLanguageAria')">
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
              <template v-for="group in groups" :key="group.key">
                <div v-if="language === 'cpp' || group.key !== 'compile'" class="limit-group">
                  <h3>{{ t(`admin.settings.group.${group.key}`) }}</h3>
                  <div class="field-grid">
                    <NumberInputField
                      v-for="field in group.fields"
                      :key="field.key"
                      v-model.number="
                        (language === 'cpp'
                          ? form.languages.cpp
                          : (activeLanguage as typeof form.languages.cpp))[field.key]
                      "
                      :label="t(`admin.settings.field.${field.key}`)"
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
                <h3>{{ t('admin.settings.sharedTitle') }}</h3>
                <div class="field-grid">
                  <NumberInputField
                    v-model.number="form.executionConcurrency"
                    :label="t('admin.settings.executionSlots')"
                    :hint="t('admin.settings.sharedHint')"
                    :unit="t('admin.settings.slotsUnit')"
                    :min="1"
                    :max="executionLimits.maxConcurrentRuns"
                    :step="1"
                    required />
                </div>
              </div>
              <div class="wall-clock">
                <strong>{{ t('admin.settings.wallClockTitle') }}</strong>
                <span v-if="language === 'cpp'">
                  {{
                    t('admin.settings.wallCompile', {
                      seconds: wallClockLimitMs(form.languages.cpp.compileTimeMs) / 1000,
                    })
                  }}
                </span>
                <span>
                  {{
                    t('admin.settings.wallRun', {
                      seconds: wallClockLimitMs(activeLanguage.runTimeMs) / 1000,
                    })
                  }}
                </span>
                <span>
                  {{
                    t('admin.settings.wallInteractive', {
                      seconds: wallClockLimitMs(activeLanguage.runTimeMs, true) / 1000,
                    })
                  }}
                </span>
              </div>
              <Alert type="info" :icon="ShieldCheck">
                {{ t('admin.settings.limitsInfo') }}
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
