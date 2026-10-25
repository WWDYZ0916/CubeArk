<script setup lang="ts">
// 3D机房视图 —— 由原单页 App.vue 原样迁移
// 硬性约束：three/ 目录（渲染/机柜计算/告警判断/交互）零改动，本文件仅增加路由粘合与面板UI
import { onMounted, onBeforeUnmount, ref, reactive, computed, watch, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ModalDialog from '../components/ModalDialog.vue'
import SnmpDialog from '../components/SnmpDialog.vue'
import { ThreeApp } from '../three/three-app'
import { RoomScene } from '../three/RoomScene'
import { RackScene } from '../three/RackScene'
import {
  getRoomScene, getRackScene, getWarehouse, checkU, applyMount, addRack, deleteRack, editMountedDevice,
  unmountDevice, setActiveRoom, getRoomMeta, getSiteById, hwStatus, getSnmpConfig,
  checkDeviceMove as checkMoveApi, moveMountedDevice
} from '../api/mock'
import { canEdit } from '../store/auth'
import type { RoomSceneData, RackSceneData, DeviceBrief, WarehouseDevice, RackInfo } from '../types'
import { CAT_NAME, DEVICE_CATS } from '../types'

const route = useRoute()
const router = useRouter()
const roomIdParam = computed(() => Number(route.params.roomId))
const roomMeta = computed(() => getRoomMeta(roomIdParam.value))
const siteOfRoom = computed(() => (roomMeta.value ? getSiteById(roomMeta.value.siteId) : undefined))

const containerRef = ref<HTMLDivElement>()
let app3d: ThreeApp | null = null
let roomScene: RoomScene | null = null
let rackScene: RackScene | null = null

const mode = ref<'room' | 'rack'>('room')
const rackId = ref(0)
const roomData = ref<RoomSceneData>(getRoomScene())
const rackData = ref<RackSceneData | null>(null)
const selected = ref<DeviceBrief | null>(null)
const warehouseList = ref<WarehouseDevice[]>(getWarehouse())
const toast = ref('')
const roomTick = ref(0) // mock 为非响应式原始对象，变更后手动递增驱动计算属性刷新
let toastTimer: number | undefined

function showToast(msg: string, isError = false) {
  toast.value = msg
  window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => (toast.value = ''), 5000)
  const el = document.querySelector('.toast') as HTMLElement | null
  if (el) el.style.borderColor = isError ? 'rgba(185, 28, 28, 0.5)' : 'rgba(21, 128, 61, 0.5)'
}

const alarmCount = computed(() => { roomTick.value; return roomData.value.racks.filter(r => r.health === 2).length })
const avgUsage = computed(() => {
  roomTick.value
  const racks = roomData.value.racks
  return racks.length ? Math.round((racks.reduce((s, r) => s + r.usage_pct, 0) / racks.length) * 10) / 10 : 0
})
const usedUTotal = computed(() => { roomTick.value; return roomData.value.racks.reduce((s, r) => s + r.used_u, 0) })
const usedU = computed(() => (rackData.value ? rackData.value.u_slots.filter(s => s.device).length : 0))
const selHw = computed(() => (selected.value ? hwStatus(selected.value.id) : null))
// SNMP 采集适用于交换机/服务器/防火墙/存储类设备
const SNMP_CATS = [1, 2, 3, 4, 5, 6]
const selSnmp = computed(() => (selected.value && SNMP_CATS.includes(selected.value.category) ? getSnmpConfig(selected.value.id) : null))
const snmpTarget = ref<DeviceBrief | null>(null)

function openManage(kind: 'http' | 'ssh') {
  const ip = selected.value?.manage_ip
  if (!ip) return
  window.open(kind === 'http' ? `http://${ip}` : `ssh://${ip}`, '_blank')
}

