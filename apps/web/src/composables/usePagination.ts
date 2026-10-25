import { computed, ref, watch, type Ref, type WatchSource } from 'vue'

export function usePagination<T>(
  items: Ref<readonly T[]>,
  resetSources: WatchSource[] = [],
  defaultSize = 10,
) {
  const page = ref(1)
  const pageSize = ref(defaultSize)
  const pages = computed(() => Math.max(1, Math.ceil(items.value.length / pageSize.value)))
  watch([...resetSources, pageSize], () => (page.value = 1), { flush: 'sync' })
  watch(pages, (count) => (page.value = Math.min(Math.max(1, page.value), count)))
  const paged = computed(() =>
    items.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value),
  )
  return { page, pageSize, pages, paged }
}
