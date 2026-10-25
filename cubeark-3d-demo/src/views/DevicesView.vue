<script setup lang="ts">
// 设备台账：机房全部设备（在库+在用）统一台账，与3D机柜U位双向关联
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ModalDialog from '../components/ModalDialog.vue'
import SnmpDialog from '../components/SnmpDialog.vue'
import {
  getDeviceLedger, saveLedgerMeta, hwStatus,
  editMountedDevice, editWarehouseDevice, deleteDevice
} from '../api/mock'
import { downloadCsv, stampName } from '../utils/export'
import { canEdit } from '../store/auth'
import type { LedgerRow } from '../types'
import { CAT_NAME, DEVICE_CATS } from '../types'

const route = useRoute()
const router = useRouter()
const siteId = computed(() => Number(route.params.siteId))

const tick = ref(0)
const keyword = ref('')
const fStatus = ref<'' | '在用' | '在库'>('')
const focusSn = ref(String(route.query.focus ?? ''))

const rows = computed<LedgerRow[]>(() => {
  tick.value
  let list = getDeviceLedger(siteId.value)
  if (fStatus.value) list = list.filter(r => r.status === fStatus.value)
  if (keyword.value.trim()) {
    const k = keyword.value.trim().toLowerCase()
    list = list.filter(r => `${r.name}${r.sn}${r.vendor}${r.model}${r.manageIp ?? ''}${r.rackCode ?? ''}${r.meta.owner ?? ''}`.toLowerCase().includes(k))
  }
  return list
})

function locText(r: LedgerRow) {
  if (!r.mounted) return '站点库房'
  return `${r.roomName} · ${r.rackCode} U${r.uStart}-U${r.uEnd}`
}

// ---- 编辑（在用设备走3D编辑API含U位重排；在库设备编辑基础信息） ----
const editing = ref<LedgerRow | null>(null)
const editForm = ref({
  name: '', sn: '', category: 1, vendor: '', model: '', uHeight: 1, startU: 1,
  bizIp: '', manageIp: '', status: 2,
  mac: '', warrantyEnd: '', owner: '', remark: ''
})
const editErr = ref('')
function openEdit(r: LedgerRow) {
  editing.value = r
  editForm.value = {
    name: r.name, sn: r.sn, category: r.category, vendor: r.vendor, model: r.model,
    uHeight: r.uHeight ?? (r.uStart && r.uEnd ? r.uEnd - r.uStart + 1 : 1),
    startU: r.uStart ?? 1,
    bizIp: r.bizIp ?? '', manageIp: r.manageIp ?? '',
    status: r.mounted ? 2 : 1,
    mac: r.meta.mac ?? '', warrantyEnd: r.meta.warrantyEnd ?? '',
    owner: r.meta.owner ?? '', remark: r.meta.remark ?? ''
  }
  editErr.value = ''
}
function saveEdit() {
  const r = editing.value
  if (!r) return
  let res: { ok: boolean; error?: string }
  if (r.mounted) {
    res = editMountedDevice(r.rackId!, r.id, {
      name: editForm.value.name, sn: editForm.value.sn,
      uHeight: editForm.value.uHeight,
      uStart: editForm.value.startU,
      category: editForm.value.category,
      vendor: editForm.value.vendor,
      model: editForm.value.model,
      bizIp: editForm.value.bizIp, manageIp: editForm.value.manageIp,
      status: editForm.value.status
    })
  } else {
    res = editWarehouseDevice(siteId.value, r.id, {
      name: editForm.value.name, sn: editForm.value.sn,
      category: editForm.value.category, vendor: editForm.value.vendor,
      model: editForm.value.model, uHeight: editForm.value.uHeight
    })
  }
  if (!res.ok) { editErr.value = res.error!; return }
  saveLedgerMeta(r.id, { mac: editForm.value.mac, warrantyEnd: editForm.value.warrantyEnd, owner: editForm.value.owner, remark: editForm.value.remark })
  tick.value++
  editing.value = null
}
function doDelete(r: LedgerRow) {
  const pos = r.mounted ? `（将从 ${r.rackCode} U${r.uStart}-U${r.uEnd} 下架并删除）` : '（在库设备）'
  if (!window.confirm(`确认删除「${r.name}」${pos}？删除后不可恢复。`)) return
  const res = deleteDevice(siteId.value, r.id)
  tick.value++
  if (!res.ok) window.alert(res.error)
}
function go3d(r: LedgerRow) {
  if (r.roomId) router.push(`/sites/${siteId.value}/rooms/${r.roomId}/3d`)
}
function openManage(r: LedgerRow) {
  if (r.manageIp) window.open(`http://${r.manageIp}`, '_blank')
}
function openSSH(r: LedgerRow) {
  if (r.manageIp) window.open(`ssh://${r.manageIp}`, '_blank')
}
// SNMP 配置（交换机/服务器/防火墙/存储类在用设备）
const SNMP_CATS = [1, 2, 3, 4, 5, 6]
const snmpRow = ref<LedgerRow | null>(null)
function onSnmpSaved() {
  tick.value++
}

