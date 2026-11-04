<script setup lang="ts">
import RunnerUsage from '@/components/classroom/RunnerUsage.vue'
import CodeBlock from '@/components/classroom/CodeBlock.vue'
import { useActionFeedback } from '@/composables/useActionFeedback'
import { Alert } from '@/components/ui/alert'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { runMemberBatch, memberBatchMessage } from '@/lib/member-batch'
import { Select, SelectOption } from '@/components/ui/select'
import { Disclosure } from '@/components/ui/disclosure'
import { Form } from '@/components/ui/form'
import { Textarea } from '@/components/ui/textarea'
import { computed, ref, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute } from 'vue-router'
import { Button } from '@/components/ui/button'
import { Database, RefreshCw, Search, Download, KeyRound, Eye, EyeOff, Ellipsis } from '@lucide/vue'
import {
  DropdownMenuRoot,
  DropdownMenuTrigger,
  DropdownMenuPortal,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from 'reka-ui'
import ContentPanel from '@/components/classroom/ContentPanel.vue'
import Pagination from '@/components/classroom/Pagination.vue'
import { api } from '@/lib/api'
import { confirmAction } from '@/lib/confirm'
import { csvDocument } from '@/lib/csv'
import { notify, download, currentUser } from '@/data/demo'
import Modal from '@/components/classroom/Modal.vue'
import CredentialDialog from '@/components/classroom/CredentialDialog.vue'
const { t } = useI18n()
const route = useRoute()
function allowNavigation() {
  if (!busy.value) return true
  notify(t('admin.busyLeaveBlocked'), 'error')
  return false
}
onBeforeRouteLeave(allowNavigation)
onBeforeRouteUpdate(allowNavigation)
const section = computed(() => String(route.params.section ?? 'health'))
interface User {
  id: string
  name: string
  username: string
  number: string
  role: string
  disabled: boolean
}
interface Credential {
  name: string
  username: string
  password: string
  generatedAt?: string
}
const users = ref<User[]>([])
interface Task {
  id: string
  classroom: string
  exit: string
  created_at: string
  log?: string
  stderr?: string
  metrics?: unknown
}
const tasks = ref<Task[]>([])
const taskDetail = ref<Task>()
const audit = ref<
  { id: string; event: string; created_at: string; details: unknown; actor_name?: string }[]
>([])
interface Recovery {
  id: string
  username: string
  created_at: string
  user_id?: string
  name?: string
  role?: string
}
const recoveries = ref<Recovery[]>([])
const closeRecovery = ref<Recovery>(),
  closeReason = ref(''),
  resetTarget = ref<User>()
const metrics = ref({ classrooms: 0, online: 0, queued: 0, failed: 0 })
const runnerUsage = ref<InstanceType<typeof RunnerUsage>>()
async function refreshOverview() {
  await Promise.all([load(), runnerUsage.value?.refresh()])
}
const editTarget = ref<User>()
const editName = ref(''),
  editUsername = ref(''),
  editNumber = ref(''),
  editRole = ref('')
const create = ref(false),
  name = ref(''),
  account = ref(''),
  password = ref(''),
  userRole = ref('teacher')
const busy = ref(false),
  loading = ref(false),
  error = ref(''),
  loadError = ref(''),
  resetUser = ref(''),
  resetPassword = ref(''),
  showPassword = ref(false)
const toggleUser = ref<User>(),
  credentialsOpen = ref(false),
  credentials = ref<Credential[]>([])
const search = ref(''),
  roleFilter = ref('all'),
  statusFilter = ref('all')
const credentialKey = `cpp-credentials:admin:${currentUser.value?.id}`
try {
  const saved: unknown = JSON.parse(sessionStorage.getItem(credentialKey) ?? '[]')
  if (Array.isArray(saved))
    credentials.value = saved.filter(
      (c): c is Credential =>
        !!c &&
        typeof c === 'object' &&
        typeof c.username === 'string' &&
        typeof c.password === 'string',
    )
} catch {
  /* Optional browser cache. */
}

watch(
  credentials,
  (value) => {
    try {
      sessionStorage.setItem(credentialKey, JSON.stringify(value))
    } catch {
      /* Export still works. */
    }
  },
  { deep: true },
)
const userTotal = ref(0),
  taskTotal = ref(0),
  auditTotal = ref(0),
  recoveryTotal = ref(0)
const userPages = { page: ref(1), pageSize: ref(20), paged: users }
const selectedUserIds = ref<string[]>([])
const batchRole = ref<'teacher' | 'student'>('student')
const batchError = ref('')
const batchProgress = ref({ completed: 0, total: 0 })
const selectableUsers = computed(() => users.value.filter((u) => u.id !== currentUser.value?.id))
const selectedUsers = computed(() =>
  selectableUsers.value.filter((u) => selectedUserIds.value.includes(u.id)),
)
const allUsersSelected = computed(
  () =>
    selectableUsers.value.length > 0 &&
    selectableUsers.value.every((u) => selectedUserIds.value.includes(u.id)),
)
const someUsersSelected = computed(() =>
  selectableUsers.value.some((u) => selectedUserIds.value.includes(u.id)),
)
function selectUserPage() {
  selectedUserIds.value = allUsersSelected.value ? [] : selectableUsers.value.map((u) => u.id)
}
watch([search, roleFilter, statusFilter, userPages.page, userPages.pageSize, section], () => {
  selectedUserIds.value = []
  batchError.value = ''
})
const taskPages = { page: ref(1), pageSize: ref(20), paged: tasks }
const auditPages = { page: ref(1), pageSize: ref(20), paged: audit }
const recoveryPage = ref(1),
  recoveryPageSize = ref(10)
const title = computed(() => t(`admin.title.${section.value}`))
const message = (e: unknown) => (e instanceof Error ? e.message : t('admin.requestFailed'))
interface PageResult<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}
let generation = 0
async function load() {
  const activeSection = section.value,
    token = ++generation
  loading.value = true
  loadError.value = ''
  const params = (page: number, size: number) =>
    new URLSearchParams({ page: String(page), pageSize: String(size), search: search.value.trim() })
  try {
    if (activeSection === 'teachers') {
      const query = params(userPages.page.value, userPages.pageSize.value)
      query.set('role', roleFilter.value)
      query.set('status', statusFilter.value)
      const [u, r] = await Promise.all([
        api<PageResult<User>>('/admin/users?' + query),
        api<PageResult<Recovery>>(
          '/admin/recoveries?' + params(recoveryPage.value, recoveryPageSize.value),
        ),
      ])
      if (token !== generation) return
      users.value = u.items
      userTotal.value = u.total
      recoveries.value = r.items
      recoveryTotal.value = r.total
      const last = Math.max(1, Math.ceil(u.total / userPages.pageSize.value))
      if (userPages.page.value > last) userPages.page.value = last
      const recoveryLast = Math.max(1, Math.ceil(r.total / recoveryPageSize.value))
      if (recoveryPage.value > recoveryLast) recoveryPage.value = recoveryLast
    } else if (activeSection === 'tasks') {
      const r = await api<PageResult<Task>>(
        '/admin/tasks?' + params(taskPages.page.value, taskPages.pageSize.value),
      )
      if (token !== generation) return
      tasks.value = r.items
      taskTotal.value = r.total
      const last = Math.max(1, Math.ceil(r.total / taskPages.pageSize.value))
      if (taskPages.page.value > last) taskPages.page.value = last
    } else if (activeSection === 'backups') {
      const r = await api<PageResult<(typeof audit.value)[number]>>(
        '/admin/audit?' + params(auditPages.page.value, auditPages.pageSize.value),
      )
      if (token !== generation) return
      audit.value = r.items
      auditTotal.value = r.total
      const last = Math.max(1, Math.ceil(r.total / auditPages.pageSize.value))
      if (auditPages.page.value > last) auditPages.page.value = last
    } else {
      const r = await api<typeof metrics.value>('/admin/overview')
      if (token === generation) metrics.value = r
    }
  } catch (e) {
    if (token === generation) loadError.value = message(e)
  } finally {
    if (token === generation) loading.value = false
  }
}
onMounted(() => void load())
watch(section, () => {
  search.value = ''
  roleFilter.value = 'all'
  statusFilter.value = 'all'
  error.value = ''
  users.value = []
  tasks.value = []
  audit.value = []
  void load()
})
watch([search, roleFilter, statusFilter], () => {
  userPages.page.value = 1
  taskPages.page.value = 1
  auditPages.page.value = 1
  recoveryPage.value = 1
  void load()
})
watch(
  [
    userPages.page,
    userPages.pageSize,
    taskPages.page,
    taskPages.pageSize,
    auditPages.page,
    auditPages.pageSize,
    recoveryPage,
    recoveryPageSize,
  ],
  () => void load(),
)
function roleLabel(role: string) {
  if (role === 'admin' || role === 'teacher' || role === 'student')
    return t(
      `admin.users.role${role === 'admin' ? 'Admin' : role === 'teacher' ? 'Teacher' : 'Student'}`,
    )
  return role
}
function eventLabel(event: string) {
  const labels: Record<string, string> = {
    'user.created': 'userCreated',
    'user.updated': 'userUpdated',
    'user.password_changed': 'userPasswordChanged',
    'recovery.closed': 'recoveryClosed',
    'membership.added': 'membershipAdded',
    'membership.updated': 'membershipUpdated',
    'membership.rejected': 'membershipRejected',
    'membership.passwords_reset': 'membershipPasswordsReset',
    'classroom.created': 'classroomCreated',
    'classroom.updated': 'classroomUpdated',
    'exercise.created': 'exerciseCreated',
    'exercise.updated': 'exerciseUpdated',
    'exercise.closed': 'exerciseClosed',
    'exercises.reordered': 'exercisesReordered',
    'backup.verified': 'backupVerified',
    'settings.updated': 'settingsUpdated',
  }
  const key = labels[event]
  return key ? t(`admin.events.${key}`) : event
}
async function resolveRecovery() {
  if (busy.value || !closeRecovery.value) return
  busyReason.value = t('admin.busyReason.closingRecovery')
  busy.value = true
  error.value = ''
  try {
    await api('/admin/recoveries/' + closeRecovery.value.id + '/resolve', 'POST', {
      reason: closeReason.value.trim(),
    })
    closeRecovery.value = undefined
    closeReason.value = ''
    notify(t('admin.notify.recoveryClosed'))
    await load()
  } catch (e) {
    error.value = message(e)
  } finally {
    busy.value = false
  }
}
function resetRecovery(r: Recovery) {
  if (!r.user_id || !r.name || !r.role) return
  openReset({
    id: r.user_id,
    name: r.name,
    role: r.role,
    username: r.username,
    number: '',
    disabled: false,
  })
}
function storeCredential(value: Credential) {
  credentials.value = [
    ...credentials.value.filter((c) => c.username !== value.username),
    { ...value, generatedAt: new Date().toISOString() },
  ]
  credentialsOpen.value = true
}
function exportCredentials() {
  download(
    t('admin.csv.filename'),
    csvDocument([
      [
        t('admin.csv.colName'),
        t('admin.csv.colUsername'),
        t('admin.csv.colPassword'),
        t('admin.csv.colGeneratedAt'),
        t('admin.csv.colLoginUrl'),
      ],
      ...credentials.value.map((c) => [
        c.name,
        c.username,
        c.password,
        c.generatedAt ?? t('admin.csv.unknown'),
        location.origin + '/login',
      ]),
    ]),
    'text/csv;charset=utf-8',
  )
  notify(t('admin.notify.credentialsDownload'))
}

