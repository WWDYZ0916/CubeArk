<script setup lang="ts">
// 2D网络拓扑编辑器（AntV X6）：拖拽加节点 / 端口拖拽连线 / 属性编辑 / 保存 / PNG导出 / SN绑定台账
import { computed, onBeforeUnmount, onMounted, ref, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Graph, Shape } from '@antv/x6'
import { Export } from '@antv/x6-plugin-export'
import ModalDialog from '../components/ModalDialog.vue'
import {
  getSiteById, getTopoGraphs, saveTopoGraph, createTopoGraph, deleteTopoGraph, getDeviceLedger
} from '../api/mock'
import { downloadJson, stampName } from '../utils/export'
import { canEdit } from '../store/auth'
import type { TopoGraph, TopoNode, TopoEdge, TopoKind } from '../types'

const route = useRoute()
const router = useRouter()
const siteId = computed(() => Number(route.params.siteId))
const siteName = computed(() => getSiteById(siteId.value)?.name ?? '-')

const KINDS: Array<{ k: TopoKind; name: string; color: string }> = [
  { k: 'fw', name: '防火墙', color: '#e53935' },
  { k: 'core', name: '核心交换', color: '#f57c00' },
  { k: 'agg', name: '汇聚交换', color: '#c0ca33' },
  { k: 'acc', name: '接入交换', color: '#43a047' },
  { k: 'srv', name: '服务器', color: '#42a5f5' },
  { k: 'other', name: '其他', color: '#90a4ae' }
]
const kindOf = (k: string) => KINDS.find(x => x.k === k) ?? KINDS[5]

const NW = 128, NH = 48

// ---- 图管理 ----
const tick = ref(0)
const graphs = computed<TopoGraph[]>(() => { tick.value; return getTopoGraphs(siteId.value) })
const curGraphId = ref(0)
const curName = ref('')
const dirty = ref(false)
const showNew = ref(false)
const newName = ref('')
const newErr = ref('')

// ---- 选中对象属性面板 ----
type Sel = { type: 'node'; id: string } | { type: 'edge'; id: string } | null
const sel = ref<Sel>(null)
const nodeForm = ref({ label: '', ip: '', sn: '', remark: '' })
const edgeLabel = ref('')
const snList = computed(() => { tick.value; return getDeviceLedger(siteId.value).map(r => r.sn) })

const toast = ref('')
let toastTimer: number | undefined
function showToast(msg: string, isErr = false) {
  toast.value = msg
  window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => (toast.value = ''), 4000)
  const el = document.querySelector('.toast') as HTMLElement | null
  if (el) el.style.borderColor = isErr ? 'rgba(185, 28, 28, 0.5)' : 'rgba(21, 128, 61, 0.5)'
}

// ---- X6 ----
const wrapRef = ref<HTMLDivElement>()
let graph: Graph | null = null

function nodeConfig(n: TopoNode) {
  return {
    id: n.id,
    x: n.x, y: n.y,
    width: NW, height: NH,
    attrs: {
      body: { rx: 9, ry: 9, fill: kindOf(n.kind).color, stroke: '#ffffff', strokeWidth: 1.5 },
      label: { text: n.ip ? `${n.label}\n${n.ip}` : n.label, fill: '#07121e', fontSize: 12, fontWeight: 700 }
    },
    ports: {
      groups: {
        t: { position: 'top', attrs: { circle: { r: 5, magnet: true, stroke: '#87867f', fill: '#ffffff', strokeWidth: 1.6 } } },
        b: { position: 'bottom', attrs: { circle: { r: 5, magnet: true, stroke: '#87867f', fill: '#ffffff', strokeWidth: 1.6 } } },
        l: { position: 'left', attrs: { circle: { r: 5, magnet: true, stroke: '#87867f', fill: '#ffffff', strokeWidth: 1.6 } } },
        r: { position: 'right', attrs: { circle: { r: 5, magnet: true, stroke: '#87867f', fill: '#ffffff', strokeWidth: 1.6 } } }
      },
      items: [{ id: 't', group: 't' }, { id: 'b', group: 'b' }, { id: 'l', group: 'l' }, { id: 'r', group: 'r' }]
    },
    data: { kind: n.kind, label: n.label, ip: n.ip ?? '', sn: n.sn ?? '', remark: n.remark ?? '' } as Omit<TopoNode, 'id' | 'x' | 'y'>
  }
}

