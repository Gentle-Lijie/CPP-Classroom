<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  CodeXml,
  ArrowRight,
  ArrowLeft,
  Eye,
  EyeOff,
  GraduationCap,
  CircleAlert,
  ShieldCheck,
  Check,
} from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { activeClassroom, demo, notify } from '@/data/demo'
const route = useRoute()
const router = useRouter()
const mode = computed(() =>
  route.path === '/join' ? 'join' : route.path === '/recover' ? 'recover' : 'login',
)
const role = ref('teacher')
const username = ref('')
const password = ref('')
const visible = ref(false)
const name = ref('')
const number = ref('')
const code = ref(String(route.query.code ?? ''))
const consent = ref(false)
const state = ref(String(route.query.state ?? '正常'))
const error = ref('')
const done = ref(false)
watch(mode, () => {
  error.value = ''
  done.value = false
  state.value = '正常'
})
function submit() {
  error.value = ''
  if (state.value !== '正常') {
    error.value =
      state.value === '邀请过期'
        ? '此邀请已过期，请联系教师获取新的邀请链接。'
        : state.value === '课堂关闭'
          ? '课堂暂时关闭，请等待教师重新开放。'
          : state.value === '未获授权'
            ? '当前账号尚未获得课堂访问权限，请联系教师。'
            : state.value === '登录失败'
              ? '账号或密码不正确，请检查后重试。'
              : '登录会话已过期，请重新登录。'
    return
  }
  if (mode.value === 'recover' || mode.value === 'join') {
    done.value = true
    return
  }
  demo.role = role.value
  notify('已进入演示工作台，未进行真实身份验证')
  router.push(
    role.value === 'teacher'
      ? '/teacher/classes'
      : role.value === 'student'
        ? '/student/classes'
        : '/admin/health',
  )
}
</script>
<template>
  <main class="auth-page">
    <section class="auth-story">
      <RouterLink to="/" class="brand"
        ><span class="brand-symbol"><CodeXml :size="25" /></span
        ><span>码上课堂<span class="brand-sub">C++ Classroom</span></span></RouterLink
      >
      <div class="auth-story-copy">
        <span class="auth-story-label">C++ Classroom</span>
        <h1>C++ 编程教室</h1>
        <p>课堂练习、在线编辑与教师巡视。</p>
        <div class="auth-code-art">
          <div class="art-window-dots"><i /><i /><i /><span>hello_world.cpp</span></div>
          <div class="art-code">
            <p>
              <span class="art-line">1</span><span class="art-purple">#include</span>&nbsp;
              <span class="art-gold">&lt;iostream&gt;</span>
            </p>
            <p><span class="art-line">2</span></p>
            <p>
              <span class="art-line">3</span><span class="art-purple">int</span>&nbsp;
              <span class="art-green">main</span>() {
            </p>
            <p>
              <span class="art-line">4</span>&nbsp;&nbsp;std::cout &lt;&lt;
              <span class="art-gold">"Hello, world!"</span>;
            </p>
            <p>
              <span class="art-line">5</span>&nbsp;&nbsp;<span class="art-purple">return</span
              >&nbsp; <span class="art-gold">0</span>;
            </p>
            <p><span class="art-line">6</span>}</p>
          </div>
          <div class="art-output">
            <span>output</span>
            <p>Hello, world!<span class="code-caret" /></p>
            <span class="art-code-check"><Check :size="13" />hello_world.cpp · 示例</span>
          </div>
        </div>
      </div>
      <footer>为 C++ 教学而设计 <span>浏览器即教室</span></footer>
    </section>
    <section class="auth-main">
      <div class="auth-top">
        <span class="demo-tag">前端原型 · 无真实登录</span
        ><RouterLink to="/guide">浏览全部界面<ArrowRight :size="14" /></RouterLink>
      </div>
      <div class="auth-form-container">
        <template v-if="done"
          ><div class="auth-success-icon"><Check :size="28" /></div>
          <h2>{{ mode === 'join' ? '入班申请已准备好' : '找回账号申请已记录' }}</h2>
          <p class="auth-intro">
            {{
              mode === 'join'
                ? '前端演示：真实流程需教师审批。可继续预览学生工作台。'
                : '前端演示未发送邮件。真实账号恢复流程需后端接入。'
            }}
          </p>
          <Button
            class="w-full"
            @click="router.push(mode === 'join' ? '/student/classes' : '/login')"
            >{{ mode === 'join' ? '预览我的课堂' : '返回登录' }}<ArrowRight /></Button
        ></template>
        <template v-else
          ><RouterLink v-if="mode !== 'login'" to="/login" class="back-link"
            ><ArrowLeft :size="15" />返回登录</RouterLink
          >
          <h2>
            {{ mode === 'join' ? '加入课堂' : mode === 'recover' ? '找回账号' : '登录码上课堂' }}
          </h2>
          <p class="auth-intro">
            {{
              mode === 'join'
                ? '确认课堂信息，登记姓名与学号。'
                : mode === 'recover'
                  ? '提交账号信息，由平台管理员协助恢复。'
                  : '登录你的工作台，继续今天的教与学。'
            }}
          </p>
          <div v-if="mode === 'join'" class="auth-class-info">
            <GraduationCap :size="24" />
            <div>
              <strong>{{ activeClassroom.name }}</strong>
              <p>授课教师：周老师 · 2026 秋季学期</p>
            </div>
          </div>
          <div v-if="mode === 'login'" class="segmented auth-role">
            <button
              v-for="r in [
                { id: 'teacher', label: '我是教师' },
                { id: 'student', label: '我是学生' },
                { id: 'admin', label: '管理员' },
              ]"
              :key="r.id"
              :class="{ selected: role === r.id }"
              @click="role = r.id"
            >
              {{ r.label }}
            </button>
          </div>
          <form class="form-stack" @submit.prevent="submit">
            <template v-if="mode === 'join'"
              ><label>课堂码<input v-model="code" required placeholder="请输入课堂码" /></label>
              <div class="form-grid">
                <label
                  >姓名<input
                    v-model="name"
                    required
                    placeholder="你的真实姓名"
                    maxlength="20" /></label
                ><label
                  >学号<input v-model="number" required placeholder="教师分配的学号" maxlength="30"
                /></label>
              </div>
              <label class="consent"
                ><input v-model="consent" type="checkbox" required /><span
                  >我已知晓：本课堂内的教师可以查看我的代码和运行记录，用于课堂辅导。</span
                ></label
              ></template
            ><template v-else
              ><label
                >{{ mode === 'recover' ? '账号 / 邮箱' : '账号'
                }}<input
                  v-model="username"
                  autocomplete="username"
                  required
                  placeholder="输入教师分配的账号" /></label
              ><label v-if="mode === 'login'"
                >密码
                <div class="password-field">
                  <input
                    v-model="password"
                    :type="visible ? 'text' : 'password'"
                    autocomplete="current-password"
                    required
                    placeholder="输入你的密码"
                  /><button
                    type="button"
                    class="icon-button"
                    :aria-label="visible ? '隐藏密码' : '显示密码'"
                    @click="visible = !visible"
                  >
                    <EyeOff v-if="visible" :size="17" /><Eye v-else :size="17" />
                  </button></div
              ></label>
              <div v-if="mode === 'login'" class="login-options">
                <label class="inline-items"><input type="checkbox" />保持登录（示例）</label
                ><RouterLink to="/recover">忘记密码？</RouterLink>
              </div></template
            >
            <div v-if="error" role="alert" class="error-box">
              <CircleAlert :size="17" />{{ error }}
            </div>
            <Button type="submit" class="auth-submit"
              >{{
                mode === 'join'
                  ? '申请加入课堂'
                  : mode === 'recover'
                    ? '提交恢复申请'
                    : '进入演示工作台'
              }}<ArrowRight
            /></Button>
          </form>
          <p v-if="mode === 'login'" class="auth-bottom-link">
            收到了课堂邀请？<RouterLink to="/join">通过课堂码加入</RouterLink>
          </p>
          <div class="auth-safety">
            <ShieldCheck :size="14" /><span>{{
              mode === 'join'
                ? '已有平台身份后入班 · 此处仅展示登记流程'
                : '账号由教师或管理员分配，不开放自行注册教师身份'
            }}</span>
          </div></template
        >
        <div class="auth-state-preview">
          <label
            >异常状态预览<select v-model="state">
              <option>正常</option>
              <option v-if="mode === 'join'">邀请过期</option>
              <option v-if="mode === 'join'">课堂关闭</option>
              <option>未获授权</option>
              <option v-if="mode === 'login'">登录失败</option>
              <option>会话过期</option>
            </select></label
          >
        </div>
      </div>
      <footer class="auth-footer">C++ Classroom · 前端设计原型</footer>
    </section>
  </main>
</template>
