<script setup lang="ts">
import { useRouter } from 'vue-router'
import { activeClassroom, refresh, reportError } from '@/data/demo'
import { Button } from '@/components/ui/button'
import { Users } from '@lucide/vue'
import ClassroomAssignments from '@/components/classroom/ClassroomAssignments.vue'
const router = useRouter()
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
      <h1>课堂人员</h1>
    </div>
    <Button variant="outline" @click="router.push('/teacher/roster')">
      <Users />
      学生名册
    </Button>
  </div>
  <ClassroomAssignments
    :classroom-id="activeClassroom.id"
    account-creation-path="/teacher/roster"
    @changed="changed" />
</template>