const form = reactive({ code: '', u_total: 42, row: 1 })
const rackRows = computed<RackInfo[]>(() => { roomTick.value; return getRoomScene().racks })
// 排号：已有排下拉 + 「＋新增排…」自由输入 1~99（机房不止默认排数时可随时新增）
const existingRows = computed<number[]>(() => {
  roomTick.value
  return [...new Set(getRoomScene().racks.map(r => r.row_no))].sort((a, b) => a - b)
})
const rowPick = ref<number | 'new'>(existingRows.value[0] ?? 1)
const newRow = ref((existingRows.value[existingRows.value.length - 1] ?? 0) + 1)
watch(rowPick, v => {
  if (v === 'new') {
    newRow.value = Math.min(99, (existingRows.value[existingRows.value.length - 1] ?? 0) + 1)
    form.row = newRow.value
  } else {
    form.row = v
  }
})
watch(newRow, v => {
  if (rowPick.value === 'new') form.row = Math.min(99, Math.max(1, Number(v) || 1))
})
function resetRowPick() {
  const rows = existingRows.value
  const first = rows[0] ?? 1
  rowPick.value = first
  newRow.value = Math.min(99, (rows[rows.length - 1] ?? 0) + 1)
  form.row = first
}
// 1→A 2→B … 26→Z 27→AA 28→AB …（超过26排同样可建柜）
const rowLetter = (n: number) => {
  let s = ''
  let x = n
  while (x > 0) {
    s = String.fromCharCode(65 + ((x - 1) % 26)) + s
    x = Math.floor((x - 1) / 26)
  }
  return s
}

watch(() => form.row, row => {
  const racks = getRoomScene().racks.filter(r => r.row_no === row)
  const nextCol = (racks.length ? Math.max(...racks.map(r => r.col_no)) : 0) + 1
  form.code = `${rowLetter(row)}${String(nextCol).padStart(2, '0')}`
}, { immediate: true })

function doAddRack() {
  if (!canEdit()) return
  if (rowPick.value === 'new' && !(newRow.value >= 1 && newRow.value <= 99)) {
    showToast('新排号须为 1~99', true)
    return
  }
  const res = addRack({ code: form.code, u_total: form.u_total, row: form.row })
  if (!res.ok) {
    showToast(`新增失败：${res.error}`, true)
    return
  }
  roomTick.value++
  buildRoom()
  showToast(`机柜 ${form.code.trim()} 已新增（${form.row}排 · ${rowLetter(form.row)}列，U位已生成）`)
  // 新排已落库，切回该排（继续同排加柜），并重新生成推荐编号
  const row = form.row
  if (rowPick.value === 'new') rowPick.value = row
  const racks = getRoomScene().racks.filter(r => r.row_no === row)
  const nextCol = (racks.length ? Math.max(...racks.map(r => r.col_no)) : 0) + 1
  form.code = `${rowLetter(row)}${String(nextCol).padStart(2, '0')}`
}

function usageColorOf(r: RackInfo): string {
  if (r.health === 2) return '#e53935'
  if (r.usage_pct >= 85) return '#f57c00'
  if (r.usage_pct >= 60) return '#c0ca33'
  return '#43a047'
}

function doDeleteRack(r: RackInfo) {
  if (!canEdit()) return
  if (!window.confirm(`确认删除机柜 ${r.code}（${r.u_total}U，使用率 ${r.usage_pct}%）？`)) return
  const res = deleteRack(r.id)
  if (!res.ok) {
    showToast(`删除失败：${res.error}`, true)
    return
  }
  roomTick.value++
  buildRoom()
  showToast(`机柜 ${r.code} 已删除`)
}

function catColor(c: number) {
  return DEVICE_CATS.find(x => x.v === c)?.color ?? '#90a4ae'
}
function devStatus(s: number) {
  return ({ 1: '在库', 2: '在用', 3: '维修', 4: '备用', 5: '已出库', 6: '报废' } as Record<number, string>)[s] ?? '-'
}

