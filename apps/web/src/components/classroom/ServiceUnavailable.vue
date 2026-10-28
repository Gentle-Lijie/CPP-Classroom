<script setup lang="ts">
import { CodeXml, RefreshCw, Unplug } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import ThemeToggle from './ThemeToggle.vue'

defineProps<{ busy: boolean }>()
defineEmits<{ retry: [] }>()
</script>

<template>
  <div class="service-page">
    <header class="service-header">
      <div class="service-brand">
        <span class="service-brand-mark"><CodeXml :size="22" /></span>
        <span>码上课堂</span>
      </div>
      <ThemeToggle />
    </header>

    <main class="service-main">
      <section class="service-content" aria-labelledby="service-title" :aria-busy="busy">
        <div class="service-illustration" aria-hidden="true">
          <Unplug :size="48" :stroke-width="1.5" />
        </div>
        <h1 id="service-title">暂时无法连接服务器</h1>
        <p class="service-description">
          服务器暂时不可用，或网络连接已中断。
          <br />
          请检查网络连接，或稍后再试。
        </p>
        <Button class="service-retry" :disabled="busy" @click="$emit('retry')">
          <RefreshCw :size="16" :class="{ 'animate-spin': busy }" />
          <span>{{ busy ? '正在连接…' : '重新连接' }}</span>
        </Button>
        <p class="service-note">重新连接不会清除本机草稿。</p>
      </section>
    </main>

    <footer class="service-footer">码上课堂 · C++ Classroom</footer>
  </div>
</template>

<style scoped>
.service-page {
  display: grid;
  grid-template-rows: auto 1fr auto;
  min-height: 100dvh;
  background: var(--ui-page);
}
.service-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 24px 32px;
}
.service-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--ui-ink);
  font-size: 18px;
  font-weight: 600;
}
.service-brand-mark {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 7px;
  background: var(--ui-action);
  color: var(--ui-on-action);
}
.service-main {
  display: grid;
  place-items: center;
  padding: 48px 32px;
}
.service-content {
  width: 440px;
  text-align: center;
}
.service-illustration {
  display: grid;
  place-items: center;
  width: 104px;
  height: 104px;
  margin: 0 auto 28px;
  border-radius: 50%;
  background: var(--ui-canvas);
  color: var(--ui-icon-slate);
}
.service-content h1 {
  color: var(--ui-ink);
  font-size: 28px;
  font-weight: 600;
  line-height: 1.4;
  letter-spacing: -0.02em;
}
.service-description {
  margin-top: 16px;
  color: var(--ui-muted);
  font-size: 16px;
  line-height: 1.8;
}
.service-retry {
  min-width: 140px;
  min-height: 40px;
  margin-top: 28px;
}
.service-note {
  margin-top: 16px;
  color: var(--ui-muted);
  font-size: 14px;
}
.service-footer {
  padding: 24px 32px;
  color: var(--ui-muted);
  font-size: 12px;
  text-align: center;
}
</style>
