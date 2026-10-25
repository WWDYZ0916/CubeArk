<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import RoomFormDialog from '../components/RoomFormDialog.vue'
import { getSiteById, getRooms, deleteRoom, getRoomMeta } from '../api/mock'
import { canEdit } from '../store/auth'
import type { RoomMeta } from '../types'

const route = useRoute()
const router = useRouter()
const siteId = computed(() => Number(route.params.siteId))
const site = computed(() => getSiteById(siteId.value))

const tick = ref(0)
const roomList = computed<RoomMeta[]>(() => { tick.value; return getRooms(siteId.value) })
const dialogRoom = ref<RoomMeta | null>(null)
const showDialog = ref(false)

const toast = ref('')
let toastTimer: number | undefined
function showToast(msg: string, isErr = false) {
  toast.value = msg
  window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => (toast.value = ''), 4000)
  const el = document.querySelector('.toast') as HTMLElement | null
  if (el) el.style.borderColor = isErr ? 'rgba(185, 28, 28, 0.5)' : 'rgba(21, 128, 61, 0.5)'
}

function openCreate() {
  dialogRoom.value = null
  showDialog.value = true
}
function openEdit(r: RoomMeta) {
  dialogRoom.value = r
  showDialog.value = true
}
function removeRoom(r: RoomMeta) {
  if (!window.confirm(`确认删除机房「${r.name}」？`)) return
  const res = deleteRoom(r.id)
  if (!res.ok) {
    showToast(res.error!, true)
    return
  }
  tick.value++
  showToast(`机房 ${r.name} 已删除`)
}
function enter3d(r: RoomMeta) {
  router.push(`/sites/${siteId.value}/rooms/${r.id}/3d`)
}
function onSaved() {
  tick.value++
  showToast('机房已保存')
}
// 简单统计展示（机柜数来自mock内部，此处通过meta查rack场景摘要不可得，展示占位统计）
function roomSub(r: RoomMeta) {
  const meta = getRoomMeta(r.id)
  return `${meta?.floor || '-'} 层 · 编码 ${r.code}`
}
</script>

<template>
  <div class="page">
    <div class="page-head page-narrow">
      <div>
        <div class="crumb">
          <span class="link" @click="router.push('/sites')">站点管理</span>
          <span class="sep">/</span><span>{{ site?.name ?? '站点' }}</span>
        </div>
        <h2 style="margin-top: 6px">机房管理</h2>
        <p class="sub">每个机房拥有独立的 3D 机房视图、机柜列表与 U 位数据，站点间数据隔离</p>
      </div>
      <button v-if="canEdit()" class="btn primary" @click="openCreate">＋ 新增机房</button>
    </div>

    <div class="grid page-narrow">
      <div v-for="r in roomList" :key="r.id" class="card hoverable">
        <div class="card-title">
          {{ r.name }}
          <span class="badge">{{ r.code }}</span>
        </div>
        <div class="room-line">{{ roomSub(r) }}</div>
        <div class="actions">
          <button class="btn primary sm" @click="enter3d(r)">进入 3D 机房视图</button>
          <template v-if="canEdit()">
            <button class="btn sm" @click="openEdit(r)">编辑</button>
            <button class="btn danger sm" @click="removeRoom(r)">删除</button>
          </template>
        </div>
      </div>
    </div>
    <p v-if="!roomList.length" class="empty">本站点暂无机房，点击右上角「新增机房」创建（新机房 3D 视图内可添加机柜）</p>

    <RoomFormDialog v-if="showDialog" :room="dialogRoom" :site-id="siteId" @close="showDialog = false" @saved="onSaved" />
    <div class="toast" v-if="toast">{{ toast }}</div>
  </div>
</template>

<style scoped>
.page-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 18px; }
.page-head h2 { font-size: 19px; letter-spacing: 1px; }
.page-head .sub { font-size: 12px; color: var(--text-faint); margin-top: 4px; }
.room-line { font-size: 13px; color: var(--text-muted); margin: 4px 0 2px; }
.actions { display: flex; gap: 8px; margin-top: 14px; }
</style>