function initGraph() {
  if (!wrapRef.value) return
  disposeGraph()
  graph = new Graph({
    container: wrapRef.value,
    // 普通用户只读：禁用节点/连线拖拽与连线创建（仍可选中查看属性、导出）
    interacting: canEdit(),
    grid: { size: 12, visible: true, type: 'dot', args: { color: '#dcdfe8', thickness: 1 } },
    background: { color: '#ffffff' },
    connecting: {
      snap: true,
      allowBlank: false,
      allowLoop: false,
      allowMulti: false,
      highlight: true,
      connector: { name: 'rounded' },
      connectionPoint: 'boundary',
      createEdge() {
        return new Shape.Edge({
          attrs: { line: { stroke: '#87867f', strokeWidth: 2, targetMarker: { name: 'block', size: 7 } } },
          zIndex: 0,
          data: { label: '' }
        })
      }
    }
  })

  graph.use(new Export())

  graph.on('node:click', ({ node }) => selectNode(node))
  graph.on('edge:click', ({ edge }) => selectEdge(edge))
  graph.on('node:dblclick', ({ node }) => {
    const d = node.getData() as Omit<TopoNode, 'id' | 'x' | 'y'>
    if (d.sn) router.push(`/sites/${siteId.value}/devices?focus=${d.sn}`)
    else showToast('该节点未绑定设备SN，请在右侧属性面板绑定后双击跳转')
  })
  graph.on('blank:click', clearSel)
  graph.on('node:change:position', markDirty)
  graph.on('node:added', markDirty)
  graph.on('edge:added', markDirty)
  graph.on('node:removed', markDirty)
  graph.on('edge:removed', markDirty)
}

function loadGraph() {
  if (!graph) return
  const g = graphs.value.find(x => x.id === curGraphId.value)
  if (!g) { graphs.value.length && openGraph(graphs.value[0].id); return }
  curName.value = g.name
  graph.fromJSON({
    nodes: g.nodes.map(nodeConfig),
    edges: g.edges.map(e => ({
      id: e.id,
      source: { cell: e.source },
      target: { cell: e.target },
      attrs: { line: { stroke: '#87867f', strokeWidth: 2 } },
      labels: e.label ? [{ attrs: { label: { text: e.label, fill: '#3a3a3f', fontSize: 11 } } }] : [],
      zIndex: 0,
      data: { label: e.label ?? '' }
    }))
  })
  dirty.value = false
  clearSel()
}

function openGraph(id: number, force = false) {
  if (dirty.value && !force && !window.confirm('当前拓扑未保存，确认切换？')) return
  curGraphId.value = id
  loadGraph()
}

function markDirty() { dirty.value = true }

// ---- 选择与编辑 ----
let selNode: any = null
let selEdge: any = null
function highlight() {
  selNode?.attr('body/stroke', '#010120')
  selEdge?.attr('line/stroke', '#010120')
}
function unhighlight() {
  if (selNode) selNode.attr('body/stroke', '#ffffff')
  if (selEdge) selEdge.attr('line/stroke', '#87867f')
}
function clearSel() {
  unhighlight()
  selNode = null; selEdge = null
  sel.value = null
}
function selectNode(node: any) {
  unhighlight()
  selNode = node; selEdge = null
  const d = node.getData() as Omit<TopoNode, 'id' | 'x' | 'y'>
  nodeForm.value = { label: d.label, ip: d.ip, sn: d.sn, remark: d.remark }
  sel.value = { type: 'node', id: String(node.id) }
  highlight()
}
function selectEdge(edge: any) {
  unhighlight()
  selEdge = edge; selNode = null
  const d = edge.getData() as { label?: string }
  edgeLabel.value = d?.label ?? ''
  sel.value = { type: 'edge', id: String(edge.id) }
  highlight()
}

function applyNode() {
  if (!selNode) return
  const d = selNode.getData() as Omit<TopoNode, 'id' | 'x' | 'y'>
  Object.assign(d, { ...nodeForm.value })
  selNode.setData(d)
  selNode.attr('label/text', d.ip ? `${d.label}\n${d.ip}` : d.label)
  markDirty()
  showToast('节点属性已更新（记得保存画布）')
}
function applyEdge() {
  if (!selEdge) return
  selEdge.setData({ label: edgeLabel.value })
  selEdge.setLabels(edgeLabel.value ? [{ attrs: { label: { text: edgeLabel.value, fill: '#3a3a3f', fontSize: 11 } } }] : [])
  markDirty()
  showToast('链路标注已更新（记得保存画布）')
}
function removeSel() {
  if (!canEdit()) return
  if (selNode) { selNode.remove({ deep: true }); clearSel() }
  else if (selEdge) { selEdge.remove(); clearSel() }
}

