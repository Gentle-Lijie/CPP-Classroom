<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { MonitorX } from '@lucide/vue'
import { Button } from '@/components/ui/button'

const MIN_WIDTH = 1280
const MIN_HEIGHT = 720
const STORAGE_KEY = 'classroom:resolution-notice-dismissed'
const visible = ref(false)
const size = ref('')

function dismissed(): boolean {
  try {
    return sessionStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return true
  }
}
function check() {
  size.value = `${window.innerWidth} × ${window.innerHeight}`
  visible.value = (window.innerWidth < MIN_WIDTH || window.innerHeight < MIN_HEIGHT) && !dismissed()
}
function dismiss() {
  visible.value = false
  try {
    sessionStorage.setItem(STORAGE_KEY, '1')
  } catch {
    /* storage 不可用时本次会话内不再重复提示 */
  }
}
/* 刷新后自动清空“已关闭”标记，分辨率仍不足时重新提示 */
function clearDismissed() {
  try {
    sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    /* 忽略 */
  }
}
let raf = 0
function onResize() {
  if (!raf) raf = requestAnimationFrame(check)
}
onMounted(() => {
  window.addEventListener('resize', onResize, { passive: true })
  window.addEventListener('beforeunload', clearDismissed)
  check()
})
onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
  window.removeEventListener('resize', onResize)
  window.removeEventListener('beforeunload', clearDismissed)
})
</script>
<template>
  <div
    v-if="visible"
    class="resolution-notice"
    role="alertdialog"
    aria-modal="true"
    aria-label="屏幕分辨率过低"
  >
    <div class="resolution-card">
      <span class="resolution-icon"><MonitorX :size="26" /></span>
      <h2>屏幕分辨率过低</h2>
      <p>
        当前窗口为 <strong>{{ size }}</strong
        >，低于建议的 1280 ×
        720。请放大窗口或调大显示器分辨率后使用，部分页面内容在小窗口下可能显示不完整。
      </p>
      <Button variant="outline" class="self-start" @click="dismiss">知道了，继续使用</Button>
    </div>
  </div>
</template>

<style scoped>
.resolution-notice {
  position: fixed;
  inset: 0;
  z-index: 100;
  background: var(--ui-overlay);
  backdrop-filter: blur(2px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px;
  animation: resolution-fade-in 0.15s ease;
}
.resolution-card {
  max-width: 420px;
  background: var(--ui-page);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 30px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  box-shadow: 0 18px 44px rgb(0 0 0 / 18%);
}
.resolution-icon {
  display: inline-flex;
  color: var(--ui-warning);
}
.resolution-card h2 {
  font-size: 18px;
  font-weight: 600;
}
.resolution-card p {
  margin: 0;
  font-size: 14px;
  line-height: 1.9;
  color: var(--ui-secondary);
}
.resolution-card p strong {
  font-variant-numeric: tabular-nums;
}
@keyframes resolution-fade-in {
  from {
    opacity: 0;
  }
}
</style>
