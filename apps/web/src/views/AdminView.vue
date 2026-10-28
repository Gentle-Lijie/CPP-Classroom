<script setup lang="ts">
import { useActionFeedback } from '@/composables/useActionFeedback'
import { Alert } from '@/components/ui/alert'
import { Input } from '@/components/ui/input'
import { Select, SelectOption } from '@/components/ui/select'
import { Disclosure } from '@/components/ui/disclosure'
import { Form } from '@/components/ui/form'
import { Textarea } from '@/components/ui/textarea'
import { computed, ref, onMounted, watch } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute } from 'vue-router'
import { Button } from '@/components/ui/button'
import {
  Server,
  Database,
  ArrowUpRight,
  RefreshCw,
  Search,
  Download,
  KeyRound,
  Eye,
  EyeOff,
} from '@lucide/vue'
import ContentPanel from '@/components/classroom/ContentPanel.vue'
import Pagination from '@/components/classroom/Pagination.vue'
import { api } from '@/lib/api'
import { csvDocument } from '@/lib/csv'
import { notify, download, currentUser, executionSettings } from '@/data/demo'
import Modal from '@/components/classroom/Modal.vue'
import CredentialDialog from '@/components/classroom/CredentialDialog.vue'
const route = useRoute()
function allowNavigation() {
  if (!busy.value) return true
  notify('操作正在处理，请等待完成后离开', 'error')
  return false
}
onBeforeRouteLeave(allowNavigation)
onBeforeRouteUpdate(allowNavigation)
const section = computed(() => String(route.params.section ?? 'health'))
interface User {
  id: string
  name: string
  username: string
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
const taskPages = { page: ref(1), pageSize: ref(20), paged: tasks }
const auditPages = { page: ref(1), pageSize: ref(20), paged: audit }
const recoveryPage = ref(1),
  recoveryPageSize = ref(10)
const title = computed(
  () =>
    ({ health: '平台概况', teachers: '账号管理', tasks: '失败任务', backups: '备份与管理记录' })[
      section.value
    ] ?? '平台概况',
)
const message = (e: unknown) => (e instanceof Error ? e.message : '请求失败，请重试')
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
function eventLabel(event: string) {
  return (
    (
      {
        'user.created': '创建账号',
        'user.updated': '更新账号',
        'user.password_changed': '个人修改密码',
        'recovery.closed': '关闭恢复申请',
        'membership.added': '添加课堂成员',
        'membership.updated': '更新成员权限',
        'membership.rejected': '拒绝入班申请',
        'membership.passwords_reset': '重置学生密码',
        'classroom.created': '创建课堂',
        'classroom.updated': '更新课堂',
        'exercise.created': '创建练习',
        'exercise.updated': '更新练习',
        'exercise.closed': '关闭练习',
        'exercises.reordered': '调整练习顺序',
        'backup.verified': '备份与恢复校验',
        'settings.updated': '更新平台配置',
      } as Record<string, string>
    )[event] ?? event
  )
}
async function resolveRecovery() {
  if (busy.value || !closeRecovery.value) return
  busy.value = true
  error.value = ''
  try {
    await api('/admin/recoveries/' + closeRecovery.value.id + '/resolve', 'POST', {
      reason: closeReason.value.trim(),
    })
    closeRecovery.value = undefined
    closeReason.value = ''
    notify('恢复申请已关闭，处理原因已记录')
    await load()
  } catch (e) {
    error.value = message(e)
  } finally {
    busy.value = false
  }
}
function resetRecovery(r: Recovery) {
  if (!r.user_id || !r.name || !r.role) return
  openReset({ id: r.user_id, name: r.name, role: r.role, username: r.username, disabled: false })
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
    '平台账号登录凭据.csv',
    csvDocument([
      ['姓名', '登录账号', '密码', '生成时间', '登录地址'],
      ...credentials.value.map((c) => [
        c.name,
        c.username,
        c.password,
        c.generatedAt ?? '未知',
        location.origin + '/login',
      ]),
    ]),
    'text/csv;charset=utf-8',
  )
  notify('已发起下载，请确认账号密码表已保存')
}

