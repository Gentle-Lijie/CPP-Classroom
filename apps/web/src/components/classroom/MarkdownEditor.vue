<script setup lang="ts">
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ref, nextTick } from 'vue'
import { Bold, Italic, Heading2, List, CodeXml, Quote, Link, Columns2 } from '@lucide/vue'
import MarkdownContent from './MarkdownContent.vue'
const model = defineModel<string>({ required: true })
const textarea = ref<InstanceType<typeof Textarea>>()
function insert(before: string, after = '', placeholder = '文字') {
  const el = textarea.value?.element
  if (!el) return
  const start = el.selectionStart
  const end = el.selectionEnd
  const text = model.value.slice(start, end) || placeholder
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
          aria-label="加粗"
          @click="insert('**', '**')"
        >
          <Bold :size="15" /></Button
        ><Button
          variant="plain"
          type="button"
          class="icon-button"
          aria-label="斜体"
          @click="insert('*', '*')"
        >
          <Italic :size="15" /></Button
        ><Button
          variant="plain"
          type="button"
          class="icon-button"
          aria-label="插入二级标题"
          @click="insert('\n## ', '\n', '标题')"
        >
          <Heading2 :size="17" /></Button
        ><Button
          variant="plain"
          type="button"
          class="icon-button"
          aria-label="插入列表"
          @click="insert('\n- ', '\n', '列表项')"
        >
          <List :size="16" /></Button
        ><Button
          variant="plain"
          type="button"
          class="icon-button"
          aria-label="插入代码块"
          @click="insert('\n```cpp\n', '\n```\n', 'cout << result;')"
        >
          <CodeXml :size="16" /></Button
        ><Button
          variant="plain"
          type="button"
          class="icon-button"
          aria-label="插入引用"
          @click="insert('\n> ', '\n')"
        >
          <Quote :size="15" /></Button
        ><Button
          variant="plain"
          type="button"
          class="icon-button"
          aria-label="插入链接"
          @click="insert('[', '](https://example.com)', '链接文字')"
        >
          <Link :size="15" />
        </Button>
      </div>
      <span class="markdown-live-label"><Columns2 :size="14" />实时预览</span>
    </div>
    <div class="markdown-editor-body">
      <label class="markdown-source"
        ><span>题面源码</span
        ><Textarea
          ref="textarea"
          v-model="model"
          aria-label="Markdown 题面源码"
          spellcheck="false"
          placeholder="用 Markdown 描述题目，右侧会实时预览。"
        />
      </label>
      <section class="markdown-preview" aria-label="题面实时预览">
        <span class="markdown-preview-label">学生看到的题面</span
        ><MarkdownContent v-if="model.trim()" :source="model" />
        <p v-else class="markdown-placeholder">写下一个问题，开启一段思考。</p>
      </section>
    </div>
  </section>
</template>
