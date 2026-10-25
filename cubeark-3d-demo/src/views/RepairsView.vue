<script setup lang="ts">
// 硬件维修记录：设备编号/SN 可从设备台账带出，也可手动录入；记录报修原因、故障现象、时间、
// 是否外出维修、完成时间、维修结果与是否报废
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ModalDialog from '../components/ModalDialog.vue'
import {
  getSiteById, getDeviceLedger, getRepairRecords, saveRepairRecord, deleteRepairRecord, repairStats
} from '../api/mock'
import type { LedgerRow, RepairRecord } from '../types'
import { canEdit } from '../store/auth'
import { downloadCsv } from '../utils/export'

const route = useRoute()
const router = useRouter()
const siteId = computed(() => Number(route.params.siteId))
const siteName = computed(() => getSiteById(siteId.value)?.name ?? '-')

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

// ---------- 列表与筛选 ----------
const fScrapped = ref<'' | 'yes' | 'no'>('')
const fOutsource = ref<'' | 'yes' | 'no'>('')
const fKeyword = ref('')
const rows = computed<RepairRecord[]>(() => {
  tick.value
  return getRepairRecords(siteId.value, {
    scrapped: fScrapped.value,
    outsource: fOutsource.value,
    keyword: fKeyword.value
  })
})
const stats = computed(() => { tick.value; return repairStats(siteId.value) })

// ---------- 台账设备（可带入设备编号与 SN） ----------
const ledger = computed<LedgerRow[]>(() => { tick.value; return getDeviceLedger(siteId.value) })
function deviceLabel(r: LedgerRow) {
  return `${r.name} · ${r.sn}${r.mounted && r.rackCode ? `（${r.rackCode} U${r.uStart}）` : '（在库）'}`
}

