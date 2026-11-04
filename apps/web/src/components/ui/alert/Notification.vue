<script setup lang="ts">
import { Notivue, Notification, pastelTheme } from 'notivue'
import { useI18n } from 'vue-i18n'
const { t } = useI18n()
</script>

<template>
  <Notivue v-slot="item" :list-aria-label="t('ui.notification.list')">
    <Notification
      :item="item"
      :theme="pastelTheme"
      :close-aria-label="t('ui.notification.close')" />
  </Notivue>
</template>
