<script setup lang="ts">
import { Select, SelectOption } from '@/components/ui/select'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { ChevronLeft, ChevronRight } from '@lucide/vue'
import { Button } from '@/components/ui/button'
const { t } = useI18n()
const props = withDefaults(defineProps<{ total: number; unit?: string; busy?: boolean }>(), {
  unit: undefined,
})
const unit = computed(() => props.unit ?? t('shell.pagination.unit'))
const page = defineModel<number>('page', { default: 1 })
const pageSize = defineModel<number>('pageSize', { default: 10 })
const pages = computed(() => Math.max(1, Math.ceil(props.total / pageSize.value)))
const first = computed(() => (props.total ? (page.value - 1) * pageSize.value + 1 : 0))
</script>
<template>
  <nav class="pagination" :aria-label="t('shell.pagination.aria')">
    <span class="pagination-summary" aria-live="polite">
      {{ t('shell.pagination.total', { total, unit: unit }) }}
      <template v-if="total">
        {{
          t('shell.pagination.range', {
            first,
            last: Math.min(page * pageSize, total),
          })
        }}
      </template>
    </span>
    <div class="pagination-controls">
      <label>
        {{ t('shell.pagination.perPage') }}
        <Select
          v-model.number="pageSize"
          :disabled="busy"
          :data-disabled-reason="t('shell.pagination.loadingReason')"
          :aria-label="t('shell.pagination.perPageAria')">
          <SelectOption v-for="n in [10, 20, 50]" :key="n" :value="n">{{ n }}</SelectOption>
        </Select>
      </label>
      <Button
        variant="outline"
        size="icon-sm"
        :aria-label="t('shell.pagination.prev')"
        :disabled="busy || page <= 1"
        :data-disabled-reason="
          busy ? t('shell.pagination.loadingReason') : t('shell.pagination.firstPage')
        "
        @click="page--">
        <ChevronLeft />
      </Button>
      <span aria-live="polite">{{ page }} / {{ pages }}</span>
      <Button
        variant="outline"
        size="icon-sm"
        :aria-label="t('shell.pagination.next')"
        :disabled="busy || page >= pages"
        :data-disabled-reason="
          busy ? t('shell.pagination.loadingReason') : t('shell.pagination.lastPage')
        "
        @click="page++">
        <ChevronRight />
      </Button>
    </div>
  </nav>
</template>
