<script setup lang="ts">
// 楼层图纸点位管理：PDF底图(pdfjs渲染) + 网/话/监控三类打点 + 缩放平移(点位锁定) + 台账
import { computed, onBeforeUnmount, onMounted, ref, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import * as pdfjsLib from 'pdfjs-dist'
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.js?url'
import ModalDialog from '../components/ModalDialog.vue'
import {
  getSiteById, getFloorPlans, createFloorPlan, saveFloorPlan, deleteFloorPlan,
  nextPointCode, newPointId, getDeviceLedger
} from '../api/mock'
import { putPdf, getPdf, deletePdf } from '../api/pdfstore'
import { canEdit } from '../store/auth'
import type { FloorPlan, FloorPoint, PointType } from '../types'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc

const route = useRoute()
const router = useRouter()
const siteId = computed(() => Number(route.params.siteId))
const siteName = computed(() => getSiteById(siteId.value)?.name ?? '-')

// 网口点位可选的交换机（来自本站点设备台账中的交换机）
const switchOptions = computed(() => {
  tick.value
  return Array.from(new Set(
    getDeviceLedger(siteId.value).filter(r => r.category === 2).map(r => r.name)
  ))
})

const TYPE_META: Record<PointType, { name: string; color: string }> = {
  net: { name: '网口', color: '#66bb6a' },
  phone: { name: '电话', color: '#b0bec5' },
  cam: { name: '监控', color: '#64b5f6' },
  monitor: { name: '显示器', color: '#4dd0e1' },
  pc: { name: '主机', color: '#ffb74d' },
  laptop: { name: '笔记本', color: '#ba68c8' },
  printer: { name: '打印机', color: '#8d6e63' },
  ap: { name: '无线AP', color: '#26a69a' }
}

// 八类点位图标：网口=绿色配线面板 / 电话=黑色座机 / 监控=蓝色枪机 / 显示器 / 主机 / 笔记本 / 打印机 / 无线AP
const ICONS: Record<PointType, string> = {
  net: `<svg viewBox="0 0 24 24" width="20" height="20" xmlns="http://www.w3.org/2000/svg"><rect x="1.5" y="4" width="21" height="16" rx="2.5" fill="#1b5e20" stroke="#66bb6a" stroke-width="1.6"/><rect x="4.5" y="7.5" width="4" height="3.2" rx="0.8" fill="#a5d6a7"/><rect x="10" y="7.5" width="4" height="3.2" rx="0.8" fill="#a5d6a7"/><rect x="15.5" y="7.5" width="4" height="3.2" rx="0.8" fill="#a5d6a7"/><rect x="4.5" y="13" width="4" height="3.2" rx="0.8" fill="#a5d6a7"/><rect x="10" y="13" width="4" height="3.2" rx="0.8" fill="#a5d6a7"/><rect x="15.5" y="13" width="4" height="3.2" rx="0.8" fill="#a5d6a7"/></svg>`,
  phone: `<svg viewBox="0 0 24 24" width="20" height="20" xmlns="http://www.w3.org/2000/svg"><rect x="2" y="2.5" width="20" height="5" rx="2.5" fill="#263238" stroke="#607d8b" stroke-width="1.2"/><rect x="4" y="9" width="16" height="12" rx="2" fill="#0f1418" stroke="#607d8b" stroke-width="1.2"/><circle cx="8" cy="12.5" r="1.2" fill="#b0bec5"/><circle cx="12" cy="12.5" r="1.2" fill="#b0bec5"/><circle cx="16" cy="12.5" r="1.2" fill="#b0bec5"/><circle cx="8" cy="16.5" r="1.2" fill="#78909c"/><circle cx="12" cy="16.5" r="1.2" fill="#78909c"/><circle cx="16" cy="16.5" r="1.2" fill="#78909c"/></svg>`,
  cam: `<svg viewBox="0 0 24 24" width="20" height="20" xmlns="http://www.w3.org/2000/svg"><rect x="2" y="5" width="14" height="8" rx="2" fill="#1565c0" stroke="#64b5f6" stroke-width="1.3"/><circle cx="16.5" cy="9" r="2.6" fill="#0d47a1" stroke="#90caf9" stroke-width="1.2"/><path d="M9 13 L9 16.5" stroke="#90caf9" stroke-width="1.6"/><rect x="5.5" y="16.5" width="7" height="2.6" rx="1.3" fill="#1976d2"/></svg>`,
  monitor: `<svg viewBox="0 0 24 24" width="20" height="20" xmlns="http://www.w3.org/2000/svg"><rect x="2.5" y="3.5" width="19" height="12.5" rx="2" fill="#0e4c5a" stroke="#4dd0e1" stroke-width="1.5"/><rect x="4.5" y="5.5" width="15" height="8.5" rx="1" fill="#178ba0"/><path d="M12 16 L12 19" stroke="#4dd0e1" stroke-width="1.8"/><rect x="7.5" y="19" width="9" height="2.2" rx="1.1" fill="#4dd0e1"/></svg>`,
  pc: `<svg viewBox="0 0 24 24" width="20" height="20" xmlns="http://www.w3.org/2000/svg"><rect x="5" y="2.5" width="14" height="19" rx="2" fill="#5d3a12" stroke="#ffb74d" stroke-width="1.5"/><circle cx="12" cy="7" r="2.2" fill="#ffb74d"/><rect x="8" y="12" width="8" height="1.6" rx="0.8" fill="#ffe0b2"/><rect x="8" y="15" width="8" height="1.6" rx="0.8" fill="#ffe0b2"/><circle cx="8.6" cy="19" r="0.9" fill="#ffe0b2"/><rect x="11" y="18.2" width="5" height="1.6" rx="0.8" fill="#ffe0b2"/></svg>`,
  laptop: `<svg viewBox="0 0 24 24" width="20" height="20" xmlns="http://www.w3.org/2000/svg"><rect x="4" y="4" width="16" height="10.5" rx="1.6" fill="#4a2b66" stroke="#ba68c8" stroke-width="1.5"/><rect x="5.8" y="5.8" width="12.4" height="6.9" rx="0.8" fill="#7e57c2"/><path d="M2.5 18.5 L5 15.8 H19 L21.5 18.5 Z" fill="#ba68c8"/><rect x="9.5" y="17" width="5" height="1" rx="0.5" fill="#e1bee7"/></svg>`,
  printer: `<svg viewBox="0 0 24 24" width="20" height="20" xmlns="http://www.w3.org/2000/svg"><rect x="6" y="2.5" width="12" height="5" rx="1" fill="#efe6e1" stroke="#8d6e63" stroke-width="1.3"/><rect x="2.5" y="7.5" width="19" height="8" rx="2" fill="#4e342e" stroke="#8d6e63" stroke-width="1.4"/><rect x="4.5" y="10" width="5" height="2.6" rx="0.7" fill="#bcaaa4"/><circle cx="18" cy="11" r="1.1" fill="#a5d6a7"/><rect x="6" y="15.5" width="12" height="6" rx="1" fill="#efe6e1" stroke="#8d6e63" stroke-width="1.3"/><rect x="8" y="17.5" width="8" height="1.4" rx="0.7" fill="#bcaaa4"/><rect x="8" y="19.4" width="5" height="1.2" rx="0.6" fill="#d7ccc8"/></svg>`,
  ap: `<svg viewBox="0 0 24 24" width="20" height="20" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="9" r="2" fill="none" stroke="#26a69a" stroke-width="1.5"/><path d="M8.4 5.4a5 5 0 0 0 0 7.2M15.6 5.4a5 5 0 0 1 0 7.2" fill="none" stroke="#26a69a" stroke-width="1.5" stroke-linecap="round"/><path d="M5.6 2.6a9 9 0 0 0 0 12.8M18.4 2.6a9 9 0 0 1 0 12.8" fill="none" stroke="#4db6ac" stroke-width="1.4" stroke-linecap="round"/><rect x="5" y="15.5" width="14" height="6" rx="2" fill="#0f3d3a" stroke="#26a69a" stroke-width="1.4"/><circle cx="8.4" cy="18.5" r="1" fill="#a7ffeb"/><rect x="11" y="17.9" width="5.5" height="1.2" rx="0.6" fill="#80cbc4"/></svg>`
}

const toast = ref('')
let toastTimer: number | undefined
function showToast(msg: string, isErr = false) {
  toast.value = msg
  window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => (toast.value = ''), 4000)
  const el = document.querySelector('.toast') as HTMLElement | null
  if (el) el.style.borderColor = isErr ? 'rgba(185, 28, 28, 0.5)' : 'rgba(21, 128, 61, 0.5)'
}

