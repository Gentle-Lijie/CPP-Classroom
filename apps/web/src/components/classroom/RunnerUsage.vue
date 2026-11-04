<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ArrowUpRight, ChartNoAxesCombined, Server } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Alert } from '@/components/ui/alert'
import { api } from '@/lib/api'
import { i18n } from '@/i18n'

const { t } = useI18n()
const timeLocale = () => (i18n.global.locale.value === 'en' ? 'en-US' : 'zh-CN')

interface UsagePoint {
  at: string
  calls: number
}
interface RunnerUsage {
  id: string
  name: string
  enabled: boolean
  capacity: number
  activeCount: number
  totalCalls: number
  points: UsagePoint[]
}
const nodes = ref<RunnerUsage[]>([])
const loading = ref(true)
const error = ref('')
const updatedAt = ref('')
let refreshing = false
let disposed = false
let timer: ReturnType<typeof setInterval> | undefined
const cards = computed(() =>
  nodes.value.map((node) => {
    const peak = Math.max(0, ...node.points.map((point) => point.calls))
    const points = node.points.map((point, i) => ({
      ...point,
      x: 4 + (i * 592) / Math.max(1, node.points.length - 1),
      y: 112 - (point.calls / Math.max(1, peak)) * 88,
    }))
    const line = points.map((point, i) => `${i ? 'L' : 'M'}${point.x},${point.y}`).join(' ')
    return {
      ...node,
      peak,
      points,
      line,
      area: line ? `${line} L596,112 L4,112 Z` : '',
      occupancy: Math.round((node.activeCount / node.capacity) * 100),
    }
  }),
)
function hour(value?: string) {
  return value
    ? new Date(value).toLocaleTimeString(timeLocale(), {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      })
    : '—'
}
async function refresh() {
  if (refreshing) return
  refreshing = true
  try {
    const result = await api<RunnerUsage[]>('/admin/runners/usage')
    if (disposed) return
    nodes.value = result
    error.value = ''
    updatedAt.value = new Date().toLocaleTimeString(timeLocale(), { hour12: false })
  } catch (e) {
    if (!disposed) error.value = e instanceof Error ? e.message : t('runner.usage.loadFailed')
  } finally {
    refreshing = false
    if (!disposed) loading.value = false
  }
}
defineExpose({ refresh })
onMounted(() => {
  void refresh()
  timer = setInterval(() => {
    if (!document.hidden) void refresh()
  }, 15000)
})
onBeforeUnmount(() => {
  disposed = true
  clearInterval(timer)
})
</script>
<template>
  <section class="runner-usage" aria-labelledby="runner-usage-title">
    <div class="usage-heading">
      <div>
        <h2 id="runner-usage-title">{{ t('runner.usage.title') }}</h2>
        <p>{{ t('runner.usage.subtitle') }}</p>
      </div>
      <div class="usage-heading-actions">
        <span v-if="updatedAt" class="updated-at">
          {{ t('runner.usage.updated', { time: updatedAt }) }}
        </span>
        <Button as-child variant="outline" size="sm">
          <RouterLink to="/admin/settings">
            {{ t('runner.usage.manageNodes') }}
            <ArrowUpRight :size="14" />
          </RouterLink>
        </Button>
      </div>
    </div>
    <Alert v-if="error" type="error" role="alert">
      <span>{{ error }}</span>
      <template #actions>
        <Button variant="outline" size="sm" @click="refresh">{{ t('common.retry') }}</Button>
      </template>
    </Alert>
    <div v-if="loading" class="usage-empty" role="status">
      {{ t('runner.usage.loading') }}
    </div>
    <div v-else-if="!nodes.length && !error" class="usage-empty">
      <Server :size="25" />
      <strong>{{ t('runner.usage.noNodes') }}</strong>
      <p>{{ t('runner.usage.noNodesHint') }}</p>
      <Button as-child variant="outline" size="sm">
        <RouterLink to="/admin/settings">{{ t('runner.usage.addNode') }}</RouterLink>
      </Button>
    </div>
    <div v-else class="usage-grid">
      <article
        v-for="node in cards"
        :key="node.id"
        class="usage-card"
        :class="{ 'is-disabled': !node.enabled }">
        <div class="usage-card-heading">
          <span class="usage-icon"><ChartNoAxesCombined :size="20" /></span>
          <h3>{{ node.name }}</h3>
          <span class="node-enabled" :class="{ disabled: !node.enabled }">
            <i />
            {{ node.enabled ? t('common.enabled') : t('common.disabled') }}
          </span>
        </div>
        <div class="usage-numbers">
          <div>
            <strong class="call-total">{{ node.totalCalls.toLocaleString() }}</strong>
            <span class="metric-label">{{ t('runner.usage.calls24h') }}</span>
          </div>
          <div class="occupancy">
            <strong>
              {{ node.occupancy }}
              <small>%</small>
            </strong>
            <span class="metric-label">
              {{
                t('runner.usage.occupancy', {
                  active: node.activeCount,
                  capacity: node.capacity,
                })
              }}
            </span>
          </div>
        </div>
        <div class="usage-chart-meta">
          <span>{{ t('runner.usage.callsPerHour') }}</span>
          <span>{{ t('runner.usage.peakCalls', { count: node.peak }) }}</span>
        </div>
        <svg
          class="usage-chart"
          viewBox="0 0 600 128"
          role="img"
          :aria-label="t('runner.usage.chartAria', { name: node.name, total: node.totalCalls })"
          preserveAspectRatio="none">
          <defs>
            <linearGradient :id="`usage-fill-${node.id}`" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="currentColor" stop-opacity="0.2" />
              <stop offset="100%" stop-color="currentColor" stop-opacity="0.02" />
            </linearGradient>
          </defs>
          <path d="M4 24 H596 M4 68 H596 M4 112 H596" class="chart-grid" />
          <path :d="node.area" :fill="`url(#usage-fill-${node.id})`" />
          <path :d="node.line" class="chart-line" />
          <circle
            v-for="point in node.points"
            :key="point.at"
            :cx="point.x"
            :cy="point.y"
            r="5"
            class="chart-point">
            <title>
              {{ hour(point.at) }} · {{ t('runner.usage.pointCalls', { count: point.calls }) }}
            </title>
          </circle>
        </svg>
        <div class="chart-times">
          <span>{{ hour(node.points[0]?.at) }}</span>
          <span>
            {{ node.totalCalls ? t('runner.usage.hourlyStats') : t('runner.usage.noCalls') }}
          </span>
          <span>{{ hour(node.points.at(-1)?.at) }}</span>
        </div>
      </article>
    </div>
    <p v-if="nodes.length" class="usage-note">
      {{ t('runner.usage.note') }}
    </p>
  </section>
