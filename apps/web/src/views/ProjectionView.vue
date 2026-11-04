<script setup lang="ts">
import PythonBeta from '@/components/classroom/PythonBeta.vue'
import { sourceLanguage } from '@/lib/source-language'
import { Alert } from '@/components/ui/alert'
import ThemeToggle from '@/components/classroom/ThemeToggle.vue'
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, Monitor, Minus, Plus, Maximize, CodeXml, RefreshCw } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import CodeEditor from '@/components/classroom/CodeEditor.vue'
import RunOutput from '@/components/classroom/RunOutput.vue'
import { demo, notify, type RunRecord } from '@/data/demo'
import { api, ApiError } from '@/lib/api'
import { confirmAction } from '@/lib/confirm'
const route = useRoute(),
  router = useRouter()
const { t, locale } = useI18n()
const size = ref(23),
  showOutput = ref(true),
  loading = ref(true),
  busy = ref(false),
  error = ref(''),
  expired = ref(false)
type Projection = Partial<RunRecord> & {
  title: string
  code: string
  language?: 'cpp' | 'python'
  filename: string
  kind: 'draft' | 'run' | 'submission'
  createdAt?: string
}
const snapshot = ref<Projection>()
const path =
  '/classes/' + String(route.query.class ?? demo.classroomId) + '/projections/' + route.params.id
let pending = false,
  disposed = false
async function load() {
  if (pending || expired.value) return
  pending = true
  try {
    const result = await api<Projection>(path)
    if (!disposed) {
      snapshot.value = {
        ...result,
        kind: result.kind ?? (result.status ? 'run' : 'draft'),
        time: result.time ?? result.createdAt,
      }
      error.value = ''
    }
  } catch (e) {
    if (disposed) return
    if (e instanceof ApiError && [404, 403, 401].includes(e.status)) {
      expired.value = true
      snapshot.value = undefined
      error.value = e.message
    } else error.value = t('teaching.projection.connectionLost')
  } finally {
    pending = false
    if (!disposed) loading.value = false
  }
}
function retry() {
  expired.value = false
  loading.value = true
  void load()
}
onMounted(() => void load())
const poll = setInterval(() => {
  if (!document.hidden) void load()
}, 5000)
onBeforeUnmount(() => {
  disposed = true
  clearInterval(poll)
})
async function end() {
  if (busy.value || !(await confirmAction(t('teaching.projection.endConfirm')))) return
  busy.value = true
  try {
    await api(path + '/revoke', 'POST', {})
    await router.push('/teacher/overview')
  } catch (e) {
    error.value = e instanceof Error ? e.message : t('teaching.projection.revokeFailed')
  } finally {
    busy.value = false
  }
}
async function fullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen()
    else await document.documentElement.requestFullscreen()
  } catch {
    notify(t('teaching.messages.fullscreenBlocked'), 'error')
  }
}
</script>
<template>
  <main v-if="snapshot" class="projection-page">
    <header class="projection-header">
      <Button
        variant="outline"
        :disabled="busy"
        :data-disabled-reason="t('teaching.projection.revokingReason')"
        @click="end">
        <ArrowLeft />
        {{ busy ? t('teaching.projection.revoking') : t('teaching.projection.endButton') }}
      </Button>
      <div class="projection-mark">
        <Monitor />
        <strong>{{ t('teaching.projection.mark') }}</strong>
      </div>
      <div class="inline-items">
        <ThemeToggle />
        <Button
          variant="outline"
          :disabled="size <= 16"
          :data-disabled-reason="t('teaching.font.min', { size: 16 })"
          :aria-label="t('teaching.projection.zoomOut')"
          @click="size = Math.max(16, size - 2)">
          <Minus />
        </Button>
        <span>{{ size }} px</span>
        <Button
          variant="outline"
          :disabled="size >= 38"
          :data-disabled-reason="t('teaching.font.max', { size: 38 })"
          :aria-label="t('teaching.projection.zoomIn')"
          @click="size = Math.min(38, size + 2)">
          <Plus />
        </Button>
        <Button @click="fullscreen">
          <Maximize />
          {{ t('teaching.projection.fullscreen') }}
        </Button>
      </div>
    </header>
    <Alert v-if="error" role="status" type="warning">
      {{ error }}

      <template #actions>
        <Button variant="outline" size="sm" @click="retry">
          <RefreshCw />
          {{ t('teaching.projection.retryConnect') }}
        </Button>
      </template>
    </Alert>
    <div class="projection-title">
      <div>
        <h1>{{ snapshot.title }}</h1>
        <p>
          {{
            snapshot.kind === 'run'
              ? t('teaching.projection.kindRun')
              : snapshot.kind === 'submission'
                ? t('teaching.projection.kindSubmission')
                : t('teaching.projection.kindDraft')
          }}
          <span v-if="snapshot.createdAt">
            · {{ new Date(snapshot.createdAt).toLocaleString(locale) }}
          </span>
        </p>
      </div>
      <Button v-if="snapshot.kind === 'run'" variant="outline" @click="showOutput = !showOutput">
        {{ showOutput ? t('teaching.projection.hideOutput') : t('teaching.projection.showOutput') }}
      </Button>
    </div>
    <div class="projection-body" :class="{ 'code-only': !showOutput || snapshot.kind !== 'run' }">
      <section class="panel projection-code">
        <div class="code-toolbar">
          <CodeXml />
          {{ snapshot.filename }}
          <PythonBeta v-if="sourceLanguage(snapshot) === 'python'" />
          <span class="muted ml-auto">{{ t('teaching.projection.readonly') }}</span>
        </div>
        <CodeEditor
          :model-value="snapshot.code"
          :language="sourceLanguage(snapshot)"
          :filename="snapshot.filename"
          :font-size="size"
          readonly />
      </section>
      <aside v-if="showOutput && snapshot.kind === 'run'" class="projection-results">
        <RunOutput :run="snapshot as RunRecord" readonly-context />
      </aside>
    </div>
  </main>
  <div v-else class="empty-state">
    <Monitor :size="32" />
    <h2>
      {{
        loading
          ? t('teaching.projection.loading')
          : expired
            ? t('teaching.projection.expired')
            : t('teaching.projection.unavailable')
      }}
    </h2>
    <Alert v-if="error" role="alert" type="error">{{ error }}</Alert>
    <Button v-if="!loading" variant="outline" @click="retry">
      {{ t('teaching.projection.reread') }}
    </Button>
    <RouterLink to="/teacher/overview">{{ t('teaching.projection.back') }}</RouterLink>
  </div>
