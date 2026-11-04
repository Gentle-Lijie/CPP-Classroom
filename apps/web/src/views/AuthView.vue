<script setup lang="ts">
import { useActionFeedback } from '@/composables/useActionFeedback'
import { Alert } from '@/components/ui/alert'
import ThemeToggle from '@/components/classroom/ThemeToggle.vue'
import { Form } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowRight, ShieldCheck, Eye, EyeOff } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { login, homePath, notify } from '@/data/demo'
import { api } from '@/lib/api'
import { useI18n } from 'vue-i18n'
const { t } = useI18n()
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
      notify(t('auth.recoverNotified'))
      return
    }
    if (activeMode === 'join') {
      const r = await api<{ status: string; id: string }>('/classes/join', 'POST', {
        code: code.value,
      })
      if (token !== generation) return
      joinStatus.value = r.status
      joinedId.value = r.id
      notify(r.status === 'active' ? t('auth.alreadyJoined') : t('auth.joinSent'))
      done.value = true
      return
    }
    await login(username.value, password.value)
    if (token !== generation) return
    const to = String(route.query.redirect ?? homePath())
    await router.push(to.startsWith('/') && !to.startsWith('//') ? to : '/')
  } catch (e) {
    if (token !== generation) return
    error.value = e instanceof Error ? e.message : t('auth.requestFailed')
  } finally {
    if (token === generation) busy.value = false
  }
}
useActionFeedback(error)
</script>
<template>
  <main class="auth-page">
    <section class="auth-story">
      <RouterLink to="/" class="brand">
        <img class="brand-symbol" src="/brand/icon.png" alt="" />
        <span>
          Codemia
          <span class="brand-sub">{{ t('auth.brandSub') }}</span>
        </span>
      </RouterLink>
      <div class="auth-story-copy">
        <span class="auth-story-label">Codemia</span>
        <h1>{{ t('auth.storyTitle') }}</h1>
        <div class="auth-code-art">
          <div class="art-window-dots">
            <i />
            <i />
            <i />
            <span>hello_world.cpp</span>
          </div>
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
    </section>
    <section class="auth-main">
      <div class="auth-theme"><ThemeToggle /></div>
      <div class="auth-form-container">
        <h2>
          {{
            mode === 'join'
              ? t('auth.titleJoin')
              : mode === 'recover'
                ? t('auth.titleRecover')
                : t('auth.titleLogin')
          }}
        </h2>
        <p class="auth-intro">
          {{
            mode === 'join'
              ? t('auth.introJoin')
              : mode === 'recover'
                ? t('auth.introRecover')
                : t('auth.introLogin')
          }}
        </p>
        <div v-if="done" class="auth-result">
          <Button
            @click="
              router.push(
                mode === 'join' && joinStatus === 'active'
                  ? '/student/classes?classroom=' + joinedId
                  : mode === 'join'
                    ? '/student/classes'
                    : '/login',
              )
            ">
            {{
              mode === 'join'
                ? joinStatus === 'active'
                  ? t('auth.enterClasses')
                  : t('auth.viewJoinStatus')
                : t('auth.backLogin')
            }}
          </Button>
        </div>
        <Form v-else class="form-stack" @submit.prevent="submit">
          <label v-if="mode === 'join'">
            {{ t('auth.codeLabel') }}
            <Input v-model="code" required maxlength="30" />
          </label>
          <template v-else>
            <label>
              {{ t('auth.usernameLabel') }}
              <Input v-model="username" required autocomplete="username" maxlength="80" />
            </label>
            <label v-if="mode === 'login'">
              {{ t('auth.passwordLabel') }}
              <div class="password-field">
                <Input
                  v-model="password"
                  :type="showPassword ? 'text' : 'password'"
                  required
                  autocomplete="current-password"
                  maxlength="200"
                  @keyup="capsLock = $event.getModifierState('CapsLock')" />
                <Button
                  variant="plain"
                  type="button"
                  class="icon-button"
                  :aria-label="showPassword ? t('auth.hidePassword') : t('auth.showPassword')"
                  @click="showPassword = !showPassword">
                  <EyeOff v-if="showPassword" :size="18" />
                  <Eye v-else :size="18" />
                </Button>
              </div>
            </label>
          </template>
          <Alert v-if="capsLock && mode === 'login'" role="status" type="warning">
            {{ t('auth.capsLock') }}
          </Alert>

          <Button
            type="submit"
            :disabled="busy"
            :data-disabled-reason="
              mode === 'login'
                ? t('auth.loginReason')
                : mode === 'join'
                  ? t('auth.joinReason')
                  : t('auth.recoverReason')
            ">
            {{
              busy
                ? t('auth.processing')
                : mode === 'join'
                  ? t('auth.joinBtn')
                  : mode === 'recover'
                    ? t('auth.recoverBtn')
                    : t('auth.loginBtn')
            }}
            <ArrowRight />
          </Button>
        </Form>
        <div class="auth-bottom-link">
          <RouterLink v-if="mode === 'login'" to="/recover">{{ t('auth.forgot') }}</RouterLink>
          <RouterLink
            v-else
            :to="mode === 'join' ? '/student/classes' : '/login'"
            data-guide="join-back">
            {{ mode === 'join' ? t('auth.backClasses') : t('auth.backLogin') }}
          </RouterLink>
        </div>
        <Alert type="info" :icon="ShieldCheck">
          <span>{{ t('auth.privacyNotice') }}</span>
        </Alert>
      </div>
    </section>
  </main>
</template>
