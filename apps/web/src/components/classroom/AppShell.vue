<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  CodeXml,
  LayoutDashboard,
  BookOpen,
  Users,
  Settings2,
  ArrowUpRight,
  ChevronDown,
  ChevronRight,
  GraduationCap,
  HelpCircle,
  PanelLeftClose,
  Monitor,
  ShieldCheck,
  LogOut,
  X,
  Menu,
} from '@lucide/vue'
import { activeClassroom, counts, currentUser, logout } from '@/data/demo'
const route = useRoute()
const router = useRouter()
const mobileOpen = ref(false)
const roleMenu = ref(false)
const role = computed(() =>
  route.path.startsWith('/student')
    ? 'student'
    : route.path.startsWith('/admin')
      ? 'admin'
      : 'teacher',
)
const links = computed(() =>
  role.value === 'teacher'
    ? [
        { to: '/teacher/overview', title: '课堂总览', icon: LayoutDashboard },
        { to: '/teacher/teach', title: '教师授课', icon: Monitor },
        { to: '/teacher/exercises', title: '练习管理', icon: BookOpen },
        { to: '/teacher/roster', title: '学生名册', icon: Users },
        { to: '/teacher/submissions', title: '提交与导出', icon: GraduationCap },
        { to: '/teacher/settings', title: '课堂设置', icon: Settings2 },
      ]
    : role.value === 'student'
      ? [
          { to: '/student/classes', title: '我的课堂', icon: LayoutDashboard },
          { to: '/student/workspace', title: '练习工作区', icon: CodeXml },
          { to: '/student/history', title: '运行历史', icon: Monitor },
        ]
      : [
          { to: '/admin/health', title: '平台概况', icon: LayoutDashboard },
          { to: '/admin/teachers', title: '教师账号', icon: Users },
          { to: '/admin/settings', title: '平台配置', icon: Settings2 },
          { to: '/admin/tasks', title: '失败任务', icon: Monitor },
          { to: '/admin/backups', title: '备份与记录', icon: ShieldCheck },
        ],
)
const sectionTitle = computed(
  () =>
    links.value.find((x) => route.path.startsWith(x.to))?.title ??
    (route.path.includes('/students/') ? '学生详情' : '我的课堂'),
)
async function signOut() {
  await logout()
  roleMenu.value = false
  await router.push('/login')
}
</script>
<template>
  <div class="app-shell">
    <button
      v-if="mobileOpen"
      class="sidebar-scrim"
      aria-label="关闭导航"
      @click="mobileOpen = false"
    />
    <aside class="sidebar" :class="{ 'mobile-open': mobileOpen }">
      <RouterLink to="/" class="brand"
        ><span class="brand-symbol"><CodeXml :size="23" /></span
        ><span>码上课堂<span class="brand-sub">C++ Classroom</span></span> </RouterLink
      ><button class="icon-button mobile-close" aria-label="关闭菜单" @click="mobileOpen = false">
        <X :size="18" />
      </button>
      <RouterLink
        :to="
          role === 'teacher'
            ? '/teacher/classes'
            : role === 'admin'
              ? '/admin/health'
              : '/student/classes'
        "
        class="class-switch"
        ><span class="class-icon"><GraduationCap :size="19" /></span
        ><span
          >{{ role === 'admin' ? '平台管理工作台' : activeClassroom.name
          }}<small>{{ role === 'admin' ? '必要运维 · 管理员' : '2026 秋季学期' }}</small></span
        ><ChevronDown :size="14"
      /></RouterLink>
      <div class="nav-caption">
        {{ role === 'teacher' ? '教学工作台' : role === 'student' ? '学习工作台' : '平台管理' }}
      </div>
      <nav>
        <RouterLink
          v-for="link in links"
          :key="link.to"
          :to="link.to"
          class="nav-item"
          :class="{
            active:
              route.path.startsWith(link.to) ||
              (link.to === '/teacher/overview' && route.path.includes('/students/')),
          }"
          @click="mobileOpen = false"
          ><component :is="link.icon" :size="18" /><span>{{ link.title }}</span
          ><span v-if="link.title === '课堂总览' && counts.help" class="nav-count">{{
            counts.help
          }}</span></RouterLink
        >
      </nav>
      <div v-if="role === 'teacher'" class="sidebar-session">
        <span class="live-dot" />{{
          activeClassroom.status === '进行中'
            ? '课堂进行中'
            : activeClassroom.status === '已归档'
              ? '课堂已归档'
              : activeClassroom.status === '已关闭'
                ? '课堂已关闭'
                : '课堂尚未开始'
        }}
        <p>{{ counts.online }} 位同学在线</p>
        <RouterLink to="/teacher/overview">开始课堂巡视 <ArrowUpRight :size="14" /></RouterLink>
      </div>
      <div class="sidebar-bottom">
        <RouterLink to="/guide" class="nav-item"
          ><HelpCircle :size="18" />使用导览 <ArrowUpRight :size="14" class="ml-auto"
        /></RouterLink>
        <div class="profile-wrap">
          <div v-if="roleMenu" class="role-menu">
            <p>{{ currentUser?.username }}</p>
            <button @click="signOut"><LogOut :size="14" />退出登录</button>
          </div>
          <button class="profile" @click="roleMenu = !roleMenu">
            <span class="avatar">{{ currentUser?.name.slice(-1) ?? '' }}</span
            ><span
              >{{ currentUser?.name ?? ''
              }}<small>{{
                role === 'teacher' ? '教师账号' : role === 'student' ? '学生账号' : '运维账号'
              }}</small></span
            ><ChevronDown :size="15" />
          </button>
        </div>
      </div>
    </aside>
    <div class="shell-main">
      <header class="topbar">
        <div class="breadcrumbs">
          <button class="icon-button menu-button" aria-label="打开导航" @click="mobileOpen = true">
            <Menu :size="19" /></button
          ><PanelLeftClose :size="17" class="desktop-only muted" /><span>{{
            role === 'admin' ? '平台管理' : role === 'student' ? '学习空间' : '我的课堂'
          }}</span
          ><ChevronRight :size="13" /><strong>{{ sectionTitle }}</strong>
        </div>
        <div class="topbar-right">
          <span class="demo-tag">已连接服务器</span
          ><span class="desktop-only muted">课堂实时数据</span
          ><span class="topbar-avatar">{{ currentUser?.name.slice(-1) ?? '' }}</span>
        </div>
      </header>
      <main class="page-content"><slot /></main>
      <footer class="app-footer">
        <span>码上课堂 · C++ Classroom</span
        ><span>原生 Linux 评测 <span class="footer-dot">·</span> 课堂数据已持久化</span>
      </footer>
    </div>
  </div>
</template>