// ---- 设备编辑（名称/SN/U高度/业务IP/管理IP/状态，U高度变更自动重排并校验冲突） ----
const showDevEdit = ref(false)
const devForm = ref({ name: '', sn: '', uHeight: 1, startU: 1, category: 1, vendor: '', model: '', bizIp: '', manageIp: '', status: 2 })
const devErr = ref('')
function openDevEdit() {
  if (!canEdit()) return
  const d = selected.value
  if (!d) return
  const slot = rackData.value?.u_slots.find(sl => sl.device?.id === d.id)
  devForm.value = {
    name: d.name, sn: d.sn, uHeight: d.model.u_height, startU: slot?.u_no ?? 1,
    category: d.category, vendor: d.model.vendor, model: d.model.model,
    bizIp: d.biz_ip ?? '', manageIp: d.manage_ip ?? '', status: d.status
  }
  devErr.value = ''
  showDevEdit.value = true
}
function saveDevEdit() {
  const d = selected.value
  if (!d) return
  const res = editMountedDevice(rackId.value, d.id, {
    name: devForm.value.name,
    sn: devForm.value.sn,
    uHeight: devForm.value.uHeight,
    uStart: devForm.value.startU,
    category: devForm.value.category,
    vendor: devForm.value.vendor,
    model: devForm.value.model,
    bizIp: devForm.value.bizIp,
    manageIp: devForm.value.manageIp,
    status: devForm.value.status
  })
  if (!res.ok) { devErr.value = res.error!; return }
  showDevEdit.value = false
  rackData.value = getRackScene(rackId.value)
  roomTick.value++
  const nid = d.id
  selected.value = rackData.value?.u_slots.find(s => s.device?.id === nid)?.device ?? null
  buildRack(true)
  showToast('设备信息已更新（U位已按新起始U/高度调整）')
}

// ---- 下架：从当前机柜移除，设备回站点设备库（IP信息保留，可重新上架） ----
function doUnmount() {
  if (!canEdit()) return
  const d = selected.value
  if (!d) return
  if (!window.confirm(`确认下架「${d.name}」（SN: ${d.sn}）？\n下架后回到站点设备库，可重新拖拽上架。`)) return
  const res = unmountDevice(rackId.value, d.id)
  if (!res.ok) { showToast(`下架失败：${res.error}`, true); return }
  selected.value = null
  warehouseList.value = getWarehouse()
  rackData.value = getRackScene(rackId.value)
  roomTick.value++
  buildRack(true)
  showToast(`${d.name} 已下架 → 站点设备库`)
}

function clearScenes() {
  roomScene?.dispose()
  roomScene = null
  rackScene?.dispose()
  rackScene = null
  selected.value = null
}

// 按机柜分布自适应相机：排数/列数增加时自动拉远，保证全部机柜可见
function fitRoomCamera() {
  if (!app3d) return
  const racks = getRoomScene().racks
  const halfX = Math.max(5.6, ...racks.map(r => Math.abs(r.pos.x) + 1))
  const halfZ = Math.max(5.4, ...racks.map(r => Math.abs(r.pos.z) + 1))
  const d = Math.max(30, halfX * 3.0 + 8, halfZ * 2.6 + 10)
  app3d.setCamera([d * 0.57, d * 0.45, d * 0.70], [0, 0.8, 0])
}

function buildRoom() {
  if (!app3d) return
  clearScenes()
  roomData.value = getRoomScene()
  fitRoomCamera()
  roomScene = new RoomScene(app3d, getRoomScene(), {
    onRackClick(r) {
      rackId.value = r.id
      mode.value = 'rack'
    }
  })
}

