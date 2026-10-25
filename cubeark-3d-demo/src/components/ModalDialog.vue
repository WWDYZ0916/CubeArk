<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'

defineProps<{ title: string; width?: number }>()
const emit = defineEmits<{ (e: 'close'): void }>()

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <Teleport to="body">
    <div class="modal-mask" @mousedown.self="emit('close')">
      <div class="modal" :style="width ? { width: width + 'px' } : undefined">
        <button class="modal-x" title="关闭 (Esc)" @click="emit('close')">✕</button>
        <h3>{{ title }}</h3>
        <slot />
        <div class="foot">
          <slot name="foot">
            <button class="btn" @click="emit('close')">取消</button>
          </slot>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.modal-x {
  position: absolute; top: 12px; right: 12px; width: 26px; height: 26px;
  background: transparent; border: 1px solid var(--line-strong); border-radius: 50%;
  color: var(--text-muted); cursor: pointer; font-size: 12px; line-height: 1;
  transition: all var(--tr); z-index: 2;
}
.modal-x:hover { color: var(--text); border-color: rgba(1, 1, 32, 0.35); background: var(--bg-elevated); }
</style>
