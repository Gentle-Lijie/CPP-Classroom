<script setup lang="ts">
import ThemeToggle from '@/components/classroom/ThemeToggle.vue'
import { Form } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { CodeXml, ArrowRight, ShieldCheck, Eye, EyeOff } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { login, currentUser, notify } from '@/data/demo'
import { api } from '@/lib/api'
const route = useRoute(),
  router = useRouter()
const mode = computed(() =>
  route.path === '/join' ? 'join' : route.path === '/recover' ? 'recover' : 'login',
)
const username = ref(''),
  password = ref(''),
  code = ref(String(route.query.code ?? '')),
  error = ref(''),
  done = ref(false),
  busy = ref(false)
const capsLock = ref(false)
const showPassword = ref(false),
  joinStatus = ref('pending'),
  joinedId = ref('')
let generation = 0
watch(
  () => route.fullPath,
  () => {
    generation++
    error.value = ''
    done.value = false
    busy.value = false
    password.value = ''
    showPassword.value = false
    code.value = String(route.query.code ?? '')
  },
)
async function submit() {
  if (busy.value) return
  const token = generation,
    activeMode = mode.value
  error.value = ''
  busy.value = true
  try {
    if (activeMode === 'recover') {
      await api('/auth/recover', 'POST', { username: username.value })
      if (token !== generation) return
      done.value = true
      return
    }
    if (activeMode === 'join') {
      const r = await api<{ status: string; id: string }>('/classes/join', 'POST', {
        code: code.value,
      })
      if (token !== generation) return
      joinStatus.value = r.status
      joinedId.value = r.id
      notify(r.status === 'active' ? '你已在课堂中' : '申请已发送，等待教师审批')
      done.value = true
      return
    }
    await login(username.value, password.value)
    if (token !== generation) return
    const to = String(
      route.query.redirect ??
        (currentUser.value?.role === 'admin'
          ? '/admin/health'
          : `/${currentUser.value?.role}/classes`),
    )
    await router.push(to.startsWith('/') && !to.startsWith('//') ? to : '/')
  } catch (e) {
    if (token !== generation) return
    error.value = e instanceof Error ? e.message : '请求失败'
  } finally {
    if (token === generation) busy.value = false
  }
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
        <p>课堂练习、在线编译与教师巡视。</p>
        <div class="auth-code-art">
          <div class="art-window-dots"><i /><i /><i /><span>hello_world.cpp</span></div>
          <pre class="art-code">
#include &lt;iostream&gt;

int main() {
    std::cout &lt;&lt; "Hello, world!";
    return 0;
}</pre>
          <div class="art-output">
            <span>output</span>
            <p>Hello, world!</p>
          </div>
        </div>
      </div>
      <footer>为 C++ 教学而设计<span>浏览器即教室</span></footer>
    </section>
    <section class="auth-main">
      <div class="auth-theme"><ThemeToggle /></div>
      <div class="auth-form-container">
        <h2>
          {{ mode === 'join' ? '加入课堂' : mode === 'recover' ? '账号恢复' : '登录码上课堂' }}
        </h2>
        <p class="auth-intro">
          {{
            mode === 'join'
              ? '使用当前账号申请入班，教师审批后即可访问。'
              : mode === 'recover'
                ? '记录申请后，请联系管理员核实身份并重设密码。'
                : '账号由教师或平台管理员分配。'
          }}
        </p>
        <template v-if="done"
          ><p class="info-box">
            {{
              mode === 'join'
                ? joinStatus === 'active'
                  ? '你已经是课堂成员，可以直接进入课堂。'
                  : '入班申请已提交。课堂列表会显示待审批状态，请等待教师处理。'
                : '恢复申请已记录，请联系平台管理员。'
            }}
          </p>
          <Button
            @click="
              router.push(
                mode === 'join' && joinStatus === 'active'
                  ? '/student/classes?classroom=' + joinedId
                  : mode === 'join'
                    ? '/student/classes'
                    : '/login',
              )
            "
            >{{
              mode === 'join'
                ? joinStatus === 'active'
                  ? '进入课堂列表'
                  : '查看申请状态'
                : '返回登录'
            }}</Button
          ></template
        >
        <Form v-else class="form-stack" @submit.prevent="submit">
          <label v-if="mode === 'join'"
            >课堂码<Input v-model="code" required maxlength="30" /></label
          ><template v-else
            ><label
              >账号<Input
                v-model="username"
                required
                autocomplete="username"
                maxlength="80" /></label
            ><label v-if="mode === 'login'"
              >密码
              <div class="password-field">
                <Input
                  v-model="password"
                  :type="showPassword ? 'text' : 'password'"
                  required
                  autocomplete="current-password"
                  maxlength="200"
                  @keyup="capsLock = $event.getModifierState('CapsLock')"
                /><Button
                  variant="plain"
                  type="button"
                  class="icon-button"
                  :aria-label="showPassword ? '隐藏密码' : '显示密码'"
                  @click="showPassword = !showPassword"
                >
                  <EyeOff v-if="showPassword" :size="18" /><Eye v-else :size="18" />
                </Button></div></label
          ></template>
          <p v-if="capsLock && mode === 'login'" class="warning-box" role="status">
            大写锁定已开启，请核对密码大小写。
          </p>
          <p v-if="error" class="error-box" role="alert">{{ error }}</p>
          <Button type="submit" :disabled="busy"
            >{{
              busy
                ? '处理中…'
                : mode === 'join'
                  ? '申请加入'
                  : mode === 'recover'
                    ? '记录恢复申请'
                    : '登录工作台'
            }}<ArrowRight
          /></Button>
        </Form>
        <div class="auth-bottom-link">
          <RouterLink v-if="mode === 'login'" to="/recover">忘记密码</RouterLink
          ><RouterLink v-else to="/login">返回登录</RouterLink>
        </div>
        <p class="auth-safety">
          <ShieldCheck :size="14" />课堂教师可查看学生代码和运行记录，用于教学辅导。
        </p>
      </div>
      <footer class="auth-footer">C++ Classroom · 原生 Linux 编译环境</footer>
    </section>
  </main>
</template>
