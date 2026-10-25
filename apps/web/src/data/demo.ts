import { computed, reactive, watch } from 'vue'
import { validSourceFilename } from '@/lib/source-file'

export const starterCode = `#include <iostream>\nusing namespace std;\n\nint main() {\n    int n;\n    cin >> n;\n\n    int sum = 0;\n    for (int i = 1; i <= n; i++) {\n        sum += i;\n    }\n\n    cout << sum << endl;\n    return 0;\n}`
export const errorCode = starterCode.replace('sum += i;', 'sum += i')
export interface Student {
  id: string
  name: string
  number: string
  online: boolean
  status: string
  help: boolean
  submitted: boolean
  activity: string
  summary: string
  exerciseId?: string
}
export interface Exercise {
  id: string
  title: string
  topic: string
  status: string
  description: string
  input: string
  output: string
  sampleInput: string
  sampleOutput: string
  code: string
  filename: string
}
export interface Classroom {
  id: string
  name: string
  description: string
  status: string
  color: string
  students: number
}
export interface RunRecord {
  id: string
  status: string
  time: string
  code: string
  filename: string
  input: string
  output: string
  log: string
  stderr?: string
  exit: string
}
export const students = reactive<Student[]>([
  {
    id: 's01',
    name: '陈子涵',
    number: '2026001',
    online: true,
    status: '编译失败',
    help: true,
    submitted: false,
    activity: '刚刚',
    summary: '第 10 行：expected ‘;’ before ‘}’ token',
  },
  {
    id: 's02',
    name: '林沐阳',
    number: '2026002',
    online: true,
    status: '运行完成',
    help: false,
    submitted: true,
    activity: '1 分钟前',
    summary: '退出码 0 · 标准输出 15',
  },
  {
    id: 's03',
    name: '王梓墨',
    number: '2026003',
    online: true,
    status: '编写中',
    help: false,
    submitted: false,
    activity: '刚刚',
    summary: '当前草稿 v12 · 尚未运行',
  },
  {
    id: 's04',
    name: '李思源',
    number: '2026004',
    online: true,
    status: '编译失败',
    help: true,
    submitted: false,
    activity: '2 分钟前',
    summary: '第 8 行：‘i’ was not declared in this scope',
  },
  {
    id: 's05',
    name: '周予安',
    number: '2026005',
    online: true,
    status: '运行中／可输入',
    help: false,
    submitted: false,
    activity: '刚刚',
    summary: '程序运行中，可发送文本输入',
  },
  {
    id: 's06',
    name: '苏雨桐',
    number: '2026006',
    online: true,
    status: '运行完成',
    help: false,
    submitted: true,
    activity: '3 分钟前',
    summary: '退出码 0 · 标准输出 15',
  },
  {
    id: 's07',
    name: '徐嘉言',
    number: '2026007',
    online: true,
    status: '超时',
    help: true,
    submitted: false,
    activity: '1 分钟前',
    summary: '超过示例时间限制 2,000 ms',
  },
  {
    id: 's08',
    name: '张知远',
    number: '2026008',
    online: true,
    status: '运行完成',
    help: false,
    submitted: true,
    activity: '4 分钟前',
    summary: '退出码 0 · 标准输出 15',
  },
  {
    id: 's09',
    name: '许星禾',
    number: '2026009',
    online: false,
    status: '编写中',
    help: false,
    submitted: false,
    activity: '12 分钟前',
    summary: '最近保存草稿 v8 · 当前离线',
  },
  {
    id: 's10',
    name: '赵一诺',
    number: '2026010',
    online: true,
    status: '编译失败',
    help: false,
    submitted: false,
    activity: '2 分钟前',
    summary: '第 5 行：expected initializer before ‘cin’',
  },
  {
    id: 's11',
    name: '吴亦辰',
    number: '2026011',
    online: true,
    status: '运行完成',
    help: false,
    submitted: true,
    activity: '5 分钟前',
    summary: '退出码 0 · 标准输出 15',
  },
  {
    id: 's12',
    name: '沈书宁',
    number: '2026012',
    online: false,
    status: '运行完成',
    help: false,
    submitted: true,
    activity: '18 分钟前',
    summary: '退出码 0 · 标准输出 15',
  },
])
export const exercises = reactive<Exercise[]>([
  {
    id: 'e01',
    filename: 'sum.cpp',
    title: '累加求和',
    topic: 'for 循环',
    status: '已发布',
    description:
      '给定一个正整数 n，计算从 1 到 n 的所有整数之和。\n\n尝试使用 for 循环完成这道练习，注意循环的起始值和结束条件。',
    input: '输入一行，包含一个正整数 n（1 ≤ n ≤ 1,000）。',
    output: '输出一行，表示 1 + 2 + … + n 的结果。',
    sampleInput: '5',
    sampleOutput: '15',
    code: starterCode,
  },
  {
    id: 'e02',
    filename: 'maximum.cpp',
    title: '寻找最大值',
    topic: '循环与条件',
    status: '已发布',
    description: '读入 n 个整数，输出其中的最大值。',
    input: '第一行为 n，第二行为 n 个整数。',
    output: '输出最大值。',
    sampleInput: '5\n3 8 2 9 1',
    sampleOutput: '9',
    code: '#include <iostream>\nusing namespace std;\n\nint main() {\n    // 在这里开始编写\n    return 0;\n}',
  },
  {
    id: 'e03',
    filename: 'pyramid.cpp',
    title: '数字金字塔',
    topic: '嵌套循环',
    status: '草稿',
    description: '使用嵌套循环打印一个数字金字塔。',
    input: '输入金字塔层数 n。',
    output: '输出 n 层数字金字塔。',
    sampleInput: '3',
    sampleOutput: '1\n12\n123',
    code: starterCode,
  },
  {
    id: 'e04',
    filename: 'guess.cpp',
    title: '猜数字',
    topic: 'while 循环',
    status: '已关闭',
    description: '不断读入猜测的数字，直到与目标数字相同。',
    input: '输入若干整数。',
    output: '输出每次猜测结果。',
    sampleInput: '3\n7',
    sampleOutput: '再试一次\n猜对了',
    code: starterCode,
  },
])
export const classrooms = reactive<Classroom[]>([
  {
    id: 'cpp-basic',
    name: 'C++ 基础 · 秋季一班',
    description: '从第一行代码开始，学习用程序解决问题。',
    status: '进行中',
    color: 'green',
    students: 12,
  },
  {
    id: 'cpp-algorithm',
    name: '算法入门 · 周末班',
    description: '从枚举到排序，建立算法思维。',
    status: '未开始',
    color: 'blue',
    students: 0,
  },
  {
    id: 'cpp-summer',
    name: 'C++ 基础 · 夏季班',
    description: '2026 夏季课程，作品已保留。',
    status: '已归档',
    color: 'amber',
    students: 24,
  },
])
export const exampleRuns: RunRecord[] = [
  {
    id: 'RUN-1024',
    filename: 'sum.cpp',
    status: '编译失败',
    time: '14:32:18',
    code: errorCode,
    input: '5',
    output: '',
    log: 'sum.cpp: In function ‘int main()’:\nsum.cpp:10:17: error: expected ‘;’ before ‘}’ token\n   10 |         sum += i\n      |                 ^\n      |                 ;',
    exit: '未执行',
  },
  {
    id: 'RUN-1023',
    filename: 'sum.cpp',
    status: '运行完成',
    time: '14:28:06',
    code: starterCode,
    input: '5',
    output: '15\n',
    log: '编译成功，无警告。',
    exit: '0',
  },
  {
    id: 'RUN-1022',
    filename: 'sum.cpp',
    status: '超时',
    time: '14:24:51',
    code: starterCode.replace('i++', 'i--'),
    input: '5',
    output: '',
    log: '编译成功，无警告。',
    exit: '超过 2,000 ms 示例限制',
  },
  {
    id: 'RUN-1021',
    filename: 'sum.cpp',
    status: '运行失败',
    time: '14:21:03',
    code: starterCode.replace('cout << sum << endl;', 'cout << sum / (n - n) << endl;'),
    input: '5',
    output: '',
    stderr: 'Floating point exception (SIGFPE) · 固定示例',
    log: '编译成功。',
    exit: '信号 SIGFPE（示例）',
  },
]
export const demo = reactive({
  classroomId: 'cpp-basic',
  recommended: 'e01',
  notice: '',
  role: 'teacher',
  inviteCode: 'CPP2026',
  helpSent: false,
})
export const activeClassroom = computed(
  () => classrooms.find((c) => c.id === demo.classroomId) ?? classrooms[0]!,
)
// Same-origin prototype windows share local state. This is not a classroom server.
const stateKey = 'cpp-ui-classroom-state-v2'
const draftPrefix = 'cpp-ui-workspace-v2:'
const drafts = reactive<Record<string, string>>({})
let applyingRemote = false
function applyState(raw: string | null) {
  if (!raw) return
  try {
    const value = JSON.parse(raw)
    if (
      value.version !== 2 ||
      !Array.isArray(value.exercises) ||
      !Array.isArray(value.students) ||
      !Array.isArray(value.classrooms)
    )
      return
    const validExercises = value.exercises.every(
      (e: Exercise) =>
        [
          'id',
          'title',
          'topic',
          'status',
          'description',
          'input',
          'output',
          'sampleInput',
          'sampleOutput',
          'code',
          'filename',
        ].every((k) => typeof e[k as keyof Exercise] === 'string') &&
        validSourceFilename(e.filename),
    )
    const validStudents = value.students.every(
      (s: Student) =>
        typeof s.id === 'string' &&
        typeof s.name === 'string' &&
        typeof s.number === 'string' &&
        typeof s.online === 'boolean' &&
        typeof s.help === 'boolean' &&
        typeof s.submitted === 'boolean' &&
        typeof s.status === 'string',
    )
    const validClasses =
      value.classrooms.length > 0 &&
      value.classrooms.every(
        (c: Classroom) =>
          typeof c.id === 'string' && typeof c.name === 'string' && typeof c.status === 'string',
      )
    if (!validExercises || !validStudents || !validClasses || !value.exercises.length) return
    applyingRemote = true
    exercises.splice(0, exercises.length, ...value.exercises)
    students.splice(0, students.length, ...value.students)
    classrooms.splice(0, classrooms.length, ...value.classrooms)
    if (typeof value.classroomId === 'string') demo.classroomId = value.classroomId
    if (typeof value.recommended === 'string') demo.recommended = value.recommended
    if (typeof value.inviteCode === 'string') demo.inviteCode = value.inviteCode
  } catch {
    /* Leave the default prototype state intact if storage is invalid. */
  } finally {
    applyingRemote = false
  }
}
try {
  applyState(localStorage.getItem(stateKey))
} catch {
  /* Browser storage may be disabled. */
}
watch(
  () => [exercises, students, classrooms, demo.classroomId, demo.recommended, demo.inviteCode],
  () => {
    if (applyingRemote) return
    try {
      localStorage.setItem(
        stateKey,
        JSON.stringify({
          version: 2,
          exercises,
          students,
          classrooms,
          classroomId: demo.classroomId,
          recommended: demo.recommended,
          inviteCode: demo.inviteCode,
        }),
      )
    } catch {
      notify('本机状态保存失败，独立窗口的数据可能不同步')
    }
  },
  { deep: true, flush: 'sync' },
)
export function draftStorageKey(exerciseId: string, studentId = 's01') {
  return `${draftPrefix}${demo.classroomId}:${studentId}:${exerciseId}`
}
export function readDraft(exerciseId: string, fallback: string, studentId = 's01') {
  const key = draftStorageKey(exerciseId, studentId)
  if (drafts[key] !== undefined) return drafts[key]
  try {
    const current = localStorage.getItem(key)
    if (current !== null) return current
    // Preserve drafts created by the original single-class prototype.
    return (
      (demo.classroomId === 'cpp-basic' && studentId === 's01'
        ? localStorage.getItem('cpp-ui-draft-' + exerciseId)
        : null) ?? fallback
    )
  } catch {
    return fallback
  }
}
export function saveDraft(exerciseId: string, code: string, studentId = 's01') {
  const key = draftStorageKey(exerciseId, studentId)
  localStorage.setItem(key, code)
  drafts[key] = code
}
function receiveStorage(event: StorageEvent) {
  if (event.key === stateKey) applyState(event.newValue)
  else if (event.key?.startsWith(draftPrefix)) {
    if (event.newValue === null) delete drafts[event.key]
    else drafts[event.key] = event.newValue
  }
}
window.addEventListener('storage', receiveStorage)
import.meta.hot?.dispose(() => window.removeEventListener('storage', receiveStorage))
export const counts = computed(() => ({
  total: students.length,
  online: students.filter((s) => s.online).length,
  help: students.filter((s) => s.help).length,
  submitted: students.filter((s) => s.submitted).length,
  errors: students.filter((s) => s.status === '编译失败').length,
}))
let toastTimer: ReturnType<typeof setTimeout>
export function notify(message: string) {
  demo.notice = message
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    demo.notice = ''
  }, 4000)
}
export function tone(status: string) {
  if (['运行完成', '已发布', '进行中', '已解决', '正常', '已提交'].includes(status))
    return 'positive'
  if (['编译失败', '运行失败', '平台执行失败', '资源超限'].includes(status)) return 'red'
  if (['超时', '草稿', '请求帮助', '运行中／可输入', '未开始'].includes(status)) return 'amber'
  return 'neutral'
}
export function download(name: string, content: string, type = 'text/plain;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