// ---- 拖拽添加节点 ----
function onPaletteDragStart(e: DragEvent, kind: TopoKind) {
  e.dataTransfer?.setData('topo-kind', kind)
}
function onCanvasDrop(e: DragEvent) {
  if (!canEdit()) return
  const kind = e.dataTransfer?.getData('topo-kind') as TopoKind | ''
  if (!kind || !graph) return
  e.preventDefault()
  const p = graph.clientToLocal(e.clientX, e.clientY)
  const meta: Omit<TopoNode, 'id' | 'x' | 'y'> = {
    kind, label: `新${kindOf(kind).name}`, ip: '', sn: '', remark: ''
  }
  const node = graph.addNode(nodeConfig({ id: `n${Date.now()}`, x: p.x - NW / 2, y: p.y - NH / 2, ...meta }))
  selectNode(node)
  markDirty()
}

// ---- 保存 / 导出 ----
function serialize(): TopoGraph | null {
  if (!graph) return null
  const nodes: TopoNode[] = graph.getNodes().map(n => {
    const pos = n.getPosition()
    const d = n.getData<Omit<TopoNode, 'id' | 'x' | 'y'>>()
    return { id: String(n.id), x: Math.round(pos.x), y: Math.round(pos.y), ...d }
  })
  const edges: TopoEdge[] = graph.getEdges().map(e => {
    const s = e.getSource() as { cell?: string } | string
    const t = e.getTarget() as { cell?: string } | string
    const d = e.getData<{ label?: string }>()
    return {
      id: String(e.id),
      source: typeof s === 'string' ? s : s.cell!,
      target: typeof t === 'string' ? t : t.cell!,
      label: d?.label ?? ''
    }
  })
  return { id: curGraphId.value, siteId: siteId.value, name: curName.value.trim() || '未命名拓扑', nodes, edges }
}
function save() {
  const g = serialize()
  if (!g) return
  const res = saveTopoGraph(g)
  if (!res.ok) { showToast(res.error!, true); return }
  dirty.value = false
  tick.value++
  showToast(`拓扑「${g.name}」已保存（${g.nodes.length}节点 / ${g.edges.length}链路）`)
}
// 导出数据：当前画布节点/链路为JSON（先自动保存草稿内容）
function exportData() {
  const g = serialize()
  if (!g) return
  downloadJson(stampName(g.name || '网络拓扑', 'json'), {
    name: g.name, exportedAt: new Date().toLocaleString('zh-CN', { hour12: false }),
    nodes: g.nodes, edges: g.edges
  })
  showToast(`已导出 ${g.nodes.length} 节点 / ${g.edges.length} 链路（JSON）`)
}
function exportPng() {
  if (!graph) return
  graph.toSVG((svg: string) => {
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      const scale = 2
      canvas.width = Math.max(img.width, 800) * scale
      canvas.height = Math.max(img.height, 600) * scale
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      canvas.toBlob(b => {
        if (!b) return
        const a = document.createElement('a')
        a.href = URL.createObjectURL(b)
        a.download = `${curName.value || 'topology'}.png`
        a.click()
        URL.revokeObjectURL(a.href)
      })
      URL.revokeObjectURL(url)
    }
    img.src = url
  }, { preserveDimensions: true })
}

function disposeGraph() {
  graph?.dispose()
  graph = null
  selNode = null; selEdge = null
  sel.value = null
}

// ---- 新建 / 删除图 ----
function submitNew() {
  const res = createTopoGraph(siteId.value, newName.value)
  if (!res.ok) { newErr.value = res.error!; return }
  showNew.value = false
  newName.value = ''
  newErr.value = ''
  tick.value++
  openGraph(res.graph!.id, true)
  showToast('新拓扑图已创建，从左侧拖入节点开始绘制')
}
function removeGraph() {
  if (!window.confirm(`确认删除拓扑图「${curName.value}」？`)) return
  deleteTopoGraph(curGraphId.value)
  tick.value++
  const first = graphs.value[0]
  if (first) openGraph(first.id, true)
  else { curGraphId.value = 0; disposeGraph(); initGraph() }
  showToast('拓扑图已删除')
}

// ---- Delete 键删除选中 ----
function onKeydown(e: KeyboardEvent) {
  if (!canEdit()) return
  if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA') return
  if (e.key === 'Delete' || e.key === 'Backspace') {
    if (sel.value) { e.preventDefault(); removeSel() }
  }
}

onMounted(() => {
  initGraph()
  const first = graphs.value[0]
  if (first) { curGraphId.value = first.id; loadGraph() }
  window.addEventListener('keydown', onKeydown)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  disposeGraph()
})
</script>

