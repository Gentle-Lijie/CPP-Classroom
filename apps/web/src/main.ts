import { createApp } from 'vue'
import { createNotivue } from 'notivue'
import { createRouter, createWebHistory } from 'vue-router'
import App from './App.vue'
import { initialize, currentUser, demo, exercises, bootstrapError } from './data/demo'
import { initializeTheme } from '@/lib/theme'
import './styles.css'
import './interface.css'
import './platform.css'
import './editor-language.css'
import './controls.css'
import './density.css'
import 'notivue/notification.css'
import 'notivue/animations.css'
import './alerts.css'
import './code-block.css'

initializeTheme()

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/teacher/overview' },
    { path: '/teacher/classes', component: () => import('./views/ClassesView.vue') },
    { path: '/teacher/overview', component: () => import('./views/OverviewView.vue') },
    { path: '/teacher/exercises', component: () => import('./views/ExercisesView.vue') },
    { path: '/teacher/exercises/new', component: () => import('./views/ExerciseEditorView.vue') },
    {
      path: '/teacher/exercises/:id/edit',
      component: () => import('./views/ExerciseEditorView.vue'),
    },
    {
      path: '/teacher/teach',
      component: () => import('./views/TeachingView.vue'),
      meta: { standalone: true },
    },
    {
      path: '/teacher/monitor',
      component: () => import('./views/MonitorWindowView.vue'),
      meta: { standalone: true },
    },
    {
      path: '/teacher/inspect/:id',
      component: () => import('./views/StudentDetailView.vue'),
      meta: { standalone: true },
    },
    { path: '/teacher/roster', component: () => import('./views/RosterView.vue') },
    { path: '/teacher/settings', component: () => import('./views/SettingsView.vue') },
    { path: '/teacher/submissions', component: () => import('./views/SubmissionsView.vue') },
    { path: '/teacher/students/:id', component: () => import('./views/StudentDetailView.vue') },
    { path: '/student/classes', component: () => import('./views/ClassesView.vue') },
    {
      path: '/student/workspace',
      component: () => import('./views/WorkspaceView.vue'),
      meta: { standalone: true },
    },
    { path: '/student/history', component: () => import('./views/HistoryView.vue') },
    {
      path: '/projection/:id',
      component: () => import('./views/ProjectionView.vue'),
      meta: { standalone: true },
    },
    { path: '/login', component: () => import('./views/AuthView.vue'), meta: { standalone: true } },
    { path: '/join', component: () => import('./views/AuthView.vue'), meta: { standalone: true } },
    {
      path: '/recover',
      component: () => import('./views/AuthView.vue'),
      meta: { standalone: true },
    },
    { path: '/admin/settings', component: () => import('./views/PlatformSettingsView.vue') },
    { path: '/admin/environment', redirect: '/admin/settings?section=execution' },
    { path: '/admin/:section', component: () => import('./views/AdminView.vue') },
    { path: '/guide', component: () => import('./views/GuideView.vue') },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
  scrollBehavior: () => ({ top: 0 }),
})
router.beforeEach(async (to) => {
  await initialize()
  if (bootstrapError.value) return true
  if (['/login', '/recover'].includes(to.path)) return true
  if (!currentUser.value) return { path: '/login', query: { redirect: to.fullPath } }
  const role = currentUser.value.role
  if (to.path === '/guide') return true
  if (
    to.path.startsWith('/admin/') &&
    !['health', 'teachers', 'settings', 'environment', 'tasks', 'backups'].includes(
      to.path.split('/')[2]!,
    )
  )
    return '/admin/health'
  if (to.path === '/join' && role === 'student') return true
  const prefix = to.path.startsWith('/projection') ? 'teacher' : to.path.split('/')[1]
  if (['teacher', 'student', 'admin'].includes(prefix!) && prefix !== role)
    return role === 'admin' ? '/admin/health' : `/${role}/classes`
  if (!demo.classroomId && role !== 'admin' && !to.path.endsWith('/classes') && to.path !== '/join')
    return `/${role}/classes`
  if (role === 'student' && to.path === '/student/workspace' && !exercises.length)
    return '/student/classes'
  return true
})
router.afterEach((to) => {
  document.title = `${to.path.startsWith('/teacher/inspect/') ? '学生详情独立窗口' : to.path === '/teacher/teach' ? '教师授课' : to.path === '/teacher/monitor' ? '在线课堂巡视' : to.path.startsWith('/student/workspace') ? '练习工作区' : to.path.startsWith('/projection') ? '课堂投屏' : '教学工作台'} · Codemia`
})
createApp(App)
  .use(createNotivue({ position: 'top-right', limit: 3, avoidDuplicates: true }))
  .use(router)
  .mount('#app')
