<script setup lang="ts">
import { Notivue, Notification, pastelTheme } from 'notivue'
</script>

<template>
  <Notivue v-slot="item" :list-aria-label="'通知'">
    <Notification :item="item" :theme="pastelTheme" close-aria-label="关闭提示" />
  </Notivue>
</template>