function openCreate() {
  error.value = ''
  name.value = ''
  account.value = ''
  password.value = ''
  showPassword.value = false
  create.value = true
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
    notify('账号已创建，请导出登录凭据')
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
  busy.value = true
  error.value = ''
  try {
    await api('/admin/users/' + u.id, 'PATCH', { disabled: !u.disabled })
    toggleUser.value = undefined
    notify(u.disabled ? '账号已启用' : '账号已停用，旧会话已失效')
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
  busy.value = true
  error.value = ''
  try {
    await api('/admin/users/' + u.id, 'PATCH', { password: resetPassword.value })
    storeCredential({ name: u.name, username: u.username, password: resetPassword.value })
    resetUser.value = ''
    resetPassword.value = ''
    notify('密码已重设，请交付新凭据')
    await load()
  } catch (e) {
    error.value = message(e)
  } finally {
    busy.value = false
  }
}
async function backup() {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try {
    await api('/admin/backup', 'POST', {})
    notify('已生成备份，并在独立临时数据库完成恢复验证')
    await load()
  } catch (e) {
    error.value = message(e)
  } finally {
    busy.value = false
  }
}
useActionFeedback(error)
</script>
<template>
  <div class="page-heading">
    <div>
      <div class="heading-meta">平台管理</div>
      <h1>{{ title }}</h1>
      <!-- <p>管理员不默认拥有课堂作品读取权限。</p> -->
    </div>
    <div class="inline-items">
      <Button variant="outline" :disabled="loading" @click="load">
        <RefreshCw :size="15" />
        刷新
      </Button>
      <Button v-if="section === 'teachers'" @click="openCreate">创建账号</Button>
    </div>
  </div>
  <Alert v-if="loadError" role="alert" type="error">
    <span>{{ loadError }}</span>

    <template #actions>
      <Button variant="plain" class="text-button" :disabled="loading" @click="load">重试</Button>
    </template>
  </Alert>
  <p v-if="loading" class="muted admin-loading" role="status">正在加载…</p>
  <template v-if="section === 'health'">
    <div class="stat-grid">
      <div v-for="(value, key) in metrics" :key="key" class="stat-card">
        <div class="stat-top">
          {{
            { classrooms: '开放课堂', online: '在线成员', queued: '排队任务', failed: '平台失败' }[
              key
            ]
          }}
        </div>
        <div class="stat-number">{{ value }}</div>
      </div>
    </div>
    <ContentPanel title="服务与执行环境" :icon="Server">
      <!-- description="以下为平台配置目标；实际节点连接与服务健康请在平台配置中检查。" -->
      <template #actions>
        <Button variant="outline" size="sm" as-child>
          <RouterLink to="/admin/settings">
            管理配置
            <ArrowUpRight :size="14" />
          </RouterLink>
        </Button>
      </template>
      <dl class="admin-environment-summary">
        <div>
          <dt>编译环境</dt>
          <dd>
            GCC（配置目标）
            <span>
              / {{ executionSettings.compilerProfile === 'gcc13-cpp20' ? 'C++20' : 'C++17' }}
            </span>
          </dd>
        </div>
        <div>
          <dt>并行任务</dt>
          <dd>
            {{ executionSettings.executionConcurrency }}
            <span>个执行槽</span>
          </dd>
        </div>
        <div>
          <dt>执行节点</dt>
          <dd>独立 Linux 节点</dd>
        </div>
      </dl>
    </ContentPanel>
  </template>
  <section v-else-if="section === 'teachers'" class="panel panel-fill">
    <div class="table-controls">
      <label class="search-field">
        <Search :size="16" />
        <Input v-model="search" aria-label="搜索账号" placeholder="搜索姓名或登录账号…" />
      </label>
      <div class="inline-items">
        <Select v-model="roleFilter" aria-label="筛选身份">
          <SelectOption value="all">全部身份</SelectOption>
          <SelectOption value="teacher">教师</SelectOption>
          <SelectOption value="student">学生</SelectOption>
          <SelectOption value="admin">管理员</SelectOption>
        </Select>
        <Select v-model="statusFilter" aria-label="筛选状态">
          <SelectOption value="all">全部状态</SelectOption>
          <SelectOption value="active">正常</SelectOption>
          <SelectOption value="disabled">停用</SelectOption>
        </Select>
      </div>
      <Button v-if="credentials.length" variant="outline" size="sm" @click="credentialsOpen = true">
        <Download />
        查看 / 导出凭据
      </Button>
    </div>
    <div class="table-scroll">
      <table>
        <thead>
          <tr>
            <th>姓名</th>
            <th>账号</th>
            <th>身份</th>
            <th>状态</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="u in userPages.paged.value" :key="u.id">
            <td>{{ u.name }}</td>
            <td class="admin-account">{{ u.username }}</td>
            <td>{{ { admin: '管理员', teacher: '教师', student: '学生' }[u.role] ?? u.role }}</td>
            <td>
              <span class="status" :class="u.disabled ? 'red' : 'positive'">
                {{ u.disabled ? '停用' : '正常' }}
              </span>
            </td>
            <td>
              <template v-if="u.id !== currentUser?.id">
                <Button
                  size="sm"
                  :variant="u.disabled ? 'success' : 'outline'"
                  @click="
                    () => {
                      error = ''
                      toggleUser = u
                    }
                  ">
                  {{ u.disabled ? '启用' : '停用' }}
                </Button>
                <Button class="ml-2" size="sm" variant="ghost" @click="openReset(u)">
                  重设密码
                </Button>
              </template>
              <span v-else class="muted">当前账号 · 在个人设置改密</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-if="!users.length && !loading && !loadError" class="empty-state">
      没有匹配的账号，请调整筛选条件。
    </p>
    <Pagination
      v-model:page="userPages.page.value"
      v-model:page-size="userPages.pageSize.value"
      :total="userTotal"
      unit="个账号" />
    <div v-if="recoveryTotal" class="admin-recovery-content form-stack">
      <h3 data-guide="recovery-requests">待核实身份的恢复申请</h3>
      <div v-for="r in recoveries" :key="r.id" class="recovery-row">
        <div>
          <strong>{{ r.username }}</strong>
          <p>{{ r.name ?? '未找到对应账号' }} · {{ new Date(r.created_at).toLocaleString() }}</p>
        </div>
        <div class="inline-items">
          <Button
            v-if="r.user_id && r.user_id !== currentUser?.id"
            size="sm"
            variant="outline"
            :disabled="busy"
            @click="resetRecovery(r)">
            核实后重设密码
          </Button>
          <Button
            size="sm"
            variant="ghost"
            :disabled="busy"
            @click="
              () => {
                error = ''
                closeReason = ''
                closeRecovery = r
              }
            ">
            关闭申请
          </Button>
        </div>
      </div>
      <Pagination
        v-model:page="recoveryPage"
        v-model:page-size="recoveryPageSize"
        :total="recoveryTotal"
        unit="条申请" />
    </div>
  </section>
  <section v-else-if="section === 'tasks'" class="panel panel-fill">
    <div class="table-controls">
      <label class="search-field">
        <Search :size="16" />
        <Input
          v-model="search"
          aria-label="搜索失败任务"
          placeholder="搜索课堂、任务编号或失败原因…" />
      </label>
    </div>
    <div class="table-scroll">
      <table>
        <thead>
          <tr>
            <th>任务</th>
            <th>课堂</th>
            <th>原因</th>
            <th>时间</th>
            <th>诊断</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="t in taskPages.paged.value" :key="t.id">
            <td class="task-id-cell">
              <code class="task-id">{{ t.id }}</code>
            </td>
            <td>{{ t.classroom }}</td>
            <td>{{ t.exit }}</td>
            <td>{{ new Date(t.created_at).toLocaleString() }}</td>
            <td><Button size="sm" variant="outline" @click="taskDetail = t">查看详情</Button></td>
          </tr>
        </tbody>
      </table>
      <p v-if="!tasks.length && !loading && !loadError" class="empty-state">暂无平台失败任务</p>
    </div>
    <Pagination
      v-model:page="taskPages.page.value"
      v-model:page-size="taskPages.pageSize.value"
      :total="taskTotal"
      unit="条任务" />
  </section>
  <template v-else>
    <ContentPanel title="数据库备份" :icon="Database" class="admin-backup-panel">
      <p>备份保存在服务器本地。验证会使用独立的临时数据库，保留当前课堂、账号和作品数据。</p>

      <Button :disabled="busy" @click="backup">
        <Database :size="15" />
        {{ busy ? '备份与恢复验证中…' : '创建并验证备份' }}
      </Button>
    </ContentPanel>
    <section class="panel panel-fill" data-guide="audit-records">
      <div class="panel-heading"><h2>管理与备份记录</h2></div>
      <div class="table-controls">
        <label class="search-field">
          <Search :size="16" />
          <Input
            v-model="search"
            aria-label="搜索管理记录"
            placeholder="搜索操作者、事件或对象编号…" />
        </label>
      </div>
      <div class="table-scroll">
        <div v-for="a in auditPages.paged.value" :key="a.id" class="audit-item">
          <div>
            <strong>{{ eventLabel(a.event) }}</strong>
            <p>{{ a.actor_name ?? '系统' }} · {{ new Date(a.created_at).toLocaleString() }}</p>
            <Disclosure title="查看操作对象与详情">
              <pre>{{ JSON.stringify(a.details, null, 2) }}</pre>
            </Disclosure>
          </div>
        </div>
        <p v-if="!audit.length && !loading && !loadError" class="empty-state">暂无管理记录</p>
      </div>
      <Pagination
        v-model:page="auditPages.page.value"
        v-model:page-size="auditPages.pageSize.value"
        :total="auditTotal"
        unit="条记录" />
    </section>
  </template>
  <Modal
    v-model:open="create"
    :dismissible="!busy"
    title="创建平台账号"
    description="创建后可导出账号密码表，再通过可信渠道交付。">
    <Form class="form-stack" @submit.prevent="addUser">
      <label>
        姓名
        <Input v-model="name" required maxlength="50" />
      </label>
      <label>
        账号
        <Input
          v-model="account"
          required
          maxlength="80"
          pattern="[a-zA-Z0-9._@-]+"
          placeholder="字母、数字、点、下划线或连字符" />
      </label>
      <label>
        身份
        <Select v-model="userRole">
          <SelectOption value="teacher">教师</SelectOption>
          <SelectOption value="student">学生</SelectOption>
        </Select>
      </label>
      <label>
        初始密码
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
            :aria-label="showPassword ? '隐藏密码' : '显示密码'"
            @click="showPassword = !showPassword">
            <EyeOff v-if="showPassword" :size="18" />
            <Eye v-else :size="18" />
          </Button>
        </div>
      </label>

      <div class="modal-actions">
        <Button type="button" variant="outline" :disabled="busy" @click="create = false">
          取消
        </Button>
        <Button type="submit" :disabled="busy">
          {{ busy ? '正在创建…' : '创建账号并生成凭据' }}
        </Button>
      </div>
    </Form>
  </Modal>
  <Modal
    :open="!!resetUser"
    :dismissible="!busy"
    title="重设账号密码"
    description="旧登录会话将失效，正在执行的程序会停止。请核实申请人身份后操作。"
    @update:open="!$event && (resetUser = '')">
    <Form class="form-stack" @submit.prevent="reset">
      <label>
        新密码
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
            :aria-label="showPassword ? '隐藏密码' : '显示密码'"
            @click="showPassword = !showPassword">
            <EyeOff v-if="showPassword" :size="18" />
            <Eye v-else :size="18" />
          </Button>
        </div>
      </label>

      <div class="modal-actions">
        <Button type="button" variant="outline" :disabled="busy" @click="resetUser = ''">
          取消
        </Button>
        <Button type="submit" variant="warning" :disabled="busy">
          <KeyRound />
          {{ busy ? '正在重设…' : '保存并生成新凭据' }}
        </Button>
      </div>
    </Form>
  </Modal>
  <Modal
    :open="!!toggleUser"
    :dismissible="!busy"
    :title="toggleUser?.disabled ? '启用账号？' : '停用账号？'"
    :description="
      toggleUser?.disabled
        ? '账号可重新登录，原有课堂和作品保留。'
        : '此账号将无法登录，旧会话失效，运行中的程序停止。课堂和作品保留。'
    "
    @update:open="!$event && (toggleUser = undefined)">
    <p class="body-copy">{{ toggleUser?.name }} · {{ toggleUser?.username }}</p>

    <div class="modal-actions">
      <Button variant="outline" :disabled="busy" @click="toggleUser = undefined">取消</Button>
      <Button
        :variant="toggleUser?.disabled ? 'success' : 'destructive'"
        :disabled="busy"
        @click="toggle">
        {{ busy ? '处理中…' : toggleUser?.disabled ? '确认启用' : '确认停用' }}
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
    title="关闭这条恢复申请？"
    description="仅关闭待办，不修改账号密码。核实无效或已通过其他方式解决时，请说明原因。"
    @update:open="!$event && (closeRecovery = undefined)">
    <Form class="form-stack" @submit.prevent="resolveRecovery">
      <p>{{ closeRecovery?.username }}</p>
      <label>
        处理原因
        <Textarea v-model="closeReason" required maxlength="500" rows="3" />
      </label>

      <div class="modal-actions">
        <Button type="button" variant="outline" :disabled="busy" @click="closeRecovery = undefined">
          取消
        </Button>
        <Button type="submit" :disabled="busy || !closeReason.trim()">
          {{ busy ? '处理中…' : '确认关闭申请' }}
        </Button>
      </div>
    </Form>
  </Modal>
  <Modal
    :open="!!taskDetail"
    title="平台失败任务诊断"
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
        为保护课堂作品，管理员诊断不展示学生源代码、编译输出或程序输出。请根据失败原因与任务指标检查平台服务健康；课堂内容由授课教师核对。
      </Alert>
      <Disclosure title="任务指标">
        <pre>{{ JSON.stringify(taskDetail.metrics ?? {}, null, 2) }}</pre>
      </Disclosure>
      <Button as-child variant="outline">
        <RouterLink to="/admin/settings">检查平台服务与执行节点</RouterLink>
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
.table-controls .ui-select-trigger {
  font-size: 15px;
  height: 38px;
  min-height: 38px;
  padding-block: 0;
  max-width: 160px;
}

.admin-environment-summary {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 24px;
  margin: 0;
}
.admin-environment-summary div + div {
  border-left: 1px solid var(--ui-line);
  padding-left: 24px;
}
.admin-environment-summary dt {
  color: var(--ui-muted);
  font-size: 14px;
  margin-bottom: 10px;
}
.admin-environment-summary dd {
  margin: 0;
  color: var(--ui-ink);
  font-size: 20px;
  font-weight: 550;
  font-variant-numeric: tabular-nums;
  line-height: 1.5;
}
.admin-environment-summary dd span {
  font-size: 14px;
  color: var(--ui-secondary);
  font-weight: 400;
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
  .admin-environment-summary {
    grid-template-columns: 1fr;
    gap: 18px;
  }
  .admin-environment-summary div + div {
    border-left: 0;
    border-top: 1px solid var(--ui-line);
    padding: 16px 0 0;
  }
  .admin-environment-summary dd {
    font-size: 18px;
  }
  .admin-recovery-content {
    padding: 20px;
  }
}
</style>
