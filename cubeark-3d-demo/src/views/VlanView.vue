<script setup lang="ts">
// VLAN规划 + IP地址分配台账：网段一键生成IP池、分配/释放、关联设备/点位、Excel导入、CSV导出
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import * as XLSX from 'xlsx'
import ModalDialog from '../components/ModalDialog.vue'
import {
  getSiteById, getVlanPlans, saveVlanPlan, deleteVlanPlan, importVlans,
  generateIpPool, getIpEntries, saveIpEntry, deleteIpEntry, ipStats
} from '../api/mock'
import type { VlanPlan, IpEntry, IpStatus } from '../types'
import { canEdit } from '../store/auth'

const route = useRoute()
const router = useRouter()
const siteId = computed(() => Number(route.params.siteId))
const siteName = computed(() => getSiteById(siteId.value)?.name ?? '-')

const tab = ref<'vlan' | 'ip'>('vlan')
// 多级导航：子菜单通过 ?tab= 直达对应页签
const VLAN_TABS = ['vlan', 'ip'] as const
function syncTabFromQuery() {
  const t = String(route.query.tab ?? '')
  if ((VLAN_TABS as readonly string[]).includes(t)) tab.value = t as 'vlan' | 'ip'
}
function setTab(t: 'vlan' | 'ip') {
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

const plans = computed<VlanPlan[]>(() => { tick.value; return getVlanPlans(siteId.value) })
const stats = computed(() => { tick.value; return ipStats(siteId.value) })
const planName = (planId: number) => plans.value.find(p => p.id === planId)?.name ?? '-'

// ---- VLAN CRUD ----
const showVlan = ref(false)
const editingVlan = ref<VlanPlan | null>(null)
const vlanForm = ref(emptyVlan())
const vlanErr = ref('')
function emptyVlan() {
  return { vlanId: 10, name: '', cidr: '192.168.10.0/24', gateway: '192.168.10.1', ipRange: '', purpose: '', owner: '', remark: '' }
}
function openVlanCreate() {
  editingVlan.value = null
  vlanForm.value = emptyVlan()
  vlanErr.value = ''
  showVlan.value = true
}
function openVlanEdit(v: VlanPlan) {
  editingVlan.value = v
  vlanForm.value = { vlanId: v.vlanId, name: v.name, cidr: v.cidr, gateway: v.gateway, ipRange: v.ipRange, purpose: v.purpose, owner: v.owner, remark: v.remark }
  vlanErr.value = ''
  showVlan.value = true
}
function submitVlan() {
  const res = saveVlanPlan(siteId.value, { id: editingVlan.value?.id, ...vlanForm.value })
  if (!res.ok) { vlanErr.value = res.error!; return }
  tick.value++
  showVlan.value = false
  showToast(editingVlan.value ? 'VLAN已更新' : 'VLAN已新增')
}
function removeVlan(v: VlanPlan) {
  if (!window.confirm(`确认删除 VLAN ${v.vlanId}（${v.name}）？其IP台账将一并删除`)) return
  const res = deleteVlanPlan(siteId.value, v.id)
  tick.value++
  if (!res.ok) { showToast(res.error!, true); return }
  showToast(`VLAN ${v.vlanId} 已删除`)
}
function genPool(v: VlanPlan) {
  const ips = getIpEntries(siteId.value, { planId: v.id })
  if (ips.length && !window.confirm(`该VLAN已有 ${ips.length} 条IP记录，重新生成将覆盖（已分配记录不保留），确认？`)) return
  const res = generateIpPool(siteId.value, v.id)
  tick.value++
  if (!res.ok) { showToast(res.error!, true); return }
  showToast(`已生成IP池 ${res.count} 条（${v.cidr}，网关已保留）`)
  tab.value = 'ip'
}

// ---- VLAN Excel 导入（列序：A VLANID B 名称 C 网段 D 网关 E 可用范围 F 用途 G 负责人 H 备注） ----
const showImport = ref(false)
const preview = ref<Array<Omit<VlanPlan, 'id'>>>([])
const importErr = ref('')
const fileRef = ref<HTMLInputElement>()
async function onPickFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  importErr.value = ''
  preview.value = []
  try {
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' })
    const grid = XLSX.utils.sheet_to_json<string[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: '' })
    const out: Array<Omit<VlanPlan, 'id'>> = []
    for (const row of grid) {
      const id = Number(String(row[0] ?? '').trim())
      const name = String(row[1] ?? '').trim()
      if (!id || id < 1 || id > 4094 || !name) continue
      if (String(row[0]).includes('ID') || name.includes('名称')) continue
      out.push({
        vlanId: id, name,
        cidr: String(row[2] ?? '').trim() || '',
        gateway: String(row[3] ?? '').trim() || '',
        ipRange: String(row[4] ?? '').trim() || '',
        purpose: String(row[5] ?? '').trim() || '',
        owner: String(row[6] ?? '').trim() || '',
        remark: String(row[7] ?? '').trim() || ''
      })
    }
    if (!out.length) importErr.value = '未识别到数据：需 A列=VLAN ID(数字)、B列=名称'
    preview.value = out
  } catch (ex: unknown) {
    importErr.value = `解析失败：${ex instanceof Error ? ex.message : String(ex)}`
  } finally {
    if (fileRef.value) fileRef.value.value = ''
  }
}
function confirmImport() {
  const res = importVlans(siteId.value, preview.value)
  tick.value++
  showImport.value = false
  preview.value = []
  showToast(`导入成功 ${res.ok} 条${res.skip ? `，跳过重复 ${res.skip} 条` : ''}`)
}

