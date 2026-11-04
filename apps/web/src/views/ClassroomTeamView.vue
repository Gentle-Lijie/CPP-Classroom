<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { activeClassroom, refresh, reportError } from '@/data/demo'
import { Button } from '@/components/ui/button'
import { Users } from '@lucide/vue'
import ClassroomAssignments from '@/components/classroom/ClassroomAssignments.vue'
const router = useRouter()
const { t } = useI18n()
async function changed() {
  try {
    await refresh()
    if (!activeClassroom.value.canManageStaff) await router.push('/teacher/overview')
  } catch (error) {
    reportError(error)
  }
}
</script>
<template>
  <div class="page-heading">
    <div>
      <div class="heading-meta">{{ activeClassroom.name }}</div>
      <h1>{{ t('roster.team.title') }}</h1>
    </div>
    <Button variant="outline" @click="router.push('/teacher/roster')">
      <Users />
      {{ t('roster.team.roster') }}
    </Button>
  </div>
  <ClassroomAssignments
    :classroom-id="activeClassroom.id"
    account-creation-path="/teacher/roster"
    @changed="changed" />
</template>
