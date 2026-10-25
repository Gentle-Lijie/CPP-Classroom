<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useRoute, useRouter, onBeforeRouteLeave } from 'vue-router'
import {
  Activity,
  Server,
  Settings2,
  ShieldCheck,
  Save,
  RefreshCw,
  Download,
  ArrowRight,
  LockKeyhole,
  CircleCheck,
  CircleAlert,
  Circle,
  Clock3,
} from '@lucide/vue'
import { Button } from '@/components/ui/button'
import Modal from '@/components/classroom/Modal.vue'
import { download, notify } from '@/data/demo'
import {
  loadPlatformDraft,
  platformDraftKey,
  validatePlatformDraft,
  sanitizePlatformDraft,
} from '@/lib/platform-config'
import { probePlatform, type ProbeResult } from '@/lib/platform-health'
const route = useRoute()
const router = useRouter()
const sections = [
  { id: 'health', label: '服务与探活', icon: Activity },
  { id: 'runner', label: '执行节点', icon: Server },
  { id: 'execution', label: '运行环境与限额', icon: Settings2 },
  { id: 'policy', label: '平台默认策略', icon: ShieldCheck },
]
const section = computed(() =>
  sections.some((s) => s.id === route.query.section) ? String(route.query.section) : 'health',
)
const form = reactive(loadPlatformDraft())
const saved = ref(JSON.stringify(form))
const dirty = computed(() => JSON.stringify(form) !== saved.value)
const error = ref('')
const leaveOpen = ref(false)
const states = reactive<Record<'api' | 'database' | 'runner', ProbeResult>>({
  api: { status: 'idle', message: '尚未检测' },
  database: { status: 'idle', message: '尚未检测' },
  runner: { status: 'idle', message: '尚未检测' },
})
const pending = ref(false)
const checkedAt = ref('')
const autoRefresh = ref(false)
const intervalSeconds = ref(30)
let poll: ReturnType<typeof setInterval> | undefined
let controller: AbortController | undefined
let leaveResolve: ((value: boolean) => void) | undefined
let disposed = false
const services = computed(() => [
  { key: 'api' as const, name: '业务 API', description: 'GET /api/health', icon: Activity },
  {
    key: 'database' as const,
    name: 'PostgreSQL',
    description: '由业务服务检查数据库连接',
    icon: Server,
  },
  {
    key: 'runner' as const,
    name: 'go-judge',
    description: '由业务服务请求执行节点 /version',
    icon: Server,
  },
])
function statusLabel(status: string) {
  return (
    {
      idle: '未检测',
      checking: '检测中',
      healthy: '可连接',
      unavailable: '不可用',
      unconfigured: '未配置',
    }[status] ?? '未知'
  )
}
function save() {
  error.value = validatePlatformDraft(form) ?? ''
  if (error.value) return
  try {
    const value = sanitizePlatformDraft(form)
    localStorage.setItem(platformDraftKey, JSON.stringify(value))
    Object.assign(form, value)
    saved.value = JSON.stringify(form)
    notify('平台配置草稿已保存到本机，尚未应用到服务器')
  } catch {
    error.value = '本机保存失败，请先导出配置草稿。'
  }
}
function exportDraft() {
  error.value = validatePlatformDraft(form) ?? ''
  if (error.value) return
  download(
    'platform-config-draft.json',
    JSON.stringify(sanitizePlatformDraft(form), null, 2),
    'application/json',
  )
}
function revert() {
  Object.assign(form, JSON.parse(saved.value))
  error.value = ''
}
async function probe() {
  if (pending.value || disposed) return
  pending.value = true
  controller = new AbortController()
  const active = controller
  for (const key of ['api', 'database', 'runner'] as const)
    states[key] = { status: 'checking', message: '正在检测服务器当前配置…' }
  const timer = setTimeout(() => active.abort(), 8000)
  try {
    const result = await probePlatform(active.signal)
    if (!disposed) {
      Object.assign(states, result)
      checkedAt.value = new Intl.DateTimeFormat('zh-CN', {
        timeZone: 'Asia/Shanghai',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }).format(new Date())
    }
  } catch {
    if (!disposed)
      for (const key of ['api', 'database', 'runner'] as const)
        states[key] = { status: 'unavailable', message: '检测超时或连接失败，请稍后重试。' }
  } finally {
    clearTimeout(timer)
    if (!disposed) pending.value = false
  }
}
watch([autoRefresh, intervalSeconds], () => {
  clearInterval(poll)
  if (autoRefresh.value) {
    void probe()
    poll = setInterval(() => {
      void probe()
    }, intervalSeconds.value * 1000)
  }
})
onBeforeRouteLeave((to) => {
  if (to.path === '/admin/settings' || !dirty.value) return true
  leaveOpen.value = true
  return new Promise<boolean>((resolve) => {
    leaveResolve = resolve
  })
})
function leave(confirmed: boolean) {
  const resolve = leaveResolve
  leaveResolve = undefined
  leaveOpen.value = false
  resolve?.(confirmed)
}
onBeforeUnmount(() => {
  disposed = true
  controller?.abort()
  clearInterval(poll)
})
</script>
<template>
  <div class="platform-settings">
    <div class="page-heading">
      <div>
        <div class="heading-meta">平台管理</div>
        <h1>平台配置</h1>
        <p>服务连接、执行节点与全平台默认值。</p>
      </div>
      <div class="heading-actions">
        <Button variant="outline" @click="exportDraft"><Download />导出草稿</Button
        ><Button @click="save"><Save />保存本机草稿</Button>
      </div>
    </div>
    <div class="platform-scope-note">
      <ShieldCheck :size="17" /><span
        >配置保存为本机草稿，尚未应用到服务器。探活会读取当前业务服务的真实结果。</span
      ><span v-if="dirty" class="platform-unsaved">有未保存修改</span>
    </div>
    <div class="platform-layout">
      <nav class="platform-nav" aria-label="平台配置分类">
        <button
          v-for="s in sections"
          :key="s.id"
          :class="{ selected: section === s.id }"
          @click="router.replace({ path: '/admin/settings', query: { section: s.id } })"
        >
          <component :is="s.icon" :size="16" />{{ s.label }}<ArrowRight :size="13" />
        </button>
      </nav>
      <div class="platform-panels">
        <section v-if="section === 'health'" class="panel">
          <div class="platform-section-heading">
            <div>
              <h2>服务与探活</h2>
              <p>检测业务 API、数据库和执行节点的连通性。</p>
            </div>
            <Button variant="outline" :disabled="pending" @click="probe"
              ><RefreshCw :class="{ 'probe-spinning': pending }" />{{
                pending ? '检测中…' : '检测当前服务'
              }}</Button
            >
          </div>
          <div class="platform-health-controls">
            <label class="inline-items"
              ><input v-model="autoRefresh" type="checkbox" />在本页自动刷新</label
            ><select v-model.number="intervalSeconds" aria-label="自动探活间隔">
              <option :value="15">每 15 秒</option>
              <option :value="30">每 30 秒</option>
              <option :value="60">每 60 秒</option></select
            ><span class="ml-auto"
              ><Clock3 :size="13" />{{ checkedAt ? '最近检测 ' + checkedAt : '尚未检测' }}</span
            >
          </div>
          <div class="platform-service-list">
            <article v-for="s in services" :key="s.key">
              <div class="platform-service-icon"><component :is="s.icon" :size="19" /></div>
              <div class="platform-service-copy">
                <h3>{{ s.name }}</h3>
                <span>{{ s.description }}</span>
                <p>{{ states[s.key].message }}</p>
              </div>
              <div class="platform-service-result" role="status">
                <span class="platform-probe-state" :class="states[s.key].status"
                  ><CircleCheck v-if="states[s.key].status === 'healthy'" :size="14" /><CircleAlert
                    v-else-if="states[s.key].status === 'unavailable'"
                    :size="14"
                  /><Circle v-else :size="12" />{{ statusLabel(states[s.key].status) }}</span
                ><small>{{
                  states[s.key].latencyMs !== undefined ? states[s.key].latencyMs + ' ms' : '—'
                }}</small>
              </div>
            </article>
          </div>
          <div class="platform-panel-note">
            检测通过仅表示服务可连接，不代表 C++ 编译、交互输入或 Linux 隔离能力已验证。go-judge
            认证与地址由业务服务当前环境变量决定。
          </div>
        </section>
        <section v-else-if="section === 'runner'" class="panel platform-form-panel">
          <div class="platform-section-heading">
            <div>
              <h2>go-judge 执行节点</h2>
              <p>原生 Linux 独立执行服务的连接配置草稿。</p>
            </div>
            <Server :size="20" />
          </div>
          <div class="form-stack">
            <label
              >节点地址<input
                v-model.trim="form.goJudgeUrl"
                type="url"
                placeholder="http://10.10.0.20:5050"
                spellcheck="false"
              /><small>对应服务端 GO_JUDGE_URL；留空表示尚未配置。</small></label
            ><label
              >连通性检查超时（ms）<input
                v-model.number="form.goJudgeTimeoutMs"
                type="number"
                min="100"
                max="30000"
              /><small>对应 GO_JUDGE_TIMEOUT_MS；不是学生程序的运行时限。</small></label
            >
            <div class="platform-managed-setting">
              <LockKeyhole :size="17" />
              <div>
                <strong>认证信息由服务端管理</strong>
                <p>服务端环境变量 GO_JUDGE_AUTH_TOKEN，不通过此页面读取或保存。</p>
              </div>
              <span>服务端配置</span>
            </div>
            <div class="platform-panel-note">
              修改草稿地址不会改变本页探活目标，也不会从学生浏览器直接连接执行节点。
            </div>
            <Button
              variant="outline"
              class="self-start"
              @click="router.replace('/admin/settings?section=health')"
              ><Activity />查看当前服务探活</Button
            >
          </div>
        </section>
        <section v-else-if="section === 'execution'" class="panel platform-form-panel">
          <div class="platform-section-heading">
            <div>
              <h2>运行环境与限额</h2>
              <p>为新课堂提供默认环境，实际限额需后端接入后生效。</p>
            </div>
            <Settings2 :size="20" />
          </div>
          <div class="form-stack">
            <label
              >受控环境<select v-model="form.compilerProfile">
                <option value="gcc13-cpp17">GCC 13.2 · C++17（示例）</option>
                <option value="gcc13-cpp20">GCC 13.2 · C++20（示例）</option>
              </select></label
            >
            <div class="platform-form-group">
              <h3>编译阶段</h3>
              <div class="form-grid">
                <label
                  >编译时限（ms）<input
                    v-model.number="form.compileTimeMs"
                    type="number"
                    min="100"
                    max="120000" /></label
                ><label
                  >编译内存（MB）<input
                    v-model.number="form.compileMemoryMb"
                    type="number"
                    min="16"
                    max="8192"
                /></label>
              </div>
            </div>
            <div class="platform-form-group">
              <h3>运行阶段</h3>
              <div class="form-grid">
                <label
                  >运行时限（ms）<input
                    v-model.number="form.runTimeMs"
                    type="number"
                    min="100"
                    max="60000" /></label
                ><label
                  >运行内存（MB）<input
                    v-model.number="form.runMemoryMb"
                    type="number"
                    min="16"
                    max="4096" /></label
                ><label
                  >输出上限（KB）<input
                    v-model.number="form.outputLimitKb"
                    type="number"
                    min="16"
                    max="16384" /></label
                ><label
                  >执行并发槽位<input
                    v-model.number="form.executionConcurrency"
                    type="number"
                    min="1"
                    max="64"
                /></label>
              </div>
            </div>
            <p class="form-hint">
              编译与运行分别限额；并发数需要在目标 Linux 环境实测，不能由界面数值推定容量。
            </p>
          </div>
        </section>
        <section v-else class="panel platform-form-panel">
          <div class="platform-section-heading">
            <div>
              <h2>平台默认策略</h2>
              <p>用于新建课堂与记录保留的配置草稿。</p>
            </div>
            <ShieldCheck :size="20" />
          </div>
          <div class="form-stack">
            <div class="form-grid">
              <label
                >默认课堂人数上限<input
                  v-model.number="form.classroomCapacity"
                  type="number"
                  min="1"
                  max="50" /></label
              ><label
                >运行记录保留天数<input
                  v-model.number="form.recordRetentionDays"
                  type="number"
                  min="1"
                  max="3650"
              /></label>
            </div>
            <label class="toggle-row"
              ><span
                ><strong>允许继续修改与再次提交</strong
                ><small>学生提交后仍保留独立草稿。</small></span
              ><input v-model="form.allowResubmit" type="checkbox" role="switch" /></label
            ><label class="toggle-row"
              ><span
                ><strong>归档后保留只读访问</strong><small>保留查看和导出作品的入口。</small></span
              ><input v-model="form.archiveReadonly" type="checkbox" role="switch"
            /></label>
            <p class="form-hint">保留策略不会在当前前端原型中删除文件、运行记录或数据库数据。</p>
          </div>
        </section>
        <div v-if="error" role="alert" class="error-box">{{ error }}</div>
        <div class="platform-bottom-actions">
          <span>{{ dirty ? '配置尚未保存' : '当前草稿已保存到本机' }}</span
          ><Button v-if="dirty" variant="ghost" @click="revert">撤销未保存修改</Button>
        </div>
      </div>
    </div>
    <Modal
      :open="leaveOpen"
      title="有尚未保存的平台配置"
      description="离开后会丢失本页未保存的修改，服务器配置不受影响。"
      @update:open="!$event && leave(false)"
      ><div class="modal-actions">
        <Button variant="outline" @click="leave(false)">继续编辑</Button
        ><Button variant="destructive" @click="leave(true)">放弃修改并离开</Button>
      </div></Modal
    >
  </div>
</template>