function buildRack(keepCamera = false) {
  if (!app3d) return
  const data = getRackScene(rackId.value)
  if (!data) {
    mode.value = 'room'
    return
  }
  rackData.value = data
  clearScenes() // 进入L2前必须清掉L1机房场景，否则其他机柜会遮挡本柜
  if (!keepCamera) app3d.setCamera([2.6, 1.9, 3.4], [0, 1.1, 0])
  rackScene = new RackScene(app3d, data, {
    onDeviceClick(d) {
      selected.value = d
    },
    checkDrop(uStart, dev) {
      return checkU(rackId.value, dev.id, uStart)
    },
    checkDeviceMove(uStart, dev) {
      return checkMoveApi(rackId.value, dev.id, uStart)
    },
    onDeviceMoved(dev, uStart, ok) {
      if (!ok) {
        const c = checkMoveApi(rackId.value, dev.id, uStart)
        showToast(`U${uStart} 区域冲突（${c.conflicts.join('、')}），未移动`, true)
        return
      }
      const r = moveMountedDevice(rackId.value, dev.id, uStart)
      if (!r.ok) { showToast(`移动失败：${r.error}`, true); return }
      rackData.value = getRackScene(rackId.value)
      roomTick.value++
      const nid = dev.id
      selected.value = rackData.value?.u_slots.find(sl => sl.device?.id === nid)?.device ?? null
      buildRack(true)
      showToast(`设备已移动到 U${uStart}`)
    },
    onDropped(dev, uStart, ok) {
      if (!ok) {
        const c = checkU(rackId.value, dev.id, uStart)
        showToast(`U${uStart} 区域冲突（${c.conflicts.join('、')}），未生成单据`, true)
        return
      }
      const r = applyMount(rackId.value, dev, uStart)
      warehouseList.value = getWarehouse()
      rackData.value = getRackScene(rackId.value)
      roomTick.value++
      buildRack(true)
      showToast(`已生成上架单 ${r.orderNo}（演示直接执行）：${dev.sn} → ${rackData.value!.rack.code} U${r.uStart}-U${r.uEnd}`)
    }
  })
}

function startDrag(d: WarehouseDevice) {
  if (!canEdit()) return
  rackScene?.startDrag(d)
}

watch([mode, rackId], () => nextTick(() => (mode.value === 'room' ? buildRoom() : buildRack())))

// 路由切换到其他机房时重置场景（同组件复用）
watch(roomIdParam, id => {
  if (!id) return
  setActiveRoom(id)
  mode.value = 'room'
  rackId.value = 0
  roomTick.value++
  resetRowPick()
  warehouseList.value = getWarehouse()
  nextTick(buildRoom)
})

onMounted(() => {
  setActiveRoom(roomIdParam.value)
  roomTick.value++
  resetRowPick()
  warehouseList.value = getWarehouse()
  if (!containerRef.value) return
  app3d = new ThreeApp(containerRef.value)
  buildRoom()
})

onBeforeUnmount(() => {
  clearScenes()
  app3d?.dispose()
  app3d = null
})
</script>

