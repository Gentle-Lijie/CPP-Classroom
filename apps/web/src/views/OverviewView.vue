<script setup lang="ts">
import { Input } from '@/components/ui/input'
import { Select, SelectOption } from '@/components/ui/select'
import { computed, onMounted, onBeforeUnmount, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  Users,
  CircleCheck,
  CircleAlert,
  Hand,
  Search,
  ChevronDown,
  ArrowRight,
  ArrowUpRight,
  UserPlus,
  Download,
  Radio,
  SlidersHorizontal,
  Check,
  Copy,
  BookOpen,
  GraduationCap,
  Monitor,
} from '@lucide/vue'
import { Button } from '@/components/ui/button'
import Modal from '@/components/classroom/Modal.vue'
import Pagination from '@/components/classroom/Pagination.vue'
import { usePagination } from '@/composables/usePagination'
import {
  students,
  exercises,
  counts,
  activeClassroom,
  demo,
  tone,
  notify,
  classPath,
  reportError,
  download,
  type Student,
} from '@/data/demo'
import { api } from '@/lib/api'
const router = useRouter()
const search = ref('')
const filter = ref('全部学生')
const exercise = ref('全部练习')
const invite = ref(false)
const copied = ref(false)
const busy = ref(false)
const regenerate = ref(false)
const origin = location.origin
const searchInput = ref<InstanceType<typeof Input>>()
function focusSearch(event: KeyboardEvent) {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault()
    searchInput.value?.focus()
  }
}
onMounted(() => document.addEventListener('keydown', focusSearch))
onBeforeUnmount(() => document.removeEventListener('keydown', focusSearch))
const recommended = computed(() =>
  exercises.find((e) => e.id === activeClassroom.value.recommended && e.status === '已发布'),
)
const recommendedSubmitted = computed(() => students.filter((s) => s.recommendedSubmitted).length)
const inviteExpires = computed(() =>
  activeClassroom.value.inviteExpiresAt
    ? new Date(activeClassroom.value.inviteExpiresAt).toLocaleString('zh-CN')
    : '请重新生成以获取有效邀请',
)
const inviteExpired = computed(
  () =>
    !!activeClassroom.value.inviteExpiresAt &&
    new Date(activeClassroom.value.inviteExpiresAt).getTime() <= Date.now(),
)
const inviteAvailable = computed(
  () =>
    activeClassroom.value.settings?.allowJoin !== false &&
    !['已关闭', '已归档'].includes(activeClassroom.value.status),
)
const recommendedIndex = computed(
  () => exercises.findIndex((e) => e.id === recommended.value?.id) + 1,
)
function studentExercise(student: Student) {
  return exercises.find((e) => e.id === student.exerciseId)
}
const filters = computed(() => [
  { label: '全部学生', count: counts.value.total },
  { label: '在线', count: counts.value.online },
  { label: '请求帮助', count: counts.value.help },
  { label: '编译失败', count: counts.value.errors },
  {
    label: '运行异常',
    count: students.filter((s) =>
      ['超时', '运行失败', '平台执行失败', '资源超限'].includes(s.status),
    ).length,
  },
  { label: '已提交', count: counts.value.submitted },
  { label: '离线', count: students.filter((s) => !s.online).length },
])
const visible = computed(() =>
  students.filter(
    (s) =>
      `${s.name}${s.number}`.toLowerCase().includes(search.value.trim().toLowerCase()) &&
      (filter.value === '全部学生' ||
        (filter.value === '在线' && s.online) ||
        (filter.value === '请求帮助' && s.help) ||
        (filter.value === '编译失败' && s.status === '编译失败') ||
        (filter.value === '运行异常' &&
          ['超时', '运行失败', '平台执行失败', '资源超限'].includes(s.status)) ||
        (filter.value === '已提交' && s.submitted) ||
        (filter.value === '离线' && !s.online)) &&
      (exercise.value === '全部练习' || studentExercise(s)?.id === exercise.value),
  ),
)
const { page, pageSize, paged } = usePagination(visible, [search, filter, exercise])
async function copyInvite() {
  try {
    await navigator.clipboard.writeText(`${location.origin}/join?code=${demo.inviteCode}`)
    copied.value = true
  } catch {
    notify('请手动复制邀请链接')
  }
}
async function exportClass() {
  if (busy.value) return
  busy.value = true
  try {
    const data = await api(classPath('/export'))
    download(
      activeClassroom.value.name + '-作品.json',
      JSON.stringify(data, null, 2),
      'application/json',
    )
  } catch (e) {
    reportError(e)
  } finally {
    busy.value = false
  }
}
async function regenerateInvite() {
  if (busy.value) return
  busy.value = true
  try {
    const result = await api<{ inviteCode: string; inviteExpiresAt?: string }>(
      classPath('/invite'),
      'POST',
      {},
    )
    demo.inviteCode = result.inviteCode
    activeClassroom.value.inviteCode = result.inviteCode
    if (result.inviteExpiresAt) activeClassroom.value.inviteExpiresAt = result.inviteExpiresAt
    copied.value = false
    regenerate.value = false
    notify('课堂码已更新，旧邀请已失效')
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
      <div class="heading-meta">
        <span class="status" :class="tone(activeClassroom.status)"
          ><span class="status-dot" />{{ activeClassroom.status }}</span
        ><span>课堂概览</span>
      </div>
      <h1>{{ activeClassroom.name }}</h1>
      <p>查看学生在线状态、当前练习、运行结果与求助。</p>
    </div>
    <div class="heading-actions">
      <Button variant="outline" :disabled="!exercises.length" @click="router.push('/teacher/teach')"
        ><Monitor />开始授课</Button
      >
      <Button variant="outline" :disabled="busy" @click="exportClass"><Download />导出作品</Button
      ><Button :disabled="!inviteAvailable" @click="invite = true"><UserPlus />邀请学生</Button>
    </div>
  </div>
  <div class="stat-grid">
    <Button variant="plain" class="stat-card" @click="filter = '在线'">
      <div class="stat-top">
        在线学生<span class="stat-icon green"><Users :size="18" /></span>
      </div>
      <div class="stat-number">
        {{ counts.online }}<span>/ {{ counts.total }}</span>
      </div>
      <div class="stat-foot">
        <span class="live-dot" />{{ counts.total - counts.online }} 位同学暂时离线
      </div></Button
    ><Button variant="plain" class="stat-card" @click="filter = '已提交'">
      <div class="stat-top">
        当前练习已提交<span class="stat-icon blue"><CircleCheck :size="18" /></span>
      </div>
      <div class="stat-number">{{ counts.submitted }}<span>位同学</span></div>
      <div class="stat-foot">按每位学生当前练习统计，不代表通过</div></Button
    ><Button variant="plain" class="stat-card" @click="filter = '编译失败'">
      <div class="stat-top">
        最近编译失败<span class="stat-icon red"><CircleAlert :size="18" /></span>
      </div>
      <div class="stat-number">{{ counts.errors }}<span>位同学</span></div>
      <div class="stat-foot">查看原始诊断，找到问题所在 <ArrowUpRight :size="13" /></div></Button
    ><Button variant="plain" class="stat-card" @click="filter = '请求帮助'">
      <div class="stat-top">
        待处理求助<span class="stat-icon amber"><Hand :size="18" /></span>
      </div>
      <div class="stat-number">{{ counts.help }}<span>条请求</span></div>
      <div class="stat-foot amber-text">
        {{ counts.help ? '有同学正在等你' : '暂时没有待处理的求助' }} <ArrowRight :size="13" />
      </div>
    </Button>
  </div>
  <div class="overview-columns">
    <section class="panel student-panel">
      <div class="panel-heading">
        <div class="section-heading">
          <h2>课堂巡视</h2>
          <span class="subtle-count">{{ counts.total }}</span
          ><span class="sync-label"><Radio :size="13" />服务器状态同步</span>
        </div>
      </div>
      <div class="filter-tabs">
        <Button
          v-for="f in filters"
          :key="f.label"
          variant="plain"
          :class="{ selected: filter === f.label }"
          @click="filter = f.label"
        >
          {{ f.label }}<span>{{ f.count }}</span>
        </Button>
      </div>
      <div class="table-controls">
        <label class="search-field"
          ><Search :size="16" /><Input
            ref="searchInput"
            v-model="search"
            aria-label="搜索学生"
            placeholder="搜索姓名或学号…"
          /><kbd>⌘ K</kbd></label
        ><label class="select-wrap"
          ><SlidersHorizontal :size="14" /><Select v-model="exercise" aria-label="按练习筛选">
            <SelectOption>全部练习</SelectOption>
            <SelectOption v-for="e in exercises" :key="e.id" :value="e.id">
              {{ e.title }}
            </SelectOption></Select
          ><ChevronDown :size="13"
        /></label>
      </div>
      <div class="table-scroll">
        <table class="student-table">
          <thead>
            <tr>
              <th>学生</th>
              <th>当前练习</th>
              <th>最近运行</th>
              <th>提交 / 求助</th>
              <th>最近活动</th>
              <th />
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(s, index) in paged"
              :key="s.id"
              tabindex="0"
              @click="router.push('/teacher/students/' + s.id)"
              @keydown.enter="router.push('/teacher/students/' + s.id)"
            >
              <td>
                <div class="person-cell">
                  <span
                    class="student-avatar"
                    :class="['avatar-' + (index % 5), { offline: !s.online }]"
                    >{{ s.name.slice(-2) }}<i :class="{ online: s.online }" /></span
                  ><span class="person-text"
                    ><strong>{{ s.name }}</strong
                    ><small>{{ s.number }}</small></span
                  >
                </div>
              </td>
              <td>
                <span class="table-exercise">{{ studentExercise(s)?.title ?? '尚未选择练习' }}</span
                ><small class="cell-secondary">{{ s.online ? '在线编辑' : '当前离线' }}</small>
              </td>
              <td>
                <span class="status" :class="tone(s.status)"
                  ><span class="status-dot" />{{ s.status }}</span
                ><small class="cell-secondary error-summary">{{ s.summary }}</small>
              </td>
              <td>
                <span v-if="s.help" class="help-label"><Hand :size="13" />请求帮助</span
                ><span v-else-if="s.submitted" class="submitted-label"
                  ><Check :size="13" />已提交</span
                ><span v-else class="muted">—</span>
              </td>
              <td class="activity-cell">{{ s.activity }}</td>
              <td><ArrowRight :size="15" class="row-arrow" /></td>
            </tr>
          </tbody>
        </table>
        <div v-if="!visible.length" class="empty-state">
          <Search :size="26" />
          <h3>没有找到符合条件的学生</h3>
          <p>试试其他姓名、学号或筛选条件。</p>
          <Button
            variant="outline"
            @click="
              () => {
                search = ''
                filter = '全部学生'
                exercise = '全部练习'
              }
            "
            >清除筛选</Button
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
    <aside class="overview-aside">
      <section class="panel current-exercise">
        <div class="panel-heading">
          <h2>当前推荐练习</h2>
          <BookOpen :size="17" class="muted" />
        </div>
        <div v-if="recommended" class="exercise-feature">
          <span class="topic-label">练习 {{ recommendedIndex }} · {{ recommended.topic }}</span>
          <h3>{{ recommended.title }}</h3>
          <p>{{ recommended.description.split('\n')[0] }}</p>
          <div class="exercise-progress">
            <span>本题主动提交进度</span
            ><strong>{{ recommendedSubmitted }} / {{ counts.total }}</strong>
          </div>
          <div class="progress-track">
            <i
              :style="{
                width: (counts.total ? (recommendedSubmitted / counts.total) * 100 : 0) + '%',
              }"
            />
          </div>
          <Button variant="outline" class="w-full" @click="router.push('/teacher/exercises')"
            >管理练习 <ArrowRight
          /></Button>
        </div>
        <div v-else class="small-empty">
          <BookOpen :size="28" />
          <p>还没有已发布的推荐练习</p>
          <Button
            variant="outline"
            @click="router.push(exercises.length ? '/teacher/exercises' : '/teacher/exercises/new')"
            >{{ exercises.length ? '选择推荐练习' : '创建练习' }}</Button
          >
        </div>
      </section>
      <section class="panel help-panel">
        <div class="panel-heading">
          <h2>需要你的关注</h2>
          <span v-if="counts.help" class="notification-dot" />
        </div>
        <div v-for="s in students.filter((s) => s.help)" :key="s.id" class="help-item">
          <div class="help-item-heading">
            <strong>{{ s.name }}</strong
            ><small>{{ s.activity }}</small>
          </div>
          <p>
            {{ s.helpMessage || '学生请求帮助，请打开详情查看。' }}
          </p>
          <small class="help-context"
            >{{ exercises.find((e) => e.id === s.helpExerciseId)?.title ?? '课堂练习' }} ·
            {{
              s.helpCreatedAt ? new Date(s.helpCreatedAt).toLocaleTimeString('zh-CN') : s.activity
            }}</small
          >
          <Button
            variant="plain"
            @click="
              router.push({
                path: '/teacher/students/' + s.id,
                query: { exercise: s.helpExerciseId },
              })
            "
          >
            查看并辅导 <ArrowUpRight :size="13" />
          </Button>
        </div>
        <div v-if="!counts.help" class="small-empty">
          <CircleCheck :size="24" />
          <p>所有求助都已处理</p>
        </div>
      </section>
    </aside>
  </div>
  <Modal
    v-model:open="invite"
    title="邀请学生加入课堂"
    description="学生登录后登记入班。课堂码不替代个人身份。"
    ><div class="invitation-class"><GraduationCap :size="22" />{{ activeClassroom.name }}</div>
    <label class="field-label">课堂码</label>
    <div class="invite-code">{{ demo.inviteCode }}</div>
    <div class="copy-row">
      <Input
        :value="`${origin}/join?code=${demo.inviteCode}`"
        readonly
        aria-label="邀请链接"
      /><Button variant="outline" :disabled="inviteExpired" @click="copyInvite"
        ><Check v-if="copied" /><Copy v-else />{{ copied ? '已复制' : '复制链接' }}</Button
      >
    </div>
    <p class="form-hint" :class="{ 'danger-text': inviteExpired }">
      {{ inviteExpired ? '课堂码已过期，请重新生成' : '有效至 ' + inviteExpires }} ·
      加入后由教师确认
    </p>
    <Button variant="outline" class="w-full" @click="regenerate = true"
      >重新生成课堂码</Button
    ></Modal
  >
  <Modal
    v-model:open="regenerate"
    title="使旧邀请链接失效？"
    description="重新生成后需要把新课堂码交付给尚未加入的学生，已有成员不受影响。"
    ><div class="modal-actions">
      <Button variant="outline" :disabled="busy" @click="regenerate = false">取消</Button
      ><Button variant="warning" :disabled="busy" @click="regenerateInvite">{{
        busy ? '正在更新…' : '确认重新生成'
      }}</Button>
    </div></Modal
  >
</template>

<style scoped>
.help-context {
  display: block;
  color: var(--ui-muted);
  font-size: 14px;
  margin: 6px 0 10px;
  overflow-wrap: anywhere;
}
.overview-columns,
.student-panel {
  min-width: 0;
}
.filter-tabs {
  overflow-x: auto;
  flex-shrink: 0;
}
.help-item p {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
</style>
