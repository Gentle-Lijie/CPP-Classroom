<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import {
  DropdownMenuRoot,
  DropdownMenuTrigger,
  DropdownMenuPortal,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  RadioGroupRoot,
  RadioGroupItem,
  RadioGroupIndicator,
} from 'reka-ui'
import {
  Search,
  UserPlus,
  RefreshCw,
  Ellipsis,
  ShieldCheck,
  Users,
  ChevronRight,
  ArrowLeft,
  Check,
} from '@lucide/vue'
import { classroomRoleLabels, type ClassroomRole } from '@classroom/contracts'
import { api } from '@/lib/api'
import { notify } from '@/data/demo'
import { confirmAction } from '@/lib/confirm'
import { usePagination } from '@/composables/usePagination'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { runMemberBatch, memberBatchMessage, type MemberBatchResult } from '@/lib/member-batch'
import { Alert } from '@/components/ui/alert'
import { Form } from '@/components/ui/form'
import Modal from './Modal.vue'
import ContentPanel from './ContentPanel.vue'
import Pagination from './Pagination.vue'

interface Account {
  id: string
  name: string
  username: string
  number: string
}
interface Assignment extends Account {
  role: ClassroomRole
  status: string
  owner: boolean
  disabled: boolean
}
const props = defineProps<{
  classroomId: string
  accountCreationPath?: string
  staffOnly?: boolean
  showList?: boolean
}>()
const emit = defineEmits<{
  changed: [assignment?: { role: ClassroomRole; status: 'active' | 'removed' }]
  'batch-finished': [succeededIds: string[]]
}>()
const members = ref<Assignment[]>([])
const candidates = ref<Account[]>([])
const filter = ref('all')
const memberSearch = ref('')
const search = ref('')
const accountSearchInput = ref<InstanceType<typeof Input>>()
const target = ref<Account>()
const nextRole = ref<ClassroomRole>('ta')
const dialogOpen = ref(false)
const dialogMode = ref<'add' | 'edit'>('add')
const busy = ref(false)
const loading = ref(false)
const searching = ref(false)
const searched = ref(false)
const error = ref('')
const dialogError = ref('')
const selectedIds = ref<string[]>([])
const editTargets = ref<Assignment[]>([])
const batchError = ref('')
const batchProgress = ref({ completed: 0, total: 0 })
let mounted = true
onBeforeRouteLeave(() => {
  if (!busy.value) return true
  notify('正在更新课堂人员，请等待操作完成后离开', 'error')
  return false
})
let generation = 0
let searchGeneration = 0
let searchTimer: ReturnType<typeof setTimeout> | undefined
let focusFrame = 0
const scopedMembers = computed(() =>
  props.staffOnly ? members.value.filter((m) => m.role !== 'student') : members.value,
)
const active = computed(() => scopedMembers.value.filter((m) => m.status !== 'removed'))
const tabs = computed(() =>
  props.staffOnly
    ? [
        { value: 'all', label: '在任教师与助教', count: active.value.length },
        {
          value: 'removed',
          label: '已移除',
          count: scopedMembers.value.filter((m) => m.status === 'removed').length,
        },
      ]
    : [
        { value: 'all', label: '全部', count: active.value.length },
        {
          value: 'staff',
          label: '教师与助教',
          count: active.value.filter((m) => m.role !== 'student').length,
        },
        {
          value: 'students',
          label: '学生',
          count: active.value.filter((m) => m.role === 'student').length,
        },
        {
          value: 'removed',
          label: '已移除',
          count: scopedMembers.value.filter((m) => m.status === 'removed').length,
        },
      ],
)
const roleOrder: Record<ClassroomRole, number> = { teacher: 0, ta: 1, student: 2 }
const visible = computed(() =>
  scopedMembers.value
    .filter((m) => {
      const matchesTab =
        filter.value === 'removed'
          ? m.status === 'removed'
          : m.status !== 'removed' &&
            (filter.value === 'all' ||
              (filter.value === 'staff' ? m.role !== 'student' : m.role === 'student'))
      return (
        matchesTab &&
        `${m.name} ${m.username} ${m.number}`
          .toLowerCase()
          .includes(memberSearch.value.trim().toLowerCase())
      )
    })
    .sort(
      (a, b) =>
        Number(b.owner) - Number(a.owner) ||
        roleOrder[a.role] - roleOrder[b.role] ||
        a.name.localeCompare(b.name, 'zh-CN'),
    ),
)
const { page, pageSize, paged } = usePagination(visible, [filter, memberSearch])
const selectablePage = computed(() => paged.value.filter((m) => !m.owner))
const selectedMembers = computed(() =>
  scopedMembers.value.filter((m) => selectedIds.value.includes(m.id) && !m.owner),
)
const allPageSelected = computed(
  () =>
    selectablePage.value.length > 0 &&
    selectablePage.value.every((m) => selectedIds.value.includes(m.id)),
)
const somePageSelected = computed(() =>
  selectablePage.value.some((m) => selectedIds.value.includes(m.id)),
)
const canEditSelected = computed(
  () => selectedMembers.value.length > 0 && selectedMembers.value.every((m) => !m.disabled),
)
const canRemoveSelected = computed(
  () =>
    selectedMembers.value.length > 0 && selectedMembers.value.every((m) => m.status !== 'removed'),
)
const canRestoreSelected = computed(
  () =>
    selectedMembers.value.length > 0 &&
    selectedMembers.value.every((m) => m.status === 'removed' && !m.disabled),
)
const canTransferSelected = computed(
  () =>
    selectedMembers.value.length === 1 &&
    selectedMembers.value[0]?.role === 'teacher' &&
    selectedMembers.value[0]?.status === 'active' &&
    !selectedMembers.value[0]?.disabled,
)
function selectPage() {
  if (busy.value || loading.value) return
  const ids = selectablePage.value.map((m) => m.id)
  selectedIds.value = allPageSelected.value
    ? selectedIds.value.filter((id) => !ids.includes(id))
    : [...new Set([...selectedIds.value, ...ids])]
}
watch([filter, memberSearch, () => props.staffOnly, () => props.showList], () => {
  selectedIds.value = []
  batchError.value = ''
})
const roles: { value: ClassroomRole; description: string }[] = [
  { value: 'teacher', description: '管理题目和课堂' },
  { value: 'ta', description: '巡视和协助答疑' },
  { value: 'student', description: '编程练习与提交' },
]
const roleHint = computed(
  () =>
    ({
      teacher: '可维护题目、课堂设置和学生名册。',
      ta: '可查看学生作品、处理求助和投屏。',
      student: '以学生身份加入，参与练习和提交作业。',
    })[nextRole.value],
)
const existing = (id: string) => members.value.find((m) => m.id === id)
const alreadyActive = (id: string) => existing(id)?.status === 'active'
const statusLabel = (member: Assignment) =>
  member.disabled
    ? '已停用'
    : member.status === 'active'
      ? '已加入'
      : member.status === 'pending'
        ? '待审批'
        : '已移除'

