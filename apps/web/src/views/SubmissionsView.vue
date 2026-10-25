<script setup lang="ts">
import { computed, ref } from 'vue'
import { Search, Download, FileCode2, Check, ArrowRight, PackageOpen } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { students, starterCode, download, notify, activeClassroom, exercises } from '@/data/demo'
const search = ref('')
const selected = ref<string[]>([])
const includeRuns = ref(true)
const exercise = computed(() => exercises[0]!)
const visible = computed(() =>
  students.filter((s) => s.submitted && `${s.name}${s.number}`.includes(search.value)),
)
function exportWorks() {
  const members = students.filter(
    (s) => s.submitted && (!selected.value.length || selected.value.includes(s.id)),
  )
  download(
    '课堂作品-示例导出.json',
    JSON.stringify(
      {
        note: '前端原型示例导出；非真实学生作品',
        classroom: activeClassroom.value.name,
        works: members.map((s) => ({
          student: s.name,
          number: s.number,
          exercise: exercise.value.title,
          filename: exercise.value.filename,
          version: 'submission-v1',
          submittedAt: '2026-10-25T14:28:00+08:00',
          code: starterCode,
          ...(includeRuns.value
            ? { run: { status: '运行完成', input: '5', output: '15', exitCode: 0 } }
            : {}),
        })),
      },
      null,
      2,
    ),
    'application/json',
  )
  notify(`已导出 ${members.length} 份示例作品`)
}
</script>
<template>
  <div class="page-heading">
    <div>
      <div class="heading-meta">课堂作品</div>
      <h1>提交与导出</h1>
      <p>主动提交记录与当前草稿分别保留，提交不代表正确或通过。</p>
    </div>
    <Button :disabled="!visible.length" @click="exportWorks"
      ><Download />{{ selected.length ? `导出已选 ${selected.length} 份` : '导出全部作品' }}</Button
    >
  </div>
  <div class="submission-banner">
    <span class="large-feature-icon"><FileCode2 :size="28" /></span>
    <div>
      <h2>{{ students.filter((s) => s.submitted).length }} 份主动提交</h2>
      <p>每份提交保留独立代码版本，可继续修改和再次提交。</p>
    </div>
    <label class="inline-items ml-auto"
      ><input v-model="includeRuns" type="checkbox" />导出包含运行上下文</label
    >
  </div>
  <section class="panel">
    <div class="table-controls">
      <label class="search-field"
        ><Search :size="16" /><input
          v-model="search"
          aria-label="搜索提交"
          placeholder="搜索姓名或学号…" /></label
      ><span class="muted text-xs">JSON 示例导出 · 可单独下载源文件</span>
    </div>
    <div class="table-scroll">
      <table>
        <thead>
          <tr>
            <th>
              <input
                type="checkbox"
                aria-label="选择全部提交"
                :checked="!!visible.length && selected.length === visible.length"
                @change="
                  () => {
                    selected = selected.length === visible.length ? [] : visible.map((s) => s.id)
                  }
                "
              />
            </th>
            <th>学生</th>
            <th>练习</th>
            <th>提交版本</th>
            <th>提交时间</th>
            <th>作品</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="s in visible" :key="s.id">
            <td>
              <input
                v-model="selected"
                type="checkbox"
                :value="s.id"
                :aria-label="'选择' + s.name"
              />
            </td>
            <td>
              <div class="person-cell">
                <span class="student-avatar">{{ s.name.slice(-2) }}</span
                ><span class="person-text"
                  ><strong>{{ s.name }}</strong
                  ><small>{{ s.number }}</small></span
                >
              </div>
            </td>
            <td>{{ exercise.title }}</td>
            <td>
              <span class="status positive"><Check :size="12" />提交 v1</span>
            </td>
            <td class="muted">今天 14:28</td>
            <td>
              <div class="inline-items">
                <button
                  class="text-button"
                  @click="download(`${s.number}-${s.name}-${exercise.filename}`, starterCode)"
                >
                  <Download :size="14" />源文件</button
                ><RouterLink
                  :to="'/teacher/students/' + s.id"
                  class="icon-button"
                  aria-label="查看学生详情"
                  ><ArrowRight :size="15"
                /></RouterLink>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-if="!visible.length" class="empty-state">
        <PackageOpen :size="30" />
        <h3>还没有匹配的提交</h3>
        <p>教师仍然可以在课堂巡视中查看未提交的草稿。</p>
      </div>
    </div>
    <div class="table-footer">
      {{ visible.length }} 份提交 <span>{{ selected.length }} 份已选择</span>
    </div>
  </section>
</template>