// ---------- 图纸管理 ----------
const tick = ref(0)
const plans = computed<FloorPlan[]>(() => { tick.value; return getFloorPlans(siteId.value) })
const curPlanId = ref(0)
const plan = ref<FloorPlan | null>(null)
const dirty = ref(false)
const showNew = ref(false)
const newForm = ref({ name: '', building: '一号楼', floor: '3F', pdfName: '', pageCount: 1 })
const newErr = ref('')
const newFileRef = ref<HTMLInputElement>()
let newFileBlob: Blob | null = null

function openPlan(id: number) {
  if (dirty.value && !window.confirm('点位未保存，确认切换？')) return
  curPlanId.value = id
  plan.value = plans.value.find(p => p.id === id) ?? null
  selId.value = 0
  dirty.value = false
  pageNum.value = 1
  nextTick(() => loadPdf())
}
async function onNewFile(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  if (!f) return
  newFileBlob = f
  newForm.value.pdfName = f.name
  if (!newForm.value.name) newForm.value.name = f.name.replace(/\.pdf$/i, '')
  try {
    const buf = await f.arrayBuffer()
    const doc = await pdfjsLib.getDocument({ data: buf.slice(0) }).promise
    newForm.value.pageCount = doc.numPages
    doc.destroy()
  } catch {
    newErr.value = 'PDF 解析失败，请确认文件格式'
  }
}
async function submitNew() {
  newErr.value = ''
  const res = createFloorPlan(siteId.value, { ...newForm.value })
  if (!res.ok) { newErr.value = res.error!; return }
  if (newFileBlob) await putPdf(res.plan!.id, newFileBlob)
  showNew.value = false
  newFileBlob = null
  newForm.value = { name: '', building: '一号楼', floor: '3F', pdfName: '', pageCount: 1 }
  tick.value++
  openPlan(res.plan!.id)
  showToast('图纸已创建' + (res.plan!.pdfName ? '，PDF已入库' : '（空白画布，可先打点）'))
}
async function removePlan() {
  if (!plan.value) return
  if (!window.confirm(`确认删除图纸「${plan.value.name}」及其全部点位？`)) return
  await deletePdf(plan.value.id)
  deleteFloorPlan(plan.value.id)
  tick.value++
  const first = plans.value[0]
  if (first) openPlan(first.id)
  else { plan.value = null; drawBlank() }
  showToast('图纸已删除')
}

