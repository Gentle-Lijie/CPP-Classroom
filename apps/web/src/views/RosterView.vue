<script setup lang="ts">
import { computed, ref } from 'vue'
import { Search, UserPlus, Upload, Download, UserMinus, Check, Users, Clock3 } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import Modal from '@/components/classroom/Modal.vue'
import { students, notify, download } from '@/data/demo'
const search = ref('')
const tab = ref('全部成员')
const add = ref(false)
const name = ref('')
const number = ref('')
const remove = ref('')
const importing = ref(false)
const csv = ref('')
const pending = ref([
  { id: 'p01', name: '刘亦安', number: '2026013' },
  { id: 'p02', name: '方可欣', number: '2026014' },
])
const visible = computed(() =>
  students.filter(
    (s) => `${s.name}${s.number}`.includes(search.value) && (tab.value !== '在线成员' || s.online),
  ),
)
function addMember(n: string, no: string) {
  if (students.some((s) => s.number === no)) {
    notify('学号重复，请核对成员')
    return false
  }
  students.push({
    id: 's' + Date.now() + no,
    name: n,
    number: no,
    online: false,
    status: '编写中',
    help: false,
    submitted: false,
    activity: '尚未访问',
    summary: '尚未运行',
  })
  return true
}
function save() {
  if (addMember(name.value.trim(), number.value.trim())) {
    add.value = false
    name.value = ''
    number.value = ''
    notify('演示成员已添加')
  }
}
function approve(id: string) {
  const member = pending.value.find((p) => p.id === id)!
  addMember(member.name, member.number)
  pending.value = pending.value.filter((p) => p.id !== id)
  notify('已批准本次演示入班申请')
}
function importRows() {
  const rows = csv.value
    .trim()
    .split('\n')
    .map((row) => row.split(',').map((v) => v.trim()))
  if (rows.some((r) => r.length !== 2 || !r[0] || !r[1])) {
    notify('请按每行“姓名,学号”填写')
    return
  }
  let count = 0
  rows.forEach((r) => {
    if (addMember(r[0]!, r[1]!)) count++
  })
  importing.value = false
  notify(`已导入 ${count} 位演示成员`)
}
function exportRoster() {
  download(
    '课堂名册-示例.csv',
    '\uFEFF姓名,学号,在线状态\n' +
      students.map((s) => `${s.name},${s.number},${s.online ? '在线' : '离线'}`).join('\n'),
    'text/csv;charset=utf-8',
  )
}
function removeStudent() {
  const index = students.findIndex((s) => s.id === remove.value)
  if (index >= 0) students.splice(index, 1)
  remove.value = ''
  notify('已从演示名册移除')
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
              <span class="inline-items muted"><Clock3 :size="14" />今天 14:15</span>
            </td>
            <td>
              <div class="inline-items">
                <Button size="sm" @click="approve(p.id)">批准加入</Button
                ><Button
                  size="sm"
                  variant="ghost"
                  @click="
                    () => {
                      pending = pending.filter((x) => x.id !== p.id)
                      notify('已拒绝此演示申请')
                    }
                  "
                  >拒绝</Button
                >
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
      共 {{ tab === '待审批' ? pending.length : visible.length }} 位学生<span
        >名册示例 · 未连接身份服务</span
      >
    </div>
  </section>
  <Modal v-model:open="add" title="添加学生" description="此处仅创建演示名册记录，不创建真实账号。"
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
    description="将撤销该成员后续课堂访问权限。历史作品保留，此原型仅更新本地列表。"
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
