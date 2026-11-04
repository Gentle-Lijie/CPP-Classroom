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
import { useI18n } from 'vue-i18n'
const { t } = useI18n()
import { statusLabel } from '@/lib/status-labels'
const router = useRouter()
const search = ref('')
const filter = ref('all')
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
const classFilters = computed(() => [
  { value: 'all', label: t('student.classes.filterAll') },
  { value: 'ongoing', label: t('student.classes.statusOngoing') },
  { value: 'not_started', label: t('student.classes.statusNotStarted') },
  { value: 'closed', label: t('student.classes.statusClosed') },
  { value: 'archived', label: t('student.classes.statusArchived') },
])
const visible = computed(() =>
  classrooms.filter(
    (c) =>
      c.name.toLowerCase().includes(search.value.trim().toLowerCase()) &&
      (filter.value === 'all' || c.status === filter.value),
  ),
)
const { page, pageSize, paged } = usePagination(visible, [search, filter], 10)
async function add() {
  if (busy.value) return
  error.value = ''
  if (!name.value.trim()) {
    error.value = t('student.classes.nameRequired')
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
    notify(t('student.classes.created'))
    try {
      await selectClass(created.id)
      await router.push('/teacher/overview')
    } catch {
      notify(t('student.classes.createdRefreshFailed'), 'error')
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : t('student.classes.createFailed')
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
      <div class="heading-meta">{{ t('student.classes.meta') }}</div>
      <h1>
        {{ t('student.classes.title') }}
        <span class="heading-count">{{ classrooms.length }}</span>
      </h1>
    </div>
    <div class="flex gap-2">
      <Button variant="outline" @click="router.push('/join')">
        <KeyRound />
        {{ t('student.classes.join') }}
      </Button>
      <Button v-if="canCreateClassroom" data-guide="class-add" @click="openCreate">
        <Plus />
        {{ t('student.classes.create') }}
      </Button>
    </div>
  </div>
  <div class="class-toolbar">
    <div class="segmented">
      <Button
        v-for="f in classFilters"
        :key="f.value"
        :data-guide-filter="f.label"
        variant="plain"
        :class="{ selected: filter === f.value }"
        @click="filter = f.value">
        {{ f.label }}
      </Button>
    </div>
    <label class="search-field">
      <Search :size="16" />
      <Input
        v-model="search"
        :placeholder="t('student.classes.searchPlaceholder')"
        :aria-label="t('student.classes.searchAria')" />
    </label>
  </div>
  <div class="class-grid">
    <article v-for="c in paged" :key="c.id" class="class-card">
      <div class="class-card-cover">
        <span class="status" :class="tone(c.status)">
          <span class="status-dot" />
          {{
            c.membershipStatus === 'pending'
              ? t('student.classes.pendingApproval')
              : statusLabel(c.status)
          }}
        </span>
      </div>
      <div class="class-card-body">
        <span class="muted text-xs">
          {{
            (c.teacher ?? t('student.classes.teacherDefault')) +
            ' · ' +
            t('student.classes.myRole', {
              role: t(`student.classes.roleLabels.${c.classroomRole}`),
            })
          }}
        </span>
        <h2>{{ c.name }}</h2>
        <p>{{ c.description }}</p>
        <div class="class-card-meta">
          <span>
            <Users :size="15" />
            {{ t('student.classes.studentsCount', { count: c.students }) }}
          </span>
          <span>
            <BookOpen :size="15" />
            {{ t('student.classes.exercisesCount', { count: c.exercises ?? 0 }) }}
          </span>
        </div>
        <div class="class-card-footer">
          <span>
            <CalendarDays :size="14" />
            {{
              c.status === 'ongoing'
                ? t('student.classes.footerOngoing')
                : c.status === 'archived'
                  ? t('student.classes.footerArchived')
                  : c.status === 'closed'
                    ? t('student.classes.footerClosed')
                    : t('student.classes.footerWaiting')
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
                ? t('student.classes.enteringReason')
                : c.membershipStatus === 'pending'
                  ? t('student.classes.pendingReason')
                  : t('student.classes.noExerciseReason')
            "
            data-guide="class-enter"
            @click="enter(c.id)">
            {{
              entering === c.id
                ? t('student.classes.entering')
                : c.membershipStatus === 'pending'
                  ? t('student.classes.waitApproval')
                  : c.classroomRole === 'student' && !c.exercises
                    ? t('student.classes.waitPublish')
                    : c.status === 'archived' || c.status === 'closed'
                      ? t('student.classes.viewWorks')
                      : t('student.classes.enter')
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
      <h3>{{ t('student.classes.newClass') }}</h3>
      <strong>
        {{ t('student.classes.create') }}
        <ArrowRight :size="14" />
      </strong>
    </Button>
  </div>
  <Pagination
    v-if="visible.length > 10"
    v-model:page="page"
    v-model:page-size="pageSize"
    :total="visible.length"
    :unit="t('student.classes.classUnit')" />
  <div v-if="!visible.length" class="panel empty-state">
    <FolderOpen :size="30" />
    <h3>
      {{
        search || filter !== 'all'
          ? t('student.classes.emptyFilteredTitle')
          : t('student.classes.emptyTitle')
      }}
    </h3>
    <p>
      {{
        canCreateClassroom
          ? t('student.classes.emptyBodyTeacher')
          : t('student.classes.emptyBodyStudent')
      }}
    </p>
    <Button v-if="!search && filter === 'all'" @click="router.push('/join')">
      {{ t('student.classes.applyJoin') }}
    </Button>
  </div>

  <Modal v-model:open="create" :title="t('student.classes.createTitle')" :busy="busy">
    <Form class="form-stack" @submit.prevent="add">
      <label>
        {{ t('student.classes.nameLabel') }}
        <Input
          v-model="name"
          required
          maxlength="100"
          :placeholder="t('student.classes.namePlaceholder')" />
      </label>
      <label>
        {{ t('student.classes.descriptionLabel') }}
        <Textarea
          v-model="description"
          rows="3"
          maxlength="5000"
          :placeholder="t('student.classes.descriptionPlaceholder')" />
      </label>

      <div class="modal-actions">
        <Button type="button" variant="outline" @click="create = false">
          {{ t('common.cancel') }}
        </Button>
        <Button
          type="submit"
          :disabled="busy"
          :data-disabled-reason="t('student.classes.creatingReason')">
          {{ busy ? t('student.classes.creating') : t('student.classes.create') }}
        </Button>
      </div>
    </Form>
  </Modal>
</template>
