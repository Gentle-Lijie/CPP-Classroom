<script setup lang="ts">
import { Select, SelectOption } from '@/components/ui/select'
import { computed } from 'vue'
import { ChevronLeft, ChevronRight } from '@lucide/vue'
import { Button } from '@/components/ui/button'
const props = withDefaults(defineProps<{ total: number; unit?: string; busy?: boolean }>(), {
  unit: '条记录',
})
const page = defineModel<number>('page', { default: 1 })
const pageSize = defineModel<number>('pageSize', { default: 10 })
const pages = computed(() => Math.max(1, Math.ceil(props.total / pageSize.value)))
const first = computed(() => (props.total ? (page.value - 1) * pageSize.value + 1 : 0))
</script>
<template>
  <nav class="pagination" aria-label="列表分页">
    <span class="pagination-summary" aria-live="polite"
      >共 {{ total }} {{ unit
      }}<template v-if="total">
        · 显示 {{ first }}–{{ Math.min(page * pageSize, total) }}</template
      ></span
    >
    <div class="pagination-controls">
      <label
        >每页<Select v-model.number="pageSize" :disabled="busy" aria-label="每页条数">
          <SelectOption v-for="n in [10, 20, 50]" :key="n" :value="n">{{ n }}</SelectOption>
        </Select></label
      >
      <Button
        variant="outline"
        size="icon-sm"
        aria-label="上一页"
        :disabled="busy || page <= 1"
        @click="page--"
        ><ChevronLeft
      /></Button>
      <span aria-live="polite">{{ page }} / {{ pages }}</span>
      <Button
        variant="outline"
        size="icon-sm"
        aria-label="下一页"
        :disabled="busy || page >= pages"
        @click="page++"
        ><ChevronRight
      /></Button>
    </div>
  </nav>
</template>
