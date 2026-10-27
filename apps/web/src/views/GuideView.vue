<script setup lang="ts">
import { Alert } from '@/components/ui/alert'
import { computed } from 'vue'
import { ArrowRight, ScanLine, BookOpen, Check, LockKeyhole } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { currentUser, demo, exercises } from '@/data/demo'
import {
  chapterAvailable,
  guideCatalog,
  roleLabels,
  type GuideChapter,
  type GuideRole,
} from '@/lib/guide-catalog'
import { guideVisits } from '@/lib/guide-visit'
import { startGuide } from '@/lib/spotlight'
const role = computed(() => (currentUser.value?.role ?? 'student') as GuideRole)
const chapters = computed(() => guideCatalog[role.value])
const available = (chapter: GuideChapter) =>
  chapterAvailable(chapter, !!demo.classroomId, exercises.length > 0)
const ready = computed(() => chapters.value.filter(available))
const count = computed(() =>
  chapters.value.reduce((total, chapter) => total + chapter.steps.length, 0),
)
function begin(chapter?: GuideChapter) {
  startGuide(role.value, chapter ? [chapter] : ready.value)
  if (currentUser.value) guideVisits.remember({ id: currentUser.value.id, role: role.value })
}
</script>
<template>
  <div class="guide-page">
    <div class="page-heading">
      <div>
        <div class="heading-meta">{{ roleLabels[role] }}工作台 · 使用导览</div>
        <h1>几步熟悉课堂工作流</h1>
        <p>跟随关键任务认识工作台，随时跳转或退出。</p>
      </div>
    </div>
    <section class="panel guide-intro">
      <div class="guide-intro-icon"><ScanLine :size="30" /></div>
      <div class="guide-intro-copy">
        <span class="guide-eyebrow">{{ roleLabels[role] }}专属导览</span>
        <h2>
          {{
            role === 'student'
              ? '用模拟工作区，试一遍编程流程'
              : role === 'teacher'
                ? '从准备课堂，到授课、巡视与作品管理'
                : '从平台状态，到账号、执行配置与备份'
          }}
        </h2>
        <p>共 {{ count }} 步，了解主要工作流程。也可以只看下面某个环节。</p>
        <div class="guide-assurances">
          <span><Check :size="14" />支持键盘切换</span
          ><span><Check :size="14" />不会自动运行或提交</span
          ><span><Check :size="14" />随时重新查看</span>
        </div>
      </div>
      <Button size="lg" @click="begin()"
        ><ScanLine :size="17" />开始导览<ArrowRight :size="16"
      /></Button>
    </section>
    <Alert v-if="ready.length < chapters.length" type="warning" :icon="LockKeyhole">
      <span
        >部分章节需要先{{
          role === 'student' ? '加入课堂并等待教师发布练习' : '选择课堂并准备练习'
        }}。完整导览会先介绍当前可用的章节。</span
      >
    </Alert>
    <div class="guide-section-title">
      <h2><BookOpen :size="18" />只看需要的环节</h2>
      <span>每个环节 1–3 步</span>
    </div>
    <div class="guide-chapters">
      <section
        v-for="(chapter, index) in chapters"
        :key="chapter.id"
        class="panel guide-chapter"
        :class="{ unavailable: !available(chapter) }"
      >
        <div class="guide-chapter-number">{{ String(index + 1).padStart(2, '0') }}</div>
        <div class="guide-chapter-copy">
          <h3>{{ chapter.title }}</h3>
          <p>{{ chapter.description }}</p>
          <span
            >{{ chapter.steps.length }} 步{{
              !available(chapter)
                ? chapter.requires === 'exercises'
                  ? ' · 需要课堂中有可访问的练习'
                  : ' · 需要先选择课堂'
                : ''
            }}</span
          >
        </div>
        <Button
          variant="outline"
          :disabled="!available(chapter)"
          :aria-label="`开始${chapter.title}导览`"
          @click="begin(chapter)"
          >开始<ArrowRight :size="15"
        /></Button>
      </section>
    </div>
    <p class="guide-footnote">← → 切换步骤，Esc 退出；导览不会替你运行、提交或修改数据。</p>
  </div>
</template>
<style scoped>
.guide-page {
  max-width: 1240px;
  margin: 0 auto;
}
.guide-intro {
  display: flex;
  align-items: center;
  gap: 22px;
  padding: 28px;
  border-top: 3px solid var(--ui-action);
}
.guide-intro-icon {
  display: grid;
  place-items: center;
  width: 64px;
  height: 64px;
  border: 1px solid var(--ui-blue-line);
  border-radius: 12px;
  background: var(--ui-selection);
  color: var(--ui-action);
  flex-shrink: 0;
}
.guide-intro-copy {
  flex: 1;
  min-width: 0;
}
.guide-eyebrow {
  color: var(--ui-action);
  font-size: 13px;
  font-weight: 600;
}
.guide-intro h2 {
  font-size: 20px;
  font-weight: 600;
  margin: 8px 0;
}
.guide-intro p {
  max-width: 660px;
  font-size: 14px;
  line-height: 1.85;
  color: var(--ui-secondary);
}
.guide-assurances {
  display: flex;
  gap: 20px;
  margin-top: 15px;
  color: var(--ui-secondary);
  font-size: 12px;
}
.guide-assurances span {
  display: flex;
  align-items: center;
  gap: 5px;
}
.guide-assurances svg {
  color: var(--ui-success);
}
.guide-section-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 30px 0 16px;
}
.guide-section-title h2 {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 17px;
  font-weight: 600;
}
.guide-section-title > span {
  font-size: 13px;
  color: var(--ui-muted);
}
.guide-chapters {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}
.guide-chapter {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 20px;
}
.guide-chapter-number {
  align-self: flex-start;
  color: var(--ui-faint);
  font-size: 22px;
  font-variant-numeric: tabular-nums;
}
.guide-chapter-copy {
  flex: 1;
  min-width: 0;
}
.guide-chapter h3 {
  font-size: 16px;
  font-weight: 600;
}
.guide-chapter p {
  margin: 6px 0 8px;
  color: var(--ui-secondary);
  font-size: 13px;
  line-height: 1.7;
}
.guide-chapter-copy > span {
  font-size: 12px;
  color: var(--ui-muted);
}
.guide-chapter.unavailable {
  background: var(--ui-surface);
}
.guide-footnote {
  margin: 20px 0 0;
  color: var(--ui-muted);
  font-size: 13px;
  line-height: 1.8;
}
</style>
