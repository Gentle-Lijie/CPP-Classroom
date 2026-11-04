<script setup lang="ts">
import { useActionFeedback } from '@/composables/useActionFeedback'
import { Alert } from '@/components/ui/alert'
import { FileUpload } from '@/components/ui/file-upload'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Form } from '@/components/ui/form'
import { Textarea } from '@/components/ui/textarea'
import { computed, ref, onMounted, onBeforeUnmount, watch } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import {
  DropdownMenuRoot,
  DropdownMenuTrigger,
  DropdownMenuPortal,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from 'reka-ui'
import {
  Search,
  UserPlus,
  Upload,
  Download,
  Check,
  Users,
  KeyRound,
  FileDown,
  RefreshCw,
  Ellipsis,
} from '@lucide/vue'
import { Button } from '@/components/ui/button'
import Modal from '@/components/classroom/Modal.vue'
import ContentPanel from '@/components/classroom/ContentPanel.vue'
import CredentialDialog from '@/components/classroom/CredentialDialog.vue'
import Pagination from '@/components/classroom/Pagination.vue'
import ClassroomAssignments from '@/components/classroom/ClassroomAssignments.vue'
import { usePagination } from '@/composables/usePagination'
import {
  students,
  notify,
  download,
  refresh,
  currentUser,
  demo,
  activeClassroom,
} from '@/data/demo'
import { api } from '@/lib/api'
import { runMemberBatch, memberBatchMessage } from '@/lib/member-batch'
import { confirmAction } from '@/lib/confirm'
import { csvDocument, parseRoster, rosterContent, type RosterRow } from '@/lib/csv'
import { readRosterFile, rosterCsvTemplate, rosterExcelTemplate } from '@/lib/roster-file'
import { downloadBlob } from '@/lib/source-archive'
interface Member {
  id: string
  name: string
  number: string
  username: string
  membership: string
  disabled: boolean
  canResetPassword: boolean
  canDeleteAccount: boolean
}
interface Credential {
  id: string
  name: string
  number: string
  username: string
  password?: string
  generatedAt?: string
}
const { t } = useI18n()
const search = ref(''),
  tab = ref('all'),
  add = ref(false),
  name = ref(''),
  number = ref(''),
  username = ref(''),
  password = ref('')
const deleteTarget = ref<Member>()
const remove = ref<Member>(),
  importing = ref(false),
  csv = ref(''),
  busy = ref(false),
  error = ref('')
const readingFile = ref(false),
  downloadingTemplate = ref(false)
const loading = ref(false),
  loadError = ref(''),
  updatedAt = ref('')
const members = ref<Member[]>([]),
  selected = ref<string[]>([]),
  resetting = ref(false),
  resetTargets = ref<string[]>([]),
  credentialsOpen = ref(false)
const importResults = ref<{ name: string; number: string; error?: string; created?: boolean }[]>([])
const credentialKey = computed(() => `cpp-credentials:${currentUser.value?.id}:${demo.classroomId}`)
const credentials = ref<Credential[]>([])
const batchProgress = ref({ completed: 0, total: 0 })
let mounted = true
const route = useRoute()
const router = useRouter()
const assignments = ref<InstanceType<typeof ClassroomAssignments>>()
const section = computed(() =>
  route.query.section === 'staff' && activeClassroom.value.canManageStaff ? 'staff' : 'students',
)
function switchSection(value: 'students' | 'staff') {
  if (busy.value) return
  void router.replace({
    query: { ...route.query, section: value === 'staff' ? 'staff' : undefined },
  })
}
function openRemove(member: Member) {
  error.value = ''
  remove.value = member
}
async function assignmentsChanged(assignment?: { role: string; status: 'active' | 'removed' }) {
  try {
    await refresh()
    await loadMembers(true)
    if (assignment && activeClassroom.value.canManageStaff) {
      switchSection(assignment.role === 'student' ? 'students' : 'staff')
      if (assignment.role === 'student' && assignment.status === 'removed') tab.value = 'removed'
    }
  } catch {
    notify(t('roster.notify.membersUpdatedRefreshFailed'), 'error')
  }
}
watch(
  credentialKey,
  (key) => {
    let saved: Credential[] = []
    try {
      const data: unknown = JSON.parse(sessionStorage.getItem(key) ?? '[]')
      if (Array.isArray(data))
        saved = data.filter(
          (c): c is Credential =>
            !!c &&
            typeof c === 'object' &&
            typeof c.id === 'string' &&
            typeof c.password === 'string',
        )
    } catch {
      /* Browser cache is optional. */
    }
    credentials.value = saved
    selected.value = []
    members.value = []
    updatedAt.value = ''
    add.value = false
    importing.value = false
    resetting.value = false
    remove.value = undefined
    deleteTarget.value = undefined
    credentialsOpen.value = false
  },
  { immediate: true },
)
watch(
  credentials,
  (value) => {
    try {
      sessionStorage.setItem(credentialKey.value, JSON.stringify(value))
    } catch {
      /* Export remains available without browser cache. */
    }
  },
  { deep: true },
)
const pending = computed(() => members.value.filter((m) => m.membership === 'pending'))
const removed = computed(() => members.value.filter((m) => m.membership === 'removed'))
const active = computed(() => members.value.filter((m) => m.membership === 'active'))
const tabs = computed(() => [
  { id: 'all', label: t('roster.tabs.all'), count: active.value.length },
  {
    id: 'online',
    label: t('roster.tabs.online'),
    count: students.filter((s) => s.online).length,
  },
  { id: 'pending', label: t('roster.tabs.pending'), count: pending.value.length },
  { id: 'removed', label: t('roster.tabs.removed'), count: removed.value.length },
])
const visible = computed(() => {
  const query = search.value.trim().toLowerCase()
  return (
    tab.value === 'pending'
      ? pending.value
      : tab.value === 'removed'
        ? removed.value
        : active.value.filter(
            (m) => tab.value !== 'online' || students.find((s) => s.id === m.id)?.online,
          )
  ).filter((m) => `${m.name} ${m.number} ${m.username}`.toLowerCase().includes(query))
})
const { page, pageSize, paged } = usePagination(visible, [search, tab])
const selectablePage = computed(() => paged.value)
const selectedMembers = computed(() => members.value.filter((m) => selected.value.includes(m.id)))
const hasSelection = computed(() => selectedMembers.value.length > 0)
const canBatchReset = computed(
  () =>
    hasSelection.value &&
    selectedMembers.value.every(
      (m) => m.canResetPassword && m.membership === 'active' && !m.disabled,
    ),
)
const canBatchEdit = computed(
  () =>
    hasSelection.value &&
    activeClassroom.value.canManageStaff &&
    selectedMembers.value.every((m) => !m.disabled && m.membership === 'active'),
)
const canBatchDelete = computed(
  () =>
    hasSelection.value &&
    selectedMembers.value.every((m) => m.canDeleteAccount && m.membership === 'active'),
)
const canBatchRemove = computed(
  () => hasSelection.value && selectedMembers.value.every((m) => m.membership === 'active'),
)
const canBatchApprove = computed(
  () =>
    hasSelection.value &&
    selectedMembers.value.every((m) => m.membership === 'pending' && !m.disabled),
)
const canBatchReject = computed(
  () => hasSelection.value && selectedMembers.value.every((m) => m.membership === 'pending'),
)
const canBatchRestore = computed(
  () =>
    hasSelection.value &&
    selectedMembers.value.every((m) => m.membership === 'removed' && !m.disabled),
)
const allPageSelected = computed(
  () =>
    !!selectablePage.value.length &&
    selectablePage.value.every((m) => selected.value.includes(m.id)),
)
const somePageSelected = computed(() =>
  selectablePage.value.some((m) => selected.value.includes(m.id)),
)
watch([search, tab, section], () => {
  selected.value = []
})
function selectPage() {
  if (busy.value) return
  const ids = selectablePage.value.map((m) => m.id)
  selected.value = allPageSelected.value
    ? selected.value.filter((id) => !ids.includes(id))
    : [...new Set([...selected.value, ...ids])]
}
let generation = 0
let memberRequestInFlight = false
async function loadMembers(silent = false) {
  const id = demo.classroomId,
    token = ++generation
  if (!id) return
  memberRequestInFlight = true
  if (!silent) loading.value = true
  try {
    const result = await api<Member[]>(`/classes/${id}/members`)
    if (id !== demo.classroomId || token !== generation) return
    members.value = result
    loadError.value = ''
    updatedAt.value = new Date().toLocaleTimeString('zh-CN')
    selected.value = selected.value.filter((id) => result.some((m) => m.id === id))
  } catch (e) {
    if (id === demo.classroomId && token === generation)
      loadError.value = e instanceof Error ? e.message : t('roster.loadFailed')
  } finally {
    if (token === generation) {
      loading.value = false
      memberRequestInFlight = false
    }
  }
}
let poll: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  void loadMembers()
  poll = setInterval(() => {
    if (!memberRequestInFlight && !busy.value) void loadMembers(true)
  }, 5000)
})
onBeforeUnmount(() => {
  mounted = false
  generation++
  if (poll) clearInterval(poll)
})
watch(
  () => demo.classroomId,
  () => void loadMembers(),
)
onBeforeRouteLeave(() => {
  if (!busy.value) return true
  notify(t('roster.notify.leaveBlocked'), 'error')
  return false
})
function keepCredentials(items: Credential[], classId = demo.classroomId) {
  const key = `cpp-credentials:${currentUser.value?.id}:${classId}`
  let old: Credential[] = []
  if (classId === demo.classroomId) old = credentials.value
  else {
    try {
      const data: unknown = JSON.parse(sessionStorage.getItem(key) ?? '[]')
      old = Array.isArray(data) ? data : []
    } catch {
      /* Optional cache. */
    }
  }
  const updated = new Map(old.map((c) => [c.id, c]))
  for (const item of items)
    if (item.password) updated.set(item.id, { ...item, generatedAt: new Date().toISOString() })
  const saved = [...updated.values()]
  if (classId === demo.classroomId) credentials.value = saved
  else {
    try {
      sessionStorage.setItem(key, JSON.stringify(saved))
    } catch {
      notify(t('roster.notify.credentialCacheFailed'), 'error')
    }
  }
}
async function addMember(
  n: string,
  no: string,
  classId: string,
  account: { username?: string; password?: string } = {},
) {
  const result = await api<Credential & { created: boolean }>(
    `/classes/${classId}/members`,
    'POST',
    { name: n, number: no, ...account },
  )
  keepCredentials([result], classId)
  return result
}
async function reloadAfterWrite(classId: string) {
  if (demo.classroomId !== classId) return
  try {
    await refresh()
  } catch {
    notify(t('roster.notify.statsRefreshFailed'), 'error')
  }
  await loadMembers(true)
}
async function save() {
  if (busy.value) return
  const classId = demo.classroomId
  error.value = ''
  const account: { username?: string; password?: string } = {},
    customUsername = username.value.trim()
  if (customUsername) {
    if (!/^[a-zA-Z0-9._@-]+$/.test(customUsername)) {
      error.value = t('roster.addDialog.usernameInvalid')
      return
    }
    account.username = customUsername
  }
  if (password.value) account.password = password.value
  busyReason.value = t('roster.addDialog.busy')
  busy.value = true
  try {
    const result = await addMember(name.value.trim(), number.value.trim(), classId, account)
    add.value = false
    name.value = ''
    number.value = ''
    username.value = ''
    password.value = ''
    if (result.password && demo.classroomId === classId) credentialsOpen.value = true
    notify(
      result.password
        ? t('roster.addDialog.addedWithCredential')
        : t('roster.addDialog.addedExisting'),
    )
    await reloadAfterWrite(classId)
  } catch (e) {
    error.value = e instanceof Error ? e.message : t('roster.addDialog.failed')
  } finally {
    busy.value = false
  }
}
async function decide(id: string, status: string) {
  if (busy.value) return
  const classId = demo.classroomId,
    member = members.value.find((m) => m.id === id),
    wasRemoved = member?.membership === 'removed'
  const confirmKey =
    status === 'removed'
      ? 'roster.decide.confirmReject'
      : wasRemoved
        ? 'roster.decide.confirmRestore'
        : 'roster.decide.confirmApprove'
  if (!(await confirmAction(t(confirmKey, { name: member?.name ?? t('roster.studentFallback') }))))
    return
  if (classId !== demo.classroomId) return
  busyReason.value = t('roster.decide.busy')
  busy.value = true
  error.value = ''
  try {
    await api(`/classes/${classId}/members/${id}`, 'PATCH', {
      status,
      ...(status === 'removed' ? { action: 'reject' } : {}),
    })
    notify(
      status === 'active'
        ? wasRemoved
          ? t('roster.notify.decideRestored')
          : t('roster.notify.decideApproved')
        : t('roster.notify.decideRejected'),
    )
    await reloadAfterWrite(classId)
  } catch (e) {
    error.value = e instanceof Error ? e.message : t('roster.decide.failed')
  } finally {
    busy.value = false
  }
}
async function importRows() {
  if (busy.value) return
  error.value = ''
  let rows: RosterRow[]
  try {
    rows = parseRoster(csv.value)
  } catch (e) {
    error.value = (e as Error).message
    return
  }
  const classId = demo.classroomId
  busyReason.value = t('roster.importDialog.busy')
  busy.value = true
  importResults.value = []
  const failedRows: RosterRow[] = []
  try {
    for (const row of rows) {
      try {
        const result = await addMember(row.name, row.number, classId, {
          username: row.username,
          password: row.password,
        })
        importResults.value.push({ name: row.name, number: row.number, created: result.created })
      } catch (e) {
        failedRows.push(row)
        importResults.value.push({
          name: row.name,
          number: row.number,
          error: (e as Error).message,
        })
      }
    }
    const failed = importResults.value.filter((r) => r.error)
    csv.value = rosterContent(failedRows)
    if (failed.length)
      error.value = t('roster.importDialog.partialFailed', {
        succeeded: rows.length - failed.length,
        failed: failed.length,
      })
    else {
      notify(t('roster.notify.processedAll', { count: rows.length }))
    }
    await reloadAfterWrite(classId)
  } finally {
    busy.value = false
  }
}
async function readFile(event: Event) {
  const input = event.target as HTMLInputElement,
    file = input.files?.[0]
  if (!file || busy.value) return
  busyReason.value = t('roster.importDialog.readBusy')
  busy.value = true
  readingFile.value = true
  csv.value = ''
  error.value = ''
  importResults.value = []
  try {
    csv.value = await readRosterFile(file)
  } catch (e) {
    error.value = e instanceof Error ? e.message : t('roster.importDialog.readFailed')
  } finally {
    input.value = ''
    readingFile.value = false
    busy.value = false
  }
}
async function downloadExcelTemplate() {
  if (downloadingTemplate.value) return
  downloadingTemplate.value = true
  try {
    downloadBlob(t('roster.importDialog.excelFileName'), await rosterExcelTemplate())
  } catch {
    error.value = t('roster.importDialog.excelFailed')
  } finally {
    downloadingTemplate.value = false
  }
}
function exportRoster() {
  download(
    t('roster.csv.rosterFileName', { name: activeClassroom.value.name }),
    csvDocument([
      t('roster.csv.rosterHeaders') as unknown as string[],
      ...active.value.map((m) => [
        m.name,
        m.number,
        m.username,
        m.disabled ? t('roster.status.accountDisabled') : t('roster.status.active'),
        students.find((s) => s.id === m.id)?.online
          ? t('roster.status.online')
          : t('roster.status.offline'),
      ]),
    ]),
    'text/csv;charset=utf-8',
  )
}
function exportCredentials() {
  download(
    t('roster.csv.credentialsFileName', { name: activeClassroom.value.name }),
    csvDocument([
      t('roster.csv.credentialHeaders') as unknown as string[],
      ...credentials.value.map((c) => [
        c.name,
        c.number,
        c.username,
        c.password ?? '',
        c.generatedAt ?? t('roster.csv.timeUnknown'),
        location.origin + '/login',
      ]),
    ]),
    'text/csv;charset=utf-8',
  )
  notify(t('roster.notify.credentialsDownloaded'))
}