function openCreate() {
  error.value = ''
  name.value = ''
  account.value = ''
  password.value = ''
  showPassword.value = false
  create.value = true
}
function openEdit(u: User) {
  editTarget.value = u
  editName.value = u.name
  editUsername.value = u.username
  editNumber.value = u.number
  editRole.value = u.role
  error.value = ''
}
function openToggle(u: User) {
  error.value = ''
  toggleUser.value = u
}
async function saveUser() {
  const u = editTarget.value
  if (!u || busy.value) return
  busy.value = true
  error.value = ''
  try {
    const changes = {
      ...(editName.value.trim() !== u.name ? { name: editName.value.trim() } : {}),
      ...(editUsername.value.trim() !== u.username ? { username: editUsername.value.trim() } : {}),
      ...(editNumber.value !== u.number ? { number: editNumber.value } : {}),
      ...(editRole.value !== u.role ? { role: editRole.value } : {}),
    }
    if (Object.keys(changes).length) await api('/admin/users/' + u.id, 'PATCH', changes)
    editTarget.value = undefined
    notify(t('admin.notify.profileSaved'))
    await load()
  } catch (e) {
    error.value = message(e)
  } finally {
    busy.value = false
  }
}
async function batchUsers(action: 'enable' | 'disable' | 'reset' | 'delete' | 'role') {
  if (busy.value || !selectedUsers.value.length) return
  const targets = [...selectedUsers.value]
  const labels = {
    enable: t('admin.batch.label.enable'),
    disable: t('admin.batch.label.disable'),
    reset: t('admin.batch.label.reset'),
    delete: t('admin.batch.label.delete'),
    role: t('admin.batch.label.role'),
  }
  const consequence =
    action === 'delete'
      ? t('admin.batch.consequence.delete')
      : action === 'disable'
        ? t('admin.batch.consequence.disable')
        : action === 'reset'
          ? t('admin.batch.consequence.reset')
          : action === 'role'
            ? t(
                batchRole.value === 'teacher'
                  ? 'admin.batch.consequence.roleTeacher'
                  : 'admin.batch.consequence.roleStudent',
              )
            : t('admin.batch.consequence.enable')
  if (
    !(await confirmAction(
      t('admin.batch.confirm', { label: labels[action], count: targets.length, consequence }),
      {
        destructive: action === 'delete' || action === 'disable',
      },
    ))
  )
    return
  busy.value = true
  busyReason.value = t('admin.batch.busy')
  batchError.value = ''
  batchProgress.value = { completed: 0, total: targets.length }
  const newCredentials: Credential[] = []
  try {
    const result = await runMemberBatch(
      targets,
      async (u) => {
        if (action === 'delete') await api('/admin/users/' + u.id, 'DELETE')
        else if (action === 'reset') {
          const bytes = crypto.getRandomValues(new Uint8Array(16))
          const password = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
          await api('/admin/users/' + u.id, 'PATCH', { password })
          newCredentials.push({
            name: u.name,
            username: u.username,
            password,
            generatedAt: new Date().toISOString(),
          })
        } else if (action === 'role')
          await api('/admin/users/' + u.id, 'PATCH', { role: batchRole.value })
        else await api('/admin/users/' + u.id, 'PATCH', { disabled: action === 'disable' })
      },
      {
        progress: (completed) => {
          batchProgress.value.completed = completed
        },
      },
    )
    if (newCredentials.length) {
      const names = new Set(newCredentials.map((c) => c.username))
      credentials.value = [
        ...credentials.value.filter((c) => !names.has(c.username)),
        ...newCredentials,
      ]
      credentialsOpen.value = true
    }
    selectedUserIds.value = [
      ...result.failed.map((item) => item.member.id),
      ...result.pending.map((u) => u.id),
    ]
    if (result.failed.length || result.pending.length) batchError.value = memberBatchMessage(result)
    else
      notify(
        t('admin.batch.' + (action === 'reset' ? 'doneReset' : 'done'), {
          label: labels[action],
          count: result.succeeded.length,
        }),
      )
    await load()
  } finally {
    busy.value = false
    batchProgress.value = { completed: 0, total: 0 }
  }
}
async function deleteUser(u: User) {
  if (
    busy.value ||
    !(await confirmAction(t('admin.notify.deleteConfirm', { username: u.username }), {
      destructive: true,
    }))
  )
    return
  busy.value = true
  try {
    await api('/admin/users/' + u.id, 'DELETE')
    notify(t('admin.notify.accountDeleted'))
    await load()
  } catch (e) {
    notify(message(e), 'error')
  } finally {
    busy.value = false
  }
}
function openReset(u: User) {
  resetTarget.value = u
  resetUser.value = u.id
  resetPassword.value = ''
  showPassword.value = false
  error.value = ''
}
async function addUser() {
  if (busy.value) return
  busyReason.value = t('admin.busyReason.creatingAccount')
  busy.value = true
  error.value = ''
  try {
    await api('/admin/users', 'POST', {
      name: name.value.trim(),
      username: account.value.trim(),
      password: password.value,
      role: userRole.value,
    })
    storeCredential({
      name: name.value.trim(),
      username: account.value.trim(),
      password: password.value,
    })
    create.value = false
    password.value = ''
    notify(t('admin.notify.accountCreated'))
    await load()
  } catch (e) {
    error.value = message(e)
  } finally {
    busy.value = false
  }
}
async function toggle() {
  const u = toggleUser.value
  if (!u || busy.value) return
  busyReason.value = t('admin.busyReason.updatingStatus')
  busy.value = true
  error.value = ''
  try {
    await api('/admin/users/' + u.id, 'PATCH', { disabled: !u.disabled })
    toggleUser.value = undefined
    notify(u.disabled ? t('admin.notify.accountEnabled') : t('admin.notify.accountDisabled'))
    await load()
  } catch (e) {
    error.value = message(e)
  } finally {
    busy.value = false
  }
}
async function reset() {
  if (busy.value) return
  const u = resetTarget.value
  if (!u) return
  busyReason.value = t('admin.busyReason.resettingPassword')
  busy.value = true
  error.value = ''
  try {
    await api('/admin/users/' + u.id, 'PATCH', { password: resetPassword.value })
    storeCredential({ name: u.name, username: u.username, password: resetPassword.value })
    resetUser.value = ''
    resetPassword.value = ''
    notify(t('admin.notify.passwordReset'))
    await load()
  } catch (e) {
    error.value = message(e)
  } finally {
    busy.value = false
  }
}
async function backup() {
  if (busy.value) return
  busyReason.value = t('admin.busyReason.creatingBackup')
  busy.value = true
  error.value = ''
  try {
    await api('/admin/backup', 'POST', {})
    notify(t('admin.notify.backupDone'))
    await load()
  } catch (e) {
    error.value = message(e)
  } finally {
    busy.value = false
  }
}
useActionFeedback(error)
const busyReason = ref(t('admin.busyReason.default'))
</script>
<template>
  <div class="page-heading">
    <div>
      <div class="heading-meta">{{ t('admin.platformAdmin') }}</div>
      <h1>{{ title }}</h1>
      <!-- <p>管理员不默认拥有课堂作品读取权限。</p> -->
    </div>
    <div class="inline-items">
      <Button
        variant="outline"
        :disabled="loading"
        :data-disabled-reason="t('admin.loadingPlatformData')"
        @click="refreshOverview">
        <RefreshCw :size="15" />
        {{ t('common.refresh') }}
      </Button>
      <Button v-if="section === 'teachers'" @click="openCreate">
        {{ t('admin.createAccount') }}
      </Button>
    </div>
  </div>
  <Alert v-if="loadError" role="alert" type="error">
    <span>{{ loadError }}</span>

    <template #actions>
      <Button
        variant="plain"
        class="text-button"
        :disabled="loading"
        :data-disabled-reason="t('admin.loadingPlatformData')"
        @click="load">
        {{ t('common.retry') }}
      </Button>
    </template>
  </Alert>
  <p v-if="loading" class="muted admin-loading" role="status">{{ t('admin.loading') }}</p>
  <template v-if="section === 'health'">
    <div class="stat-grid">
      <div v-for="(value, key) in metrics" :key="key" class="stat-card">
        <div class="stat-top">
          {{ t(`admin.stats.${key}`) }}
        </div>
        <div class="stat-number">{{ value }}</div>
      </div>
    </div>
    <RunnerUsage ref="runnerUsage" />
  </template>
  <ContentPanel v-else-if="section === 'teachers'" as="section" direct class="panel-fill">
    <div class="table-controls">
      <label class="search-field">
        <Search :size="16" />
        <Input
          v-model="search"
          :disabled="busy"
          :aria-label="t('admin.users.searchLabel')"
          :placeholder="t('admin.users.searchPlaceholder')" />
      </label>
      <div class="inline-items">
        <Select
          v-model="roleFilter"
          :disabled="busy"
          :aria-label="t('admin.users.roleFilterLabel')">
          <SelectOption value="all">{{ t('admin.users.allRoles') }}</SelectOption>
          <SelectOption value="teacher">{{ t('admin.users.roleTeacher') }}</SelectOption>
          <SelectOption value="student">{{ t('admin.users.roleStudent') }}</SelectOption>
          <SelectOption value="admin">{{ t('admin.users.roleAdmin') }}</SelectOption>
        </Select>
        <Select
          v-model="statusFilter"
          :disabled="busy"
          :aria-label="t('admin.users.statusFilterLabel')">
          <SelectOption value="all">{{ t('admin.users.allStatuses') }}</SelectOption>
          <SelectOption value="active">{{ t('admin.users.statusActive') }}</SelectOption>
          <SelectOption value="disabled">{{ t('admin.users.statusDisabled') }}</SelectOption>
        </Select>
      </div>
      <Button v-if="credentials.length" variant="outline" size="sm" @click="credentialsOpen = true">
        <Download />
        {{ t('admin.users.viewExportCredentials') }}
      </Button>
    </div>
    <Alert v-if="batchError" type="error">{{ batchError }}</Alert>
    <div
      v-if="selectedUsers.length"
      class="table-controls"
      :aria-label="t('admin.users.batchAria')">
      <div class="inline-items">
        <span class="muted">
          {{
            busy && batchProgress.total
              ? t('admin.users.batchProgress', {
                  completed: batchProgress.completed,
                  total: batchProgress.total,
                })
              : t('admin.users.selectedCount', { count: selectedUsers.length })
          }}
        </span>
        <Button variant="plain" class="text-button" :disabled="busy" @click="selectedUserIds = []">
          {{ t('admin.users.clearSelection') }}
        </Button>
        <Button
          size="sm"
          variant="outline"
          :disabled="busy || selectedUsers.some((u) => !u.disabled)"
          @click="batchUsers('enable')">
          {{ t('admin.users.batchEnable') }}
        </Button>
        <Button
          size="sm"
          variant="outline"
          :disabled="busy || selectedUsers.some((u) => u.disabled)"
          @click="batchUsers('disable')">
          {{ t('admin.users.batchDisable') }}
        </Button>
        <Select v-model="batchRole" :disabled="busy" :aria-label="t('admin.users.batchRoleAria')">
          <SelectOption value="student">{{ t('admin.users.roleStudent') }}</SelectOption>
          <SelectOption value="teacher">{{ t('admin.users.roleTeacher') }}</SelectOption>
        </Select>
        <Button
          size="sm"
          variant="outline"
          :disabled="busy || selectedUsers.some((u) => u.role === 'admin')"
          @click="batchUsers('role')">
          {{ t('admin.users.adjustRole') }}
        </Button>
        <Button size="sm" variant="warning" :disabled="busy" @click="batchUsers('reset')">
          {{ t('admin.users.batchReset') }}
        </Button>
        <Button size="sm" variant="destructive" :disabled="busy" @click="batchUsers('delete')">
          {{ t('admin.users.batchDelete') }}
        </Button>
      </div>
    </div>
    <div class="table-scroll">
      <table>
        <thead>
          <tr>
            <th>
              <Checkbox
                :aria-label="t('admin.users.selectAllLabel')"
                :disabled="busy || loading || !selectableUsers.length"
                :checked="allUsersSelected"
                :indeterminate="someUsersSelected && !allUsersSelected"
                @change="selectUserPage" />
            </th>
            <th>{{ t('admin.users.colName') }}</th>
            <th>{{ t('admin.users.colAccount') }}</th>
            <th>{{ t('admin.users.colRole') }}</th>
            <th>{{ t('admin.users.colStatus') }}</th>
            <th>{{ t('admin.users.colActions') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="u in userPages.paged.value" :key="u.id">
            <td>
              <Checkbox
                v-model="selectedUserIds"
                :value="u.id"
                :aria-label="t('admin.users.selectUser', { name: u.name })"
                :disabled="busy || loading || u.id === currentUser?.id" />
            </td>
            <td>{{ u.name }}</td>
            <td class="admin-account">{{ u.username }}</td>
            <td>
              {{ roleLabel(u.role) }}
            </td>
            <td>
              <span class="status" :class="u.disabled ? 'red' : 'positive'">
                {{ u.disabled ? t('admin.users.statusDisabled') : t('admin.users.statusActive') }}
              </span>
            </td>
            <td>
              <DropdownMenuRoot v-if="u.id !== currentUser?.id">
                <DropdownMenuTrigger as-child>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    :aria-label="t('admin.users.manageUser', { name: u.name })"
                    :disabled="busy">
                    <Ellipsis />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuPortal>
                  <DropdownMenuContent class="ui-menu-content" align="end" :side-offset="5">
                    <DropdownMenuItem class="ui-menu-item" @select="openEdit(u)">
                      {{ t('admin.users.editProfile') }}
                    </DropdownMenuItem>
                    <DropdownMenuItem class="ui-menu-item" @select="openReset(u)">
                      {{ t('admin.users.resetPassword') }}
                    </DropdownMenuItem>
                    <DropdownMenuItem class="ui-menu-item" @select="openToggle(u)">
                      {{
                        u.disabled
                          ? t('admin.users.enableAccount')
                          : t('admin.users.disableAccount')
                      }}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator class="account-menu-separator" />
                    <DropdownMenuItem class="ui-menu-item danger-text" @select="deleteUser(u)">
                      {{ t('admin.users.deleteAccount') }}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenuPortal>
              </DropdownMenuRoot>
              <span v-else class="muted">{{ t('admin.users.currentAccountHint') }}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-if="!users.length && !loading && !loadError" class="empty-state">
      {{ t('admin.users.empty') }}
    </p>
    <Pagination
      v-model:page="userPages.page.value"
      v-model:page-size="userPages.pageSize.value"
      :total="userTotal"
      :busy="busy || loading"
      :unit="t('admin.users.unit')" />
    <div v-if="recoveryTotal" class="admin-recovery-content form-stack">
      <h3 data-guide="recovery-requests">{{ t('admin.recovery.heading') }}</h3>
      <div v-for="r in recoveries" :key="r.id" class="recovery-row">
        <div>
          <strong>{{ r.username }}</strong>
          <p>
            {{
              (r.name ?? t('admin.recovery.notFound')) +
              ' · ' +
              new Date(r.created_at).toLocaleString()
            }}
          </p>
        </div>
        <div class="inline-items">
          <Button
            v-if="r.user_id && r.user_id !== currentUser?.id"
            size="sm"
            variant="outline"
            :disabled="busy"
            :data-disabled-reason="busyReason"
            @click="resetRecovery(r)">
            {{ t('admin.recovery.verifyReset') }}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            :disabled="busy"
            :data-disabled-reason="busyReason"
            @click="
              () => {
                error = ''
                closeReason = ''
                closeRecovery = r
              }
            ">
            {{ t('admin.recovery.close') }}
          </Button>
        </div>
      </div>
      <Pagination
        v-model:page="recoveryPage"
        v-model:page-size="recoveryPageSize"
        :total="recoveryTotal"
        :unit="t('admin.recovery.unit')" />
    </div>
  </ContentPanel>
  <ContentPanel v-else-if="section === 'tasks'" as="section" direct class="panel-fill">
    <div class="table-controls">
      <label class="search-field">
        <Search :size="16" />
        <Input
          v-model="search"
          :aria-label="t('admin.tasks.searchLabel')"
          :placeholder="t('admin.tasks.searchPlaceholder')" />
      </label>
    </div>
    <div class="table-scroll">
      <table>
        <thead>
          <tr>
            <th>{{ t('admin.tasks.colTask') }}</th>
            <th>{{ t('admin.tasks.colClassroom') }}</th>
            <th>{{ t('admin.tasks.colReason') }}</th>
            <th>{{ t('admin.tasks.colTime') }}</th>
            <th>{{ t('admin.tasks.colDiagnosis') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="task in taskPages.paged.value" :key="task.id">
            <td class="task-id-cell">
              <code class="task-id">{{ task.id }}</code>
            </td>
            <td>{{ task.classroom }}</td>
            <td>{{ task.exit }}</td>
            <td>{{ new Date(task.created_at).toLocaleString() }}</td>
            <td>
              <Button size="sm" variant="outline" @click="taskDetail = task">
                {{ t('admin.tasks.viewDetail') }}
              </Button>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-if="!tasks.length && !loading && !loadError" class="empty-state">
        {{ t('admin.tasks.empty') }}
      </p>
    </div>
    <Pagination
      v-model:page="taskPages.page.value"
      v-model:page-size="taskPages.pageSize.value"
      :total="taskTotal"
      :unit="t('admin.tasks.unit')" />
  </ContentPanel>
  <template v-else>
    <ContentPanel :title="t('admin.backup.title')" :icon="Database" class="admin-backup-panel">
      <p>{{ t('admin.backup.description') }}</p>

      <Button :disabled="busy" :data-disabled-reason="busyReason" @click="backup">
        <Database :size="15" />
        {{ busy ? t('admin.backup.running') : t('admin.backup.create') }}
      </Button>
    </ContentPanel>
    <ContentPanel as="section" direct class="panel-fill" data-guide="audit-records">
      <div class="panel-heading">
        <h2>{{ t('admin.audit.heading') }}</h2>
      </div>
      <div class="table-controls">
        <label class="search-field">
          <Search :size="16" />
          <Input
            v-model="search"
            :aria-label="t('admin.audit.searchLabel')"
            :placeholder="t('admin.audit.searchPlaceholder')" />
        </label>
      </div>
      <div class="table-scroll">
        <div v-for="a in auditPages.paged.value" :key="a.id" class="audit-item">
          <div>
            <strong>{{ eventLabel(a.event) }}</strong>
            <p>
              {{
                (a.actor_name ?? t('admin.audit.system')) +
                ' · ' +
                new Date(a.created_at).toLocaleString()
              }}
            </p>
            <Disclosure :title="t('admin.audit.viewDetails')">
              <CodeBlock
                :source="JSON.stringify(a.details, null, 2)"
                language="json"
                label="JSON" />
            </Disclosure>
          </div>
        </div>
        <p v-if="!audit.length && !loading && !loadError" class="empty-state">
          {{ t('admin.audit.empty') }}
        </p>
      </div>
      <Pagination
        v-model:page="auditPages.page.value"
        v-model:page-size="auditPages.pageSize.value"
        :total="auditTotal"
        :unit="t('admin.audit.unit')" />
    </ContentPanel>
  </template>
  <Modal
    :open="!!editTarget"
    :title="t('admin.editDialog.title')"
    :dismissible="!busy"
    @update:open="
      (value) => {
        if (!value) editTarget = undefined
      }
    ">
    <Form class="form-stack" @submit.prevent="saveUser">
      <label>
        {{ t('admin.editDialog.name') }}
        <Input v-model="editName" required maxlength="50" />
      </label>
      <label>
        {{ t('admin.editDialog.account') }}
        <Input v-model="editUsername" required maxlength="80" pattern="[a-zA-Z0-9._@-]+" />
      </label>
      <label>
        {{ t('admin.editDialog.number') }}
        <Input v-model="editNumber" maxlength="50" />
      </label>
      <label v-if="editTarget?.role !== 'admin'">
        {{ t('admin.editDialog.role') }}
        <Select v-model="editRole">
          <SelectOption value="teacher">{{ t('admin.users.roleTeacher') }}</SelectOption>
          <SelectOption value="student">{{ t('admin.users.roleStudent') }}</SelectOption>
        </Select>
      </label>
      <p v-if="error" role="alert">{{ error }}</p>
      <div class="modal-actions">
        <Button type="submit" :disabled="busy">{{ t('common.save') }}</Button>
      </div>
    </Form>
  </Modal>
  <Modal
    v-model:open="create"
    :dismissible="!busy"
    :title="t('admin.createDialog.title')"
    :description="t('admin.createDialog.description')">
    <Form class="form-stack" @submit.prevent="addUser">
      <label>
        {{ t('admin.createDialog.name') }}
        <Input v-model="name" required maxlength="50" />
      </label>
      <label>
        {{ t('admin.createDialog.account') }}
        <Input
          v-model="account"
          required
          maxlength="80"
          pattern="[a-zA-Z0-9._@-]+"
          :placeholder="t('admin.createDialog.accountPlaceholder')" />
      </label>
      <label>
        {{ t('admin.createDialog.role') }}
        <Select v-model="userRole">
          <SelectOption value="teacher">{{ t('admin.users.roleTeacher') }}</SelectOption>
          <SelectOption value="student">{{ t('admin.users.roleStudent') }}</SelectOption>
        </Select>
      </label>
      <label>
        {{ t('admin.createDialog.initialPassword') }}
        <div class="password-field">
          <Input
            v-model="password"
            :type="showPassword ? 'text' : 'password'"
            required
            maxlength="200"
            autocomplete="new-password" />
          <Button
            variant="plain"
            type="button"
            class="icon-button"
            :aria-label="
              showPassword
                ? t('admin.createDialog.hidePassword')
                : t('admin.createDialog.showPassword')
            "
            @click="showPassword = !showPassword">
            <EyeOff v-if="showPassword" :size="18" />
            <Eye v-else :size="18" />
          </Button>
        </div>
      </label>

      <div class="modal-actions">
        <Button
          type="button"
          variant="outline"
          :disabled="busy"
          :data-disabled-reason="busyReason"
          @click="create = false">
          {{ t('common.cancel') }}
        </Button>
        <Button type="submit" :disabled="busy" :data-disabled-reason="busyReason">
          {{ busy ? t('admin.createDialog.submitting') : t('admin.createDialog.submit') }}
        </Button>
      </div>
    </Form>
  </Modal>
  <Modal
    :open="!!resetUser"
    :dismissible="!busy"
    :title="t('admin.resetDialog.title')"
    :description="t('admin.resetDialog.description')"
    @update:open="!$event && (resetUser = '')">
    <Form class="form-stack" @submit.prevent="reset">
      <label>
        {{ t('admin.resetDialog.newPassword') }}
        <div class="password-field">
          <Input
            v-model="resetPassword"
            required
            maxlength="200"
            :type="showPassword ? 'text' : 'password'"
            autocomplete="new-password" />
          <Button
            variant="plain"
            type="button"
            class="icon-button"
            :aria-label="
              showPassword
                ? t('admin.resetDialog.hidePassword')
                : t('admin.resetDialog.showPassword')
            "
            @click="showPassword = !showPassword">
            <EyeOff v-if="showPassword" :size="18" />
            <Eye v-else :size="18" />
          </Button>
        </div>
      </label>

      <div class="modal-actions">
        <Button
          type="button"
          variant="outline"
          :disabled="busy"
          :data-disabled-reason="busyReason"
          @click="resetUser = ''">
          {{ t('common.cancel') }}
        </Button>
        <Button type="submit" variant="warning" :disabled="busy" :data-disabled-reason="busyReason">
          <KeyRound />
          {{ busy ? t('admin.resetDialog.submitting') : t('admin.resetDialog.submit') }}
        </Button>
      </div>
    </Form>
  </Modal>
  <Modal
    :open="!!toggleUser"
    :dismissible="!busy"
    :title="
      toggleUser?.disabled
        ? t('admin.toggleDialog.enableTitle')
        : t('admin.toggleDialog.disableTitle')
    "
    :description="
      toggleUser?.disabled
        ? t('admin.toggleDialog.enableDescription')
        : t('admin.toggleDialog.disableDescription')
    "
    @update:open="!$event && (toggleUser = undefined)">
    <p class="body-copy">{{ toggleUser?.name }} · {{ toggleUser?.username }}</p>

    <div class="modal-actions">
      <Button
        variant="outline"
        :disabled="busy"
        :data-disabled-reason="busyReason"
        @click="toggleUser = undefined">
        {{ t('common.cancel') }}
      </Button>
      <Button
        :variant="toggleUser?.disabled ? 'success' : 'destructive'"
        :disabled="busy"
        :data-disabled-reason="busyReason"
        @click="toggle">
        {{
          busy
            ? t('admin.toggleDialog.processing')
            : toggleUser?.disabled
              ? t('admin.toggleDialog.confirmEnable')
              : t('admin.toggleDialog.confirmDisable')
        }}
      </Button>
    </div>
  </Modal>
  <CredentialDialog
    v-model:open="credentialsOpen"
    :credentials="credentials"
    @export="exportCredentials"
    @clear="credentials = []" />

  <Modal
    :open="!!closeRecovery"
    :dismissible="!busy"
    :title="t('admin.recovery.closeTitle')"
    :description="t('admin.recovery.closeDescription')"
    @update:open="!$event && (closeRecovery = undefined)">
    <Form class="form-stack" @submit.prevent="resolveRecovery">
      <p>{{ closeRecovery?.username }}</p>
      <label>
        {{ t('admin.recovery.reasonLabel') }}
        <Textarea v-model="closeReason" required maxlength="500" rows="3" />
      </label>

      <div class="modal-actions">
        <Button
          type="button"
          variant="outline"
          :disabled="busy"
          :data-disabled-reason="busyReason"
          @click="closeRecovery = undefined">
          {{ t('common.cancel') }}
        </Button>
        <Button
          type="submit"
          :disabled="busy || !closeReason.trim()"
          :data-disabled-reason="busy ? busyReason : t('admin.recovery.reasonRequired')">
          {{ busy ? t('admin.toggleDialog.processing') : t('admin.recovery.confirm') }}
        </Button>
      </div>
    </Form>
  </Modal>
  <Modal
    :open="!!taskDetail"
    :title="t('admin.taskDialog.title')"
    wide
    @update:open="!$event && (taskDetail = undefined)">
    <div v-if="taskDetail" class="form-stack task-detail">
      <p>
        <strong>{{ taskDetail.classroom }}</strong>
        ·
        {{ new Date(taskDetail.created_at).toLocaleString() }}
      </p>
      <code>{{ taskDetail.id }}</code>
      <Alert type="error">{{ taskDetail.exit }}</Alert>
      <Alert type="info">
        {{ t('admin.taskDialog.privacy') }}
      </Alert>
      <Disclosure :title="t('admin.taskDialog.metrics')">
        <CodeBlock
          :source="JSON.stringify(taskDetail.metrics ?? {}, null, 2)"
          language="json"
          label="JSON" />
      </Disclosure>
      <Button as-child variant="outline">
        <RouterLink to="/admin/settings">{{ t('admin.taskDialog.gotoSettings') }}</RouterLink>
      </Button>
    </div>
  </Modal>
</template>

<style scoped>
.recovery-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  padding: 12px 0;
  border-bottom: 1px solid var(--ui-line);
}
.recovery-row > div {
  min-width: 0;
  overflow-wrap: anywhere;
}
.task-detail pre {
  max-height: 240px;
  overflow: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  padding: 12px;
  background: var(--ui-surface);
  border: 1px solid var(--ui-line);
  border-radius: 6px;
  font-size: 14px;
}
.task-detail > code {
  overflow-wrap: anywhere;
}

.password-field {
  display: flex;
  align-items: center;
  gap: 6px;
}
.password-field input {
  min-width: 0;
  flex: 1;
}
.credential-actions {
  margin-bottom: 16px;
}
.admin-credentials {
  max-height: 360px;
  border: 1px solid var(--ui-line);
  border-radius: 6px;
}
.admin-loading {
  margin-bottom: 16px;
  font-size: 15px;
}
.task-id {
  font-size: 14px;
  overflow-wrap: anywhere;
  white-space: normal;
}
.task-id-cell {
  min-width: 200px;
  max-width: 240px;
}
.admin-account {
  min-width: 200px;
  max-width: 260px;
  white-space: normal;
  overflow-wrap: anywhere;
}
.account-menu-separator {
  height: 1px;
  margin: 5px 0;
  background: var(--ui-line);
}
.table-controls .ui-select-trigger {
  font-size: 15px;
  height: 38px;
  min-height: 38px;
  padding-block: 0;
  max-width: 160px;
}

.admin-backup-panel {
  margin-bottom: 24px;
}
.admin-recovery-content {
  padding: 24px;
  border-top: 1px solid var(--ui-line);
}
.admin-recovery-content h3 {
  font-size: 16px;
  font-weight: 600;
}
.admin-recovery-content p {
  font-size: 14px;
  color: var(--ui-secondary);
}
@media (max-width: 760px) {
  .admin-recovery-content {
    padding: 20px;
  }
}
</style>