<template>
  <div class="room3d">
    <div class="viewbar">
      <button class="btn sm" @click="router.push(`/sites/${route.params.siteId}/rooms`)">← 机房列表</button>
      <div class="crumb">
        <span>{{ siteOfRoom?.name ?? '站点' }}</span>
        <span class="sep">/</span>
        <span>{{ roomMeta?.name ?? '机房' }}</span>
        <template v-if="mode === 'rack' && rackData">
          <span class="sep">/</span><span>机柜 {{ rackData.rack.code }}</span>
        </template>
      </div>
      <span style="margin-left: auto; font-size: 12px; color: var(--text-faint)">
        左键旋转 · 滚轮缩放 · 右键平移
      </span>
      <button v-if="mode === 'rack'" class="btn sm" @click="mode = 'room'">返回总览</button>
    </div>

    <div class="main">
      <div ref="containerRef" class="stage"></div>

      <aside class="side">
        <template v-if="mode === 'room'">
          <div class="card">
            <div class="card-title">机房概况</div>
            <div class="stats stats-grid">
              <div class="stat"><b>{{ roomData.racks.length }}</b><span>机柜</span></div>
              <div class="stat"><b :style="alarmCount ? 'color:var(--danger)' : ''">{{ alarmCount }}</b><span>告警柜</span></div>
              <div class="stat"><b>{{ avgUsage }}%</b><span>平均使用率</span></div>
              <div class="stat"><b>{{ usedUTotal }}U</b><span>在用U位</span></div>
            </div>
          </div>

          <div class="card">
            <div class="card-title">机柜管理</div>
            <div v-if="canEdit()" class="rack-form">
              <select v-model="rowPick" title="选择已有排，或选「＋新增排…」输入任意排号">
                <option v-for="n in existingRows" :key="n" :value="n">{{ n }}排 · {{ rowLetter(n) }}</option>
                <option value="new">＋ 新增排…</option>
              </select>
              <input
                v-if="rowPick === 'new'" v-model.number="newRow"
                type="number" min="1" max="99" style="width: 62px" title="输入新排号（1~99）" placeholder="排号"
              />
              <input v-model="form.code" placeholder="机柜编号" maxlength="8" />
              <select v-model.number="form.u_total">
                <option :value="42">42U</option>
                <option :value="47">47U</option>
                <option :value="22">22U</option>
              </select>
              <button class="btn add" @click="doAddRack">新增</button>
            </div>
            <div class="rack-list">
              <div v-for="r in rackRows" :key="r.id" class="rack-row">
                <div class="rr-top">
                  <b>{{ r.code }}</b>
                  <span class="rr-meta">{{ r.u_total }}U · {{ r.used_u }}U在用</span>
                  <span v-if="r.health === 2" class="badge danger">告警</span>
                  <button v-if="canEdit()" class="del" @click="doDeleteRack(r)">删除</button>
                </div>
                <div class="rr-bar">
                  <i :style="{ width: Math.min(r.usage_pct, 100) + '%', background: usageColorOf(r) }"></i>
                  <span class="rr-pct" :style="{ color: usageColorOf(r) }">{{ r.usage_pct }}%</span>
                </div>
              </div>
            </div>
          </div>

          <div class="card">
            <div class="card-title">图例 · 机柜顶部指示灯</div>
            <div class="legend"><i style="background:#43a047"></i>使用率 &lt; 60%</div>
            <div class="legend"><i style="background:#c0ca33"></i>60% ~ 85%</div>
            <div class="legend"><i style="background:#f57c00"></i>&gt; 85%</div>
            <div class="legend"><i style="background:#e53935"></i>告警机柜（闪烁）</div>
          </div>
          <div class="card tip">点击机柜进入 U 位视图；左键拖拽旋转、滚轮缩放、右键平移。</div>
        </template>

        <template v-else-if="rackData">
          <div class="card">
            <div class="card-title">机柜 {{ rackData.rack.code }}</div>
            <div class="stats">
              <div class="stat"><b>{{ rackData.rack.u_total }}</b><span>总U位</span></div>
              <div class="stat"><b>{{ usedU }}</b><span>已占用</span></div>
              <div class="stat"><b>{{ rackData.rack.u_total - usedU }}</b><span>空闲</span></div>
            </div>
          </div>

          <div class="card">
            <div class="card-title">
              设备库（在库待上架）
              <button class="btn sm ghost extra-btn" @click="router.push(`/sites/${route.params.siteId}/assets`)">去入库</button>
            </div>
            <p class="tip small">
              {{ canEdit() ? '按住设备拖到 3D 机柜目标 U 位松手：绿色可放置、红色冲突，松手生成上架单（演示自动执行）' : '当前为只读账号，设备上架/下架等操作已禁用' }}
            </p>
            <div
              v-for="d in warehouseList" :key="d.id" class="dev-item"
              :class="{ readonly: !canEdit() }"
              @pointerdown.prevent="startDrag(d)"
            >
              <span class="cat" :style="{ background: catColor(d.category) }"></span>
              <div class="dev-text">
                <b>{{ d.name }}</b>
                <span>{{ d.vendor }} {{ d.model }} · {{ d.u_height }}U · {{ d.sn }}</span>
              </div>
            </div>
            <p v-if="!warehouseList.length" class="tip small">在库设备已全部上架</p>
          </div>

          <div class="card" v-if="selected">
            <div class="card-title">设备详情</div>
            <div class="kv"><span>名称</span><b>{{ selected.name }}</b></div>
            <div class="kv"><span>类型</span><b><i class="cat-dot" :style="{ background: catColor(selected.category) }"></i>{{ CAT_NAME[selected.category] ?? '其他' }}</b></div>
            <div class="kv"><span>SN</span><b>{{ selected.sn }}</b></div>
            <div class="kv"><span>型号</span><b>{{ selected.model.vendor }} {{ selected.model.model }} · {{ selected.model.u_height }}U</b></div>
            <div class="kv"><span>业务IP</span><b>{{ selected.biz_ip || '-' }}</b></div>
            <div class="kv"><span>管理IP</span><b>{{ selected.manage_ip || '-' }}</b></div>
            <div class="kv"><span>状态</span><b :style="{ color: selected.health === 2 ? '#ef5350' : '' }">{{ devStatus(selected.status) }}</b></div>
            <div v-if="selSnmp" class="kv">
              <span>SNMP采集</span>
              <b :style="{ color: selSnmp.enabled ? 'var(--ok)' : '' }">
                {{ selSnmp.enabled ? `已启用 · ${selSnmp.version} · ${selSnmp.port}/UDP` : '未开启' }}
              </b>
            </div>
            <template v-if="selHw">
              <div class="hw" v-if="selected.manage_ip">
                <span :class="['badge', selHw.cpu >= 60 ? 'danger' : 'ok']">CPU {{ selHw.cpu }}℃</span>
                <span class="badge ok">进风 {{ selHw.inlet }}℃</span>
                <span :class="['badge', selHw.psu === '正常' ? 'ok' : selHw.psu === '未采集' ? '' : 'danger']" :title="selHw.psuDetail">电源 {{ selHw.psu }}</span>
                <span :class="['badge', selHw.fan === '正常' ? 'ok' : 'danger']" :title="selHw.fanRpm">风扇 {{ selHw.fan }}</span>
              </div>
              <p v-if="selected.manage_ip" class="tip small">硬件数据经管理地址 SNMP 采集（电源/风扇明细悬停查看；后端联调中，当前为演示数据）</p>
              <div class="hw-actions">
                <template v-if="canEdit()">
                  <button class="btn primary sm" @click="openDevEdit">编辑信息</button>
                  <button v-if="selSnmp" class="btn sm" @click="snmpTarget = selected">SNMP设置</button>
                </template>
                <button class="btn sm" @click="router.push(`/sites/${route.params.siteId}/devices?focus=${selected.sn}`)">台账详情</button>
                <button v-if="selected.manage_ip" class="btn sm" @click="openManage('http')">
                  {{ selected.category === 2 ? 'Web管理' : '管理页面' }}
                </button>
                <button v-if="selected.manage_ip && selected.category === 2" class="btn sm" @click="openManage('ssh')">SSH连接</button>
                <button v-if="canEdit()" class="btn danger sm" @click="doUnmount">下架回库</button>
              </div>
            </template>
          </div>
        </template>
      </aside>
    </div>

    <!-- 设备编辑弹窗 -->
    <ModalDialog v-if="showDevEdit" :title="`编辑设备 · ${selected?.name ?? ''}`" :width="520" @close="showDevEdit = false">
      <div class="form-row">
        <div class="field">
          <label>设备名称 <b>*</b></label>
          <input v-model="devForm.name" class="input" maxlength="32" />
        </div>
        <div class="field" style="max-width: 96px">
          <label>起始 U <b>*</b></label>
          <input v-model.number="devForm.startU" class="input" type="number" min="1" max="47" />
        </div>
        <div class="field" style="max-width: 96px">
          <label>U高度 <b>*</b></label>
          <input v-model.number="devForm.uHeight" class="input" type="number" min="1" max="20" />
        </div>
      </div>
      <div class="form-row">
        <div class="field">
          <label>类型（配色）</label>
          <select v-model.number="devForm.category" class="select">
            <option v-for="c in DEVICE_CATS" :key="c.v" :value="c.v">{{ c.label }}</option>
          </select>
        </div>
        <div class="field">
          <label>品牌</label>
          <input v-model="devForm.vendor" class="input" maxlength="24" />
        </div>
        <div class="field">
          <label>型号</label>
          <input v-model="devForm.model" class="input" maxlength="32" />
        </div>
      </div>
      <div class="form-row">
        <div class="field">
          <label>SN 序列号</label>
          <input v-model="devForm.sn" class="input" maxlength="64" />
        </div>
        <div class="field">
          <label>设备状态</label>
          <select v-model.number="devForm.status" class="select">
            <option value="2">在用</option>
            <option value="3">维修</option>
            <option value="4">备用</option>
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="field">
          <label>业务IP</label>
          <input v-model="devForm.bizIp" class="input" maxlength="64" placeholder="如 192.168.100.11" />
        </div>
        <div class="field">
          <label>管理IP（SNMP采集地址）</label>
          <input v-model="devForm.manageIp" class="input" maxlength="64" placeholder="如 192.168.10.11" />
        </div>
      </div>
      <p class="tip small">
        当前占用：<b>U{{ devForm.startU }} ~ U{{ devForm.startU + Math.max(1, devForm.uHeight) - 1 }}</b>（{{ devForm.uHeight }}U）。
        可直接指定起始 U 与高度；与其它设备冲突或超出机柜范围时保存会被拒绝。也可在机柜里按住设备直接拖到目标 U 位。
      </p>
      <p v-if="devErr" style="color: var(--danger); font-size: 12px">{{ devErr }}</p>
      <template #foot>
        <button class="btn" @click="showDevEdit = false">取消</button>
        <button class="btn primary" @click="saveDevEdit">保存</button>
      </template>
    </ModalDialog>

    <!-- SNMP 采集配置 -->
    <SnmpDialog
      v-if="snmpTarget"
      :device-id="snmpTarget.id"
      :device-name="snmpTarget.name"
      :manage-ip="snmpTarget.manage_ip"
      @close="snmpTarget = null"
      @saved="showToast('SNMP 配置已保存')"
    />

    <div class="toast" v-if="toast">{{ toast }}</div>
  </div>
