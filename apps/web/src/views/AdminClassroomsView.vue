<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Search, RefreshCw } from '@lucide/vue'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Alert } from '@/components/ui/alert'
import ContentPanel from '@/components/classroom/ContentPanel.vue'
import Pagination from '@/components/classroom/Pagination.vue'
import { usePagination } from '@/composables/usePagination'

const { t } = useI18n()
import { statusLabel } from '@/lib/status-labels'
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
// 筛选值直接使用接口返回的中文状态值，仅展示文案走 i18n
const statusTabs = [
  { value: '全部', key: 'all' },
  { value: 'ongoing', key: 'ongoing' },
  { value: 'not_started', key: 'notStarted' },
  { value: 'closed', key: 'closed' },
  { value: 'archived', key: 'archived' },
] as const
const filter = ref('全部')
const statuses = computed(() =>
  statusTabs.map((s) => ({ value: s.value, label: t(`admin.classrooms.status.${s.key}`) })),
)
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
    error.value = e instanceof Error ? e.message : t('admin.classrooms.loadFailed')
  } finally {
    loading.value = false
  }
}
onMounted(load)
</script>

<template>
  <div class="page-heading">
    <div>
      <div class="heading-meta">{{ t('admin.platformAdmin') }}</div>
      <h1>{{ t('admin.classrooms.title') }}</h1>
    </div>
    <Button variant="outline" :disabled="loading" @click="load">
      <RefreshCw :class="{ 'animate-spin': loading }" />
      {{ t('common.refresh') }}
    </Button>
  </div>
  <Alert v-if="error" type="error">{{ error }}</Alert>
  <ContentPanel as="section" direct class="panel-fill" :aria-label="t('admin.classrooms.listAria')">
    <template #header>
      <div class="filter-tabs borderless" role="group" :aria-label="t('admin.classrooms.tabsAria')">
        <Button
          v-for="status in statuses"
          :key="status.value"
          variant="plain"
          :class="{ selected: filter === status.value }"
          :aria-pressed="filter === status.value"
          @click="filter = status.value">
          {{ status.label }}
        </Button>
      </div>
    </template>
    <div class="table-controls">
      <label class="search-field">
        <Search :size="16" />
        <Input
          v-model="search"
          :aria-label="t('admin.classrooms.searchLabel')"
          :placeholder="t('admin.classrooms.searchPlaceholder')" />
      </label>
    </div>
    <div class="table-scroll">
      <table>
        <thead>
          <tr>
            <th>{{ t('admin.classrooms.colClassroom') }}</th>
            <th>{{ t('admin.classrooms.colCreator') }}</th>
            <th>{{ t('admin.classrooms.colOwner') }}</th>
            <th>{{ t('admin.classrooms.colStatus') }}</th>
            <th>{{ t('admin.classrooms.colStudents') }}</th>
            <th>{{ t('admin.classrooms.colInviteCode') }}</th>
            <th>{{ t('admin.classrooms.colInviteExpiry') }}</th>
            <th>{{ t('admin.classrooms.colCreatedAt') }}</th>
            <th>{{ t('admin.classrooms.colActions') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="classroom in paged" :key="classroom.id">
            <td>{{ classroom.name }}</td>
            <td class="classroom-person">
              {{ classroom.creatorName ?? t('admin.classrooms.notRecorded') }}
              <small v-if="classroom.creatorUsername" class="cell-secondary">
                {{ classroom.creatorUsername }}
              </small>
            </td>
            <td class="classroom-person">
              {{ classroom.ownerName }}
              <small class="cell-secondary">{{ classroom.ownerUsername }}</small>
            </td>
            <td>{{ statusLabel(classroom.status) }}</td>
            <td>{{ classroom.studentCount }}</td>
            <td>{{ classroom.inviteCode }}</td>
            <td>
              {{
                classroom.inviteExpiresAt
                  ? new Date(classroom.inviteExpiresAt).toLocaleString(undefined, {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    })
                  : t('admin.classrooms.noExpiry')
              }}
              <span
                v-if="
                  classroom.inviteExpiresAt && Date.parse(classroom.inviteExpiresAt) < Date.now()
                "
                class="muted">
                {{ t('admin.classrooms.expired') }}
              </span>
            </td>
            <td>{{ new Date(classroom.createdAt).toLocaleDateString() }}</td>
            <td>
              <RouterLink
                class="text-button"
                :to="{ path: '/admin/classes', query: { classroom: classroom.id } }">
                {{ t('admin.classrooms.managePeople') }}
              </RouterLink>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-if="!paged.length" class="empty-state">
      {{
        loading
          ? t('admin.classrooms.loadingState')
          : error
            ? t('admin.classrooms.errorState')
            : t('admin.classrooms.emptyState')
      }}
    </p>
    <Pagination
      v-model:page="page"
      v-model:page-size="pageSize"
      :total="visible.length"
      :busy="loading"
      :unit="t('admin.classrooms.unit')" />
  </ContentPanel>
</template>

<style scoped>
.classroom-person {
  max-width: 160px;
  overflow-wrap: anywhere;
}
</style>
