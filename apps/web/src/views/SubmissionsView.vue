<script setup lang="ts">
import { Select, SelectOption } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { computed, ref, watch, onBeforeUnmount } from 'vue'
import { Search, Download, FileCode2, ArrowRight, PackageOpen, RefreshCw, X } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import Pagination from '@/components/classroom/Pagination.vue'
import { download, notify, classPath, activeClassroom, exercises, students } from '@/data/demo'
import { api } from '@/lib/api'
import { csvDocument } from '@/lib/csv'
import { downloadBlob, safeArchivePart, sourceArchive } from '@/lib/source-archive'
interface Submission {
  id: string
  exercise_id: string
  user_id: string
  name: string
  number: string
  title: string
  filename: string
  code: string
  revision: number
  created_at: string
}
interface ExportWork {
  id: string
  exercise_id: string
  user_id: string
  code: string
  revision: number
  filename?: string
  created_at?: string
  updated_at?: string
}
interface ExportData {
  classroomId: string
  exportedAt: string
  roster: { id: string; name: string; number: string }[]
  exercises: { id: string; filename: string; content: { title: string } }[]
  drafts: ExportWork[]
  submissions: ExportWork[]
  runs?: ExportWork[]
}
const search = ref(''),
  exercise = ref(''),
  student = ref(''),
  latest = ref(true)
const selected = ref<string[]>([]),
  includeRuns = ref(false)
const submissions = ref<Submission[]>([]),
  page = ref(1),
  pageSize = ref(20),
  total = ref(0)
const loading = ref(false),
  exporting = ref(false),
  error = ref(''),
  exportError = ref(''),
  updatedAt = ref('')
const format = ref<'zip' | 'csv' | 'json'>('zip'),
  kind = ref<'all' | 'drafts' | 'submissions'>('all')
const pageSelected = computed(
  () =>
    submissions.value.length > 0 && submissions.value.every((s) => selected.value.includes(s.id)),
)
const somePageSelected = computed(() =>
  submissions.value.some((s) => selected.value.includes(s.id)),
)
let generation = 0,
  timer: ReturnType<typeof setTimeout> | undefined
onBeforeUnmount(() => {
  generation++
  clearTimeout(timer)
})
async function load() {
  const request = ++generation
  loading.value = true
  error.value = ''
  try {
    const params = new URLSearchParams({
      page: String(page.value),
      pageSize: String(pageSize.value),
      latest: String(latest.value),
      search: search.value.trim(),
    })
    if (exercise.value) params.set('exercise', exercise.value)
    if (student.value) params.set('student', student.value)
    const result = await api<{ items: Submission[]; total: number }>(
      classPath('/submissions?' + params),
    )
    if (request !== generation) return
    submissions.value = result.items
    total.value = result.total
    if (page.value > Math.max(1, Math.ceil(result.total / pageSize.value))) {
      page.value = Math.max(1, Math.ceil(result.total / pageSize.value))
      return
    }
    updatedAt.value = new Date().toLocaleTimeString('zh-CN')
  } catch (e) {
    if (request === generation) error.value = e instanceof Error ? e.message : '提交加载失败'
  } finally {
    if (request === generation) loading.value = false
  }
}
watch([exercise, student, latest], () => {
  selected.value = []
  if (page.value !== 1) page.value = 1
  else void load()
})
watch(search, () => {
  selected.value = []
  clearTimeout(timer)
  timer = setTimeout(() => {
    if (page.value !== 1) page.value = 1
    else void load()
  }, 300)
})
watch([page, pageSize], () => void load(), { immediate: true })
function togglePage() {
  const ids = submissions.value.map((s) => s.id)
  selected.value = pageSelected.value
    ? selected.value.filter((id) => !ids.includes(id))
    : [...new Set([...selected.value, ...ids])]
}
async function exportWorks() {
  if (exporting.value) return
  exporting.value = true
  exportError.value = ''
  try {
    const params = new URLSearchParams({
      includeRuns: String(includeRuns.value && format.value === 'json'),
      kind: kind.value,
    })
    if (exercise.value) params.set('exercise', exercise.value)
    if (student.value) params.set('student', student.value)
    const data = await api<ExportData>(classPath('/export?' + params))
    if (selected.value.length && kind.value !== 'drafts') {
      data.submissions = data.submissions.filter((s) => selected.value.includes(s.id))
      const pairs = new Set(data.submissions.map((s) => `${s.user_id}:${s.exercise_id}`))
      data.drafts = data.drafts.filter((s) => pairs.has(`${s.user_id}:${s.exercise_id}`))
      if (data.runs) data.runs = data.runs.filter((s) => pairs.has(`${s.user_id}:${s.exercise_id}`))
    } else if (latest.value) {
      const newest = new Map<string, ExportWork>()
      for (const s of data.submissions) {
        const key = `${s.user_id}:${s.exercise_id}`,
          previous = newest.get(key)
        if (!previous || `${s.created_at}:${s.id}` > `${previous.created_at}:${previous.id}`)
          newest.set(key, s)
      }
      data.submissions = [...newest.values()]
    }
    const records = [
      ...data.drafts.map((s) => ({ ...s, kind: '草稿' })),
      ...data.submissions.map((s) => ({ ...s, kind: '提交' })),
    ]
    if (!records.length) {
      exportError.value = '当前导出范围没有作品。可切换为“当前草稿”或选择其他学生、练习。'
      return
    }
    const rows: (string | number)[][] = [
      ['类型', '姓名', '学号', '练习', '文件名', '版本', '时间', '记录ID'],
    ]
    const files = records.map((s) => {
      const person = data.roster.find((p) => p.id === s.user_id),
        problem = data.exercises.find((e) => e.id === s.exercise_id)
      const filename = s.filename ?? problem?.filename ?? 'main.cpp'
      rows.push([
        s.kind,
        person?.name ?? s.user_id,
        person?.number ?? '',
        problem?.content.title ?? s.exercise_id,
        filename,
        s.revision,
        s.created_at ?? s.updated_at ?? '',
        s.id,
      ])
      return {
        name: `${safeArchivePart(`${person?.number ?? ''}-${person?.name ?? s.user_id}`)}/${safeArchivePart(problem?.content.title ?? s.exercise_id)}/${s.kind}-v${s.revision}-${s.id.slice(0, 8)}-${safeArchivePart(filename)}`,
        content: s.code,
      }
    })
    const name = `${safeArchivePart(activeClassroom.value.name)}-${kind.value === 'drafts' ? '当前草稿' : kind.value === 'submissions' ? '主动提交' : '课堂作品'}`
    if (format.value === 'json')
      download(name + '.json', JSON.stringify(data, null, 2), 'application/json')
    else if (format.value === 'csv')
      download(name + '-清单.csv', csvDocument(rows), 'text/csv;charset=utf-8')
    else
      downloadBlob(
        name + '.zip',
        sourceArchive([...files, { name: '作品清单.csv', content: csvDocument(rows) }]),
      )
    notify(`已导出 ${records.length} 份${format.value === 'csv' ? '作品清单' : '作品'}`)
  } catch (e) {
    exportError.value = e instanceof Error ? e.message : '导出失败，请重试'
  } finally {
    exporting.value = false
  }
}
</script>

