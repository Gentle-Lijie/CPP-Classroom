<script setup lang="ts">
import CodeBlock from '@/components/classroom/CodeBlock.vue'
import { computed, ref } from 'vue'
import { PopoverRoot, PopoverTrigger, PopoverPortal, PopoverContent } from 'reka-ui'
import { FolderOpen, FolderCheck, Unplug, Download, RefreshCw } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import Modal from './Modal.vue'
import { download } from '@/data/demo'
import { useLocalDirectory } from '@/composables/useLocalDirectory'
import { spotlight, useGuideSurfaces } from '@/lib/spotlight'
const popoverOpen = ref(false)
useGuideSurfaces({
  'local-directory': () => {
    const previous = popoverOpen.value
    popoverOpen.value = true
    return () => {
      popoverOpen.value = previous
    }
  },
})
const props = defineProps<{
  classroomId: string
  exerciseId: string
  filename: string
  readonly: boolean
  compact?: boolean
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
  <PopoverRoot v-model:open="popoverOpen">
    <PopoverTrigger v-if="compact" as-child>
      <Button
        variant="outline"
        size="sm"
        :title="status"
        aria-label="本地工作目录"
        data-guide="directory-trigger">
        <FolderCheck v-if="file && !needsPermission" />
        <FolderOpen v-else />
        工作目录
      </Button>
    </PopoverTrigger>
    <PopoverPortal :disabled="!compact">
      <component
        :is="compact ? PopoverContent : 'div'"
        v-bind="compact ? { sideOffset: 8, align: 'end' } : {}"
        :class="compact ? 'local-directory-popover' : undefined"
        @interact-outside="spotlight.active && $event.preventDefault()">
        <section
          class="local-directory-panel"
          :class="{ linked: !!file && !needsPermission }"
          aria-label="本地工作目录">
          <FolderCheck v-if="file && !needsPermission" :size="17" />
          <FolderOpen v-else :size="17" />
          <div class="local-directory-status">
            <strong>{{ root ? root.name + ' / ' + filename : '本地工作目录' }}</strong>
            <span role="status">
              {{
                local.supported
                  ? status
                  : '此浏览器不支持目录读写，可使用 Chrome / Edge；浏览器草稿与下载仍可用。'
              }}
            </span>
          </div>
          <span v-if="file && !needsPermission" class="local-poll-hint">
            自动写入 · 每 2 秒检查外部修改
          </span>
          <div class="inline-items ml-auto">
            <Button
              v-if="backup !== undefined"
              variant="plain"
              class="text-button"
              data-guide="directory-backup"
              @click="download('backup-' + filename, backup)">
              <Download :size="14" />
              下载读取前草稿
            </Button>
            <Button
              v-if="local.supported && (!file || needsPermission)"
              variant="outline"
              size="sm"
              :disabled="readonly || busy"
              :data-disabled-reason="
                readonly ? '当前练习只读，无法连接工作目录' : '正在读写本地文件，请稍候'
              "
              data-guide="directory-connect"
              @click="local.connect">
              <RefreshCw v-if="needsPermission" />
              <FolderOpen v-else />
              {{ needsPermission ? '重新授权' : root ? '关联当前文件' : '选择工作目录' }}
            </Button>
            <Button
              v-if="root"
              variant="plain"
              class="icon-button"
              :disabled="busy"
              data-disabled-reason="正在读写本地文件，请稍候"
              aria-label="断开本地目录"
              @click="local.disconnect">
              <Unplug :size="15" />
            </Button>
          </div>
        </section>
      </component>
    </PopoverPortal>
  </PopoverRoot>
  <Modal
    :open="!!conflict"
    :title="conflict?.reason === 'existing' ? '本地已有同名文件' : '磁盘与编辑器都有修改'"
    description="自动写入已暂停。对照两个版本后，选择要保留的内容；不会自动合并或覆盖。"
    wide
    @update:open="!$event && local.cancelConflict()">
    <template v-if="conflict">
      <div class="file-conflict-name">
        <FolderOpen :size="16" />
        {{ root?.name }} / {{ conflict.filename }}
      </div>
      <div class="file-conflict-comparison">
        <div>
          <h3>编辑器草稿</h3>
          <CodeBlock :source="code" language="cpp" label="代码" />
        </div>
        <div>
          <h3>磁盘文件</h3>
          <CodeBlock :source="conflict.disk" language="cpp" label="代码" />
        </div>
      </div>
      <p class="form-hint">预览最多显示各版本前 6000 个字符；选择版本会处理完整文件。</p>
      <div class="modal-actions file-conflict-actions">
        <Button
          variant="ghost"
          :disabled="busy"
          data-disabled-reason="正在读写本地文件，请稍候"
          data-guide="disk-backup"
          @click="download('backup-' + filename, code)">
          <Download />
          备份编辑器草稿
        </Button>
        <Button
          variant="outline"
          :disabled="busy || readonly"
          :data-disabled-reason="
            busy ? '正在读写本地文件，请稍候' : '当前练习只读，无法修改文件或草稿'
          "
          data-guide="disk-use-editor"
          @click="local.useEditor">
          用草稿覆盖磁盘
        </Button>
        <Button
          :disabled="busy || readonly"
          :data-disabled-reason="
            busy ? '正在读写本地文件，请稍候' : '当前练习只读，无法修改文件或草稿'
          "
          data-guide="disk-use-disk"
          @click="local.useDisk">
          读取磁盘文件
        </Button>
      </div>
    </template>
  </Modal>
</template>

<style scoped>
:global(.local-directory-popover) {
  width: 400px;
  max-width: calc(100vw - 32px);
  z-index: 60;
  border: 1px solid var(--ui-line);
  border-radius: 8px;
  box-shadow: 0 8px 24px var(--ui-shadow);
  background: var(--ui-page);
}
.local-directory-popover .local-directory-panel {
  flex-wrap: wrap;
  padding: 16px;
  border: 0;
  background: transparent;
}
.local-directory-popover .local-directory-status {
  flex: 1;
}
.local-directory-popover .local-directory-status strong {
  max-width: 320px;
}
.local-directory-popover .local-poll-hint {
  margin-left: 0;
}
.local-directory-popover .local-directory-panel > .inline-items {
  flex-wrap: wrap;
  margin-left: 0;
}
</style>
