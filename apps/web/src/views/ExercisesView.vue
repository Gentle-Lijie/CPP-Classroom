<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  Plus,
  ArrowRight,
  ArrowUp,
  BookOpen,
  Eye,
  Send,
  Star,
  Check,
  Archive,
  Monitor,
  FileCode2,
  Pencil,
} from '@lucide/vue'
import { Button } from '@/components/ui/button'
import Modal from '@/components/classroom/Modal.vue'
import MarkdownContent from '@/components/classroom/MarkdownContent.vue'
import CodeEditor from '@/components/classroom/CodeEditor.vue'
import { exercises, demo, tone, notify, type Exercise } from '@/data/demo'
const router = useRouter()
const route = useRoute()
const selected = ref(String(route.query.exercise ?? exercises[0]?.id ?? 'e01'))
const preview = ref(false)
const exercise = computed(() => exercises.find((e) => e.id === selected.value) ?? exercises[0]!)
function recommend() {
  demo.recommended = exercise.value.id
  notify('已设为当前推荐练习')
}
function publish() {
  exercise.value.status = '已发布'
  notify('练习已在本机原型中发布')
}
function close() {
  exercise.value.status = exercise.value.status === '已关闭' ? '草稿' : '已关闭'
  notify('练习状态已更新')
}
function move() {
  const index = exercises.indexOf(exercise.value)
  if (index > 0) {
    const e = exercises.splice(index, 1)[0]!
    exercises.splice(index - 1, 0, e)
  }
}
function edit(e: Exercise) {
  router.push('/teacher/exercises/' + e.id + '/edit')
}
</script>
<template>
  <div class="page-heading">
    <div>
      <div class="heading-meta">课程内容</div>
      <h1>练习管理</h1>
      <p>编排课堂练习，用 Markdown 准备题面，为每道题指定源文件名。</p>
    </div>
    <div class="heading-actions">
      <Button variant="outline" @click="router.push('/teacher/teach?exercise=' + exercise.id)"
        ><Monitor />开始授课</Button
      ><Button @click="router.push('/teacher/exercises/new')"><Plus />创建练习</Button>
    </div>
  </div>
  <div class="exercise-layout">
    <section class="panel exercise-list-panel">
      <div class="panel-heading">
        <h2>
          课堂练习 <span class="muted">{{ exercises.length }}</span>
        </h2>
        <span class="muted text-xs">按教学顺序</span>
      </div>
      <button
        v-for="(e, i) in exercises"
        :key="e.id"
        class="exercise-list-item"
        :class="{ selected: selected === e.id }"
        @click="selected = e.id"
      >
        <span class="exercise-order">{{ String(i + 1).padStart(2, '0') }}</span>
        <div>
          <strong>{{ e.title }}</strong
          ><small>{{ e.filename }}<span v-if="demo.recommended === e.id"> · 当前推荐</span></small>
        </div>
        <span class="status" :class="tone(e.status)">{{ e.status }}</span
        ><ArrowRight :size="15" />
      </button>
      <div class="exercise-list-note">
        <BookOpen :size="17" />
        <p>学生只能看到已发布练习。<br />题目编辑在独立页面完成。</p>
      </div>
    </section>
    <section class="panel exercise-preview">
      <div class="panel-heading">
        <div class="inline-items">
          <span class="status" :class="tone(exercise.status)">{{ exercise.status }}</span
          ><span v-if="demo.recommended === exercise.id" class="recommended"
            ><Star :size="13" />当前推荐</span
          >
        </div>
        <div class="inline-items">
          <button
            class="icon-button"
            aria-label="练习向上移动"
            :disabled="exercises.indexOf(exercise) === 0"
            @click="move"
          >
            <ArrowUp :size="16" /></button
          ><Button variant="outline" size="sm" @click="edit(exercise)"><Pencil />编辑题目</Button>
        </div>
      </div>
      <div class="problem-content">
        <span class="topic-label">{{ exercise.topic }} · C++17</span>
        <h2>{{ exercise.title }}</h2>
        <div class="problem-limits">
          <span>时间限制 2,000 ms</span><span>内存限制 256 MB</span
          ><span class="inline-items"><FileCode2 :size="13" />{{ exercise.filename }}</span>
        </div>
        <MarkdownContent :source="exercise.description" />
        <h3>输入说明</h3>
        <MarkdownContent :source="exercise.input" />
        <h3>输出说明</h3>
        <MarkdownContent :source="exercise.output" />
        <h3>样例</h3>
        <div class="sample-grid">
          <div>
            <span>输入</span>
            <pre>{{ exercise.sampleInput }}</pre>
          </div>
          <div>
            <span>输出</span>
            <pre>{{ exercise.sampleOutput }}</pre>
          </div>
        </div>
      </div>
      <div class="exercise-preview-actions">
        <div class="inline-items">
          <Button variant="outline" @click="preview = true"><Eye />学生预览</Button
          ><Button variant="ghost" @click="close"
            ><Archive />{{ exercise.status === '已关闭' ? '移回草稿' : '关闭练习' }}</Button
          >
        </div>
        <Button v-if="exercise.status !== '已发布'" @click="publish"><Send />发布练习</Button
        ><Button
          v-else
          :variant="demo.recommended === exercise.id ? 'outline' : 'default'"
          @click="recommend"
          ><Check v-if="demo.recommended === exercise.id" /><Star v-else />{{
            demo.recommended === exercise.id ? '当前推荐练习' : '设为当前推荐'
          }}</Button
        >
      </div>
    </section>
  </div>
  <Modal
    v-model:open="preview"
    title="学生预览"
    description="题面与初始代码预览。此原型未接入编译器。"
    wide
    ><h2>{{ exercise.title }}</h2>
    <MarkdownContent :source="exercise.description" />
    <div class="sample-grid">
      <div>
        <span>样例输入</span>
        <pre>{{ exercise.sampleInput }}</pre>
      </div>
      <div>
        <span>样例输出</span>
        <pre>{{ exercise.sampleOutput }}</pre>
      </div>
    </div>
    <div class="initial-editor">
      <div class="code-toolbar">{{ exercise.filename }}</div>
      <CodeEditor :model-value="exercise.code" readonly :filename="exercise.filename" />
    </div>
    <div class="modal-actions">
      <Button variant="outline" @click="preview = false">关闭</Button
      ><Button @click="router.push('/student/workspace?exercise=' + exercise.id)"
        >打开学生工作区<ArrowRight
      /></Button></div
  ></Modal>
</template>
