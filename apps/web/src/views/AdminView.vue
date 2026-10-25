<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import {
  Server,
  Database,
  Activity,
  Check,
  CircleAlert,
  RefreshCw,
  Plus,
  Search,
  Download,
  ShieldCheck,
  ArrowRight,
} from '@lucide/vue'
import { Button } from '@/components/ui/button'
import Modal from '@/components/classroom/Modal.vue'
import { notify, download } from '@/data/demo'
const route = useRoute()
const section = computed(() => route.params.section ?? 'health')
const search = ref('')
const create = ref(false)
const teacherName = ref('')
const account = ref('')
const details = ref(false)
const teachers = reactive([
  { name: '周老师', account: 'zhou.teacher', classrooms: 3, status: '正常' },
  { name: '林老师', account: 'lin.teacher', classrooms: 1, status: '正常' },
  { name: '王老师', account: 'wang.teacher', classrooms: 0, status: '停用' },
])
const tasks = [
  {
    id: 'DEMO-RUN-1046',
    classroom: 'C++ 基础 · 秋季一班',
    reason: '执行节点不可用',
    time: '今天 14:21',
    kind: '平台执行失败',
  },
  {
    id: 'DEMO-RUN-1031',
    classroom: '算法入门 · 周末班',
    reason: '等待执行槽位超时',
    time: '今天 13:58',
    kind: '平台执行失败',
  },
]
const title = computed(
  () =>
    ({
      health: '平台概况',
      teachers: '教师账号',
      tasks: '失败任务查询',
      backups: '备份与管理记录',
    })[String(section.value)] ?? '平台概况',
)
function addTeacher() {
  if (teachers.some((t) => t.account === account.value)) {
    notify('该演示账号已存在')
    return
  }
  teachers.push({ name: teacherName.value, account: account.value, classrooms: 0, status: '正常' })
  create.value = false
  notify('已添加演示教师记录，未创建真实登录凭据')
}
</script>
<template>
  <div class="page-heading">
    <div>
      <div class="heading-meta">平台管理 · 演示视图</div>
      <h1>{{ title }}</h1>
      <p>仅展示必要运维信息，所有指标均为设计示例，未读取真实服务状态。</p>
    </div>
    <Button v-if="section === 'teachers'" @click="create = true"><Plus />添加教师</Button
    ><Button v-else variant="outline" @click="notify('已刷新示例视图，未查询真实服务')"
      ><RefreshCw />刷新视图</Button
    >
  </div>
  <template v-if="section === 'health'"
    ><div class="admin-banner">
      <ShieldCheck :size="22" />
      <div>
        <strong>运维概况示例</strong>
        <p>服务探活可在平台配置查看；课堂指标、容量与备份记录仍为示例。</p>
      </div>
      <span class="demo-tag ml-auto">示例数据</span>
    </div>
    <div class="stat-grid">
      <div
        v-for="s in [
          { label: '开放课堂', value: '2', unit: '间', icon: Activity },
          { label: '在线学生', value: '10', unit: '人', icon: Server },
          { label: '排队任务', value: '0', unit: '个', icon: Database },
          { label: '平台失败', value: '2', unit: '次', icon: CircleAlert },
        ]"
        :key="s.label"
        class="stat-card"
      >
        <div class="stat-top">{{ s.label }}<component :is="s.icon" :size="19" class="muted" /></div>
        <div class="stat-number">
          {{ s.value }}<span>{{ s.unit }}</span>
        </div>
        <div class="stat-foot">本次演示的静态示例</div>
      </div>
    </div>
    <section class="panel">
      <div class="panel-heading">
        <h2>服务与执行节点</h2>
        <span class="muted text-xs">状态示例，非健康检查结果</span>
      </div>
      <div class="service-grid">
        <article
          v-for="s in [
            { name: '业务 API', sub: '身份与课堂业务', status: '待接入' },
            { name: 'PostgreSQL', sub: '课堂数据与任务队列', status: '待接入' },
            { name: '原生 Linux 执行节点', sub: 'go-judge · 独立执行环境', status: '待验证' },
          ]"
          :key="s.name"
        >
          <Server :size="24" />
          <h3>{{ s.name }}</h3>
          <p>{{ s.sub }}</p>
          <span class="status neutral">{{ s.status }}</span>
        </article>
      </div>
    </section>
    <div class="admin-links">
      <RouterLink to="/admin/settings">平台配置与服务探活 <ArrowRight :size="16" /></RouterLink>
      <RouterLink to="/admin/tasks">查看失败任务 <ArrowRight :size="16" /></RouterLink
      ><RouterLink to="/admin/backups">备份与恢复记录 <ArrowRight :size="16" /></RouterLink></div
  ></template>
  <section v-else-if="section === 'teachers'" class="panel">
    <div class="table-controls">
      <label class="search-field"
        ><Search :size="16" /><input
          v-model="search"
          aria-label="搜索教师"
          placeholder="搜索姓名或账号…"
      /></label>
    </div>
    <div class="table-scroll">
      <table>
        <thead>
          <tr>
            <th>教师</th>
            <th>平台账号</th>
            <th>负责课堂</th>
            <th>账号状态</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="t in teachers.filter((t) => `${t.name}${t.account}`.includes(search))"
            :key="t.account"
          >
            <td>
              <div class="person-cell">
                <span class="student-avatar">{{ t.name.slice(0, 1) }}</span
                ><strong>{{ t.name }}</strong>
              </div>
            </td>
            <td>{{ t.account }}</td>
            <td>{{ t.classrooms }} 间</td>
            <td>
              <span class="status" :class="t.status === '正常' ? 'positive' : 'neutral'">{{
                t.status
              }}</span>
            </td>
            <td>
              <button
                class="text-button"
                @click="
                  () => {
                    t.status = t.status === '正常' ? '停用' : '正常'
                    notify('演示账号状态已更新')
                  }
                "
              >
                {{ t.status === '正常' ? '停用账号' : '启用账号' }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
  <section v-else-if="section === 'tasks'" class="panel">
    <div class="table-controls">
      <label class="search-field"
        ><Search :size="16" /><input
          v-model="search"
          aria-label="搜索失败任务"
          placeholder="搜索 runId 或课堂…" /></label
      ><span class="muted text-xs">平台失败与学生编译错误分开记录</span>
    </div>
    <div class="table-scroll">
      <table>
        <thead>
          <tr>
            <th>运行任务</th>
            <th>课堂</th>
            <th>失败原因</th>
            <th>时间</th>
            <th />
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="t in tasks.filter((t) => `${t.id}${t.classroom}`.includes(search))"
            :key="t.id"
          >
            <td>
              <strong>{{ t.id }}</strong
              ><small class="cell-secondary">{{ t.kind }}</small>
            </td>
            <td>{{ t.classroom }}</td>
            <td>
              <span class="status red">{{ t.reason }}</span>
            </td>
            <td class="muted">{{ t.time }}</td>
            <td><button class="text-button" @click="details = true">查看记录</button></td>
          </tr>
        </tbody>
      </table>
    </div>
    <div class="table-footer">2 条预置示例<span>节点失败后不自动重跑旧任务</span></div>
  </section>
  <template v-else
    ><div class="admin-banner">
      <Database :size="24" />
      <div>
        <strong>备份策略 · 示例</strong>
        <p>数据库与文件需要一致备份；“任务完成”不等于已经通过恢复验证。</p>
      </div>
    </div>
    <section class="panel">
      <div class="panel-heading">
        <h2>备份记录</h2>
        <Button
          variant="outline"
          size="sm"
          @click="
            () => {
              download(
                '备份记录-示例.json',
                JSON.stringify(
                  { note: '设计示例，非实际备份', status: '待接入', restoreVerification: '未验证' },
                  null,
                  2,
                ),
                'application/json',
              )
            }
          "
          ><Download />导出示例</Button
        >
      </div>
      <div class="backup-state">
        <Database :size="35" />
        <h3>等待连接备份服务</h3>
        <p>正式接入后展示备份时间、范围、结果和最近恢复验证。</p>
        <span class="status amber">恢复能力尚未验证</span>
      </div>
    </section>
    <section class="panel audit-panel">
      <div class="panel-heading">
        <h2>管理记录示例</h2>
        <ShieldCheck :size="18" />
      </div>
      <div
        v-for="a in [
          '周老师发布了练习「累加求和」',
          '管理员更新了课堂配额示例',
          '周老师创建了秋季一班',
        ]"
        :key="a"
        class="audit-item"
      >
        <Check :size="15" /><span>{{ a }}</span
        ><small>今天 · 示例</small>
      </div>
    </section></template
  >
  <Modal
    v-model:open="create"
    title="添加教师账号"
    description="仅创建本次界面演示记录，不生成密码或真实权限。"
    ><form class="form-stack" @submit.prevent="addTeacher">
      <label>姓名<input v-model="teacherName" required maxlength="30" /></label
      ><label
        >平台账号<input
          v-model="account"
          required
          pattern="[a-zA-Z0-9._-]+"
          placeholder="英文、数字、点或下划线"
      /></label>
      <div class="modal-actions">
        <Button type="button" variant="outline" @click="create = false">取消</Button
        ><Button type="submit">添加教师</Button>
      </div>
    </form></Modal
  ><Modal
    v-model:open="details"
    title="平台执行失败 · 示例记录"
    description="此记录用于展示平台失败的诊断信息。"
    ><div class="environment-grid">
      <div><span>任务 ID</span><strong>DEMO-RUN-1046</strong></div>
      <div><span>终态</span><strong>平台执行失败</strong></div>
    </div>
    <pre class="admin-log">
[示例] 执行节点连接中断。未自动重跑。
学生当前草稿与历史快照保持独立。</pre>
    <div class="modal-actions">
      <Button variant="outline" @click="details = false">关闭</Button>
    </div></Modal
  >
</template>
