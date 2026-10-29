<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, useId } from 'vue'

const id = useId()
const hint = ref('')
const left = ref(0)
const top = ref(0)
const tooltip = ref<HTMLElement>()
let target: HTMLElement | null = null
let dismissed: HTMLElement | null = null
let described: HTMLElement | null = null
let originalTitle: string | null = null
let observer: MutationObserver | undefined
let frame = 0

function reasonFor(element: HTMLElement) {
  if (!element.matches(':disabled, [aria-disabled="true"], [data-disabled]')) return ''
  // A disabled fieldset takes precedence over a stepper's own min/max reason.
  const fieldset = element.closest('fieldset:disabled[data-disabled-reason]')
  return (
    fieldset?.getAttribute('data-disabled-reason') ||
    element.closest('[data-disabled-reason]')?.getAttribute('data-disabled-reason') ||
    ''
  )
}

function clearDescription() {
  if (!described) return
  const remaining = (described.getAttribute('aria-describedby') ?? '')
    .split(/\s+/)
    .filter((value) => value && value !== id)
    .join(' ')
  if (remaining) described.setAttribute('aria-describedby', remaining)
  else described.removeAttribute('aria-describedby')
  if (originalTitle !== null) described.setAttribute('title', originalTitle)
  else described.removeAttribute('title')
  described = null
  originalTitle = null
}

function hide() {
  hint.value = ''
  clearDescription()
}

async function update() {
  if (target && !target.isConnected) target = null
  const element = target
  const reason = element?.isConnected && element !== dismissed ? reasonFor(element) : ''
  if (!element || !reason) {
    hide()
    return
  }
  if (described !== element) {
    clearDescription()
    described = element
    originalTitle = element.getAttribute('title')
    // An empty title also suppresses native titles inherited from ancestor labels.
    element.setAttribute('title', '')
    element.setAttribute(
      'aria-describedby',
      [element.getAttribute('aria-describedby'), id].filter(Boolean).join(' '),
    )
  }
  hint.value = reason
  await nextTick()
  if (!tooltip.value || target !== element || !hint.value) return
  const rect = element.getBoundingClientRect()
  const box = tooltip.value.getBoundingClientRect()
  left.value = Math.max(
    8,
    Math.min(rect.left + (rect.width - box.width) / 2, innerWidth - box.width - 8),
  )
  top.value = Math.max(
    8,
    rect.top >= box.height + 16
      ? rect.top - box.height - 8
      : Math.min(rect.bottom + 8, innerHeight - box.height - 8),
  )
}

function findTarget(node: EventTarget | null) {
  return node instanceof Element
    ? node.closest<HTMLElement>(
        'button, [role="button"], [role="checkbox"], [role="switch"], [role="combobox"]',
      )
    : null
}

function point(event: PointerEvent | FocusEvent) {
  const next = findTarget(event.target)
  if (next === target) return
  target = next
  dismissed = null
  void update()
}

function leave(event: PointerEvent | FocusEvent) {
  const next = findTarget(event.relatedTarget)
  if (next === target) return
  target = next
  dismissed = null
  void update()
}

function dismiss(event: KeyboardEvent) {
  if (event.key !== 'Escape') return
  dismissed = target
  hide()
}

function reset() {
  target = null
  dismissed = null
  hide()
}

onMounted(() => {
  // Native disabled buttons still receive pointer events; click handlers remain disabled.
  document.addEventListener('pointerover', point, true)
  document.addEventListener('pointerout', leave, true)
  document.addEventListener('focusin', point, true)
  document.addEventListener('focusout', leave, true)
  document.addEventListener('keydown', dismiss, true)
  document.addEventListener('scroll', reset, true)
  window.addEventListener('blur', reset)
  window.addEventListener('resize', reset)
  // Refresh a stationary hover when pending state changes or its button is removed.
  observer = new MutationObserver(() => {
    if (!target || frame) return
    frame = requestAnimationFrame(() => {
      frame = 0
      void update()
    })
  })
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['disabled', 'aria-disabled', 'data-disabled', 'data-disabled-reason'],
  })
})

onBeforeUnmount(() => {
  observer?.disconnect()
  cancelAnimationFrame(frame)
  document.removeEventListener('pointerover', point, true)
  document.removeEventListener('pointerout', leave, true)
  document.removeEventListener('focusin', point, true)
  document.removeEventListener('focusout', leave, true)
  document.removeEventListener('keydown', dismiss, true)
  document.removeEventListener('scroll', reset, true)
  window.removeEventListener('blur', reset)
  window.removeEventListener('resize', reset)
  clearDescription()
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="hint"
      :id="id"
      ref="tooltip"
      role="tooltip"
      class="disabled-button-hint"
      :style="{ left: `${left}px`, top: `${top}px` }">
      {{ hint }}
    </div>
  </Teleport>
</template>
