<script setup lang="ts">
import { reactive, ref } from 'vue'
import { Save, Copy, RefreshCw, ShieldCheck, Archive, Settings2, ChevronRight } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import Modal from '@/components/classroom/Modal.vue'
import { activeClassroom, demo, notify, updateClass, classPath, reportError } from '@/data/demo'
import { api } from '@/lib/api'
const form = reactive({
  name: activeClassroom.value.name,
  description: activeClassroom.value.description,
  state: activeClassroom.value.status,
  access: String(activeClassroom.value.settings?.access ?? 'approval'),
  compiler: 'GCC 13.2 · C++17',
  capacity: 50,
  allowJoin: activeClassroom.value.settings?.allowJoin !== false,
  allowRun: activeClassroom.value.settings?.allowRun !== false,
  allowResubmit: activeClassroom.value.settings?.allowResubmit !== false,
  readonly: true,
})
const tab = ref('基本信息')
const archive = ref(false)
async function save() {
  try {
    await updateClass({
      name: form.name.trim(),
      description: form.description,
      status: form.state,
      settings: {
        access: form.access,
        allowJoin: form.allowJoin,
        allowRun: form.allowRun,
        allowResubmit: form.allowResubmit,
        readonly: form.readonly,
        capacity: form.capacity,
      },
    })
    notify('课堂设置已保存')
  } catch (e) {
    reportError(e)
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
  try {
    const data = await api<{ inviteCode: string }>(classPath('/invite'), 'POST', {})
    demo.inviteCode = data.inviteCode
    notify('课堂码已更新，旧邀请失效')
  } catch (e) {
    reportError(e)
  }
}
async function archiveClass() {
  form.state = '已归档'
  await save()
  archive.value = false
}
</script>
<template>
  <div class="page-heading">
    <div>
      <div class="heading-meta">课堂管理</div>
      <h1>课堂设置</h1>
      <p>设置加入规则、编程环境与课后访问方式。</p>
    </div>
    <Button @click="save"><Save />保存设置</Button>
  </div>
  <div class="settings-layout">
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
      <form v-if="tab === '基本信息'" class="form-stack" @submit.prevent="save">
        <div class="settings-title">
          <Settings2 :size="19" />
          <h2>基本信息</h2>
        </div>
        <label>课堂名称<input v-model="form.name" required maxlength="50" /></label
        ><label>课堂说明<textarea v-model="form.description" rows="5" /></label
        ><label>所属学期<input value="2026 秋季学期" readonly /></label>
        <label
          >课堂状态<select v-model="form.state" :disabled="activeClassroom.status === '已归档'">
            <option>未开始</option>
            <option>进行中</option>
            <option>已关闭</option>
            <option v-if="activeClassroom.status === '已归档'">已归档</option>
          </select></label
        >
        <p class="form-hint">课堂名称与说明对已加入的学生可见。</p>
        <Button class="self-start" type="submit">保存更改</Button>
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
        <p class="form-hint">有效期：7 天。重新生成后，原课堂码失效。</p>
        <Button variant="outline" class="self-start" @click="regenerateInvite"
          ><RefreshCw />重新生成</Button
        >
      </div>
      <div v-else-if="tab === '编程环境'" class="form-stack">
        <div class="settings-title">
          <Settings2 :size="19" />
          <h2>统一编程环境</h2>
        </div>
        <div class="info-box">GCC 13.3 / C++17；运行限制由平台管理员统一配置。</div>
        <label
          >环境版本<select v-model="form.compiler">
            <option>GCC 13.2 · C++17</option>
            <option>GCC 13.2 · C++20</option>
          </select></label
        >
        <div class="environment-grid">
          <div><span>项目类型</span><strong>每题一个 C++ 源文件</strong></div>
          <div><span>运行时间</span><strong>2,000 ms</strong></div>
          <div><span>内存上限</span><strong>256 MB</strong></div>
          <div><span>输出上限</span><strong>1 MB</strong></div>
          <div><span>编译时间</span><strong>10,000 ms</strong></div>
          <div><span>编译内存</span><strong>512 MB</strong></div>
        </div>
        <p class="form-hint">仅由平台提供受控环境，不接受学生自定义命令。</p>
      </div>
      <div v-else-if="tab === '课堂策略'" class="form-stack">
        <h2>练习与课后访问</h2>
        <label class="toggle-row"
          ><span
            ><strong>允许编译运行</strong><small>关闭后保留代码和历史结果的只读访问。</small></span
          ><input v-model="form.allowRun" type="checkbox" role="switch" /></label
        ><label class="toggle-row"
          ><span
            ><strong>允许继续修改与重复提交</strong><small>每次主动提交保留独立版本。</small></span
          ><input v-model="form.allowResubmit" type="checkbox" role="switch" /></label
        ><label class="toggle-row"
          ><span
            ><strong>归档后保留只读访问</strong><small>学生仍可查看和下载自己的作品。</small></span
          ><input v-model="form.readonly" type="checkbox" role="switch" /></label
        ><label
          >课堂人数上限<input v-model.number="form.capacity" type="number" min="1" max="50"
        /></label>
        <p class="form-hint">50 人为建议容量，尚未完成生产并发验证。</p>
      </div>
      <div v-else class="form-stack">
        <div class="settings-title">
          <Archive :size="20" />
          <h2>归档课堂</h2>
        </div>
        <p class="body-copy">
          课程结束后，把这段学习旅程妥善保存。归档会关闭新成员加入和新运行，并按策略保留历史作品。
        </p>
        <div class="warning-box">归档与永久删除不同。此处不提供永久删除入口。</div>
        <Button
          variant="destructive"
          class="self-start"
          :disabled="activeClassroom.status === '已归档'"
          @click="archive = true"
          >{{ activeClassroom.status === '已归档' ? '课堂已归档' : '归档这间课堂' }}</Button
        >
      </div>
    </section>
  </div>
  <Modal
    v-model:open="archive"
    title="结束并归档课堂？"
    description="归档后关闭加入、编辑与运行，保留作品和历史记录。"
    ><p class="body-copy">归档后不再接受新成员和新的运行任务。请先按需导出课堂作品。</p>
    <div class="modal-actions">
      <Button variant="outline" @click="archive = false">继续教学</Button
      ><Button variant="destructive" @click="archiveClass">确认归档</Button>
    </div></Modal
  >
</template>