// ---- 导出CSV（按当前筛选结果） ----
function exportCsv() {
  downloadCsv(stampName('设备台账', 'csv'),
    ['设备名称', '类型', '品牌', '型号', 'SN', '状态', '业务IP', '管理IP', 'MAC', '位置', '维保到期', '责任人', '备注'],
    rows.value.map(r => [
      r.name, CAT_NAME[r.category] ?? '其他', r.vendor, r.model, r.sn, r.status,
      r.bizIp ?? '', r.manageIp ?? '', r.meta.mac ?? '', locText(r),
      r.meta.warrantyEnd ?? '', r.meta.owner ?? '', r.meta.remark ?? ''
    ])
  )
}
</script>

<template>
  <div class="page">
    <div class="page-head page-narrow">
      <div>
        <h2>设备台账</h2>
        <p class="sub">站点全部机房设备统一台账 · 在用设备可定位到 3D 机柜 U 位 · 已配置管理地址的设备可直开管理页面/SSH</p>
      </div>
      <button class="btn" @click="exportCsv">导出数据</button>
    </div>

    <div class="card page-narrow">
      <div class="filters">
        <input v-model="keyword" class="input" style="width: 260px" placeholder="搜索 名称/SN/型号/IP/机柜/责任人" />
        <select v-model="fStatus" class="select" style="width: 120px">
          <option value="">全部状态</option><option>在用</option><option>在库</option>
        </select>
        <span class="count">共 {{ rows.length }} 台</span>
      </div>
      <div style="overflow-x: auto; max-height: calc(100vh - 240px)">
        <table class="table" style="min-width: 1320px">
          <thead>
            <tr>
              <th>设备名称</th><th>类型</th><th>品牌型号</th><th>SN</th><th>业务IP</th><th>管理IP</th>
              <th>MAC</th><th>位置</th><th>硬件状态</th><th>维保到期</th><th>责任人</th>
              <th>状态</th><th style="width: 230px">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in rows" :key="r.id" :class="{ focused: r.sn === focusSn }">
              <td><b>{{ r.name }}</b></td>
              <td>{{ CAT_NAME[r.category] ?? '其他' }}</td>
              <td>{{ r.vendor }} {{ r.model }}</td>
              <td style="font-family: monospace">{{ r.sn }}</td>
              <td style="font-family: monospace">{{ r.bizIp || '-' }}</td>
              <td style="font-family: monospace">{{ r.manageIp || '-' }}</td>
              <td style="font-family: monospace">{{ r.meta.mac || '-' }}</td>
              <td class="ell" :title="locText(r)">{{ locText(r) }}</td>
              <td>
                <template v-if="r.manageIp">
                  <span :class="['badge', hwStatus(r.id).cpu >= 60 ? 'danger' : 'ok']">{{ hwStatus(r.id).cpu }}℃</span>
                </template>
                <span v-else class="badge">-</span>
              </td>
              <td>{{ r.meta.warrantyEnd || '-' }}</td>
              <td>{{ r.meta.owner || '-' }}</td>
              <td><span :class="['badge', r.mounted ? 'ok' : 'warn']">{{ r.status }}</span></td>
              <td>
                <button v-if="canEdit()" class="btn sm" @click="openEdit(r)">编辑</button>
                <button v-if="canEdit() && r.mounted && SNMP_CATS.includes(r.category)" class="btn sm" @click="snmpRow = r">SNMP</button>
                <button v-if="r.mounted" class="btn primary sm" @click="go3d(r)">定位3D</button>
                <button v-if="r.manageIp" class="btn sm" @click="openManage(r)">管理页</button>
                <button v-if="r.manageIp && r.category === 2" class="btn sm" @click="openSSH(r)">SSH</button>
                <button v-if="canEdit()" class="btn danger sm" @click="doDelete(r)">删除</button>
              </td>
            </tr>
          </tbody>
        </table>
        <p v-if="!rows.length" class="empty">暂无设备</p>
      </div>
    </div>

    <ModalDialog v-if="editing" :title="`编辑设备 · ${editing.name}`" :width="640" @close="editing = null">
      <div class="form-row">
        <div class="field">
          <label>设备名称 <b>*</b></label>
          <input v-model="editForm.name" class="input" maxlength="32" />
        </div>
        <div class="field">
          <label>SN 序列号</label>
          <input v-model="editForm.sn" class="input" maxlength="64" />
        </div>
        <div class="field" style="max-width: 90px">
          <label>U高度 <b>*</b></label>
          <input v-model.number="editForm.uHeight" class="input" type="number" min="1" max="20" />
        </div>
        <div class="field" v-if="editing.mounted" style="max-width: 90px">
          <label>起始 U <b>*</b></label>
          <input v-model.number="editForm.startU" class="input" type="number" min="1" max="47" />
        </div>
      </div>
      <div class="form-row">
        <div class="field">
          <label>品牌</label>
          <input v-model="editForm.vendor" class="input" maxlength="32" />
        </div>
        <div class="field">
          <label>型号</label>
          <input v-model="editForm.model" class="input" maxlength="32" />
        </div>
        <div class="field">
          <label>类型（配色）</label>
          <select v-model.number="editForm.category" class="select">
            <option v-for="c in DEVICE_CATS" :key="c.v" :value="c.v">{{ c.label }}</option>
          </select>
        </div>
      </div>
      <div class="form-row" v-if="editing.mounted">
        <div class="field">
          <label>业务IP</label>
          <input v-model="editForm.bizIp" class="input" maxlength="64" />
        </div>
        <div class="field">
          <label>管理IP</label>
          <input v-model="editForm.manageIp" class="input" maxlength="64" />
        </div>
        <div class="field" style="max-width: 120px">
          <label>设备状态</label>
          <select v-model.number="editForm.status" class="select">
            <option value="2">在用</option>
            <option value="3">维修</option>
            <option value="4">备用</option>
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="field">
          <label>MAC 地址</label>
          <input v-model="editForm.mac" class="input" placeholder="如 00:1A:2B:3C:4D:5E" maxlength="32" />
        </div>
        <div class="field">
          <label>维保到期日</label>
          <input v-model="editForm.warrantyEnd" class="input" type="date" />
        </div>
      </div>
      <div class="form-row">
        <div class="field">
          <label>责任人</label>
          <input v-model="editForm.owner" class="input" maxlength="16" />
        </div>
        <div class="field">
          <label>备注</label>
          <input v-model="editForm.remark" class="input" maxlength="64" />
        </div>
      </div>
      <p class="tip small" v-if="editing.mounted">在用设备：可指定起始 U 与 U 高度（占用 U{{ editForm.startU }}~U{{ editForm.startU + Math.max(1, editForm.uHeight) - 1 }}），与其它设备冲突或超出机柜范围时保存被拒绝；也可在 3D 机柜中直接拖动设备换 U 位。</p>
      <p class="tip small" v-else>在库设备：全部字段可改，重新上架时生效。</p>
      <p v-if="editErr" style="color: var(--danger); font-size: 12px">{{ editErr }}</p>
      <template #foot>
        <button class="btn" @click="editing = null">取消</button>
        <button class="btn primary" @click="saveEdit">保存</button>
      </template>
    </ModalDialog>

    <SnmpDialog
      v-if="snmpRow"
      :device-id="snmpRow.id"
      :device-name="snmpRow.name"
      :manage-ip="snmpRow.manageIp"
      @close="snmpRow = null"
      @saved="onSnmpSaved"
    />
  </div>
</template>

<style scoped>
.page-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
.page-head .sub { font-size: 12px; color: var(--text-faint); margin-top: 4px; }
.filters { display: flex; gap: 10px; align-items: center; margin-bottom: 12px; }
.count { font-size: 12px; color: var(--text-faint); }
.focused { outline: 1px solid var(--accent); outline-offset: -1px; background: rgba(1, 1, 32, 0.05) !important; }
</style>
