<script setup lang="ts">
import PythonBeta from '@/components/classroom/PythonBeta.vue'
import { Alert } from '@/components/ui/alert'
import ThemeToggle from '@/components/classroom/ThemeToggle.vue'
import { Input } from '@/components/ui/input'
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Users, Search, ArrowUpRight, Hand, X, Monitor, Check } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { activeClassroom, demo, exercises, students, tone, type Student } from '@/data/demo'
import Pagination from '@/components/classroom/Pagination.vue'
import ContentPanel from '@/components/classroom/ContentPanel.vue'
import { usePagination } from '@/composables/usePagination'
import { openTeachingWindow } from '@/lib/teaching-windows'
const search = ref('')
const router = useRouter()
const filter = ref('全部在线')
const blocked = ref('')
const online = computed(() => students.filter((s) => s.online))
const visible = computed(() =>
  online.value.filter(
    (s) =>
      (s.name + s.number).toLowerCase().includes(search.value.trim().toLowerCase()) &&
      (filter.value === '全部在线' ||
        (filter.value === '请求帮助' && s.help) ||
        (filter.value === '编译失败' && s.status === '编译失败') ||
        (filter.value === '已提交' && s.submitted)),
  ),
)
const { page, pageSize, paged } = usePagination(visible, [search, filter], 10)
function inspect(id: string) {
  const url = '/teacher/inspect/' + id
  blocked.value = openTeachingWindow(
    url,
    'student-inspect-' + demo.classroomId + '-' + id,
    1240,
    900,
  )
    ? ''
    : url
}
function close() {
  if (window.opener) window.close()
  else router.push('/teacher/teach')
}
function exerciseTitle(student: Student) {
  return (
    exercises.find((e) => e.id === (student.exerciseId ?? demo.recommended))?.title ??
    '尚未选择练习'
  )
}
function clearFilters() {
  search.value = ''
  filter.value = '全部在线'
}
</script>
<template>
  <main class="monitor-window">
    <header class="monitor-header">
      <div class="inline-items">
        <span class="monitor-icon"><Users :size="21" /></span>
        <div>
          <h1>
            在线课堂巡视
            <span>{{ online.length }}</span>
          </h1>
          <p>{{ activeClassroom.name }}</p>
        </div>
      </div>
      <div class="inline-items">
        <ThemeToggle />
        <Button as-child variant="outline" size="sm">
          <RouterLink to="/teacher/teach" target="_blank">
            授课页
            <ArrowUpRight :size="13" />
          </RouterLink>
        </Button>
        <span class="demo-tag">课堂实时名册</span>
        <Button variant="outline" size="sm" @click="close">
          <X />
          关闭窗口
        </Button>
      </div>
    </header>
    <div class="monitor-window-body">
      <Alert v-if="blocked" type="warning">
        浏览器拦截了弹窗，请允许本站弹出窗口，或
        <a :href="blocked" target="_blank" rel="noopener">点此打开学生详情</a>
        。
      </Alert>
      <div class="monitor-controls">
        <div class="segmented">
          <Button
            v-for="f in ['全部在线', '请求帮助', '编译失败', '已提交']"
            :key="f"
            variant="plain"
            :class="{ selected: filter === f }"
            @click="filter = f">
            {{ f }}
          </Button>
        </div>
        <label class="search-field">
          <Search :size="16" />
          <Input v-model="search" aria-label="搜索在线学生" placeholder="姓名或学号" />
        </label>
      </div>
      <div class="monitor-student-grid">
        <ContentPanel
          v-for="s in paged"
          :key="s.id"
          as="button"
          type="button"
          compact
          interactive
          class="monitor-student-card"
          content-class="monitor-card-content"
          :aria-label="`查看${s.name}的课堂进度`"
          @click="inspect(s.id)">
          <div class="monitor-card-person">
            <span class="student-avatar">
              {{ s.name.slice(-2) }}
              <i class="online" />
            </span>
            <span class="monitor-identity">
              <strong :title="s.name">{{ s.name }}</strong>
              <small :title="s.number">{{ s.number }}</small>
            </span>
            <ArrowUpRight :size="17" class="ml-auto" />
          </div>
          <div class="monitor-card-work">
            <div class="monitor-work-state">
              <span class="monitor-exercise-name" :title="exerciseTitle(s)">
                {{ exerciseTitle(s) }}
                <span v-if="s.language === 'python'">
                  · Python
                  <PythonBeta />
                </span>
              </span>
              <span class="status" :class="tone(s.status)">
                <span class="status-dot" />
                {{ s.status }}
              </span>
            </div>
            <span v-if="s.summary" class="monitor-summary" :title="s.summary">
              {{ s.summary }}
            </span>
          </div>
          <div class="monitor-card-footer">
            <span v-if="s.help" class="help-label">
              <Hand :size="13" />
              待处理求助
            </span>
            <span v-else-if="s.submitted" class="submitted-label">
              <Check :size="13" />
              已提交
            </span>
            <span v-else>查看草稿</span>
            <span>{{ s.activity }}</span>
          </div>
        </ContentPanel>
      </div>
      <Pagination
        v-if="visible.length"
        v-model:page="page"
        v-model:page-size="pageSize"
        :total="visible.length"
        unit="位在线学生" />
      <div v-if="!visible.length" class="empty-state">
        <Monitor :size="29" />
        <h2>{{ online.length ? '没有匹配的在线学生' : '当前没有在线学生' }}</h2>
        <p>
          {{
            online.length
              ? '可以清除搜索条件，或切换其他筛选。'
              : '请让学生进入已开放课堂的练习工作区，在线状态会自动更新。'
          }}
        </p>
        <Button v-if="search || filter !== '全部在线'" variant="outline" @click="clearFilters">
          清除筛选
        </Button>
      </div>
    </div>
  </main>
</template>

<style scoped>
.monitor-student-card {
  aspect-ratio: 2 / 1;
  min-height: 0;
  overflow: hidden;
}
.monitor-student-card :deep(.monitor-card-content) {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  height: 100%;
  min-height: 0;
}
.monitor-card-person {
  min-width: 0;
}
.monitor-identity {
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex: 1;
  min-width: 0;
}
.monitor-identity strong,
.monitor-identity small,
.monitor-exercise-name,
.monitor-summary {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.monitor-identity small {
  max-width: 55%;
}
.monitor-card-work {
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  align-self: center;
}
.monitor-work-state {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
}
.monitor-exercise-name {
  flex: 1;
  min-width: 0;
}
.monitor-work-state .status {
  flex-shrink: 0;
}
.monitor-summary {
  display: block;
  font-size: 14px;
  color: var(--ui-secondary);
}
.monitor-card-person small,
.monitor-card-footer {
  font-size: 14px;
}
.monitor-controls {
  min-width: 0;
}
.monitor-controls > * {
  min-width: 0;
}
.monitor-header .inline-items {
  flex-wrap: wrap;
}
</style>
