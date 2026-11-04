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
import { Sun, Moon, Monitor, Check } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { themePreference, resolvedTheme, setThemePreference } from '@/lib/theme'
const { t } = useI18n()
const options = computed(() => [
  { value: 'light', label: t('shell.theme.light'), icon: Sun },
  { value: 'dark', label: t('shell.theme.dark'), icon: Moon },
  { value: 'system', label: t('shell.theme.system'), icon: Monitor },
])
</script>
<template>
  <DropdownMenuRoot>
    <DropdownMenuTrigger as-child>
      <Button
        variant="outline"
        size="icon-sm"
        :aria-label="t('shell.theme.toggle')"
        :title="
          resolvedTheme === 'dark' ? t('shell.theme.currentDark') : t('shell.theme.currentLight')
        ">
        <Moon v-if="resolvedTheme === 'dark'" />
        <Sun v-else />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuPortal>
      <DropdownMenuContent class="ui-menu-content" align="end" :side-offset="6">
        <DropdownMenuRadioGroup
          :model-value="themePreference"
          @update:model-value="setThemePreference">
          <DropdownMenuRadioItem
            v-for="option in options"
            :key="option.value"
            :value="option.value"
            class="ui-menu-item">
            <component :is="option.icon" :size="16" />
            {{ option.label }}
            <DropdownMenuItemIndicator class="ui-menu-indicator">
              <Check :size="15" />
            </DropdownMenuItemIndicator>
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenuPortal>
  </DropdownMenuRoot>
</template>
