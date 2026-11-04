import { computed, reactive, ref } from 'vue'
import { api, ApiError, connectionState } from '@/lib/api'
import {
  executionDefaults,
  languageSettings,
  type SourceLanguage,
  type ClassroomRole,
  type ClassroomPermission,
} from '@classroom/contracts'
import { clearNotifications, notify } from '@/lib/notifications'
import { t } from '@/i18n'
export { notify } from '@/lib/notifications'
export const executionSettings = reactive({ ...executionDefaults, languages: languageSettings() })
export const starterCode =
  '#include <iostream>\nusing namespace std;\n\nint main() {\n    return 0;\n}\n'
export const errorCode = starterCode
export interface Student {
  language?: SourceLanguage
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
  helpMessage?: string
  helpCreatedAt?: string
  helpLanguage?: SourceLanguage
  helpExerciseId?: string
  helpRequestId?: string
  recommendedSubmitted?: boolean
}
export interface Exercise {
  language?: SourceLanguage
  starters?: Partial<Record<SourceLanguage, string>>
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
  classroomRole: ClassroomRole
  permissions: ClassroomPermission[]
  ownerId?: string
  canManageStaff?: boolean
  id: string
  name: string
  description: string
  status: string
  color: string
  students: number
  exercises?: number
  teacher?: string
  inviteCode?: string
  inviteExpiresAt?: string
  membershipStatus?: string
  settings?: Record<string, unknown>
  recommended?: string
}
export interface RunRecord {
  language?: SourceLanguage
  runtimeProfile?: string
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
  exerciseId?: string
  compilerProfile?: string
  classroomId?: string
  eof?: boolean
}

