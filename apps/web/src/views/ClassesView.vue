<script setup lang="ts">
import { useActionFeedback } from '@/composables/useActionFeedback'
import { Input } from '@/components/ui/input'
import { Form } from '@/components/ui/form'
import { Textarea } from '@/components/ui/textarea'
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  Plus,
  Search,
  ArrowUpRight,
  Users,
  BookOpen,
  ArrowRight,
  FolderOpen,
  KeyRound,
  CalendarDays,
} from '@lucide/vue'
import { Button } from '@/components/ui/button'
import Modal from '@/components/classroom/Modal.vue'
import Pagination from '@/components/classroom/Pagination.vue'
import { usePagination } from '@/composables/usePagination'
import { classrooms, tone, notify, selectClass, reportError, canCreateClassroom } from '@/data/demo'
import { api } from '@/lib/api'
import { classroomRoleLabels } from '@classroom/contracts'
const router = useRouter()
const search = ref('')
const filter = ref('全部课堂')
const create = ref(false)
const name = ref('')
const description = ref('')
const busy = ref(false),
  error = ref('')
const entering = ref('')
function openCreate() {
  error.value = ''
  create.value = true
}
const visible = computed(() =>
  classrooms.filter(
    (c) =>
      c.name.toLowerCase().includes(search.value.trim().toLowerCase()) &&
      (filter.value === '全部课堂' || c.status === filter.value),
  ),
)
const { page, pageSize, paged } = usePagination(visible, [search, filter], 10)
async function add() {
  if (busy.value) return
  error.value = ''
  if (!name.value.trim()) {
    error.value = '请输入课堂名称'
    return
  }
  busy.value = true
  try {
    const created = await api<{ id: string }>('/classes', 'POST', {
      name: name.value.trim(),
      description: description.value,
    })
    create.value = false
    name.value = ''
    description.value = ''
    notify('课堂已创建')
    try {
      await selectClass(created.id)
      await router.push('/teacher/overview')
    } catch {
      notify('课堂已创建，列表刷新失败，请重试连接后进入', 'error')
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : '创建失败'
  } finally {
    busy.value = false
  }
}
async function enter(id: string) {
  if (entering.value) return
  entering.value = id
  try {
    await selectClass(id)
    const target = classrooms.find((c) => c.id === id)
    await router.push(
      target?.classroomRole === 'student' ? '/student/workspace' : '/teacher/overview',
    )
  } catch (e) {
    reportError(e)
  } finally {
    entering.value = ''
  }
}
useActionFeedback(error)
</script>
<template>
  <div class="page-heading">
    <div>
      <div class="heading-meta">课堂列表 · 按课堂身份进入</div>
      <h1>
        我的课堂
        <span class="heading-count">{{ classrooms.length }}</span>
      </h1>
    </div>
    <div class="flex gap-2">
      <Button variant="outline" @click="router.push('/join')">
        <KeyRound />
        加入课堂
      </Button>
      <Button v-if="canCreateClassroom" data-guide="class-add" @click="openCreate">
        <Plus />
        创建课堂
      </Button>
    </div>
  </div>
  <div class="class-toolbar">
    <div class="segmented">
      <Button
        v-for="f in ['全部课堂', '进行中', '未开始', '已关闭', '已归档']"
        :key="f"
        :data-guide-filter="f"
        variant="plain"
        :class="{ selected: filter === f }"
        @click="filter = f">
        {{ f }}
      </Button>
    </div>
    <label class="search-field">
      <Search :size="16" />
      <Input v-model="search" placeholder="搜索课堂…" aria-label="搜索课堂" />
    </label>
  </div>
  <div class="class-grid">
    <article v-for="c in paged" :key="c.id" class="class-card">
      <div class="class-card-cover">
        <span class="status" :class="tone(c.status)">
          <span class="status-dot" />
          {{ c.membershipStatus === 'pending' ? '等待审批' : c.status }}
        </span>
      </div>
      <div class="class-card-body">
        <span class="muted text-xs">
          {{ c.teacher ?? '课堂教师' }} · 我的身份：{{ classroomRoleLabels[c.classroomRole] }}
        </span>
        <h2>{{ c.name }}</h2>
        <p>{{ c.description }}</p>
        <div class="class-card-meta">
          <span>
            <Users :size="15" />
            {{ c.students }} 位学生
          </span>
          <span>
            <BookOpen :size="15" />
            {{ c.exercises ?? 0 }} 个练习
          </span>
        </div>
        <div class="class-card-footer">
          <span>
            <CalendarDays :size="14" />
            {{
              c.status === '进行中'
                ? '课堂已开放'
                : c.status === '已归档'
                  ? '作品只读保留'
                  : c.status === '已关闭'
                    ? '课堂已关闭，可查看作品'
                    : '等待课堂开放'
            }}
          </span>
          <Button
            variant="outline"
            :disabled="
              !!entering ||
              c.membershipStatus === 'pending' ||
              (c.classroomRole === 'student' && !c.exercises)
            "
            :data-disabled-reason="
              entering
                ? '正在进入课堂，请稍候'
                : c.membershipStatus === 'pending'
                  ? '加入申请正在等待教师审批'
                  : '课堂暂无可用练习，请等待教师发布'
            "
            data-guide="class-enter"
            @click="enter(c.id)">
            {{
              entering === c.id
                ? '正在进入…'
                : c.membershipStatus === 'pending'
                  ? '等待教师审批'
                  : c.classroomRole === 'student' && !c.exercises
                    ? '等待教师发布练习'
                    : c.status === '已归档' || c.status === '已关闭'
                      ? '查看作品'
                      : '进入课堂'
            }}
            <ArrowUpRight />
          </Button>
        </div>
      </div>
    </article>
    <Button
      v-if="canCreateClassroom && visible.length"
      variant="plain"
      class="create-class-card"
      @click="openCreate">
      <span><Plus :size="25" /></span>
      <h3>新建课堂</h3>
      <strong>
        创建课堂
        <ArrowRight :size="14" />
      </strong>
    </Button>
  </div>
  <Pagination
    v-if="visible.length > 10"
    v-model:page="page"
    v-model:page-size="pageSize"
    :total="visible.length"
    unit="个课堂" />
  <div v-if="!visible.length" class="panel empty-state">
    <FolderOpen :size="30" />
    <h3>{{ search || filter !== '全部课堂' ? '没有找到匹配的课堂' : '这里还没有课堂' }}</h3>
    <p>
      {{
        canCreateClassroom
          ? '调整筛选条件，或创建课堂、使用课堂码申请加入。'
          : '通过教师提供的课堂码申请加入，或调整筛选条件。'
      }}
    </p>
    <Button v-if="!search && filter === '全部课堂'" @click="router.push('/join')">
      申请加入课堂
    </Button>
  </div>

  <Modal v-model:open="create" title="创建新课堂" :busy="busy">
    <Form class="form-stack" @submit.prevent="add">
      <label>
        课堂名称
        <Input v-model="name" required maxlength="100" placeholder="例如：C++ 基础 · 秋季二班" />
      </label>
      <label>
        课堂说明
        <Textarea
          v-model="description"
          rows="3"
          maxlength="5000"
          placeholder="介绍课程目标、上课安排…" />
      </label>

      <div class="modal-actions">
        <Button type="button" variant="outline" @click="create = false">取消</Button>
        <Button type="submit" :disabled="busy" :data-disabled-reason="'正在创建课堂，请稍候'">
          {{ busy ? '正在创建…' : '创建课堂' }}
        </Button>
      </div>
    </Form>
  </Modal>
</template>
