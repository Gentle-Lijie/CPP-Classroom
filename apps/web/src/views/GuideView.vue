<script setup lang="ts">
import { ArrowUpRight, GraduationCap, CodeXml, ShieldCheck, Map, Check } from '@lucide/vue'
const groups = [
  {
    name: '教师端',
    icon: GraduationCap,
    description: '课堂准备、巡视与授课。',
    pages: [
      { name: '课堂列表', path: '/teacher/classes', detail: '创建、开放状态、归档作品' },
      { name: '课堂总览', path: '/teacher/overview', detail: '学生状态、搜索筛选、求助' },
      { name: '教师授课', path: '/teacher/teach', detail: 'PPT 式题面、样例、代码与对照视图' },
      {
        name: '在线巡视窗口',
        path: '/teacher/monitor',
        detail: '独立名册窗口，为学生分别打开详情窗口',
      },
      {
        name: '学生独立窗口',
        path: '/teacher/inspect/s01',
        detail: '多窗口只读查看代码与处理求助',
      },
      { name: '练习管理', path: '/teacher/exercises', detail: '题面、样例、初始代码、发布预览' },
      {
        name: '题目编辑页',
        path: '/teacher/exercises/e01/edit',
        detail: 'Markdown 实时预览、自定义源文件名',
      },
      { name: '学生名册', path: '/teacher/roster', detail: '导入、审批、移除与邀请' },
      { name: '学生详情', path: '/teacher/students/s01', detail: '只读草稿、运行快照、处理求助' },
      { name: '投屏讲解', path: '/projection/s01', detail: '匿名、字号、快照与结果切换' },
      { name: '提交与导出', path: '/teacher/submissions', detail: '固定提交、下载与批量导出' },
      { name: '课堂设置', path: '/teacher/settings', detail: '加入规则、环境、策略与归档' },
    ],
  },
  {
    name: '学生端',
    icon: CodeXml,
    description: '课堂练习、代码编辑与运行记录。',
    pages: [
      { name: '登录', path: '/login', detail: '角色入口、账号恢复、会话异常' },
      { name: '邀请入班', path: '/join?code=CPP2026', detail: '课堂确认、姓名学号、知情提示' },
      { name: '账号恢复', path: '/recover', detail: '恢复申请与演示结果' },
      { name: '我的课堂', path: '/student/classes', detail: '已加入、开放与归档状态' },
      { name: '练习工作区', path: '/student/workspace', detail: 'Monaco、输入输出、求助与提交' },
      { name: '运行历史', path: '/student/history', detail: '只读旧代码、原始诊断、下载' },
    ],
  },
  {
    name: '管理端',
    icon: ShieldCheck,
    description: '账号、环境与必要运维。',
    pages: [
      { name: '平台概况', path: '/admin/health', detail: '服务与节点健康设计' },
      { name: '教师账号', path: '/admin/teachers', detail: '添加、搜索、启用与停用' },
      {
        name: '平台配置',
        path: '/admin/settings',
        detail: '真实服务探活、go-judge 连接草稿与平台默认值',
      },
      { name: '失败任务', path: '/admin/tasks', detail: '平台失败与学生错误区分' },
      { name: '备份与记录', path: '/admin/backups', detail: '备份状态、恢复验证与管理记录' },
    ],
  },
]
</script>
<template>
  <div class="page-heading">
    <div>
      <div class="heading-meta"><Map :size="15" />可点击设计原型</div>
      <h1>界面导览</h1>
      <p>依据产品需求 v1.0 与组件选型 Spec，覆盖首版主要页面与状态。</p>
    </div>
  </div>
  <div class="guide-notice">
    <Check :size="19" />
    <div>
      <strong>前端界面原型</strong>
      <p>
        使用 Vue 3、TypeScript、shadcn-vue、Tailwind 与 Monaco。授课窗口在本机共享原型数据；支持
        Chrome / Edge 授权后读写学生工作目录。未实现真实认证、权限、远程同步、编译执行或 EOF。
      </p>
    </div>
  </div>
  <section v-for="g in groups" :key="g.name" class="guide-section">
    <div class="guide-section-heading">
      <component :is="g.icon" :size="22" />
      <h2>{{ g.name }}</h2>
      <p>{{ g.description }}</p>
    </div>
    <div class="guide-grid">
      <RouterLink v-for="p in g.pages" :key="p.path" :to="p.path"
        ><div>
          <h3>{{ p.name }}</h3>
          <p>{{ p.detail }}</p>
        </div>
        <ArrowUpRight :size="17"
      /></RouterLink>
    </div>
  </section>
  <div class="guide-note">
    <h3>还可以探索这些状态</h3>
    <p>
      登录页下方可选择异常场景；工作区底部可预览离线、保存失败和多标签页只读；「演示运行」提供成功、编译失败、交互输入、超时、资源超限和平台失败示例。
    </p>
  </div>
</template>