// ---------- PDF 渲染 ----------
const viewportRef = ref<HTMLDivElement>()
const canvasRef = ref<HTMLCanvasElement>()
let pdfDoc: pdfjsLib.PDFDocumentProxy | null = null
const pdfReady = ref(false)
const pageNum = ref(1)
const view = ref({ z: 1, tx: 0, ty: 0 })
const worldStyle = computed(() => ({
  transform: `translate(${view.value.tx}px, ${view.value.ty}px) scale(${view.value.z})`,
  transformOrigin: '0 0'
}))

async function loadPdf() {
  pdfReady.value = false
  if (!plan.value) { drawBlank(); return }
  const blob = await getPdf(plan.value.id)
  if (!blob) { pdfDoc = null; drawBlank(); return }
  try {
    const data = await blob.arrayBuffer()
    pdfDoc = await pdfjsLib.getDocument({ data }).promise
    if (pageNum.value > pdfDoc.numPages) pageNum.value = 1
    await renderPage(pageNum.value)
  } catch {
    pdfDoc = null
    drawBlank()
    showToast('PDF 加载失败，已切换空白画布', true)
  }
}
async function renderPage(n: number) {
  if (pdfDoc) {
    const page = await pdfDoc.getPage(n)
    const vp = page.getViewport({ scale: 2 })
    const c = canvasRef.value!
    c.width = vp.width
    c.height = vp.height
    const ctx = c.getContext('2d')!
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, c.width, c.height)
    await page.render({ canvasContext: ctx, viewport: vp }).promise
    pageNum.value = n
    pdfReady.value = true
  } else {
    drawBlank()
  }
  fitView()
}
function drawBlank() {
  const c = canvasRef.value
  if (!c) return
  c.width = 1000
  c.height = 640
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, 1000, 640)
  ctx.strokeStyle = 'rgba(150, 190, 235, 0.1)'
  ctx.lineWidth = 1
  for (let x = 0; x <= 1000; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 640); ctx.stroke() }
  for (let y = 0; y <= 640; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(1000, y); ctx.stroke() }
  ctx.fillStyle = '#dfe2ea'
  ctx.font = '16px sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('空白画布 · 上传PDF图纸后此处渲染底图（编辑图纸请删除后重建）', 500, 326)
  pdfReady.value = false
}
function fitView() {
  const vp = viewportRef.value, c = canvasRef.value
  if (!vp || !c) return
  const z = Math.min(vp.clientWidth / c.width, vp.clientHeight / c.height) * 0.94
  view.value = {
    z,
    tx: (vp.clientWidth - c.width * z) / 2,
    ty: (vp.clientHeight - c.height * z) / 2
  }
}
function zoomAt(cx: number, cy: number, k: number) {
  const v = view.value
  const z = Math.min(8, Math.max(0.1, v.z * k))
  view.value = { z, tx: cx - (cx - v.tx) * (z / v.z), ty: cy - (cy - v.ty) * (z / v.z) }
}
function onWheel(e: WheelEvent) {
  const rect = viewportRef.value!.getBoundingClientRect()
  zoomAt(e.clientX - rect.left, e.clientY - rect.top, e.deltaY < 0 ? 1.15 : 1 / 1.15)
}
function zoomBtn(k: number) {
  const vp = viewportRef.value!
  zoomAt(vp.clientWidth / 2, vp.clientHeight / 2, k)
}

// ---------- 交互：平移 / 打点 / 拖点 ----------
const mode = ref<'pan' | 'add'>('pan')
const addType = ref<PointType>('net')
const selId = ref(0)
const curPoints = computed<FloorPoint[]>(() => (pageNum.value ? (plan.value?.points ?? []).filter(p => p.page === pageNum.value) : []))
const selPoint = computed<FloorPoint | null>(() => (plan.value?.points.find(p => p.id === selId.value) ?? null))

let panState: { x: number; y: number; tx: number; ty: number; moved: boolean } | null = null
let dragPoint: FloorPoint | null = null

