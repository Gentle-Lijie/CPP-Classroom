<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount, watch } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import {
  Search,
  UserPlus,
  Upload,
  Download,
  UserMinus,
  Check,
  Users,
  KeyRound,
  FileDown,
  RefreshCw,
} from '@lucide/vue'
import { Button } from '@/components/ui/button'
import Modal from '@/components/classroom/Modal.vue'
import CredentialDialog from '@/components/classroom/CredentialDialog.vue'
import Pagination from '@/components/classroom/Pagination.vue'
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
import { csvDocument, parseRoster } from '@/lib/csv'
interface Member {
  id: string
  name: string
  number: string
  username: string
  membership: string
  disabled: boolean
  canResetPassword: boolean
}
interface Credential {
  id: string
  name: string
  number: string
  username: string
  password?: string
  generatedAt?: string
}
const search = ref(''),
  tab = ref('全部成员'),
  add = ref(false),
  name = ref(''),
  number = ref('')
const remove = ref<Member>(),
  importing = ref(false),
  csv = ref(''),
  busy = ref(false),
  error = ref('')
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
const visible = computed(() => {
  const query = search.value.trim().toLowerCase()
  return (
    tab.value === '待审批'
      ? pending.value
      : tab.value === '已移除'
        ? removed.value
        : active.value.filter(
            (m) => tab.value !== '在线成员' || students.find((s) => s.id === m.id)?.online,
          )
  ).filter((m) => `${m.name} ${m.number} ${m.username}`.toLowerCase().includes(query))
})
const { page, pageSize, paged } = usePagination(visible, [search, tab])
const selectablePage = computed(() =>
  paged.value.filter((m) => m.canResetPassword && m.membership === 'active'),
)
const allPageSelected = computed(
  () =>
    !!selectablePage.value.length &&
    selectablePage.value.every((m) => selected.value.includes(m.id)),
)
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
    selected.value = selected.value.filter((id) =>
      result.some((m) => m.id === id && m.membership === 'active' && m.canResetPassword),
    )
  } catch (e) {
    if (id === demo.classroomId && token === generation)
      loadError.value = e instanceof Error ? e.message : '名册加载失败'
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
  generation++
  if (poll) clearInterval(poll)
})
watch(
  () => demo.classroomId,
  () => void loadMembers(),
)
onBeforeRouteLeave(() => {
  if (!busy.value) return true
  notify('正在处理名册，请等待完成后离开', 'error')
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
      notify('凭据暂存失败，请返回原课堂核对交付', 'error')
    }
  }
}
async function addMember(n: string, no: string, classId: string) {
  const result = await api<Credential & { created: boolean }>(
    `/classes/${classId}/members`,
    'POST',
    { name: n, number: no },
  )
  keepCredentials([result], classId)
  return result
}
async function reloadAfterWrite(classId: string) {
  if (demo.classroomId !== classId) return
  try {
    await refresh()
  } catch {
    notify('操作已成功，课堂统计刷新失败，可手动刷新名册', 'error')
  }
  await loadMembers(true)
}
async function save() {
  if (busy.value) return
  const classId = demo.classroomId
  error.value = ''
  busy.value = true
  try {
    const result = await addMember(name.value.trim(), number.value.trim(), classId)
    add.value = false
    name.value = ''
    number.value = ''
    if (result.password && demo.classroomId === classId) credentialsOpen.value = true
    notify(
      result.password ? '学生已添加，可复制或导出登录凭据' : '该学生已加入课堂，原账号密码保持不变',
    )
    await reloadAfterWrite(classId)
  } catch (e) {
    error.value = e instanceof Error ? e.message : '添加失败'
  } finally {
    busy.value = false
  }
}
async function decide(id: string, status: string) {
  if (busy.value) return
  const classId = demo.classroomId,
    wasRemoved = members.value.find((m) => m.id === id)?.membership === 'removed'
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
          ? '已恢复成员课堂访问'
          : '已批准加入'
        : '已拒绝申请，学生可重新申请',
    )
    await reloadAfterWrite(classId)
  } catch (e) {
    error.value = e instanceof Error ? e.message : '审批失败'
  } finally {
    busy.value = false
  }
}
async function importRows() {
  if (busy.value) return
  error.value = ''
  let rows: { name: string; number: string }[]
  try {
    rows = parseRoster(csv.value)
  } catch (e) {
    error.value = (e as Error).message
    return
  }
  const classId = demo.classroomId
  busy.value = true
  importResults.value = []
  try {
    for (const row of rows) {
      try {
        const result = await addMember(row.name, row.number, classId)
        importResults.value.push({ ...row, created: result.created })
      } catch (e) {
        importResults.value.push({ ...row, error: (e as Error).message })
      }
    }
    const failed = importResults.value.filter((r) => r.error)
    csv.value = failed
      .map((r) => [r.name, r.number].map((s) => '"' + s.replaceAll('"', '""') + '"').join(','))
      .join('\n')
    if (failed.length)
      error.value = `成功 ${rows.length - failed.length} 位，失败 ${failed.length} 位。已保留失败行，可导出成功账号后重试。`
    else {
      notify(`已处理 ${rows.length} 位学生，请导出新建账号凭据交付`)
    }
    await reloadAfterWrite(classId)
  } finally {
    busy.value = false
  }
}
async function readFile(event: Event) {
  const input = event.target as HTMLInputElement,
    file = input.files?.[0]
  try {
    if (!file) return
    if (file.size > 1024 * 1024) throw new Error('文件超过 1 MiB，请分批导入')
    csv.value = await file.text()
    error.value = ''
    importResults.value = []
  } catch (e) {
    error.value = e instanceof Error ? e.message : '无法读取文件，请重选或粘贴名单'
  } finally {
    input.value = ''
  }
}
function exportRoster() {
  download(
    `${activeClassroom.value.name}-名册.csv`,
    csvDocument([
      ['姓名', '学号', '登录账号', '账号状态', '在线状态'],
      ...active.value.map((m) => [
        m.name,
        m.number,
        m.username,
        m.disabled ? '已停用' : '正常',
        students.find((s) => s.id === m.id)?.online ? '在线' : '离线',
      ]),
    ]),
    'text/csv;charset=utf-8',
  )
}
function exportCredentials() {
  download(
    `${activeClassroom.value.name}-登录凭据.csv`,
    csvDocument([
      ['姓名', '学号', '登录账号', '密码', '生成时间', '登录地址'],
      ...credentials.value.map((c) => [
        c.name,
        c.number,
        c.username,
        c.password ?? '',
        c.generatedAt ?? '时间未知',
        location.origin + '/login',
      ]),
    ]),
    'text/csv;charset=utf-8',
  )
  notify('已发起账号密码表下载，请确认文件已保存')
}

