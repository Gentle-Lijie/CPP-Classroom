<script setup lang="ts">
import { currentUser } from '@/data/demo'
</script>
<template>
  <section class="panel form-stack">
    <h1>码上课堂使用指南</h1>
    <p>使用教师或管理员分配的账号登录，服务器验证每次请求的课堂权限。</p>
    <template v-if="currentUser?.role === 'teacher'"
      ><h2>教师</h2>
      <ol>
        <li>创建课堂，在课堂设置中开放课堂。</li>
        <li>添加或导入学生，保存一次性显示的初始密码；也可审批已有账号的入班申请。</li>
        <li>创建并发布练习，设置推荐题目。</li>
        <li>巡视查看在线状态、求助和运行结果；详情每秒同步当前草稿和历史快照。</li>
        <li>固定快照可以匿名投屏，结束时撤销；提交与导出保留真实作品。</li>
        <li>归档关闭编辑和运行，保留作品和历史。</li>
      </ol>
      <RouterLink to="/teacher/classes">我的课堂 →</RouterLink></template
    ><template v-else-if="currentUser?.role === 'student'"
      ><h2>学生</h2>
      <ol>
        <li>进入已加入的课堂，或用教师提供的课堂码申请。</li>
        <li>编辑后等待“已同步到服务器”；断网时本机备份并自动重试。</li>
        <li>运行使用已保存的固定版本，之后修改不会改变旧结果。</li>
        <li>勾选运行时输入，可发送文本行、EOF 或停止。EOF 真正关闭 stdin。</li>
        <li>冲突时先下载本机修改，再读取服务器版本比较。</li>
        <li>提交保存不可变版本，求助发送给本课堂教师。</li>
      </ol>
      <RouterLink to="/student/classes">我的课堂 →</RouterLink></template
    ><template v-else
      ><h2>管理员</h2>
      <p>管理账号、核实恢复申请后重设密码、配置执行限额、查看失败任务与审计记录。</p>
      <p>备份使用原生 pg_dump，在独立临时数据库恢复验证，不覆盖现有数据。</p>
      <RouterLink to="/admin/health">平台概况 →</RouterLink></template
    >
  </section>
</template>