export interface User {
  id: string
  name: string
  username: string
  number: string
  role: string
}
export const currentUser = ref<User>()
export const bootstrapError = ref('')
export const students = reactive<Student[]>([])
export const exercises = reactive<Exercise[]>([])
export const classrooms = reactive<Classroom[]>([])
export const exampleRuns = reactive<RunRecord[]>([])
export const demo = reactive({
  classroomId: '',
  recommended: '',
  role: '',
  inviteCode: '',
  helpSent: false,
})
const emptyClassroom: Classroom = {
  classroomRole: 'student',
  permissions: [],
  id: '',
  name: t('demo.bootstrap.selectClassroom'),
  description: '',
  status: 'not_started',
  color: 'green',
  students: 0,
}
export const activeClassroom = computed(
  () => classrooms.find((c) => c.id === demo.classroomId) ?? emptyClassroom,
)
// Account category only controls platform administration and classroom creation.
// Teaching and learning permissions always follow the selected classroom.
export const classroomRole = computed(() => activeClassroom.value.classroomRole)
export const isTeacher = computed(() => classroomRole.value === 'teacher')
export const isStaff = computed(() => ['teacher', 'ta'].includes(classroomRole.value))
export const canCreateClassroom = computed(() =>
  ['teacher', 'admin'].includes(currentUser.value?.role ?? ''),
)
export const workspaceRole = computed(() =>
  isStaff.value || (!demo.classroomId && canCreateClassroom.value) ? 'teacher' : 'student',
)
export function homePath() {
  return currentUser.value?.role === 'admin' ? '/admin/health' : `/${workspaceRole.value}/classes`
}
export const counts = computed(() => ({
  total: students.length,
  online: students.filter((s) => s.online).length,
  help: students.filter((s) => s.help).length,
  submitted: students.filter((s) => s.submitted).length,
  errors: students.filter((s) => s.status === 'compile_error').length,
}))
export function classPath(suffix = '') {
  return '/classes/' + demo.classroomId + suffix
}
let initialized = false
let refreshing: Promise<void> | undefined
export async function initialize() {
  if (initialized) return
  bootstrapError.value = ''
  try {
    try {
      currentUser.value = await api<User>('/auth/me')
    } catch (error) {
      if (!(error instanceof ApiError) || (error.status !== 0 && error.status < 500)) throw error
      await new Promise((resolve) => setTimeout(resolve, 300))
      currentUser.value = await api<User>('/auth/me')
    }
    demo.role = currentUser.value.role
    await refresh().catch(() => notify(t('demo.notify.loggedInRefreshFailed'), 'error'))
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) currentUser.value = undefined
    else {
      bootstrapError.value = t('demo.bootstrap.offline')
      return
    }
  }
  initialized = true
}
export async function login(username: string, password: string) {
  currentUser.value = await api<User>('/auth/login', 'POST', { username, password })
  demo.role = currentUser.value.role
  initialized = true
  await refresh().catch(() => notify(t('demo.notify.loginRefreshFailed'), 'error'))
}
export async function logout() {
  await api('/auth/logout', 'POST', {})
  clearSession()
}
export function clearSession() {
  currentUser.value = undefined
  classrooms.splice(0)
  students.splice(0)
  exercises.splice(0)
  initialized = false
  demo.classroomId = ''
  demo.recommended = ''
  demo.helpSent = false
  demo.inviteCode = ''
  clearNotifications()
  bootstrapError.value = ''
  try {
    for (const key of Object.keys(sessionStorage))
      if (key.startsWith('cpp-credentials:')) sessionStorage.removeItem(key)
  } catch {
    /* Server logout still succeeds when browser storage is unavailable. */
  }
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
async function refreshData(preferred?: string) {
  if (!currentUser.value) return
  const user = currentUser.value
  const [environment, list] = await Promise.all([
    api('/health/environment'),
    api<Classroom[]>('/classes'),
  ])
  let stored: string | null = null
  try {
    stored = localStorage.getItem('cpp-class:' + user.id)
  } catch {
    /* Optional preference. */
  }
  const available = list.filter((c) => c.membershipStatus !== 'pending')
  const selected =
    available.find((c) => c.id === (preferred ?? demo.classroomId)) ??
    available.find((c) => c.id === stored) ??
    available.find((c) => c.status === 'ongoing') ??
    available[0]
  const path = selected ? '/classes/' + selected.id : ''
  const [content, roster] = selected
    ? await Promise.all([
        api<Exercise[]>(path + '/exercises'),
        selected.classroomRole !== 'student'
          ? api<Student[]>(path + '/overview')
          : Promise.resolve([]),
      ])
    : [[], []]
  if (currentUser.value?.id !== user.id) return
  Object.assign(executionSettings, environment)
  classrooms.splice(0, classrooms.length, ...list)
  demo.classroomId = selected?.id ?? ''
  demo.role = selected?.classroomRole ?? user.role
  demo.inviteCode = selected?.inviteCode ?? ''
  demo.recommended =
    content.find((e) => e.id === selected?.recommended && e.status === 'published')?.id ??
    content.find((e) => e.status === 'published')?.id ??
    content[0]?.id ??
    ''
  exercises.splice(0, exercises.length, ...content)
  students.splice(
    0,
    students.length,
    ...roster.map((s) => ({
      ...s,
      activity: s.activity
        ? new Date(s.activity).toLocaleTimeString('zh-CN')
        : t('demo.bootstrap.neverVisited'),
    })),
  )
  connectionState.value = 'connected'
}
export async function selectClass(id: string) {
  if (refreshing) await refreshing
  refreshing = refreshData(id)
  try {
    await refreshing
  } finally {
    refreshing = undefined
  }
  try {
    localStorage.setItem('cpp-class:' + currentUser.value!.id, id)
  } catch {
    /* Optional preference. */
  }
}
export async function saveExercise(exercise: Exercise) {
  const { id, ...value } = exercise
  const result = await api<{ id?: string }>(
    classPath('/exercises' + (id ? '/' + id : '')),
    id ? 'PATCH' : 'POST',
    value,
  )
  Object.assign(exercise, result)
  await refresh().catch(() => notify(t('demo.notify.exerciseSavedRefreshFailed'), 'error'))
  return id || result.id!
}
export async function updateClass(value: unknown) {
  await api(classPath(), 'PATCH', value)
  await refresh().catch(() => notify(t('demo.notify.classSavedRefreshFailed'), 'error'))
}
export async function loadRuns(student?: string, exercise?: string) {
  const params = new URLSearchParams()
  if (student) params.set('student', student)
  if (exercise) params.set('exercise', exercise)
  return api<RunRecord[]>(classPath('/runs?' + params))
}
const drafts = reactive<Record<string, string>>({})
export function draftStorageKey(
  exerciseId: string,
  studentId = currentUser.value?.id ?? '',
  language: SourceLanguage = 'cpp',
) {
  // Preserve the original C++ backup key across upgrades.
  return `cpp-draft:${currentUser.value?.id}:${demo.classroomId}:${studentId}:${exerciseId}${language === 'cpp' ? '' : ':' + language}`
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
export function reportError(error: unknown) {
  notify(error instanceof Error ? error.message : t('demo.notify.requestFailed'), 'error')
}
export function tone(status: string) {
  if (['finished', 'published', 'ongoing', 'resolved', 'normal', 'submitted'].includes(status))
    return 'positive'
  if (['compile_error', 'runtime_error', 'platform_error', 'resource_limited'].includes(status))
    return 'red'
  if (['timeout', 'draft', 'help_requested', 'running', 'not_started'].includes(status))
    return 'amber'
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
