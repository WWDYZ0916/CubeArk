<script setup lang="ts">
// 资产出入库：机房资产（进3D设备库）/ IT仓库（键鼠外设领用流转）/ 出入库流水
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import IDCStockInDialog from '../components/IDCStockInDialog.vue'
import ITAssetDialog from '../components/ITAssetDialog.vue'
import ModalDialog from '../components/ModalDialog.vue'
import {
  getSiteById, getIDCAssets, outIDCStock, scrapIDCStock,
  getITAssets, saveITAsset, deleteITAsset, lendIT, returnIT, disposeIT,
  getStockLogs, editWarehouseDevice, unmountDevice
} from '../api/mock'
import { downloadCsv, stampName } from '../utils/export'
import { canEdit } from '../store/auth'
import type { ITAsset, IDCAssetRow, StockOp, AssetKind } from '../types'
import { CAT_NAME as CAT7_NAME, DEVICE_CATS } from '../types'

const route = useRoute()
const router = useRouter()
const siteId = computed(() => Number(route.params.siteId))
const siteName = computed(() => getSiteById(siteId.value)?.name ?? '-')

const tab = ref<'idc' | 'it' | 'log'>('idc')
// 多级导航：子菜单通过 ?tab= 直达对应页签
const ASSET_TABS = ['idc', 'it', 'log'] as const
function syncTabFromQuery() {
  const t = String(route.query.tab ?? '')
  if ((ASSET_TABS as readonly string[]).includes(t)) tab.value = t as 'idc' | 'it' | 'log'
}
function setTab(t: 'idc' | 'it' | 'log') {
  tab.value = t
  if (String(route.query.tab ?? '') !== t) router.replace({ query: { ...route.query, tab: t } })
}
onMounted(syncTabFromQuery)
watch(() => route.query.tab, syncTabFromQuery)
const tick = ref(0)

const toast = ref('')
let toastTimer: number | undefined
function showToast(msg: string, isErr = false) {
  toast.value = msg
  window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => (toast.value = ''), 4000)
  const el = document.querySelector('.toast') as HTMLElement | null
  if (el) el.style.borderColor = isErr ? 'rgba(185, 28, 28, 0.5)' : 'rgba(21, 128, 61, 0.5)'
}

// ---- 机房资产 ----
const idcRows = computed<IDCAssetRow[]>(() => { tick.value; return getIDCAssets(siteId.value) })
const showStockIn = ref(false)

const CAT_NAME = CAT7_NAME
function locText(r: IDCAssetRow) {
  return r.status === '在库' ? '站点库房' : `${r.roomName} · ${r.rackCode} U${r.uStart}-U${r.uEnd}`
}
function outAsset(r: IDCAssetRow) {
  const reason = window.prompt(`出库「${r.name}」原因：`, '调拨其他站点') ?? ''
  if (reason === null) return
  const res = outIDCStock(siteId.value, r.deviceId, reason)
  tick.value++
  showToast(res.ok ? `${r.name} 已出库` : res.error!, !res.ok)
}
function scrapAsset(r: IDCAssetRow) {
  if (!window.confirm(`确认报废「${r.name}」（SN: ${r.sn}）？`)) return
  const res = scrapIDCStock(siteId.value, r.deviceId, '资产报废')
  tick.value++
  showToast(res.ok ? `${r.name} 已报废` : res.error!, !res.ok)
}
function go3d(r: IDCAssetRow) {
  if (r.roomId) router.push(`/sites/${siteId.value}/rooms/${r.roomId}/3d`)
}

// 在库设备编辑（名称/SN/类型/品牌/型号/U高度）
const showIdcEdit = ref(false)
const idcEditRow = ref<IDCAssetRow | null>(null)
const idcForm = ref({ name: '', sn: '', category: 1, vendor: '', model: '', uHeight: 1 })
const idcErr = ref('')
function openIdcEdit(r: IDCAssetRow) {
  idcEditRow.value = r
  idcForm.value = { name: r.name, sn: r.sn, category: r.category, vendor: r.vendor, model: r.model, uHeight: r.uHeight }
  idcErr.value = ''
  showIdcEdit.value = true
}
function saveIdcEdit() {
  const r = idcEditRow.value
  if (!r) return
  const res = editWarehouseDevice(siteId.value, r.deviceId, { ...idcForm.value })
  if (!res.ok) { idcErr.value = res.error!; return }
  showIdcEdit.value = false
  tick.value++
  showToast('设备信息已更新')
}