// ---- VLAN 导出 ----
function exportVlanCsv() {
  const head = ['VLAN ID', '名称', '网段', '网关', '可用IP范围', '用途', '负责人', '备注']
  const esc = (s: string | number) => '"' + String(s ?? '').replace(/"/g, '""') + '"'
  const lines = [head.join(',')]
  for (const v of plans.value) lines.push([v.vlanId, v.name, v.cidr, v.gateway, v.ipRange, v.purpose, v.owner, v.remark].map(esc).join(','))
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `VLAN规划_${siteName.value}.csv`
  a.click()
  URL.revokeObjectURL(a.href)
}

// ---- IP台账 ----
const fPlan = ref(0)
const fStatus = ref('')
const fKeyword = ref('')
const ipRows = computed<IpEntry[]>(() => {
  tick.value
  return getIpEntries(siteId.value, {
    planId: fPlan.value || undefined,
    status: fStatus.value || undefined,
    keyword: fKeyword.value || undefined
  })
})
const showIp = ref(false)
const editingIp = ref<IpEntry | null>(null)
const ipForm = ref<{ planId: number; ip: string; status: IpStatus; ref: string; remark: string }>({ planId: 0, ip: '', status: '空闲', ref: '', remark: '' })
const ipErr = ref('')
function openIpCreate(planId?: number) {
  editingIp.value = null
  ipForm.value = { planId: planId ?? fPlan.value ?? plans.value[0]?.id ?? 0, ip: '', status: '空闲', ref: '', remark: '' }
  ipErr.value = ''
  showIp.value = true
}
function openIpEdit(e: IpEntry) {
  editingIp.value = e
  ipForm.value = { planId: e.planId, ip: e.ip, status: e.status, ref: e.ref, remark: e.remark }
  ipErr.value = ''
  showIp.value = true
}
function submitIp() {
  const res = saveIpEntry(siteId.value, { id: editingIp.value?.id, ...ipForm.value })
  if (!res.ok) { ipErr.value = res.error!; return }
  tick.value++
  showIp.value = false
  showToast(editingIp.value ? 'IP记录已更新' : 'IP记录已新增')
}
function toggleIp(e: IpEntry) {
  e.status = e.status === '已分配' ? '空闲' : '已分配'
  if (e.status === '空闲') e.ref = ''
  tick.value++
}
function removeIp(e: IpEntry) {
  if (!window.confirm(`确认删除 ${e.ip}？`)) return
  deleteIpEntry(siteId.value, e.id)
  tick.value++
}
function exportIpCsv() {
  const head = ['IP', 'VLAN', '状态', '关联设备/点位', '备注']
  const esc = (s: string | number) => '"' + String(s ?? '').replace(/"/g, '""') + '"'
  const lines = [head.join(',')]
  for (const e of ipRows.value) {
    const p = plans.value.find(x => x.id === e.planId)
    lines.push([e.ip, p ? `${p.vlanId}(${p.name})` : '-', e.status, e.ref, e.remark].map(esc).join(','))
  }
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `IP台账_${siteName.value}.csv`
  a.click()
  URL.revokeObjectURL(a.href)
}
function stClass(s: string) {
  return s === '已分配' ? 'ok' : s === '保留' ? 'orange' : 'warn'
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
        <h2 style="margin-top: 6px">VLAN规划 · IP地址台账</h2>
        <p class="sub">VLAN ID/名称/网段/网关/可用范围/用途/负责人 · 网段一键生成IP池 · 分配状态标记并关联设备/点位</p>
      </div>
      <div class="stats" style="width: 320px">
        <div class="stat"><b>{{ plans.length }}</b><span>VLAN</span></div>
        <div class="stat"><b>{{ stats.used }}</b><span>已分配IP</span></div>
        <div class="stat"><b>{{ stats.free }}</b><span>空闲IP</span></div>
      </div>
    </div>

    <div class="tabs page-narrow">
      <button :class="{ on: tab === 'vlan' }" @click="setTab('vlan')">VLAN规划</button>
      <button :class="{ on: tab === 'ip' }" @click="setTab('ip')">IP地址台账</button>
    </div>

    <!-- VLAN规划 -->
    <div v-if="tab === 'vlan'" class="card page-narrow" style="padding: 0; overflow: hidden">
      <div class="bar">
        <template v-if="canEdit()">
          <button class="btn primary" @click="openVlanCreate">＋ 新增VLAN</button>
          <button class="btn" @click="showImport = true">导入Excel</button>
        </template>
        <button class="btn" @click="exportVlanCsv">导出CSV</button>
      </div>
      <div style="overflow-x: auto">
        <table class="table" style="min-width: 980px">
          <thead>
            <tr>
              <th>VLAN ID</th><th>名称</th><th>网段</th><th>网关</th><th>可用IP范围</th>
              <th>用途</th><th>负责人</th><th>备注</th><th style="width: 240px">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="v in plans" :key="v.id">
              <td><b class="mono">{{ v.vlanId }}</b></td>
              <td><b>{{ v.name }}</b></td>
              <td class="mono">{{ v.cidr }}</td>
              <td class="mono">{{ v.gateway || '-' }}</td>
              <td class="mono">{{ v.ipRange || '整段' }}</td>
              <td>{{ v.purpose || '-' }}</td>
              <td>{{ v.owner || '-' }}</td>
              <td class="ell" :title="v.remark">{{ v.remark || '-' }}</td>
              <td>
                <template v-if="canEdit()">
                  <button class="btn primary sm" @click="genPool(v)">生成IP池</button>
                  <button class="btn sm" @click="openVlanEdit(v)">编辑</button>
                </template>
                <button class="btn sm" @click="setTab('ip'); fPlan = v.id">IP台账</button>
                <button v-if="canEdit()" class="btn danger sm" @click="removeVlan(v)">删除</button>
              </td>
            </tr>
          </tbody>
        </table>
        <p v-if="!plans.length" class="empty">暂无VLAN规划，点击「新增VLAN」或「导入Excel」</p>
      </div>
    </div>

    <!-- IP台账 -->
    <div v-else class="card page-narrow">
      <div class="bar">
        <select v-model.number="fPlan" class="select" style="width: 190px">
          <option :value="0">全部VLAN</option>
          <option v-for="p in plans" :key="p.id" :value="p.id">{{ p.vlanId }} · {{ p.name }}</option>
        </select>
        <select v-model="fStatus" class="select" style="width: 110px">
          <option value="">全部状态</option><option>已分配</option><option>空闲</option><option>保留</option>
        </select>
        <input v-model="fKeyword" class="input" style="width: 200px" placeholder="搜索 IP/关联/备注" />
        <span style="flex: 1"></span>
        <span class="count">{{ ipRows.length }} 条</span>
        <button v-if="canEdit()" class="btn" @click="openIpCreate(fPlan || undefined)">＋ 新增IP</button>
        <button class="btn" @click="exportIpCsv">导出CSV</button>
      </div>
      <div style="overflow-x: auto; max-height: calc(100vh - 320px)">
        <table class="table" style="min-width: 820px">
          <thead>
            <tr><th>IP地址</th><th>VLAN</th><th>状态</th><th>关联设备/点位</th><th>备注</th><th style="width: 220px">操作</th></tr>
          </thead>
          <tbody>
            <tr v-for="e in ipRows" :key="e.id">
              <td class="mono"><b>{{ e.ip }}</b></td>
              <td>{{ planName(e.planId) }}</td>
              <td><span :class="['badge', stClass(e.status)]">{{ e.status }}</span></td>
              <td class="ell" :title="e.ref">{{ e.ref || '-' }}</td>
              <td class="ell" :title="e.remark">{{ e.remark || '-' }}</td>
              <td>
                <template v-if="canEdit()">
                  <button class="btn primary sm" @click="toggleIp(e)">{{ e.status === '已分配' ? '释放' : '分配' }}</button>
                  <button class="btn sm" @click="openIpEdit(e)">编辑</button>
                  <button class="btn danger sm" @click="removeIp(e)">删除</button>
                </template>
                <span v-else class="tip small">只读</span>
              </td>
            </tr>
          </tbody>
        </table>
        <p v-if="!ipRows.length" class="empty">暂无IP记录：在VLAN规划中点「生成IP池」可按网段批量生成</p>
      </div>
    </div>

    <!-- VLAN 弹窗 -->
    <ModalDialog v-if="showVlan" :title="editingVlan ? `编辑 VLAN ${editingVlan.vlanId}` : '新增VLAN'" :width="580" @close="showVlan = false">
      <div class="form-row">
        <div class="field" style="max-width: 130px">
          <label>VLAN ID <b>*</b></label>
          <input v-model.number="vlanForm.vlanId" class="input" type="number" min="1" max="4094" />
        </div>
        <div class="field">
          <label>名称 <b>*</b></label>
          <input v-model="vlanForm.name" class="input" maxlength="24" placeholder="如 管理网" />
        </div>
      </div>
      <div class="form-row">
        <div class="field">
          <label>网段 <b>*</b></label>
          <input v-model="vlanForm.cidr" class="input" placeholder="192.168.30.0/24" maxlength="20" />
        </div>
        <div class="field">
          <label>网关</label>
          <input v-model="vlanForm.gateway" class="input" placeholder="192.168.30.1" maxlength="16" />
        </div>
      </div>
      <div class="field">
        <label>可用IP范围（如 192.168.30.11-250，留空=整段；生成IP池时使用）</label>
        <input v-model="vlanForm.ipRange" class="input" maxlength="40" />
      </div>
      <div class="form-row">
        <div class="field">
          <label>用途</label>
          <input v-model="vlanForm.purpose" class="input" maxlength="24" />
        </div>
        <div class="field">
          <label>负责人</label>
          <input v-model="vlanForm.owner" class="input" maxlength="16" />
        </div>
      </div>
      <div class="field">
        <label>备注</label>
        <input v-model="vlanForm.remark" class="input" maxlength="64" />
      </div>
      <p v-if="vlanErr" style="color: var(--danger); font-size: 12px">{{ vlanErr }}</p>
      <template #foot>
        <button class="btn" @click="showVlan = false">取消</button>
        <button class="btn primary" @click="submitVlan">保存</button>
      </template>
    </ModalDialog>

    <!-- IP 弹窗 -->
    <ModalDialog v-if="showIp" :title="editingIp ? `编辑 ${editingIp.ip}` : '新增IP记录'" @close="showIp = false">
      <div class="form-row">
        <div class="field">
          <label>IP地址 <b>*</b></label>
          <input v-model="ipForm.ip" class="input" maxlength="16" />
        </div>
        <div class="field" style="max-width: 120px">
          <label>状态</label>
          <select v-model="ipForm.status" class="select">
            <option>空闲</option><option>已分配</option><option>保留</option>
          </select>
        </div>
      </div>
      <div class="field">
        <label>归属VLAN</label>
        <select v-model.number="ipForm.planId" class="select">
          <option v-for="p in plans" :key="p.id" :value="p.id">{{ p.vlanId }} · {{ p.name }}</option>
        </select>
      </div>
      <div class="field">
        <label>关联设备/点位</label>
        <input v-model="ipForm.ref" class="input" maxlength="48" placeholder="如 虚拟化节点-01 / 301东墙网口" />
      </div>
      <div class="field">
        <label>备注</label>
        <input v-model="ipForm.remark" class="input" maxlength="64" />
      </div>
      <p v-if="ipErr" style="color: var(--danger); font-size: 12px">{{ ipErr }}</p>
      <template #foot>
        <button class="btn" @click="showIp = false">取消</button>
        <button class="btn primary" @click="submitIp">保存</button>
      </template>
    </ModalDialog>

    <!-- 导入 -->
    <ModalDialog v-if="showImport" title="导入 VLAN Excel" :width="640" @close="showImport = false">
      <div class="field">
        <label>列序：A VLAN ID（数字）B 名称 C 网段 D 网关 E 可用范围 F 用途 G 负责人 H 备注</label>
        <input ref="fileRef" type="file" accept=".xlsx,.xls" class="input" @change="onPickFile" />
      </div>
      <p v-if="importErr" style="color: var(--danger); font-size: 12px; margin-bottom: 10px">{{ importErr }}</p>
      <template v-if="preview.length">
        <p style="font-size: 13px; margin-bottom: 8px">识别到 <b style="color: var(--accent)">{{ preview.length }}</b> 条，预览前 6 条：</p>
        <div style="overflow-x: auto; max-height: 220px">
          <table class="table">
            <thead><tr><th>VLAN ID</th><th>名称</th><th>网段</th><th>网关</th><th>用途</th></tr></thead>
            <tbody>
              <tr v-for="(p, i) in preview.slice(0, 6)" :key="i">
                <td class="mono">{{ p.vlanId }}</td><td><b>{{ p.name }}</b></td>
                <td class="mono">{{ p.cidr || '-' }}</td><td class="mono">{{ p.gateway || '-' }}</td><td>{{ p.purpose || '-' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
      <template #foot>
        <button class="btn" @click="showImport = false">取消</button>
        <button class="btn primary" :disabled="!preview.length" @click="confirmImport">确认导入</button>
      </template>
    </ModalDialog>

    <div class="toast" v-if="toast">{{ toast }}</div>
  </div>
</template>

<style scoped>
.page-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; flex-wrap: wrap; gap: 10px; }
.page-head .sub { font-size: 12px; color: var(--text-faint); margin-top: 4px; }
.tabs { display: flex; gap: 8px; margin-bottom: 14px; }
.tabs button {
  background: var(--bg-panel); border: 1px solid var(--line-strong); color: var(--text-muted);
  padding: 7px 20px; border-radius: 8px; cursor: pointer; font-size: 13px; transition: all var(--tr);
}
.tabs button.on { background: var(--accent-deep); border-color: rgba(1, 1, 32, 0.35); color: var(--accent); }
.bar { display: flex; gap: 8px; align-items: center; padding: 12px; border-bottom: 1px solid var(--line); }
.count { font-size: 12px; color: var(--text-faint); }
.mono { font-family: var(--font-mono); font-size: 12px; }
</style>