function openReset(ids: string[]) {
  if (busy.value) return
  resetTargets.value = [...ids]
  error.value = ''
  resetting.value = true
}
function assignmentBatchFinished(succeededIds: string[]) {
  selected.value = selected.value.filter((id) => !succeededIds.includes(id))
}
async function batchStudents(action: 'remove' | 'delete' | 'approve' | 'reject' | 'restore') {
  const allowed = {
    remove: canBatchRemove.value,
    delete: canBatchDelete.value,
    approve: canBatchApprove.value,
    reject: canBatchReject.value,
    restore: canBatchRestore.value,
  }
  if (busy.value || !allowed[action]) return
  const classId = demo.classroomId
  const targets = [...selectedMembers.value]
  const label = t(`roster.batch.actions.${action}.label`)
  if (
    !(await confirmAction(
      t('roster.batch.confirm', {
        count: targets.length,
        label,
        detail: t(`roster.batch.actions.${action}.detail`),
      }),
      {
        destructive: action === 'delete' || action === 'remove',
      },
    ))
  )
    return
  const current = () => mounted && classId === demo.classroomId
  if (!current()) return
  busy.value = true
  busyReason.value = t(`roster.batch.actions.${action}.busy`)
  error.value = ''
  batchProgress.value = { completed: 0, total: targets.length }
  try {
    const result = await runMemberBatch(
      targets,
      (member) =>
        action === 'delete'
          ? api(`/classes/${classId}/members/${member.id}/account`, 'DELETE')
          : api(`/classes/${classId}/members/${member.id}`, 'PATCH', {
              status: action === 'approve' || action === 'restore' ? 'active' : 'removed',
              ...(action === 'remove'
                ? { action: 'remove' }
                : action === 'reject'
                  ? { action: 'reject' }
                  : {}),
            }),
      {
        current,
        progress: (completed) => {
          if (current()) batchProgress.value.completed = completed
        },
      },
    )
    if (!current()) return
    const succeeded = result.succeeded.map((m) => m.id)
    selected.value = selected.value.filter((id) => !succeeded.includes(id))
    if (action === 'delete' || action === 'remove')
      credentials.value = credentials.value.filter((c) => !succeeded.includes(c.id))
    await reloadAfterWrite(classId)
    if (result.failed.length || result.pending.length) error.value = memberBatchMessage(result)
    else notify(t(`roster.batch.actions.${action}.done`, { count: succeeded.length }))
  } finally {
    busy.value = false
    batchProgress.value = { completed: 0, total: 0 }
  }
}
async function resetPasswords() {
  if (busy.value) return
  const classId = demo.classroomId,
    ids = [...resetTargets.value]
  busyReason.value = t('roster.resetDialog.busy')
  busy.value = true
  error.value = ''
  try {
    keepCredentials(
      await api<Credential[]>(`/classes/${classId}/members/reset-passwords`, 'POST', {
        userIds: ids,
      }),
      classId,
    )
    resetting.value = false
    credentialsOpen.value = demo.classroomId === classId
    notify(t('roster.notify.resetDone', { count: ids.length }))
    selected.value = []
    await reloadAfterWrite(classId)
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    busy.value = false
  }
}
async function deleteStudentAccount() {
  const target = deleteTarget.value
  if (!target || busy.value) return
  const classId = demo.classroomId
  busyReason.value = t('roster.deleteDialog.busy')
  busy.value = true
  error.value = ''
  try {
    await api(`/classes/${classId}/members/${target.id}/account`, 'DELETE')
    deleteTarget.value = undefined
    credentials.value = credentials.value.filter((credential) => credential.id !== target.id)
    selected.value = selected.value.filter((id) => id !== target.id)
    notify(t('roster.notify.deleteDone', { username: target.username }))
    await reloadAfterWrite(classId)
  } catch (e) {
    error.value = e instanceof Error ? e.message : t('roster.deleteDialog.failed')
  } finally {
    busy.value = false
  }
}
async function removeStudent() {
  if (busy.value || !remove.value) return
  const classId = demo.classroomId,
    target = remove.value
  busyReason.value = t('roster.removeDialog.busy')
  busy.value = true
  error.value = ''
  try {
    await api(`/classes/${classId}/members/${target.id}`, 'PATCH', {
      status: 'removed',
      action: 'remove',
    })
    if (classId === demo.classroomId)
      credentials.value = credentials.value.filter((c) => c.id !== target.id)
    remove.value = undefined
    notify(t('roster.notify.removeDone', { name: target.name }))
    await reloadAfterWrite(classId)
  } catch (e) {
    error.value = e instanceof Error ? e.message : t('roster.removeDialog.failed')
  } finally {
    busy.value = false
  }
}
function openAdd() {
  if (busy.value) return
  switchSection('students')
  error.value = ''
  add.value = true
}
function openImport() {
  if (busy.value) return
  switchSection('students')
  error.value = ''
  importResults.value = []
  importing.value = true
}
useActionFeedback(error)
const busyReason = ref(t('roster.defaultBusy'))
</script>
<template>
  <div class="page-heading">
    <div>
      <div class="heading-meta">{{ t('roster.headingMeta') }}</div>
      <h1>
        {{ t('roster.title') }}
        <span class="heading-count">{{ t('roster.count', { count: active.length }) }}</span>
      </h1>
    </div>
    <div class="heading-actions">
      <Button
        v-if="activeClassroom.canManageStaff"
        variant="outline"
        @click="assignments?.openAdd()">
        <Users />
        {{ t('roster.addExisting') }}
      </Button>
      <Button variant="outline" @click="openImport">
        <Upload />
        {{ t('roster.importRoster') }}
      </Button>
      <Button @click="openAdd">
        <UserPlus />
        {{ t('roster.addStudent') }}
      </Button>
    </div>
  </div>
  <div
    v-if="activeClassroom.canManageStaff"
    class="filter-tabs"
    role="group"
    :aria-label="t('roster.sectionAria')">
    <Button
      variant="plain"
      :class="{ selected: section === 'students' }"
      :aria-pressed="section === 'students'"
      :disabled="busy"
      @click="switchSection('students')">
      {{ t('roster.sectionTabs.students') }}
    </Button>
    <Button
      variant="plain"
      :class="{ selected: section === 'staff' }"
      :aria-pressed="section === 'staff'"
      :disabled="busy"
      @click="switchSection('staff')">
      {{ t('roster.sectionTabs.staff') }}
    </Button>
  </div>
  <!-- <Alert type="info" :icon="KeyRound">
    <div>
      <strong>账号交付与找回</strong>
      <p>
        {{
          credentials.length
            ? `本标签页保留 ${credentials.length} 份新建或重置凭据，刷新后仍可导出。密码后续可能已被修改，请核对生成时间。`
            : '创建学生后可下载登录凭据；忘记密码时，选择学生重置并重新导出。'
        }}
      </p>
    </div>

    <template #actions>
      <Button v-if="credentials.length" variant="outline" @click="credentialsOpen = true">
        查看 / 导出凭据
      </Button>
    </template>
  </Alert> -->
  <Alert v-if="loadError && section === 'students'" role="alert" type="error">
    {{ loadError }}

    <template #actions>
      <Button variant="plain" class="text-button" @click="loadMembers()">
        {{ t('common.retry') }}
      </Button>
    </template>
  </Alert>

  <ContentPanel v-show="section === 'students'" as="section" direct class="panel-fill">
    <div class="panel-heading">
      <div class="filter-tabs borderless">
        <Button
          v-for="item in tabs"
          :key="item.id"
          variant="plain"
          :class="{ selected: tab === item.id }"
          :disabled="busy"
          @click="tab = item.id">
          {{ item.label }}
          <span>{{ item.count }}</span>
        </Button>
      </div>
      <div class="inline-items">
        <span class="muted text-xs">
          {{
            loading
              ? t('common.loading')
              : updatedAt
                ? t('roster.updatedAt', { time: updatedAt })
                : t('roster.notLoaded')
          }}
        </span>
        <Button
          variant="outline"
          size="sm"
          :disabled="loading || busy"
          :data-disabled-reason="loading ? t('roster.loadingRoster') : busyReason"
          @click="loadMembers()">
          <RefreshCw />
          {{ t('common.refresh') }}
        </Button>
        <Button
          variant="outline"
          size="sm"
          :disabled="loading || !!loadError"
          :data-disabled-reason="loading ? t('roster.loadingRoster') : t('roster.exportBlocked')"
          @click="exportRoster">
          <Download />
          {{ t('roster.exportRoster') }}
        </Button>
      </div>
    </div>
    <div class="table-controls">
      <label class="search-field">
        <Search :size="16" />
        <Input
          v-model="search"
          :disabled="busy"
          :placeholder="t('roster.searchPlaceholder')"
          :aria-label="t('roster.searchAria')" />
      </label>
      <div v-if="selected.length" class="inline-items" :aria-label="t('roster.batchAria')">
        <span class="muted">
          {{
            busy && batchProgress.total
              ? t('roster.batchProgress', {
                  completed: batchProgress.completed,
                  total: batchProgress.total,
                })
              : t('roster.selectedCount', { count: selected.length })
          }}
        </span>
        <Button variant="plain" class="text-button" :disabled="busy" @click="selected = []">
          {{ t('roster.clearSelection') }}
        </Button>
        <template v-if="tab === 'pending'">
          <Button
            size="sm"
            variant="success"
            :disabled="busy || !canBatchApprove"
            :data-disabled-reason="t('roster.reasons.approve')"
            @click="batchStudents('approve')">
            {{ t('roster.approveJoin') }}
          </Button>
          <Button
            size="sm"
            variant="outline"
            :disabled="busy || !canBatchReject"
            :data-disabled-reason="t('roster.reasons.reject')"
            @click="batchStudents('reject')">
            {{ t('roster.rejectApplication') }}
          </Button>
        </template>
        <Button
          v-else-if="tab === 'removed'"
          size="sm"
          variant="outline"
          :disabled="busy || !canBatchRestore"
          :data-disabled-reason="t('roster.reasons.restore')"
          @click="batchStudents('restore')">
          {{ t('roster.restoreAccess') }}
        </Button>
        <template v-else>
          <Button
            v-if="activeClassroom.canManageStaff"
            size="sm"
            variant="outline"
            :disabled="busy || !canBatchEdit"
            :data-disabled-reason="t('roster.reasons.edit')"
            @click="assignments?.editMembers(selected)">
            {{ t('roster.adjustRole') }}
          </Button>
          <Button
            size="sm"
            variant="warning"
            :disabled="busy || !canBatchReset"
            :data-disabled-reason="t('roster.reasons.reset')"
            @click="openReset(selected)">
            <KeyRound />
            {{ t('roster.resetPassword') }}
          </Button>
          <Button
            size="sm"
            variant="outline"
            :disabled="busy || !canBatchRemove"
            :data-disabled-reason="t('roster.reasons.remove')"
            @click="batchStudents('remove')">
            {{ t('roster.removeMember') }}
          </Button>
          <Button
            size="sm"
            variant="destructive"
            :disabled="busy || !canBatchDelete"
            :data-disabled-reason="t('roster.reasons.delete')"
            @click="batchStudents('delete')">
            {{ t('roster.deleteAccount') }}
          </Button>
        </template>
      </div>
      <!-- <span v-else class="muted text-xs">{{
        tab === '待审批'
          ? '批准后学生即可访问课堂'
          : tab === '已移除'
            ? '恢复成员可保留原账号与历史作品'
            : '仅账号创建教师可重置密码；其他账号请联系管理员'
      }}</span> -->
    </div>
    <div class="table-scroll">
      <table class="roster-table">
        <thead>
          <tr>
            <th>
              <Checkbox
                :aria-label="t('roster.selectPageAria')"
                :disabled="busy || loading || !selectablePage.length"
                :data-disabled-reason="busy ? busyReason : t('roster.reasons.emptyPage')"
                :checked="allPageSelected"
                :indeterminate="somePageSelected && !allPageSelected"
                @change="selectPage" />
            </th>
            <th>{{ t('roster.columns.student') }}</th>
            <th>{{ t('roster.columns.number') }}</th>
            <th>{{ t('roster.columns.account') }}</th>
            <th>
              {{
                tab === 'pending' || tab === 'removed'
                  ? t('roster.columns.membership')
                  : t('roster.columns.presence')
              }}
            </th>
            <th>{{ t('roster.columns.actions') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="m in paged" :key="m.id">
            <td>
              <Checkbox
                v-model="selected"
                :disabled="busy || loading"
                :data-disabled-reason="busyReason"
                :value="m.id"
                :aria-label="t('roster.selectStudentAria', { name: m.name })" />
            </td>
            <td>
              <div class="person-cell">
                <span class="student-avatar">{{ m.name.slice(-2) }}</span>
                <strong>{{ m.name }}</strong>
              </div>
            </td>
            <td>{{ m.number }}</td>
            <td class="roster-account">{{ m.username }}</td>
            <td>
              <span v-if="tab === 'removed'" class="status neutral">
                {{ t('roster.status.removed') }}
              </span>
              <span v-else-if="tab === 'pending'" class="status amber">
                {{ t('roster.status.pending') }}
              </span>
              <span v-else class="inline-items">
                <i
                  class="presence"
                  :class="{ online: students.find((s) => s.id === m.id)?.online }" />
                {{
                  m.disabled
                    ? t('roster.status.accountDisabled')
                    : students.find((s) => s.id === m.id)?.online
                      ? t('roster.status.online')
                      : t('roster.status.offline')
                }}
              </span>
            </td>
            <td>
              <div v-if="tab === 'pending'" class="inline-items">
                <Button
                  size="sm"
                  variant="success"
                  :disabled="busy"
                  :data-disabled-reason="busyReason"
                  @click="decide(m.id, 'active')">
                  <Check />
                  {{ t('roster.approve') }}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  :disabled="busy"
                  :data-disabled-reason="busyReason"
                  @click="decide(m.id, 'removed')">
                  {{ t('roster.reject') }}
                </Button>
              </div>
              <div v-else-if="tab === 'removed'" class="inline-items">
                <Button
                  size="sm"
                  variant="outline"
                  :disabled="busy || m.disabled"
                  :data-disabled-reason="busy ? busyReason : t('roster.reasons.disabledRestore')"
                  @click="decide(m.id, 'active')">
                  {{ t('roster.restoreAccess') }}
                </Button>
                <span v-if="m.disabled" class="muted text-xs">
                  {{ t('roster.accountDisabledAdmin') }}
                </span>
              </div>
              <DropdownMenuRoot v-else>
                <DropdownMenuTrigger as-child>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    :disabled="busy"
                    :aria-label="t('roster.manageAria', { name: m.name })">
                    <Ellipsis />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuPortal>
                  <DropdownMenuContent class="ui-menu-content" align="end" :side-offset="5">
                    <DropdownMenuItem
                      v-if="activeClassroom.canManageStaff && !m.disabled"
                      class="ui-menu-item"
                      @select="assignments?.editMember(m.id)">
                      {{ t('roster.adjustRole') }}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      class="ui-menu-item"
                      :disabled="!m.canResetPassword"
                      @select="openReset([m.id])">
                      {{ t('roster.resetPassword') }}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator class="member-menu-separator" />
                    <DropdownMenuItem class="ui-menu-item danger-text" @select="openRemove(m)">
                      {{ t('roster.removeMember') }}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      v-if="m.canDeleteAccount"
                      class="ui-menu-item danger-text"
                      @select="deleteTarget = m">
                      {{ t('roster.deleteAccount') }}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenuPortal>
              </DropdownMenuRoot>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-if="!visible.length && !loading && !loadError" class="empty-state">
        <Users :size="30" />
        <h3>
          {{
            search
              ? t('roster.empty.noMatchTitle')
              : tab === 'pending'
                ? t('roster.empty.noPendingTitle')
                : t('roster.empty.noStudentsTitle')
          }}
        </h3>
        <p>
          {{ search ? t('roster.empty.noMatchDesc') : t('roster.empty.noStudentsDesc') }}
        </p>
        <Button v-if="!search && tab !== 'pending' && tab !== 'removed'" @click="openAdd">
          {{ t('roster.empty.addFirst') }}
        </Button>
      </div>
    </div>
    <Pagination
      v-model:page="page"
      v-model:page-size="pageSize"
      :total="visible.length"
      :busy="loading || busy"
      :unit="t('roster.unit')" />
  </ContentPanel>
  <ClassroomAssignments
    v-if="activeClassroom.canManageStaff"
    ref="assignments"
    :classroom-id="activeClassroom.id"
    :show-list="section === 'staff'"
    staff-only
    @batch-finished="assignmentBatchFinished"
    @changed="assignmentsChanged" />
  <Modal
    v-model:open="add"
    :dismissible="!busy"
    :title="t('roster.addDialog.title')"
    :description="t('roster.addDialog.description')">
    <Form class="form-stack" @submit.prevent="save">
      <label>
        {{ t('roster.addDialog.nameLabel') }}
        <Input
          v-model="name"
          required
          maxlength="50"
          :placeholder="t('roster.addDialog.namePlaceholder')" />
      </label>
      <label>
        {{ t('roster.addDialog.numberLabel') }}
        <Input
          v-model="number"
          required
          maxlength="50"
          :placeholder="t('roster.addDialog.numberPlaceholder')" />
      </label>
      <label>
        {{ t('roster.addDialog.usernameLabel') }}
        <Input
          v-model="username"
          maxlength="80"
          autocomplete="off"
          :placeholder="t('roster.addDialog.usernamePlaceholder')" />
      </label>
      <label>
        {{ t('roster.addDialog.passwordLabel') }}
        <Input
          v-model="password"
          type="password"
          maxlength="200"
          autocomplete="new-password"
          :placeholder="t('roster.addDialog.passwordPlaceholder')" />
      </label>

      <div class="modal-actions">
        <Button
          type="button"
          variant="outline"
          :disabled="busy"
          :data-disabled-reason="busyReason"
          @click="add = false">
          {{ t('common.cancel') }}
        </Button>
        <Button type="submit" :disabled="busy" :data-disabled-reason="busyReason">
          {{ busy ? t('roster.addDialog.submitting') : t('roster.addDialog.submit') }}
        </Button>
      </div>
    </Form>
  </Modal>
  <Modal
    v-model:open="importing"
    :dismissible="!busy"
    :title="t('roster.importDialog.title')"
    :description="t('roster.importDialog.description')">
    <Form class="form-stack" @submit.prevent="importRows">
      <div class="inline-items roster-import-files">
        <Button
          variant="outline"
          type="button"
          :disabled="downloadingTemplate"
          :data-disabled-reason="t('roster.importDialog.generatingBusy')"
          @click="downloadExcelTemplate">
          <FileDown />
          {{
            downloadingTemplate
              ? t('roster.importDialog.generating')
              : t('roster.importDialog.downloadExcel')
          }}
        </Button>
        <Button
          variant="outline"
          type="button"
          @click="downloadBlob(t('roster.importDialog.csvFileName'), rosterCsvTemplate())">
          <FileDown />
          {{ t('roster.importDialog.csvTemplate') }}
        </Button>
        <FileUpload
          accept=".xlsx,.csv,.tsv,.txt"
          :disabled="busy"
          :data-disabled-reason="busyReason"
          @change="readFile">
          {{ t('roster.importDialog.chooseFile') }}
        </FileUpload>
      </div>
      <p class="form-hint">
        {{ t('roster.importDialog.hintTop') }}
      </p>
      <label>
        {{ t('roster.importDialog.contentLabel') }}
        <Textarea
          v-model="csv"
          :disabled="busy"
          :data-disabled-reason="busyReason"
          rows="7"
          required
          :placeholder="t('roster.importDialog.placeholder')" />
      </label>

      <div v-if="importResults.length" class="import-results">
        <p
          v-for="(r, i) in importResults"
          :key="i"
          :class="r.error ? 'danger-text' : 'positive-text'">
          {{ r.name }} · {{ r.number }}：{{
            r.error ??
            (r.created
              ? t('roster.importDialog.resultCreated')
              : t('roster.importDialog.resultExisting'))
          }}
        </p>
      </div>
      <Button v-if="credentials.length" type="button" variant="outline" @click="exportCredentials">
        <Download />
        {{ t('roster.importDialog.exportCredentials') }}
      </Button>
      <p class="form-hint">
        {{ t('roster.importDialog.hintBottom') }}
      </p>
      <div class="modal-actions">
        <Button
          type="button"
          variant="outline"
          :disabled="busy"
          :data-disabled-reason="busyReason"
          @click="importing = false">
          {{ t('common.close') }}
        </Button>
        <Button
          type="submit"
          :disabled="busy || !csv.trim()"
          :data-disabled-reason="busy ? busyReason : t('roster.reasons.needRosterContent')">
          <Upload />
          {{
            readingFile
              ? t('roster.importDialog.reading')
              : busy
                ? t('roster.importDialog.importingProgress', { count: importResults.length })
                : t('roster.importRoster')
          }}
        </Button>
      </div>
    </Form>
  </Modal>
  <CredentialDialog
    v-model:open="credentialsOpen"
    :credentials="credentials"
    @export="exportCredentials"
    @clear="credentials = []" />
  <Modal
    v-model:open="resetting"
    :dismissible="!busy"
    :title="t('roster.resetDialog.title')"
    :description="t('roster.resetDialog.description', { count: resetTargets.length })">
    <Alert type="warning">{{ t('roster.resetDialog.warning') }}</Alert>

    <div class="modal-actions">
      <Button
        variant="outline"
        :disabled="busy"
        :data-disabled-reason="busyReason"
        @click="resetting = false">
        {{ t('common.cancel') }}
      </Button>
      <Button
        variant="warning"
        :disabled="busy || !resetTargets.length"
        :data-disabled-reason="busy ? busyReason : t('roster.reasons.needSelection')"
        @click="resetPasswords">
        <KeyRound />
        {{ busy ? t('roster.resetDialog.resetting') : t('roster.resetDialog.confirm') }}
      </Button>
    </div>
  </Modal>
  <Modal
    :open="!!deleteTarget"
    :dismissible="!busy"
    :title="
      t('roster.deleteDialog.title', { name: deleteTarget?.name ?? t('roster.studentFallback') })
    "
    :description="t('roster.deleteDialog.description', { username: deleteTarget?.username ?? '' })"
    @update:open="!$event && (deleteTarget = undefined)">
    <Alert type="warning">
      {{ t('roster.deleteDialog.warning') }}
    </Alert>
    <div class="modal-actions">
      <Button variant="outline" :disabled="busy" @click="deleteTarget = undefined">
        {{ t('common.cancel') }}
      </Button>
      <Button variant="destructive" :disabled="busy" @click="deleteStudentAccount">
        {{ busy ? t('roster.deleteDialog.deleting') : t('roster.deleteDialog.confirm') }}
      </Button>
    </div>
  </Modal>
  <Modal
    :open="!!remove"
    :dismissible="!busy"
    :title="
      t('roster.removeDialog.title', { name: remove?.name ?? t('roster.removeDialog.fallback') })
    "
    :description="t('roster.removeDialog.description')"
    @update:open="!$event && (remove = undefined)">
    <div class="modal-actions">
      <Button
        variant="outline"
        :disabled="busy"
        :data-disabled-reason="busyReason"
        @click="remove = undefined">
        {{ t('common.cancel') }}
      </Button>
      <Button
        variant="destructive"
        :disabled="busy"
        :data-disabled-reason="busyReason"
        @click="removeStudent">
        {{ busy ? t('roster.removeDialog.removing') : t('roster.removeDialog.confirm') }}
      </Button>
    </div>
  </Modal>
</template>
<style scoped>
.member-menu-separator {
  height: 1px;
  margin: 5px 0;
  background: var(--ui-line);
}
.roster-import-files {
  flex-wrap: wrap;
}
.roster-table .roster-account {
  min-width: 200px;
  max-width: 220px;
  white-space: normal;
  overflow-wrap: anywhere;
}
.credential-actions {
  display: flex;
  gap: 12px;
  margin-bottom: 18px;
  flex-wrap: wrap;
}
.credential-table {
  max-height: 360px;
  border: 1px solid var(--ui-line);
  border-radius: 6px;
  margin-bottom: 16px;
}
.import-results {
  max-height: 180px;
  overflow: auto;
  padding: 12px;
  background: var(--ui-surface);
  border-radius: 6px;
  font-size: 15px;
}
.file-upload {
  font-size: 15px;
  color: var(--ui-text);
  flex: 1;
  min-width: 0;
}
.file-upload input {
  width: 100%;
  padding: 5px;
  margin-top: 5px;
  font-size: 14px;
}
</style>