// 已上架设备下架：移出机柜U位，回到站点设备库（可在3D重新上架）
function unmountAsset(r: IDCAssetRow) {
  if (!r.rackId) return
  if (!window.confirm(`确认下架「${r.name}」（${r.rackCode} U${r.uStart}-U${r.uEnd}）？\n下架后回到站点设备库。`)) return
  const res = unmountDevice(r.rackId, r.deviceId)
  tick.value++
  showToast(res.ok ? `${r.name} 已下架 → 站点设备库` : res.error!, !res.ok)
}

// ---- IT仓库 ----
const itRows = computed<ITAsset[]>(() => { tick.value; return getITAssets(siteId.value) })
const showITDialog = ref(false)
const editIT = ref<ITAsset | null>(null)
const lendTarget = ref<ITAsset | null>(null)
const lendHolder = ref('')

function doLend(a: ITAsset) {
  lendTarget.value = a
  lendHolder.value = ''
}
function confirmLend() {
  if (!lendTarget.value) return
  const res = lendIT(siteId.value, lendTarget.value.id, lendHolder.value)
  tick.value++
  lendTarget.value = null
  showToast(res.ok ? '领用成功' : res.error!, !res.ok)
}
function doReturn(a: ITAsset) {
  const res = returnIT(siteId.value, a.id)
  tick.value++
  showToast(res.ok ? `${a.name} 已归还` : res.error!, !res.ok)
}
function doDispose(a: ITAsset, op: '出库' | '报废') {
  if (!window.confirm(`确认${op}「${a.name}」？`)) return
  const res = disposeIT(siteId.value, a.id, op, op)
  tick.value++
  showToast(res.ok ? `${a.name} 已${op}` : res.error!, !res.ok)
}
function doDeleteIT(a: ITAsset) {
  if (!window.confirm(`确认删除「${a.name}」台账记录？`)) return
  const res = deleteITAsset(siteId.value, a.id)
  tick.value++
  showToast(res.ok ? '已删除' : res.error!, !res.ok)
}
function itStatusClass(s: ITAsset['status']) {
  return s === '在库' ? 'ok' : s === '领用中' ? 'warn' : s === '报废' ? 'danger' : ''
}

// ---- 流水 ----
const fKind = ref<'' | AssetKind>('')
const fOp = ref<'' | StockOp>('')
const fKeyword = ref('')
const logRows = computed(() => {
  tick.value
  return getStockLogs({
    siteId: siteId.value,
    kind: fKind.value || undefined,
    op: fOp.value || undefined,
    keyword: fKeyword.value || undefined
  })
})
const OPS: StockOp[] = ['入库', '出库', '领用', '归还', '上架', '下架', '报废']

// ---- 导出数据（当前Tab） ----
function exportTab() {
  if (tab.value === 'idc') {
    downloadCsv(stampName('机房资产', 'csv'),
      ['资产条码', '设备名称', '类型', 'SN', '品牌', '型号', 'U高', '状态', '位置'],
      idcRows.value.map(r => [r.barcode, r.name, CAT_NAME[r.category], r.sn, r.vendor, r.model, `${r.uHeight}U`, r.status, locText(r)])
    )
  } else if (tab.value === 'it') {
    downloadCsv(stampName('IT仓库资产', 'csv'),
      ['资产条码', '品名', '分类', '规格', '状态', '领用人', '备注'],
      itRows.value.map(a => [a.barcode, a.name, a.type, a.spec, a.status, a.holder, a.remark])
    )
  } else {
    downloadCsv(stampName('出入库流水', 'csv'),
      ['时间', '类型', '操作', '资产', '条码', 'SN', '操作人', '事由', '备注'],
      logRows.value.map(l => [l.time, l.kind === 'idc' ? '机房资产' : 'IT仓库', l.op, l.title, l.barcode, l.sn, l.operator, l.reason, l.remark])
    )
  }
}

function onSaved() {
  tick.value++
  showToast('已保存')
}
</script>

