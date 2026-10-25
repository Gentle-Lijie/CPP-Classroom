<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount } from 'vue'
import { useRoute } from 'vue-router'
import { CircleCheck, X } from '@lucide/vue'
import AppShell from '@/components/classroom/AppShell.vue'
import { demo, currentUser, refresh, exercises } from '@/data/demo'
const route = useRoute()
let poll: ReturnType<typeof setInterval>
onMounted(() => {
  poll = setInterval(() => {
    if (currentUser.value) void refresh().catch(() => {})
  }, 2000)
})
onBeforeUnmount(() => clearInterval(poll))
const empty = computed(
  () => !exercises.length && ['/teacher/exercises', '/teacher/teach'].includes(route.path),
)
const standalone = computed(() => route.meta.standalone)
</script>
<template>
  <div v-if="empty" class="panel empty-state">
    <h2>课堂还没有练习</h2>
    <RouterLink to="/teacher/exercises/new">创建第一个练习</RouterLink>
  </div>
  <RouterView v-else-if="standalone" />
  <AppShell v-else><RouterView /></AppShell>
  <Transition name="toast"
    ><div v-if="demo.notice" role="status" class="toast-message">
      <CircleCheck :size="18" /><span>{{ demo.notice }}</span
      ><button aria-label="关闭提示" @click="demo.notice = ''"><X :size="15" /></button></div
  ></Transition>
</template>
