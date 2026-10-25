<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
import { notify, reportError } from '@/data/demo'
import { probePlatform, type ProbeResult } from '@/lib/platform-health'
import { executionDefaults, executionLimits } from '@classroom/contracts'
const form = reactive({ ...executionDefaults, goJudgeUrl: '', goJudgeTimeoutMs: 2000 })
const states = ref<Record<string, ProbeResult>>({}),
  busy = ref(false)
const fields = [
  { key: 'compileTimeMs', name: '编译 CPU 时间（毫秒）', min: 1000, max: 20000 },
  { key: 'compileMemoryMb', name: '编译内存（MiB）', min: 128, max: 1024 },
  { key: 'runTimeMs', name: '运行 CPU 时间（毫秒）', min: 100, max: 10000 },
  { key: 'runMemoryMb', name: '运行内存（MiB）', min: 16, max: 512 },
  { key: 'outputLimitKb', name: '输出上限（KiB）', min: 16, max: 2048 },
  { key: 'executionConcurrency', name: '执行槽位', min: 1, max: executionLimits.maxConcurrentRuns },
] as const
async function check() {
  busy.value = true
  try {
    states.value = await probePlatform(AbortSignal.timeout(10000))
  } catch (e) {
    reportError(e)
  } finally {
    busy.value = false
  }
}
onMounted(async () => {
  try {
    Object.assign(form, await api('/admin/settings'))
    await check()
  } catch (e) {
    reportError(e)
  }
})
async function save() {
  try {
    await api('/admin/settings', 'POST', form)
    notify('限额已保存，将应用到下一次运行')
  } catch (e) {
    reportError(e)
  }
}
</script>
<template>
  <div class="page-heading">
    <div>
      <div class="heading-meta">平台管理</div>
      <h1>服务与运行配置</h1>
      <p>执行节点连接配置从服务器环境变量读取；限额设置持久化到 PostgreSQL。</p>
    </div>
    <Button :disabled="busy" variant="outline" @click="check">{{
      busy ? '检查中…' : '检查服务'
    }}</Button>
  </div>
  <section class="panel">
    <div class="panel-heading"><h2>服务探活</h2></div>
    <div class="service-grid">
      <article v-for="(result, key) in states" :key="key">
        <h3>{{ key }}</h3>
        <span class="status" :class="result.status === 'healthy' ? 'positive' : 'red'">{{
          result.status
        }}</span>
        <p>{{ result.message }}</p>
      </article>
    </div>
  </section>
  <section class="panel form-stack">
    <h2>原生 Linux 执行节点</h2>
    <label>节点地址<input :value="form.goJudgeUrl" readonly /></label>
    <p>认证令牌保留在服务端。基础交互运行最长 60 秒；非交互运行最长 5 秒。编译最长 20 秒。</p>
    <form class="form-stack" @submit.prevent="save">
      <label
        >C++ 标准<select v-model="form.compilerProfile">
          <option value="gcc13-cpp17">GCC 13.3 / C++17</option>
          <option value="gcc13-cpp20">GCC 13.3 / C++20</option>
        </select></label
      >
      <div class="form-grid">
        <label v-for="field in fields" :key="field.key"
          >{{ field.name
          }}<input
            v-model.number="form[field.key]"
            type="number"
            required
            :min="field.min"
            :max="field.max"
        /></label>
      </div>
      <Button type="submit" class="self-start">保存到服务器</Button>
    </form>
  </section>
</template>