function openReset(ids: string[]) {
  if (busy.value) return
  resetTargets.value = [...ids]
  error.value = ''
  resetting.value = true
}
async function resetPasswords() {
  if (busy.value) return
  const classId = demo.classroomId,
    ids = [...resetTargets.value]
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
    notify(`已重置 ${ids.length} 位学生的密码，请导出并交付`)
    selected.value = []
    await reloadAfterWrite(classId)
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    busy.value = false
  }
}
async function removeStudent() {
  if (busy.value || !remove.value) return
  const classId = demo.classroomId,
    target = remove.value
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
    notify(`${target.name} 已移除，历史作品保留`)
    await reloadAfterWrite(classId)
  } catch (e) {
    error.value = e instanceof Error ? e.message : '移除失败'
  } finally {
    busy.value = false
  }
}
function openAdd() {
  if (busy.value) return
  error.value = ''
  add.value = true
}
function openImport() {
  if (busy.value) return
  error.value = ''
  importResults.value = []
  importing.value = true
}
</script>
<template>
  <div class="page-heading">
    <div>
      <div class="heading-meta">课堂管理</div>
      <h1>
        学生名册 <span class="heading-count">{{ active.length }}</span>
      </h1>
      <p>添加或导入学生，导出账号密码，处理入班申请。</p>
    </div>
    <div class="heading-actions">
      <Button variant="outline" @click="openImport"><Upload />导入名单</Button
      ><Button @click="openAdd"><UserPlus />添加学生</Button>
    </div>
  </div>
  <div class="credential-banner">
    <KeyRound :size="21" />
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
    <Button v-if="credentials.length" variant="outline" @click="credentialsOpen = true"
      >查看 / 导出凭据</Button
    >
  </div>
  <p v-if="loadError" class="error-box" role="alert">
    {{ loadError }} <button class="text-button" @click="loadMembers()">重试</button>
  </p>
  <p v-if="error && !add && !importing && !resetting && !remove" class="error-box" role="alert">
    {{ error }}
  </p>
  <section class="panel">
    <div class="panel-heading">
      <div class="filter-tabs borderless">
        <button
          v-for="t in ['全部成员', '在线成员', '待审批', '已移除']"
          :key="t"
          :class="{ selected: tab === t }"
          @click="tab = t"
        >
          {{ t
          }}<span>{{
            t === '已移除'
              ? removed.length
              : t === '待审批'
                ? pending.length
                : t === '在线成员'
                  ? students.filter((s) => s.online).length
                  : active.length
          }}</span>
        </button>
      </div>
      <div class="inline-items">
        <span class="muted text-xs">{{
          loading ? '加载中…' : updatedAt ? '更新于 ' + updatedAt : '尚未加载'
        }}</span
        ><Button variant="outline" size="sm" :disabled="loading || busy" @click="loadMembers()"
          ><RefreshCw />刷新</Button
        ><Button
          variant="outline"
          size="sm"
          :disabled="loading || !!loadError"
          @click="exportRoster"
          ><Download />导出名册</Button
        >
      </div>
    </div>
    <div class="table-controls">
      <label class="search-field"
        ><Search :size="16" /><input
          v-model="search"
          placeholder="搜索姓名、学号或账号…"
          aria-label="搜索名册"
      /></label>
      <div v-if="selected.length && tab !== '待审批' && tab !== '已移除'" class="inline-items">
        <span class="muted">已选 {{ selected.length }} 位</span
        ><Button size="sm" variant="warning" @click="openReset(selected)"
          ><KeyRound />重置并生成凭据</Button
        ><button class="text-button" @click="selected = []">取消选择</button>
      </div>
      <span v-else class="muted text-xs">{{
        tab === '待审批'
          ? '批准后学生即可访问课堂'
          : tab === '已移除'
            ? '恢复成员可保留原账号与历史作品'
            : '仅账号创建教师可重置密码；其他账号请联系管理员'
      }}</span>
    </div>
    <div class="table-scroll">
      <table class="roster-table">
        <thead>
          <tr>
            <th v-if="tab !== '待审批' && tab !== '已移除'">
              <input
                type="checkbox"
                aria-label="选择本页学生"
                :disabled="busy || !selectablePage.length"
                :checked="allPageSelected"
                @change="selectPage"
              />
            </th>
            <th>学生</th>
            <th>学号</th>
            <th>登录账号</th>
            <th>{{ tab === '待审批' || tab === '已移除' ? '成员状态' : '在线状态' }}</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="m in paged" :key="m.id">
            <td v-if="tab !== '待审批' && tab !== '已移除'">
              <input
                v-model="selected"
                :disabled="busy || !m.canResetPassword"
                type="checkbox"
                :value="m.id"
                :aria-label="'选择' + m.name"
              />
            </td>
            <td>
              <div class="person-cell">
                <span class="student-avatar">{{ m.name.slice(-2) }}</span
                ><strong>{{ m.name }}</strong>
              </div>
            </td>
            <td>{{ m.number }}</td>
            <td class="roster-account">{{ m.username }}</td>
            <td>
              <span v-if="tab === '已移除'" class="status neutral">已移除</span
              ><span v-else-if="tab === '待审批'" class="status amber">待审批</span
              ><span v-else class="inline-items"
                ><i
                  class="presence"
                  :class="{ online: students.find((s) => s.id === m.id)?.online }"
                />{{
                  m.disabled
                    ? '账号已停用'
                    : students.find((s) => s.id === m.id)?.online
                      ? '在线'
                      : '离线'
                }}</span
              >
            </td>
            <td>
              <div v-if="tab === '待审批'" class="inline-items">
                <Button size="sm" variant="success" :disabled="busy" @click="decide(m.id, 'active')"
                  ><Check />批准</Button
                ><Button
                  size="sm"
                  variant="outline"
                  :disabled="busy"
                  @click="decide(m.id, 'removed')"
                  >拒绝</Button
                >
              </div>
              <div v-else-if="tab === '已移除'" class="inline-items">
                <Button
                  size="sm"
                  variant="outline"
                  :disabled="busy || m.disabled"
                  @click="decide(m.id, 'active')"
                  >恢复课堂访问</Button
                ><span v-if="m.disabled" class="muted text-xs">账号已停用，请联系管理员</span>
              </div>
              <div v-else class="inline-items">
                <button
                  v-if="m.canResetPassword"
                  class="text-button"
                  :disabled="busy"
                  @click="openReset([m.id])"
                >
                  <KeyRound :size="14" />重置密码</button
                ><span v-else class="muted text-xs">{{
                  m.disabled ? '联系管理员启用' : '密码由管理员或创建教师恢复'
                }}</span
                ><button
                  class="text-button danger-text"
                  :disabled="busy"
                  @click="
                    () => {
                      error = ''
                      remove = m
                    }
                  "
                >
                  <UserMinus :size="14" />移除
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-if="!visible.length && !loading && !loadError" class="empty-state">
        <Users :size="30" />
        <h3>
          {{ search ? '没有匹配的成员' : tab === '待审批' ? '没有待处理的申请' : '还没有学生' }}
        </h3>
        <p>
          {{ search ? '尝试其他姓名、学号或账号。' : '可以添加学生、导入名单，或分享课堂邀请。' }}
        </p>
        <Button v-if="!search && tab !== '待审批' && tab !== '已移除'" @click="openAdd"
          >添加第一位学生</Button
        >
      </div>
    </div>
    <Pagination
      v-model:page="page"
      v-model:page-size="pageSize"
      :total="visible.length"
      unit="位学生"
    />
  </section>
  <Modal
    v-model:open="add"
    :dismissible="!busy"
    title="添加学生"
    description="学号对应唯一学生账号。已有账号加入课堂时保留原密码。"
    ><form class="form-stack" @submit.prevent="save">
      <label>学生姓名<input v-model="name" required maxlength="50" placeholder="真实姓名" /></label
      ><label
        >学号<input
          v-model="number"
          required
          maxlength="50"
          placeholder="例如：2026001（保留前导零）"
      /></label>
      <p v-if="error" class="error-box" role="alert">{{ error }}</p>
      <div class="modal-actions">
        <Button type="button" variant="outline" :disabled="busy" @click="add = false">取消</Button
        ><Button type="submit" :disabled="busy">{{ busy ? '正在添加…' : '添加学生' }}</Button>
      </div>
    </form></Modal
  >
  <Modal
    v-model:open="importing"
    :dismissible="!busy"
    title="导入学生名单"
    description="支持 UTF-8 CSV 文件或直接从 Excel 粘贴姓名、学号两列。可包含表头，每批最多 50 人。"
    ><form class="form-stack" @submit.prevent="importRows">
      <div class="inline-items">
        <Button
          variant="outline"
          type="button"
          @click="
            download(
              '学生名单模板.csv',
              csvDocument([
                ['姓名', '学号'],
                ['张三', '2026001'],
              ]),
              'text/csv;charset=utf-8',
            )
          "
          ><FileDown />下载模板</Button
        ><label class="file-upload"
          >选择 CSV 文件<input
            type="file"
            accept=".csv,.tsv,.txt"
            :disabled="busy"
            @change="readFile"
        /></label>
      </div>
      <label
        >名单内容<textarea
          v-model="csv"
          :disabled="busy"
          rows="7"
          required
          placeholder="姓名,学号&#10;刘亦安,2026013&#10;方可欣,2026014"
        />
      </label>
      <p v-if="error" class="error-box" role="alert">{{ error }}</p>
      <div v-if="importResults.length" class="import-results">
        <p
          v-for="(r, i) in importResults"
          :key="i"
          :class="r.error ? 'danger-text' : 'positive-text'"
        >
          {{ r.name }} · {{ r.number }}：{{
            r.error ?? (r.created ? '已新建，可导出凭据' : '已有账号已加入，原密码不变')
          }}
        </p>
      </div>
      <Button v-if="credentials.length" type="button" variant="outline" @click="exportCredentials"
        ><Download />导出已成功账号凭据</Button
      >
      <p class="form-hint">
        已有账号不会修改密码。部分失败时保留成功结果与凭据，重试只处理失败行。
      </p>
      <div class="modal-actions">
        <Button type="button" variant="outline" :disabled="busy" @click="importing = false"
          >关闭</Button
        ><Button type="submit" :disabled="busy || !csv.trim()"
          ><Upload />{{ busy ? `导入中，已处理 ${importResults.length} 位…` : '导入名单' }}</Button
        >
      </div>
    </form></Modal
  >
  <CredentialDialog
    v-model:open="credentialsOpen"
    :credentials="credentials"
    @export="exportCredentials"
    @clear="credentials = []"
  />
  <Modal
    v-model:open="resetting"
    :dismissible="!busy"
    title="重置所选学生的密码？"
    :description="`将为 ${resetTargets.length} 位学生生成新密码。该账号在所有课堂使用的新密码都会改变，旧登录会话失效，正在执行的程序会停止。`"
    ><p class="warning-box">请确认学生已保存学习进度。重置成功后可复制、下载新凭据。</p>
    <p v-if="error" class="error-box" role="alert">{{ error }}</p>
    <div class="modal-actions">
      <Button variant="outline" :disabled="busy" @click="resetting = false">取消</Button
      ><Button variant="warning" :disabled="busy || !resetTargets.length" @click="resetPasswords"
        ><KeyRound />{{ busy ? '正在重置…' : '确认重置并生成凭据' }}</Button
      >
    </div></Modal
  >
  <Modal
    :open="!!remove"
    :dismissible="!busy"
    :title="`移除 ${remove?.name ?? '这位学生'}？`"
    description="撤销该学生的课堂访问权限，保留历史作品。不删除账号或其他课堂成员关系。"
    @update:open="!$event && (remove = undefined)"
    ><p v-if="error" class="error-box" role="alert">{{ error }}</p>
    <div class="modal-actions">
      <Button variant="outline" :disabled="busy" @click="remove = undefined">取消</Button
      ><Button variant="destructive" :disabled="busy" @click="removeStudent">{{
        busy ? '正在移除…' : '确认移除'
      }}</Button>
    </div></Modal
  >
</template>
<style scoped>
.roster-table .roster-account {
  min-width: 200px;
  max-width: 220px;
  white-space: normal;
  overflow-wrap: anywhere;
}

.credential-banner {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 18px 20px;
  margin-bottom: 24px;
  border: 1px solid var(--ui-blue-line);
  border-radius: 8px;
  background: var(--ui-selection);
  color: var(--ui-action);
}
.credential-banner > div {
  flex: 1;
  min-width: 0;
}
.credential-banner p {
  font-size: 13px;
  color: var(--ui-secondary);
  margin-top: 3px;
}
.credential-banner > svg {
  flex-shrink: 0;
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
  font-size: 13px;
}
.file-upload {
  font-size: 13px;
  color: var(--ui-text);
  flex: 1;
  min-width: 0;
}
.file-upload input {
  width: 100%;
  padding: 5px;
  margin-top: 5px;
  font-size: 12px;
}
@media (max-width: 760px) {
  .credential-banner {
    flex-wrap: wrap;
  }
  .credential-banner > div {
    flex-basis: calc(100% - 40px);
  }
}
</style>
