<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Search, RefreshCw } from '@lucide/vue'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Alert } from '@/components/ui/alert'
import ContentPanel from '@/components/classroom/ContentPanel.vue'
import Pagination from '@/components/classroom/Pagination.vue'
import { usePagination } from '@/composables/usePagination'

interface Classroom {
  id: string
  name: string
  status: string
  ownerName: string
  ownerUsername: string
  creatorName: string | null
  creatorUsername: string | null
  inviteCode: string
  inviteExpiresAt: string | null
  createdAt: string
  studentCount: number
}
const classrooms = ref<Classroom[]>([])
const loading = ref(false)
const error = ref('')
const search = ref('')
const filter = ref('全部')
const statuses = ['全部', '进行中', '未开始', '已关闭', '已归档']
const visible = computed(() => {
  const term = search.value.trim().toLowerCase()
  return classrooms.value.filter(
    (c) =>
      (filter.value === '全部' || c.status === filter.value) &&
      `${c.name} ${c.ownerName} ${c.ownerUsername} ${c.creatorName ?? ''} ${c.creatorUsername ?? ''} ${c.inviteCode}`
        .toLowerCase()
        .includes(term),
  )
})
const { page, pageSize, paged } = usePagination(visible, [search, filter])
async function load() {
  if (loading.value) return
  loading.value = true
  error.value = ''
  try {
    classrooms.value = await api<Classroom[]>('/admin/classes')
  } catch (e) {
    error.value = e instanceof Error ? e.message : '课堂读取失败'
  } finally {
    loading.value = false
  }
}
onMounted(load)
</script>

<template>
  <div class="page-heading">
    <div>
      <div class="heading-meta">平台管理</div>
      <h1>课堂管理</h1>
    </div>
    <Button variant="outline" :disabled="loading" @click="load">
      <RefreshCw :class="{ 'animate-spin': loading }" />
      刷新
    </Button>
  </div>
  <Alert v-if="error" type="error">{{ error }}</Alert>
  <ContentPanel as="section" direct class="panel-fill" aria-label="平台课堂列表">
    <template #header>
      <div class="filter-tabs borderless" role="group" aria-label="筛选课堂状态">
        <Button
          v-for="status in statuses"
          :key="status"
          variant="plain"
          :class="{ selected: filter === status }"
          :aria-pressed="filter === status"
          @click="filter = status">
          {{ status }}
        </Button>
      </div>
    </template>
    <div class="table-controls">
      <label class="search-field">
        <Search :size="16" />
        <Input
          v-model="search"
          aria-label="搜索平台课堂"
          placeholder="搜索课堂、创建者、负责人或加入码" />
      </label>
    </div>
    <div class="table-scroll">
      <table>
        <thead>
          <tr>
            <th>课堂</th>
            <th>创建者</th>
            <th>负责人</th>
            <th>状态</th>
            <th>学生</th>
            <th>加入码</th>
            <th>加入码有效期</th>
            <th>创建时间</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="classroom in paged" :key="classroom.id">
            <td>{{ classroom.name }}</td>
            <td class="classroom-person">
              {{ classroom.creatorName ?? '未记录' }}
              <small v-if="classroom.creatorUsername" class="cell-secondary">
                {{ classroom.creatorUsername }}
              </small>
            </td>
            <td class="classroom-person">
              {{ classroom.ownerName }}
              <small class="cell-secondary">{{ classroom.ownerUsername }}</small>
            </td>
            <td>{{ classroom.status }}</td>
            <td>{{ classroom.studentCount }}</td>
            <td>{{ classroom.inviteCode }}</td>
            <td>
              {{
                classroom.inviteExpiresAt
                  ? new Date(classroom.inviteExpiresAt).toLocaleString(undefined, {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    })
                  : '无'
              }}
              <span
                v-if="
                  classroom.inviteExpiresAt && Date.parse(classroom.inviteExpiresAt) < Date.now()
                "
                class="muted">
                （已过期）
              </span>
            </td>
            <td>{{ new Date(classroom.createdAt).toLocaleDateString() }}</td>
            <td>
              <RouterLink
                class="text-button"
                :to="{ path: '/admin/classes', query: { classroom: classroom.id } }">
                管理人员
              </RouterLink>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-if="!paged.length" class="empty-state">
      {{ loading ? '正在加载课堂…' : error ? '课堂读取失败，请重试。' : '没有匹配的课堂。' }}
    </p>
    <Pagination
      v-model:page="page"
      v-model:page-size="pageSize"
      :total="visible.length"
      :busy="loading"
      unit="个课堂" />
  </ContentPanel>
</template>

<style scoped>
.classroom-person {
  max-width: 160px;
  overflow-wrap: anywhere;
}
</style>