async function load() {
  const token = ++generation
  const id = props.classroomId
  if (!id) return
  loading.value = true
  error.value = ''
  try {
    const rows = await api<Assignment[]>(`/classes/${id}/assignments`)
    if (token === generation) {
      members.value = rows
      selectedIds.value = selectedIds.value.filter((id) =>
        rows.some((m) => m.id === id && !m.owner),
      )
    }
  } catch (e) {
    if (token === generation) error.value = e instanceof Error ? e.message : '人员读取失败'
  } finally {
    if (token === generation) loading.value = false
  }
}
function cancelSearch() {
  clearTimeout(searchTimer)
  searchGeneration++
  searching.value = false
}
watch(
  () => props.classroomId,
  () => {
    cancelSearch()
    dialogOpen.value = false
    target.value = undefined
    candidates.value = []
    search.value = ''
    memberSearch.value = ''
    filter.value = 'all'
    members.value = []
    selectedIds.value = []
    editTargets.value = []
    batchError.value = ''
    void load()
  },
  { immediate: true },
)
watch(search, () => {
  cancelSearch()
  candidates.value = []
  searched.value = false
  dialogError.value = ''
  if (!dialogOpen.value || target.value || search.value.trim().length < 2) return
  searching.value = true
  searchTimer = setTimeout(() => void find(), 250)
})
watch(dialogOpen, (open) => {
  if (!open) cancelSearch()
})
watch(
  [dialogOpen, target],
  async ([open, selected]) => {
    cancelAnimationFrame(focusFrame)
    if (!open || selected) return
    await nextTick()
    focusFrame = requestAnimationFrame(() => {
      if (dialogOpen.value && !target.value) accountSearchInput.value?.focus()
    })
  },
  { flush: 'post' },
)
onBeforeUnmount(() => {
  mounted = false
  cancelSearch()
  cancelAnimationFrame(focusFrame)
  generation++
})
async function find() {
  clearTimeout(searchTimer)
  const term = search.value.trim()
  if (term.length < 2 || target.value) return
  const token = ++searchGeneration
  const id = props.classroomId
  searching.value = true
  searched.value = false
  dialogError.value = ''
  try {
    const rows = await api<Account[]>(
      `/classes/${id}/assignment-candidates?search=${encodeURIComponent(term)}`,
    )
    if (token === searchGeneration) {
      candidates.value = rows
      searched.value = true
    }
  } catch (e) {
    if (token === searchGeneration)
      dialogError.value = e instanceof Error ? e.message : '账号搜索失败'
  } finally {
    if (token === searchGeneration) searching.value = false
  }
}
function openAdd() {
  cancelSearch()
  dialogMode.value = 'add'
  editTargets.value = []
  target.value = undefined
  search.value = ''
  candidates.value = []
  searched.value = false
  nextRole.value = 'ta'
  dialogError.value = ''
  dialogOpen.value = true
}
function choose(account: Account) {
  cancelSearch()
  target.value = account
  nextRole.value = existing(account.id)?.role ?? 'ta'
  dialogError.value = ''
}
function edit(member: Assignment) {
  editTargets.value = []
  choose(member)
  dialogMode.value = 'edit'
  dialogOpen.value = true
}
async function editMember(id: string) {
  await load()
  const member = existing(id)
  if (member) edit(member)
  else error.value = '成员信息已变化，请刷新后重试'
}
async function editMembers(ids: string[]) {
  if (busy.value) return
  const id = props.classroomId
  await load()
  if (!mounted || id !== props.classroomId) return
  const unique = [...new Set(ids)]
  const targets = unique
    .map((id) => existing(id))
    .filter((m): m is Assignment => !!m && !m.owner && !m.disabled)
  if (!targets.length || targets.length !== unique.length) {
    notify('所选成员已变化、包含负责人或已停用账号，请刷新后重新选择', 'error')
    return
  }
  choose(targets[0]!)
  editTargets.value = targets
  nextRole.value = targets.every((m) => m.role === targets[0]!.role) ? targets[0]!.role : 'ta'
  dialogMode.value = 'edit'
  dialogOpen.value = true
}
defineExpose({ openAdd, editMember, editMembers })

