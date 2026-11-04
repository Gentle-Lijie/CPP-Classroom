import type { StudentGuideScene } from './student-guide-demo'
export type GuideRole = 'student' | 'teacher' | 'admin'
export interface GuideStep {
  target: string
  scene?: StudentGuideScene
  interactive?: boolean
  title: string
  description: string
  surface?: string
  fallback?: string
  condition?: string
}
export interface GuideChapter {
  id: string
  title: string
  description: string
  path: string
  requires?: 'classroom' | 'exercises'
  steps: GuideStep[]
}
// title/description/condition 字段存放 guide 命名空间下的 i18n 键，由展示组件用 t() 渲染
const key = (path: string) => `guide.chapters.${path}`
const step = (
  target: string,
  title: string,
  description: string,
  extra: Partial<GuideStep> = {},
): GuideStep => ({ target, title, description, ...extra })

const mockStep = (
  scene: StudentGuideScene,
  target: string,
  title: string,
  description: string,
  interactive = false,
) => step(`[data-student-guide="${target}"]`, title, description, { scene, interactive })
const student: GuideChapter[] = [
  {
    id: 'workspace',
    title: key('student.workspace.title'),
    description: key('student.workspace.description'),
    path: '/student/workspace',
    steps: [
      mockStep(
        'overview',
        'overview',
        key('student.workspace.steps.overview.title'),
        key('student.workspace.steps.overview.description'),
      ),
      mockStep(
        'exercises',
        'exercises',
        key('student.workspace.steps.exercises.title'),
        key('student.workspace.steps.exercises.description'),
        true,
      ),
      mockStep(
        'editor',
        'editor',
        key('student.workspace.steps.editor.title'),
        key('student.workspace.steps.editor.description'),
      ),
    ],
  },
  {
    id: 'directory',
    title: key('student.directory.title'),
    description: key('student.directory.description'),
    path: '/student/workspace',
    steps: [
      mockStep(
        'directory',
        'directory',
        key('student.directory.steps.directory.title'),
        key('student.directory.steps.directory.description'),
        true,
      ),
      mockStep(
        'conflict',
        'conflict',
        key('student.directory.steps.conflict.title'),
        key('student.directory.steps.conflict.description'),
        true,
      ),
    ],
  },
  {
    id: 'execution',
    title: key('student.execution.title'),
    description: key('student.execution.description'),
    path: '/student/workspace',
    steps: [
      mockStep(
        'batch',
        'io',
        key('student.execution.steps.batch.title'),
        key('student.execution.steps.batch.description'),
        true,
      ),
      mockStep(
        'interactive',
        'io',
        key('student.execution.steps.interactive.title'),
        key('student.execution.steps.interactive.description'),
        true,
      ),
      mockStep(
        'diagnostics',
        'diagnostics',
        key('student.execution.steps.diagnostics.title'),
        key('student.execution.steps.diagnostics.description'),
        true,
      ),
    ],
  },
  {
    id: 'records',
    title: key('student.records.title'),
    description: key('student.records.description'),
    path: '/student/workspace',
    steps: [
      mockStep(
        'submission',
        'actions',
        key('student.records.steps.submission.title'),
        key('student.records.steps.submission.description'),
        true,
      ),
      mockStep(
        'history',
        'history',
        key('student.records.steps.history.title'),
        key('student.records.steps.history.description'),
      ),
    ],
  },
]
const teacher: GuideChapter[] = [
  {
    id: 'classes',
    title: key('teacher.classes.title'),
    description: key('teacher.classes.description'),
    path: '/teacher/classes',
    steps: [
      step(
        '.page-heading',
        key('teacher.classes.steps.create.title'),
        key('teacher.classes.steps.create.description'),
      ),
    ],
  },
  {
    id: 'roster',
    title: key('teacher.roster.title'),
    description: key('teacher.roster.description'),
    path: '/teacher/roster',
    requires: 'classroom',
    steps: [
      step(
        '.credential-banner',
        key('teacher.roster.steps.credentials.title'),
        key('teacher.roster.steps.credentials.description'),
      ),
    ],
  },
  {
    id: 'exercises',
    title: key('teacher.exercises.title'),
    description: key('teacher.exercises.description'),
    path: '/teacher/exercises',
    requires: 'classroom',
    steps: [
      step(
        '.exercise-layout',
        key('teacher.exercises.steps.compose.title'),
        key('teacher.exercises.steps.compose.description'),
        {
          fallback: '.page-heading',
          condition: key('teacher.exercises.steps.compose.condition'),
        },
      ),
    ],
  },
  {
    id: 'teaching',
    title: key('teacher.teaching.title'),
    description: key('teacher.teaching.description'),
    path: '/teacher/teach',
    requires: 'exercises',
    steps: [
      step(
        '.teaching-stage',
        key('teacher.teaching.steps.stage.title'),
        key('teacher.teaching.steps.stage.description'),
      ),
    ],
  },
  {
    id: 'overview',
    title: key('teacher.overview.title'),
    description: key('teacher.overview.description'),
    path: '/teacher/overview',
    requires: 'classroom',
    steps: [
      step(
        '.stat-grid',
        key('teacher.overview.steps.stats.title'),
        key('teacher.overview.steps.stats.description'),
      ),
      step(
        '.student-panel',
        key('teacher.overview.steps.detail.title'),
        key('teacher.overview.steps.detail.description'),
      ),
    ],
  },
  {
    id: 'submissions',
    title: key('teacher.submissions.title'),
    description: key('teacher.submissions.description'),
    path: '/teacher/submissions',
    requires: 'classroom',
    steps: [
      step(
        '.export-panel',
        key('teacher.submissions.steps.export.title'),
        key('teacher.submissions.steps.export.description'),
      ),
    ],
  },
  {
    id: 'settings',
    title: key('teacher.settings.title'),
    description: key('teacher.settings.description'),
    path: '/teacher/settings',
    requires: 'classroom',
    steps: [
      step(
        '.settings-layout',
        key('teacher.settings.steps.archive.title'),
        key('teacher.settings.steps.archive.description'),
      ),
    ],
  },
]
const admin: GuideChapter[] = [
  {
    id: 'health',
    title: key('admin.health.title'),
    description: key('admin.health.description'),
    path: '/admin/health',
    steps: [
      step(
        '.stat-grid',
        key('admin.health.steps.overview.title'),
        key('admin.health.steps.overview.description'),
      ),
    ],
  },
  {
    id: 'accounts',
    title: key('admin.accounts.title'),
    description: key('admin.accounts.description'),
    path: '/admin/teachers',
    steps: [
      step(
        '.panel',
        key('admin.accounts.steps.recovery.title'),
        key('admin.accounts.steps.recovery.description'),
      ),
    ],
  },
  {
    id: 'platform',
    title: key('admin.platform.title'),
    description: key('admin.platform.description'),
    path: '/admin/settings',
    steps: [
      step(
        '.runtime-health-panel',
        key('admin.platform.steps.connections.title'),
        key('admin.platform.steps.connections.description'),
      ),
      step(
        '.runtime-form-panel',
        key('admin.platform.steps.limits.title'),
        key('admin.platform.steps.limits.description'),
      ),
    ],
  },
  {
    id: 'tasks',
    title: key('admin.tasks.title'),
    description: key('admin.tasks.description'),
    path: '/admin/tasks',
    steps: [
      step(
        '.panel',
        key('admin.tasks.steps.diagnose.title'),
        key('admin.tasks.steps.diagnose.description'),
      ),
    ],
  },
  {
    id: 'backups',
    title: key('admin.backups.title'),
    description: key('admin.backups.description'),
    path: '/admin/backups',
    steps: [
      step(
        '.admin-backup-panel',
        key('admin.backups.steps.verify.title'),
        key('admin.backups.steps.verify.description'),
      ),
    ],
  },
]
export const guideCatalog: Record<GuideRole, GuideChapter[]> = { student, teacher, admin }
export const roleLabels: Record<GuideRole, string> = {
  student: 'guide.roles.student',
  teacher: 'guide.roles.teacher',
  admin: 'guide.roles.admin',
}
export function chapterAvailable(
  chapter: GuideChapter,
  hasClassroom: boolean,
  hasExercises: boolean,
) {
  return !chapter.requires || (hasClassroom && (chapter.requires !== 'exercises' || hasExercises))
}
