<script setup lang="ts">
import CodeBlock from '@/components/classroom/CodeBlock.vue'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { PopoverRoot, PopoverTrigger, PopoverPortal, PopoverContent } from 'reka-ui'
import { FolderOpen, FolderCheck, Unplug, Download, RefreshCw } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import Modal from './Modal.vue'
import { download } from '@/data/demo'
import { useLocalDirectory } from '@/composables/useLocalDirectory'
import { spotlight, useGuideSurfaces } from '@/lib/spotlight'

const { t } = useI18n()

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
        :aria-label="t('runner.localDir.panelAria')"
        data-guide="directory-trigger">
        <FolderCheck v-if="file && !needsPermission" />
        <FolderOpen v-else />
        {{ t('runner.localDir.button') }}
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
          :aria-label="t('runner.localDir.panelAria')">
          <FolderCheck v-if="file && !needsPermission" :size="17" />
          <FolderOpen v-else :size="17" />
          <div class="local-directory-status">
            <strong>
              {{ root ? root.name + ' / ' + filename : t('runner.localDir.fallbackTitle') }}
            </strong>
            <span role="status">
              {{ local.supported ? status : t('runner.localDir.unsupported') }}
            </span>
          </div>
          <span v-if="file && !needsPermission" class="local-poll-hint">
            {{ t('runner.localDir.pollHint') }}
          </span>
          <div class="inline-items ml-auto">
            <Button
              v-if="backup !== undefined"
              variant="plain"
              class="text-button"
              data-guide="directory-backup"
              @click="download('backup-' + filename, backup)">
              <Download :size="14" />
              {{ t('runner.localDir.downloadBackup') }}
            </Button>
            <Button
              v-if="local.supported && (!file || needsPermission)"
              variant="outline"
              size="sm"
              :disabled="readonly || busy"
              :data-disabled-reason="
                readonly ? t('runner.localDir.readonlyReason') : t('runner.localDir.busyReason')
              "
              data-guide="directory-connect"
              @click="local.connect">
              <RefreshCw v-if="needsPermission" />
              <FolderOpen v-else />
              {{
                needsPermission
                  ? t('runner.localDir.reauthorize')
                  : root
                    ? t('runner.localDir.linkFile')
                    : t('runner.localDir.chooseDir')
              }}
            </Button>
            <Button
              v-if="root"
              variant="plain"
              class="icon-button"
              :disabled="busy"
              :data-disabled-reason="t('runner.localDir.busyReason')"
              :aria-label="t('runner.localDir.disconnectAria')"
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
    :title="
      conflict?.reason === 'existing'
        ? t('runner.localDir.conflictExisting')
        : t('runner.localDir.conflictModified')
    "
    :description="t('runner.localDir.conflictDescription')"
    wide
    @update:open="!$event && local.cancelConflict()">
    <template v-if="conflict">
      <div class="file-conflict-name">
        <FolderOpen :size="16" />
        {{ root?.name }} / {{ conflict.filename }}
      </div>
      <div class="file-conflict-comparison">
        <div>
          <h3>{{ t('runner.localDir.editorDraft') }}</h3>
          <CodeBlock :source="code" language="cpp" :label="t('runner.localDir.codeLabel')" />
        </div>
        <div>
          <h3>{{ t('runner.localDir.diskFile') }}</h3>
          <CodeBlock
            :source="conflict.disk"
            language="cpp"
            :label="t('runner.localDir.codeLabel')" />
        </div>
      </div>
      <p class="form-hint">{{ t('runner.localDir.previewHint') }}</p>
      <div class="modal-actions file-conflict-actions">
        <Button
          variant="ghost"
          :disabled="busy"
          :data-disabled-reason="t('runner.localDir.busyReason')"
          data-guide="disk-backup"
          @click="download('backup-' + filename, code)">
          <Download />
          {{ t('runner.localDir.backupDraft') }}
        </Button>
        <Button
          variant="outline"
          :disabled="busy || readonly"
          :data-disabled-reason="
            busy ? t('runner.localDir.busyReason') : t('runner.localDir.readonlyEditReason')
          "
          data-guide="disk-use-editor"
          @click="local.useEditor">
          {{ t('runner.localDir.useEditor') }}
        </Button>
        <Button
          :disabled="busy || readonly"
          :data-disabled-reason="
            busy ? t('runner.localDir.busyReason') : t('runner.localDir.readonlyEditReason')
          "
          data-guide="disk-use-disk"
          @click="local.useDisk">
          {{ t('runner.localDir.useDisk') }}
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
