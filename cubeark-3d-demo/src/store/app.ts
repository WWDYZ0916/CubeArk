import { reactive } from 'vue'

// 全局轻量状态（不引入 pinia，保持依赖最小）
export const appState = reactive({
  currentSiteId: 1
})
