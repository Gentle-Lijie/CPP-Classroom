<script setup lang="ts">
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
</script>

<template>
  <main class="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-5 px-6 py-12">
    <Badge variant="outline" class="w-fit">工程框架</Badge>
    <h1 class="text-3xl font-semibold tracking-tight">C++ Classroom</h1>
    <p class="text-sm leading-7 text-muted-foreground">
      Vue 3 · TypeScript · shadcn-vue · PostgreSQL · go-judge
    </p>
    <p class="text-sm leading-7 text-muted-foreground">
      IDE 页面待实现，布局参考已保存在项目文档中。
    </p>
    <Button as-child variant="outline" class="w-fit">
      <a href="/api/health" target="_blank" rel="noreferrer">查看 API 存活检查</a>
    </Button>
  </main>
</template>
