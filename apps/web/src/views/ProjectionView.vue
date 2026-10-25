<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, Monitor, Minus, Plus, Maximize, CodeXml } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import CodeEditor from '@/components/classroom/CodeEditor.vue'
import RunOutput from '@/components/classroom/RunOutput.vue'
import { demo, notify, reportError, type RunRecord } from '@/data/demo'
import { api } from '@/lib/api'
const route = useRoute(),
  router = useRouter()
const size = ref(23),
  showOutput = ref(true)
const snapshot = ref<RunRecord & { title: string }>()
const path = () =>
  '/classes/' + String(route.query.class ?? demo.classroomId) + '/projections/' + route.params.id
async function load() {
  try {
    snapshot.value = await api(path())
  } catch (e) {
    snapshot.value = undefined
    reportError(e)
  }
}
onMounted(() => void load())
const poll = setInterval(() => void load(), 3000)
onBeforeUnmount(() => clearInterval(poll))
async function end() {
  try {
    await api(path() + '/revoke', 'POST', {})
    await router.push('/teacher/overview')
  } catch (e) {
    reportError(e)
  }
}
async function fullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen()
    else await document.documentElement.requestFullscreen()
  } catch {
    notify('浏览器未允许全屏')
  }
}
</script>
<template>
  <main v-if="snapshot" class="projection-page">
    <header class="projection-header">
      <Button variant="ghost" @click="end"><ArrowLeft />结束并撤销投屏</Button><Monitor /><strong
        >匿名作品 · 固定只读快照</strong
      >
      <div class="inline-items">
        <Button variant="outline" @click="size = Math.max(16, size - 2)"><Minus /></Button
        ><span>{{ size }} px</span
        ><Button variant="outline" @click="size = Math.min(38, size + 2)"><Plus /></Button
        ><Button @click="fullscreen"><Maximize />全屏</Button>
      </div>
    </header>
    <div class="projection-title">
      <h1>{{ snapshot.title }}</h1>
      <Button variant="outline" @click="showOutput = !showOutput">切换结果</Button>
    </div>
    <div class="projection-body" :class="{ 'code-only': !showOutput }">
      <section class="panel projection-code">
        <div class="code-toolbar"><CodeXml />{{ snapshot.filename }}</div>
        <CodeEditor
          :model-value="snapshot.code"
          :filename="snapshot.filename"
          :font-size="size"
          readonly
        />
      </section>
      <aside v-if="showOutput" class="projection-results"><RunOutput :run="snapshot" /></aside>
    </div>
  </main>
  <div v-else class="empty-state">
    <h2>展示不存在、已过期或已撤销</h2>
    <RouterLink to="/teacher/overview">返回课堂</RouterLink>
  </div>
</template>
