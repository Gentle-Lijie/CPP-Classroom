<script setup lang="ts">
import PythonBeta from '@/components/classroom/PythonBeta.vue'
import { Alert } from '@/components/ui/alert'
import ThemeToggle from '@/components/classroom/ThemeToggle.vue'
import { Input } from '@/components/ui/input'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
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
const { t } = useI18n()
import { statusLabel } from '@/lib/status-labels'
const filterKeys = ['all', 'help', 'compileError', 'submitted'] as const
type FilterKey = (typeof filterKeys)[number]
const filter = ref<FilterKey>('all')
const blocked = ref('')
const online = computed(() => students.filter((s) => s.online))
const visible = computed(() =>
  online.value.filter(
    (s) =>
      (s.name + s.number).toLowerCase().includes(search.value.trim().toLowerCase()) &&
      (filter.value === 'all' ||
        (filter.value === 'help' && s.help) ||
        (filter.value === 'compileError' && s.status === 'compile_error') ||
        (filter.value === 'submitted' && s.submitted)),
  ),
)
const filterTabs = computed(() =>
  filterKeys.map((key) => ({ key, label: t(`teaching.monitor.filters.${key}`) })),
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
    t('teaching.monitor.noExercise')
  )
}
function clearFilters() {
  search.value = ''
  filter.value = 'all'
}
</script>
<template>
  <main class="monitor-window">
    <header class="monitor-header">
      <div class="inline-items">
        <span class="monitor-icon"><Users :size="21" /></span>
        <div>
          <h1>
            {{ t('teaching.monitor.title') }}
            <span>{{ online.length }}</span>
          </h1>
          <p>{{ activeClassroom.name }}</p>
        </div>
      </div>
      <div class="inline-items">
        <ThemeToggle />
        <Button as-child variant="outline" size="sm">
          <RouterLink to="/teacher/teach" target="_blank">
            {{ t('teaching.monitor.teachPage') }}
            <ArrowUpRight :size="13" />
          </RouterLink>
        </Button>
        <span class="demo-tag">{{ t('teaching.monitor.roster') }}</span>
        <Button variant="outline" size="sm" @click="close">
          <X />
          {{ t('teaching.monitor.closeWindow') }}
        </Button>
      </div>
    </header>
    <div class="monitor-window-body">
      <Alert v-if="blocked" type="warning">
        {{ t('teaching.monitor.popupBlocked') }}
        <a :href="blocked" target="_blank" rel="noopener">{{ t('teaching.monitor.openDetail') }}</a>
      </Alert>
      <div class="monitor-controls">
        <div class="segmented">
          <Button
            v-for="f in filterTabs"
            :key="f.key"
            variant="plain"
            :class="{ selected: filter === f.key }"
            @click="filter = f.key">
            {{ f.label }}
          </Button>
        </div>
        <label class="search-field">
          <Search :size="16" />
          <Input
            v-model="search"
            :aria-label="t('teaching.monitor.searchLabel')"
            :placeholder="t('teaching.monitor.searchPlaceholder')" />
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
          :aria-label="t('teaching.monitor.inspect', { name: s.name })"
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
                {{ statusLabel(s.status) }}
              </span>
            </div>
            <span v-if="s.summary" class="monitor-summary" :title="s.summary">
              {{ s.summary }}
            </span>
          </div>
          <div class="monitor-card-footer">
            <span v-if="s.help" class="help-label">
              <Hand :size="13" />
              {{ t('teaching.monitor.helpPending') }}
            </span>
            <span v-else-if="s.submitted" class="submitted-label">
              <Check :size="13" />
              {{ t('teaching.monitor.submitted') }}
            </span>
            <span v-else>{{ t('teaching.monitor.viewDraft') }}</span>
            <span>{{ s.activity }}</span>
          </div>
        </ContentPanel>
      </div>
      <Pagination
        v-if="visible.length"
        v-model:page="page"
        v-model:page-size="pageSize"
        :total="visible.length"
        :unit="t('teaching.monitor.unit')" />
      <div v-if="!visible.length" class="empty-state">
        <Monitor :size="29" />
        <h2>
          {{
            online.length ? t('teaching.monitor.emptyFiltered') : t('teaching.monitor.emptyOnline')
          }}
        </h2>
        <p>
          {{
            online.length
              ? t('teaching.monitor.emptyFilteredHint')
              : t('teaching.monitor.emptyOnlineHint')
          }}
        </p>
        <Button v-if="search || filter !== 'all'" variant="outline" @click="clearFilters">
          {{ t('teaching.monitor.clearFilters') }}
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