<template>
  <div class="page">
    <div class="page-head page-narrow">
      <div>
        <div class="crumb">
          <span class="link" @click="router.push('/sites')">站点管理</span>
          <span class="sep">/</span><span>{{ siteName }}</span>
        </div>
        <h2 style="margin-top: 6px">资产出入库</h2>
        <p class="sub">机房资产入库后进入设备库可在 3D 机房上架；IT 仓库为键鼠等外设领用流转，不进入 3D 机房</p>
      </div>
      <div style="display: flex; gap: 8px">
        <button class="btn" @click="exportTab">导出数据</button>
        <template v-if="canEdit()">
          <button v-if="tab === 'idc'" class="btn primary" @click="showStockIn = true">＋ 设备入库</button>
          <button v-else-if="tab === 'it'" class="btn primary" @click="editIT = null; showITDialog = true">＋ 新增IT资产</button>
        </template>
      </div>
    </div>

    <div class="tabs page-narrow">
      <button :class="{ on: tab === 'idc' }" @click="setTab('idc')">机房资产</button>
      <button :class="{ on: tab === 'it' }" @click="setTab('it')">IT仓库</button>
      <button :class="{ on: tab === 'log' }" @click="setTab('log')">出入库流水</button>
    </div>

    <!-- 机房资产 -->
    <div v-if="tab === 'idc'" class="card page-narrow" style="padding: 0; overflow: hidden">
      <div style="overflow-x: auto">
        <table class="table" style="min-width: 1000px">
          <thead>
            <tr>
              <th>资产条码</th><th>设备名称</th><th>类型</th><th>SN</th><th>品牌型号</th>
              <th>U高</th><th>状态</th><th>位置</th><th style="width: 240px">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in idcRows" :key="r.deviceId">
              <td>{{ r.barcode || '-' }}</td>
              <td><b>{{ r.name }}</b></td>
              <td>{{ CAT_NAME[r.category] }}</td>
              <td style="font-family: monospace">{{ r.sn }}</td>
              <td>{{ r.vendor }} {{ r.model }}</td>
              <td>{{ r.uHeight }}U</td>
              <td><span :class="['badge', r.status === '已上架' ? 'ok' : 'warn']">{{ r.status }}</span></td>
              <td>{{ locText(r) }}</td>
              <td>
                <button v-if="r.status !== '在库'" class="btn sm" @click="go3d(r)">定位3D</button>
                <template v-if="canEdit()">
                  <template v-if="r.status === '在库'">
                    <button class="btn sm" @click="openIdcEdit(r)">编辑</button>
                    <button class="btn sm" @click="outAsset(r)">出库</button>
                    <button class="btn danger sm" @click="scrapAsset(r)">报废</button>
                  </template>
                  <template v-else>
                    <button class="btn danger sm" @click="unmountAsset(r)">下架</button>
                  </template>
                </template>
                <span v-if="!canEdit() && r.status === '在库'" class="tip small">只读</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-if="!idcRows.length" class="empty">暂无机房资产，点击右上角「设备入库」</p>
    </div>

    <!-- IT仓库 -->
    <div v-else-if="tab === 'it'" class="card page-narrow" style="padding: 0; overflow: hidden">
      <div style="overflow-x: auto">
        <table class="table" style="min-width: 960px">
          <thead>
            <tr>
              <th>资产条码</th><th>品名</th><th>分类</th><th>规格</th><th>状态</th>
              <th>领用人</th><th>备注</th><th style="width: 280px">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="a in itRows" :key="a.id">
              <td style="font-family: monospace">{{ a.barcode }}</td>
              <td><b>{{ a.name }}</b></td>
              <td>{{ a.type }}</td>
              <td>{{ a.spec || '-' }}</td>
              <td><span :class="['badge', itStatusClass(a.status)]">{{ a.status }}</span></td>
              <td>{{ a.holder || '-' }}</td>
              <td>{{ a.remark || '-' }}</td>
              <td>
                <template v-if="canEdit()">
                  <button v-if="a.status === '在库'" class="btn primary sm" @click="doLend(a)">领用</button>
                  <button v-if="a.status === '领用中'" class="btn primary sm" @click="doReturn(a)">归还</button>
                  <button v-if="a.status !== '报废' && a.status !== '已出库'" class="btn sm" @click="editIT = a; showITDialog = true">编辑</button>
                  <button v-if="a.status !== '报废' && a.status !== '已出库'" class="btn sm" @click="doDispose(a, '出库')">出库</button>
                  <button v-if="a.status !== '报废' && a.status !== '已出库'" class="btn danger sm" @click="doDispose(a, '报废')">报废</button>
                  <button v-if="a.status === '在库'" class="btn danger sm" @click="doDeleteIT(a)">删除</button>
                </template>
                <span v-else class="tip small">只读</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-if="!itRows.length" class="empty">暂无IT资产，点击右上角「新增IT资产」</p>
    </div>

    <!-- 流水 -->
    <div v-else class="card page-narrow">
      <div class="filters">
        <select v-model="fKind" class="select" style="width: 130px">
          <option value="">全部类型</option><option value="idc">机房资产</option><option value="it">IT仓库</option>
        </select>
        <select v-model="fOp" class="select" style="width: 110px">
          <option value="">全部操作</option>
          <option v-for="o in OPS" :key="o" :value="o">{{ o }}</option>
        </select>
        <input v-model="fKeyword" class="input" style="width: 220px" placeholder="搜索 资产/条码/SN/操作人" />
      </div>
      <div style="overflow-x: auto; max-height: 60vh">
        <table class="table" style="min-width: 1080px">
          <thead>
            <tr>
              <th>时间</th><th>类型</th><th>操作</th><th>资产</th><th>条码</th>
              <th>SN</th><th>操作人</th><th>事由</th><th>备注</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="l in logRows" :key="l.id">
              <td style="white-space: nowrap">{{ l.time }}</td>
              <td>{{ l.kind === 'idc' ? '机房' : 'IT仓库' }}</td>
              <td><span class="badge">{{ l.op }}</span></td>
              <td><b>{{ l.title }}</b></td>
              <td>{{ l.barcode || '-' }}</td>
              <td style="font-family: monospace">{{ l.sn || '-' }}</td>
              <td>{{ l.operator }}</td>
              <td class="ell" :title="l.reason || '-'">{{ l.reason || '-' }}</td>
              <td class="ell" :title="l.remark || '-'">{{ l.remark || '-' }}</td>
            </tr>
          </tbody>
        </table>
        <p v-if="!logRows.length" class="empty">暂无流水记录</p>
      </div>
    </div>

    <IDCStockInDialog v-if="showStockIn" :site-id="siteId" @close="showStockIn = false" @saved="onSaved" />
    <ITAssetDialog v-if="showITDialog" :asset="editIT" :site-id="siteId" @close="showITDialog = false" @saved="onSaved" />

    <ModalDialog v-if="lendTarget" title="资产领用" :width="420" @close="lendTarget = null">
      <div class="field">
        <label>领用资产</label>
        <p style="font-size: 13px">{{ lendTarget.name }}（{{ lendTarget.spec || lendTarget.type }}）</p>
      </div>
      <div class="field">
        <label>领用人 <b>*</b></label>
        <input v-model="lendHolder" class="input" placeholder="请输入领用人姓名" maxlength="16" />
      </div>
      <template #foot>
        <button class="btn" @click="lendTarget = null">取消</button>
        <button class="btn primary" @click="confirmLend">确认领用</button>
      </template>
    </ModalDialog>

    <!-- 在库设备编辑 -->
    <ModalDialog v-if="showIdcEdit" :title="`编辑设备 · ${idcEditRow?.name ?? ''}`" :width="560" @close="showIdcEdit = false">
      <div class="form-row">
        <div class="field">
          <label>设备名称 <b>*</b></label>
          <input v-model="idcForm.name" class="input" maxlength="32" />
        </div>
        <div class="field">
          <label>SN 序列号</label>
          <input v-model="idcForm.sn" class="input" maxlength="64" />
        </div>
      </div>
      <div class="form-row">
        <div class="field">
          <label>设备类型（3D配色）</label>
          <select v-model.number="idcForm.category" class="select">
            <option v-for="c in DEVICE_CATS" :key="c.v" :value="c.v">{{ c.label }}</option>
          </select>
        </div>
        <div class="field">
          <label>品牌</label>
          <input v-model="idcForm.vendor" class="input" maxlength="32" />
        </div>
        <div class="field">
          <label>型号</label>
          <input v-model="idcForm.model" class="input" maxlength="32" />
        </div>
        <div class="field" style="max-width: 90px">
          <label>U高度 <b>*</b></label>
          <input v-model.number="idcForm.uHeight" class="input" type="number" min="1" max="20" />
        </div>
      </div>
      <p class="tip small">仅「在库」设备可编辑基础信息；已上架设备请在 3D 机柜中编辑或先下架。</p>
      <p v-if="idcErr" style="color: var(--danger); font-size: 12px">{{ idcErr }}</p>
      <template #foot>
        <button class="btn" @click="showIdcEdit = false">取消</button>
        <button class="btn primary" @click="saveIdcEdit">保存</button>
      </template>
    </ModalDialog>

    <div class="toast" v-if="toast">{{ toast }}</div>
  </div>
</template>

<style scoped>
.page-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
.page-head .sub { font-size: 12px; color: var(--text-faint); margin-top: 4px; }
.tabs { display: flex; gap: 8px; margin-bottom: 14px; }
.tabs button {
  background: var(--bg-panel); border: 1px solid var(--line-strong); color: var(--text-muted);
  padding: 7px 20px; border-radius: 8px; cursor: pointer; font-size: 13px; transition: all var(--tr);
}
.tabs button.on { background: var(--accent-deep); border-color: rgba(1, 1, 32, 0.35); color: var(--accent); }
.filters { display: flex; gap: 10px; margin-bottom: 12px; }
</style>
