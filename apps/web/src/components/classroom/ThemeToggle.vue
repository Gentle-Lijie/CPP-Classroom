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
import { themePreference, resolvedTheme, setThemePreference } from '@/lib/theme'
const options = [
  { value: 'light', label: '浅色', icon: Sun },
  { value: 'dark', label: '深色', icon: Moon },
  { value: 'system', label: '跟随系统', icon: Monitor },
]
</script>
<template>
  <DropdownMenuRoot>
    <DropdownMenuTrigger as-child
      ><Button
        variant="outline"
        size="icon-sm"
        aria-label="切换主题"
        :title="resolvedTheme === 'dark' ? '当前为深色主题' : '当前为浅色主题'"
        ><Moon v-if="resolvedTheme === 'dark'" /><Sun v-else /></Button
    ></DropdownMenuTrigger>
    <DropdownMenuPortal
      ><DropdownMenuContent class="ui-menu-content" align="end" :side-offset="6">
        <DropdownMenuRadioGroup
          :model-value="themePreference"
          @update:model-value="setThemePreference"
        >
          <DropdownMenuRadioItem
            v-for="option in options"
            :key="option.value"
            :value="option.value"
            class="ui-menu-item"
            ><component :is="option.icon" :size="16" />{{ option.label
            }}<DropdownMenuItemIndicator class="ui-menu-indicator"
              ><Check :size="15" /></DropdownMenuItemIndicator
          ></DropdownMenuRadioItem>
        </DropdownMenuRadioGroup> </DropdownMenuContent
    ></DropdownMenuPortal>
  </DropdownMenuRoot>
</template>