async function applyBatch(
  targets: Assignment[],
  operation: (member: Assignment) => Promise<unknown>,
  role?: ClassroomRole,
): Promise<MemberBatchResult<Assignment> | undefined> {
  if (busy.value || !targets.length) return
  const id = props.classroomId
  const current = () => mounted && id === props.classroomId
  busy.value = true
  error.value = ''
  batchError.value = ''
  dialogError.value = ''
  batchProgress.value = { completed: 0, total: targets.length }
  try {
    const result = await runMemberBatch(targets, operation, {
      current,
      progress: (completed) => {
        if (current()) batchProgress.value.completed = completed
      },
    })
    if (!current()) return result
    const succeededIds = result.succeeded.map((m) => m.id)
    selectedIds.value = selectedIds.value.filter((id) => !succeededIds.includes(id))
    if (role) {
      editTargets.value = [...result.failed.map((f) => f.member), ...result.pending]
      target.value = editTargets.value[0]
      if (!editTargets.value.length) dialogOpen.value = false
    }
    await load()
    if (result.failed.length || result.pending.length) {
      if (role) dialogError.value = memberBatchMessage(result)
      else batchError.value = memberBatchMessage(result)
    } else notify(`已更新 ${result.succeeded.length} 位成员`)
    emit('batch-finished', succeededIds)
    if (succeededIds.length)
      emit(
        'changed',
        role && !result.failed.length && !result.pending.length
          ? { role, status: 'active' }
          : undefined,
      )
    return result
  } finally {
    busy.value = false
    batchProgress.value = { completed: 0, total: 0 }
  }
}
async function saveRole() {
  if (!target.value) return
  if (!editTargets.value.length) return assign(target.value, nextRole.value)
  const id = props.classroomId
  const role = nextRole.value
  await applyBatch(
    [...editTargets.value],
    (member) =>
      api(`/classes/${id}/assignments`, 'POST', { userId: member.id, role, status: 'active' }),
    role,
  )
}
async function batchStatus(status: 'active' | 'removed') {
  if (busy.value || (status === 'removed' ? !canRemoveSelected.value : !canRestoreSelected.value))
    return
  const id = props.classroomId
  const targets = [...selectedMembers.value]
  if (
    !(await confirmAction(
      `${status === 'removed' ? '移出' : '恢复'}已选的 ${targets.length} 位课堂成员？${status === 'removed' ? '账号和历史作品会保留。' : '将恢复其原有课堂身份。'}`,
      { destructive: status === 'removed' },
    ))
  )
    return
  if (!mounted || id !== props.classroomId) return
  await applyBatch(targets, (member) =>
    api(`/classes/${id}/assignments`, 'POST', { userId: member.id, role: member.role, status }),
  )
}
function chooseAgain() {
  target.value = undefined
  dialogError.value = ''
  void find()
}
async function assign(
  account: Account,
  role: ClassroomRole,
  status: 'active' | 'removed' = 'active',
) {
  if (busy.value) return
  const id = props.classroomId
  if (
    status === 'removed' &&
    !(await confirmAction(`移除「${account.name}」的课堂访问权限？账号和历史作品会保留。`, {
      destructive: true,
    }))
  )
    return
  if (id !== props.classroomId) return
  busy.value = true
  dialogError.value = ''
  batchError.value = ''
  error.value = ''
  try {
    await api(`/classes/${id}/assignments`, 'POST', { userId: account.id, role, status })
    selectedIds.value = selectedIds.value.filter((id) => id !== account.id)
    notify(
      status === 'removed'
        ? '已移除课堂访问权限'
        : dialogMode.value === 'add' && dialogOpen.value
          ? '成员已加入课堂'
          : '课堂身份已更新',
    )
    if (id === props.classroomId) {
      dialogOpen.value = false
      await load()
    }
    emit('changed', { role, status })
  } catch (e) {
    if (id === props.classroomId) {
      const message = e instanceof Error ? e.message : '操作失败'
      if (dialogOpen.value) dialogError.value = message
      else error.value = message
    }
  } finally {
    busy.value = false
  }
}
async function transfer(member: Assignment) {
  const id = props.classroomId
  if (
    busy.value ||
    !(await confirmAction(`将课堂负责人转移给「${member.name}」？原负责人会保留教师身份。`))
  )
    return
  if (id !== props.classroomId) return
  busy.value = true
  error.value = ''
  try {
    await api(`/classes/${id}/owner`, 'POST', { userId: member.id })
    notify('课堂负责人已转移')
    if (id === props.classroomId) await load()
    emit('changed')
  } catch (e) {
    if (id === props.classroomId) error.value = e instanceof Error ? e.message : '转移失败'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="members-view" :class="{ 'fill-stack': showList !== false }">
    <Alert v-if="error" type="error">{{ error }}</Alert>
    <Alert v-if="batchError" type="error">{{ batchError }}</Alert>
    <ContentPanel
      v-show="showList !== false"
      as="section"
      direct
      class="panel-fill"
      aria-label="课堂成员">
      <template #header>
        <div class="filter-tabs borderless" role="group" aria-label="筛选成员">
          <Button
            v-for="tab in tabs"
            :key="tab.value"
            variant="plain"
            :aria-pressed="filter === tab.value"
            :disabled="busy"
            :class="{ selected: filter === tab.value }"
            @click="filter = tab.value">
            {{ tab.label }}
            <span>{{ tab.count }}</span>
          </Button>
        </div>
      </template>
      <template #actions>
        <div class="inline-items">
          <label class="search-field">
            <Search :size="16" />
            <Input
              v-model="memberSearch"
              :disabled="busy"
              aria-label="搜索课堂成员"
              placeholder="搜索姓名、账号或学号" />
          </label>
          <Button
            variant="ghost"
            size="icon"
            aria-label="刷新成员"
            title="刷新成员"
            :disabled="busy || loading"
            @click="load">
            <RefreshCw :class="{ 'animate-spin': loading }" />
          </Button>
          <Button v-if="!staffOnly" :disabled="busy" @click="openAdd">
            <UserPlus />
            添加成员
          </Button>
        </div>
      </template>
      <div v-if="selectedMembers.length" class="table-controls" aria-label="成员批量操作">
        <div class="inline-items">
          <span class="muted">
            {{
              busy && batchProgress.total
                ? `正在处理 ${batchProgress.completed}/${batchProgress.total}`
                : `已选 ${selectedMembers.length} 位`
            }}
          </span>
          <Button variant="plain" class="text-button" :disabled="busy" @click="selectedIds = []">
            取消选择
          </Button>
        </div>
        <div class="inline-items">
          <Button
            size="sm"
            variant="outline"
            :disabled="busy || !canEditSelected"
            data-disabled-reason="所选成员包含已停用账号，无法调整身份"
            @click="editMembers(selectedIds)">
            调整身份
          </Button>
          <Button
            size="sm"
            variant="outline"
            :disabled="busy || !canTransferSelected"
            data-disabled-reason="请仅选择一位未停用、在任的教师作为新负责人"
            @click="selectedMembers[0] && transfer(selectedMembers[0])">
            设为负责人
          </Button>
          <Button
            size="sm"
            variant="outline"
            :disabled="busy || !canRestoreSelected"
            data-disabled-reason="仅支持恢复全部已移除且未停用的成员"
            @click="batchStatus('active')">
            恢复加入
          </Button>
          <Button
            size="sm"
            variant="outline"
            :disabled="busy || !canRemoveSelected"
            data-disabled-reason="所选成员包含已移除人员"
            @click="batchStatus('removed')">
            移出课堂
          </Button>
        </div>
      </div>
      <div class="table-scroll">
        <table class="members-table" :aria-busy="loading">
          <colgroup>
            <col class="selection-column" />
            <col class="person-column" />
            <col class="account-column" />
            <col class="role-column" />
            <col class="status-column" />
            <col class="actions-column" />
          </colgroup>
          <thead>
            <tr>
              <th>
                <Checkbox
                  aria-label="选择本页课堂成员"
                  :checked="allPageSelected"
                  :indeterminate="somePageSelected && !allPageSelected"
                  :disabled="busy || loading || !selectablePage.length"
                  @change="selectPage" />
              </th>
              <th>成员</th>
              <th>登录账号</th>
              <th>课堂身份</th>
              <th>状态</th>
              <th><span class="sr-only">管理成员</span></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="member in paged" :key="member.id">
              <td>
                <Checkbox
                  v-model="selectedIds"
                  :value="member.id"
                  :aria-label="'选择' + member.name"
                  :disabled="busy || loading || member.owner"
                  :data-disabled-reason="
                    member.owner ? '请先转移负责人，再调整原负责人的身份' : '正在更新成员，请稍候'
                  " />
              </td>
              <td>
                <div class="member-person">
                  <span class="person-avatar" :class="'is-' + member.role" aria-hidden="true">
                    {{ member.name.slice(-2) }}
                  </span>
                  <div class="person-copy">
                    <div class="person-name">
                      <strong :title="member.name">{{ member.name }}</strong>
                      <span v-if="member.owner" class="owner-label" title="课堂负责人">
                        <ShieldCheck :size="12" />
                        负责人
                      </span>
                    </div>
                    <span v-if="member.number" class="person-number">{{ member.number }}</span>
                  </div>
                </div>
              </td>
              <td>
                <span class="member-account" :title="member.username">{{ member.username }}</span>
              </td>
              <td>
                <span class="role-badge" :class="'role-' + member.role">
                  {{ classroomRoleLabels[member.role] }}
                </span>
              </td>
              <td>
                <span
                  class="member-status"
                  :class="{ 'is-active': member.status === 'active' && !member.disabled }">
                  <i />
                  {{ statusLabel(member) }}
                </span>
              </td>
              <td class="member-actions">
                <span
                  v-if="member.owner"
                  class="owner-lock"
                  title="请先将负责人转移给其他教师，再调整此成员">
                  —
                </span>
                <DropdownMenuRoot v-else>
                  <DropdownMenuTrigger as-child>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      :aria-label="'管理' + member.name"
                      :disabled="busy">
                      <Ellipsis />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuPortal>
                    <DropdownMenuContent
                      class="ui-menu-content member-menu"
                      align="end"
                      :side-offset="5">
                      <DropdownMenuItem
                        class="ui-menu-item"
                        :disabled="member.disabled"
                        @select="edit(member)">
                        调整身份
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        v-if="
                          member.role === 'teacher' &&
                          member.status === 'active' &&
                          !member.disabled
                        "
                        class="ui-menu-item"
                        @select="transfer(member)">
                        设为负责人
                      </DropdownMenuItem>
                      <DropdownMenuSeparator class="member-menu-separator" />
                      <DropdownMenuItem
                        v-if="member.status !== 'removed'"
                        class="ui-menu-item remove-member"
                        @select="assign(member, member.role, 'removed')">
                        移出课堂
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        v-else
                        class="ui-menu-item"
                        :disabled="member.disabled"
                        @select="assign(member, member.role)">
                        恢复加入
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenuPortal>
                </DropdownMenuRoot>
              </td>
            </tr>
          </tbody>
        </table>
        <div v-if="!paged.length" class="members-empty" role="status">
          <RefreshCw v-if="loading" :size="24" class="animate-spin" />
          <Search v-else-if="memberSearch" :size="24" />
          <Users v-else :size="24" />
          <strong>
            {{ loading ? '正在读取成员…' : memberSearch ? '没有匹配的成员' : '暂无此类成员' }}
          </strong>
          <span v-if="!loading">
            {{
              memberSearch
                ? '试试其他姓名、账号或学号。'
                : staffOnly
                  ? '添加已有账号，或在学生列表中调整课堂身份。'
                  : '添加已有账号，或前往学生名册导入名单。'
            }}
          </span>
        </div>
      </div>
      <Pagination
        v-model:page="page"
        v-model:page-size="pageSize"
        :total="visible.length"
        :busy="loading || busy"
        unit="位成员" />
    </ContentPanel>

    <Modal
      v-model:open="dialogOpen"
      :title="
        dialogMode === 'add'
          ? '添加课堂成员'
          : editTargets.length > 1
            ? '批量调整课堂身份'
            : '调整课堂身份'
      "
      :description="!target ? '搜索已有账号，选择要加入课堂的人。' : undefined"
      :busy="busy">
      <div class="member-dialog">
        <Alert v-if="dialogError" type="error">{{ dialogError }}</Alert>
        <template v-if="!target">
          <Form @submit.prevent="find">
            <label class="member-search candidate-search">
              <Search :size="17" />
              <Input
                ref="accountSearchInput"
                v-model="search"
                aria-label="搜索已有账号"
                placeholder="姓名、登录账号或学号"
                maxlength="80" />
              <RefreshCw v-if="searching" :size="16" class="animate-spin" />
            </label>
          </Form>
          <div v-if="candidates.length && !searching" class="candidate-list" aria-label="搜索结果">
            <Button
              v-for="candidate in candidates"
              :key="candidate.id"
              variant="plain"
              class="candidate-row"
              :disabled="alreadyActive(candidate.id)"
              data-disabled-reason="该账号已加入课堂，可在成员列表中调整身份"
              @click="choose(candidate)">
              <span class="person-avatar" aria-hidden="true">{{ candidate.name.slice(-2) }}</span>
              <span class="candidate-copy">
                <strong>{{ candidate.name }}</strong>
                <small>
                  {{ candidate.username }}
                  <template v-if="candidate.number">· {{ candidate.number }}</template>
                </small>
              </span>
              <span v-if="alreadyActive(candidate.id)" class="candidate-existing">
                <Check :size="13" />
                已加入
              </span>
              <ChevronRight v-else :size="16" />
            </Button>
          </div>
          <div v-else class="candidate-empty" role="status">
            <RefreshCw v-if="searching" :size="26" class="animate-spin" />
            <Search v-else-if="searched" :size="26" />
            <UserPlus v-else :size="26" />
            <strong>
              {{ searching ? '正在搜索…' : searched ? '没有找到账号' : '搜索要添加的人' }}
            </strong>
            <span>
              {{
                searching
                  ? ' '
                  : searched
                    ? '换个关键词，或先创建账号。'
                    : '输入至少 2 个字，支持姓名、账号和学号。'
              }}
            </span>
          </div>
          <div v-if="accountCreationPath" class="create-account-link">
            <span>还没有账号？</span>
            <RouterLink :to="accountCreationPath" @click="dialogOpen = false">
              {{ accountCreationPath.includes('/admin/') ? '创建账号' : '创建或导入学生' }}
              <ChevronRight :size="13" />
            </RouterLink>
          </div>
        </template>
        <Form v-else class="member-role-form" @submit.prevent="saveRole">
          <div class="selected-person">
            <span class="person-avatar" aria-hidden="true">
              <Users v-if="editTargets.length > 1" :size="20" />
              <template v-else>{{ target.name.slice(-2) }}</template>
            </span>
            <span class="candidate-copy">
              <strong>
                {{ editTargets.length > 1 ? `已选 ${editTargets.length} 位成员` : target.name }}
              </strong>
              <small :title="editTargets.map((m) => m.name).join('、')">
                {{
                  editTargets.length > 1
                    ? editTargets.map((m) => m.name).join('、')
                    : target.username
                }}
              </small>
            </span>
            <Button
              v-if="dialogMode === 'add'"
              type="button"
              variant="plain"
              class="choose-again"
              :disabled="busy"
              @click="chooseAgain">
              <ArrowLeft :size="13" />
              重新选择
            </Button>
          </div>
          <fieldset class="role-fieldset">
            <legend>课堂身份</legend>
            <RadioGroupRoot
              v-model="nextRole"
              class="role-options"
              aria-label="课堂身份"
              :disabled="busy">
              <RadioGroupItem
                v-for="option in roles"
                :key="option.value"
                :value="option.value"
                class="role-option"
                :class="{ 'is-selected': nextRole === option.value }">
                <span>
                  <span class="role-radio"><RadioGroupIndicator class="role-radio-dot" /></span>
                  {{ classroomRoleLabels[option.value] }}
                </span>
                <small>{{ option.description }}</small>
              </RadioGroupItem>
            </RadioGroupRoot>
          </fieldset>
          <p class="role-hint">{{ roleHint }}</p>
          <p v-if="editTargets.some((m) => m.status === 'removed')" class="role-hint">
            保存身份后，已移除的成员将恢复加入。
          </p>
          <div class="modal-actions">
            <Button type="button" variant="outline" :disabled="busy" @click="dialogOpen = false">
              取消
            </Button>
            <Button type="submit" :disabled="busy">
              {{
                busy
                  ? editTargets.length
                    ? `保存中 ${batchProgress.completed}/${batchProgress.total}…`
                    : '保存中…'
                  : dialogMode === 'add'
                    ? '添加成员'
                    : '保存身份'
              }}
            </Button>
          </div>
        </Form>
      </div>
    </Modal>
  </div>
</template>

<style scoped>
.members-view {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.member-search {
  display: flex;
  align-items: center;
  gap: 9px;
  height: 36px;
  width: 276px;
  min-width: 0;
  padding: 0 11px;
  border: 1px solid var(--ui-line);
  border-radius: 5px;
  color: var(--ui-muted);
  background: transparent;
}
.member-search:focus-within {
  border-color: var(--ui-action);
  box-shadow: 0 0 0 3px var(--ui-focus);
}
.member-search > svg {
  flex-shrink: 0;
}
.member-search > input {
  width: 100%;
  min-width: 0;
  height: 100%;
  padding: 0;
  border: 0;
  outline: 0;
  box-shadow: none;
  background: transparent;
  font-size: 13px;
}
.member-search > input:focus {
  border: 0;
  outline: 0;
  box-shadow: none;
}
.members-table {
  width: 100%;
  table-layout: fixed;
}
.selection-column {
  width: 52px;
}
.person-column {
  width: 26%;
}
.account-column {
  width: 30%;
}
.role-column {
  width: 16%;
}
.status-column {
  width: 14%;
}
.actions-column {
  width: 8%;
}
.member-person {
  display: flex;
  align-items: center;
  gap: 11px;
  min-width: 0;
}
.person-avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  border-radius: 8px;
  background: var(--ui-hover);
  color: var(--ui-secondary);
  font-size: 12px;
  font-weight: 500;
}
.person-avatar.is-teacher {
  background: var(--ui-selection);
  color: var(--ui-action);
}
.person-avatar.is-ta {
  background: var(--ui-success-bg);
  color: var(--ui-success);
}
.person-copy {
  min-width: 0;
}
.person-name {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}
.person-name > strong {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
  font-weight: 550;
  color: var(--ui-ink);
}
.owner-label {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  color: var(--ui-muted);
  font-size: 11px;
  white-space: nowrap;
}
.person-number {
  display: block;
  margin-top: 4px;
  color: var(--ui-muted);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
.member-account {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  color: var(--ui-muted);
}
.role-badge {
  display: inline-flex;
  padding: 3px 9px;
  border-radius: 4px;
  background: var(--ui-hover);
  color: var(--ui-secondary);
  font-size: 12px;
  line-height: 1.5;
}
.role-teacher {
  background: var(--ui-selection);
  color: var(--ui-action);
}
.role-ta {
  background: var(--ui-success-bg);
  color: var(--ui-success);
}
.member-status {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  white-space: nowrap;
  font-size: 12px;
  color: var(--ui-muted);
}
.member-status > i {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--ui-faint);
}
.member-status.is-active > i {
  background: var(--ui-success);
}
.member-actions {
  text-align: right;
}
.owner-lock {
  color: var(--ui-faint);
}
.member-menu {
  min-width: 160px;
}
.member-menu :deep(.ui-menu-item) {
  font-size: 13px;
}
.member-menu-separator {
  height: 1px;
  margin: 5px 0;
  background: var(--ui-line);
}
.remove-member {
  color: var(--ui-error);
}
.members-empty,
.candidate-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 10px;
  color: var(--ui-muted);
}
.members-empty {
  min-height: 240px;
}
.members-empty > strong,
.candidate-empty > strong {
  color: var(--ui-secondary);
  font-weight: 500;
  font-size: 14px;
}
.members-empty > span,
.candidate-empty > span {
  font-size: 12px;
}
.member-dialog {
  display: grid;
  gap: 18px;
}
.candidate-search {
  width: 100%;
  height: 40px;
}
.candidate-search > input {
  font-size: 14px;
}
.candidate-list {
  display: grid;
  max-height: 300px;
  overflow-y: auto;
  gap: 4px;
}
.candidate-row {
  display: flex;
  align-items: center;
  gap: 11px;
  width: 100%;
  padding: 11px 10px;
  text-align: left;
  border-radius: 6px;
  color: var(--ui-secondary);
}
.candidate-row:hover:not(:disabled) {
  background: var(--ui-hover);
}
.candidate-row:focus-visible {
  outline: 2px solid var(--ui-action);
  outline-offset: -2px;
}
.candidate-row:disabled {
  cursor: default;
}
.candidate-copy {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.candidate-copy > strong {
  font-size: 14px;
  font-weight: 550;
  color: var(--ui-ink);
}
.candidate-copy > small {
  font-size: 12px;
  color: var(--ui-muted);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.candidate-existing {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--ui-muted);
  white-space: nowrap;
}
.candidate-empty {
  min-height: 170px;
}
.create-account-link {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding-top: 15px;
  border-top: 1px solid var(--ui-line);
  font-size: 12px;
  color: var(--ui-muted);
}
.create-account-link > a {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  color: var(--ui-action);
}
.selected-person {
  display: flex;
  align-items: center;
  gap: 11px;
  padding-bottom: 20px;
  border-bottom: 1px solid var(--ui-line);
}
.selected-person .person-avatar {
  width: 40px;
  height: 40px;
}
.choose-again {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--ui-muted);
  font-size: 12px;
  white-space: nowrap;
}
.member-role-form {
  display: grid;
  gap: 20px;
}
.role-fieldset {
  min-width: 0;
  border: 0;
  margin: 0;
  padding: 0;
}
.role-fieldset > legend {
  padding: 0;
  margin-bottom: 10px;
  font-size: 13px;
  font-weight: 550;
  color: var(--ui-secondary);
}
.role-options {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}
.role-option {
  display: grid;
  gap: 8px;
  padding: 13px 11px;
  border: 1px solid var(--ui-line);
  border-radius: 6px;
  cursor: pointer;
  text-align: left;
}
.role-option:focus-visible {
  outline: 2px solid var(--ui-action);
  outline-offset: 2px;
}
.role-option:hover {
  background: var(--ui-hover);
}
.role-option.is-selected {
  border-color: var(--ui-action);
  background: var(--ui-selection);
}
.role-option > span {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 14px;
  font-weight: 550;
  color: var(--ui-ink);
}
.role-radio {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  border: 1px solid var(--ui-line-strong);
  border-radius: 50%;
}
.is-selected .role-radio {
  border-color: var(--ui-action);
}
.role-radio-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--ui-action);
}
.role-option > small {
  color: var(--ui-muted);
  font-size: 11px;
  line-height: 1.5;
}
.role-hint {
  margin: -8px 0 0;
  color: var(--ui-muted);
  font-size: 12px;
  line-height: 1.7;
}
.member-role-form .modal-actions {
  margin-top: 0;
  padding-top: 0;
}
</style>
