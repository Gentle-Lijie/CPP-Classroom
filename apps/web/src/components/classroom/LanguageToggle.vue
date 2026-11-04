<script setup lang="ts">
import {
  DropdownMenuRoot,
  DropdownMenuTrigger,
  DropdownMenuPortal,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuItemIndicator,
} from 'reka-ui'
import { Languages, Check } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import { Button } from '@/components/ui/button'
import { SUPPORTED_LOCALES, setLocale, type Locale } from '@/i18n'
const { t, locale } = useI18n()
function select(value: unknown) {
  if ((SUPPORTED_LOCALES as readonly string[]).includes(String(value))) setLocale(value as Locale)
}
</script>
<template>
  <DropdownMenuRoot>
    <DropdownMenuTrigger as-child>
      <Button
        variant="outline"
        size="icon-sm"
        :aria-label="t('app.language.label')"
        :title="t('app.language.label')">
        <Languages />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuPortal>
      <DropdownMenuContent class="ui-menu-content" align="end" :side-offset="6">
        <DropdownMenuRadioGroup :model-value="locale" @update:model-value="select">
          <DropdownMenuRadioItem
            v-for="code in SUPPORTED_LOCALES"
            :key="code"
            :value="code"
            class="ui-menu-item">
            {{ t(`app.language.${code}`) }}
            <DropdownMenuItemIndicator class="ui-menu-indicator">
              <Check :size="15" />
            </DropdownMenuItemIndicator>
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenuPortal>
  </DropdownMenuRoot>
</template>
