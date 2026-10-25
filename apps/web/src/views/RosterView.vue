<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { Search, UserPlus, Upload, Download, UserMinus, Check, Users, Clock3 } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import Modal from '@/components/classroom/Modal.vue'
import ContentPanel from '@/components/classroom/ContentPanel.vue'
import { students, notify, download, classPath, refresh, reportError } from '@/data/demo'
import { api } from '@/lib/api'
const search = ref('')
const tab = ref('全部成员')
const add = ref(false)
const name = ref('')
const number = ref('')
const remove = ref('')
const importing = ref(false)
const csv = ref('')
const pending = ref<{ id: string; name: string; number: string }[]>([])
const credentials = ref<{ username: string; password?: string }[]>([])
async function loadPending() {
  const members = await api<{ id: string; name: string; number: string; membership: string }[]>(
    classPath('/members'),
  )
  pending.value = members.filter((m) => m.membership === 'pending')
}
onMounted(() => void loadPending().catch(reportError))
const visible = computed(() =>
  students.filter(
    (s) => `${s.name}${s.number}`.includes(search.value) && (tab.value !== '在线成员' || s.online),
  ),
)
async function addMember(n: string, no: string) {
  const result = await api<{ username: string; password?: string }>(classPath('/members'), 'POST', {
    name: n,
    number: no,
  })
  credentials.value.push(result)
  await refresh()
}
async function save() {
  try {
    await addMember(name.value.trim(), number.value.trim())
    add.value = false
    name.value = ''
    number.value = ''
    notify('学生账号已创建，请保存下方初始密码')
  } catch (e) {
    reportError(e)
  }
}
async function approve(id: string) {
  try {
    await api(classPath('/members/' + id), 'PATCH', { status: 'active' })
    await loadPending()
    await refresh()
    notify('已批准加入')
  } catch (e) {
    reportError(e)
  }
}
async function reject(id: string) {
  try {
    await api(classPath('/members/' + id), 'PATCH', { status: 'removed' })
    await loadPending()
    notify('已拒绝申请')
  } catch (e) {
    reportError(e)
  }
}
async function importRows() {
  const rows = csv.value
    .trim()
    .split('\n')
    .map((r) => r.split(',').map((v) => v.trim()))
  if (rows.some((r) => r.length !== 2 || !r[0] || !r[1])) {
    notify('请按每行姓名,学号填写')
    return
  }
  try {
    for (const r of rows) await addMember(r[0]!, r[1]!)
    importing.value = false
    notify('已导入，请保存初始凭据')
  } catch (e) {
    reportError(e)
  }
}
function exportRoster() {
  const quote = (s: string) => '"' + s.replaceAll('"', '""') + '"'
  download(
    '课堂名册.csv',
    '\uFEFF姓名,学号,在线状态\n' +
      students
        .map((s) => [s.name, s.number, s.online ? '在线' : '离线'].map(quote).join(','))
        .join('\n'),
    'text/csv;charset=utf-8',
  )
}
async function removeStudent() {
  try {
    await api(classPath('/members/' + remove.value), 'PATCH', { status: 'removed' })
    await refresh()
    remove.value = ''
    notify('成员已移除，历史作品保留')
  } catch (e) {
    reportError(e)
  }
}
</script>
<template>
  <div class="page-heading">
    <div>
      <div class="heading-meta">课堂成员</div>
      <h1>每一位同学，都在这里。</h1>
      <p>管理名册与入班申请，作品始终关联学生的稳定身份。</p>
    </div>
    <div class="heading-actions">
      <Button variant="outline" @click="importing = true"><Upload />导入名单</Button
      ><Button @click="add = true"><UserPlus />添加学生</Button>
    </div>
  </div>
  <ContentPanel
    v-if="credentials.length"
    title="新建账号凭据"
    description="初始密码仅在本次显示，请保存后再关闭。"
    class="roster-credentials"
  >
    <p v-for="item in credentials" :key="item.username">
      {{ item.username }} · {{ item.password ?? '账号已存在，密码未修改' }}
    </p>
    <Button @click="credentials = []">我已保存，关闭显示</Button>
  </ContentPanel>
  <section class="panel">
    <div class="panel-heading">
      <div class="filter-tabs borderless">
        <button
          v-for="t in ['全部成员', '在线成员', '待审批']"
          :key="t"
          :class="{ selected: tab === t }"
          @click="tab = t"
        >
          {{ t
          }}<span>{{
            t === '待审批'
              ? pending.length
              : t === '在线成员'
                ? students.filter((s) => s.online).length
                : students.length
          }}</span>
        </button>
      </div>
      <Button variant="ghost" size="sm" @click="exportRoster"><Download />导出名册</Button>
    </div>
    <div class="table-controls">
      <label class="search-field"
        ><Search :size="16" /><input
          v-model="search"
          placeholder="搜索姓名或学号…"
          aria-label="搜索名册" /></label
      ><span class="muted text-xs">{{
        tab === '待审批' ? '批准后，学生即可访问课堂' : '移除成员不会删除其历史作品'
      }}</span>
    </div>
    <div class="table-scroll">
      <table v-if="tab !== '待审批'">
        <thead>
          <tr>
            <th>学生</th>
            <th>学号</th>
            <th>入班状态</th>
            <th>在线状态</th>
            <th>最后活动</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="s in visible" :key="s.id">
            <td>
              <div class="person-cell">
                <span class="student-avatar">{{ s.name.slice(-2) }}</span
                ><strong>{{ s.name }}</strong>
              </div>
            </td>
            <td>{{ s.number }}</td>
            <td>
              <span class="inline-items positive-text"><Check :size="14" />已加入</span>
            </td>
            <td>
              <span class="inline-items"
                ><i class="presence" :class="{ online: s.online }" />{{
                  s.online ? '在线' : '离线'
                }}</span
              >
            </td>
            <td class="muted">{{ s.activity }}</td>
            <td>
              <button class="text-button danger-text" @click="remove = s.id">
                <UserMinus :size="14" />移除
              </button>
            </td>
          </tr>
        </tbody>
      </table>
      <table v-else>
        <thead>
          <tr>
            <th>申请人</th>
            <th>学号</th>
            <th>申请时间</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="p in pending.filter((p) => `${p.name}${p.number}`.includes(search))"
            :key="p.id"
          >
            <td>
              <div class="person-cell">
                <span class="student-avatar">{{ p.name.slice(-2) }}</span
                ><strong>{{ p.name }}</strong>
              </div>
            </td>
            <td>{{ p.number }}</td>
            <td>
              <span class="inline-items muted"><Clock3 :size="14" />等待审批</span>
            </td>
            <td>
              <div class="inline-items">
                <Button size="sm" @click="approve(p.id)">批准加入</Button
                ><Button size="sm" variant="ghost" @click="reject(p.id)">拒绝</Button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
      <div
        v-if="(tab === '待审批' && !pending.length) || (tab !== '待审批' && !visible.length)"
        class="empty-state"
      >
        <Users :size="30" />
        <h3>{{ tab === '待审批' ? '没有待处理的申请' : '没有匹配的成员' }}</h3>
        <p>新申请会显示在这里。</p>
      </div>
    </div>
    <div class="table-footer">
      共 {{ tab === '待审批' ? pending.length : visible.length }} 位学生<span>服务器名册</span>
    </div>
  </section>
  <Modal
    v-model:open="add"
    title="添加学生"
    description="创建真实学生账号；初始密码仅显示一次，请妥善交付。"
    ><form class="form-stack" @submit.prevent="save">
      <label>学生姓名<input v-model="name" required maxlength="20" placeholder="真实姓名" /></label
      ><label>学号<input v-model="number" required maxlength="30" placeholder="唯一学号" /></label>
      <div class="modal-actions">
        <Button type="button" variant="outline" @click="add = false">取消</Button
        ><Button type="submit">添加成员</Button>
      </div>
    </form></Modal
  >
  <Modal
    :open="!!remove"
    title="移除这位学生？"
    description="将撤销该成员后续课堂访问权限。历史作品保留，后续请求立即失去访问权限。"
    @update:open="!$event && (remove = '')"
    ><div class="modal-actions">
      <Button variant="outline" @click="remove = ''">取消</Button
      ><Button variant="destructive" @click="removeStudent">确认移除</Button>
    </div></Modal
  >
  <Modal
    v-model:open="importing"
    title="导入学生名单"
    description="每行填写一位学生：姓名,学号。重复学号不会重复添加。"
    ><form class="form-stack" @submit.prevent="importRows">
      <label
        >名单内容<textarea
          v-model="csv"
          rows="7"
          required
          placeholder="刘亦安,2026013&#10;方可欣,2026014"
        />
      </label>
      <div class="modal-actions">
        <Button type="button" variant="outline" @click="importing = false">取消</Button
        ><Button type="submit"><Upload />导入名单</Button>
      </div>
    </form></Modal
  >
</template>

<style scoped>
.roster-credentials {
  margin-bottom: 24px;
}
</style>
