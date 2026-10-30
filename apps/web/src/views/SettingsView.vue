<script setup lang="ts">
import { useActionFeedback } from '@/composables/useActionFeedback'
import { Alert } from '@/components/ui/alert'
import { useGuideSurfaces } from '@/lib/spotlight'
import { NumberInput } from '@/components/ui/number-input'
import { Form } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectOption } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { Save, Copy, RefreshCw, ShieldCheck, Archive, Settings2, ChevronRight } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import Modal from '@/components/classroom/Modal.vue'
import PythonBeta from '@/components/classroom/PythonBeta.vue'
import type { SourceLanguage } from '@classroom/contracts'
import {
  activeClassroom,
  demo,
  notify,
  updateClass,
  classPath,
  reportError,
  executionSettings,
} from '@/data/demo'
import { api } from '@/lib/api'
import { confirmAction } from '@/lib/confirm'
import { classroomPolicyChanges } from '@/lib/sensitive-actions'
import { useRouter } from 'vue-router'
import { refresh } from '@/data/demo'
const router = useRouter()
import { onBeforeRouteLeave } from 'vue-router'
const environmentLanguage = ref<SourceLanguage>('cpp')
const languageEnvironment = computed(() => executionSettings.languages[environmentLanguage.value])
const form = reactive({
  name: activeClassroom.value.name,
  description: activeClassroom.value.description,
  state: activeClassroom.value.status,
  access: String(activeClassroom.value.settings?.access ?? 'approval'),
  capacity: Number(activeClassroom.value.settings?.capacity ?? 50),
  allowJoin: activeClassroom.value.settings?.allowJoin !== false,
  allowRun: activeClassroom.value.settings?.allowRun !== false,
  allowResubmit: activeClassroom.value.settings?.allowResubmit !== false,
  readonly: activeClassroom.value.settings?.readonly !== false,
})
const initial = ref(JSON.stringify(form))
const dirty = computed(() => initial.value !== JSON.stringify(form))
const busy = ref(false)
const error = ref('')
const regenerate = ref(false)
const leave = ref(false)
let resolveLeave: ((allowed: boolean) => void) | undefined
onBeforeRouteLeave(() => {
  if (!dirty.value) return true
  leave.value = true
  return new Promise<boolean>((resolve) => {
    resolveLeave = resolve
  })
})
function settleLeave(allowed: boolean) {
  leave.value = false
  resolveLeave?.(allowed)
  resolveLeave = undefined
}
function beforeUnload(event: BeforeUnloadEvent) {
  if (dirty.value) {
    event.preventDefault()
    event.returnValue = ''
  }
}
onMounted(() => {
  window.addEventListener('beforeunload', beforeUnload)
  panelEl.value?.addEventListener('scroll', onScroll, { passive: true })
  spy()
})
onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', beforeUnload)
  panelEl.value?.removeEventListener('scroll', onScroll)
  if (spyRaf) cancelAnimationFrame(spyRaf)
})
const sections = ['基本信息', '加入与邀请', '编程环境', '课堂策略', '归档课堂']
const tab = ref(sections[0])
function goTo(name: string) {
  tab.value = name
  document
    .getElementById(`settings-section-${sections.indexOf(name)}`)
    ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
useGuideSurfaces(
  Object.fromEntries(
    sections.map((name) => [
      `settings-${name}`,
      () => {
        const previous = tab.value
        goTo(name)
        return () => {
          tab.value = previous
        }
      },
    ]),
  ),
)
const panelEl = ref<HTMLElement | null>(null)
let spyRaf = 0
function spy() {
  spyRaf = 0
  const panel = panelEl.value
  if (!panel) return
  const panelTop = panel.getBoundingClientRect().top
  let current = sections[0]
  for (let i = 0; i < sections.length; i++) {
    const el = document.getElementById(`settings-section-${i}`)
    if (el && el.getBoundingClientRect().top - panelTop <= 24) current = sections[i]
  }
  if (panel.scrollTop + panel.clientHeight >= panel.scrollHeight - 4)
    current = sections[sections.length - 1]
  tab.value = current
}
function onScroll() {
  if (!spyRaf) spyRaf = requestAnimationFrame(spy)
}
const archive = ref(false)
const reopen = ref(false)
const confirmState = ref('')
const inviteExpires = computed(() =>
  activeClassroom.value.inviteExpiresAt
    ? new Date(activeClassroom.value.inviteExpiresAt).toLocaleString('zh-CN')
    : '未获取到到期时间，请重新生成',
)
const inviteExpired = computed(
  () =>
    !!activeClassroom.value.inviteExpiresAt &&
    new Date(activeClassroom.value.inviteExpiresAt).getTime() < Date.now(),
)
async function save(status = form.state, confirmed = false) {
  if (busy.value) return false
  error.value = ''
  if (!form.name.trim()) {
    error.value = '请填写课堂名称'
    goTo('基本信息')
    return false
  }
  if (!Number.isInteger(form.capacity) || form.capacity < 1 || form.capacity > 50) {
    error.value = '课堂人数上限必须为 1–50 的整数'
    goTo('课堂策略')
    return false
  }
  if (form.capacity < activeClassroom.value.students) {
    error.value = `当前已有 ${activeClassroom.value.students} 位学生，人数上限不能小于现有人数`
    goTo('课堂策略')
    return false
  }
  if (
    !confirmed &&
    status !== activeClassroom.value.status &&
    ['未开始', '已关闭', '已归档'].includes(status)
  ) {
    confirmState.value = status
    return false
  }
  const settings = activeClassroom.value.settings
  const changedPolicies = classroomPolicyChanges(
    {
      access: String(settings?.access ?? 'approval'),
      capacity: Number(settings?.capacity ?? 50),
      allowJoin: settings?.allowJoin !== false,
      allowRun: settings?.allowRun !== false,
      allowResubmit: settings?.allowResubmit !== false,
      readonly: settings?.readonly !== false,
    },
    {
      access: form.access,
      capacity: form.capacity,
      allowJoin: form.allowJoin,
      allowRun: form.allowRun,
      allowResubmit: form.allowResubmit,
      readonly: form.readonly,
    },
  )
  if (!confirmed && (changedPolicies.length || status !== activeClassroom.value.status)) {
    const policySummary = changedPolicies.length ? `将修改：${changedPolicies.join('、')}。` : ''
    const statusSummary =
      status !== activeClassroom.value.status ? `课堂状态将更改为${status}。` : ''
    if (
      !(await confirmAction(
        `保存课堂设置？${statusSummary}${policySummary}关闭运行权限会停止正在执行的任务。`,
      ))
    )
      return false
  }
  busyReason.value = '正在保存课堂设置，请稍候'
  busy.value = true
  try {
    await updateClass({
      name: form.name.trim(),
      description: form.description,
      status,
      settings: {
        access: form.access,
        allowJoin: form.allowJoin,
        allowRun: form.allowRun,
        allowResubmit: form.allowResubmit,
        readonly: form.readonly,
        capacity: form.capacity,
      },
    })
    form.state = status
    initial.value = JSON.stringify(form)
    notify('课堂设置已保存')
    return true
  } catch (e) {
    error.value = e instanceof Error ? e.message : '保存失败，请重试'
    return false
  } finally {
    busy.value = false
  }
}
async function copy() {
  try {
    await navigator.clipboard.writeText(`${location.origin}/join?code=${demo.inviteCode}`)
    notify('邀请链接已复制')
  } catch {
    notify('请手动复制课堂码 ' + demo.inviteCode)
  }
}
async function regenerateInvite() {
  if (busy.value) return
  busyReason.value = '正在重新生成课堂码，请稍候'
  busy.value = true
  try {
    const data = await api<{ inviteCode: string; inviteExpiresAt?: string }>(
      classPath('/invite'),
      'POST',
      {},
    )
    demo.inviteCode = data.inviteCode
    activeClassroom.value.inviteCode = data.inviteCode
    if (data.inviteExpiresAt) activeClassroom.value.inviteExpiresAt = data.inviteExpiresAt
    regenerate.value = false
    notify('课堂码已更新，旧邀请失效')
  } catch (e) {
    reportError(e)
  } finally {
    busy.value = false
  }
}
async function deleteClass() {
  if (
    busy.value ||
    !(await confirmAction(
      `永久删除课堂「${activeClassroom.value.name}」？课堂内所有题目、成员关系、草稿、提交、求助、投屏和运行记录都会删除，且无法恢复。账号会保留。`,
      { destructive: true },
    ))
  )
    return
  busy.value = true
  try {
    await api(classPath(), 'DELETE')
    initial.value = JSON.stringify(form)
    await refresh()
    notify('课堂已永久删除')
    await router.push('/teacher/classes')
  } catch (e) {
    error.value = e instanceof Error ? e.message : '删除课堂失败'
  } finally {
    busy.value = false
  }
}
async function archiveClass() {
  if (await save('已归档', true)) archive.value = false
}
useActionFeedback(error)
const busyReason = ref('正在处理请求，请稍候')
</script>
<template>
  <div class="settings-page">
    <div class="page-heading">
      <div>
        <div class="heading-meta">课堂管理</div>
        <h1>课堂设置</h1>
      </div>
      <Button
        :disabled="busy || !dirty"
        :data-disabled-reason="busy ? busyReason : '设置没有更改，无需保存'"
        @click="save()">
        <Save />
        {{ busy ? '正在保存…' : dirty ? '保存设置' : '设置已保存' }}
      </Button>
    </div>

    <Alert v-if="dirty" role="status" type="warning">
      有尚未保存的课堂设置，开关调整需点击“保存设置”后生效。
    </Alert>
    <div class="settings-layout" :inert="busy">
      <nav class="settings-nav">
        <Button
          v-for="t in sections"
          :key="t"
          variant="plain"
          :class="{ selected: tab === t }"
          @click="goTo(t)">
          {{ t }}
          <ChevronRight :size="14" />
        </Button>
      </nav>
      <section ref="panelEl" class="panel settings-panel">
        <Form id="settings-section-0" class="form-stack settings-section" @submit.prevent="save()">
          <div class="settings-title">
            <Settings2 :size="19" />
            <h2>基本信息</h2>
          </div>
          <label>
            课堂名称
            <Input v-model="form.name" required maxlength="50" />
          </label>
          <label>
            课堂说明
            <Textarea v-model="form.description" rows="5" />
          </label>
          <label>
            课堂状态
            <Select
              v-model="form.state"
              :disabled="busy || activeClassroom.status === '已归档'"
              :data-disabled-reason="busy ? busyReason : '课堂已归档，请先恢复课堂教学'">
              <SelectOption>未开始</SelectOption>
              <SelectOption>进行中</SelectOption>
              <SelectOption>已关闭</SelectOption>
              <SelectOption v-if="activeClassroom.status === '已归档'">已归档</SelectOption>
            </Select>
          </label>
        </Form>
        <div id="settings-section-1" class="form-stack settings-section">
          <div class="settings-title">
            <ShieldCheck :size="19" />
            <h2>加入与邀请</h2>
          </div>
          <label class="toggle-row">
            <span>
              <strong>允许新成员加入</strong>
              <small>关闭后，已有成员仍可访问课堂。</small>
            </span>
            <Switch v-model="form.allowJoin" />
          </label>
          <label>
            入班方式
            <Select v-model="form.access">
              <SelectOption value="approval">教师审批后加入</SelectOption>
              <SelectOption value="roster">仅名单中的学生可加入</SelectOption>
            </Select>
          </label>
          <label>
            当前课堂码
            <div class="copy-row">
              <Input :value="demo.inviteCode" readonly />
              <Button variant="outline" @click="copy">
                <Copy />
                复制邀请
              </Button>
            </div>
          </label>
          <p class="form-hint" :class="{ 'danger-text': inviteExpired }">
            {{ inviteExpired ? '课堂码已过期' : '有效至' }}：{{
              inviteExpires
            }}。重新生成后原课堂码失效。
          </p>
          <Button
            variant="outline"
            class="self-start"
            :disabled="busy"
            :data-disabled-reason="busyReason"
            @click="regenerate = true">
            <RefreshCw />
            重新生成
          </Button>
        </div>
        <div id="settings-section-2" class="form-stack settings-section">
          <div class="settings-title">
            <Settings2 :size="19" />
            <h2>统一编程环境</h2>
          </div>
          <Alert type="info">编译标准与运行限制由平台管理员统一配置。</Alert>
          <div class="filter-tabs" role="tablist" aria-label="编程语言">
            <Button
              variant="plain"
              type="button"
              role="tab"
              :aria-selected="environmentLanguage === 'cpp'"
              :class="{ selected: environmentLanguage === 'cpp' }"
              @click="environmentLanguage = 'cpp'">
              C++
            </Button>
            <Button
              variant="plain"
              type="button"
              role="tab"
              :aria-selected="environmentLanguage === 'python'"
              :class="{ selected: environmentLanguage === 'python' }"
              @click="environmentLanguage = 'python'">
              Python
              <PythonBeta />
            </Button>
          </div>
          <p>
            {{
              environmentLanguage === 'cpp'
                ? executionSettings.languages.cpp.compilerProfile === 'gcc13-cpp20'
                  ? 'GCC · C++20'
                  : 'GCC · C++17'
                : 'CPython 3 · 标准库'
            }}
          </p>
          <div class="environment-grid">
            <div>
              <span>项目类型</span>
              <strong>
                每题一个 {{ environmentLanguage === 'cpp' ? 'C++' : 'Python' }} 源文件
              </strong>
            </div>
            <div>
              <span>运行时间</span>
              <strong>{{ languageEnvironment.runTimeMs }} ms</strong>
            </div>
            <div>
              <span>内存上限</span>
              <strong>{{ languageEnvironment.runMemoryMb }} MiB</strong>
            </div>
            <div>
              <span>输出上限</span>
              <strong>{{ languageEnvironment.outputLimitKb }} KiB</strong>
            </div>
            <div v-if="environmentLanguage === 'cpp'">
              <span>编译时间</span>
              <strong>{{ executionSettings.languages.cpp.compileTimeMs }} ms</strong>
            </div>
            <div v-if="environmentLanguage === 'cpp'">
              <span>编译内存</span>
              <strong>{{ executionSettings.languages.cpp.compileMemoryMb }} MiB</strong>
            </div>
          </div>
        </div>
        <div id="settings-section-3" class="form-stack settings-section">
          <h2>练习与课后访问</h2>
          <label class="toggle-row">
            <span>
              <strong>允许编译运行</strong>
              <small>关闭后仍可编辑，并查看已有记录。</small>
            </span>
            <Switch v-model="form.allowRun" />
          </label>
          <label class="toggle-row">
            <span>
              <strong>允许重复提交</strong>
              <small>每次主动提交保留独立版本。</small>
            </span>
            <Switch v-model="form.allowResubmit" />
          </label>
          <label class="toggle-row">
            <span>
              <strong>归档后保留只读访问</strong>
              <small>学生仍可查看和下载自己的作品。</small>
            </span>
            <Switch v-model="form.readonly" />
          </label>
          <label>
            课堂人数上限
            <NumberInput v-model.number="form.capacity" min="1" max="50" />
          </label>
          <p class="form-hint">
            当前已有 {{ activeClassroom.students }} 位学生。上限不可低于现有人数；最多 50 人。
          </p>
        </div>
        <div id="settings-section-4" class="form-stack settings-section">
          <div class="settings-title">
            <Archive :size="20" />
            <h2>归档课堂</h2>
          </div>
          <p class="body-copy">
            归档会关闭新成员加入、编辑与新运行，并停止正在执行的任务。历史作品按只读访问策略保留；需要继续教学时可恢复课堂。
          </p>
          <Alert type="warning">归档保留账号、作品和历史记录，不会永久删除数据。</Alert>
          <div class="inline-items">
            <Button
              v-if="activeClassroom.status === '已归档'"
              variant="success"
              class="self-start"
              @click="reopen = true">
              恢复课堂教学
            </Button>
            <Button
              variant="destructive"
              class="self-start"
              :disabled="busy || activeClassroom.status === '已归档'"
              :data-disabled-reason="busy ? busyReason : '课堂已归档，请先恢复课堂教学'"
              @click="archive = true">
              {{ activeClassroom.status === '已归档' ? '课堂已归档' : '归档这间课堂' }}
            </Button>
            <Button variant="destructive" class="self-start" :disabled="busy" @click="deleteClass">
              永久删除课堂
            </Button>
          </div>
        </div>
      </section>
    </div>
  </div>
  <Modal
    v-model:open="archive"
    title="结束并归档课堂？"
    description="归档后关闭加入、编辑与运行，保留作品和历史记录；未保存的课堂设置也会一并保存。">
    <p class="body-copy">
      归档后不再接受新成员、编辑与提交，正在运行的程序会停止。请先按需导出课堂作品。
    </p>
    <div class="modal-actions">
      <Button
        variant="outline"
        :disabled="busy"
        :data-disabled-reason="busyReason"
        @click="archive = false">
        继续教学
      </Button>
      <Button
        variant="destructive"
        :disabled="busy"
        :data-disabled-reason="busyReason"
        @click="archiveClass">
        {{ busy ? '正在归档…' : '确认归档' }}
      </Button>
    </div>
  </Modal>
  <Modal
    v-model:open="regenerate"
    title="重新生成课堂码？"
    description="旧课堂码与邀请链接会立即失效。已有成员不受影响，请将新邀请交付给尚未加入的学生。">
    <div class="modal-actions">
      <Button
        variant="outline"
        :disabled="busy"
        :data-disabled-reason="busyReason"
        @click="regenerate = false">
        取消
      </Button>
      <Button
        variant="warning"
        :disabled="busy"
        :data-disabled-reason="busyReason"
        @click="regenerateInvite">
        {{ busy ? '正在更新…' : '确认重新生成' }}
      </Button>
    </div>
  </Modal>
  <Modal
    :open="leave"
    title="放弃未保存的设置？"
    description="已保存的课堂设置不受影响。"
    @update:open="!$event && settleLeave(false)">
    <div class="modal-actions">
      <Button variant="outline" @click="settleLeave(false)">继续编辑</Button>
      <Button variant="destructive" @click="settleLeave(true)">放弃修改</Button>
    </div>
  </Modal>
  <Modal
    v-model:open="reopen"
    title="恢复课堂教学？"
    description="课堂将回到进行中，成员可按课堂策略继续编辑、运行与提交；未保存的课堂设置也会一并保存。">
    <div class="modal-actions">
      <Button
        variant="outline"
        :disabled="busy"
        :data-disabled-reason="busyReason"
        @click="reopen = false">
        取消
      </Button>
      <Button
        variant="success"
        :disabled="busy"
        :data-disabled-reason="busyReason"
        @click="
          async () => {
            if (await save('进行中', true)) reopen = false
          }
        ">
        {{ busy ? '正在恢复…' : '确认恢复课堂' }}
      </Button>
    </div>
  </Modal>
  <Modal
    :open="!!confirmState"
    title="更改课堂状态？"
    :description="`课堂将设为${confirmState}，学生只能查看作品，正在执行的程序会停止；未保存的课堂设置也会一并保存。`"
    @update:open="!$event && (confirmState = '')">
    <div class="modal-actions">
      <Button
        variant="outline"
        :disabled="busy"
        :data-disabled-reason="busyReason"
        @click="confirmState = ''">
        取消
      </Button>
      <Button
        variant="warning"
        :disabled="busy"
        :data-disabled-reason="busyReason"
        @click="
          async () => {
            if (await save(confirmState, true)) confirmState = ''
          }
        ">
        确认更改
      </Button>
    </div>
  </Modal>
</template>

<style scoped>
.settings-page {
  display: flex;
  flex-direction: column;
  /* topbar 66px + page-content 上下 padding 32/30 */
  height: calc(100dvh - 128px);
}
.settings-page .page-heading {
  margin-bottom: 20px;
}
.settings-layout {
  flex: 1;
  min-height: 0;
  grid-template-rows: minmax(0, 1fr);
}
.settings-panel {
  align-self: stretch;
  min-height: 300px;
  overflow-y: auto;
}
.settings-section {
  scroll-margin-top: 20px;
}
.settings-panel > * + * {
  border-top: 1px solid var(--ui-line);
  margin-top: 30px;
  padding-top: 30px;
}
.settings-panel,
.settings-panel .form-stack > label {
  min-width: 0;
}
.settings-panel .form-stack input:not([type='checkbox']),
.settings-panel textarea,
.settings-panel .ui-select-trigger {
  max-width: 100%;
}
.environment-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.environment-grid strong {
  overflow-wrap: anywhere;
}
@media (max-width: 500px) {
  .environment-grid {
    grid-template-columns: minmax(0, 1fr);
  }
  .settings-nav {
    flex-wrap: nowrap;
    position: static;
  }
}
</style>
