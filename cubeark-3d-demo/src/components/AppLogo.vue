<script setup lang="ts">
// CubeArk 品牌标：立方体 + 方舟船首 + 数据节点（单色 currentColor，随上下文着色）
defineProps<{ size?: number }>()
</script>

<template>
  <svg
    class="app-logo"
    :width="size ?? 26"
    :height="size ?? 26"
    viewBox="0 0 48 48"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <path
      d="M24 5.5 40.5 14.5v19L24 42.5 7.5 33.5v-19L24 5.5Z"
      stroke="currentColor" stroke-width="2.6" stroke-linejoin="round" class="lg-edge"
    />
    <path
      d="M7.5 14.5 24 23.5l16.5-9M24 23.5v19"
      stroke="currentColor" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"
      opacity=".68" class="lg-edge"
    />
    <path
      d="M17 25.5l7-4.5 7 4.5"
      stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" class="lg-ark"
    />
    <circle cx="24" cy="30.8" r="2.5" fill="currentColor" class="lg-node" />
  </svg>
</template>

<style scoped>
/* 默认整体青色，方舟/节点提亮为冰白，可被上下文覆盖 */
.app-logo { color: var(--accent); flex: none; }
.lg-ark, .lg-node { color: var(--text); }
</style>
