<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { CodeXml, ArrowRight, ShieldCheck } from '@lucide/vue'
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
async function submit() {
  error.value = ''
  busy.value = true
  try {
    if (mode.value === 'recover') {
      await api('/auth/recover', 'POST', { username: username.value })
      done.value = true
      return
    }
    if (mode.value === 'join') {
      const r = await api<{ status: string }>('/classes/join', 'POST', { code: code.value })
      notify(r.status === 'active' ? '你已在课堂中' : '申请已发送，等待教师审批')
      done.value = true
      return
    }
    await login(username.value, password.value)
    const to = String(
      route.query.redirect ??
        (currentUser.value?.role === 'admin'
          ? '/admin/health'
          : `/${currentUser.value?.role}/classes`),
    )
    await router.push(to.startsWith('/') && !to.startsWith('//') ? to : '/')
  } catch (e) {
    error.value = e instanceof Error ? e.message : '请求失败'
  } finally {
    busy.value = false
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
                ? '入班申请已提交。批准后课堂会出现在你的课堂列表。'
                : '恢复申请已记录，请联系平台管理员。'
            }}
          </p>
          <Button @click="router.push(mode === 'join' ? '/student/classes' : '/login')">{{
            mode === 'join' ? '我的课堂' : '返回登录'
          }}</Button></template
        >
        <form v-else class="form-stack" @submit.prevent="submit">
          <label v-if="mode === 'join'"
            >课堂码<input v-model="code" required maxlength="30" /></label
          ><template v-else
            ><label
              >账号<input
                v-model="username"
                required
                autocomplete="username"
                maxlength="80" /></label
            ><label v-if="mode === 'login'"
              >密码<input
                v-model="password"
                type="password"
                required
                autocomplete="current-password"
                maxlength="200" /></label
          ></template>
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
        </form>
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
