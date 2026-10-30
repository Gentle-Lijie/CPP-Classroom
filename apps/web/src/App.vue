<script setup lang="ts">
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ServiceUnavailable from '@/components/classroom/ServiceUnavailable.vue'
import Notification from '@/components/ui/alert/Notification.vue'
import ConfirmationDialog from '@/components/classroom/ConfirmationDialog.vue'
import { useFirstVisitGuide } from '@/composables/useFirstVisitGuide'
import { studentGuideActive } from '@/lib/spotlight'
import SpotlightGuide from '@/components/classroom/SpotlightGuide.vue'
import ResolutionNotice from '@/components/classroom/ResolutionNotice.vue'
import AppShell from '@/components/classroom/AppShell.vue'
import DisabledButtonHint from '@/components/ui/button/DisabledButtonHint.vue'
import WelcomePoster from '@/components/classroom/WelcomePoster.vue'
import { demo, currentUser, refresh, clearSession, notify, bootstrapError } from '@/data/demo'
import { api, ApiError } from '@/lib/api'
const route = useRoute()
const router = useRouter()
const posterOpen = ref(false)
const seenPosters = new Set<string>()
const posterKey = (id: string) => `codemia:welcome-poster:v1:${encodeURIComponent(id)}`
watch(
  () => [currentUser.value?.id, route.path, bootstrapError.value] as const,
  ([id, path, error]) => {
    if (!id || error || ['/login', '/recover', '/join'].includes(path)) {
      posterOpen.value = false
      return
    }
    const key = posterKey(id)
    try {
      posterOpen.value = !seenPosters.has(key) && localStorage.getItem(key) !== '1'
    } catch {
      posterOpen.value = !seenPosters.has(key)
    }
  },
  { immediate: true, flush: 'sync' },
)
function closePoster() {
  const id = currentUser.value?.id
  if (id) {
    const key = posterKey(id)
    seenPosters.add(key)
    try {
      localStorage.setItem(key, '1')
    } catch {
      // Keep the poster dismissed for this page session if storage is unavailable.
    }
  }
  posterOpen.value = false
}
useFirstVisitGuide(posterOpen)
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
  <WelcomePoster :open="posterOpen" @close="closePoster" />
  <ConfirmationDialog />
  <SpotlightGuide />
  <ResolutionNotice />
  <Notification />
  <DisabledButtonHint />
</template>
