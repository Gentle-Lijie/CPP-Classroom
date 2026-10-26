<script setup lang="ts">
import { computed, defineComponent, h, useId, type Component } from 'vue'
import { Notification, filledIcons, pastelTheme, type NotivueItem } from 'notivue'

const props = withDefaults(
  defineProps<{
    type?: 'info' | 'success' | 'warning' | 'error'
    title?: string
    icon?: Component
    role?: 'alert' | 'status' | 'note'
  }>(),
  { type: 'info' },
)
const id = useId()
const role = computed(
  () => props.role ?? (['error', 'warning'].includes(props.type) ? 'alert' : 'status'),
)
const item = computed<NotivueItem>(() => ({
  id,
  type: props.type,
  title: '',
  message: '',
  duration: Infinity,
  createdAt: 0,
  duplicateCount: 0,
  ariaLive: role.value === 'alert' ? 'assertive' : 'polite',
  ariaRole: role.value === 'note' ? 'status' : role.value,
  props: {},
  clear: () => {},
  destroy: () => {},
}))
// Lucide exports functional components; Notivue accepts object components for icons.
const customIcon = defineComponent({
  inheritAttrs: false,
  setup:
    (_, { attrs }) =>
    () =>
      h('span', attrs, props.icon ? [h(props.icon, { size: 20 })] : []),
})
const icons = computed(() =>
  props.icon ? { ...filledIcons, [props.type]: customIcon } : filledIcons,
)
const theme = { ...pastelTheme, '--nv-width': '100%' }
</script>

<template>
  <Notification
    class="app-alert"
    :item="item"
    :theme="theme"
    :icons="icons"
    :role="role"
    aria-atomic="true"
    hide-close
  >
    <div class="app-alert-content">
      <h3 v-if="title" class="Notivue__content-title">{{ title }}</h3>
      <div class="app-alert-message"><slot /></div>
    </div>
    <div v-if="$slots.actions" class="app-alert-actions"><slot name="actions" /></div>
  </Notification>
</template>
