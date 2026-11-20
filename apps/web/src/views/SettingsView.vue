<script setup lang="ts">
import { useActionFeedback } from '@/composables/useActionFeedback'
import { Alert } from '@/components/ui/alert'
import { useGuideSurfaces } from '@/lib/spotlight'
import { NumberInput } from '@/components/ui/number-input'
import { Form } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectOption } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Save, Copy, RefreshCw, ShieldCheck, Archive, Settings2, ChevronRight } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import Modal from '@/components/classroom/Modal.vue'
import PythonBeta from '@/components/classroom/PythonBeta.vue'
import type { SourceLanguage } from '@classroom/contracts'
import {
  activeClassroom,
  demo,
  notify,
  updateClass,
  classPath,
  reportError,
  executionSettings,
} from '@/data/demo'
import { api } from '@/lib/api'
import { confirmAction } from '@/lib/confirm'
import { classroomPolicyChanges } from '@/lib/sensitive-actions'
import { useRouter } from 'vue-router'
import { refresh } from '@/data/demo'
const router = useRouter()
const { t } = useI18n()
import { onBeforeRouteLeave } from 'vue-router'
const environmentLanguage = ref<SourceLanguage>('cpp')
const languageEnvironment = computed(() => executionSettings.languages[environmentLanguage.value])
const form = reactive({
  name: activeClassroom.value.name,
  description: activeClassroom.value.description,
  state: activeClassroom.value.status,
  access: String(activeClassroom.value.settings?.access ?? 'approval'),
  capacity: Number(activeClassroom.value.settings?.capacity ?? 50),
  allowJoin: activeClassroom.value.settings?.allowJoin !== false,
  allowRun: activeClassroom.value.settings?.allowRun !== false,
  allowResubmit: activeClassroom.value.settings?.allowResubmit !== false,
  readonly: activeClassroom.value.settings?.readonly !== false,
})
const initial = ref(JSON.stringify(form))
const dirty = computed(() => initial.value !== JSON.stringify(form))
const busy = ref(false)
const error = ref('')
const regenerate = ref(false)
const leave = ref(false)
let resolveLeave: ((allowed: boolean) => void) | undefined
onBeforeRouteLeave(() => {
  if (!dirty.value) return true
  leave.value = true
  return new Promise<boolean>((resolve) => {
    resolveLeave = resolve
  })
})
function settleLeave(allowed: boolean) {
  leave.value = false
  resolveLeave?.(allowed)
  resolveLeave = undefined
}
function beforeUnload(event: BeforeUnloadEvent) {
  if (dirty.value) {
    event.preventDefault()
    event.returnValue = ''
  }
}
onMounted(() => {
  window.addEventListener('beforeunload', beforeUnload)
  panelEl.value?.addEventListener('scroll', onScroll, { passive: true })
  spy()
})
onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', beforeUnload)
  panelEl.value?.removeEventListener('scroll', onScroll)
  if (spyRaf) cancelAnimationFrame(spyRaf)
})
// 各分区使用稳定 id，展示文案由 i18n 提供；导览 surface 键同样基于 id
const sections = ['basic', 'join', 'environment', 'policy', 'archive']
const sectionLabel = (id: string) => t(`settings.sections.${id}`)
const tab = ref(sections[0])
function goTo(name: string) {
  tab.value = name
  document
    .getElementById(`settings-section-${sections.indexOf(name)}`)
    ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
useGuideSurfaces(
  Object.fromEntries(
    sections.map((name) => [
      `settings-${name}`,
      () => {
        const previous = tab.value
        goTo(name)
        return () => {
          tab.value = previous
        }
      },
    ]),
  ),
)
const panelEl = ref<HTMLElement | null>(null)
let spyRaf = 0
function spy() {
  spyRaf = 0
  const panel = panelEl.value
  if (!panel) return
  const panelTop = panel.getBoundingClientRect().top
  let current = sections[0]
  for (let i = 0; i < sections.length; i++) {
    const el = document.getElementById(`settings-section-${i}`)
    if (el && el.getBoundingClientRect().top - panelTop <= 24) current = sections[i]
  }
  if (panel.scrollTop + panel.clientHeight >= panel.scrollHeight - 4)
    current = sections[sections.length - 1]
  tab.value = current
}
function onScroll() {
  if (!spyRaf) spyRaf = requestAnimationFrame(spy)
}
const archive = ref(false)
const reopen = ref(false)
const confirmState = ref('')
// 课堂状态在数据层使用中文取值，仅展示时翻译
const statusKeys: Record<string, string> = {
  not_started: 'settings.status.notStarted',
  ongoing: 'settings.status.ongoing',
  closed: 'settings.status.closed',
  archived: 'settings.status.archived',
}
const statusLabel = (status: string) => t(statusKeys[status] ?? 'settings.status.ongoing')
const inviteExpires = computed(() =>
  activeClassroom.value.inviteExpiresAt
    ? new Date(activeClassroom.value.inviteExpiresAt).toLocaleString('zh-CN')
    : t('settings.join.expireMissing'),
)
const inviteExpired = computed(
  () =>
    !!activeClassroom.value.inviteExpiresAt &&
    new Date(activeClassroom.value.inviteExpiresAt).getTime() < Date.now(),
)
async function save(status = form.state, confirmed = false) {
  if (busy.value) return false
  error.value = ''
  if (!form.name.trim()) {
    error.value = t('settings.save.nameRequired')
    goTo('basic')
    return false
  }
  if (!Number.isInteger(form.capacity) || form.capacity < 1 || form.capacity > 50) {
    error.value = t('settings.save.capacityInvalid')
    goTo('policy')
    return false
  }
  if (form.capacity < activeClassroom.value.students) {
    error.value = t('settings.save.capacityBelowStudents', {
      count: activeClassroom.value.students,
    })
    goTo('policy')
    return false
  }
  if (
    !confirmed &&
    status !== activeClassroom.value.status &&
    ['not_started', 'closed', 'archived'].includes(status)
  ) {
    confirmState.value = status
    return false
  }
  const settings = activeClassroom.value.settings
  const changedPolicies = classroomPolicyChanges(
    {
      access: String(settings?.access ?? 'approval'),
      capacity: Number(settings?.capacity ?? 50),
      allowJoin: settings?.allowJoin !== false,
      allowRun: settings?.allowRun !== false,
      allowResubmit: settings?.allowResubmit !== false,
      readonly: settings?.readonly !== false,
    },
    {
      access: form.access,
      capacity: form.capacity,
      allowJoin: form.allowJoin,
      allowRun: form.allowRun,
      allowResubmit: form.allowResubmit,
      readonly: form.readonly,
    },
  )
  if (!confirmed && (changedPolicies.length || status !== activeClassroom.value.status)) {
    const policySummary = changedPolicies.length
      ? t('settings.save.confirmPolicies', {
          policies: changedPolicies.join(t('settings.listSeparator')),
        })
      : ''
    const statusSummary =
      status !== activeClassroom.value.status
        ? t('settings.save.confirmStatus', { status: statusLabel(status) })
        : ''
    if (
      !(await confirmAction(
        `${t('settings.save.confirmTitle')}${statusSummary}${policySummary}${t('settings.save.confirmTail')}`,
      ))
    )
      return false
  }
  busyReason.value = t('settings.save.busy')
  busy.value = true
  try {
    await updateClass({
      name: form.name.trim(),
      description: form.description,
      status,
      settings: {
        access: form.access,
        allowJoin: form.allowJoin,
        allowRun: form.allowRun,
        allowResubmit: form.allowResubmit,
        readonly: form.readonly,
        capacity: form.capacity,
      },
    })
    form.state = status
    initial.value = JSON.stringify(form)
    notify(t('settings.save.success'))
    return true
  } catch (e) {
    error.value = e instanceof Error ? e.message : t('settings.save.failed')
    return false
  } finally {
    busy.value = false
  }
}
async function copy() {
  try {
    await navigator.clipboard.writeText(`${location.origin}/join?code=${demo.inviteCode}`)
    notify(t('settings.join.inviteCopied'))
  } catch {
    notify(t('settings.join.copyManual', { code: demo.inviteCode }))
  }
}
async function regenerateInvite() {
  if (busy.value) return
  busyReason.value = t('settings.join.regenerating')
  busy.value = true
  try {
    const data = await api<{ inviteCode: string; inviteExpiresAt?: string }>(
      classPath('/invite'),
      'POST',
      {},
    )
    demo.inviteCode = data.inviteCode
    activeClassroom.value.inviteCode = data.inviteCode
    if (data.inviteExpiresAt) activeClassroom.value.inviteExpiresAt = data.inviteExpiresAt
    regenerate.value = false
    notify(t('settings.join.codeUpdated'))
  } catch (e) {
    reportError(e)
  } finally {
    busy.value = false
  }
}
async function deleteClass() {
  if (
    busy.value ||
    !(await confirmAction(
      t('settings.archive.deleteConfirm', { name: activeClassroom.value.name }),
      {
        destructive: true,
      },
    ))
  )
    return
  busy.value = true
  try {
    await api(classPath(), 'DELETE')
    initial.value = JSON.stringify(form)
    await refresh()
    notify(t('settings.archive.deleted'))
    await router.push('/teacher/classes')
  } catch (e) {
    error.value = e instanceof Error ? e.message : t('settings.archive.deleteFailed')
  } finally {
    busy.value = false
  }
}
async function archiveClass() {
  if (await save('archived', true)) archive.value = false
}
useActionFeedback(error)
const busyReason = ref(t('settings.busyDefault'))
</script>
<template>
  <div class="settings-page">
    <div class="page-heading">
      <div>
        <div class="heading-meta">{{ t('settings.headingMeta') }}</div>
        <h1>{{ t('settings.title') }}</h1>
      </div>
      <Button
        :disabled="busy || !dirty"
        :data-disabled-reason="busy ? busyReason : t('settings.save.noChanges')"
        @click="save()">
        <Save />
        {{
          busy
            ? t('settings.save.saving')
            : dirty
              ? t('settings.save.button')
              : t('settings.save.saved')
        }}
      </Button>
    </div>

    <Alert v-if="dirty" role="status" type="warning">
      {{ t('settings.save.unsavedAlert') }}
    </Alert>
    <div class="settings-layout" :inert="busy">
      <nav class="settings-nav">
        <Button
          v-for="section in sections"
          :key="section"
          variant="plain"
          :class="{ selected: tab === section }"
          @click="goTo(section)">
          {{ sectionLabel(section) }}
          <ChevronRight :size="14" />
        </Button>
      </nav>
      <section ref="panelEl" class="panel settings-panel">
        <Form id="settings-section-0" class="form-stack settings-section" @submit.prevent="save()">
          <div class="settings-title">
            <Settings2 :size="19" />
            <h2>{{ t('settings.basic.title') }}</h2>
          </div>
          <label>
            {{ t('settings.basic.name') }}
            <Input v-model="form.name" required maxlength="50" />
          </label>
          <label>
            {{ t('settings.basic.description') }}
            <Textarea v-model="form.description" rows="5" />
          </label>
          <label>
            {{ t('settings.basic.status') }}
            <Select
              v-model="form.state"
              :disabled="busy || activeClassroom.status === 'archived'"
              :data-disabled-reason="busy ? busyReason : t('settings.basic.archivedReason')">
              <SelectOption value="not_started">{{ t('settings.status.notStarted') }}</SelectOption>
              <SelectOption value="ongoing">{{ t('settings.status.ongoing') }}</SelectOption>
              <SelectOption value="closed">{{ t('settings.status.closed') }}</SelectOption>
              <SelectOption v-if="activeClassroom.status === 'archived'" value="archived">
                {{ t('settings.status.archived') }}
              </SelectOption>
            </Select>
          </label>
        </Form>
        <div id="settings-section-1" class="form-stack settings-section">
          <div class="settings-title">
            <ShieldCheck :size="19" />
            <h2>{{ t('settings.join.title') }}</h2>
          </div>
          <label class="toggle-row">
            <span>
              <strong>{{ t('settings.join.allowJoin') }}</strong>
              <small>{{ t('settings.join.allowJoinHint') }}</small>
            </span>
            <Switch v-model="form.allowJoin" />
          </label>
          <label>
            {{ t('settings.join.access') }}
            <Select v-model="form.access">
              <SelectOption value="direct">{{ t('settings.join.accessDirect') }}</SelectOption>
              <SelectOption value="approval">{{ t('settings.join.accessApproval') }}</SelectOption>
              <SelectOption value="roster">{{ t('settings.join.accessRoster') }}</SelectOption>
            </Select>
          </label>
          <label>
            {{ t('settings.join.currentCode') }}
            <div class="copy-row">
              <Input :value="demo.inviteCode" readonly />
              <Button variant="outline" @click="copy">
                <Copy />
                {{ t('settings.join.copyInvite') }}
              </Button>
            </div>
          </label>
          <p class="form-hint" :class="{ 'danger-text': inviteExpired }">
            {{
              (inviteExpired ? t('settings.join.codeExpired') : t('settings.join.validUntil')) +
              inviteExpires +
              t('settings.join.expireNote')
            }}
          </p>
          <Button
            variant="outline"
            class="self-start"
            :disabled="busy"
            :data-disabled-reason="busyReason"
            @click="regenerate = true">
            <RefreshCw />
            {{ t('settings.join.regenerate') }}
          </Button>
        </div>
        <div id="settings-section-2" class="form-stack settings-section">
          <div class="settings-title">
            <Settings2 :size="19" />
            <h2>{{ t('settings.environment.title') }}</h2>
          </div>
          <Alert type="info">{{ t('settings.environment.adminNote') }}</Alert>
          <div
            class="filter-tabs"
            role="tablist"
            :aria-label="t('settings.environment.languageLabel')">
            <Button
              variant="plain"
              type="button"
              role="tab"
              :aria-selected="environmentLanguage === 'cpp'"
              :class="{ selected: environmentLanguage === 'cpp' }"
              @click="environmentLanguage = 'cpp'">
              C++
            </Button>
            <Button
              variant="plain"
              type="button"
              role="tab"
              :aria-selected="environmentLanguage === 'python'"
              :class="{ selected: environmentLanguage === 'python' }"
              @click="environmentLanguage = 'python'">
              Python
              <PythonBeta />
            </Button>
          </div>
          <p>
            {{
              environmentLanguage === 'cpp'
                ? executionSettings.languages.cpp.compilerProfile === 'gcc13-cpp20'
                  ? 'GCC · C++20'
                  : 'GCC · C++17'
                : t('settings.environment.python')
            }}
          </p>
          <div class="environment-grid">
            <div>
              <span>{{ t('settings.environment.projectType') }}</span>
              <strong>
                {{
                  t('settings.environment.projectTypeValue', {
                    language: environmentLanguage === 'cpp' ? 'C++' : 'Python',
                  })
                }}
              </strong>
            </div>
            <div>
              <span>{{ t('settings.environment.runTime') }}</span>
              <strong>{{ languageEnvironment.runTimeMs }} ms</strong>
            </div>
            <div>
              <span>{{ t('settings.environment.memory') }}</span>
              <strong>{{ languageEnvironment.runMemoryMb }} MiB</strong>
            </div>
            <div>
              <span>{{ t('settings.environment.output') }}</span>
              <strong>{{ languageEnvironment.outputLimitKb }} KiB</strong>
            </div>
            <div v-if="environmentLanguage === 'cpp'">
              <span>{{ t('settings.environment.compileTime') }}</span>
              <strong>{{ executionSettings.languages.cpp.compileTimeMs }} ms</strong>
            </div>
            <div v-if="environmentLanguage === 'cpp'">
              <span>{{ t('settings.environment.compileMemory') }}</span>
              <strong>{{ executionSettings.languages.cpp.compileMemoryMb }} MiB</strong>
            </div>
          </div>
        </div>
        <div id="settings-section-3" class="form-stack settings-section">
          <h2>{{ t('settings.policy.title') }}</h2>
          <label class="toggle-row">
            <span>
              <strong>{{ t('settings.policy.allowRun') }}</strong>
              <small>{{ t('settings.policy.allowRunHint') }}</small>
            </span>
            <Switch v-model="form.allowRun" />
          </label>
          <label class="toggle-row">
            <span>
              <strong>{{ t('settings.policy.allowResubmit') }}</strong>
              <small>{{ t('settings.policy.allowResubmitHint') }}</small>
            </span>
            <Switch v-model="form.allowResubmit" />
          </label>
          <label class="toggle-row">
            <span>
              <strong>{{ t('settings.policy.readonly') }}</strong>
              <small>{{ t('settings.policy.readonlyHint') }}</small>
            </span>
            <Switch v-model="form.readonly" />
          </label>
          <label>
            {{ t('settings.policy.capacity') }}
            <NumberInput v-model.number="form.capacity" min="1" max="50" />
          </label>
          <p class="form-hint">
            {{ t('settings.policy.capacityHint', { count: activeClassroom.students }) }}
          </p>
        </div>
        <div id="settings-section-4" class="form-stack settings-section">
          <div class="settings-title">
            <Archive :size="20" />
            <h2>{{ t('settings.archive.title') }}</h2>
          </div>
          <p class="body-copy">
            {{ t('settings.archive.body') }}
          </p>
          <Alert type="warning">{{ t('settings.archive.keepNote') }}</Alert>
          <div class="inline-items">
            <Button
              v-if="activeClassroom.status === 'archived'"
              variant="success"
              class="self-start"
              @click="reopen = true">
              {{ t('settings.archive.reopen') }}
            </Button>
            <Button
              variant="destructive"
              class="self-start"
              :disabled="busy || activeClassroom.status === 'archived'"
              :data-disabled-reason="busy ? busyReason : t('settings.basic.archivedReason')"
              @click="archive = true">
              {{
                activeClassroom.status === 'archived'
                  ? t('settings.archive.archived')
                  : t('settings.archive.archiveButton')
              }}
            </Button>
            <Button
              v-if="activeClassroom.canManageStaff"
              variant="destructive"
              class="self-start"
              :disabled="busy"
              @click="deleteClass">
              {{ t('settings.archive.delete') }}
            </Button>
          </div>
        </div>
      </section>
    </div>
  </div>
  <Modal
    v-model:open="archive"
    :title="t('settings.archiveModal.title')"
    :description="t('settings.archiveModal.description')">
    <p class="body-copy">
      {{ t('settings.archiveModal.body') }}
    </p>
    <div class="modal-actions">
      <Button
        variant="outline"
        :disabled="busy"
        :data-disabled-reason="busyReason"
        @click="archive = false">
        {{ t('settings.archiveModal.continue') }}
      </Button>
      <Button
        variant="destructive"
        :disabled="busy"
        :data-disabled-reason="busyReason"
        @click="archiveClass">
        {{ busy ? t('settings.archiveModal.working') : t('settings.archiveModal.confirm') }}
      </Button>
    </div>
  </Modal>
  <Modal
    v-model:open="regenerate"
    :title="t('settings.regenerateModal.title')"
    :description="t('settings.regenerateModal.description')">
    <div class="modal-actions">
      <Button
        variant="outline"
        :disabled="busy"
        :data-disabled-reason="busyReason"
        @click="regenerate = false">
        {{ t('common.cancel') }}
      </Button>
      <Button
        variant="warning"
        :disabled="busy"
        :data-disabled-reason="busyReason"
        @click="regenerateInvite">
        {{ busy ? t('settings.regenerateModal.working') : t('settings.regenerateModal.confirm') }}
      </Button>
    </div>
  </Modal>
  <Modal
    :open="leave"
    :title="t('settings.leaveModal.title')"
    :description="t('settings.leaveModal.description')"
    @update:open="!$event && settleLeave(false)">
    <div class="modal-actions">
      <Button variant="outline" @click="settleLeave(false)">
        {{ t('settings.leaveModal.continue') }}
      </Button>
      <Button variant="destructive" @click="settleLeave(true)">
        {{ t('settings.leaveModal.discard') }}
      </Button>
    </div>
  </Modal>
  <Modal
    v-model:open="reopen"
    :title="t('settings.reopenModal.title')"
    :description="t('settings.reopenModal.description')">
    <div class="modal-actions">
      <Button
        variant="outline"
        :disabled="busy"
        :data-disabled-reason="busyReason"
        @click="reopen = false">
        {{ t('common.cancel') }}
      </Button>
      <Button
        variant="success"
        :disabled="busy"
        :data-disabled-reason="busyReason"
        @click="
          async () => {
            if (await save('ongoing', true)) reopen = false
          }
        ">
        {{ busy ? t('settings.reopenModal.working') : t('settings.reopenModal.confirm') }}
      </Button>
    </div>
  </Modal>
  <Modal
    :open="!!confirmState"
    :title="t('settings.confirmStateModal.title')"
    :description="
      t('settings.confirmStateModal.description', { status: statusLabel(confirmState) })
    "
    @update:open="!$event && (confirmState = '')">
    <div class="modal-actions">
      <Button
        variant="outline"
        :disabled="busy"
        :data-disabled-reason="busyReason"
        @click="confirmState = ''">
        {{ t('common.cancel') }}
      </Button>
      <Button
        variant="warning"
        :disabled="busy"
        :data-disabled-reason="busyReason"
        @click="
          async () => {
            if (await save(confirmState, true)) confirmState = ''
          }
        ">
        {{ t('settings.confirmStateModal.confirm') }}
      </Button>
    </div>
  </Modal>
</template>

<style scoped>
.settings-page {
  display: flex;
  flex-direction: column;
  /* topbar 66px + page-content 上下 padding 32/30 */
  height: calc(100dvh - 128px);
}
.settings-page .page-heading {
  margin-bottom: 20px;
}
.settings-layout {
  flex: 1;
  min-height: 0;
  grid-template-rows: minmax(0, 1fr);
}
.settings-panel {
  align-self: stretch;
  min-height: 300px;
  overflow-y: auto;
}
.settings-section {
  scroll-margin-top: 20px;
}
.settings-panel > * + * {
  border-top: 1px solid var(--ui-line);
  margin-top: 30px;
  padding-top: 30px;
}
.settings-panel,
.settings-panel .form-stack > label {
  min-width: 0;
}
.settings-panel .form-stack input:not([type='checkbox']),
.settings-panel textarea,
.settings-panel .ui-select-trigger {
  max-width: 100%;
}
.environment-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.environment-grid strong {
  overflow-wrap: anywhere;
}
@media (max-width: 500px) {
  .environment-grid {
    grid-template-columns: minmax(0, 1fr);
  }
  .settings-nav {
    flex-wrap: nowrap;
    position: static;
  }
}
</style>
