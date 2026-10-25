<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { Save, Copy, RefreshCw, ShieldCheck, Archive, Settings2, ChevronRight } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import Modal from '@/components/classroom/Modal.vue'
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
import { onBeforeRouteLeave } from 'vue-router'
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
onMounted(() => window.addEventListener('beforeunload', beforeUnload))
onBeforeUnmount(() => window.removeEventListener('beforeunload', beforeUnload))
const tab = ref('基本信息')
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
    tab.value = '基本信息'
    return false
  }
  if (!Number.isInteger(form.capacity) || form.capacity < 1 || form.capacity > 50) {
    error.value = '课堂人数上限必须为 1–50 的整数'
    tab.value = '课堂策略'
    return false
  }
  if (form.capacity < activeClassroom.value.students) {
    error.value = `当前已有 ${activeClassroom.value.students} 位学生，人数上限不能小于现有人数`
    tab.value = '课堂策略'
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
async function archiveClass() {
  if (await save('已归档', true)) archive.value = false
}
</script>
<template>
  <div class="page-heading">
    <div>
      <div class="heading-meta">课堂管理</div>
      <h1>课堂设置</h1>
      <p>设置加入规则、编程环境与课后访问方式。</p>
    </div>
    <Button :disabled="busy || !dirty" @click="save()"
      ><Save />{{ busy ? '正在保存…' : dirty ? '保存设置' : '设置已保存' }}</Button
    >
  </div>
  <p v-if="error" role="alert" class="error-box settings-error">{{ error }}</p>
  <p v-if="dirty" class="warning-box settings-error" role="status">
    有尚未保存的课堂设置，开关调整需点击“保存设置”后生效。
  </p>
  <div class="settings-layout" :inert="busy">
    <nav class="settings-nav">
      <button
        v-for="t in ['基本信息', '加入与邀请', '编程环境', '课堂策略', '归档课堂']"
        :key="t"
        :class="{ selected: tab === t }"
        @click="tab = t"
      >
        {{ t }}<ChevronRight :size="14" />
      </button>
    </nav>
    <section class="panel settings-panel">
      <form v-if="tab === '基本信息'" class="form-stack" @submit.prevent="save()">
        <div class="settings-title">
          <Settings2 :size="19" />
          <h2>基本信息</h2>
        </div>
        <label>课堂名称<input v-model="form.name" required maxlength="50" /></label
        ><label>课堂说明<textarea v-model="form.description" rows="5" /></label>
        <label
          >课堂状态<select
            v-model="form.state"
            :disabled="busy || activeClassroom.status === '已归档'"
          >
            <option>未开始</option>
            <option>进行中</option>
            <option>已关闭</option>
            <option v-if="activeClassroom.status === '已归档'">已归档</option>
          </select></label
        >
        <p class="form-hint">课堂名称与说明对已加入的学生可见。</p>
        <Button class="self-start" type="submit" :disabled="busy || !dirty">{{
          busy ? '正在保存…' : '保存更改'
        }}</Button>
      </form>
      <div v-else-if="tab === '加入与邀请'" class="form-stack">
        <div class="settings-title">
          <ShieldCheck :size="19" />
          <h2>加入与邀请</h2>
        </div>
        <label class="toggle-row"
          ><span><strong>允许新成员加入</strong><small>关闭后，已有成员仍可访问课堂。</small></span
          ><input v-model="form.allowJoin" type="checkbox" role="switch" /></label
        ><label
          >入班方式<select v-model="form.access">
            <option value="approval">教师审批后加入</option>
            <option value="roster">仅名单中的学生可加入</option>
          </select></label
        ><label
          >当前课堂码
          <div class="copy-row">
            <input :value="demo.inviteCode" readonly /><Button variant="outline" @click="copy"
              ><Copy />复制邀请</Button
            >
          </div></label
        >
        <p class="form-hint" :class="{ 'danger-text': inviteExpired }">
          {{ inviteExpired ? '课堂码已过期' : '有效至' }}：{{
            inviteExpires
          }}。重新生成后原课堂码失效。
        </p>
        <Button variant="outline" class="self-start" :disabled="busy" @click="regenerate = true"
          ><RefreshCw />重新生成</Button
        >
      </div>
      <div v-else-if="tab === '编程环境'" class="form-stack">
        <div class="settings-title">
          <Settings2 :size="19" />
          <h2>统一编程环境</h2>
        </div>
        <div class="info-box">编译标准与运行限制由平台管理员统一配置。</div>
        <p>GCC · {{ executionSettings.compilerProfile === 'gcc13-cpp20' ? 'C++20' : 'C++17' }}</p>
        <div class="environment-grid">
          <div><span>项目类型</span><strong>每题一个 C++ 源文件</strong></div>
          <div>
            <span>运行时间</span><strong>{{ executionSettings.runTimeMs }} ms</strong>
          </div>
          <div>
            <span>内存上限</span><strong>{{ executionSettings.runMemoryMb }} MiB</strong>
          </div>
          <div>
            <span>输出上限</span><strong>{{ executionSettings.outputLimitKb }} KiB</strong>
          </div>
          <div>
            <span>编译时间</span><strong>{{ executionSettings.compileTimeMs }} ms</strong>
          </div>
          <div>
            <span>编译内存</span><strong>{{ executionSettings.compileMemoryMb }} MiB</strong>
          </div>
        </div>
        <p class="form-hint">仅由平台提供受控环境，不接受学生自定义命令。</p>
      </div>
      <div v-else-if="tab === '课堂策略'" class="form-stack">
        <h2>练习与课后访问</h2>
        <label class="toggle-row"
          ><span><strong>允许编译运行</strong><small>关闭后仍可编辑，并查看已有记录。</small></span
          ><input v-model="form.allowRun" type="checkbox" role="switch" /></label
        ><label class="toggle-row"
          ><span><strong>允许重复提交</strong><small>每次主动提交保留独立版本。</small></span
          ><input v-model="form.allowResubmit" type="checkbox" role="switch" /></label
        ><label class="toggle-row"
          ><span
            ><strong>归档后保留只读访问</strong><small>学生仍可查看和下载自己的作品。</small></span
          ><input v-model="form.readonly" type="checkbox" role="switch" /></label
        ><label
          >课堂人数上限<input v-model.number="form.capacity" type="number" min="1" max="50"
        /></label>
        <p class="form-hint">
          当前已有 {{ activeClassroom.students }} 位学生。上限不可低于现有人数；最多 50 人。
        </p>
      </div>
      <div v-else class="form-stack">
        <div class="settings-title">
          <Archive :size="20" />
          <h2>归档课堂</h2>
        </div>
        <p class="body-copy">
          归档会关闭新成员加入、编辑与新运行，并停止正在执行的任务。历史作品按只读访问策略保留；需要继续教学时可恢复课堂。
        </p>
        <div class="warning-box">归档保留账号、作品和历史记录，不会永久删除数据。</div>
        <Button
          v-if="activeClassroom.status === '已归档'"
          variant="success"
          class="self-start"
          @click="reopen = true"
          >恢复课堂教学</Button
        >
        <Button
          variant="destructive"
          class="self-start"
          :disabled="busy || activeClassroom.status === '已归档'"
          @click="archive = true"
          >{{ activeClassroom.status === '已归档' ? '课堂已归档' : '归档这间课堂' }}</Button
        >
      </div>
      <div v-if="['加入与邀请', '课堂策略'].includes(tab)" class="settings-save-row">
        <span>{{ dirty ? '更改尚未保存' : '所有设置已保存' }}</span
        ><Button :disabled="busy || !dirty" @click="save()"><Save />保存本页设置</Button>
      </div>
    </section>
  </div>
  <Modal
    v-model:open="archive"
    title="结束并归档课堂？"
    description="归档后关闭加入、编辑与运行，保留作品和历史记录。"
    ><p class="body-copy">
      归档后不再接受新成员、编辑与提交，正在运行的程序会停止。请先按需导出课堂作品。
    </p>
    <div class="modal-actions">
      <Button variant="outline" :disabled="busy" @click="archive = false">继续教学</Button
      ><Button variant="destructive" :disabled="busy" @click="archiveClass">{{
        busy ? '正在归档…' : '确认归档'
      }}</Button>
    </div></Modal
  >
  <Modal
    v-model:open="regenerate"
    title="重新生成课堂码？"
    description="旧课堂码与邀请链接会立即失效。已有成员不受影响，请将新邀请交付给尚未加入的学生。"
    ><div class="modal-actions">
      <Button variant="outline" :disabled="busy" @click="regenerate = false">取消</Button
      ><Button variant="warning" :disabled="busy" @click="regenerateInvite">{{
        busy ? '正在更新…' : '确认重新生成'
      }}</Button>
    </div></Modal
  >
  <Modal
    :open="leave"
    title="放弃未保存的设置？"
    description="已保存的课堂设置不受影响。"
    @update:open="!$event && settleLeave(false)"
    ><div class="modal-actions">
      <Button variant="outline" @click="settleLeave(false)">继续编辑</Button
      ><Button variant="destructive" @click="settleLeave(true)">放弃修改</Button>
    </div></Modal
  >
  <Modal
    v-model:open="reopen"
    title="恢复课堂教学？"
    description="课堂将回到进行中，成员可按课堂策略继续编辑、运行与提交。"
    ><div class="modal-actions">
      <Button variant="outline" :disabled="busy" @click="reopen = false">取消</Button
      ><Button
        variant="success"
        :disabled="busy"
        @click="
          async () => {
            if (await save('进行中', true)) reopen = false
          }
        "
        >{{ busy ? '正在恢复…' : '确认恢复课堂' }}</Button
      >
    </div></Modal
  >
  <Modal
    :open="!!confirmState"
    title="更改课堂状态？"
    :description="`课堂将设为${confirmState}，学生只能查看作品，正在执行的程序会停止。`"
    @update:open="!$event && (confirmState = '')"
    ><div class="modal-actions">
      <Button variant="outline" :disabled="busy" @click="confirmState = ''">取消</Button
      ><Button
        variant="warning"
        :disabled="busy"
        @click="
          async () => {
            if (await save(confirmState, true)) confirmState = ''
          }
        "
        >确认更改</Button
      >
    </div></Modal
  >
</template>

<style scoped>
.settings-save-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  border-top: 1px solid var(--ui-line);
  padding-top: 20px;
  margin-top: 24px;
  font-size: 12px;
  color: var(--ui-secondary);
}
.settings-error {
  margin-bottom: 20px;
}
.settings-panel,
.settings-panel .form-stack > label {
  min-width: 0;
}
.settings-panel .form-stack input:not([type='checkbox']),
.settings-panel textarea,
.settings-panel select {
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
  }
}
</style>
