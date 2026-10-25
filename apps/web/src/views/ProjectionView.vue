<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, Monitor, EyeOff, Eye, Minus, Plus, Maximize, CodeXml } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import CodeEditor from '@/components/classroom/CodeEditor.vue'
import RunOutput from '@/components/classroom/RunOutput.vue'
import { students, exercises, demo, readDraft, exampleRuns, notify } from '@/data/demo'
const route = useRoute()
const router = useRouter()
const anonymous = ref(true)
const size = ref(23)
const showOutput = ref(true)
const source = ref(String(route.query.run ?? 'current'))
const student = computed(() => students.find((s) => s.id === route.params.id))
const run = computed(() => exampleRuns.find((r) => r.id === source.value))
const exercise = computed(
  () =>
    exercises.find((e) => e.id === (student.value?.exerciseId ?? demo.recommended)) ??
    exercises[0]!,
)
const code = computed(
  () => run.value?.code ?? readDraft(exercise.value.id, exercise.value.code, student.value?.id),
)
async function fullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen()
    else await document.documentElement.requestFullscreen()
  } catch {
    notify('浏览器未允许全屏，请使用系统全屏快捷键')
  }
}
</script>
<template>
  <main class="projection-page">
    <header class="projection-header">
      <div class="inline-items">
        <Button
          variant="ghost"
          size="sm"
          @click="router.push('/teacher/students/' + (student?.id ?? 's01'))"
          ><ArrowLeft />结束投屏</Button
        ><span class="ide-divider" /><Monitor :size="18" /><strong>课堂讲解</strong
        ><span class="demo-tag">只读原型</span>
      </div>
      <div class="inline-items">
        <button class="projection-control" @click="anonymous = !anonymous">
          <EyeOff v-if="anonymous" :size="16" /><Eye v-else :size="16" />{{
            anonymous ? '匿名展示' : '展示姓名'
          }}</button
        ><span class="font-controls"
          ><button aria-label="缩小字号" :disabled="size <= 16" @click="size -= 2">
            <Minus :size="15" /></button
          >{{ size }} px<button aria-label="放大字号" :disabled="size >= 38" @click="size += 2">
            <Plus :size="15" /></button></span
        ><button class="icon-button" aria-label="切换全屏" @click="fullscreen">
          <Maximize :size="18" />
        </button>
      </div>
    </header>
    <div class="projection-title">
      <div>
        <span class="topic-label">for 循环 · C++17</span>
        <h1>{{ exercise.title }}</h1>
        <p>{{ anonymous ? '学生作品 · 已隐藏身份' : (student?.name ?? '示例学生') + '的作品' }}</p>
      </div>
      <div class="inline-items">
        <select v-model="source" aria-label="投屏代码来源">
          <option value="current">当前代码 · 同步示例</option>
          <option v-for="r in exampleRuns" :key="r.id" :value="r.id">
            {{ r.id }} · {{ r.status }}
          </option></select
        ><Button variant="outline" @click="showOutput = !showOutput">{{
          showOutput ? '收起结果' : '展开结果'
        }}</Button>
      </div>
    </div>
    <div class="projection-body" :class="{ 'code-only': !showOutput }">
      <section class="panel projection-code">
        <div class="code-toolbar">
          <CodeXml :size="15" />{{ run?.filename ?? exercise.filename }}
          <span class="ml-auto muted">{{
            run ? '固定运行快照 · ' + run.id : '当前代码 · 只读示例'
          }}</span>
        </div>
        <CodeEditor
          :model-value="code"
          :filename="run?.filename ?? exercise.filename"
          readonly
          :font-size="size"
          :error-line="run?.status === '编译失败' ? 10 : undefined"
        />
      </section>
      <aside v-if="showOutput" class="projection-results">
        <section class="panel">
          <div class="panel-heading">
            <h2>当次输入</h2>
            <span class="muted">stdin</span>
          </div>
          <pre>{{ run?.input ?? '5' }}</pre>
        </section>
        <div class="panel"><RunOutput :key="source" :run="run ?? exampleRuns[1]" /></div>
        <p class="projection-note">
          {{
            run
              ? '代码、输入和原始结果对应同一次运行示例。'
              : '当前草稿与下方示例结果独立，选择运行快照可查看完整上下文。'
          }}
          投屏不修改作品，不触发重新运行。
        </p>
      </aside>
    </div>
    <footer class="projection-footer">
      码上课堂<span>此视图仅用于教师投影或会议共享，不自动广播到学生端。</span>
    </footer>
  </main>
</template>
