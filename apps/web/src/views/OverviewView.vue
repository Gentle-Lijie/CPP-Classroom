<script setup lang="ts">
import PythonBeta from '@/components/classroom/PythonBeta.vue'
import { Input } from '@/components/ui/input'
import { Select, SelectOption } from '@/components/ui/select'
import { computed, onMounted, onBeforeUnmount, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import {
  Users,
  CircleCheck,
  CircleAlert,
  Hand,
  Search,
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
import ContentPanel from '@/components/classroom/ContentPanel.vue'
import Pagination from '@/components/classroom/Pagination.vue'
import { usePagination } from '@/composables/usePagination'
import {
  students,
  isTeacher,
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
const { t } = useI18n()
import { statusLabel } from '@/lib/status-labels'
const search = ref('')
const filter = ref('all')
const exercise = ref('all')
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
  exercises.find((e) => e.id === activeClassroom.value.recommended && e.status === 'published'),
)
const recommendedSubmitted = computed(() => students.filter((s) => s.recommendedSubmitted).length)
const inviteExpires = computed(() =>
  activeClassroom.value.inviteExpiresAt
    ? new Date(activeClassroom.value.inviteExpiresAt).toLocaleString('zh-CN')
    : t('overview.invite.regeneratePending'),
)
const inviteExpired = computed(
  () =>
    !!activeClassroom.value.inviteExpiresAt &&
    new Date(activeClassroom.value.inviteExpiresAt).getTime() <= Date.now(),
)
const inviteAvailable = computed(
  () =>
    activeClassroom.value.settings?.allowJoin !== false &&
    !['closed', 'archived'].includes(activeClassroom.value.status),
)
const recommendedIndex = computed(
  () => exercises.findIndex((e) => e.id === recommended.value?.id) + 1,
)
function studentExercise(student: Student) {
  return exercises.find((e) => e.id === student.exerciseId)
}
const filters = computed(() => [
  { key: 'all', label: t('overview.filters.all'), count: counts.value.total },
  { key: 'online', label: t('overview.filters.online'), count: counts.value.online },
  { key: 'help', label: t('overview.filters.help'), count: counts.value.help },
  { key: 'errors', label: t('overview.filters.errors'), count: counts.value.errors },
  {
    key: 'abnormal',
    label: t('overview.filters.abnormal'),
    count: students.filter((s) =>
      ['timeout', 'runtime_error', 'platform_error', 'resource_limited'].includes(s.status),
    ).length,
  },
  { key: 'submitted', label: t('overview.filters.submitted'), count: counts.value.submitted },
  {
    key: 'offline',
    label: t('overview.filters.offline'),
    count: students.filter((s) => !s.online).length,
  },
])
const visible = computed(() =>
  students.filter(
    (s) =>
      `${s.name}${s.number}`.toLowerCase().includes(search.value.trim().toLowerCase()) &&
      (filter.value === 'all' ||
        (filter.value === 'online' && s.online) ||
        (filter.value === 'help' && s.help) ||
        (filter.value === 'errors' && s.status === 'compile_error') ||
        (filter.value === 'abnormal' &&
          ['timeout', 'runtime_error', 'platform_error', 'resource_limited'].includes(s.status)) ||
        (filter.value === 'submitted' && s.submitted) ||
        (filter.value === 'offline' && !s.online)) &&
      (exercise.value === 'all' || studentExercise(s)?.id === exercise.value),
  ),
)
const { page, pageSize, paged } = usePagination(visible, [search, filter, exercise])
async function copyInvite() {
  try {
    await navigator.clipboard.writeText(`${location.origin}/join?code=${demo.inviteCode}`)
    copied.value = true
  } catch {
    notify(t('overview.invite.manualCopy'))
  }
}
async function exportClass() {
  if (busy.value) return
  busy.value = true
  try {
    const data = await api(classPath('/export'))
    download(
      activeClassroom.value.name + t('overview.exportFileNameSuffix'),
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
    notify(t('overview.invite.updated'))
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
        <span class="status" :class="tone(activeClassroom.status)">
          <span class="status-dot" />
          {{ statusLabel(activeClassroom.status) }}
        </span>
        <span>{{ t('overview.overview') }}</span>
      </div>
      <h1>{{ activeClassroom.name }}</h1>
    </div>
    <div v-if="isTeacher" class="heading-actions">
      <Button
        variant="outline"
        :disabled="!exercises.length"
        :data-disabled-reason="t('overview.reasons.addExerciseFirst')"
        @click="router.push('/teacher/teach')">
        <Monitor />
        {{ t('overview.startTeach') }}
      </Button>
      <Button
        variant="outline"
        :disabled="busy"
        :data-disabled-reason="
          regenerate ? t('overview.reasons.regenerating') : t('overview.reasons.exporting')
        "
        @click="exportClass">
        <Download />
        {{ t('overview.exportWorks') }}
      </Button>
      <Button
        :disabled="!inviteAvailable"
        :data-disabled-reason="
          activeClassroom.status === 'archived'
            ? t('overview.reasons.archived')
            : activeClassroom.status === 'closed'
              ? t('overview.reasons.closed')
              : t('overview.reasons.joinDisabled')
        "
        @click="invite = true">
        <UserPlus />
        {{ t('overview.inviteStudents') }}
      </Button>
    </div>
  </div>
  <div class="stat-grid">
    <Button variant="plain" class="stat-card" @click="filter = 'online'">
      <div class="stat-top">
        {{ t('overview.stats.onlineStudents') }}
        <span class="stat-icon green"><Users :size="18" /></span>
      </div>
      <div class="stat-number">
        {{ counts.online }}
        <span>/ {{ counts.total }}</span>
      </div>
      <!-- <div class="stat-foot">
        <span class="live-dot" />{{ counts.total - counts.online }} 位同学暂时离线
      </div> -->
    </Button>
    <Button variant="plain" class="stat-card" @click="filter = 'submitted'">
      <div class="stat-top">
        {{ t('overview.stats.submittedCurrent') }}
        <span class="stat-icon blue"><CircleCheck :size="18" /></span>
      </div>
      <div class="stat-number">
        {{ counts.submitted }}
        <span>{{ t('overview.stats.studentsUnit') }}</span>
      </div>
      <!-- <div class="stat-foot">按每位学生当前练习统计，不代表通过</div> -->
    </Button>
    <Button variant="plain" class="stat-card" @click="filter = 'errors'">
      <div class="stat-top">
        {{ t('overview.stats.compileErrors') }}
        <span class="stat-icon red"><CircleAlert :size="18" /></span>
      </div>
      <div class="stat-number">
        {{ counts.errors }}
        <span>{{ t('overview.stats.studentsUnit') }}</span>
      </div>
      <!-- <div class="stat-foot">查看原始诊断，找到问题所在 <ArrowUpRight :size="13" /></div> -->
    </Button>
    <Button variant="plain" class="stat-card" @click="filter = 'help'">
      <div class="stat-top">
        {{ t('overview.stats.helpPending') }}
        <span class="stat-icon amber"><Hand :size="18" /></span>
      </div>
      <div class="stat-number">
        {{ counts.help }}
        <span>{{ t('overview.stats.requestsUnit') }}</span>
      </div>
      <!-- <div class="stat-foot amber-text"> -->
      <!-- {{ counts.help ? '有同学正在等你' : '暂时没有待处理的求助' }} <ArrowRight :size="13" /> -->
      <!-- </div> -->
    </Button>
  </div>
  <div class="overview-columns fill-stack">
    <ContentPanel
      class="student-panel panel-fill"
      content-class="student-panel-body"
      role="region"
      :aria-label="t('overview.patrol.title')">
      <template #header>
        <div class="section-heading">
          <h2>{{ t('overview.patrol.title') }}</h2>
          <span class="subtle-count">{{ counts.total }}</span>
          <span class="sync-label">
            <Radio :size="13" />
            {{ t('overview.patrol.sync') }}
          </span>
        </div>
      </template>
      <div class="filter-tabs">
        <Button
          v-for="f in filters"
          :key="f.key"
          variant="plain"
          :class="{ selected: filter === f.key }"
          @click="filter = f.key">
          {{ f.label }}
          <span>{{ f.count }}</span>
        </Button>
      </div>
      <div class="table-controls">
        <label class="search-field">
          <Search :size="16" />
          <Input
            ref="searchInput"
            v-model="search"
            :aria-label="t('overview.patrol.searchStudent')"
            :placeholder="t('overview.patrol.searchPlaceholder')" />
          <kbd>⌘ K</kbd>
        </label>
        <label class="select-wrap">
          <SlidersHorizontal :size="14" />
          <Select v-model="exercise" :aria-label="t('overview.patrol.filterByExercise')">
            <SelectOption value="all">{{ t('overview.patrol.allExercises') }}</SelectOption>
            <SelectOption v-for="e in exercises" :key="e.id" :value="e.id">
              {{ e.title }}
            </SelectOption>
          </Select>
        </label>
      </div>
      <div class="table-scroll">
        <table class="student-table">
          <thead>
            <tr>
              <th>{{ t('overview.patrol.columns.student') }}</th>
              <th>{{ t('overview.patrol.columns.exercise') }}</th>
              <th>{{ t('overview.patrol.columns.run') }}</th>
              <th>{{ t('overview.patrol.columns.submitHelp') }}</th>
              <th>{{ t('overview.patrol.columns.activity') }}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(s, index) in paged"
              :key="s.id"
              tabindex="0"
              @click="router.push('/teacher/students/' + s.id)"
              @keydown.enter="router.push('/teacher/students/' + s.id)">
              <td>
                <div class="person-cell">
                  <span
                    class="student-avatar"
                    :class="['avatar-' + (index % 5), { offline: !s.online }]">
                    {{ s.name.slice(-2) }}
                    <i :class="{ online: s.online }" />
                  </span>
                  <span class="person-text">
                    <strong>{{ s.name }}</strong>
                    <small>{{ s.number }}</small>
                  </span>
                </div>
              </td>
              <td>
                <div class="student-row-content">
                  <span
                    class="table-exercise"
                    :title="studentExercise(s)?.title ?? t('overview.patrol.noExercise')">
                    {{ studentExercise(s)?.title ?? t('overview.patrol.noExercise') }}
                  </span>
                  <small class="cell-secondary">
                    {{ s.online ? t('overview.patrol.online') : t('overview.patrol.offline') }}
                  </small>
                </div>
              </td>
              <td>
                <div class="student-row-content">
                  <span class="status" :class="tone(s.status)">
                    <span class="status-dot" />
                    {{ statusLabel(s.status) }}
                  </span>
                  <small
                    v-if="s.summary && s.summary !== s.status"
                    class="cell-secondary error-summary"
                    :title="s.summary">
                    {{ s.summary }}
                  </small>
                </div>
              </td>
              <td>
                <span v-if="s.help" class="help-label">
                  <Hand :size="13" />
                  {{ t('overview.patrol.helpRequest') }}
                </span>
                <span v-else-if="s.submitted" class="submitted-label">
                  <Check :size="13" />
                  {{ t('overview.patrol.submitted') }}
                </span>
                <span v-else class="muted">—</span>
              </td>
              <td class="activity-cell">{{ s.activity }}</td>
              <td><ArrowRight :size="15" class="row-arrow" /></td>
            </tr>
          </tbody>
        </table>
        <div v-if="!visible.length" class="empty-state">
          <Search :size="26" />
          <h3>{{ t('overview.patrol.emptyTitle') }}</h3>
          <p>{{ t('overview.patrol.emptyBody') }}</p>
          <Button
            variant="outline"
            @click="
              () => {
                search = ''
                filter = 'all'
                exercise = 'all'
              }
            ">
            {{ t('overview.patrol.clearFilters') }}
          </Button>
        </div>
      </div>
      <template #footer>
        <Pagination
          v-model:page="page"
          v-model:page-size="pageSize"
          :total="visible.length"
          :unit="t('overview.patrol.unit')" />
      </template>
    </ContentPanel>
    <aside class="overview-aside">
      <section class="panel current-exercise">
        <div class="panel-heading">
          <h2>{{ t('overview.recommended.title') }}</h2>
          <BookOpen :size="17" class="muted" />
        </div>
        <div v-if="recommended" class="exercise-feature">
          <span class="topic-label">
            {{
              t('overview.recommended.exerciseLabel', {
                index: recommendedIndex,
                topic: recommended.topic,
              })
            }}
          </span>
          <h3>{{ recommended.title }}</h3>
          <p>{{ recommended.description.split('\n')[0] }}</p>
          <div class="exercise-progress">
            <span>{{ t('overview.recommended.progress') }}</span>
            <strong>{{ recommendedSubmitted }} / {{ counts.total }}</strong>
          </div>
          <div class="progress-track">
            <i
              :style="{
                width: (counts.total ? (recommendedSubmitted / counts.total) * 100 : 0) + '%',
              }" />
          </div>
          <Button
            v-if="isTeacher"
            variant="outline"
            class="w-full"
            @click="router.push('/teacher/exercises')">
            {{ t('overview.recommended.manage') }}
            <ArrowRight />
          </Button>
        </div>
        <div v-else class="small-empty">
          <BookOpen :size="28" />
          <p>{{ t('overview.recommended.empty') }}</p>
          <Button
            v-if="isTeacher"
            variant="outline"
            @click="
              router.push(exercises.length ? '/teacher/exercises' : '/teacher/exercises/new')
            ">
            {{
              exercises.length ? t('overview.recommended.choose') : t('overview.recommended.create')
            }}
          </Button>
        </div>
      </section>
      <section class="panel help-panel">
        <div class="panel-heading">
          <h2>{{ t('overview.attention.title') }}</h2>
          <span v-if="counts.help" class="notification-dot" />
        </div>
        <div v-for="s in students.filter((s) => s.help)" :key="s.id" class="help-item">
          <div class="help-item-heading">
            <strong>{{ s.name }}</strong>
            <small>{{ s.activity }}</small>
          </div>
          <p>
            {{ s.helpMessage || t('overview.attention.fallback') }}
          </p>
          <small class="help-context">
            {{
              exercises.find((e) => e.id === s.helpExerciseId)?.title ??
              t('overview.attention.exerciseFallback')
            }}
            <span v-if="s.helpLanguage === 'python'">
              · Python
              <PythonBeta />
            </span>
            ·
            {{
              s.helpCreatedAt ? new Date(s.helpCreatedAt).toLocaleTimeString('zh-CN') : s.activity
            }}
          </small>
          <Button
            variant="plain"
            @click="
              router.push({
                path: '/teacher/students/' + s.id,
                query: { exercise: s.helpExerciseId, language: s.helpLanguage ?? s.language },
              })
            ">
            {{ t('overview.attention.view') }}
            <ArrowUpRight :size="13" />
          </Button>
        </div>
        <div v-if="!counts.help" class="small-empty">
          <CircleCheck :size="24" />
          <p>{{ t('overview.attention.empty') }}</p>
        </div>
      </section>
    </aside>
  </div>
  <Modal
    v-model:open="invite"
    :title="t('overview.invite.modalTitle')"
    :description="t('overview.invite.modalDescription')">
    <div class="invitation-class">
      <GraduationCap :size="22" />
      {{ activeClassroom.name }}
    </div>
    <label class="field-label">{{ t('overview.invite.codeLabel') }}</label>
    <div class="invite-code">{{ demo.inviteCode }}</div>
    <div class="copy-row">
      <Input
        :value="`${origin}/join?code=${demo.inviteCode}`"
        readonly
        :aria-label="t('overview.invite.linkLabel')" />
      <Button
        variant="outline"
        :disabled="inviteExpired"
        :data-disabled-reason="t('overview.invite.expiredReason')"
        @click="copyInvite">
        <Check v-if="copied" />
        <Copy v-else />
        {{ copied ? t('common.copied') : t('overview.invite.copyLink') }}
      </Button>
    </div>
    <p class="form-hint" :class="{ 'danger-text': inviteExpired }">
      {{
        inviteExpired
          ? t('overview.invite.expiredHint')
          : t('overview.invite.validUntil', { time: inviteExpires })
      }}
      · {{ t('overview.invite.confirmJoin') }}
    </p>
    <Button variant="outline" class="w-full" @click="regenerate = true">
      {{ t('overview.invite.regenerate') }}
    </Button>
  </Modal>
  <Modal
    v-model:open="regenerate"
    :title="t('overview.invite.regenTitle')"
    :description="t('overview.invite.regenDescription')">
    <div class="modal-actions">
      <Button
        variant="outline"
        :disabled="busy"
        :data-disabled-reason="
          regenerate ? t('overview.reasons.regenerating') : t('overview.reasons.exporting')
        "
        @click="regenerate = false">
        {{ t('common.cancel') }}
      </Button>
      <Button
        variant="warning"
        :disabled="busy"
        :data-disabled-reason="
          regenerate ? t('overview.reasons.regenerating') : t('overview.reasons.exporting')
        "
        @click="regenerateInvite">
        {{ busy ? t('overview.invite.updating') : t('overview.invite.confirmRegenerate') }}
      </Button>
    </div>
  </Modal>
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
.overview-columns {
  align-items: stretch;
}
.student-panel {
  height: 100%;
}
.student-panel :deep(.content-panel-header) {
  min-height: 48px;
  padding: 9px 16px;
}
.student-panel :deep(.student-panel-body) {
  flex: 1 1 0;
  min-height: 0;
  padding: 0;
  gap: 0;
}
.student-panel .table-scroll {
  flex: 1 1 0;
  min-height: 0;
  overflow: auto;
}
.student-panel :deep(.content-panel-footer) {
  padding: 0;
  border-top: 0;
  background: var(--ui-page);
}
.student-panel :deep(.pagination) {
  width: 100%;
}
.overview-aside {
  min-height: 0;
  overflow-y: auto;
}
.overview-aside > section {
  flex-shrink: 0;
}
@media (max-width: 1180px) {
  .overview-columns {
    grid-template-rows: minmax(300px, 1fr) auto;
    overflow-y: auto;
  }
  .overview-aside {
    overflow: visible;
  }
}
.filter-tabs {
  overflow-x: auto;
  flex-shrink: 0;
  gap: 16px;
  padding-inline: 16px;
}
.student-panel .filter-tabs > :deep(button) {
  padding-block: 9px 8px;
}
.student-panel .table-controls {
  padding: 8px 16px;
}
.student-panel .select-wrap {
  background: var(--ui-page);
  border-color: var(--ui-line-strong);
}
.student-panel .select-wrap:focus-within {
  border-color: var(--ui-action);
  box-shadow: 0 0 0 3px var(--ui-focus);
}
.student-panel .select-wrap :deep(.ui-select-trigger) {
  height: 100%;
  min-height: 0;
  border: 0;
  background: transparent;
  box-shadow: none;
}
.student-panel .select-wrap :deep(.ui-select-trigger:focus-visible) {
  box-shadow: none;
}
.student-panel .student-table th {
  padding: 8px 14px;
}
.student-panel .student-table td {
  padding: 7px 14px;
}
.student-panel .student-table :is(th, td):first-child {
  padding-left: 16px;
}
.student-panel .student-table :is(th, td):last-child {
  padding-right: 16px;
}
.student-panel .person-cell {
  min-height: 30px;
  height: auto;
  gap: 8px;
}
.student-panel .student-avatar {
  width: 28px;
  height: 28px;
}
.student-panel .person-text,
.student-panel .student-row-content {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: 7px;
  white-space: nowrap;
  line-height: 1.3;
}
.student-panel .person-text strong,
.student-panel .table-exercise,
.student-panel .error-summary {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}
.student-panel .table-exercise {
  display: block;
}
.student-panel .person-text small,
.student-panel .cell-secondary {
  display: inline;
  margin: 0;
  flex-shrink: 0;
  line-height: 1.3;
}
.student-panel .error-summary {
  flex-shrink: 1;
}
.student-panel :deep(.pagination) {
  padding-block: 8px;
}
.help-item p {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
</style>
