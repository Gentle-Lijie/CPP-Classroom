<script setup lang="ts">
import { Alert } from '@/components/ui/alert'
import ThemeToggle from '@/components/classroom/ThemeToggle.vue'
import LanguageToggle from '@/components/classroom/LanguageToggle.vue'
import { Button } from '@/components/ui/button'
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import {
  DropdownMenuRoot,
  DropdownMenuTrigger,
  DropdownMenuPortal,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from 'reka-ui'
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
  KeyRound,
  //   RefreshCw,
  Check,
  Ellipsis,
} from '@lucide/vue'
import {
  activeClassroom,
  workspaceRole,
  classroomRole,
  classrooms,
  counts,
  currentUser,
  logout,
  reportError,
  //   refresh,
  selectClass,
} from '@/data/demo'
import { connectionState } from '@/lib/api'
import { useGuideSurfaces } from '@/lib/spotlight'
import { startUserGuide } from '@/lib/user-guide'
import AccountDialog from './AccountDialog.vue'
const { t } = useI18n()
import { statusLabel } from '@/lib/status-labels'
const route = useRoute()
const router = useRouter()
const mobileOpen = ref(false)
const roleMenu = ref(false)
const accountOpen = ref(false)
const signingOut = ref(false)
const switchingClass = ref(false)
watch(
  () => route.fullPath,
  () => {
    roleMenu.value = false
  },
)
const availableClassrooms = computed(() =>
  classrooms.filter((classroom) => classroom.membershipStatus !== 'pending'),
)
const classesPath = computed(() =>
  role.value === 'teacher' ? '/teacher/classes' : '/student/classes',
)
async function switchClass(id: string) {
  if (switchingClass.value || id === activeClassroom.value.id) return
  switchingClass.value = true
  try {
    // Let page leave guards finish before replacing the current classroom data.
    if (route.path !== classesPath.value && (await router.push(classesPath.value))) return
    await selectClass(id)
    await router.push(workspaceRole.value === 'teacher' ? '/teacher/overview' : '/student/classes')
  } catch (error) {
    reportError(error)
  } finally {
    switchingClass.value = false
  }
}
useGuideSurfaces({
  'account-menu': () => {
    const previous = roleMenu.value
    roleMenu.value = true
    return () => {
      roleMenu.value = previous
    }
  },
  'account-dialog': () => {
    const previous = accountOpen.value
    accountOpen.value = true
    return () => {
      accountOpen.value = previous
    }
  },
})
const role = computed(() =>
  route.path.startsWith('/admin/')
    ? 'admin'
    : route.path.startsWith('/student/')
      ? 'student'
      : workspaceRole.value,
)
function openAccount() {
  accountOpen.value = true
  roleMenu.value = false
}
const teachingLinks = computed(() => [
  { to: '/teacher/overview', key: 'overview', icon: LayoutDashboard },
  ...(classroomRole.value === 'teacher'
    ? [{ to: '/teacher/teach', key: 'teach', icon: Monitor }]
    : [{ to: '/teacher/monitor', key: 'monitor', icon: Monitor }]),
  ...(classroomRole.value === 'teacher'
    ? [
        { to: '/teacher/exercises', key: 'exercises', icon: BookOpen },
        { to: '/teacher/roster', key: 'roster', icon: Users },
      ]
    : []),
  {
    to: '/teacher/submissions',
    key: classroomRole.value === 'ta' ? 'submissionsTa' : 'submissionsTeacher',
    icon: GraduationCap,
  },
  ...(classroomRole.value === 'teacher'
    ? [{ to: '/teacher/settings', key: 'settings', icon: Settings2 }]
    : []),
])
const learningLinks = computed(() => [
  { to: '/student/classes', key: 'myClasses', icon: LayoutDashboard },
  { to: '/student/workspace', key: 'workspace', icon: CodeXml },
  { to: '/student/history', key: 'history', icon: Monitor },
])
const adminLinks = computed(() => [
  { to: '/admin/health', key: 'adminOverview', icon: LayoutDashboard },
  { to: '/admin/teachers', key: 'adminAccounts', icon: Users },
  { to: '/admin/classrooms', key: 'adminClassrooms', icon: BookOpen },
  { to: '/admin/classes', key: 'adminAssign', icon: GraduationCap },
  { to: '/admin/settings', key: 'adminConfig', icon: Settings2 },
  { to: '/admin/tasks', key: 'adminTasks', icon: Monitor },
  { to: '/admin/backups', key: 'adminBackups', icon: ShieldCheck },
])
interface NavLink {
  to: string
  key: string
  icon: unknown
}
const navGroups = computed(() => {
  const groups: { title: string; links: NavLink[] }[] = []
  if (currentUser.value?.role === 'admin')
    groups.push({ title: t('shell.groups.admin'), links: adminLinks.value })
  if (role.value !== 'admin' || activeClassroom.value.id) {
    if (workspaceRole.value === 'teacher')
      groups.push({ title: t('shell.groups.teaching'), links: teachingLinks.value })
    if (workspaceRole.value === 'student' || classroomRole.value === 'ta')
      groups.push({ title: t('shell.groups.learning'), links: learningLinks.value })
  }
  return groups
})
const links = computed(() => navGroups.value.flatMap((group) => group.links))
const sectionTitle = computed(() => {
  const current = links.value.find((x) => route.path.startsWith(x.to))
  if (current) return t(`shell.nav.${current.key}`)
  if (route.path === '/guide') return t('shell.section.guide')
  if (route.path.includes('/students/')) return t('shell.section.studentDetail')
  return t('shell.nav.myClasses')
})
async function signOut() {
  if (signingOut.value) return
  signingOut.value = true
  try {
    await logout()
    roleMenu.value = false
    await router.push('/login')
  } catch (e) {
    reportError(e)
  } finally {
    signingOut.value = false
  }
}
</script>
<template>
  <div class="app-shell">
    <Button
      v-if="mobileOpen"
      variant="plain"
      class="sidebar-scrim"
      :aria-label="t('shell.aria.closeNav')"
      @click="mobileOpen = false" />
    <aside class="sidebar" :class="{ 'mobile-open': mobileOpen }">
      <RouterLink to="/" class="brand">
        <img class="brand-symbol" src="/brand/icon.png" alt="" />
        <span>
          Codemia
          <span class="brand-sub">{{ t('shell.brand.sub') }}</span>
        </span>
      </RouterLink>
      <Button
        variant="plain"
        class="icon-button mobile-close"
        :aria-label="t('shell.aria.closeMenu')"
        @click="mobileOpen = false">
        <X :size="18" />
      </Button>
      <div v-if="role === 'admin'" class="class-switch class-switch-static">
        <span class="class-icon"><ShieldCheck :size="19" /></span>
        <span>
          {{ t('shell.adminWorkbench.title') }}
          <small>{{ t('shell.adminWorkbench.sub') }}</small>
        </span>
      </div>
      <DropdownMenuRoot v-else>
        <DropdownMenuTrigger as-child>
          <Button
            variant="plain"
            type="button"
            class="class-switch"
            :aria-label="t('shell.classSwitch.label')"
            :disabled="switchingClass"
            :data-disabled-reason="t('shell.classSwitch.switchingReason')"
            :aria-busy="switchingClass">
            <span class="class-icon"><GraduationCap :size="19" /></span>
            <span>
              {{ activeClassroom.name }}
              <small>
                {{
                  switchingClass
                    ? t('shell.classSwitch.switching')
                    : activeClassroom.id
                      ? activeClassroom.status
                      : t('shell.classSwitch.createOrJoin')
                }}
              </small>
            </span>
            <ChevronDown :size="14" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuPortal>
          <DropdownMenuContent
            class="ui-menu-content class-switch-menu"
            align="start"
            :side-offset="6"
            :collision-padding="12">
            <DropdownMenuLabel class="class-switch-caption">
              {{ t('shell.classSwitch.label') }}
            </DropdownMenuLabel>
            <DropdownMenuItem
              v-for="classroom in availableClassrooms"
              :key="classroom.id"
              class="ui-menu-item class-switch-option"
              :aria-current="classroom.id === activeClassroom.id ? 'true' : undefined"
              @select="switchClass(classroom.id)">
              <span>
                {{ classroom.name }}
                <small>{{ statusLabel(classroom.status) }}</small>
              </span>
              <Check
                v-if="classroom.id === activeClassroom.id"
                :size="16"
                :aria-label="t('shell.classSwitch.current')" />
            </DropdownMenuItem>
            <p v-if="!availableClassrooms.length" class="class-switch-caption">
              {{ t('shell.classSwitch.none') }}
            </p>
            <DropdownMenuSeparator class="class-switch-separator" />
            <DropdownMenuItem class="ui-menu-item" @select="router.push(classesPath)">
              <LayoutDashboard :size="16" />
              {{ t('shell.classSwitch.viewAll') }}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenuPortal>
      </DropdownMenuRoot>
      <template v-for="group in navGroups" :key="group.title">
        <div class="nav-caption">{{ group.title }}</div>
        <nav>
          <RouterLink
            v-for="link in group.links"
            :key="link.to"
            :to="link.to"
            class="nav-item"
            :class="{
              active:
                route.path.startsWith(link.to) ||
                (link.to === '/teacher/overview' && route.path.includes('/students/')),
            }"
            @click="mobileOpen = false">
            <component :is="link.icon" :size="18" />
            <span>{{ t(`shell.nav.${link.key}`) }}</span>
            <div
              v-if="link.key === 'teach'"
              style="margin-left: auto; display: inline-flex; align-items: center">
              <ArrowUpRight :size="18" />
            </div>
            <span v-if="link.key === 'overview' && counts.help" class="nav-count">
              {{ counts.help }}
            </span>
          </RouterLink>
        </nav>
      </template>
      <div class="sidebar-bottom">
        <Button variant="plain" class="nav-item w-full" @click="startUserGuide">
          <HelpCircle :size="18" />
          {{ t('shell.menu.guide') }}
        </Button>
        <DropdownMenuRoot v-model:open="roleMenu" :modal="false">
          <div class="profile-wrap">
            <DropdownMenuTrigger as-child>
              <Button variant="plain" class="profile" :aria-label="t('shell.menu.account')">
                <span class="avatar">{{ currentUser?.name.slice(-1) ?? '' }}</span>
                <span>
                  {{ currentUser?.name ?? '' }}
                  <small>
                    {{
                      role === 'admin'
                        ? t('shell.roles.platformAdmin')
                        : classroomRole === 'ta'
                          ? t('shell.roles.ta')
                          : role === 'teacher'
                            ? t('shell.roles.teacher')
                            : t('shell.roles.student')
                    }}
                  </small>
                </span>
                <Ellipsis :size="15" />
              </Button>
            </DropdownMenuTrigger>
          </div>
          <DropdownMenuPortal>
            <DropdownMenuContent
              class="ui-menu-content role-menu"
              side="top"
              align="start"
              :side-offset="8"
              :collision-padding="12">
              <DropdownMenuLabel class="account-menu-label">
                {{ currentUser?.username }}
              </DropdownMenuLabel>
              <DropdownMenuItem as-child>
                <RouterLink to="/teacher/classes" class="ui-menu-item">
                  <LayoutDashboard :size="14" />
                  {{ t('shell.menu.myClasses') }}
                </RouterLink>
              </DropdownMenuItem>
              <DropdownMenuItem v-if="currentUser?.role === 'admin'" as-child>
                <RouterLink to="/admin/health" class="ui-menu-item">
                  <ShieldCheck :size="14" />
                  {{ t('shell.menu.platformAdmin') }}
                </RouterLink>
              </DropdownMenuItem>
              <DropdownMenuSeparator class="class-switch-separator" />
              <DropdownMenuItem
                class="ui-menu-item"
                data-guide="account-open"
                @select="openAccount">
                <KeyRound :size="14" />
                {{ t('shell.menu.accountPassword') }}
              </DropdownMenuItem>
              <DropdownMenuItem
                class="ui-menu-item"
                data-guide="sign-out"
                :disabled="signingOut"
                @select.prevent="signOut">
                <LogOut :size="14" />
                {{ signingOut ? t('shell.menu.signingOut') : t('shell.menu.signOut') }}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenuPortal>
        </DropdownMenuRoot>
      </div>
    </aside>
    <div
      class="shell-main"
      :class="{ 'exercise-management-shell': route.path === '/teacher/exercises' }">
      <header class="topbar">
        <div class="breadcrumbs">
          <Button
            variant="plain"
            class="icon-button menu-button"
            :aria-label="t('shell.aria.openNav')"
            @click="mobileOpen = true">
            <Menu :size="19" />
          </Button>
          <PanelLeftClose :size="17" class="desktop-only muted" />
          <span>
            {{
              role === 'admin'
                ? t('shell.breadcrumb.admin')
                : role === 'student'
                  ? t('shell.breadcrumb.student')
                  : t('shell.breadcrumb.myClasses')
            }}
          </span>
          <ChevronRight :size="13" />
          <strong>{{ sectionTitle }}</strong>
        </div>
        <div class="topbar-right">
          <ThemeToggle />
          <LanguageToggle />
          <span class="demo-tag" :class="{ disconnected: connectionState !== 'connected' }">
            {{
              connectionState === 'connected'
                ? t('shell.connection.connected')
                : connectionState === 'expired'
                  ? t('shell.connection.expired')
                  : t('shell.connection.disconnected')
            }}
          </span>
          <span class="desktop-only muted">
            {{ role === 'admin' ? t('shell.topbar.adminTag') : t('shell.topbar.dataTag') }}
          </span>
        </div>
      </header>
      <Alert
        v-if="connectionState === 'disconnected'"
        class="app-alert--banner"
        role="alert"
        type="warning">
        <span>{{ t('shell.connection.banner') }}</span>
      </Alert>
      <main class="page-content"><slot /></main>
    </div>
  </div>
  <AccountDialog v-model:open="accountOpen" />
</template>