<template>
  <div class="page-heading">
    <div>
      <div class="heading-meta">课堂作品</div>
      <h1>提交与导出</h1>
      <p>按练习查看主动提交；当前草稿可独立导出，提交不代表正确或通过。</p>
    </div>
    <Button variant="outline" :disabled="loading" @click="load"
      ><RefreshCw :class="{ 'animate-spin': loading }" />{{
        loading ? '正在刷新…' : '刷新提交'
      }}</Button
    >
  </div>
  <section class="panel export-panel">
    <div class="export-heading">
      <FileCode2 :size="22" />
      <div>
        <h2>导出课堂作品</h2>
        <p>适用于当前学生、练习筛选；搜索关键词仅筛选下方提交列表。ZIP 内含源文件与 CSV 清单。</p>
      </div>
    </div>
    <div class="export-controls">
      <label
        >作品范围<Select v-model="kind" :disabled="exporting">
          <SelectOption value="all">当前草稿 + 主动提交</SelectOption>
          <SelectOption value="drafts">仅当前草稿</SelectOption>
          <SelectOption value="submissions">仅主动提交</SelectOption>
        </Select></label
      ><label
        >文件格式<Select v-model="format" :disabled="exporting">
          <SelectOption value="zip">ZIP 源文件包</SelectOption>
          <SelectOption value="csv">CSV 作品清单</SelectOption>
          <SelectOption value="json">JSON 完整备份</SelectOption>
        </Select></label
      ><label v-if="format === 'json'" class="inline-items"
        ><Checkbox v-model="includeRuns" :disabled="exporting" />包含运行上下文</label
      ><Button :disabled="exporting" @click="exportWorks"
        ><Download />{{
          exporting
            ? '正在准备导出…'
            : selected.length && kind !== 'drafts'
              ? `导出已选 ${selected.length} 份及关联草稿`
              : '导出作品'
        }}</Button
      >
    </div>
    <p class="form-hint">
      {{
        kind === 'drafts'
          ? '每位学生每题的最新草稿，不受下方提交选择影响。'
          : latest
            ? '未选择记录时，每位学生每题只导出最新主动提交；草稿始终为最新版本。'
            : '未选择记录时，导出当前范围内全部历史提交。'
      }}
      JSON 可包含运行上下文；超过一万条记录或 64 MiB 时请按学生、练习分批。
    </p>
    <p v-if="exportError" class="error-box" role="alert">{{ exportError }}</p>
  </section>
  <section class="panel">
    <div class="panel-heading">
      <h2>
        主动提交 <span class="muted">{{ total }}</span>
      </h2>
      <span class="muted text-xs">{{ updatedAt ? `更新于 ${updatedAt}` : '尚未加载' }}</span>
    </div>
    <div class="table-controls">
      <label class="search-field"
        ><Search :size="16" /><Input
          v-model="search"
          aria-label="搜索提交"
          placeholder="搜索姓名、学号或题目…"
      /></label>
      <div class="submission-filters">
        <Select v-model="exercise" aria-label="按练习筛选">
          <SelectOption value="">全部练习</SelectOption>
          <SelectOption v-for="e in exercises" :key="e.id" :value="e.id">{{
            e.title
          }}</SelectOption></Select
        ><Select v-model="student" aria-label="按学生筛选">
          <SelectOption value="">全部学生</SelectOption>
          <SelectOption v-for="s in students" :key="s.id" :value="s.id">
            {{ s.number }} · {{ s.name }}
          </SelectOption></Select
        ><label class="inline-items"><Checkbox v-model="latest" />每人每题最新提交</label>
      </div>
    </div>
    <div v-if="selected.length" class="selection-bar">
      <span>已选择 {{ selected.length }} 份提交（跨页保留）</span
      ><Button variant="plain" class="text-button" @click="selected = []"
        ><X :size="14" />清除选择</Button
      >
    </div>
    <div v-if="error" role="alert" class="error-box submission-error">
      {{ error }} <Button variant="outline" size="sm" @click="load">重新加载</Button>
    </div>
    <div class="table-scroll" :aria-busy="loading">
      <table>
        <thead>
          <tr>
            <th>
              <Checkbox
                aria-label="选择本页提交"
                :checked="pageSelected"
                :indeterminate="somePageSelected && !pageSelected"
                :disabled="loading || !submissions.length"
                @change="togglePage"
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
          <tr v-for="s in submissions" :key="s.id">
            <td>
              <Checkbox
                v-model="selected"
                :value="s.id"
                :aria-label="`选择${s.name}的${s.title}提交v${s.revision}`"
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
            <td>
              <span class="table-exercise">{{ s.title }}</span
              ><small class="cell-secondary">{{ s.filename }}</small>
            </td>
            <td>
              <span class="status positive">已提交 v{{ s.revision }}</span>
            </td>
            <td class="muted">{{ new Date(s.created_at).toLocaleString('zh-CN') }}</td>
            <td>
              <div class="inline-items">
                <Button
                  variant="plain"
                  class="text-button"
                  @click="download(`${s.number}-${s.name}-${s.filename}`, s.code)"
                >
                  <Download :size="14" />源文件</Button
                ><RouterLink
                  :to="{
                    path: '/teacher/students/' + s.user_id,
                    query: { exercise: s.exercise_id, submission: s.id },
                  }"
                  class="icon-button"
                  aria-label="查看这次提交"
                  ><ArrowRight :size="15"
                /></RouterLink>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-if="!submissions.length && !error" class="empty-state">
        <PackageOpen :size="30" />
        <h3>{{ loading ? '正在加载提交…' : '没有符合条件的主动提交' }}</h3>
        <p>学生尚未提交时，仍可在上方导出当前草稿。</p>
      </div>
    </div>
    <Pagination
      v-model:page="page"
      v-model:page-size="pageSize"
      :total="total"
      :busy="loading"
      unit="份提交"
    />
  </section>
