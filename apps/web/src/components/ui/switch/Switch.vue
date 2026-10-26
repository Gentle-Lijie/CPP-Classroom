<script setup lang="ts">
import { SwitchRoot, SwitchThumb } from 'reka-ui'
const model = defineModel<boolean>({ default: false })
defineProps<{ disabled?: boolean; name?: string }>()
</script>
<template>
  <SwitchRoot v-model="model" :disabled="disabled" :name="name" class="ui-switch" data-ui="switch"
    ><SwitchThumb class="ui-switch-thumb"
  /></SwitchRoot>
</template>
