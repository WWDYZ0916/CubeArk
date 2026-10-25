<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getSiteById } from '../api/mock'

const route = useRoute()
const router = useRouter()
const modName = computed(() => (route.meta.module as string) ?? '模块')
const phase = computed(() => (route.meta.phase as string) ?? '后续阶段')
const site = computed(() => getSiteById(Number(route.params.siteId)))
</script>

<template>
  <div class="page">
    <div class="holder page-narrow">
      <div class="ph">{{ phase }}</div>
      <h2>{{ modName }}</h2>
      <p>本模块已纳入路由与导航，将在「{{ phase }}」迭代中实现，当前站点：{{ site?.name ?? '-' }}。</p>
      <p class="dim">数据结构将按 siteId 站点隔离，与 3D 机房模块路由解耦。</p>
      <button class="btn" @click="router.push(`/sites/${route.params.siteId}/rooms`)">返回机房管理</button>
    </div>
  </div>
</template>

<style scoped>
.holder {
  margin-top: 10vh; text-align: center; display: flex; flex-direction: column;
  align-items: center; gap: 12px;
}
.ph {
  font-size: 12px; color: var(--accent); border: 1px dashed rgba(1, 1, 32, 0.35);
  padding: 3px 14px; border-radius: 16px; letter-spacing: 2px;
}
h2 { letter-spacing: 2px; }
p { color: var(--text-muted); font-size: 13px; }
.dim { color: var(--text-faint) !important; font-size: 12px !important; }
</style>