</template>
<style scoped>
.export-panel {
  padding: 22px;
  margin-bottom: 24px;
}
.export-heading {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  color: var(--ui-action);
}
.export-heading > svg {
  flex-shrink: 0;
  margin-top: 3px;
}
.export-heading h2 {
  font-size: 16px;
  font-weight: 600;
  color: var(--ui-ink);
}
.export-heading p {
  font-size: 15px;
  color: var(--ui-secondary);
  margin-top: 5px;
  line-height: 1.7;
}
.export-controls {
  display: flex;
  align-items: flex-end;
  flex-wrap: wrap;
  gap: 14px;
  margin: 20px 0 12px;
}
.export-controls > label:not(.inline-items) {
  display: grid;
  gap: 7px;
  font-size: 14px;
  color: var(--ui-secondary);
  min-width: 0;
}
.export-controls .ui-select-trigger {
  min-width: 180px;
  max-width: 100%;
  font-size: 15px;
}
.export-controls .inline-items {
  font-size: 15px;
  align-self: center;
}
.export-panel .error-box {
  margin-top: 14px;
}
.submission-filters {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  min-width: 0;
}
.submission-filters .ui-select-trigger {
  max-width: 200px;
  min-width: 0;
  font-size: 15px;
}
.submission-filters label {
  font-size: 14px;
}
.selection-bar {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  padding: 10px 20px;
  color: var(--ui-action);
  background: var(--ui-selection);
  font-size: 15px;
}
.submission-error {
  margin: 0 20px 16px;
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
@media (max-width: 600px) {
  .export-panel {
    padding: 18px 16px;
  }
  .export-controls {
    align-items: stretch;
  }
  .export-controls > label:not(.inline-items),
  .export-controls > button {
    width: 100%;
  }
  .export-controls .ui-select-trigger {
    width: 100%;
  }
  .submission-filters {
    width: 100%;
  }
  .submission-filters .ui-select-trigger {
    flex: 1;
    max-width: 100%;
  }
  .submission-filters label {
    width: 100%;
  }
}
</style>
