<script setup lang="ts">
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ref, nextTick } from 'vue'
import { Bold, Italic, Heading2, List, CodeXml, Quote, Link, Columns2 } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import MarkdownContent from './MarkdownContent.vue'
const { t } = useI18n()
const model = defineModel<string>({ required: true })
const textarea = ref<InstanceType<typeof Textarea>>()
function insert(before: string, after = '', placeholder?: string) {
  const el = textarea.value?.element
  if (!el) return
  const start = el.selectionStart
  const end = el.selectionEnd
  const text = model.value.slice(start, end) || (placeholder ?? t('shell.markdown.placeholder'))
  model.value = model.value.slice(0, start) + before + text + after + model.value.slice(end)
  nextTick(() => {
    el.focus()
    el.setSelectionRange(start + before.length, start + before.length + text.length)
  })
}
</script>
<template>
  <section class="markdown-editor">
    <div class="markdown-editor-toolbar">
      <span>Markdown</span>
      <div class="inline-items">
        <Button
          variant="plain"
          type="button"
          class="icon-button"
          :aria-label="t('shell.markdown.bold')"
          @click="insert('**', '**')">
          <Bold :size="15" />
        </Button>
        <Button
          variant="plain"
          type="button"
          class="icon-button"
          :aria-label="t('shell.markdown.italic')"
          @click="insert('*', '*')">
          <Italic :size="15" />
        </Button>
        <Button
          variant="plain"
          type="button"
          class="icon-button"
          :aria-label="t('shell.markdown.heading')"
          @click="insert('\n## ', '\n', t('shell.markdown.headingText'))">
          <Heading2 :size="17" />
        </Button>
        <Button
          variant="plain"
          type="button"
          class="icon-button"
          :aria-label="t('shell.markdown.list')"
          @click="insert('\n- ', '\n', t('shell.markdown.listItem'))">
          <List :size="16" />
        </Button>
        <Button
          variant="plain"
          type="button"
          class="icon-button"
          :aria-label="t('shell.markdown.code')"
          @click="insert('\n```cpp\n', '\n```\n', 'cout << result;')">
          <CodeXml :size="16" />
        </Button>
        <Button
          variant="plain"
          type="button"
          class="icon-button"
          :aria-label="t('shell.markdown.quote')"
          @click="insert('\n> ', '\n')">
          <Quote :size="15" />
        </Button>
        <Button
          variant="plain"
          type="button"
          class="icon-button"
          :aria-label="t('shell.markdown.link')"
          @click="insert('[', '](https://example.com)', t('shell.markdown.linkText'))">
          <Link :size="15" />
        </Button>
      </div>
      <span class="markdown-live-label">
        <Columns2 :size="14" />
        {{ t('shell.markdown.livePreview') }}
      </span>
    </div>
    <div class="markdown-editor-body">
      <label class="markdown-source">
        <span>{{ t('shell.markdown.source') }}</span>
        <Textarea
          ref="textarea"
          v-model="model"
          :aria-label="t('shell.markdown.sourceAria')"
          spellcheck="false"
          :placeholder="t('shell.markdown.sourcePlaceholder')" />
      </label>
      <section class="markdown-preview" :aria-label="t('shell.markdown.previewAria')">
        <span class="markdown-preview-label">{{ t('shell.markdown.previewLabel') }}</span>
        <MarkdownContent v-if="model.trim()" :source="model" />
        <p v-else class="markdown-placeholder">{{ t('shell.markdown.previewEmpty') }}</p>
      </section>
    </div>
  </section>
</template>
