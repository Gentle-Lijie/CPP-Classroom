<script setup lang="ts">
import { Alert } from '@/components/ui/alert'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { ArrowRight, ScanLine, BookOpen, LockKeyhole } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { currentUser, demo, exercises, workspaceRole, classroomRole } from '@/data/demo'
import {
  chapterAvailable,
  guideCatalog,
  roleLabels,
  type GuideChapter,
  type GuideRole,
} from '@/lib/guide-catalog'
import { guideVisits } from '@/lib/guide-visit'
import { startGuide } from '@/lib/spotlight'
const { t } = useI18n()
const role = computed(
  () => (currentUser.value?.role === 'admin' ? 'admin' : workspaceRole.value) as GuideRole,
)
const chapters = computed(() =>
  guideCatalog[role.value].filter(
    (chapter) =>
      role.value === 'admin' || classroomRole.value !== 'ta' || chapter.id === 'overview',
  ),
)
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
        <div class="heading-meta">
          {{ t('guide.view.headingMeta', { role: t(roleLabels[role]) }) }}
        </div>
        <h1>{{ t('guide.view.title') }}</h1>
      </div>
    </div>
    <section class="panel guide-intro">
      <div class="guide-intro-icon"><ScanLine :size="30" /></div>
      <div class="guide-intro-copy">
        <span class="guide-eyebrow">
          {{ t('guide.view.eyebrow', { role: t(roleLabels[role]) }) }}
        </span>
        <h2>
          {{
            role === 'student'
              ? t('guide.view.introStudent')
              : role === 'teacher'
                ? t('guide.view.introTeacher')
                : t('guide.view.introAdmin')
          }}
        </h2>
        <p>{{ t('guide.view.totalSteps', { count }) }}</p>
      </div>
      <Button size="lg" @click="begin()">
        <ScanLine :size="17" />
        {{ t('guide.view.start') }}
        <ArrowRight :size="16" />
      </Button>
    </section>
    <Alert v-if="ready.length < chapters.length" type="warning" :icon="LockKeyhole">
      <span>
        {{
          t('guide.view.lockedNotice', {
            prerequisite:
              role === 'student'
                ? t('guide.view.prerequisiteStudent')
                : t('guide.view.prerequisiteOther'),
          })
        }}
      </span>
    </Alert>
    <div class="guide-section-title">
      <h2>
        <BookOpen :size="18" />
        {{ t('guide.view.sectionsTitle') }}
      </h2>
    </div>
    <div class="guide-chapters">
      <section
        v-for="(chapter, index) in chapters"
        :key="chapter.id"
        class="panel guide-chapter"
        :class="{ unavailable: !available(chapter) }">
        <div class="guide-chapter-number">{{ String(index + 1).padStart(2, '0') }}</div>
        <div class="guide-chapter-copy">
          <h3>{{ t(chapter.title) }}</h3>
          <p>{{ t(chapter.description) }}</p>
          <span>
            {{
              t('guide.view.stepsCount', { count: chapter.steps.length }) +
              (!available(chapter)
                ? chapter.requires === 'exercises'
                  ? t('guide.view.requiresExercises')
                  : t('guide.view.requiresClassroom')
                : '')
            }}
          </span>
        </div>
        <Button
          variant="outline"
          :disabled="!available(chapter)"
          :data-disabled-reason="
            !demo.classroomId
              ? t('guide.view.reasonNoClassroom')
              : t('guide.view.reasonNoExercises')
          "
          :aria-label="t('guide.view.startChapterAria', { title: t(chapter.title) })"
          @click="begin(chapter)">
          {{ t('guide.view.startChapter') }}
          <ArrowRight :size="15" />
        </Button>
      </section>
    </div>
    <p class="guide-footnote">{{ t('guide.view.footnote') }}</p>
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