function onViewportDown(e: PointerEvent) {
  if (dragPoint) return
  panState = { x: e.clientX, y: e.clientY, tx: view.value.tx, ty: view.value.ty, moved: false }
}
function onViewportMove(e: PointerEvent) {
  if (dragPoint) {
    const r = canvasRef.value!.getBoundingClientRect()
    dragPoint.x = Math.min(0.99, Math.max(0.01, (e.clientX - r.left) / r.width))
    dragPoint.y = Math.min(0.99, Math.max(0.01, (e.clientY - r.top) / r.height))
    dirty.value = true
    return
  }
  if (!panState) return
  const dx = e.clientX - panState.x, dy = e.clientY - panState.y
  if (Math.abs(dx) > 3 || Math.abs(dy) > 3) panState.moved = true
  view.value = { ...view.value, tx: panState.tx + dx, ty: panState.ty + dy }
}
function onViewportUp() {
  panState = null
  dragPoint = null
}
function addPointAt(x: number, y: number) {
  if (!canEdit() || !plan.value) return
  const p: FloorPoint = {
    id: newPointId(),
    type: addType.value,
    code: nextPointCode(addType.value, plan.value.floor, plan.value.points),
    location: '', ip: '', vlan: '', phone: '', switchName: '', switchPort: '', model: '', sn: '', mac: '', dockMac: '', owner: '', dept: '',
    status: '空闲', remark: '',
    x, y, page: pageNum.value
  }
  plan.value.points.push(p)
  selId.value = p.id
  dirty.value = true
}
function onCanvasClick(e: MouseEvent) {
  if (mode.value !== 'add' || !plan.value || (panState && panState.moved)) return
  if (panState?.moved) return
  const r = canvasRef.value!.getBoundingClientRect()
  const x = Math.min(0.99, Math.max(0.01, (e.clientX - r.left) / r.width))
  const y = Math.min(0.99, Math.max(0.01, (e.clientY - r.top) / r.height))
  addPointAt(x, y)
}

// 图例拖拽打点：按住图例图标拖到画布松开即放置点位（同时保持点按钮→点画布的方式）
const legendDrag = ref<PointType | null>(null)
function startLegendDrag(t: PointType) {
  if (!canEdit() || !plan.value) return
  mode.value = 'add'
  addType.value = t
  legendDrag.value = t
  const onUp = (ev: PointerEvent) => {
    window.removeEventListener('pointerup', onUp)
    const dragging = legendDrag.value
    legendDrag.value = null
    const vp = viewportRef.value, c = canvasRef.value
    if (!dragging || !plan.value || !vp || !c) return
    const r = vp.getBoundingClientRect()
    if (ev.clientX < r.left || ev.clientX > r.right || ev.clientY < r.top || ev.clientY > r.bottom) return
    const cr = c.getBoundingClientRect()
    addPointAt(
      Math.min(0.99, Math.max(0.01, (ev.clientX - cr.left) / cr.width)),
      Math.min(0.99, Math.max(0.01, (ev.clientY - cr.top) / cr.height))
    )
  }
  window.addEventListener('pointerup', onUp)
}

// 点位跨图纸迁移（工位调整：把点位搬到另一张图纸/楼层）
const migrateTarget = ref(0)
const otherPlans = computed(() => plans.value.filter(p => p.id !== curPlanId.value))
function migrateSelPoint() {
  if (!canEdit()) return
  const src = plan.value
  const p = selPoint.value
  const target = plans.value.find(x => x.id === migrateTarget.value)
  if (!src || !p || !target) return
  if (!window.confirm(`将点位「${p.code}」迁移到「${target.building} · ${target.floor} · ${target.name}」？\n当前图纸其他未保存的修改也会一并保存。`)) return
  const moved: FloorPoint = JSON.parse(JSON.stringify(p))
  moved.page = 1
  src.points.splice(src.points.findIndex(x => x.id === p.id), 1)
  target.points.push(moved)
  const okSrc = saveFloorPlan(JSON.parse(JSON.stringify(src)) as FloorPlan)
  const okTgt = saveFloorPlan(JSON.parse(JSON.stringify(target)) as FloorPlan)
  migrateTarget.value = 0
  selId.value = 0
  dirty.value = false
  tick.value++
  if (okSrc.ok && okTgt.ok) showToast(`点位「${moved.code}」已迁移到 ${target.building} · ${target.floor} 图纸`)
  else showToast((okSrc.error || okTgt.error)!, true)
}
function onMarkerDown(e: PointerEvent, p: FloorPoint) {
  if (mode.value === 'add' || !canEdit()) return
  dragPoint = p
  panState = null
}
function selectPoint(p: FloorPoint) {
  selId.value = p.id
}
function applySel() {
  dirty.value = true
  showToast('点位信息已更新（记得保存）')
}
function removeSel() {
  if (!canEdit()) return
  if (!plan.value || !selPoint.value) return
  if (!window.confirm(`确认删除点位「${selPoint.value.code}」？`)) return
  const pts = plan.value.points
  pts.splice(pts.findIndex(p => p.id === selPoint.value!.id), 1)
  selId.value = 0
  dirty.value = true
}
function savePlan() {
  if (!canEdit() || !plan.value) return
  const res = saveFloorPlan(JSON.parse(JSON.stringify(plan.value)) as FloorPlan)
  if (!res.ok) { showToast(res.error!, true); return }
  dirty.value = false
  tick.value++
  showToast(`「${plan.value.name}」已保存（${plan.value.points.length} 个点位）`)
}