<template>
  <div class="page topo-page">
    <div class="page-head page-narrow">
      <div>
        <div class="crumb">
          <span class="link" @click="router.push('/sites')">站点管理</span>
          <span class="sep">/</span><span>{{ siteName }}</span>
        </div>
        <h2 style="margin-top: 6px">网络拓扑</h2>
        <p class="sub">拖拽左侧图例到画布添加节点 · 从节点圆点拖出连线 · 双击已绑定SN的节点跳转设备台账 · Delete删除选中</p>
      </div>
      <div style="display: flex; gap: 8px; align-items: center">
        <span v-if="dirty" class="badge warn">未保存</span>
        <select :value="curGraphId" class="select" style="width: 200px" @change="openGraph(Number(($event.target as HTMLSelectElement).value))">
          <option v-for="g in graphs" :key="g.id" :value="g.id">{{ g.name }}</option>
        </select>
        <button class="btn" @click="exportPng">导出PNG</button>
        <button class="btn" :disabled="!curGraphId" @click="exportData">导出数据</button>
        <template v-if="canEdit()">
          <button class="btn" @click="showNew = true">＋ 新图</button>
          <button class="btn danger" :disabled="!curGraphId" @click="removeGraph">删图</button>
          <button class="btn primary" :disabled="!curGraphId" @click="save">保存</button>
        </template>
      </div>
    </div>

    <div class="topo-main page-narrow">
      <aside v-if="canEdit()" class="palette card">
        <div class="card-title">节点图例</div>
        <div
          v-for="k in KINDS" :key="k.k" class="pal-item" draggable="true"
          title="拖入画布"
          @dragstart="onPaletteDragStart($event, k.k)"
        >
          <span class="pal-chip" :style="{ background: k.color }"></span>
          <span class="pal-name">{{ k.name }}</span>
        </div>
        <p class="tip small" style="margin-top: 10px">拖动图例到画布添加节点；画布：滚轮缩放 / 空白处拖拽平移</p>
      </aside>

      <div
        ref="wrapRef" class="canvas card"
        @dragover.prevent
        @drop="onCanvasDrop"
      ></div>

      <aside class="props card">
        <div class="card-title">属性面板</div>
        <template v-if="sel?.type === 'node'">
          <div class="field">
            <label>节点名称</label>
            <input v-model="nodeForm.label" class="input" maxlength="24" />
          </div>
          <div class="field">
            <label>IP 地址</label>
            <input v-model="nodeForm.ip" class="input" maxlength="32" />
          </div>
          <div class="field">
            <label>绑定设备SN（双击节点跳台账）</label>
            <input v-model="nodeForm.sn" class="input" list="snList" maxlength="64" placeholder="从台账选择或手输" />
            <datalist id="snList">
              <option v-for="s in snList" :key="s" :value="s" />
            </datalist>
          </div>
          <div class="field">
            <label>备注</label>
            <input v-model="nodeForm.remark" class="input" maxlength="64" />
          </div>
          <div class="prop-actions">
            <template v-if="canEdit()">
              <button class="btn primary sm" @click="applyNode">应用</button>
            </template>
            <button v-if="nodeForm.sn" class="btn sm" @click="router.push(`/sites/${siteId}/devices?focus=${nodeForm.sn}`)">查看台账</button>
            <button v-if="canEdit()" class="btn danger sm" @click="removeSel">删除节点</button>
          </div>
        </template>
        <template v-else-if="sel?.type === 'edge'">
          <div class="field">
            <label>链路标注（如 10G / GE / 双上联）</label>
            <input v-model="edgeLabel" class="input" maxlength="24" />
          </div>
          <div class="prop-actions" v-if="canEdit()">
            <button class="btn primary sm" @click="applyEdge">应用</button>
            <button class="btn danger sm" @click="removeSel">删除连线</button>
          </div>
        </template>
        <p v-else class="tip">点击画布中的节点或连线编辑属性</p>
      </aside>
    </div>

    <ModalDialog v-if="showNew" title="新建拓扑图" :width="420" @close="showNew = false">
      <div class="field">
        <label>拓扑图名称 <b>*</b></label>
        <input v-model="newName" class="input" placeholder="如：一号楼网络拓扑" maxlength="32" />
        <p v-if="newErr" class="err" style="color: var(--danger); font-size: 12px">{{ newErr }}</p>
      </div>
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
.topo-main { display: flex; gap: 12px; height: calc(100vh - 150px); min-height: 480px; }
.palette { width: 176px; flex: none; }
.pal-item {
  display: flex; align-items: center; gap: 8px; padding: 8px 10px; margin-bottom: 6px;
  border: 1px dashed var(--line-strong); border-radius: 8px; font-size: 13px;
  cursor: grab; user-select: none; transition: all var(--tr); white-space: nowrap;
}
.pal-item:hover { border-color: var(--accent); background: var(--bg-elevated); }
.pal-item:active { cursor: grabbing; }
.pal-chip { width: 12px; height: 20px; border-radius: 4px; flex: none; }
.pal-name { overflow: hidden; text-overflow: ellipsis; }
.canvas { flex: 1; min-width: 0; padding: 0; overflow: hidden; position: relative; }
.props { width: 250px; flex: none; overflow-y: auto; }
.prop-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.topo-page { overflow: hidden; }
</style>