</template>

<style scoped>
.cat-dot { display: inline-block; width: 9px; height: 9px; border-radius: 2px; margin-right: 6px; vertical-align: baseline; }
.dev-item.readonly { cursor: default; opacity: 0.75; border-style: solid; }
/* 机房概况 2×2 网格，标签不换行 */
.stats-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.stats-grid .stat span { white-space: nowrap; }
/* 机柜列表：编号/元信息一行 + 使用率进度条一行；禁止按钮竖排换行（紧凑行高，右侧面板一屏显示更多柜） */
.rack-row { display: block !important; padding: 5px 8px !important; margin-bottom: 1px !important; }
.rr-top { display: flex; align-items: center; gap: 6px; flex-wrap: nowrap; }
.rr-top b { white-space: nowrap; flex: none; }
.rr-meta { flex: 1; min-width: 0; font-size: 12px; color: var(--text-faint); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rr-top .badge { margin-left: auto; flex: none; }
.rr-top .del { margin-left: 0; flex: none; padding: 2px 8px; }
.rr-bar { display: flex; align-items: center; gap: 8px; margin-top: 3px; }
.rr-bar i { display: block; height: 4px; border-radius: 3px; transition: width var(--tr); }
.rr-pct { font-size: 11px; font-variant-numeric: tabular-nums; white-space: nowrap; }
</style>
