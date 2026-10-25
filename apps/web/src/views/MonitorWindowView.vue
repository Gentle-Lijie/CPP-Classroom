<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Users, Search, ArrowUpRight, Hand, X, Monitor, Check, Radio } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { activeClassroom, demo, exercises, students, tone, type Student } from '@/data/demo'
import { openTeachingWindow } from '@/lib/teaching-windows'
const search = ref('')
const router = useRouter()
const filter = ref('全部在线')
const blocked = ref('')
const online = computed(() => students.filter((s) => s.online))
const visible = computed(() =>
  online.value.filter(
    (s) =>
      (s.name + s.number).includes(search.value) &&
      (filter.value === '全部在线' ||
        (filter.value === '请求帮助' && s.help) ||
        (filter.value === '编译失败' && s.status === '编译失败') ||
        (filter.value === '已提交' && s.submitted)),
  ),
)
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
    exercises.find((e) => e.id === (student.exerciseId ?? demo.recommended))?.title ?? '累加求和'
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
            在线课堂巡视<span>{{ online.length }}</span>
          </h1>
          <p>{{ activeClassroom.name }}</p>
        </div>
      </div>
      <div class="inline-items">
        <span class="demo-tag">示例在线名册</span
        ><Button variant="outline" size="sm" @click="close"><X />关闭窗口</Button>
      </div>
    </header>
    <div class="monitor-window-body">
      <div class="monitor-explainer">
        <Radio :size="16" /><span
          >点击任意学生，在独立窗口查看代码与处理求助；可同时打开多位学生。</span
        ><RouterLink to="/teacher/teach" target="_blank"
          >授课页<ArrowUpRight :size="13"
        /></RouterLink>
      </div>
      <div v-if="blocked" class="warning-box popup-blocked">
        浏览器拦截了弹窗，请允许本站弹出窗口，或
        <a :href="blocked" target="_blank" rel="noopener">点此打开学生详情</a>。
      </div>
      <div class="monitor-controls">
        <div class="segmented">
          <button
            v-for="f in ['全部在线', '请求帮助', '编译失败', '已提交']"
            :key="f"
            :class="{ selected: filter === f }"
            @click="filter = f"
          >
            {{ f }}
          </button>
        </div>
        <label class="search-field"
          ><Search :size="16" /><input
            v-model="search"
            aria-label="搜索在线学生"
            placeholder="姓名或学号"
        /></label>
      </div>
      <div class="monitor-student-grid">
        <button
          v-for="s in visible"
          :key="s.id"
          class="monitor-student-card"
          @click="inspect(s.id)"
        >
          <div class="monitor-card-person">
            <span class="student-avatar">{{ s.name.slice(-2) }}<i class="online" /></span
            ><span
              ><strong>{{ s.name }}</strong
              ><small>{{ s.number }}</small></span
            ><ArrowUpRight :size="17" class="ml-auto" />
          </div>
          <span class="monitor-exercise-name">{{ exerciseTitle(s) }}</span
          ><span class="status" :class="tone(s.status)"
            ><span class="status-dot" />{{ s.status }}</span
          >
          <p>{{ s.summary }}</p>
          <div class="monitor-card-footer">
            <span v-if="s.help" class="help-label"><Hand :size="13" />待处理求助</span
            ><span v-else-if="s.submitted" class="submitted-label"><Check :size="13" />已提交</span
            ><span v-else>查看草稿</span><span>{{ s.activity }}</span>
          </div>
        </button>
      </div>
      <div v-if="!visible.length" class="empty-state">
        <Monitor :size="29" />
        <h2>{{ online.length ? '没有匹配的在线学生' : '当前没有在线学生' }}</h2>
        <p>可以清除搜索条件，或切换其他筛选。</p>
        <Button variant="outline" @click="clearFilters">清除筛选</Button>
      </div>
    </div>
    <footer class="monitor-footer">原型窗口间共享本机数据，实际在线状态和远程同步尚未接入。</footer>
  </main>
</template>
