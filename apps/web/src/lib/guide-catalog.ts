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
    title: '认识工作区',
    description: '先看布局，再切题和编写代码。',
    path: '/student/workspace',
    steps: [
      mockStep(
        'overview',
        'overview',
        '先看工作区全貌',
        '左侧读题，右侧写代码，下方准备输入、查看结果；顶部负责切题、工作目录、运行与提交。接下来的内容都是可操作的模拟演示。',
      ),
      mockStep(
        'exercises',
        'exercises',
        '左上角切换题目',
        '这里切换课堂内的题目，题面、文件名和代码会随题目切换。试着选择另一道示例题；真实使用时，切题前会保存当前草稿。',
        true,
      ),
      mockStep(
        'editor',
        'editor',
        '编写代码与保存草稿',
        '代码区对应当前题目的源文件，工具栏提供字号、下载和补全设置。草稿会自动同步到服务器；工作目录则是可选的本地文件同步。',
      ),
    ],
  },
  {
    id: 'directory',
    title: '理解工作目录',
    description: '演示目录授权、文件同步与版本冲突。',
    path: '/student/workspace',
    steps: [
      mockStep(
        'directory',
        'directory',
        '工作目录怎样同步文件',
        '选择目录并授权后，平台按题目指定的文件名关联或创建文件。编辑后自动写入磁盘，并每 2 秒检查外部修改；切题后需关联新文件。本步可以模拟选择目录。',
        true,
      ),
      mockStep(
        'conflict',
        'conflict',
        '两个版本不同时，由你决定',
        '已有同名文件，或磁盘和编辑器都被修改时，自动写入会暂停。对照版本后选择保留哪一份；读取磁盘前的草稿会留作备份。这里的选择只改变模拟文件。',
        true,
      ),
    ],
  },
  {
    id: 'execution',
    title: '输入、输出与调试',
    description: '试运行、逐行输入，并修正一次编译错误。',
    path: '/student/workspace',
    steps: [
      mockStep(
        'batch',
        'io',
        '预填输入，一次运行',
        '左侧的文本作为程序的标准输入 stdin；程序通过 cin 读取，cout 的内容显示在右侧 stdout。试着修改两个整数并模拟运行，输入结束后会自动关闭 stdin。',
        true,
      ),
      mockStep(
        'interactive',
        'io',
        '交互输入：发送一行，读取一行',
        '运行前勾选“运行时输入”，程序启动后 stdin 保持打开。这里可发送整数并观察累计结果；EOF 只关闭输入，程序读到结尾后完成，停止则直接结束运行。',
        true,
      ),
      mockStep(
        'diagnostics',
        'diagnostics',
        '看懂编译错误和修正提示',
        '这次模拟编译因第 5 行缺少分号而失败，程序尚未执行。诊断给出文件名、行列和原因；按提示补上分号，再模拟编译，观察结果变化。',
        true,
      ),
    ],
  },
  {
    id: 'records',
    title: '求助、提交与回看',
    description: '区分草稿、提交与运行快照。',
    path: '/student/workspace',
    steps: [
      mockStep(
        'submission',
        'actions',
        '求助与提交作品',
        '遇到问题可附上说明向教师求助；完成后主动提交固定版本。自动保存草稿不等于提交，提交也不等于判题通过。这里的求助和提交都只作模拟。',
        true,
      ),
      mockStep(
        'history',
        'history',
        '回看每一次尝试',
        '运行历史保存当次代码、输入与结果，可以对照失败和修正后的版本。查看快照不会覆盖当前草稿。退出导览后会回到原来的页面。',
      ),
    ],
  },
]
const teacher: GuideChapter[] = [
  {
    id: 'classes',
    title: '准备课堂',
    description: '创建课堂并安排学生加入。',
    path: '/teacher/classes',
    steps: [
      step(
        '.page-heading',
        '创建或选择课堂',
        '先创建课堂，再准备学生名单与练习；课堂列表用于切换不同教学班。',
      ),
    ],
  },
  {
    id: 'roster',
    title: '安排学生入班',
    description: '导入名单、交付账号或审批申请。',
    path: '/teacher/roster',
    requires: 'classroom',
    steps: [
      step(
        '.credential-banner',
        '学生与账号交付',
        '可添加或导入学生并交付登录凭据，也可审批课堂码入班申请。忘记密码时核实身份后再重置。',
      ),
    ],
  },
  {
    id: 'exercises',
    title: '准备练习',
    description: '编写题目、发布并设置推荐。',
    path: '/teacher/exercises',
    requires: 'classroom',
    steps: [
      step(
        '.exercise-layout',
        '编排并发布练习',
        '创建题面、样例与初始代码，预览后发布。推荐练习用于引导学生进入当前讲解的题目。',
        { fallback: '.page-heading', condition: '创建第一道练习后，这里会展示题目列表与预览。' },
      ),
    ],
  },
  {
    id: 'teaching',
    title: '授课与巡视',
    description: '讲解题目、查看进度并处理求助。',
    path: '/teacher/teach',
    requires: 'exercises',
    steps: [
      step(
        '.teaching-stage',
        '讲解题目与示范代码',
        '按讲解需要切换题面、代码或同时展示；顶部可打开独立巡视窗口，关注学生进度。',
      ),
    ],
  },
  {
    id: 'overview',
    title: '关注学生进度',
    description: '从总览定位问题，进入学生详情辅导。',
    path: '/teacher/overview',
    requires: 'classroom',
    steps: [
      step(
        '.stat-grid',
        '先看课堂状态',
        '在线、提交、编译失败和求助统计帮助你判断进度，点击统计卡片可筛选对应学生。',
      ),
      step(
        '.student-panel',
        '进入详情辅导',
        '从学生列表进入详情，查看草稿、运行快照和求助上下文，再选择需要讲解的作品。',
      ),
    ],
  },
  {
    id: 'submissions',
    title: '收集课堂作品',
    description: '查看提交并导出作品。',
    path: '/teacher/submissions',
    requires: 'classroom',
    steps: [
      step(
        '.export-panel',
        '查看提交与导出作品',
        '这里收集学生主动提交的固定版本，可按练习、学生或所选记录导出。归档课堂前可先保存作品。',
      ),
    ],
  },
  {
    id: 'settings',
    title: '管理课堂状态',
    description: '设置开放状态、邀请和课堂策略。',
    path: '/teacher/settings',
    requires: 'classroom',
    steps: [
      step(
        '.settings-layout',
        '开放、设置与归档',
        '在这里管理课堂状态、邀请和提交策略。归档会停止运行并关闭加入、编辑和提交，作品与历史保留。',
      ),
    ],
  },
]
const admin: GuideChapter[] = [
  {
    id: 'health',
    title: '查看平台状态',
    description: '了解课堂、在线人数和任务队列。',
    path: '/admin/health',
    steps: [
      step(
        '.stat-grid',
        '先看平台概况',
        '关注开放课堂、在线成员、排队任务和平台失败数量，再按需要进入配置或任务详情。',
      ),
    ],
  },
  {
    id: 'accounts',
    title: '管理账号',
    description: '创建账号，处理密码与恢复申请。',
    path: '/admin/teachers',
    steps: [
      step(
        '.panel',
        '账号与身份恢复',
        '在这里创建和管理账号。停用、重设密码或处理恢复申请前，先核实身份并妥善交付凭据。',
      ),
    ],
  },
  {
    id: 'platform',
    title: '检查执行环境',
    description: '检查服务连接，配置运行限额。',
    path: '/admin/settings',
    steps: [
      step(
        '.runtime-health-panel',
        '检查服务连接',
        '查看业务服务、数据库与执行节点的连接状态。连接正常仅代表服务可达。',
      ),
      step(
        '.runtime-form-panel',
        '配置编译与运行限额',
        '统一设置 C++ 标准、资源限制和执行并发，调整后主动保存。执行节点地址由服务端管理。',
      ),
    ],
  },
  {
    id: 'tasks',
    title: '排查失败任务',
    description: '查看失败原因与诊断详情。',
    path: '/admin/tasks',
    steps: [
      step(
        '.panel',
        '定位平台执行问题',
        '查看失败任务的状态、原因和详情，区分学生程序问题与平台执行环境问题。',
      ),
    ],
  },
  {
    id: 'backups',
    title: '备份与追溯',
    description: '验证备份并查看管理记录。',
    path: '/admin/backups',
    steps: [
      step(
        '.admin-backup-panel',
        '备份与恢复验证',
        '创建备份后会在独立临时数据库验证恢复，保留现有数据。下方管理记录可追溯备份与其他管理操作。',
      ),
    ],
  },
]
export const guideCatalog: Record<GuideRole, GuideChapter[]> = { student, teacher, admin }
export const roleLabels: Record<GuideRole, string> = {
  student: '学生',
  teacher: '教师',
  admin: '管理员',
}
export function chapterAvailable(
  chapter: GuideChapter,
  hasClassroom: boolean,
  hasExercises: boolean,
) {
  return !chapter.requires || (hasClassroom && (chapter.requires !== 'exercises' || hasExercises))
}
