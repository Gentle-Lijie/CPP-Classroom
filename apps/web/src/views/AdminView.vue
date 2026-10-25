<script setup lang="ts">
import { computed, ref, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { Button } from '@/components/ui/button'
import { Server, Database, ShieldCheck, ArrowUpRight, RefreshCw } from '@lucide/vue'
import ContentPanel from '@/components/classroom/ContentPanel.vue'
import { api } from '@/lib/api'
import { notify, reportError, executionSettings } from '@/data/demo'
import Modal from '@/components/classroom/Modal.vue'
const route = useRoute()
const section = computed(() => String(route.params.section ?? 'health'))
interface User {
  id: string
  name: string
  username: string
  role: string
  disabled: boolean
}
const users = ref<User[]>([]),
  tasks = ref<{ id: string; classroom: string; exit: string; created_at: string }[]>([]),
  audit = ref<
    { id: string; event: string; createdAt?: string; created_at: string; details: unknown }[]
  >([]),
  recoveries = ref<{ id: string; username: string }[]>([])
const metrics = ref({ classrooms: 0, online: 0, queued: 0, failed: 0 })
const create = ref(false),
  name = ref(''),
  account = ref(''),
  password = ref(''),
  userRole = ref('teacher'),
  busy = ref(false),
  resetUser = ref(''),
  resetPassword = ref('')
const title = computed(
  () =>
    ({ health: '平台概况', teachers: '账号管理', tasks: '失败任务', backups: '备份与管理记录' })[
      section.value
    ] ?? '平台概况',
)
async function load() {
  try {
    ;[users.value, tasks.value, audit.value, metrics.value, recoveries.value] = await Promise.all([
      api<User[]>('/admin/users'),
      api<typeof tasks.value>('/admin/tasks'),
      api<typeof audit.value>('/admin/audit'),
      api<typeof metrics.value>('/admin/overview'),
      api<typeof recoveries.value>('/admin/recoveries'),
    ])
  } catch (e) {
    reportError(e)
  }
}
onMounted(() => void load())
watch(section, () => void load())
async function addUser() {
  try {
    await api('/admin/users', 'POST', {
      name: name.value,
      username: account.value,
      password: password.value,
      role: userRole.value,
    })
    create.value = false
    password.value = ''
    notify('账号已创建')
    await load()
  } catch (e) {
    reportError(e)
  }
}
async function toggle(u: User) {
  try {
    await api('/admin/users/' + u.id, 'PATCH', { disabled: !u.disabled })
    await load()
  } catch (e) {
    reportError(e)
  }
}
async function reset() {
  try {
    await api('/admin/users/' + resetUser.value, 'PATCH', { password: resetPassword.value })
    resetUser.value = ''
    resetPassword.value = ''
    notify('密码已重设，旧会话已失效')
    await load()
  } catch (e) {
    reportError(e)
  }
}
async function backup() {
  busy.value = true
  try {
    await api('/admin/backup', 'POST', {})
    notify('已生成备份，并在独立临时数据库完成恢复验证')
    await load()
  } catch (e) {
    reportError(e)
  } finally {
    busy.value = false
  }
}
</script>
<template>
  <div class="page-heading">
    <div>
      <div class="heading-meta">平台管理</div>
      <h1>{{ title }}</h1>
      <p>真实服务数据。管理员不默认拥有课堂作品读取权限。</p>
    </div>
    <div class="inline-items">
      <Button variant="outline" @click="load"><RefreshCw :size="15" />刷新</Button
      ><Button v-if="section === 'teachers'" @click="create = true">创建账号</Button>
    </div>
  </div>
  <template v-if="section === 'health'"
    ><div class="stat-grid">
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
    <ContentPanel
      title="服务与执行环境"
      description="统一课堂的编译环境、评测节点和运行资源。"
      :icon="Server"
    >
      <template #actions
        ><Button variant="outline" size="sm" as-child
          ><RouterLink to="/admin/settings">管理配置<ArrowUpRight :size="14" /></RouterLink></Button
      ></template>
      <dl class="admin-environment-summary">
        <div>
          <dt>编译环境</dt>
          <dd>
            GCC 13.3
            <span
              >/ {{ executionSettings.compilerProfile === 'gcc13-cpp20' ? 'C++20' : 'C++17' }}</span
            >
          </dd>
        </div>
        <div>
          <dt>并行任务</dt>
          <dd>{{ executionSettings.executionConcurrency }} <span>个执行槽</span></dd>
        </div>
        <div>
          <dt>执行节点</dt>
          <dd>原生 Linux</dd>
        </div>
      </dl>
      <template #footer
        ><p class="admin-environment-note">
          <ShieldCheck :size="15" />学生代码由独立评测节点运行，业务服务负责课堂数据与任务调度。
        </p></template
      >
    </ContentPanel></template
  >
  <section v-else-if="section === 'teachers'" class="panel">
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
          <tr v-for="u in users" :key="u.id">
            <td>{{ u.name }}</td>
            <td>{{ u.username }}</td>
            <td>{{ { admin: '管理员', teacher: '教师', student: '学生' }[u.role] ?? u.role }}</td>
            <td>{{ u.disabled ? '停用' : '正常' }}</td>
            <td>
              <template v-if="u.role !== 'admin'">
                <Button variant="ghost" @click="toggle(u)">{{
                  u.disabled ? '启用' : '停用'
                }}</Button
                ><Button variant="ghost" @click="resetUser = u.id">重设密码</Button> </template
              ><span v-else class="muted">管理员账号</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <div v-if="recoveries.length" class="admin-recovery-content form-stack">
      <h3>待核实身份的恢复申请</h3>
      <p v-for="r in recoveries" :key="r.id">{{ r.username }} · 核实后在上方重设密码</p>
    </div>
  </section>
  <section v-else-if="section === 'tasks'" class="panel">
    <div class="table-scroll">
      <table>
        <thead>
          <tr>
            <th>任务</th>
            <th>课堂</th>
            <th>原因</th>
            <th>时间</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="t in tasks" :key="t.id">
            <td>{{ t.id }}</td>
            <td>{{ t.classroom }}</td>
            <td>{{ t.exit }}</td>
            <td>{{ new Date(t.created_at).toLocaleString() }}</td>
          </tr>
        </tbody>
      </table>
      <p v-if="!tasks.length" class="empty-state">暂无平台失败任务</p>
    </div>
  </section>
  <template v-else
    ><ContentPanel
      title="数据库备份"
      description="创建备份，并检查它是否可以完整恢复。"
      :icon="Database"
      class="admin-backup-panel"
    >
      <p>备份保存在服务器本地。验证会使用独立的临时数据库，保留当前课堂、账号和作品数据。</p>
      <Button :disabled="busy" @click="backup"
        ><Database :size="15" />{{ busy ? '备份与恢复验证中…' : '创建并验证备份' }}</Button
      >
      <template #footer
        ><p class="admin-environment-note">
          <ShieldCheck :size="15" />完成后可在下方管理记录查看备份结果与校验信息。
        </p></template
      >
    </ContentPanel>
    <section class="panel">
      <div class="panel-heading"><h2>管理与备份记录</h2></div>
      <div v-for="a in audit" :key="a.id" class="audit-item">
        <div>
          <strong>{{ a.event }}</strong>
          <p>{{ new Date(a.created_at).toLocaleString() }}</p>
          <pre>{{ JSON.stringify(a.details, null, 2) }}</pre>
        </div>
      </div>
    </section></template
  >
  <Modal
    v-model:open="create"
    title="创建平台账号"
    description="密码至少 12 位，请通过可信渠道交付。"
    ><form class="form-stack" @submit.prevent="addUser">
      <label>姓名<input v-model="name" required /></label
      ><label>账号<input v-model="account" required pattern="[a-zA-Z0-9._@-]+" /></label
      ><label
        >身份<select v-model="userRole">
          <option value="teacher">教师</option>
          <option value="student">学生</option>
        </select></label
      ><label
        >初始密码<input
          v-model="password"
          type="password"
          required
          minlength="12"
          autocomplete="new-password" /></label
      ><Button type="submit">创建真实账号</Button>
    </form></Modal
  >
  <Modal :open="!!resetUser" title="重设账号密码" @update:open="!$event && (resetUser = '')"
    ><form class="form-stack" @submit.prevent="reset">
      <label
        >新密码<input
          v-model="resetPassword"
          required
          minlength="12"
          type="password"
          autocomplete="new-password" /></label
      ><Button type="submit">保存并撤销旧会话</Button>
    </form></Modal
  >
</template>

<style scoped>
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
  font-size: 12px;
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
  font-size: 12px;
  color: var(--ui-secondary);
  font-weight: 400;
}
.admin-environment-note {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 11px;
  color: var(--ui-muted);
  line-height: 1.8;
}
.admin-environment-note svg {
  flex-shrink: 0;
  margin-top: 2px;
  color: var(--ui-icon-slate);
}
.admin-backup-panel {
  margin-bottom: 24px;
}
.admin-recovery-content {
  padding: 24px;
  border-top: 1px solid var(--ui-line);
}
.admin-recovery-content h3 {
  font-size: 14px;
  font-weight: 600;
}
.admin-recovery-content p {
  font-size: 12px;
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