// ---------- 台账 ----------
const fType = ref<'' | PointType>('')
const fStatus = ref('')
const fKeyword = ref('')
const ledgerRows = computed(() => {
  if (!plan.value) return []
  let list = plan.value.points.slice()
  if (fType.value) list = list.filter(p => p.type === fType.value)
  if (fStatus.value) list = list.filter(p => p.status === fStatus.value)
  if (fKeyword.value.trim()) {
    const k = fKeyword.value.trim().toLowerCase()
    list = list.filter(p => `${p.code}${p.location}${p.ip}${p.vlan}${p.phone}${p.switchName ?? ''}${p.switchPort ?? ''}${p.model ?? ''}${p.sn ?? ''}${p.mac ?? ''}${p.dockMac ?? ''}${p.owner}${p.dept}${p.remark}`.toLowerCase().includes(k))
  }
  return list
})
// 台账「连接信息」：网口=交换机·端口；电话=号码·IP；其余=IP（显示器无号码/IP）
function connText(p: FloorPoint) {
  if (p.type === 'net') return p.switchName ? `${p.switchName}${p.switchPort ? ' · ' + p.switchPort : ''}` : '-'
  if (p.type === 'phone') return [p.phone, p.ip].filter(Boolean).join(' · ') || '-'
  return p.ip || '-'
}
// 台账「MAC」：主机/笔记本显示本机MAC，拓展坞MAC 放悬停提示
function macText(p: FloorPoint) {
  return p.mac || '-'
}
function macTitle(p: FloorPoint) {
  return p.dockMac ? `拓展坞 MAC：${p.dockMac}` : ''
}
function countBy(t: PointType) {
  return plan.value?.points.filter(p => p.type === t).length ?? 0
}
function exportCsv() {
  if (!plan.value) return
  const head = ['点位编号', '类型', 'SN号', '设备型号', '位置', '交换机', '端口', 'IP', 'VLAN', '电话号', '本机MAC', '拓展坞MAC', '使用人', '部门', '状态', '备注', '页码']
  const esc = (s: string) => '"' + String(s ?? '').replace(/"/g, '""') + '"'
  const lines = [head.join(',')]
  for (const p of ledgerRows.value) {
    lines.push([p.code, TYPE_META[p.type].name, p.sn ?? '', p.model ?? '', p.location, p.switchName ?? '', p.switchPort ?? '', p.ip, p.vlan, p.phone, p.mac ?? '', p.dockMac ?? '', p.owner, p.dept, p.status, p.remark, p.page].map(esc).join(','))
  }
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `点位台账_${plan.value.building}${plan.value.floor}_${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(a.href)
}

onMounted(() => {
  const first = plans.value[0]
  if (first) openPlan(first.id)
  else nextTick(drawBlank)
})
onBeforeUnmount(() => {
  pdfDoc?.destroy()
})
</script>

<template>
  <div class="page floor-page">
    <div class="page-head">
      <div>
        <div class="crumb">
          <span class="link" @click="router.push('/sites')">站点管理</span>
          <span class="sep">/</span><span>{{ siteName }}</span>
        </div>
        <h2 style="margin-top: 6px">楼层图纸点位</h2>
        <p class="sub">楼宇 → 楼层 → 图纸：PDF底图上人工打点（网口/电话/监控/显示器/主机/笔记本/打印机/无线AP），点位与底图缩放平移联动锁定</p>
      </div>
      <div style="display: flex; gap: 8px; align-items: center">
        <span v-if="dirty" class="badge warn">未保存</span>
        <select :value="curPlanId" class="select" style="width: 230px" @change="openPlan(Number(($event.target as HTMLSelectElement).value))">
          <option v-if="!plans.length" :value="0">暂无图纸</option>
          <option v-for="p in plans" :key="p.id" :value="p.id">{{ p.building }} · {{ p.floor }} · {{ p.name }}</option>
        </select>
        <button v-if="canEdit()" class="btn" @click="showNew = true">＋ 新建图纸</button>
        <button v-if="canEdit()" class="btn danger" :disabled="!plan" @click="removePlan">删图</button>
        <button v-if="canEdit()" class="btn primary" :disabled="!plan" @click="savePlan">保存点位</button>
      </div>
    </div>

    <div class="floor-main">
      <div class="canvas-col card">
        <div class="canvas-toolbar">
          <div v-if="canEdit()" class="mode-group">
            <button :class="{ on: mode === 'pan' }" @click="mode = 'pan'">🖐 平移/选点</button>
            <button v-for="(m, t) in TYPE_META" :key="t" :class="{ on: mode === 'add' && addType === t }" @click="mode = 'add'; addType = t as PointType">
              <span class="m-icon sm" v-html="ICONS[t as PointType]"></span>{{ m.name }}打点
            </button>
          </div>
          <div class="pager">
            <button class="btn sm" :disabled="!pdfDoc || pageNum <= 1" @click="renderPage(pageNum - 1)">◀</button>
            <span>{{ pdfDoc ? `${pageNum}/${pdfDoc.numPages}` : '空白' }}</span>
            <button class="btn sm" :disabled="!pdfDoc || pageNum >= (pdfDoc?.numPages ?? 1)" @click="renderPage(pageNum + 1)">▶</button>
          </div>
          <div class="pager">
            <button class="btn sm" @click="zoomBtn(1 / 1.2)">−</button>
            <span>{{ Math.round(view.z * 100) }}%</span>
            <button class="btn sm" @click="zoomBtn(1.2)">＋</button>
            <button class="btn sm" @click="fitView">适应</button>
          </div>
        </div>
        <div
          ref="viewportRef" class="viewport"
          :class="{ adding: mode === 'add' }"
          @wheel.prevent="onWheel"
          @pointerdown="onViewportDown"
          @pointermove="onViewportMove"
          @pointerup="onViewportUp"
          @pointerleave="onViewportUp"
          @click="onCanvasClick"
        >
          <div class="world" :style="worldStyle">
            <canvas ref="canvasRef"></canvas>
            <div
              v-for="p in curPoints" :key="p.id"
              class="marker" :class="[p.type, { sel: selId === p.id, alarm: p.status === '损坏报废' }]"
              :style="{ left: p.x * 100 + '%', top: p.y * 100 + '%' }"
              :title="`${p.code} · ${TYPE_META[p.type].name}${p.owner ? ' · ' + p.owner : ''}`"
              @pointerdown.stop="onMarkerDown($event, p)"
              @click.stop="selectPoint(p)"
            >
              <span class="m-icon" v-html="ICONS[p.type]"></span>
              <span class="m-label">{{ p.code }}</span>
            </div>
          </div>
          <p v-if="mode === 'add'" class="mode-hint">打点模式：在图纸上点击放置「{{ TYPE_META[addType].name }}」点位</p>
        </div>
      </div>

      <aside class="side-col">
        <div class="card">
          <div class="card-title">图例与统计</div>
          <div
            v-for="(m, t) in TYPE_META" :key="t"
            class="legend" :class="{ draggable: canEdit(), dragging: legendDrag === t }"
            :title="canEdit() ? '点击按钮后点图纸打点，或直接按住拖到图纸上放置' : '只读账号'"
            @pointerdown.prevent="startLegendDrag(t as PointType)"
          >
            <span class="m-icon sm" v-html="ICONS[t as PointType]"></span>{{ m.name }} {{ countBy(t as PointType) }}
          </div>
          <p class="tip small" style="margin-top: 6px">可按住图例图标直接拖到图纸上打点；平移模式下可拖动点位微调位置；损坏报废点位红环闪烁标识</p>
        </div>

        <div class="card" v-if="selPoint">
          <div class="card-title">点位 · {{ selPoint.code }}</div>
          <div class="form-row">
            <div class="field">
              <label>点位编号</label>
              <input v-model="selPoint.code" class="input" maxlength="24" />
            </div>
            <div class="field" style="max-width: 120px">
              <label>类型</label>
              <select v-model="selPoint.type" class="select">
                <option v-for="(m, t) in TYPE_META" :key="t" :value="t">{{ m.name }}</option>
              </select>
            </div>
          </div>
            <div class="form-row">
            <div class="field">
              <label>位置描述</label>
              <input v-model="selPoint.location" class="input" maxlength="32" placeholder="如 301室东墙" />
            </div>
            <div class="field" style="max-width: 110px">
              <label>状态</label>
              <select v-model="selPoint.status" class="select">
                <option>在用</option><option>空闲</option><option>损坏报废</option>
              </select>
            </div>
          </div>
          <div class="form-row">
            <div class="field">
              <label>SN 号</label>
              <input v-model="selPoint.sn" class="input" maxlength="40" placeholder="设备序列号" />
            </div>
          </div>
          <div class="form-row" v-if="selPoint.type !== 'ap'">
            <div class="field">
              <label>使用人</label>
              <input v-model="selPoint.owner" class="input" maxlength="16" />
            </div>
            <div class="field">
              <label>部门</label>
              <input v-model="selPoint.dept" class="input" maxlength="24" />
            </div>
          </div>
          <div class="form-row" v-if="selPoint.type === 'printer'">
            <div class="field">
              <label>设备型号</label>
              <input v-model="selPoint.model" class="input" maxlength="40" placeholder="如 HP LaserJet M405dn" />
            </div>
            <div class="field">
              <label>IP 地址</label>
              <input v-model="selPoint.ip" class="input" maxlength="32" />
            </div>
          </div>
          <div class="form-row" v-if="selPoint.type === 'net'">
            <div class="field">
              <label>连接交换机</label>
              <input
                v-model="selPoint.switchName" class="input" maxlength="40" list="floorSwitchList"
                placeholder="选择或输入交换机"
              />
              <datalist id="floorSwitchList">
                <option v-for="sw in switchOptions" :key="sw" :value="sw" />
              </datalist>
            </div>
            <div class="field" style="max-width: 150px">
              <label>交换机端口</label>
              <input v-model="selPoint.switchPort" class="input" maxlength="24" placeholder="如 Gi1/0/12" />
            </div>
          </div>
          <div class="form-row" v-if="selPoint.type === 'phone'">
            <div class="field">
              <label>电话号</label>
              <input v-model="selPoint.phone" class="input" maxlength="20" />
            </div>
            <div class="field">
              <label>IP 地址</label>
              <input v-model="selPoint.ip" class="input" maxlength="32" />
            </div>
          </div>
          <div class="form-row" v-if="['cam', 'ap'].includes(selPoint.type)">
            <div class="field">
              <label>IP 地址</label>
              <input v-model="selPoint.ip" class="input" maxlength="32" />
            </div>
          </div>
          <div class="form-row" v-if="['pc', 'laptop'].includes(selPoint.type)">
            <div class="field">
              <label>IP 地址</label>
              <input v-model="selPoint.ip" class="input" maxlength="32" />
            </div>
          </div>
          <div class="form-row" v-if="['pc', 'laptop'].includes(selPoint.type)">
            <div class="field">
              <label>本机 MAC</label>
              <input v-model="selPoint.mac" class="input" maxlength="24" placeholder="AA:BB:CC:DD:EE:FF" />
            </div>
            <div class="field">
              <label>拓展坞 MAC</label>
              <input v-model="selPoint.dockMac" class="input" maxlength="24" placeholder="选填" />
            </div>
          </div>
          <div class="form-row">
            <div class="field" style="max-width: 100px" v-if="selPoint.type !== 'monitor'">
              <label>VLAN</label>
              <input v-model="selPoint.vlan" class="input" maxlength="8" />
            </div>
            <div class="field">
              <label>备注</label>
              <input v-model="selPoint.remark" class="input" maxlength="64" />
            </div>
          </div>
          <div class="form-row migrate-row" v-if="canEdit()">
            <div class="field">
              <label>迁移到其他图纸（工位调整）</label>
              <select v-model.number="migrateTarget" class="select" :disabled="!otherPlans.length">
                <option :value="0" disabled>{{ otherPlans.length ? '选择目标图纸…' : '暂无其他图纸' }}</option>
                <option v-for="op in otherPlans" :key="op.id" :value="op.id">{{ op.building }} · {{ op.floor }} · {{ op.name }}</option>
              </select>
            </div>
            <button class="btn sm" :disabled="!migrateTarget" style="align-self: flex-end; margin-bottom: 1px" @click="migrateSelPoint">迁移</button>
          </div>
          <div v-if="canEdit()" style="display: flex; gap: 8px">
            <button class="btn primary sm" @click="applySel">应用</button>
            <button class="btn danger sm" @click="removeSel">删除点位</button>
          </div>
        </div>
        <div class="card" v-else>
          <div class="card-title">点位编辑</div>
          <p class="tip">平移模式下点击图中点位进行编辑；打点模式点击图纸新增点位</p>
        </div>

        <div class="card ledger">
          <div class="card-title">
            点位台账
            <button class="btn sm ghost extra-btn" @click="exportCsv">导出CSV</button>
          </div>
          <div style="display: flex; gap: 6px; margin-bottom: 8px">
            <select v-model="fType" class="select" style="width: 96px">
              <option value="">全部类型</option>
              <option v-for="(m, t) in TYPE_META" :key="t" :value="t">{{ m.name }}</option>
            </select>
            <select v-model="fStatus" class="select" style="width: 92px">
              <option value="">全部状态</option><option>在用</option><option>空闲</option><option>损坏报废</option>
            </select>
            <input v-model="fKeyword" class="input" placeholder="搜索" />
          </div>
          <div style="overflow: auto; max-height: 300px">
            <table class="table" style="min-width: 980px">
              <thead><tr><th>编号</th><th>类型</th><th>SN 号</th><th>设备型号</th><th>位置</th><th>连接信息</th><th>MAC</th><th>使用人</th><th>部门</th><th>状态</th></tr></thead>
              <tbody>
                <tr v-for="p in ledgerRows" :key="p.id" :class="{ focused: p.id === selId }" @click="selId = p.id">
                  <td class="mono">{{ p.code }}</td>
                  <td><span :style="{ color: TYPE_META[p.type].color }">{{ TYPE_META[p.type].name }}</span></td>
                  <td class="mono ell">{{ p.sn || '-' }}</td>
                  <td class="ell">{{ p.model || '-' }}</td>
                  <td class="ell">{{ p.location || '-' }}</td>
                  <td class="mono ell" :title="connText(p)">{{ connText(p) }}</td>
                  <td class="mono ell" :title="macTitle(p)">{{ macText(p) }}</td>
                  <td>{{ p.owner || '-' }}</td>
                  <td>{{ p.dept || '-' }}</td>
                  <td><span :class="['badge', p.status === '在用' ? 'ok' : p.status === '损坏报废' ? 'danger' : 'warn']">{{ p.status }}</span></td>
                </tr>
              </tbody>
            </table>
            <p v-if="!ledgerRows.length" class="empty" style="padding: 20px 0">暂无点位</p>
          </div>
        </div>
      </aside>
    </div>

    <ModalDialog v-if="showNew" title="新建楼层图纸" :width="540" @close="showNew = false">
      <div class="form-row">
        <div class="field">
          <label>楼宇 <b>*</b></label>
          <input v-model="newForm.building" class="input" maxlength="16" placeholder="如 一号楼" />
        </div>
        <div class="field" style="max-width: 130px">
          <label>楼层 <b>*</b></label>
          <input v-model="newForm.floor" class="input" maxlength="8" placeholder="如 3F" />
        </div>
      </div>
      <div class="field">
        <label>图纸名称 <b>*</b></label>
        <input v-model="newForm.name" class="input" maxlength="48" placeholder="如 18-23自用楼层视频监控点位图" />
      </div>
      <div class="field">
        <label>PDF 图纸（可不传，先用空白画布打点）</label>
        <input ref="newFileRef" type="file" accept=".pdf" class="input" @change="onNewFile" />
      </div>
      <p v-if="newForm.pdfName" style="font-size: 12px; color: var(--accent)">已选择：{{ newForm.pdfName }}（{{ newForm.pageCount }} 页）</p>
      <p v-if="newErr" style="color: var(--danger); font-size: 12px">{{ newErr }}</p>
      <template #foot>
        <button class="btn" @click="showNew = false">取消</button>
        <button class="btn primary" @click="submitNew">创建</button>
      </template>
    </ModalDialog>

    <div class="toast" v-if="toast">{{ toast }}</div>
  </div>
</template>

<style scoped>
.page-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; flex-wrap: wrap; gap: 10px; }
.page-head .sub { font-size: 12px; color: var(--text-faint); margin-top: 4px; }
.floor-page { overflow: hidden; }
.floor-main { display: flex; gap: 12px; height: calc(100vh - 150px); min-height: 500px; }
.canvas-col { flex: 1; min-width: 0; padding: 0; display: flex; flex-direction: column; overflow: hidden; }
.canvas-toolbar {
  flex: none; display: flex; align-items: center; gap: 12px; padding: 8px 10px;
  border-bottom: 1px solid var(--line); background: var(--bg-panel-2);
  border-radius: var(--radius) var(--radius) 0 0;
}
.mode-group { display: flex; gap: 6px; flex-wrap: wrap; }
.mode-group button {
  display: flex; align-items: center; gap: 6px; background: var(--bg-elevated);
  border: 1px solid var(--line-strong); color: var(--text-muted); border-radius: 6px;
  padding: 5px 10px; font-size: 12px; cursor: pointer; transition: all var(--tr);
}
.mode-group button.on { background: var(--accent-deep); border-color: rgba(1, 1, 32, 0.35); color: var(--accent); }
.mode-group button:hover { color: var(--text); }
.pager { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text-muted); margin-left: auto; }
.viewport { flex: 1; position: relative; overflow: hidden; cursor: grab; background: #f4f4f8; }
.viewport:active { cursor: grabbing; }
.viewport.adding { cursor: crosshair; }
.world { position: absolute; }
.world canvas { display: block; }
.marker { position: absolute; transform: translate(-50%, -50%); cursor: pointer; user-select: none; }
.m-icon { display: block; filter: drop-shadow(0 1px 3px rgba(0, 0, 0, 0.85)); }
.m-icon :deep(svg) { display: block; }
.m-icon.sm :deep(svg) { width: 15px; height: 15px; }
.marker.sel::before {
  content: ''; position: absolute; left: 50%; top: 50%; width: 27px; height: 27px;
  transform: translate(-50%, -50%); border: 2px solid var(--accent); border-radius: 50%; pointer-events: none;
}
.marker.alarm::after {
  content: ''; position: absolute; left: 50%; top: 50%; width: 30px; height: 30px;
  transform: translate(-50%, -50%); border: 2px solid #dc2626; border-radius: 50%;
  animation: blink 1s infinite; pointer-events: none;
}
@keyframes blink { 50% { opacity: 0.3; } }
.m-label {
  position: absolute; left: 50%; top: 100%; transform: translateX(-50%);
  font-size: 10px; white-space: nowrap; color: #e6edf3; margin-top: 2px;
  background: rgba(10, 16, 22, 0.75); padding: 0 4px; border-radius: 3px;
  pointer-events: none;
}
.mode-hint {
  position: absolute; left: 50%; bottom: 12px; transform: translateX(-50%);
  background: var(--glass); border: 1px solid rgba(1, 1, 32, 0.4); color: var(--accent);
  padding: 5px 16px; border-radius: 16px; font-size: 12px; pointer-events: none;
}
.side-col { width: 330px; flex: none; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; }
.legend { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text-muted); margin: 5px 0; }
.legend.draggable { cursor: grab; user-select: none; touch-action: none; border-radius: 6px; padding: 3px 6px; margin: 2px -6px; transition: background var(--tr); }
.legend.draggable:hover { background: var(--bg-elevated); color: var(--text); }
.legend.draggable:active, .legend.draggable.dragging { cursor: grabbing; background: var(--accent-deep); }
.migrate-row { align-items: flex-end; }
.mono { font-family: var(--font-mono); font-size: 12px; }
.focused { outline: 1px solid var(--accent); outline-offset: -1px; background: rgba(1, 1, 32, 0.05) !important; }
.extra-btn { margin-left: auto; font-size: 11px; padding: 2px 8px; }
</style>