</template>
<style scoped>
.runner-usage {
  margin-top: 28px;
}
.usage-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 18px;
}
.usage-heading h2 {
  font-size: 18px;
  font-weight: 600;
  color: var(--ui-ink);
}
.usage-heading p {
  font-size: 13px;
  color: var(--ui-muted);
  margin-top: 4px;
}
.usage-heading-actions {
  display: flex;
  align-items: center;
  gap: 16px;
}
.updated-at {
  font-size: 12px;
  color: var(--ui-muted);
  font-variant-numeric: tabular-nums;
}
.usage-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 20px;
}
.usage-card {
  --usage-color: #079ea6;
  border: 1px solid var(--ui-line);
  border-radius: 16px;
  overflow: hidden;
  padding: 24px 24px 16px;
  min-width: 0;
}
.usage-card.is-disabled {
  --usage-color: var(--ui-muted);
}
.usage-card-heading {
  display: flex;
  align-items: center;
  gap: 12px;
}
.usage-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  background: color-mix(in srgb, var(--usage-color) 10%, transparent);
  border-radius: 12px;
  color: var(--usage-color);
}
.usage-card h3 {
  font-size: 15px;
  font-weight: 600;
  color: var(--ui-secondary);
  overflow-wrap: anywhere;
}
.node-enabled {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--ui-success);
  font-size: 12px;
  white-space: nowrap;
}
.node-enabled i {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: currentColor;
}
.node-enabled.disabled {
  color: var(--ui-muted);
}
.usage-numbers {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 20px;
  margin-top: 20px;
}
.usage-numbers > div {
  display: grid;
  gap: 5px;
}
.call-total {
  font-size: 38px;
  font-weight: 650;
  line-height: 1.2;
  letter-spacing: -1px;
  color: var(--ui-ink);
  font-variant-numeric: tabular-nums;
}
.metric-label {
  font-size: 13px;
  color: var(--ui-muted);
}
.occupancy {
  text-align: right;
}
.occupancy > strong {
  font-size: 23px;
  font-weight: 550;
  line-height: 1.4;
  font-variant-numeric: tabular-nums;
  color: var(--ui-secondary);
}
.occupancy small {
  font-size: 14px;
  font-weight: 400;
  margin-left: 2px;
}
.usage-chart-meta {
  display: flex;
  justify-content: space-between;
  margin-top: 25px;
  color: var(--ui-muted);
  font-size: 11px;
}
.usage-chart {
  display: block;
  width: 100%;
  height: 128px;
  margin-top: 5px;
  color: var(--usage-color);
  overflow: visible;
}
.chart-grid {
  fill: none;
  stroke: var(--ui-line);
  stroke-width: 1;
  stroke-dasharray: 3 5;
  opacity: 0.6;
  vector-effect: non-scaling-stroke;
}
.chart-line {
  fill: none;
  stroke: currentColor;
  stroke-width: 2.5;
  stroke-linecap: round;
  stroke-linejoin: round;
  vector-effect: non-scaling-stroke;
}
.chart-point {
  fill: currentColor;
  opacity: 0;
  transition: opacity 0.15s;
  vector-effect: non-scaling-stroke;
}
.chart-point:hover {
  opacity: 1;
}
.chart-times {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: var(--ui-muted);
  font-variant-numeric: tabular-nums;
}
.usage-note {
  margin-top: 12px;
  font-size: 12px;
  line-height: 1.7;
  color: var(--ui-muted);
}
.usage-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 48px;
  border: 1px dashed var(--ui-line);
  border-radius: 12px;
  color: var(--ui-muted);
  font-size: 14px;
}
.usage-empty strong {
  color: var(--ui-secondary);
  font-weight: 500;
}
.usage-empty p {
  font-size: 13px;
}
</style>
