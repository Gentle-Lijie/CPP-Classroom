<script setup lang="ts">
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
  LayoutList,
  Check,
  Copy,
  BookOpen,
  GraduationCap,
  Monitor,
} from '@lucide/vue'
import { Button } from '@/components/ui/button'
import Modal from '@/components/classroom/Modal.vue'
import {
  students,
  exercises,
  counts,
  activeClassroom,
  demo,
  tone,
  notify,
  download,
  type Student,
} from '@/data/demo'
const router = useRouter()
const search = ref('')
const filter = ref('全部学生')
const exercise = ref('全部练习')
const invite = ref(false)
const copied = ref(false)
const origin = location.origin
const searchInput = ref<HTMLInputElement>()
function focusSearch(event: KeyboardEvent) {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault()
    searchInput.value?.focus()
  }
}
onMounted(() => document.addEventListener('keydown', focusSearch))
onBeforeUnmount(() => document.removeEventListener('keydown', focusSearch))
const recommended = computed(
  () => exercises.find((e) => e.id === demo.recommended) ?? exercises[0]!,
)
const recommendedIndex = computed(() => exercises.findIndex((e) => e.id === demo.recommended) + 1)
function studentExercise(student: Student) {
  return exercises.find((e) => e.id === (student.exerciseId ?? demo.recommended)) ?? exercises[0]!
}
const filters = computed(() => [
  { label: '全部学生', count: counts.value.total },
  { label: '请求帮助', count: counts.value.help },
  { label: '编译失败', count: counts.value.errors },
  { label: '运行异常', count: students.filter((s) => s.status === '超时').length },
  { label: '已提交', count: counts.value.submitted },
  { label: '离线', count: students.filter((s) => !s.online).length },
])
const visible = computed(() =>
  students.filter(
    (s) =>
      `${s.name}${s.number}`.includes(search.value) &&
      (filter.value === '全部学生' ||
        (filter.value === '请求帮助' && s.help) ||
        (filter.value === '编译失败' && s.status === '编译失败') ||
        (filter.value === '运行异常' && s.status === '超时') ||
        (filter.value === '已提交' && s.submitted) ||
        (filter.value === '离线' && !s.online)) &&
      (exercise.value === '全部练习' || studentExercise(s).title === exercise.value),
  ),
)
async function copyInvite() {
  try {
    await navigator.clipboard.writeText(`${location.origin}/join?code=${demo.inviteCode}`)
    copied.value = true
  } catch {
    notify('请手动复制邀请链接')
  }
}
function exportClass() {
  download(
    '课堂巡视-示例数据.json',
    JSON.stringify(
      { classroom: activeClassroom.value.name, students, note: '前端原型示例数据' },
      null,
      2,
    ),
    'application/json',
  )
  notify('已导出课堂示例数据')
}
function regenerateInvite() {
  demo.inviteCode = 'CPP' + Math.random().toString(36).slice(2, 6).toUpperCase()
  copied.value = false
  notify('已更新本次演示课堂码')
}
</script>
<template>
  <div class="page-heading">
    <div>
      <div class="heading-meta">
        <span class="live-pill"><span class="live-dot" />{{ activeClassroom.status }}</span
        ><span>2026 / 秋季学期</span>
      </div>
      <h1>{{ activeClassroom.name }}</h1>
      <p>查看学生在线状态、当前练习、运行结果与求助。</p>
    </div>
    <div class="heading-actions">
      <Button variant="outline" @click="router.push('/teacher/teach')"><Monitor />开始授课</Button>
      <Button variant="outline" @click="exportClass"><Download />导出作品</Button
      ><Button @click="invite = true"><UserPlus />邀请学生</Button>
    </div>
  </div>
  <div class="stat-grid">
    <button class="stat-card" @click="filter = '全部学生'">
      <div class="stat-top">
        在线学生<span class="stat-icon green"><Users :size="18" /></span>
      </div>
      <div class="stat-number">
        {{ counts.online }}<span>/ {{ counts.total }}</span>
      </div>
      <div class="stat-foot">
        <span class="live-dot" />{{ counts.total - counts.online }} 位同学暂时离线
      </div></button
    ><button class="stat-card" @click="filter = '已提交'">
      <div class="stat-top">
        已提交练习<span class="stat-icon blue"><CircleCheck :size="18" /></span>
      </div>
      <div class="stat-number">{{ counts.submitted }}<span>位同学</span></div>
      <div class="stat-foot">提交仅表示主动交付，不代表通过</div></button
    ><button class="stat-card" @click="filter = '编译失败'">
      <div class="stat-top">
        最近编译失败<span class="stat-icon red"><CircleAlert :size="18" /></span>
      </div>
      <div class="stat-number">{{ counts.errors }}<span>位同学</span></div>
      <div class="stat-foot">查看原始诊断，找到问题所在 <ArrowUpRight :size="13" /></div></button
    ><button class="stat-card" @click="filter = '请求帮助'">
      <div class="stat-top">
        待处理求助<span class="stat-icon amber"><Hand :size="18" /></span>
      </div>
      <div class="stat-number">{{ counts.help }}<span>条请求</span></div>
      <div class="stat-foot amber-text">有同学正在等你 <ArrowRight :size="13" /></div>
    </button>
  </div>
  <div class="overview-columns">
    <section class="panel student-panel">
      <div class="panel-heading">
        <div class="section-heading">
          <h2>课堂巡视</h2>
          <span class="subtle-count">{{ counts.total }}</span
          ><span class="sync-label"><Radio :size="13" />同步状态示例</span>
        </div>
        <button class="icon-button" aria-label="列表视图" @click="notify('当前为学生列表视图')">
          <LayoutList :size="17" />
        </button>
      </div>
      <div class="filter-tabs">
        <button
          v-for="f in filters"
          :key="f.label"
          :class="{ selected: filter === f.label }"
          @click="filter = f.label"
        >
          {{ f.label }}<span>{{ f.count }}</span>
        </button>
      </div>
      <div class="table-controls">
        <label class="search-field"
          ><Search :size="16" /><input
            ref="searchInput"
            v-model="search"
            aria-label="搜索学生"
            placeholder="搜索姓名或学号…"
          /><kbd>⌘ K</kbd></label
        ><label class="select-wrap"
          ><SlidersHorizontal :size="14" /><select v-model="exercise" aria-label="按练习筛选">
            <option>全部练习</option>
            <option v-for="e in exercises.filter((e) => e.status === '已发布')" :key="e.id">
              {{ e.title }}
            </option></select
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
              v-for="(s, index) in visible"
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
                <span class="table-exercise">{{ studentExercise(s).title }}</span
                ><small class="cell-secondary">{{ s.online ? '草稿已保存' : '最近保存 v8' }}</small>
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
      <div class="table-footer">
        显示 {{ visible.length }} 位学生
        <span>点击学生，查看代码与运行记录 <ArrowUpRight :size="13" /></span>
      </div>
    </section>
    <aside class="overview-aside">
      <section class="panel current-exercise">
        <div class="panel-heading">
          <h2>当前推荐练习</h2>
          <BookOpen :size="17" class="muted" />
        </div>
        <div class="exercise-feature">
          <span class="topic-label">练习 {{ recommendedIndex }} · {{ recommended.topic }}</span>
          <h3>{{ recommended.title }}</h3>
          <p>{{ recommended.description.split('\n')[0] }}</p>
          <div class="exercise-progress">
            <span>主动提交进度</span><strong>{{ counts.submitted }} / {{ counts.total }}</strong>
          </div>
          <div class="progress-track">
            <i :style="{ width: (counts.submitted / counts.total) * 100 + '%' }" />
          </div>
          <Button variant="outline" class="w-full" @click="router.push('/teacher/exercises')"
            >管理练习 <ArrowRight
          /></Button>
        </div>
      </section>
      <section class="panel help-panel">
        <div class="panel-heading">
          <h2>需要你的关注</h2>
          <span class="notification-dot" />
        </div>
        <div v-for="s in students.filter((s) => s.help)" :key="s.id" class="help-item">
          <div class="help-item-heading">
            <strong>{{ s.name }}</strong
            ><small>{{ s.activity }}</small>
          </div>
          <p>
            {{
              s.id === 's01'
                ? '老师，这里为什么提示缺少分号？'
                : s.id === 's04'
                  ? '循环变量应该在哪里定义呢？'
                  : '程序一直没有输出，可以帮我看看吗？'
            }}
          </p>
          <button @click="router.push('/teacher/students/' + s.id)">
            查看并辅导 <ArrowUpRight :size="13" />
          </button>
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
      <input
        :value="`${origin}/join?code=${demo.inviteCode}`"
        readonly
        aria-label="邀请链接"
      /><Button variant="outline" @click="copyInvite"
        ><Check v-if="copied" /><Copy v-else />{{ copied ? '已复制' : '复制链接' }}</Button
      >
    </div>
    <p class="form-hint">演示邀请 · 有效期 7 天 · 加入后由教师确认</p>
    <Button variant="outline" class="w-full" @click="regenerateInvite"
      >重新生成课堂码</Button
    ></Modal
  >
</template>
