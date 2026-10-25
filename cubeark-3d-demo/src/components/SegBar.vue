<script setup lang="ts">
// 分段仪表条：仿 Zabbix 的玻璃立体分段（圆角胶囊 + 上高光 + 底部暗边），
// 已填充段按区间着色（绿/黄/橙/红），未达段为淡粉色槽位
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  value: number
  max: number
  bands?: Array<[number, string]> // [[上限百分比, 颜色], ...]
  segments?: number
}>(), { segments: 16, bands: () => [[60, '#34c759'], [80, '#f5a623'], [100, '#ff4d4f']] })

function bandFor(pct: number): string {
  for (const [up, color] of props.bands) if (pct <= up) return color
  return props.bands[props.bands.length - 1]?.[1] ?? '#ff4d4f'
}

// 由基色推导高光/暗边，拼出玻璃圆柱的纵向渐变（不用 color-mix，兼容老内核浏览器）
function shade(hex: string, amt: number): string {
  let h = hex.replace('#', '')
  if (h.length === 3) h = h.split('').map(c => c + c).join('')
  const n = parseInt(h, 16)
  const target = amt < 0 ? 0 : 255
  const p = Math.abs(amt)
  const mix = (c: number) => Math.round(c + (target - c) * p)
  return `rgb(${mix((n >> 16) & 255)}, ${mix((n >> 8) & 255)}, ${mix(n & 255)})`
}
function glass(color: string): string {
  return `linear-gradient(180deg, ${shade(color, 0.34)} 0%, ${shade(color, 0.08)} 46%, ${color} 62%, ${shade(color, -0.22)} 100%)`
}
const EMPTY_GLASS = 'linear-gradient(180deg, #fdeef1 0%, #f9e3e7 48%, #f2d3d9 100%)'

const segs = computed(() => {
  const total = Math.max(4, props.segments)
  const ratio = Math.max(0, Math.min(1, props.max > 0 ? props.value / props.max : 0))
  const filled = Math.round(ratio * total)
  return Array.from({ length: total }, (_, i) => ({
    active: i < filled,
    style: { background: i < filled ? glass(bandFor(((i + 1) / total) * 100)) : EMPTY_GLASS }
  }))
})
</script>

<template>
  <span class="segbar" aria-hidden="true">
    <i v-for="(s, i) in segs" :key="i" :class="{ off: !s.active }" :style="s.style"></i>
  </span>
</template>

<style scoped>
.segbar { display: inline-flex; align-items: flex-end; gap: 1.5px; vertical-align: middle; }
.segbar i {
  display: block; width: 4px; height: 14px; border-radius: 2px;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.72),
    inset 0 -1px 1px rgba(0, 0, 0, 0.14),
    0 1px 1.5px rgba(16, 24, 40, 0.14);
}
.segbar i.off { box-shadow: inset 0 0 0 1px rgba(226, 196, 203, 0.65), inset 0 1px 0 rgba(255, 255, 255, 0.85); }
</style>
