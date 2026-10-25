<script setup lang="ts">
import { computed, ref, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
import { notify, reportError } from '@/data/demo'
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
      <Button variant="outline" @click="load">刷新</Button
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
    <section class="panel form-stack">
      <h2>服务与执行环境</h2>
      <RouterLink to="/admin/settings">检查 API、数据库和 go-judge 并配置运行限额 →</RouterLink>
      <p>
        GCC 13.3，Linux namespaces / cgroup v2，4 个执行槽。学生代码由独立工作者提交到 AIM-Radar。
      </p>
    </section></template
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
            <td>{{ u.role }}</td>
            <td>{{ u.disabled ? '停用' : '正常' }}</td>
            <td v-if="u.role !== 'admin'">
              <Button variant="ghost" @click="toggle(u)">{{ u.disabled ? '启用' : '停用' }}</Button
              ><Button variant="ghost" @click="resetUser = u.id">重设密码</Button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <div v-if="recoveries.length" class="form-stack">
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
    ><section class="panel form-stack">
      <h2>原生 PostgreSQL 备份</h2>
      <p>
        生成加密访问权限保护的本地 dump 文件，再恢复到独立临时数据库进行校验。现有数据库不会被覆盖。
      </p>
      <Button :disabled="busy" @click="backup">{{
        busy ? '备份与恢复验证中…' : '创建并验证备份'
      }}</Button>
    </section>
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
