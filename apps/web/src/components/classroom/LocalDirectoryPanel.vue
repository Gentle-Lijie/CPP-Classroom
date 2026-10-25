<script setup lang="ts">
import { computed } from 'vue'
import { FolderOpen, FolderCheck, Unplug, Download, RefreshCw } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import Modal from './Modal.vue'
import { download } from '@/data/demo'
import { useLocalDirectory } from '@/composables/useLocalDirectory'
const props = defineProps<{
  classroomId: string
  exerciseId: string
  filename: string
  readonly: boolean
}>()
const code = defineModel<string>({ required: true })
const local = useLocalDirectory({
  classroomId: computed(() => props.classroomId),
  documentId: computed(() => props.exerciseId),
  filename: computed(() => props.filename),
  code,
  readonly: computed(() => props.readonly),
})
const { root, file, conflict, status, needsPermission, busy, backup } = local
defineExpose({ flush: local.flush })
</script>
<template>
  <section
    class="local-directory-panel"
    :class="{ linked: !!file && !needsPermission }"
    aria-label="本地工作目录"
  >
    <FolderCheck v-if="file && !needsPermission" :size="17" /><FolderOpen v-else :size="17" />
    <div class="local-directory-status">
      <strong>{{ root ? root.name + ' / ' + filename : '本地工作目录' }}</strong
      ><span role="status">{{
        local.supported
          ? status
          : '此浏览器不支持目录读写，可使用 Chrome / Edge；浏览器草稿与下载仍可用。'
      }}</span>
    </div>
    <span v-if="file && !needsPermission" class="local-poll-hint"
      >自动写入 · 每 2 秒检查外部修改</span
    >
    <div class="inline-items ml-auto">
      <button
        v-if="backup !== undefined"
        class="text-button"
        @click="download('backup-' + filename, backup)"
      >
        <Download :size="14" />下载读取前草稿</button
      ><Button
        v-if="local.supported && (!file || needsPermission)"
        variant="outline"
        size="sm"
        :disabled="readonly || busy"
        @click="local.connect"
        ><RefreshCw v-if="needsPermission" /><FolderOpen v-else />{{
          needsPermission ? '重新授权' : root ? '关联当前文件' : '选择工作目录'
        }}</Button
      ><button
        v-if="root"
        class="icon-button"
        :disabled="busy"
        aria-label="断开本地目录"
        @click="local.disconnect"
      >
        <Unplug :size="15" />
      </button>
    </div>
  </section>
  <Modal
    :open="!!conflict"
    :title="conflict?.reason === 'existing' ? '本地已有同名文件' : '磁盘与编辑器都有修改'"
    description="自动写入已暂停。对照两个版本后，选择要保留的内容；不会自动合并或覆盖。"
    wide
    @update:open="!$event && local.cancelConflict()"
    ><template v-if="conflict"
      ><div class="file-conflict-name">
        <FolderOpen :size="16" />{{ root?.name }} / {{ conflict.filename }}
      </div>
      <div class="file-conflict-comparison">
        <div>
          <h3>编辑器草稿</h3>
          <pre>{{ code.slice(0, 6000) || '（空文件）' }}</pre>
        </div>
        <div>
          <h3>磁盘文件</h3>
          <pre>{{ conflict.disk.slice(0, 6000) || '（空文件）' }}</pre>
        </div>
      </div>
      <p class="form-hint">预览最多显示各版本前 6,000 个字符；选择版本会处理完整文件。</p>
      <div class="modal-actions file-conflict-actions">
        <Button variant="ghost" :disabled="busy" @click="download('backup-' + filename, code)"
          ><Download />备份编辑器草稿</Button
        ><Button variant="outline" :disabled="busy || readonly" @click="local.useEditor"
          >用草稿覆盖磁盘</Button
        ><Button :disabled="busy || readonly" @click="local.useDisk">读取磁盘文件</Button>
      </div></template
    ></Modal
  >
</template>
