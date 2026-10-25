import { computed, reactive, ref } from 'vue'
import { api } from '@/lib/api'
import { executionDefaults } from '@classroom/contracts'
export const executionSettings = reactive({ ...executionDefaults })
export const starterCode =
  '#include <iostream>\nusing namespace std;\n\nint main() {\n    return 0;\n}\n'
export const errorCode = starterCode
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
  version?: number
  position?: number
}
export interface Classroom {
  id: string
  name: string
  description: string
  status: string
  color: string
  students: number
  exercises?: number
  teacher?: string
  inviteCode?: string
  settings?: Record<string, unknown>
  recommended?: string
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

export interface User {
  id: string
  name: string
  username: string
  number: string
  role: string
}
export const currentUser = ref<User>()
export const students = reactive<Student[]>([])
export const exercises = reactive<Exercise[]>([])
export const classrooms = reactive<Classroom[]>([])
export const exampleRuns = reactive<RunRecord[]>([])
export const demo = reactive({
  classroomId: '',
  recommended: '',
  notice: '',
  role: '',
  inviteCode: '',
  helpSent: false,
})
const emptyClassroom: Classroom = {
  id: '',
  name: '请选择课堂',
  description: '',
  status: '未开始',
  color: 'green',
  students: 0,
}
export const activeClassroom = computed(
  () => classrooms.find((c) => c.id === demo.classroomId) ?? emptyClassroom,
)
export const counts = computed(() => ({
  total: students.length,
  online: students.filter((s) => s.online).length,
  help: students.filter((s) => s.help).length,
  submitted: students.filter((s) => s.submitted).length,
  errors: students.filter((s) => s.status === '编译失败').length,
}))
export function classPath(suffix = '') {
  return '/classes/' + demo.classroomId + suffix
}
let initialized = false
let refreshing: Promise<void> | undefined
export async function initialize() {
  if (initialized) return
  try {
    currentUser.value = await api<User>('/auth/me')
    demo.role = currentUser.value.role
    await refresh()
  } catch {
    currentUser.value = undefined
  }
  initialized = true
}
export async function login(username: string, password: string) {
  currentUser.value = await api<User>('/auth/login', 'POST', { username, password })
  demo.role = currentUser.value.role
  initialized = true
  await refresh()
}
export async function logout() {
  await api('/auth/logout', 'POST', {})
  currentUser.value = undefined
  classrooms.splice(0)
  students.splice(0)
  exercises.splice(0)
  initialized = false
}
export async function refresh(): Promise<void> {
  if (!currentUser.value) return
  if (refreshing) return refreshing
  refreshing = refreshData()
  try {
    await refreshing
  } finally {
    refreshing = undefined
  }
}
async function refreshData() {
  if (!currentUser.value) return
  {
    Object.assign(executionSettings, await api('/health/environment'))
    const list = await api<Classroom[]>('/classes')
    classrooms.splice(0, classrooms.length, ...list)
    const stored = localStorage.getItem('cpp-class:' + currentUser.value.id)
    if (!list.some((c) => c.id === demo.classroomId))
      demo.classroomId = list.find((c) => c.id === stored)?.id ?? list[0]?.id ?? ''
    if (!demo.classroomId) {
      students.splice(0)
      exercises.splice(0)
      return
    }
    const c = activeClassroom.value
    demo.inviteCode = c.inviteCode ?? ''
    demo.recommended = c.recommended ?? ''
    const content = await api<Exercise[]>(classPath('/exercises'))
    exercises.splice(0, exercises.length, ...content)
    if (!demo.recommended)
      demo.recommended = content.find((e) => e.status === '已发布')?.id ?? content[0]?.id ?? ''
    if (currentUser.value.role === 'teacher') {
      const roster = await api<Student[]>(classPath('/overview'))
      students.splice(
        0,
        students.length,
        ...roster.map((s) => ({
          ...s,
          activity: s.activity ? new Date(s.activity).toLocaleTimeString('zh-CN') : '尚未访问',
        })),
      )
    }
  }
}
export async function selectClass(id: string) {
  if (refreshing) await refreshing
  demo.classroomId = id
  localStorage.setItem('cpp-class:' + currentUser.value!.id, id)
  await refresh()
}
export async function saveExercise(exercise: Exercise) {
  const { id, ...value } = exercise
  const result = await api<{ id?: string }>(
    classPath('/exercises' + (id ? '/' + id : '')),
    id ? 'PATCH' : 'POST',
    value,
  )
  await refresh()
  return id || result.id!
}
export async function updateClass(value: unknown) {
  await api(classPath(), 'PATCH', value)
  await refresh()
}
export async function loadRuns(student?: string, exercise?: string) {
  const params = new URLSearchParams()
  if (student) params.set('student', student)
  if (exercise) params.set('exercise', exercise)
  return api<RunRecord[]>(classPath('/runs?' + params))
}
const drafts = reactive<Record<string, string>>({})
export function draftStorageKey(exerciseId: string, studentId = currentUser.value?.id ?? '') {
  return `cpp-draft:${currentUser.value?.id}:${demo.classroomId}:${studentId}:${exerciseId}`
}
export function readDraft(
  exerciseId: string,
  fallback: string,
  studentId = currentUser.value?.id ?? '',
) {
  return (
    drafts[draftStorageKey(exerciseId, studentId)] ??
    localStorage.getItem(draftStorageKey(exerciseId, studentId)) ??
    fallback
  )
}
export function saveDraft(
  exerciseId: string,
  code: string,
  studentId = currentUser.value?.id ?? '',
) {
  const key = draftStorageKey(exerciseId, studentId)
  localStorage.setItem(key, code)
  drafts[key] = code
}
let timer: ReturnType<typeof setTimeout>
export function notify(message: string) {
  demo.notice = message
  clearTimeout(timer)
  timer = setTimeout(() => (demo.notice = ''), 6000)
}
export function reportError(error: unknown) {
  notify(error instanceof Error ? error.message : '请求失败，请重试')
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
