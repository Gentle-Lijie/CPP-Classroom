<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  Plus,
  Search,
  ArrowUpRight,
  Users,
  BookOpen,
  ArrowRight,
  GraduationCap,
  FolderOpen,
  KeyRound,
  CalendarDays,
} from '@lucide/vue'
import { Button } from '@/components/ui/button'
import Modal from '@/components/classroom/Modal.vue'
import { classrooms, tone, notify, refresh, selectClass, reportError } from '@/data/demo'
import { api } from '@/lib/api'
const route = useRoute()
const router = useRouter()
const student = computed(() => route.path.startsWith('/student'))
const search = ref('')
const filter = ref('全部课堂')
const create = ref(false)
const name = ref('')
const description = ref('')
const visible = computed(() =>
  classrooms.filter(
    (c) =>
      c.name.includes(search.value) && (filter.value === '全部课堂' || c.status === filter.value),
  ),
)
async function add() {
  try {
    await api('/classes', 'POST', { name: name.value.trim(), description: description.value })
    await refresh()
    create.value = false
    name.value = ''
    description.value = ''
    notify('课堂已创建')
  } catch (e) {
    reportError(e)
  }
}
async function enter(id: string) {
  try {
    await selectClass(id)
    await router.push(student.value ? '/student/workspace' : '/teacher/overview')
  } catch (e) {
    reportError(e)
  }
}
</script>
<template>
  <div class="page-heading">
    <div>
      <div class="heading-meta">{{ student ? '学生工作台' : '教师工作台' }}</div>
      <h1>
        我的课堂<span class="heading-count">{{ classrooms.length }}</span>
      </h1>
      <p>
        {{ student ? '查看已加入的课堂和当前练习。' : '管理课堂、学生名单与练习。' }}
      </p>
    </div>
    <Button @click="student ? router.push('/join') : (create = true)"
      ><KeyRound v-if="student" /><Plus v-else />{{ student ? '加入课堂' : '创建课堂' }}</Button
    >
  </div>
  <div class="class-toolbar">
    <div class="segmented">
      <button
        v-for="f in ['全部课堂', '进行中', '未开始', '已归档']"
        :key="f"
        :class="{ selected: filter === f }"
        @click="filter = f"
      >
        {{ f }}
      </button>
    </div>
    <label class="search-field"
      ><Search :size="16" /><input v-model="search" placeholder="搜索课堂…" aria-label="搜索课堂"
    /></label>
  </div>
  <div class="class-grid">
    <article v-for="c in visible" :key="c.id" class="class-card">
      <div class="class-card-cover">
        <span class="status" :class="tone(c.status)"
          ><span class="status-dot" />{{ c.status }}</span
        >
      </div>
      <div class="class-card-body">
        <span class="muted text-xs"
          >{{ c.status === '已归档' ? '2026 夏季学期' : '2026 秋季学期' }} · {{ c.teacher }}</span
        >
        <h2>{{ c.name }}</h2>
        <p>{{ c.description }}</p>
        <div class="class-card-meta">
          <span><Users :size="15" />{{ c.students }} 位学生</span
          ><span><BookOpen :size="15" />{{ c.exercises ?? 0 }} 个练习</span>
        </div>
        <div class="class-card-footer">
          <span
            ><CalendarDays :size="14" />{{
              c.status === '进行中'
                ? '课堂已开放'
                : c.status === '已归档'
                  ? '作品只读保留'
                  : '等待课堂开放'
            }}</span
          ><Button variant="ghost" @click="enter(c.id)"
            >{{ c.status === '已归档' ? '查看作品' : '进入课堂' }}<ArrowUpRight
          /></Button>
        </div>
      </div>
    </article>
    <button v-if="!student" class="create-class-card" @click="create = true">
      <span><Plus :size="25" /></span>
      <h3>新建课堂</h3>
      <p>创建课堂，邀请学生一起写代码</p>
      <strong>创建课堂 <ArrowRight :size="14" /></strong>
    </button>
  </div>
  <div v-if="!visible.length" class="panel empty-state">
    <FolderOpen :size="30" />
    <h3>这里还没有课堂</h3>
    <p>调整筛选条件，或者创建你的第一个课堂。</p>
  </div>
  <div class="class-tip">
    <GraduationCap :size="21" />
    <div>
      <strong>{{ student ? '课堂访问说明' : '课堂工作区' }}</strong>
      <p>
        {{
          student
            ? '课堂内的教师可以查看你的代码和运行记录，以便及时提供帮助。'
            : '每位学生拥有独立的代码工作区，教师可以巡视过程、查看求助并选择作品讲解。'
        }}
      </p>
    </div>
  </div>
  <Modal
    v-model:open="create"
    title="创建新课堂"
    description="填写课堂名称和说明，创建后可继续设置。"
    ><form class="form-stack" @submit.prevent="add">
      <label
        >课堂名称<input
          v-model="name"
          required
          maxlength="50"
          placeholder="例如：C++ 基础 · 秋季二班" /></label
      ><label
        >课堂说明<textarea v-model="description" rows="3" placeholder="介绍课程目标、上课安排…" />
      </label>
      <div class="info-box">默认 C++17 · 源文件名由题目指定 · 最多 50 人</div>
      <div class="modal-actions">
        <Button type="button" variant="outline" @click="create = false">取消</Button
        ><Button type="submit">创建课堂</Button>
      </div>
    </form></Modal
  >
</template>
