<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { CircleCheck, X } from '@lucide/vue'
import AppShell from '@/components/classroom/AppShell.vue'
import { demo } from '@/data/demo'
const route = useRoute()
const standalone = computed(() => route.meta.standalone)
</script>
<template>
  <RouterView v-if="standalone" />
  <AppShell v-else><RouterView /></AppShell>
  <Transition name="toast"
    ><div v-if="demo.notice" role="status" class="toast-message">
      <CircleCheck :size="18" /><span>{{ demo.notice }}</span
      ><button aria-label="关闭提示" @click="demo.notice = ''"><X :size="15" /></button></div
  ></Transition>
</template>
