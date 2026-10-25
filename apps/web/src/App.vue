<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { CircleCheck, CircleAlert, Info, X } from '@lucide/vue'
import AppShell from '@/components/classroom/AppShell.vue'
import { demo, currentUser, refresh, clearSession, notify, bootstrapError } from '@/data/demo'
import { Button } from '@/components/ui/button'
const route = useRoute()
const router = useRouter()
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
    if (currentUser.value && !document.hidden) void refresh().catch(() => {})
  }, 2000)
})
onBeforeUnmount(() => {
  clearInterval(poll)
  window.removeEventListener('classroom:session-expired', expireSession)
})
const standalone = computed(() => route.meta.standalone)
const pageKey = computed(() => route.path + ':' + demo.classroomId)
function retryBootstrap() {
  window.location.reload()
}
</script>
<template>
  <main v-if="bootstrapError" class="bootstrap-error">
    <div class="panel empty-state">
      <CircleAlert :size="32" />
      <h1>连接暂时中断</h1>
      <p>{{ bootstrapError }}</p>
      <Button @click="retryBootstrap">重新连接</Button>
    </div>
  </main>
  <RouterView v-else-if="standalone" :key="pageKey" />
  <AppShell v-else><RouterView :key="pageKey" /></AppShell>
  <Transition name="toast"
    ><div
      v-if="demo.notice"
      :role="demo.noticeKind === 'error' ? 'alert' : 'status'"
      class="toast-message"
      :class="demo.noticeKind"
    >
      <component
        :is="
          demo.noticeKind === 'error'
            ? CircleAlert
            : demo.noticeKind === 'info'
              ? Info
              : CircleCheck
        "
        :size="18"
      /><span>{{ demo.notice }}</span
      ><button aria-label="关闭提示" @click="demo.notice = ''"><X :size="15" /></button></div
  ></Transition>
</template>
