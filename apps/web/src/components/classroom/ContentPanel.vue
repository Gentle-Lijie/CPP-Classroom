<script setup lang="ts">
import { useId, useSlots, type Component, type HTMLAttributes } from 'vue'
import {
  Card,
  CardHeader,
  CardDescription,
  CardAction,
  CardContent,
  CardFooter,
} from '@/components/ui/card'
import { cn } from '@/lib/utils'
const props = defineProps<{
  title?: string
  description?: string
  icon?: Component
  contentClass?: HTMLAttributes['class']
}>()
const titleId = useId()
const slots = useSlots()
</script>
<template>
  <Card class="panel content-panel" :aria-labelledby="title ? titleId : undefined">
    <CardHeader v-if="title || slots.header" class="content-panel-header">
      <slot name="header">
        <div class="content-panel-heading">
          <span v-if="icon" class="content-panel-icon"><component :is="icon" :size="19" /></span>
          <div>
            <h2 :id="titleId" class="content-panel-title">{{ title }}</h2>
            <CardDescription v-if="description" class="content-panel-description">{{
              description
            }}</CardDescription>
          </div>
        </div>
      </slot>
      <CardAction v-if="slots.actions" class="content-panel-actions"
        ><slot name="actions"
      /></CardAction>
    </CardHeader>
    <CardContent :class="cn('content-panel-body', props.contentClass)"><slot /></CardContent>
    <CardFooter v-if="slots.footer" class="content-panel-footer"><slot name="footer" /></CardFooter>
  </Card>
</template>
<style scoped>
.content-panel {
  gap: 0;
  padding: 0;
  box-shadow: none;
}
.content-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--ui-line);
}
.content-panel-heading {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  min-width: 0;
}
.content-panel-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  color: var(--ui-icon-slate);
  flex-shrink: 0;
}
.content-panel-title {
  font-size: 16px;
  font-weight: 600;
  line-height: 1.6;
}
.content-panel-description {
  margin-top: 4px;
  font-size: 14px;
  line-height: 1.8;
  color: var(--ui-muted);
}
.content-panel-actions {
  flex-shrink: 0;
  align-self: center;
}
.content-panel-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
  padding: 16px;
}
.content-panel-body > :deep(h1) {
  font-size: 26px;
  font-weight: 600;
  line-height: 1.4;
}
.content-panel-body > :deep(h2) {
  font-size: 16px;
  font-weight: 600;
  line-height: 1.6;
}
.content-panel-body > :deep(h3) {
  font-size: 16px;
  font-weight: 600;
  line-height: 1.6;
}
.content-panel-body > :deep(p) {
  color: var(--ui-secondary);
  font-size: 15px;
  line-height: 1.85;
  overflow-wrap: anywhere;
}
.content-panel-body > :deep(ol) {
  list-style: decimal;
  padding-left: 22px;
  color: var(--ui-text);
  font-size: 15px;
  line-height: 1.9;
}
.content-panel-body > :deep(ol li + li) {
  margin-top: 7px;
}
.content-panel-body > :deep([data-slot='button']) {
  align-self: flex-start;
}
.content-panel-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  padding: 12px 16px;
  border-top: 1px solid var(--ui-line);
  background: var(--ui-surface);
}
@media (max-width: 760px) {
  .content-panel-header {
    padding: 18px 20px;
    flex-wrap: wrap;
    gap: 12px;
  }
  .content-panel-body {
    padding: 20px;
  }
  .content-panel-footer {
    padding: 16px 20px;
  }
}
</style>