// ---------- 新增 / 编辑 ----------
type RepairForm = {
  deviceCode: string; sn: string; reason: string; symptom: string
  reportedAt: string; needOutsource: boolean; finishedAt: string; result: string; scrapped: boolean
}
function nowLocal() {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
function emptyForm(): RepairForm {
  return {
    deviceCode: '', sn: '', reason: '', symptom: '',
    reportedAt: nowLocal(), needOutsource: false, finishedAt: '', result: '', scrapped: false
  }
}

const show = ref(false)
const editing = ref<RepairRecord | null>(null)
const form = ref<RepairForm>(emptyForm())
const formErr = ref('')
const pickedDevice = ref(0)

function openCreate() {
  editing.value = null
  form.value = emptyForm()
  pickedDevice.value = 0
  formErr.value = ''
  show.value = true
}
function openEdit(r: RepairRecord) {
  editing.value = r
  form.value = {
    deviceCode: r.deviceCode, sn: r.sn, reason: r.reason, symptom: r.symptom,
    reportedAt: r.reportedAt, needOutsource: r.needOutsource,
    finishedAt: r.finishedAt, result: r.result, scrapped: r.scrapped
  }
  const hit = ledger.value.find(d => d.sn === r.sn || (!!r.deviceCode && d.name === r.deviceCode))
  pickedDevice.value = hit ? hit.id : 0
  formErr.value = ''
  show.value = true
}
function onPickDevice() {
  const d = ledger.value.find(x => x.id === pickedDevice.value)
  if (!d) return
  form.value.deviceCode = d.name
  form.value.sn = d.sn
}
function submit() {
  const res = saveRepairRecord(siteId.value, { id: editing.value?.id, ...form.value })
  if (!res.ok) { formErr.value = res.error!; return }
  tick.value++
  show.value = false
  showToast(editing.value ? '维修记录已更新' : '维修记录已新增')
}
function remove(r: RepairRecord) {
  if (!window.confirm(`确认删除「${r.deviceCode || r.sn}」的维修记录？`)) return
  deleteRepairRecord(siteId.value, r.id)
  tick.value++
  showToast('维修记录已删除')
}

// ---------- 导出 ----------
function fmtTime(s: string) {
  return s ? s.replace('T', ' ') : '-'
}
function exportCsv() {
  downloadCsv(
    `硬件维修记录_${siteName.value}.csv`,
    ['设备编号', 'SN号', '维修原因', '故障现象', '报修时间', '需外出维修', '维修完成时间', '维修结果', '是否报废'],
    rows.value.map(r => [
      r.deviceCode, r.sn, r.reason, r.symptom, fmtTime(r.reportedAt),
      r.needOutsource ? '是' : '否', fmtTime(r.finishedAt), r.result, r.scrapped ? '是' : '否'
    ])
  )
}
</script>

<template>
  <div class="page">
    <div class="page-head">
      <div>
        <div class="crumb">
          <span class="link" @click="router.push('/sites')">站点管理</span>
          <span class="sep">/</span><span>{{ siteName }}</span>
        </div>
        <h2 style="margin-top: 6px">硬件维修记录</h2>
        <p class="sub">登记设备维修情况：报修时间、故障现象、是否外出维修、完成时间、维修结果与是否报废；设备编号与 SN 可从设备台账选择，也可手动录入</p>
      </div>
      <div class="stats" style="width: 400px">
        <div class="stat"><b>{{ stats.total }}</b><span>全部记录</span></div>
        <div class="stat"><b>{{ stats.pending }}</b><span>待完成</span></div>
        <div class="stat"><b>{{ stats.outsourced }}</b><span>外出维修</span></div>
        <div class="stat"><b>{{ stats.scrapped }}</b><span>已报废</span></div>
      </div>
    </div>

    <div class="card" style="padding: 0; overflow: hidden">
      <div class="bar">
        <select v-model="fScrapped" class="select" style="width: 130px">
          <option value="">是否报废：全部</option>
          <option value="no">未报废</option>
          <option value="yes">已报废</option>
        </select>
        <select v-model="fOutsource" class="select" style="width: 150px">
          <option value="">外出维修：全部</option>
          <option value="yes">需外出维修</option>
          <option value="no">站内维修</option>
        </select>
        <input v-model="fKeyword" class="input" style="width: 220px" placeholder="搜索 设备编号 / SN / 原因 / 故障现象" />
        <span style="flex: 1"></span>
        <span class="count">{{ rows.length }} 条</span>
        <button v-if="canEdit()" class="btn primary" @click="openCreate">＋ 新增维修记录</button>
        <button class="btn" @click="exportCsv">导出CSV</button>
      </div>
      <div style="overflow: auto; max-height: calc(100vh - 300px)">
        <table class="table" style="min-width: 1080px; table-layout: fixed">
          <thead>
            <tr>
              <th style="width: 118px">设备编号</th><th style="width: 126px">SN号</th>
              <th>维修原因 / 故障现象</th>
              <th style="width: 124px">报修时间</th><th style="width: 72px">外出维修</th>
              <th style="width: 124px">维修完成时间</th><th>维修结果</th>
              <th style="width: 72px">是否报废</th><th style="width: 112px">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in rows" :key="r.id">
              <td class="ell" :title="r.deviceCode"><b>{{ r.deviceCode || '-' }}</b></td>
              <td class="mono ell" :title="r.sn">{{ r.sn || '-' }}</td>
              <td class="ell" :title="`${r.reason}${r.symptom ? ' / ' + r.symptom : ''}`">
                <b class="cause">{{ r.reason || '-' }}</b>
                <span class="symptom">{{ r.symptom || '-' }}</span>
              </td>
              <td class="mono">{{ fmtTime(r.reportedAt) }}</td>
              <td>
                <span :class="['badge', r.needOutsource ? 'warn' : '']">{{ r.needOutsource ? '是' : '否' }}</span>
              </td>
              <td class="mono">{{ r.finishedAt ? fmtTime(r.finishedAt) : '未完成' }}</td>
              <td class="ell" :title="r.result">{{ r.result || '-' }}</td>
              <td>
                <span :class="['badge', r.scrapped ? 'danger' : 'ok']">{{ r.scrapped ? '是' : '否' }}</span>
              </td>
              <td>
                <template v-if="canEdit()">
                  <button class="btn sm" @click="openEdit(r)">编辑</button>
                  <button class="btn danger sm" @click="remove(r)">删除</button>
                </template>
                <span v-else class="tip small">只读</span>
              </td>
            </tr>
          </tbody>
        </table>
        <p v-if="!rows.length" class="empty">暂无维修记录，点击「新增维修记录」登记</p>
      </div>
    </div>

    <ModalDialog v-if="show" :title="editing ? '编辑维修记录' : '新增维修记录'" :width="620" @close="show = false">
      <div class="field">
        <label>关联台账设备（可选，选择后自动带入设备编号与 SN；也可手工填写）</label>
        <select v-model.number="pickedDevice" class="select" @change="onPickDevice">
          <option :value="0">手动录入（不关联台账设备）</option>
          <option v-for="d in ledger" :key="d.id" :value="d.id">{{ deviceLabel(d) }}</option>
        </select>
      </div>
      <div class="form-row">
        <div class="field">
          <label>设备编号</label>
          <input v-model="form.deviceCode" class="input" maxlength="40" placeholder="如 核心交换-02" />
        </div>
        <div class="field">
          <label>SN 号</label>
          <input v-model="form.sn" class="input" maxlength="40" placeholder="如 SN20260101040" />
        </div>
      </div>
      <div class="field">
        <label>维修原因 <b>*</b></label>
        <input v-model="form.reason" class="input" maxlength="60" placeholder="如 电源模块故障 / 业务口丢包" />
      </div>
      <div class="field">
        <label>故障现象</label>
        <textarea v-model="form.symptom" class="input" rows="2" maxlength="200" style="resize: vertical" placeholder="如 PSU2 无输出，冗余丢失" />
      </div>
      <div class="form-row">
        <div class="field">
          <label>报修时间 <b>*</b></label>
          <input v-model="form.reportedAt" class="input" type="datetime-local" />
        </div>
        <div class="field" style="max-width: 170px">
          <label>是否需要外出维修</label>
          <select v-model="form.needOutsource" class="select">
            <option :value="false">否（站内维修）</option>
            <option :value="true">是（外出/返厂）</option>
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="field">
          <label>维修完成时间（未完成可留空）</label>
          <input v-model="form.finishedAt" class="input" type="datetime-local" />
        </div>
        <div class="field" style="max-width: 170px">
          <label>是否报废</label>
          <select v-model="form.scrapped" class="select">
            <option :value="false">否</option>
            <option :value="true">是</option>
          </select>
        </div>
      </div>
      <div class="field">
        <label>维修结果</label>
        <input v-model="form.result" class="input" maxlength="80" placeholder="如 更换光模块后恢复 / 返厂更换电源模块 / 无法修复报废" />
      </div>
      <p v-if="formErr" style="color: var(--danger); font-size: 12px">{{ formErr }}</p>
      <template #foot>
        <button class="btn" @click="show = false">取消</button>
        <button class="btn primary" @click="submit">保存</button>
      </template>
    </ModalDialog>

    <div class="toast" v-if="toast">{{ toast }}</div>
  </div>
</template>

<style scoped>
.page-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; flex-wrap: wrap; gap: 10px; }
.page-head .sub { font-size: 12px; color: var(--text-faint); margin-top: 4px; }
.bar { display: flex; gap: 8px; align-items: center; padding: 12px; border-bottom: 1px solid var(--line); flex-wrap: wrap; }
.count { font-size: 12px; color: var(--text-faint); }
.mono { font-family: var(--font-mono); font-size: 12px; }
.cause, .symptom { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cause { font-weight: 600; }
.symptom { font-size: 12px; color: var(--text-faint); font-weight: 400; }
</style>
