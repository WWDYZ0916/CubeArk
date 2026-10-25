<script setup lang="ts">
import { computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { appState } from '../store/app'
import { getSites } from '../api/mock'
import { manageableSiteIds } from '../store/auth'

const router = useRouter()
const route = useRoute()
// 站点管理员仅能看到管辖站点；超管/普通用户可见全部
const sites = computed(() => {
  const ids = manageableSiteIds()
  return getSites().filter(s => ids.includes(s.id))
})
const current = computed(() => appState.currentSiteId)

function onChange(id: number) {
  appState.currentSiteId = id
  // 站点切换后，站点作用域页面重定向到该站点机房列表
  if (route.params.siteId && Number(route.params.siteId) !== id) {
    router.push(`/sites/${id}/rooms`)
  }
}
</script>

<template>
  <div class="switcher">
    <span class="label">当前站点</span>
    <select class="select" :value="current" @change="onChange(Number(($event.target as HTMLSelectElement).value))">
      <option v-for="s in sites" :key="s.id" :value="s.id">{{ s.name }}</option>
    </select>
    <button class="btn sm ghost" @click="router.push('/sites')">管理</button>
  </div>
</template>

<style scoped>
.switcher { display: flex; align-items: center; gap: 8px; margin-left: auto; }
.switcher .label { font-size: 12px; color: var(--text-faint); }
.switcher .select { width: 180px; padding: 6px 8px; background: var(--bg-panel-2); }
</style>
