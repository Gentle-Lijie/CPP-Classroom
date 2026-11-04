<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { api } from '@/lib/api'
import { refresh, reportError } from '@/data/demo'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Select, SelectOption } from '@/components/ui/select'
import ClassroomAssignments from '@/components/classroom/ClassroomAssignments.vue'
import ContentPanel from '@/components/classroom/ContentPanel.vue'
import { RefreshCw } from '@lucide/vue'
interface Classroom {
  id: string
  name: string
  status: string
  ownerName: string
}
const { t } = useI18n()
const route = useRoute()
const classes = ref<Classroom[]>([])
const selected = ref(typeof route.query.classroom === 'string' ? route.query.classroom : '')
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
    error.value = e instanceof Error ? e.message : t('admin.classes.loadFailed')
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
      <div class="heading-meta">{{ t('admin.platformAdmin') }}</div>
      <h1>{{ t('admin.classes.title') }}</h1>
    </div>
    <div class="admin-classroom-picker">
      <Select v-model="selected" :aria-label="t('admin.classes.pickerAria')" :disabled="loading">
        <SelectOption v-for="item in classes" :key="item.id" :value="item.id">
          {{ item.name }} · {{ item.ownerName }}
        </SelectOption>
      </Select>
      <Button
        variant="ghost"
        size="icon"
        :aria-label="t('admin.classes.refreshAria')"
        :disabled="loading"
        @click="load">
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
  <ContentPanel v-else-if="!loading" as="section">
    <p>{{ error ? t('admin.classes.errorState') : t('admin.classes.empty') }}</p>
  </ContentPanel>
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