</template>
<style scoped>
.projection-page {
  min-width: 0;
  min-height: 100dvh;
  padding-bottom: 24px;
}
.projection-header {
  gap: 16px;
}
.projection-mark {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  color: var(--ui-action);
}
.projection-mark strong {
  font-size: 16px;
}
.projection-title {
  flex-wrap: wrap;
}
.projection-title > div {
  min-width: 0;
}
.projection-title h1 {
  overflow-wrap: anywhere;
}
.projection-title p {
  font-size: 15px;
  line-height: 1.7;
}
.projection-body > * {
  min-width: 0;
}
.projection-code {
  height: max(400px, calc(100dvh - 250px));
  min-height: 400px;
}
.projection-results {
  max-height: max(400px, calc(100dvh - 250px));
  min-height: 0;
  overflow: hidden;
}
.projection-results :deep(.run-output) {
  min-height: 0;
}
@media (max-width: 900px) {
  .projection-body {
    grid-template-columns: minmax(0, 1fr);
  }
  .projection-results {
    height: 360px;
    max-height: 360px;
  }
}
@media (max-width: 760px) {
  .projection-header {
    padding: 16px;
  }
  .projection-title {
    padding: 24px 16px;
  }
  .projection-body {
    padding: 0 16px;
  }
  .projection-title h1 {
    font-size: 24px;
  }
  .projection-code {
    height: 480px;
    min-height: 360px;
  }
}
</style>
