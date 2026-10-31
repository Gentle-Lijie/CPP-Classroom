<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { api } from '@/lib/api'
import { refresh, reportError } from '@/data/demo'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Select, SelectOption } from '@/components/ui/select'
import ClassroomAssignments from '@/components/classroom/ClassroomAssignments.vue'
import { RefreshCw } from '@lucide/vue'
interface Classroom {
  id: string
  name: string
  status: string
  ownerName: string
}
const classes = ref<Classroom[]>([])
const selected = ref('')
const error = ref('')
const loading = ref(false)
async function load() {
  loading.value = true
  error.value = ''
  try {
    classes.value = await api<Classroom[]>('/admin/classes')
    if (!classes.value.some((c) => c.id === selected.value))
      selected.value = classes.value[0]?.id ?? ''
  } catch (e) {
    error.value = e instanceof Error ? e.message : '课堂读取失败'
  } finally {
    loading.value = false
  }
}
async function changed() {
  await load()
  await refresh().catch(reportError)
}
onMounted(load)
</script>
<template>
  <div class="page-heading">
    <div>
      <div class="heading-meta">平台管理</div>
      <h1>课堂人员</h1>
    </div>
    <div class="admin-classroom-picker">
      <Select v-model="selected" aria-label="选择要分配人员的课堂" :disabled="loading">
        <SelectOption v-for="item in classes" :key="item.id" :value="item.id">
          {{ item.name }} · {{ item.ownerName }}
        </SelectOption>
      </Select>
      <Button variant="ghost" size="icon" aria-label="刷新课堂" :disabled="loading" @click="load">
        <RefreshCw :class="{ 'animate-spin': loading }" />
      </Button>
    </div>
  </div>
  <Alert v-if="error" type="error">{{ error }}</Alert>
  <ClassroomAssignments
    v-if="selected"
    :classroom-id="selected"
    account-creation-path="/admin/teachers"
    @changed="changed" />
  <p v-else-if="!loading" class="muted">暂无课堂。可从“我的课堂”创建课堂。</p>
</template>
<style scoped>
.admin-classroom-picker {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 420px;
}
.admin-classroom-picker :deep(.ui-select-trigger) {
  flex: 1;
  min-width: 0;
}
</style>
