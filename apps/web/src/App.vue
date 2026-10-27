<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ServiceUnavailable from '@/components/classroom/ServiceUnavailable.vue'
import Notification from '@/components/ui/alert/Notification.vue'
import ConfirmationDialog from '@/components/classroom/ConfirmationDialog.vue'
import { useFirstVisitGuide } from '@/composables/useFirstVisitGuide'
import { studentGuideActive } from '@/lib/spotlight'
import SpotlightGuide from '@/components/classroom/SpotlightGuide.vue'
import AppShell from '@/components/classroom/AppShell.vue'
import { demo, currentUser, refresh, clearSession, notify, bootstrapError } from '@/data/demo'
import { api, ApiError } from '@/lib/api'
const route = useRoute()
const router = useRouter()
useFirstVisitGuide()
let poll: ReturnType<typeof setInterval>
let expiring = false
async function expireSession() {
  if (expiring || !currentUser.value) return
  expiring = true
  const redirect = route.fullPath
  clearSession()
  notify('登录已失效，请重新登录。本机草稿保留。', 'error')
  await router.replace({ path: '/login', query: { redirect } })
  expiring = false
}
onMounted(() => {
  window.addEventListener('classroom:session-expired', expireSession)
  poll = setInterval(() => {
    if (currentUser.value && !document.hidden && !studentGuideActive.value)
      void refresh().catch(() => {})
  }, 2000)
})
onBeforeUnmount(() => {
  clearInterval(poll)
  window.removeEventListener('classroom:session-expired', expireSession)
})
const standalone = computed(() => route.meta.standalone)
const pageKey = computed(() => route.path + ':' + demo.classroomId)
const reconnecting = ref(false)
async function retryBootstrap() {
  if (reconnecting.value) return
  reconnecting.value = true
  try {
    try {
      await api('/auth/me')
    } catch (error) {
      // A signed-out response still confirms the server is available again.
      if (!(error instanceof ApiError) || error.status !== 401) throw error
    }
    window.location.reload()
  } catch {
    notify('仍然无法连接服务器，请检查网络或稍后重试。', 'error')
  } finally {
    reconnecting.value = false
  }
}
</script>
<template>
  <ServiceUnavailable v-if="bootstrapError" :busy="reconnecting" @retry="retryBootstrap" />
  <RouterView v-else-if="standalone" :key="pageKey" />
  <AppShell v-else><RouterView :key="pageKey" /></AppShell>
  <ConfirmationDialog />
  <SpotlightGuide />
  <Notification />
</template>
