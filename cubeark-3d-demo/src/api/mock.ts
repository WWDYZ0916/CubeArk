import type {
  RoomSceneData, RackSceneData, USlot, WarehouseDevice, DeviceBrief,
  RackInfo, Site, RoomMeta, SiteStats, StockLog, AssetKind, StockOp,
  ITAsset, LedgerMeta, LedgerRow, IDCAssetRow, HWStatus, TopoGraph, ServerAccount, AccountTable,
  FloorPlan, FloorPoint, PointType, VlanPlan, IpEntry, AppUser, UserRole,
  SnmpConfig, DeviceEnv, SiteEnvRow, SnmpTestResult, HwCaps, CheckDropResult, RepairRecord
} from '../types'

// 演示/正式数据开关：false = 系统初始为空白（不含任何演示站点/设备/点位等测试数据），
// 首次使用由管理员自行新增站点与设备；改为 true 可在本地演示时载入内置演示数据。
const SEED_DEMO = false

// 数据层级：站点 Site -> 机房 RoomMeta -> 机柜 RackInfo -> U位/设备
// 与《开发02_REST接口文档.md》/scene/*、/idc/* 契约一致（真实环境替换为 axios 调用）
// 约束：getRoomScene/getRackScene/getWarehouse/checkU/applyMount/addRack/deleteRack
//       为 3D 视图（Room3DView，代码原样迁移）依赖的稳定接口，签名不可变更

// ---------- 站点 ----------
const sites: Site[] = [
  { id: 1, name: '合肥一号站点', address: '合肥市高新区创新大道1号楼', owner: '王运维', remark: '默认站点 · IDC机房' },
  { id: 2, name: '总部办公楼', address: '合肥市政务区天鹅湖路88号', owner: '李网管', remark: '办公楼弱电间与点位' }
]
let siteSeq = 2

// ---------- 机房 ----------
const roomsMeta: RoomMeta[] = [
  { id: 1, siteId: 1, code: 'HF-IDC-01', name: '合肥一号机房', floor: '3F' },
  { id: 2, siteId: 2, code: 'HQ-B1', name: '总部B1弱电机房', floor: 'B1' }
]
let roomSeq = 2

// ---------- 机柜（按机房归属） ----------
const roomRacks = new Map<number, RackInfo[]>()
const usageTable = [71.4, 45.2, 88.1, 33.3, 59.5, 95.2, 47.6, 66.7, 28.6, 78.6, 52.4, 83.3]
{
  const racks: RackInfo[] = []
  let i = 0
  for (const row of [1, 2]) {
    for (const col of [1, 2, 3, 4, 5, 6]) {
      const id = i + 1
      racks.push({
        id,
        code: `${row === 1 ? 'A' : 'B'}0${col}`,
        row_no: row, col_no: col, u_total: 42,
        pos: { x: (col - 3.5) * 1.6, y: 0, z: (row - 1.5) * 2.8 }, rotation_y: 0,
        used_u: Math.round((usageTable[i] / 100) * 42), usage_pct: usageTable[i],
        health: id === 3 ? 2 : 1, alarm_count: id === 3 ? 1 : 0
      })
      i++
    }
  }
  roomRacks.set(1, racks)

  const racks2: RackInfo[] = []
  const usage2 = [40.5, 38.1, 61.9, 45.2, 33.3, 52.4]
  for (let col = 1; col <= 6; col++) {
    racks2.push({
      id: 12 + col,
      code: `B10${col}`,
      row_no: 1, col_no: col, u_total: 42,
      pos: { x: (col - 3.5) * 1.6, y: 0, z: -1.4 }, rotation_y: 0,
      used_u: Math.round((usage2[col - 1] / 100) * 42), usage_pct: usage2[col - 1],
      health: 1, alarm_count: 0
    })
  }
  roomRacks.set(2, racks2)
}
let rackSeq = 18
const prebuiltRackMaxId = 18 // 预置机柜（懒生成通用占用）；用户新增柜为空柜

// ---------- U位 ----------
interface MountedDevice {
  id: number
  sn: string
  name: string
  category: number
  vendor: string
  model: string
  u_height: number
  manage_ip?: string
  biz_ip?: string
  health: 1 | 2
  status: number
}

let deviceSeq = 100
// 演示预置设备（含懒生成的通用设备）；用户后续新入库/上架的设备不在其中
const demoDeviceIds = new Set<number>()
const mk = (d: Omit<MountedDevice, 'id'>): MountedDevice => {
  const dev: MountedDevice = { id: ++deviceSeq, ...d }
  demoDeviceIds.add(dev.id)
  return dev
}

// 七分类：1虚拟化服务器 2交换机 3防火墙 4存储 5HPC登陆节点 6HPC计算节点 7其他
const mountedA01: MountedDevice[] = [
  mk({ sn: 'SN20260101041', name: '核心交换-01', category: 2, vendor: 'H3C', model: 'S7506', u_height: 1, manage_ip: '192.168.10.1', biz_ip: '10.0.0.1', health: 1, status: 2 }),
  mk({ sn: 'SN20260101040', name: '核心交换-02', category: 2, vendor: 'H3C', model: 'S5130S', u_height: 1, manage_ip: '192.168.10.2', biz_ip: '10.0.0.2', health: 1, status: 2 }),
  mk({ sn: 'SN20260101038', name: '虚拟化节点-01', category: 1, vendor: 'Dell', model: 'R740', u_height: 2, manage_ip: '192.168.10.11', biz_ip: '192.168.100.11', health: 1, status: 2 }),
  mk({ sn: 'SN20260101034', name: '分布式存储-01', category: 4, vendor: 'NATAPP', model: 'N8000', u_height: 4, manage_ip: '192.168.10.21', biz_ip: '192.168.100.21', health: 1, status: 2 }),
  mk({ sn: 'SN20260101020', name: '虚拟化节点-02', category: 1, vendor: 'Dell', model: 'R750', u_height: 2, manage_ip: '192.168.10.12', biz_ip: '192.168.100.12', health: 2, status: 2 }),
  mk({ sn: 'SN20260101001', name: '列头PDU-A', category: 7, vendor: 'APC', model: 'AP8959EU3', u_height: 1, health: 1, status: 2 }),
  mk({ sn: 'SN20260101099', name: '边界防火墙-01', category: 3, vendor: '飞塔', model: 'FG-1000D', u_height: 1, manage_ip: '192.168.10.254', biz_ip: '10.0.0.254', health: 1, status: 2 }),
  mk({ sn: 'SN20260101077', name: 'HPC登录节点-01', category: 5, vendor: '浪潮', model: 'NF5280M5', u_height: 1, manage_ip: '192.168.10.31', biz_ip: '192.168.100.31', health: 1, status: 2 }),
  mk({ sn: 'SN20260101078', name: 'HPC计算节点-01', category: 6, vendor: '浪潮', model: 'NF5280M6', u_height: 2, manage_ip: '192.168.10.32', biz_ip: '192.168.100.32', health: 1, status: 2 }),
  mk({ sn: 'SN20260101036', name: '接入交换-01', category: 2, vendor: 'H3C', model: 'S6520X', u_height: 1, manage_ip: '192.168.10.3', biz_ip: '10.0.0.3', health: 1, status: 2 }),
  mk({ sn: 'SN20260101024', name: '数据库服务器-01', category: 1, vendor: 'Dell', model: 'R840', u_height: 3, manage_ip: '192.168.10.13', biz_ip: '192.168.100.13', health: 1, status: 2 })
]
const mountPlan: Array<[MountedDevice, number]> = [
  [mountedA01[0], 41], [mountedA01[1], 40], [mountedA01[2], 38],
  [mountedA01[3], 34], [mountedA01[4], 20], [mountedA01[5], 1],
  [mountedA01[6], 42], [mountedA01[7], 17], [mountedA01[8], 12],
  [mountedA01[9], 33], [mountedA01[10], 30]
]

const rackSlots = new Map<number, USlot[]>()
{
  const slots: USlot[] = []
  for (let u = 1; u <= 42; u++) slots.push({ u_no: u, status: 0, device: null })
  for (const [dev, start] of mountPlan) {
    for (let u = start; u < start + dev.u_height; u++) {
      slots[u - 1] = { u_no: u, status: 1, device: toBrief(dev) }
    }
  }
  rackSlots.set(1, slots)
}

function toBrief(d: MountedDevice): DeviceBrief {
  return {
    id: d.id, sn: d.sn, name: d.name, category: d.category,
    model: { vendor: d.vendor, model: d.model, u_height: d.u_height },
    status: d.status, manage_ip: d.manage_ip, biz_ip: d.biz_ip, health: d.health
  }
}

// ---------- 在库设备（按站点隔离） ----------
const warehouses = new Map<number, WarehouseDevice[]>([
  [1, [
    { id: 201, sn: 'SN20260201001', name: '虚拟化节点-03', category: 1, vendor: '华为', model: '2288H V5', u_height: 2 },
    { id: 202, sn: 'SN20260201002', name: '接入交换-03', category: 2, vendor: 'Cisco', model: 'N9K-C93180YC', u_height: 1 },
    { id: 203, sn: 'SN20260201003', name: '虚拟化节点-04', category: 1, vendor: 'Dell', model: 'R740', u_height: 2 }
  ]],
  [2, [
    { id: 301, sn: 'SN20260301001', name: '楼层汇聚交换', category: 2, vendor: '华为', model: 'S5735S', u_height: 1 },
    { id: 302, sn: 'SN20260301002', name: '语音网关', category: 7, vendor: '量子', model: 'VG-8', u_height: 1 }
  ]]
])

// ---------- 内部工具 ----------
function allRacks(): RackInfo[] {
  const out: RackInfo[] = []
  roomRacks.forEach(list => out.push(...list))
  return out
}
function findRack(rackId: number): RackInfo | undefined {
  return allRacks().find(r => r.id === rackId)
}
function rackRoomId(rackId: number): number | undefined {
  for (const [roomId, list] of roomRacks) {
    if (list.some(r => r.id === rackId)) return roomId
  }
  return undefined
}
function roomSiteId(roomId: number): number | undefined {
  return roomsMeta.find(r => r.id === roomId)?.siteId
}

// 3D 视图当前绑定的机房（Room3DView 挂载时调用）
let activeRoomId = 1
export function setActiveRoom(roomId: number) {
  if (roomsMeta.some(r => r.id === roomId)) activeRoomId = roomId
}

// ---------- 站点/机房 CRUD ----------
export function getSites(): Site[] {
  return sites.slice()
}
export function getSiteById(id: number): Site | undefined {
  return sites.find(s => s.id === id)
}
export function saveSite(input: { id?: number; name: string; address: string; owner: string; remark: string }): { ok: boolean; error?: string } {
  const name = input.name.trim()
  if (!name) return { ok: false, error: '站点名称不能为空' }
  if (input.id) {
    const s = sites.find(x => x.id === input.id)
    if (!s) return { ok: false, error: '站点不存在' }
    if (sites.some(x => x.id !== input.id && x.name === name)) return { ok: false, error: '站点名称已存在' }
    Object.assign(s, { name, address: input.address.trim(), owner: input.owner.trim(), remark: input.remark.trim() })
    return { ok: true }
  }
  if (sites.some(x => x.name === name)) return { ok: false, error: '站点名称已存在' }
  sites.push({ id: ++siteSeq, name, address: input.address.trim(), owner: input.owner.trim(), remark: input.remark.trim() })
  return { ok: true }
}
export function deleteSite(id: number): { ok: boolean; error?: string } {
  const idx = sites.findIndex(s => s.id === id)
  if (idx < 0) return { ok: false, error: '站点不存在' }
  const rooms = roomsMeta.filter(r => r.siteId === id)
  if (rooms.length) return { ok: false, error: `站点下存在 ${rooms.length} 个机房，请先删除机房` }
  sites.splice(idx, 1)
  warehouses.delete(id)
  return { ok: true }
}

export function siteStats(siteId: number): SiteStats {
  const rooms = roomsMeta.filter(r => r.siteId === siteId)
  const racks = rooms.flatMap(r => roomRacks.get(r.id) ?? [])
  const totalU = racks.reduce((s, r) => s + r.u_total, 0)
  const usedU = racks.reduce((s, r) => s + r.used_u, 0)
  return {
    roomCount: rooms.length,
    rackCount: racks.length,
    usagePct: totalU ? Math.round((usedU / totalU) * 1000) / 10 : 0,
    alarmRacks: racks.filter(r => r.health === 2).length
  }
}

export function getRooms(siteId: number): RoomMeta[] {
  return roomsMeta.filter(r => r.siteId === siteId)
}
export function getRoomMeta(roomId: number): RoomMeta | undefined {
  return roomsMeta.find(r => r.id === roomId)
}
export function saveRoom(input: { id?: number; siteId: number; code: string; name: string; floor: string }): { ok: boolean; error?: string } {
  const code = input.code.trim()
  const name = input.name.trim()
  if (!code) return { ok: false, error: '机房编码不能为空' }
  if (!name) return { ok: false, error: '机房名称不能为空' }
  if (input.id) {
    const r = roomsMeta.find(x => x.id === input.id)
    if (!r) return { ok: false, error: '机房不存在' }
    if (roomsMeta.some(x => x.id !== input.id && x.code === code)) return { ok: false, error: '机房编码已存在' }
    Object.assign(r, { code, name, floor: input.floor.trim() })
    return { ok: true }
  }
  if (roomsMeta.some(x => x.code === code)) return { ok: false, error: '机房编码已存在' }
  const id = ++roomSeq
  roomsMeta.push({ id, siteId: input.siteId, code, name, floor: input.floor.trim() })
  roomRacks.set(id, [])
  return { ok: true }
}
export function deleteRoom(id: number): { ok: boolean; error?: string } {
  const idx = roomsMeta.findIndex(r => r.id === id)
  if (idx < 0) return { ok: false, error: '机房不存在' }
  const racks = roomRacks.get(id) ?? []
  if (racks.length) return { ok: false, error: `机房下存在 ${racks.length} 个机柜，请先在3D视图删除机柜` }
  roomsMeta.splice(idx, 1)
  roomRacks.delete(id)
  return { ok: true }
}

// ---------- 3D 场景数据（签名保持不变，内部站点/机房感知） ----------
export function getRoomScene(): RoomSceneData {
  const meta = getRoomMeta(activeRoomId)!
  return { room: { id: meta.id, name: meta.name, floor: meta.floor }, racks: roomRacks.get(activeRoomId)! }
}

export function getRackScene(rackId: number): RackSceneData | null {
  const rack = findRack(rackId)
  if (!rack) return null
  if (!rackSlots.has(rackId) && rackId <= prebuiltRackMaxId) {
    const slots: USlot[] = []
    for (let u = 1; u <= rack.u_total; u++) slots.push({ u_no: u, status: 0, device: null })
    const generic: Array<[number, number]> = [[40, 1], [30, 4], [18, 2], [5, 1]]
    for (const [start, h] of generic) {
      const dev = mk({
        sn: `SN-R${rackId}-${start}`, name: `设备-${rack.code}-U${start}`,
        category: h >= 4 ? 4 : 1, vendor: 'Dell', model: 'R740', u_height: h, health: 1, status: 2
      })
      for (let u = start; u < start + h; u++) slots[u - 1] = { u_no: u, status: 1, device: toBrief(dev) }
    }
    rackSlots.set(rackId, slots)
  }
  return { rack: { id: rack.id, code: rack.code, u_total: rack.u_total }, u_slots: rackSlots.get(rackId)! }
}

export function getWarehouse(): WarehouseDevice[] {
  const siteId = roomSiteId(activeRoomId) ?? 1
  return (warehouses.get(siteId) ?? []).slice()
}

// 对齐 POST /scene/racks/{id}/check-u（按设备所属站点的在库池校验）
export function checkU(rackId: number, deviceId: number, uStart: number): { ok: boolean; u_end: number; conflicts: string[] } {
  const rack = findRack(rackId)
  if (!rack) return { ok: false, u_end: uStart, conflicts: ['机柜不存在'] }
  const siteId = roomSiteId(rackRoomId(rackId)!) ?? 1
  const dev = (warehouses.get(siteId) ?? []).find(d => d.id === deviceId)
  const slots = rackSlots.get(rackId)
  if (!dev || !slots) return { ok: false, u_end: uStart, conflicts: ['设备不在库'] }
  if (uStart < 1 || uStart + dev.u_height - 1 > rack.u_total) return { ok: false, u_end: rack.u_total, conflicts: ['超出机柜U位范围'] }
  const conflicts: string[] = []
  for (let u = uStart; u < uStart + dev.u_height; u++) {
    if (slots[u - 1].device) conflicts.push(`U${u}: ${slots[u - 1].device!.sn}`)
  }
  return { ok: conflicts.length === 0, u_end: uStart + dev.u_height - 1, conflicts }
}

let orderSeq = 1
// 演示：上架单生成后立即执行（真实环境为 POST /flow/orders + 审批流）
export function applyMount(rackId: number, dev: WarehouseDevice, uStart: number): { orderNo: string; uStart: number; uEnd: number } {
  const rack = findRack(rackId)!
  const slots = rackSlots.get(rackId)!
  const siteId = roomSiteId(rackRoomId(rackId)!) ?? 1
  const pool = warehouses.get(siteId)!
  const id = ++deviceSeq
  for (let u = uStart; u < uStart + dev.u_height; u++) {
    slots[u - 1] = {
      u_no: u, status: 1,
      device: {
        id, sn: dev.sn, name: dev.name, category: dev.category,
        model: { vendor: dev.vendor, model: dev.model, u_height: dev.u_height },
        status: 2, health: 1, manage_ip: dev.manage_ip, biz_ip: dev.biz_ip
      }
    }
  }
  pool.splice(pool.findIndex(d => d.id === dev.id), 1)
  const uEnd = uStart + dev.u_height - 1
  rack.used_u += dev.u_height
  rack.usage_pct = Math.round((rack.used_u / rack.u_total) * 1000) / 10
  logStock({
    kind: 'idc', title: dev.name, barcode: idcBarcodes.get(dev.id) ?? '', sn: dev.sn, op: '上架',
    operator: '当前用户', siteId, roomId: rackRoomId(rackId),
    reason: '3D拖拽上架（演示直接执行）', remark: `${rack.code} U${uStart}-U${uEnd}`
  })
  return { orderNo: `SJ20261022${String(orderSeq++).padStart(4, '0')}`, uStart, uEnd }
}

// 对齐 POST /idc/racks（加入当前激活机房）与 DELETE /idc/racks/{id}（占用校验）
export function addRack(input: { code: string; u_total: number; row: number }): { ok: boolean; error?: string } {
  const code = input.code.trim()
  if (!code) return { ok: false, error: '机柜编号不能为空' }
  const roomList = roomRacks.get(activeRoomId)!
  if (allRacks().some(r => r.code === code && rackRoomId(r.id) === activeRoomId)) {
    return { ok: false, error: `机柜编号 ${code} 已存在` }
  }
  if (!(input.row >= 1 && input.row <= 99)) return { ok: false, error: '排号无效（1~99）' }
  if (![22, 42, 47].includes(input.u_total)) return { ok: false, error: 'U高度无效' }
  const sameRow = roomList.filter(r => r.row_no === input.row)
  const col = (sameRow.length ? Math.max(...sameRow.map(r => r.col_no)) : 0) + 1
  const id = ++rackSeq
  const uTotal = input.u_total
  roomList.push({
    id,
    code,
    row_no: input.row,
    col_no: col,
    u_total: uTotal,
    pos: { x: (col - 3.5) * 1.6, y: 0, z: (input.row - 1.5) * 2.8 },
    rotation_y: 0,
    used_u: 0,
    usage_pct: 0,
    health: 1,
    alarm_count: 0
  })
  const slots: USlot[] = []
  for (let u = 1; u <= uTotal; u++) slots.push({ u_no: u, status: 0, device: null })
  rackSlots.set(id, slots) // 新柜为空柜
  return { ok: true }
}

export function deleteRack(id: number): { ok: boolean; error?: string } {
  const rack = findRack(id)
  if (!rack) return { ok: false, error: '机柜不存在' }
  const slots = rackSlots.get(id)
  if (slots && slots.some(s => s.device)) {
    return { ok: false, error: `机柜 ${rack.code} 存在在用设备（${slots.filter(s => s.device).length}U），请先下架` }
  }
  const roomId = rackRoomId(id)!
  const list = roomRacks.get(roomId)!
  list.splice(list.findIndex(r => r.id === id), 1)
  rackSlots.delete(id)
  return { ok: true }
}

// 3D视图：编辑已上架设备（名称/SN/U高度/业务IP/管理IP/状态）
// U高度变更时从当前起始U重排，冲突（他设备占用）或越界则整体拒绝，不产生半改状态
export function editMountedDevice(rackId: number, deviceId: number, patch: {
  name?: string; sn?: string; uHeight?: number; uStart?: number
  bizIp?: string; manageIp?: string; status?: number
  category?: number; vendor?: string; model?: string
}): { ok: boolean; error?: string } {
  const rack = findRack(rackId)
  const slots = rackSlots.get(rackId)
  if (!rack || !slots) return { ok: false, error: '机柜不存在' }
  let oldStart = 0
  let cur: DeviceBrief | null = null
  for (let u = 1; u <= rack.u_total; u++) {
    if (slots[u - 1].device?.id === deviceId) { oldStart = u; cur = slots[u - 1].device!; break }
  }
  if (!cur || !oldStart) return { ok: false, error: '设备不在该机柜' }

  const oldH = cur.model.u_height
  const newH = patch.uHeight ?? oldH
  if (!(newH >= 1 && newH <= 20)) return { ok: false, error: 'U高度须在 1~20 之间' }
  const start = patch.uStart ?? oldStart
  if (!(start >= 1 && start + newH - 1 <= rack.u_total)) {
    return { ok: false, error: `起始U需在 1~${rack.u_total - newH + 1} 之间（当前 ${newH}U）` }
  }

  const newSn = patch.sn?.trim() ?? cur.sn
  if (newSn !== cur.sn) {
    const siteId = roomSiteId(rackRoomId(rackId)!) ?? 1
    if (snExists(newSn) || mountedOfSite(siteId).some(m => m.sn === newSn && m.deviceId !== deviceId)) {
      return { ok: false, error: `SN ${newSn} 已存在（全库唯一）` }
    }
  }

  // 原占用区视为可用（设备自身）
  const own = new Set<number>()
  for (let u = oldStart; u < oldStart + oldH; u++) own.add(u)
  for (let u = start; u < start + newH; u++) {
    if (own.has(u)) continue
    if (slots[u - 1].device) {
      return { ok: false, error: `U${u} 已被 ${slots[u - 1].device!.sn} 占用` }
    }
  }

  for (let u = oldStart; u < oldStart + oldH; u++) slots[u - 1] = { u_no: u, status: 0, device: null }
  const updated: DeviceBrief = {
    ...cur,
    name: patch.name?.trim() || cur.name,
    sn: newSn,
    category: patch.category !== undefined ? patch.category : cur.category,
    manage_ip: patch.manageIp !== undefined ? patch.manageIp.trim() : cur.manage_ip,
    biz_ip: patch.bizIp !== undefined ? patch.bizIp.trim() : cur.biz_ip,
    status: patch.status !== undefined ? patch.status : cur.status,
    model: {
      ...cur.model,
      vendor: patch.vendor?.trim() || cur.model.vendor,
      model: patch.model?.trim() || cur.model.model,
      u_height: newH
    }
  }
  for (let u = start; u < start + newH; u++) slots[u - 1] = { u_no: u, status: 1, device: updated }
  rack.used_u = Math.max(0, rack.used_u + (newH - oldH))
  rack.usage_pct = Math.round((rack.used_u / rack.u_total) * 1000) / 10
  return { ok: true }
}

// 拖动设备前校验目标 U 区（忽略设备自身原占用）
export function checkDeviceMove(rackId: number, deviceId: number, uStart: number): CheckDropResult {
  const rack = findRack(rackId)
  const slots = rackSlots.get(rackId)
  if (!rack || !slots) return { ok: false, u_end: uStart, conflicts: ['机柜不存在'] }
  let oldStart = 0
  let cur: DeviceBrief | null = null
  for (let u = 1; u <= rack.u_total; u++) {
    if (slots[u - 1].device?.id === deviceId) { oldStart = u; cur = slots[u - 1].device!; break }
  }
  if (!cur || !oldStart) return { ok: false, u_end: uStart, conflicts: ['设备不在该机柜'] }
  const h = cur.model.u_height
  if (!(uStart >= 1 && uStart + h - 1 <= rack.u_total)) {
    return { ok: false, u_end: rack.u_total, conflicts: ['超出机柜U位范围'] }
  }
  const own = new Set<number>()
  for (let u = oldStart; u < oldStart + h; u++) own.add(u)
  const conflicts: string[] = []
  for (let u = uStart; u < uStart + h; u++) {
    if (own.has(u)) continue
    const d = slots[u - 1].device
    if (d) conflicts.push(`U${u}: ${d.sn}`)
  }
  return { ok: conflicts.length === 0, u_end: uStart + h - 1, conflicts }
}

// 把已上架设备移动到指定起始 U（等价于只改起始U的编辑）
export function moveMountedDevice(rackId: number, deviceId: number, uStart: number): { ok: boolean; error?: string } {
  return editMountedDevice(rackId, deviceId, { uStart })
}

export function unmountDevice(rackId: number, deviceId: number): { ok: boolean; error?: string } {
  const rack = findRack(rackId)
  const slots = rackSlots.get(rackId)
  if (!rack || !slots) return { ok: false, error: '机柜不存在' }
  let uStart = 0
  let cur: DeviceBrief | null = null
  for (let u = 1; u <= rack.u_total; u++) {
    if (slots[u - 1].device?.id === deviceId) { uStart = u; cur = slots[u - 1].device!; break }
  }
  if (!cur || !uStart) return { ok: false, error: '设备不在该机柜' }
  for (let u = uStart; u < uStart + cur.model.u_height; u++) {
    slots[u - 1] = { u_no: u, status: 0, device: null }
  }
  rack.used_u = Math.max(0, rack.used_u - cur.model.u_height)
  rack.usage_pct = Math.round((rack.used_u / rack.u_total) * 1000) / 10
  const siteId = roomSiteId(rackRoomId(rackId)!) ?? 1
  if (!warehouses.has(siteId)) warehouses.set(siteId, [])
  warehouses.get(siteId)!.push({
    id: cur.id, sn: cur.sn, name: cur.name, category: cur.category,
    vendor: cur.model.vendor, model: cur.model.model, u_height: cur.model.u_height,
    manage_ip: cur.manage_ip, biz_ip: cur.biz_ip
  })
  logStock({
    kind: 'idc', title: cur.name, barcode: idcBarcodes.get(cur.id) ?? '', sn: cur.sn, op: '下架',
    operator: '当前用户', siteId, roomId: rackRoomId(rackId),
    reason: '设备下架', remark: `${rack.code} U${uStart}-U${uStart + cur.model.u_height - 1} → 回站点库房`
  })
  return { ok: true }
}

// 定位某设备所在机柜与 U 区间（含设备简要信息）
function locateDevice(deviceId: number): { rackId: number; rack: RackInfo; uStart: number; uEnd: number; brief: DeviceBrief } | null {
  for (const [rackId, slots] of rackSlots) {
    let uStart = 0
    let brief: DeviceBrief | null = null
    for (let u = 1; u <= slots.length; u++) {
      const d = slots[u - 1].device
      if (d && d.id === deviceId) { uStart = u; brief = d; break }
    }
    if (!brief) continue
    let uEnd = uStart
    while (uEnd < slots.length && slots[uEnd].device?.id === deviceId) uEnd++
    const rack = findRack(rackId)
    if (rack) return { rackId, rack, uStart, uEnd, brief }
  }
  return null
}

// 台账删除设备：在库直接删；已上架先从U位移除再删（不可恢复，需确认）
export function deleteDevice(siteId: number, deviceId: number): { ok: boolean; error?: string } {
  const pool = warehouses.get(siteId) ?? []
  const w = pool.find(x => x.id === deviceId)
  if (w) {
    pool.splice(pool.indexOf(w), 1)
    idcBarcodes.delete(deviceId)
    ledgerMetas.delete(deviceId)
    logStock({ kind: 'idc', title: w.name, barcode: '', sn: w.sn, op: '报废', operator: '当前用户', siteId, reason: '台账删除（在库）', remark: '' })
    return { ok: true }
  }
  const loc = locateDevice(deviceId)
  if (!loc) return { ok: false, error: '设备不存在' }
  const roomId = rackRoomId(loc.rackId)!
  const devSiteId = roomSiteId(roomId) ?? 1
  if (devSiteId !== siteId) return { ok: false, error: '设备不属于当前站点' }
  const slots = rackSlots.get(loc.rackId)!
  for (let u = loc.uStart; u <= loc.uEnd; u++) slots[u - 1] = { u_no: u, status: 0, device: null }
  loc.rack.used_u = Math.max(0, loc.rack.used_u - (loc.uEnd - loc.uStart + 1))
  loc.rack.usage_pct = Math.round((loc.rack.used_u / loc.rack.u_total) * 1000) / 10
  idcBarcodes.delete(deviceId)
  ledgerMetas.delete(deviceId)
  logStock({
    kind: 'idc', title: loc.brief.name, barcode: '', sn: loc.brief.sn, op: '报废',
    operator: '当前用户', siteId, roomId,
    reason: '台账删除（含下架）', remark: `${loc.rack.code} U${loc.uStart}-U${loc.uEnd}`
  })
  return { ok: true }
}

// 编辑在库设备（未上架）：名称/SN/类型/品牌/型号/U高度
export function editWarehouseDevice(siteId: number, deviceId: number, patch: {
  name?: string; sn?: string; category?: number; vendor?: string; model?: string; uHeight?: number
}): { ok: boolean; error?: string } {
  const d = (warehouses.get(siteId) ?? []).find(x => x.id === deviceId)
  if (!d) return { ok: false, error: '仅「在库」设备可在此编辑，已上架设备请在3D视图编辑' }
  const newSn = patch.sn?.trim() ?? d.sn
  if (newSn !== d.sn) {
    if (snExists(newSn) || (warehouses.get(siteId) ?? []).some(x => x.id !== deviceId && x.sn === newSn) || mountedOfSite(siteId).some(m => m.sn === newSn)) {
      return { ok: false, error: `SN ${newSn} 已存在（全库唯一）` }
    }
  }
  const newH = patch.uHeight ?? d.u_height
  if (!(newH >= 1 && newH <= 20)) return { ok: false, error: 'U高度须在 1~20 之间' }
  if (patch.category !== undefined && ![1, 2, 3, 4, 5, 6, 7].includes(patch.category)) return { ok: false, error: '设备类型无效' }
  d.name = patch.name?.trim() || d.name
  d.sn = newSn
  d.category = patch.category ?? d.category
  d.vendor = patch.vendor !== undefined ? (patch.vendor.trim() || '通用') : d.vendor
  d.model = patch.model !== undefined ? (patch.model.trim() || d.model) : d.model
  d.u_height = newH
  return { ok: true }
}

// =====================================================================
// 阶段2：资产出入库（机房资产 / IT仓库资产）+ 设备台账 + 硬件状态 + 环控
// 机房资产（idc）：入库进站点设备库 → 3D拖拽上架；IT仓库资产（it）：键鼠等外设领用流转，不进3D
// =====================================================================
const nowStr = () => new Date().toLocaleString('zh-CN', { hour12: false })

let stockSeq = 1
const stockLogs: StockLog[] = []
function logStock(l: Omit<StockLog, 'id' | 'time'>) {
  stockLogs.unshift({ id: stockSeq++, time: nowStr(), ...l })
}

// 机房设备条码登记（WarehouseDevice 无条码字段，映射表关联）
const idcBarcodes = new Map<number, string>()

const itAssets = new Map<number, ITAsset[]>([
  [1, [
    { id: 501, barcode: 'IT-2026-0001', name: '无线鼠标', type: '键鼠', spec: '罗技 M330', status: '领用中', holder: '张三', remark: '' },
    { id: 502, barcode: 'IT-2026-0002', name: '机械键盘', type: '键鼠', spec: 'Cherry 红轴87键', status: '在库', holder: '', remark: '' },
    { id: 503, barcode: 'IT-2026-0003', name: 'USB-C扩展坞', type: '外设', spec: '绿联 9合1', status: '在库', holder: '', remark: '新采购' }
  ]],
  [2, [
    { id: 601, barcode: 'IT-2026-0101', name: 'KVM切换器', type: '外设', spec: 'ATEN CS1794', status: '在库', holder: '', remark: '' }
  ]]
])
let itSeq = 601

// 遍历站点内全部已上架设备（含懒生成通用占位）
interface MountedEntry {
  deviceId: number; sn: string; name: string; category: number
  vendor: string; model: string; uHeight: number; manageIp?: string; bizIp?: string
  roomId: number; rackId: number; rackCode: string; uStart: number; uEnd: number
}
function mountedOfSite(siteId: number): MountedEntry[] {
  const out: MountedEntry[] = []
  const seen = new Set<number>()
  for (const room of getRooms(siteId)) {
    for (const rack of roomRacks.get(room.id) ?? []) {
      getRackScene(rack.id) // 确保 slots 已生成
      const slots = rackSlots.get(rack.id)!
      let u = 1
      while (u <= rack.u_total) {
        const d = slots[u - 1].device
        if (!d || seen.has(d.id)) { u++; continue }
        seen.add(d.id)
        let uEnd = u
        while (uEnd < rack.u_total && slots[uEnd].device?.id === d.id) uEnd++
        out.push({
          deviceId: d.id, sn: d.sn, name: d.name, category: d.category,
          vendor: d.model.vendor, model: d.model.model, uHeight: d.model.u_height,
          manageIp: d.manage_ip, bizIp: d.biz_ip, roomId: room.id, rackId: rack.id, rackCode: rack.code, uStart: u, uEnd
        })
        u = uEnd + 1
      }
    }
  }
  return out
}

function snExists(sn: string): boolean {
  for (const pool of warehouses.values()) if (pool.some(d => d.sn === sn)) return true
  return false
}

// ---------- 机房资产 ----------
export function addIDCStock(input: {
  siteId: number; roomId?: number; barcode: string; name: string; sn: string
  category: number; vendor: string; model: string; uHeight: number; remark: string
}): { ok: boolean; error?: string } {
  const sn = input.sn.trim()
  const name = input.name.trim()
  if (!name) return { ok: false, error: '设备名称不能为空' }
  if (!sn) return { ok: false, error: 'SN 不能为空' }
  if (snExists(sn) || mountedOfSite(input.siteId).some(m => m.sn === sn)) {
    return { ok: false, error: `SN ${sn} 已存在（全库唯一）` }
  }
  if (![1, 2, 3, 4, 5, 6, 7].includes(input.category)) return { ok: false, error: '设备类型无效' }
  if (input.uHeight < 1 || input.uHeight > 20) return { ok: false, error: 'U高度须在 1~20 之间' }
  const dev: WarehouseDevice = {
    id: ++deviceSeq, sn, name, category: input.category,
    vendor: input.vendor.trim() || '通用', model: input.model.trim() || input.name.trim(), u_height: input.uHeight
  }
  if (!warehouses.has(input.siteId)) warehouses.set(input.siteId, [])
  warehouses.get(input.siteId)!.push(dev)
  idcBarcodes.set(dev.id, input.barcode.trim())
  logStock({
    kind: 'idc', title: name, barcode: input.barcode.trim(), sn, op: '入库',
    operator: '当前用户', siteId: input.siteId, roomId: input.roomId,
    reason: '资产入库', remark: input.remark.trim()
  })
  return { ok: true }
}

export function getIDCAssets(siteId: number): IDCAssetRow[] {
  const rows: IDCAssetRow[] = []
  for (const d of warehouses.get(siteId) ?? []) {
    rows.push({
      deviceId: d.id, barcode: idcBarcodes.get(d.id) ?? '', name: d.name, category: d.category,
      sn: d.sn, vendor: d.vendor, model: d.model, uHeight: d.u_height, status: '在库'
    })
  }
  const roomNameOf = (roomId: number) => getRoomMeta(roomId)?.name
  for (const m of mountedOfSite(siteId)) {
    rows.push({
      deviceId: m.deviceId, barcode: idcBarcodes.get(m.deviceId) ?? '', name: m.name, category: m.category,
      sn: m.sn, vendor: m.vendor, model: m.model, uHeight: m.uHeight, status: '已上架',
      roomId: m.roomId, roomName: roomNameOf(m.roomId), rackId: m.rackId, rackCode: m.rackCode, uStart: m.uStart, uEnd: m.uEnd
    })
  }
  return rows
}

export function outIDCStock(siteId: number, deviceId: number, reason: string): { ok: boolean; error?: string } {
  const pool = warehouses.get(siteId) ?? []
  const d = pool.find(x => x.id === deviceId)
  if (!d) return { ok: false, error: '仅「在库」设备可出库' }
  pool.splice(pool.indexOf(d), 1)
  idcBarcodes.delete(deviceId)
  logStock({ kind: 'idc', title: d.name, barcode: '', sn: d.sn, op: '出库', operator: '当前用户', siteId, reason: reason || '出库', remark: '' })
  return { ok: true }
}

export function scrapIDCStock(siteId: number, deviceId: number, reason: string): { ok: boolean; error?: string } {
  const pool = warehouses.get(siteId) ?? []
  const d = pool.find(x => x.id === deviceId)
  if (!d) return { ok: false, error: '仅「在库」设备可报废' }
  pool.splice(pool.indexOf(d), 1)
  idcBarcodes.delete(deviceId)
  logStock({ kind: 'idc', title: d.name, barcode: '', sn: d.sn, op: '报废', operator: '当前用户', siteId, reason: reason || '报废', remark: '' })
  return { ok: true }
}

// ---------- IT仓库资产（键鼠等，领用流转，不进3D） ----------
export function getITAssets(siteId: number): ITAsset[] {
  return (itAssets.get(siteId) ?? []).slice()
}
export function saveITAsset(siteId: number, input: { id?: number; barcode: string; name: string; type: string; spec: string; remark: string }): { ok: boolean; error?: string } {
  const list = itAssets.get(siteId) ?? []
  const barcode = input.barcode.trim(), name = input.name.trim()
  if (!name) return { ok: false, error: '品名不能为空' }
  if (!barcode) return { ok: false, error: '资产条码不能为空' }
  if (list.some(x => x.barcode === barcode && x.id !== input.id)) return { ok: false, error: '条码已存在' }
  if (input.id) {
    const a = list.find(x => x.id === input.id)
    if (!a) return { ok: false, error: '资产不存在' }
    Object.assign(a, { barcode, name, type: input.type.trim() || '其他', spec: input.spec.trim(), remark: input.remark.trim() })
    return { ok: true }
  }
  if (!itAssets.has(siteId)) itAssets.set(siteId, [])
  itAssets.get(siteId)!.push({ id: ++itSeq, barcode, name, type: input.type.trim() || '其他', spec: input.spec.trim(), status: '在库', holder: '', remark: input.remark.trim() })
  logStock({ kind: 'it', title: name, barcode, sn: '', op: '入库', operator: '当前用户', siteId, reason: 'IT仓库入库', remark: input.remark.trim() })
  return { ok: true }
}
export function deleteITAsset(siteId: number, id: number): { ok: boolean; error?: string } {
  const list = itAssets.get(siteId) ?? []
  const a = list.find(x => x.id === id)
  if (!a) return { ok: false, error: '资产不存在' }
  if (a.status === '领用中') return { ok: false, error: '领用中资产需先归还' }
  list.splice(list.indexOf(a), 1)
  return { ok: true }
}
export function lendIT(siteId: number, id: number, holder: string): { ok: boolean; error?: string } {
  const a = (itAssets.get(siteId) ?? []).find(x => x.id === id)
  if (!a) return { ok: false, error: '资产不存在' }
  if (a.status !== '在库') return { ok: false, error: '仅「在库」资产可领用' }
  const h = holder.trim()
  if (!h) return { ok: false, error: '请填写领用人' }
  a.status = '领用中'
  a.holder = h
  logStock({ kind: 'it', title: a.name, barcode: a.barcode, sn: '', op: '领用', operator: h, siteId, reason: '日常领用', remark: '' })
  return { ok: true }
}
export function returnIT(siteId: number, id: number): { ok: boolean; error?: string } {
  const a = (itAssets.get(siteId) ?? []).find(x => x.id === id)
  if (!a) return { ok: false, error: '资产不存在' }
  if (a.status !== '领用中') return { ok: false, error: '仅「领用中」资产可归还' }
  logStock({ kind: 'it', title: a.name, barcode: a.barcode, sn: '', op: '归还', operator: a.holder, siteId, reason: '归还入库', remark: '' })
  a.status = '在库'
  a.holder = ''
  return { ok: true }
}
export function disposeIT(siteId: number, id: number, op: '出库' | '报废', reason: string): { ok: boolean; error?: string } {
  const a = (itAssets.get(siteId) ?? []).find(x => x.id === id)
  if (!a) return { ok: false, error: '资产不存在' }
  if (a.status === '领用中') return { ok: false, error: '领用中资产需先归还' }
  logStock({ kind: 'it', title: a.name, barcode: a.barcode, sn: '', op, operator: '当前用户', siteId, reason: reason || op, remark: '' })
  a.status = op === '出库' ? '已出库' : '报废'
  return { ok: true }
}

// ---------- 出入库流水 ----------
export function getStockLogs(filter?: { kind?: AssetKind; op?: StockOp; keyword?: string; from?: string; to?: string; siteId?: number }): StockLog[] {
  let list = stockLogs.slice()
  const f = filter ?? {}
  if (f.siteId) list = list.filter(l => l.siteId === f.siteId)
  if (f.kind) list = list.filter(l => l.kind === f.kind)
  if (f.op) list = list.filter(l => l.op === f.op)
  if (f.keyword) {
    const k = f.keyword.trim().toLowerCase()
    list = list.filter(l => `${l.title}${l.barcode}${l.sn}${l.operator}${l.remark}`.toLowerCase().includes(k))
  }
  if (f.from) list = list.filter(l => l.time >= f.from!)
  if (f.to) list = list.filter(l => l.time <= f.to! + ' 23:59:59')
  return list
}

// ---------- 设备台账（机房已上架 + 在库，双向关联3D） ----------
const ledgerMetas = new Map<number, LedgerMeta>()
export function getDeviceLedger(siteId: number): LedgerRow[] {
  const siteName = getSiteById(siteId)?.name ?? '-'
  const rows: LedgerRow[] = []
  for (const d of warehouses.get(siteId) ?? []) {
    rows.push({
      id: d.id, sn: d.sn, name: d.name, vendor: d.vendor, model: d.model, category: d.category,
      status: '在库', mounted: false, siteId, siteName, uHeight: d.u_height,
      meta: ledgerMetas.get(d.id) ?? {}
    })
  }
  for (const m of mountedOfSite(siteId)) {
    rows.push({
      id: m.deviceId, sn: m.sn, name: m.name, vendor: m.vendor, model: m.model, category: m.category,
      status: '在用', mounted: true, siteId, siteName,
      roomId: m.roomId, roomName: getRoomMeta(m.roomId)?.name, rackId: m.rackId, rackCode: m.rackCode,
      uHeight: m.uHeight, uStart: m.uStart, uEnd: m.uEnd, manageIp: m.manageIp, bizIp: m.bizIp,
      meta: ledgerMetas.get(m.deviceId) ?? {}
    })
  }
  return rows
}
export function saveLedgerMeta(deviceId: number, meta: { mac?: string; warrantyEnd?: string; owner?: string; remark?: string }) {
  ledgerMetas.set(deviceId, { deviceId, ...meta })
}

// ---------- 硬件状态（演示数据；正式由后端经管理地址 SNMP/Redfish/IPMI 采集） ----------
export function hwStatus(deviceId: number): HWStatus {
  const r = deviceId % 5
  const caps = getHwCaps(deviceId)
  const psuCount = caps?.psuCount ?? 0
  return {
    inlet: 22 + r,
    cpu: 46 + r * 4,
    psu: psuCount === 0 ? '未采集' : r === 2 ? '告警' : '正常',
    psuDetail: psuCount === 0
      ? '尚未通过 SNMP 采集电源信息（设备详情 → SNMP 设置 → 测试并采集）'
      : psuCount === 1
        ? (r === 2 ? 'PSU1 无输出（单电源设备）' : '单电源（PSU1 在线）')
        : (r === 2 ? 'PSU2 无输出（PSU1 在线 550W）' : `PSU1/PSU2 在线 ${r === 1 ? '1+1' : '2+2'} 冗余`),
    fan: r === 4 ? '告警' : '正常',
    fanRpm: r === 4 ? 'Fan3 2100rpm（告警）· 其余 5200rpm' : `Fan1-4 均 ${5200 + r * 300}rpm`
  }
}

// ---------- IT信息统计 · 服务器账号表（按站点多表：一个站点多张表，Excel一个Sheet=一张表） ----------
const accountTables = new Map<number, AccountTable[]>([
  [1, [
    {
      id: 1, name: '服务器账号',
      rows: [
        { id: 901, group: 'OA服务器', server: 'HFOA01', ip: '192.168.8.10', username: 'administrator', password: 'Demo@123', remoteType: '远程桌面', url: '', sn: '', remark: '示例数据，请导入您的Excel' },
        { id: 902, group: 'OA服务器', server: 'HFFTP', ip: '192.168.8.16', username: 'admin', password: 'Demo@456', remoteType: '远程桌面', url: '', sn: '', remark: '' },
        { id: 903, group: '带外管理', server: 'ESXI-01', ip: '172.18.9.101', username: 'root', password: 'Demo@789', remoteType: 'web', url: 'https://172.18.9.101/ui/', sn: 'CN12345678', remark: '' }
      ]
    }
  ]],
  [2, []]
])
let tableSeq = 1
let acctSeq = 903

export function getAccountTables(siteId: number): AccountTable[] {
  if (!accountTables.has(siteId)) accountTables.set(siteId, [])
  return accountTables.get(siteId)!
}
export function createAccountTable(siteId: number, name: string): { ok: boolean; table?: AccountTable; error?: string } {
  const list = getAccountTables(siteId)
  const n = name.trim()
  if (!n) return { ok: false, error: '表名不能为空' }
  if (list.some(t => t.name === n)) return { ok: false, error: '同名表已存在' }
  const t: AccountTable = { id: ++tableSeq, name: n.slice(0, 32), rows: [] }
  list.push(t)
  return { ok: true, table: t }
}
export function renameAccountTable(siteId: number, tableId: number, name: string): { ok: boolean; error?: string } {
  const list = getAccountTables(siteId)
  const t = list.find(x => x.id === tableId)
  const n = name.trim()
  if (!t) return { ok: false, error: '表不存在' }
  if (!n) return { ok: false, error: '表名不能为空' }
  if (list.some(x => x.id !== tableId && x.name === n)) return { ok: false, error: '同名表已存在' }
  t.name = n.slice(0, 32)
  return { ok: true }
}
export function deleteAccountTable(siteId: number, tableId: number): { ok: boolean; error?: string } {
  const list = getAccountTables(siteId)
  const idx = list.findIndex(t => t.id === tableId)
  if (idx < 0) return { ok: false, error: '表不存在' }
  list.splice(idx, 1)
  return { ok: true }
}
// 多Sheet导入：Sheet名=表名；同名表追加行，否则新建表
export function importAccountTables(siteId: number, tables: Array<{ name: string; rows: Array<Omit<ServerAccount, 'id'>> }>): number {
  const list = getAccountTables(siteId)
  let n = 0
  for (const t of tables) {
    let target = list.find(x => x.name === t.name)
    if (!target) {
      target = { id: ++tableSeq, name: t.name.slice(0, 32), rows: [] }
      list.push(target)
    }
    for (const r of t.rows) target.rows.push({ id: ++acctSeq, ...r })
    n += t.rows.length
  }
  return n
}

export function getServerAccounts(siteId: number, tableId: number, filter?: { keyword?: string; group?: string }): ServerAccount[] {
  let list = (getAccountTables(siteId).find(t => t.id === tableId)?.rows ?? []).slice()
  const f = filter ?? {}
  if (f.group) list = list.filter(a => a.group === f.group)
  if (f.keyword) {
    const k = f.keyword.trim().toLowerCase()
    list = list.filter(a => `${a.group}${a.server}${a.ip}${a.username}${a.sn}${a.remark}${a.url}`.toLowerCase().includes(k))
  }
  return list
}
export function accountGroups(siteId: number, tableId: number): string[] {
  return [...new Set((getAccountTables(siteId).find(t => t.id === tableId)?.rows ?? []).map(a => a.group))].filter(Boolean)
}
// 预设分组 + 行内实际分组合并（编辑弹窗 datalist 用）
export function accountGroupOptions(siteId: number, tableId: number): string[] {
  const t = getAccountTables(siteId).find(x => x.id === tableId)
  if (!t) return []
  return [...new Set([...(t.groupPresets ?? []), ...t.rows.map(a => a.group)])].filter(Boolean)
}
// 自定义列抬头（9列）
export function saveTableColumns(siteId: number, tableId: number, columns: string[]): { ok: boolean; error?: string } {
  const t = getAccountTables(siteId).find(x => x.id === tableId)
  if (!t) return { ok: false, error: '表不存在' }
  const cols = columns.map(c => c.trim().slice(0, 12))
  if (cols.some(c => !c)) return { ok: false, error: '列名不能为空' }
  t.columns = cols
  return { ok: true }
}
// 预设分组编辑（一行一个，空行忽略；不影响已有行）
export function saveTablePresets(siteId: number, tableId: number, presets: string[]): { ok: boolean; error?: string } {
  const t = getAccountTables(siteId).find(x => x.id === tableId)
  if (!t) return { ok: false, error: '表不存在' }
  t.groupPresets = [...new Set(presets.map(p => p.trim().slice(0, 24)).filter(Boolean))]
  return { ok: true }
}
// 分组重命名：该表所有行的旧分组名批量替换
export function renameAccountGroup(siteId: number, tableId: number, oldName: string, newName: string): { ok: boolean; error?: string; renamed?: number } {
  const t = getAccountTables(siteId).find(x => x.id === tableId)
  if (!t) return { ok: false, error: '表不存在' }
  const n = newName.trim().slice(0, 24)
  if (!n) return { ok: false, error: '分组名不能为空' }
  if (n !== oldName && t.rows.some(a => a.group === n)) return { ok: false, error: `分组「${n}」已存在` }
  let renamed = 0
  for (const a of t.rows) if (a.group === oldName) { a.group = n; renamed++ }
  if (t.groupPresets) t.groupPresets = t.groupPresets.map(p => (p === oldName ? n : p))
  return { ok: true, renamed }
}
export function saveServerAccount(siteId: number, tableId: number, input: Omit<ServerAccount, 'id'> & { id?: number }): { ok: boolean; error?: string } {
  const table = getAccountTables(siteId).find(t => t.id === tableId)
  if (!table) return { ok: false, error: '表不存在' }
  const list = table.rows
  const server = input.server.trim()
  const ip = input.ip.trim()
  if (!server) return { ok: false, error: '服务器名不能为空' }
  if (!ip) return { ok: false, error: 'IP 不能为空' }
  const row = {
    group: input.group.trim() || '未分组', server, ip,
    username: input.username.trim(), password: input.password,
    remoteType: input.remoteType || '其他', url: input.url.trim(),
    sn: input.sn.trim(), remark: input.remark.trim()
  }
  if (input.id) {
    const a = list.find(x => x.id === input.id)
    if (!a) return { ok: false, error: '记录不存在' }
    Object.assign(a, row)
    return { ok: true }
  }
  list.push({ id: ++acctSeq, ...row })
  return { ok: true }
}
export function deleteServerAccount(siteId: number, tableId: number, id: number): { ok: boolean; error?: string } {
  const table = getAccountTables(siteId).find(t => t.id === tableId)
  if (!table) return { ok: false, error: '表不存在' }
  const idx = table.rows.findIndex(x => x.id === id)
  if (idx < 0) return { ok: false, error: '记录不存在' }
  table.rows.splice(idx, 1)
  return { ok: true }
}

// ---------- 楼层图纸点位（阶段4） ----------
const floorPlans: FloorPlan[] = [
  {
    id: 1, siteId: 1, building: '一号楼', floor: '3F',
    name: '3F视频监控点位图（未上传PDF·空白画布）', pdfName: '', pageCount: 1,
    points: [
      { id: 1, type: 'net', code: 'NK-3F-001', location: '301室东墙', ip: '', vlan: '30', phone: '', switchName: '接入交换-01', switchPort: 'Gi1/0/12', sn: 'NK301-000012', owner: '张三', dept: '信息部', status: '在用', remark: '', x: 0.3, y: 0.4, page: 1 },
      { id: 2, type: 'cam', code: 'Cam-3F-001', location: '走廊西端', ip: '192.168.31.5', vlan: '31', phone: '', sn: 'HK-DS2CD2145G0', owner: '', dept: '保卫部', status: '在用', remark: '半球', x: 0.6, y: 0.25, page: 1 },
      { id: 3, type: 'phone', code: 'Tel-3F-001', location: '302办公区', ip: '192.168.100.21', vlan: '100', phone: '65881001', sn: 'VOIP-2023-0031', owner: '李四', dept: '综合部', status: '空闲', remark: '', x: 0.5, y: 0.6, page: 1 },
      { id: 4, type: 'monitor', code: 'Mon-3F-001', location: '301工位A', ip: '', vlan: '', phone: '', sn: 'CN-0X1Y2Z-74445', owner: '张三', dept: '信息部', status: '在用', remark: '27寸', x: 0.36, y: 0.47, page: 1 },
      { id: 5, type: 'pc', code: 'PC-3F-001', location: '301工位A', ip: '192.168.100.51', vlan: '100', phone: '', sn: 'PF2ABCDE', mac: '3C:7C:3F:1A:2B:3C', dockMac: '00:1E:C9:44:55:66', owner: '张三', dept: '信息部', status: '在用', remark: '', x: 0.33, y: 0.44, page: 1 },
      { id: 6, type: 'laptop', code: 'NB-3F-001', location: '303会议室', ip: '192.168.100.77', vlan: '100', phone: '', sn: '5CD3124ABC', mac: 'A4:BB:6D:0F:11:22', dockMac: '', owner: '王五', dept: '市场部', status: '损坏报废', remark: '屏轴断裂', x: 0.68, y: 0.55, page: 1 },
      { id: 7, type: 'printer', code: 'PR-3F-001', location: '302办公区', ip: '192.168.100.66', vlan: '100', phone: '', sn: 'CNB8J2K3LM', owner: '赵六', dept: '综合部', status: '在用', remark: '', model: 'HP LaserJet M405dn', x: 0.56, y: 0.68, page: 1 },
      { id: 8, type: 'ap', code: 'AP-3F-001', location: '301室天花板', ip: '192.168.30.88', vlan: '30', phone: '', sn: '219801A2MMJ23B000123', owner: '', dept: '', status: '在用', remark: '吸顶', model: 'H3C WA6320', x: 0.42, y: 0.3, page: 1 }
    ]
  }
]
let planSeq = 1
let pointSeq = 8

export function getFloorPlans(siteId: number): FloorPlan[] {
  return floorPlans.filter(p => p.siteId === siteId)
}
export function createFloorPlan(siteId: number, input: { name: string; building: string; floor: string; pdfName: string; pageCount: number }): { ok: boolean; plan?: FloorPlan; error?: string } {
  const name = input.name.trim()
  if (!name) return { ok: false, error: '图纸名称不能为空' }
  if (!input.building.trim()) return { ok: false, error: '楼宇不能为空' }
  if (!input.floor.trim()) return { ok: false, error: '楼层不能为空' }
  let maxPlanId = planSeq
  for (const fp of floorPlans) if (fp.id > maxPlanId) maxPlanId = fp.id
  planSeq = maxPlanId + 1
  const p: FloorPlan = {
    id: planSeq, siteId, name,
    building: input.building.trim(), floor: input.floor.trim(),
    pdfName: input.pdfName, pageCount: Math.max(1, input.pageCount), points: []
  }
  floorPlans.push(p)
  return { ok: true, plan: p }
}
export function saveFloorPlan(p: FloorPlan): { ok: boolean; error?: string } {
  const t = floorPlans.find(x => x.id === p.id)
  if (!t) return { ok: false, error: '图纸不存在' }
  t.name = p.name.trim() || t.name
  t.building = p.building
  t.floor = p.floor
  t.pdfName = p.pdfName
  t.pageCount = p.pageCount
  t.points = p.points
  return { ok: true }
}
export function deleteFloorPlan(id: number): { ok: boolean; error?: string } {
  const idx = floorPlans.findIndex(p => p.id === id)
  if (idx < 0) return { ok: false, error: '图纸不存在' }
  floorPlans.splice(idx, 1)
  return { ok: true }
}
export function nextPointCode(type: PointType, floor: string, existing: FloorPoint[]): string {
  const prefix = { net: 'NK', phone: 'Tel', cam: 'Cam', monitor: 'Mon', pc: 'PC', laptop: 'NB', printer: 'PR', ap: 'AP' }[type]
  const n = existing.filter(p => p.type === type).length + 1
  return `${prefix}-${floor}-${String(n).padStart(3, '0')}`
}
// 兼容旧快照：pointSeq 可能小于已有点位 id（早期种子只记到 3），必须以全局最大 id 兜底，
// 否则新点位会与已有点位 id 重复，列表按 key 复用时会把图标/编号渲染成别的设备
export function newPointId(): number {
  let max = pointSeq
  for (const plan of floorPlans) for (const pt of plan.points) if (pt.id > max) max = pt.id
  pointSeq = max + 1
  return pointSeq
}

// ---------- 硬件维修记录（按站点隔离；设备编号/SN 可从台账带入，也可手录） ----------
const repairRecords: RepairRecord[] = [
  { id: 1, siteId: 1, deviceCode: '核心交换-02', sn: 'SN20260101040', reason: '业务口批量丢包', symptom: 'Gi1/0/24 端口频繁 up/down，下联终端间歇断网', reportedAt: '2026-09-18T09:20', needOutsource: false, finishedAt: '2026-09-18T15:40', result: '更换光模块后恢复', scrapped: false },
  { id: 2, siteId: 1, deviceCode: '分布式存储-01', sn: 'SN20260101034', reason: '硬盘告警', symptom: '第 6 槽位硬盘亮红灯，RAID 降级', reportedAt: '2026-10-08T14:05', needOutsource: false, finishedAt: '', result: '待厂家寄送备件', scrapped: false },
  { id: 3, siteId: 1, deviceCode: '虚拟化节点-02', sn: 'SN20260101020', reason: '电源模块故障', symptom: 'PSU2 无输出，冗余丢失', reportedAt: '2026-10-15T10:30', needOutsource: true, finishedAt: '2026-10-20T16:10', result: '返厂更换电源模块', scrapped: false },
  { id: 4, siteId: 1, deviceCode: '列头PDU-A', sn: 'SN20260101001', reason: '插座烧蚀', symptom: 'C13 插孔打火、外壳发黄', reportedAt: '2026-10-22T08:50', needOutsource: true, finishedAt: '2026-10-23T11:00', result: '老化严重，评估后报废', scrapped: true },
  { id: 5, siteId: 2, deviceCode: '办公核心交换-01', sn: 'SN20260301005', reason: '风扇异响', symptom: '风扇转速异常、噪音明显变大', reportedAt: '2026-10-12T13:10', needOutsource: false, finishedAt: '', result: '', scrapped: false }
]
let repairSeq = 5

export function getRepairRecords(
  siteId: number,
  filter?: { keyword?: string; scrapped?: 'yes' | 'no' | ''; outsource?: 'yes' | 'no' | '' }
): RepairRecord[] {
  let list = repairRecords.filter(r => r.siteId === siteId)
  if (filter?.scrapped === 'yes') list = list.filter(r => r.scrapped)
  if (filter?.scrapped === 'no') list = list.filter(r => !r.scrapped)
  if (filter?.outsource === 'yes') list = list.filter(r => r.needOutsource)
  if (filter?.outsource === 'no') list = list.filter(r => !r.needOutsource)
  const k = filter?.keyword?.trim().toLowerCase()
  if (k) list = list.filter(r => `${r.deviceCode}${r.sn}${r.reason}${r.symptom}${r.result}`.toLowerCase().includes(k))
  return list.slice().sort((a, b) => (b.reportedAt || '').localeCompare(a.reportedAt || ''))
}
export function saveRepairRecord(
  siteId: number,
  input: Omit<RepairRecord, 'id' | 'siteId'> & { id?: number }
): { ok: boolean; error?: string } {
  const deviceCode = input.deviceCode.trim()
  const sn = input.sn.trim()
  if (!deviceCode && !sn) return { ok: false, error: '设备编号与 SN 号至少填写一项' }
  if (!input.reason.trim()) return { ok: false, error: '请填写维修原因' }
  if (!input.reportedAt) return { ok: false, error: '请选择报修时间' }
  if (input.finishedAt && input.finishedAt < input.reportedAt) return { ok: false, error: '维修完成时间不能早于报修时间' }
  const payload = {
    deviceCode, sn,
    reason: input.reason.trim(), symptom: input.symptom.trim(),
    reportedAt: input.reportedAt, needOutsource: input.needOutsource,
    finishedAt: input.finishedAt, result: input.result.trim(),
    scrapped: input.scrapped
  }
  if (input.id) {
    const t = repairRecords.find(r => r.id === input.id && r.siteId === siteId)
    if (!t) return { ok: false, error: '维修记录不存在' }
    Object.assign(t, payload)
    return { ok: true }
  }
  repairRecords.push({ id: ++repairSeq, siteId, ...payload })
  return { ok: true }
}
export function deleteRepairRecord(siteId: number, id: number) {
  const i = repairRecords.findIndex(r => r.id === id && r.siteId === siteId)
  if (i >= 0) repairRecords.splice(i, 1)
}
export function repairStats(siteId: number) {
  const list = repairRecords.filter(r => r.siteId === siteId)
  return {
    total: list.length,
    outsourced: list.filter(r => r.needOutsource).length,
    pending: list.filter(r => !r.finishedAt).length,
    scrapped: list.filter(r => r.scrapped).length
  }
}

// ---------- VLAN规划 / IP台账（阶段5，按站点隔离） ----------
const vlanPlans = new Map<number, VlanPlan[]>([
  [1, [
    { id: 1, vlanId: 30, name: '管理网', cidr: '192.168.30.0/24', gateway: '192.168.30.1', ipRange: '192.168.30.11-250', purpose: '设备管理IP', owner: '王运维', remark: '' },
    { id: 2, vlanId: 31, name: '视频监控', cidr: '192.168.31.0/24', gateway: '192.168.31.1', ipRange: '192.168.31.11-250', purpose: '监控摄像头', owner: '李网管', remark: '' },
    { id: 3, vlanId: 100, name: '办公网', cidr: '192.168.100.0/23', gateway: '192.168.100.1', ipRange: '', purpose: '办公终端', owner: '行政部', remark: '' },
    { id: 4, vlanId: 200, name: '带外管理', cidr: '172.18.9.0/24', gateway: '172.18.9.1', ipRange: '172.18.9.100-250', purpose: '服务器BMC', owner: '王运维', remark: '对应服务器账号表带外分组' }
  ]],
  [2, []]
])
const ipEntries = new Map<number, IpEntry[]>([
  [1, [
    { id: 1, planId: 1, ip: '192.168.30.11', status: '已分配', ref: '虚拟化节点-01', remark: '' },
    { id: 2, planId: 1, ip: '192.168.30.12', status: '已分配', ref: '虚拟化节点-02', remark: '' },
    { id: 3, planId: 1, ip: '192.168.30.21', status: '已分配', ref: '分布式存储-01', remark: '' },
    { id: 4, planId: 4, ip: '172.18.9.101', status: '已分配', ref: 'ESXI-01（账号表）', remark: '' },
    { id: 5, planId: 4, ip: '172.18.9.111', status: '已分配', ref: 'COHF111（账号表）', remark: '' }
  ]],
  [2, []]
])
let vlanSeq = 4
let ipSeq = 5

export function getVlanPlans(siteId: number): VlanPlan[] {
  return (vlanPlans.get(siteId) ?? []).slice().sort((a, b) => a.vlanId - b.vlanId)
}
export function saveVlanPlan(siteId: number, input: Omit<VlanPlan, 'id'> & { id?: number }): { ok: boolean; error?: string } {
  const list = vlanPlans.get(siteId) ?? []
  if (!(input.vlanId >= 1 && input.vlanId <= 4094)) return { ok: false, error: 'VLAN ID 须为 1~4094' }
  if (!input.name.trim()) return { ok: false, error: 'VLAN名称不能为空' }
  if (!/^\d{1,3}(\.\d{1,3}){3}\/\d{1,2}$/.test(input.cidr.trim())) return { ok: false, error: '网段格式须为 x.x.x.x/nn' }
  if (list.some(v => v.id !== input.id && v.vlanId === input.vlanId)) return { ok: false, error: `VLAN ID ${input.vlanId} 已存在` }
  const row = {
    vlanId: input.vlanId, name: input.name.trim(), cidr: input.cidr.trim(),
    gateway: input.gateway.trim(), ipRange: input.ipRange.trim(),
    purpose: input.purpose.trim(), owner: input.owner.trim(), remark: input.remark.trim()
  }
  if (input.id) {
    const v = list.find(x => x.id === input.id)
    if (!v) return { ok: false, error: 'VLAN不存在' }
    Object.assign(v, row)
    return { ok: true }
  }
  if (!vlanPlans.has(siteId)) vlanPlans.set(siteId, [])
  vlanPlans.get(siteId)!.push({ id: ++vlanSeq, ...row })
  return { ok: true }
}
export function deleteVlanPlan(siteId: number, id: number): { ok: boolean; error?: string } {
  const list = vlanPlans.get(siteId) ?? []
  const idx = list.findIndex(v => v.id === id)
  if (idx < 0) return { ok: false, error: 'VLAN不存在' }
  const v = list[idx]
  const ips = ipEntries.get(siteId) ?? []
  const used = ips.filter(e => e.planId === id && e.status === '已分配').length
  if (used && !window.confirm(`VLAN ${v.vlanId} 有 ${used} 个已分配IP，确认连同删除？`)) return { ok: false, error: '已取消' }
  list.splice(idx, 1)
  ipEntries.set(siteId, ips.filter(e => e.planId !== id))
  return { ok: true }
}
export function importVlans(siteId: number, rows: Array<Omit<VlanPlan, 'id'>>): { ok: number; skip: number } {
  if (!vlanPlans.has(siteId)) vlanPlans.set(siteId, [])
  const list = vlanPlans.get(siteId)!
  let ok = 0, skip = 0
  for (const r of rows) {
    if (list.some(v => v.vlanId === r.vlanId)) { skip++; continue }
    list.push({ id: ++vlanSeq, ...r })
    ok++
  }
  return { ok, skip }
}

// 由网段+可用范围生成IP池（跳过网关；单VLAN上限512）
export function generateIpPool(siteId: number, planId: number): { ok: boolean; count?: number; error?: string } {
  const plan = (vlanPlans.get(siteId) ?? []).find(v => v.id === planId)
  if (!plan) return { ok: false, error: 'VLAN不存在' }
  const m = plan.cidr.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)\/(\d+)$/)
  if (!m) return { ok: false, error: '网段格式错误' }
  const pfx = Number(m[5])
  if (pfx < 24 || pfx > 29) return { ok: false, error: '仅支持 /24~/29 网段' }
  const total = 2 ** (32 - pfx) - 2
  const base = `${m[1]}.${m[2]}.${m[3]}.`
  // 解析可用范围：如 192.168.30.11-250 或 .11-.250 或空=整段
  let lo = 2, hi = total + 1 // 默认 .2 ~ 最大主机
  const rm = plan.ipRange.match(/(\d+)\s*[-~]\s*(\d+)/)
  if (rm) {
    lo = Math.max(2, Number(rm[1]))
    hi = Math.min(total + 1, Number(rm[2]))
  }
  const keep = (ipEntries.get(siteId) ?? []).filter(e => e.planId !== planId)
  const gwLast = Number(plan.gateway.split('.')[3] || 0)
  let count = 0
  for (let i = lo; i <= hi && count < 512; i++) {
    if (i === gwLast) {
      keep.push({ id: ++ipSeq, planId, ip: base + i, status: '保留' as const, ref: '网关', remark: '' })
      continue
    }
    keep.push({ id: ++ipSeq, planId, ip: base + i, status: '空闲' as const, ref: '', remark: '' })
    count++
  }
  ipEntries.set(siteId, keep)
  return { ok: true, count }
}
export function getIpEntries(siteId: number, filter?: { planId?: number; status?: string; keyword?: string }): IpEntry[] {
  let list = (ipEntries.get(siteId) ?? []).slice()
  const f = filter ?? {}
  if (f.planId) list = list.filter(e => e.planId === f.planId)
  if (f.status) list = list.filter(e => e.status === f.status)
  if (f.keyword) {
    const k = f.keyword.trim().toLowerCase()
    list = list.filter(e => `${e.ip}${e.ref}${e.remark}`.toLowerCase().includes(k))
  }
  return list.sort((a, b) => a.ip.localeCompare(b.ip, undefined, { numeric: true }))
}
export function saveIpEntry(siteId: number, e: Omit<IpEntry, 'id'> & { id?: number }): { ok: boolean; error?: string } {
  const list = ipEntries.get(siteId) ?? []
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(e.ip.trim())) return { ok: false, error: 'IP格式错误' }
  if (e.id) {
    const t = list.find(x => x.id === e.id)
    if (!t) return { ok: false, error: '条目不存在' }
    Object.assign(t, { ip: e.ip.trim(), status: e.status, ref: e.ref.trim(), remark: e.remark.trim() })
    return { ok: true }
  }
  if (!ipEntries.has(siteId)) ipEntries.set(siteId, [])
  ipEntries.get(siteId)!.push({ id: ++ipSeq, planId: e.planId, ip: e.ip.trim(), status: e.status, ref: e.ref.trim(), remark: e.remark.trim() })
  return { ok: true }
}
export function deleteIpEntry(siteId: number, id: number): { ok: boolean; error?: string } {
  const list = ipEntries.get(siteId) ?? []
  const idx = list.findIndex(x => x.id === id)
  if (idx < 0) return { ok: false, error: '条目不存在' }
  list.splice(idx, 1)
  return { ok: true }
}
export function ipStats(siteId: number): { total: number; used: number; free: number } {
  const list = ipEntries.get(siteId) ?? []
  return {
    total: list.length,
    used: list.filter(e => e.status === '已分配').length,
    free: list.filter(e => e.status === '空闲').length
  }
}

// ---------- 2D网络拓扑（阶段3，按站点多图） ----------
const topoGraphs: TopoGraph[] = [
  {
    id: 1, siteId: 1, name: '合肥一号机房网络拓扑',
    nodes: [
      { id: 'n1', x: 340, y: 30,  kind: 'fw',   label: '出口防火墙',   ip: '192.168.10.254' },
      { id: 'n2', x: 200, y: 150, kind: 'core', label: '核心交换-01', ip: '192.168.10.1',  sn: 'SN20260101041' },
      { id: 'n3', x: 480, y: 150, kind: 'core', label: '核心交换-02', ip: '192.168.10.2',  sn: 'SN20260101040' },
      { id: 'n4', x: 140, y: 290, kind: 'agg',  label: '汇聚交换-01', ip: '192.168.11.1' },
      { id: 'n5', x: 540, y: 290, kind: 'agg',  label: '汇聚交换-02', ip: '192.168.12.1' },
      { id: 'n6', x: 60,  y: 430, kind: 'acc',  label: '接入-A列',    ip: '192.168.11.11' },
      { id: 'n7', x: 280, y: 430, kind: 'acc',  label: '接入-B列',    ip: '192.168.11.12' },
      { id: 'n8', x: 500, y: 430, kind: 'acc',  label: '接入-办公区', ip: '192.168.12.11' },
      { id: 'n9', x: 140, y: 560, kind: 'srv',  label: '虚拟化集群',   ip: '192.168.10.11', sn: 'SN20260101038', remark: '3节点' },
      { id: 'n10', x: 480, y: 560, kind: 'srv', label: '分布式存储',  ip: '192.168.10.21', sn: 'SN20260101034' }
    ],
    edges: [
      { id: 'e1', source: 'n1', target: 'n2', label: '10G' },
      { id: 'e2', source: 'n1', target: 'n3', label: '10G' },
      { id: 'e3', source: 'n2', target: 'n3', label: '40G堆叠' },
      { id: 'e4', source: 'n2', target: 'n4', label: '10G' },
      { id: 'e5', source: 'n3', target: 'n5', label: '10G' },
      { id: 'e6', source: 'n4', target: 'n6', label: 'GE双上联' },
      { id: 'e7', source: 'n4', target: 'n7', label: 'GE双上联' },
      { id: 'e8', source: 'n5', target: 'n8', label: 'GE' },
      { id: 'e9', source: 'n4', target: 'n9', label: '10G' },
      { id: 'e10', source: 'n5', target: 'n10', label: '10G' }
    ]
  },
  {
    id: 2, siteId: 2, name: '总部B1弱电拓扑',
    nodes: [
      { id: 'm1', x: 300, y: 60,  kind: 'fw',   label: '出口防火墙', ip: '10.0.0.254' },
      { id: 'm2', x: 300, y: 200, kind: 'core', label: '核心交换',   ip: '10.0.0.1' },
      { id: 'm3', x: 160, y: 350, kind: 'acc',  label: '接入-1F',   ip: '10.0.1.1' },
      { id: 'm4', x: 440, y: 350, kind: 'acc',  label: '接入-2F',   ip: '10.0.2.1' }
    ],
    edges: [
      { id: 'me1', source: 'm1', target: 'm2', label: '10G' },
      { id: 'me2', source: 'm2', target: 'm3', label: 'GE' },
      { id: 'me3', source: 'm2', target: 'm4', label: 'GE' }
    ]
  }
]
let topoSeq = 2

export function getTopoGraphs(siteId: number): TopoGraph[] {
  return topoGraphs.filter(g => g.siteId === siteId)
}
export function saveTopoGraph(g: TopoGraph): { ok: boolean; error?: string } {
  if (!g.name.trim()) return { ok: false, error: '拓扑图名称不能为空' }
  const exist = topoGraphs.find(x => x.id === g.id)
  if (exist) {
    exist.name = g.name.trim()
    exist.nodes = g.nodes
    exist.edges = g.edges
  } else {
    topoGraphs.push({ ...g, id: g.id || ++topoSeq })
  }
  return { ok: true }
}
export function createTopoGraph(siteId: number, name: string): { ok: boolean; graph?: TopoGraph; error?: string } {
  const n = name.trim()
  if (!n) return { ok: false, error: '名称不能为空' }
  if (topoGraphs.some(x => x.siteId === siteId && x.name === n)) return { ok: false, error: '同名拓扑图已存在' }
  const g: TopoGraph = { id: ++topoSeq, siteId, name: n, nodes: [], edges: [] }
  topoGraphs.push(g)
  return { ok: true, graph: g }
}
export function deleteTopoGraph(id: number): { ok: boolean; error?: string } {
  const idx = topoGraphs.findIndex(g => g.id === id)
  if (idx < 0) return { ok: false, error: '拓扑图不存在' }
  topoGraphs.splice(idx, 1)
  return { ok: true }
}

// ---------- 用户与登录（演示：前端本地校验；正式由后端 /api/v1/auth 与 sys_user 表提供） ----------
const users: AppUser[] = [
  { id: 1, username: 'admin', password: 'admin123', name: '系统管理员', role: 'super', siteIds: [], createdAt: '2026-10-01' },
  { id: 2, username: 'siteadmin', password: 'site123', name: '合肥现场管理员', role: 'site_admin', siteIds: [1], createdAt: '2026-10-02' },
  { id: 3, username: 'viewer', password: 'view123', name: '值班浏览', role: 'user', siteIds: [], createdAt: '2026-10-03' }
]
let userSeq = 3

export function getUsers(): AppUser[] {
  return users.map(u => ({ ...u, siteIds: [...u.siteIds] }))
}
export function loginLocal(username: string, password: string): { ok: boolean; user?: AppUser; error?: string } {
  const u = users.find(x => x.username === username.trim())
  if (!u || u.password !== password) return { ok: false, error: '用户名或密码错误' }
  return { ok: true, user: { ...u, siteIds: [...u.siteIds] } }
}
export function createUser(input: { username: string; password: string; name: string; role: UserRole; siteIds: number[] }): { ok: boolean; error?: string } {
  const username = input.username.trim()
  if (!/^[A-Za-z0-9_-]{3,20}$/.test(username)) return { ok: false, error: '用户名需为 3~20 位字母/数字/下划线' }
  if (users.some(u => u.username === username)) return { ok: false, error: '用户名已存在' }
  if (!input.name.trim()) return { ok: false, error: '姓名不能为空' }
  if (!input.password || input.password.length < 6) return { ok: false, error: '密码至少 6 位' }
  if (input.role === 'site_admin' && !input.siteIds.length) return { ok: false, error: '站点管理员至少选择一个管辖站点' }
  users.push({
    id: ++userSeq, username, password: input.password, name: input.name.trim(),
    role: input.role, siteIds: [...input.siteIds], createdAt: new Date().toISOString().slice(0, 10)
  })
  return { ok: true }
}
export function updateUser(id: number, patch: { name?: string; role?: UserRole; siteIds?: number[]; password?: string }): { ok: boolean; error?: string } {
  const u = users.find(x => x.id === id)
  if (!u) return { ok: false, error: '用户不存在' }
  if (patch.name !== undefined) {
    if (!patch.name.trim()) return { ok: false, error: '姓名不能为空' }
    u.name = patch.name.trim()
  }
  if (patch.role !== undefined) {
    if (u.role === 'super' && patch.role !== 'super' && users.filter(x => x.role === 'super').length <= 1) {
      return { ok: false, error: '至少保留一个超级管理员' }
    }
    u.role = patch.role
  }
  if (patch.siteIds !== undefined) u.siteIds = [...patch.siteIds]
  if (patch.password !== undefined && patch.password !== '') {
    if (patch.password.length < 6) return { ok: false, error: '密码至少 6 位' }
    u.password = patch.password
  }
  if (u.role === 'site_admin' && !u.siteIds.length) return { ok: false, error: '站点管理员至少选择一个管辖站点' }
  return { ok: true }
}
export function deleteUser(id: number): { ok: boolean; error?: string } {
  const idx = users.findIndex(u => u.id === id)
  if (idx < 0) return { ok: false, error: '用户不存在' }
  if (users[idx].role === 'super' && users.filter(u => u.role === 'super').length <= 1) {
    return { ok: false, error: '至少保留一个超级管理员' }
  }
  users.splice(idx, 1)
  return { ok: true }
}
// 当前登录用户自助修改密码（校验原密码）
export function changePassword(userId: number, oldPassword: string, newPassword: string): { ok: boolean; error?: string } {
  const u = users.find(x => x.id === userId)
  if (!u) return { ok: false, error: '用户不存在' }
  if (u.password !== oldPassword) return { ok: false, error: '当前密码不正确' }
  if (!newPassword || newPassword.length < 6) return { ok: false, error: '新密码至少 6 位' }
  if (newPassword === oldPassword) return { ok: false, error: '新密码不能与当前密码相同' }
  u.password = newPassword
  return { ok: true }
}

// ---------- SNMP 采集配置与环境状态（交换机/服务器；演示为模拟数据，正式由后端经 161/UDP 采集） ----------
const snmpConfigs = new Map<number, SnmpConfig>()

function defaultSnmp(): SnmpConfig {
  return { enabled: false, version: 'v2c', community: '', v3User: '', authPass: '', port: 161 }
}
export function getSnmpConfig(deviceId: number): SnmpConfig {
  return { ...defaultSnmp(), ...(snmpConfigs.get(deviceId) ?? {}) }
}
export function saveSnmpConfig(deviceId: number, cfg: SnmpConfig): { ok: boolean; error?: string } {
  if (!(cfg.port >= 1 && cfg.port <= 65535)) return { ok: false, error: '端口须为 1~65535' }
  if (cfg.version !== 'v3' && cfg.enabled && !cfg.community.trim()) return { ok: false, error: `${cfg.version} 需要填写团体名` }
  if (cfg.version === 'v3' && cfg.enabled && (!cfg.v3User.trim() || !cfg.authPass.trim())) {
    return { ok: false, error: 'SNMP v3 需要填写用户名与认证密码' }
  }
  snmpConfigs.set(deviceId, { ...cfg })
  return { ok: true }
}

// ---------- 硬件能力缓存（由 SNMP 采集写入；不再按型号推断） ----------
const hwCaps = new Map<number, HwCaps>()
// 演示环境：预置设备视为已采集过；此处仅记录个别设备的真实电源数样本
const DEMO_COLLECTED_PSU: Record<string, 1 | 2> = {
  SN20260101040: 1 // 核心交换-02（H3C S5130S，实机单电源）
}
// 单路 CPU 样本（实机只有 1 颗 CPU）——同样不做型号推断，仅作演示预置
const DEMO_COLLECTED_CPU: Record<string, 1 | 2> = {
  SN20260101040: 1, // 核心交换-02（H3C S5130S）
  SN20260101036: 1  // 接入交换-01（H3C S6520X）
}
function demoCapsFor(sn: string): HwCaps {
  const psuCount = DEMO_COLLECTED_PSU[sn] ?? 2
  return {
    psuCount,
    cpuCount: DEMO_COLLECTED_CPU[sn] ?? 2,
    fanCount: psuCount === 1 ? 2 : 4,
    sensorCount: 6,
    collectedAt: '2026-10-24 09:12'
  }
}
/** 读取已采集的硬件能力；演示预置设备懒加载为已采集，用户新增设备在采集前返回 null */
export function getHwCaps(deviceId: number): HwCaps | null {
  const stored = hwCaps.get(deviceId)
  if (stored) return stored
  const dev = findMountedDeviceAny(deviceId)
  if (!dev || !demoDeviceIds.has(deviceId)) return null
  const caps = demoCapsFor(dev.sn)
  hwCaps.set(deviceId, caps)
  return caps
}
/** 模拟 SNMP 采集硬件能力（测试连接成功后调用）：写入缓存并返回 */
export function collectHwCaps(deviceId: number): HwCaps | null {
  const dev = findMountedDeviceAny(deviceId)
  if (!dev) return null
  const h = [...dev.sn].reduce((a, c) => a + c.charCodeAt(0), 0)
  const psuCount = (DEMO_COLLECTED_PSU[dev.sn] ?? (h % 3 === 0 ? 1 : 2)) as 1 | 2
  const cpuCount = (DEMO_COLLECTED_CPU[dev.sn] ?? (h % 5 === 0 ? 1 : 2)) as 1 | 2
  const caps: HwCaps = {
    psuCount,
    cpuCount,
    fanCount: psuCount === 1 ? 2 : 4,
    sensorCount: 4 + (h % 5),
    collectedAt: new Date().toLocaleString('zh-CN', { hour12: false })
  }
  hwCaps.set(deviceId, caps)
  return caps
}

// 确定性演示数据：同一设备刷新（salt 变化）时数值小幅波动
export function deviceEnv(
  deviceId: number,
  salt = 0,
  psuCount: 0 | 1 | 2 = 0,
  cpuCount: 0 | 1 | 2 = 0
): DeviceEnv {
  const r = deviceId % 7
  const jitter = (deviceId * 13 + salt * 29) % 9
  const cpu1 = 44 + r * 4 + (salt % 3)
  // 演示异常比例约 13%（便于健康大屏有少量真实告警样本，又不至于满屏红）
  const psu2fail = psuCount >= 2 && deviceId % 13 === 5
  const psu1fail = psuCount === 1 && deviceId % 19 === 4
  const fanfail = deviceId % 17 === 9
  const bad = psu2fail || psu1fail || fanfail
  return {
    deviceId,
    psuCount,
    cpuCount,
    inlet: 20 + (r % 4) + (salt % 2),
    outlet: 30 + (deviceId % 6) + jitter % 3,
    cpu1,
    cpu2: cpuCount === 1 ? 0 : cpu1 + 5 + (deviceId % 4),
    cpuUsage: 14 + ((deviceId * 7 + salt * 11) % 62),
    memUsage: 26 + ((deviceId * 11 + salt * 7) % 58),
    psu1: psuCount === 0 ? 'na' : psu1fail ? 'fail' : 'ok',
    psu2: psuCount >= 2 ? (psu2fail ? 'fail' : 'ok') : 'na',
    fan: fanfail ? 'fail' : 'ok',
    disk: 'ok',
    mem: 'ok',
    healthOk: bad ? 2 : 3,
    healthCritical: bad ? 1 : 0
  }
}

function findMountedDeviceAny(deviceId: number): DeviceBrief | null {
  for (const slots of rackSlots.values()) {
    for (const s of slots) if (s.device?.id === deviceId) return s.device
  }
  return null
}

export function testSnmp(deviceId: number): SnmpTestResult {
  const dev = findMountedDeviceAny(deviceId)
  const cfg = getSnmpConfig(deviceId)
  if (!dev) return { ok: false, message: '设备不存在（仅在用设备支持SNMP采集）', latencyMs: 0 }
  if (!dev.manage_ip) return { ok: false, message: '该设备未配置管理IP，请先在设备信息中填写', latencyMs: 0 }
  if (!cfg.enabled) return { ok: false, message: 'SNMP 采集未启用，请勾选启用后保存再测试', latencyMs: 0 }
  if (cfg.version !== 'v3' && !cfg.community.trim()) {
    return { ok: false, message: `SNMP ${cfg.version} 需要填写团体名（community）`, latencyMs: 0 }
  }
  if (cfg.version === 'v3' && (!cfg.v3User.trim() || !cfg.authPass.trim())) {
    return { ok: false, message: 'SNMP v3 需要填写用户名与认证密码', latencyMs: 0 }
  }
  const latencyMs = 12 + (deviceId % 37)
  const caps = collectHwCaps(deviceId)
  const capText = caps
    ? `，已采集硬件能力：电源 ${caps.psuCount} ×、CPU ${caps.cpuCount} ×、风扇 ${caps.fanCount} ×、温度传感器 ${caps.sensorCount} 个`
    : ''
  return {
    ok: true,
    message: `连接成功：${dev.manage_ip}:${cfg.port}（SNMP ${cfg.version}），已读取系统信息与传感器数据${capText}`,
    latencyMs,
    env: deviceEnv(deviceId, 0, (caps?.psuCount ?? 0) as 0 | 1 | 2, (caps?.cpuCount ?? 0) as 0 | 1 | 2)
  }
}

// 站点内交换机/服务器/防火墙/存储环境总览（含懒生成机柜的设备）
const ENV_CATS = [1, 2, 3, 4, 5, 6]
export function getSiteEnvRows(siteId: number, salt = 0): SiteEnvRow[] {
  const site = sites.find(s => s.id === siteId)
  const rows: SiteEnvRow[] = []
  for (const room of roomsMeta.filter(r => r.siteId === siteId)) {
    for (const rack of roomRacks.get(room.id) ?? []) {
      const scene = getRackScene(rack.id)
      if (!scene) continue
      const seen = new Set<number>()
      for (const s of scene.u_slots) {
        const d = s.device
        if (!d || seen.has(d.id) || !ENV_CATS.includes(d.category)) continue
        seen.add(d.id)
        rows.push({
          siteId, siteName: site?.name ?? '', name: d.name, category: d.category,
          ip: d.manage_ip ?? '-', location: `${room.code} · ${rack.code} U${s.u_no}`,
          env: deviceEnv(
            d.id, salt,
            (getHwCaps(d.id)?.psuCount ?? 0) as 0 | 1 | 2,
            (getHwCaps(d.id)?.cpuCount ?? 0) as 0 | 1 | 2
          )
        })
      }
    }
  }
  return rows
}
export function getAllSiteEnvRows(salt = 0): SiteEnvRow[] {
  return sites.flatMap(s => getSiteEnvRows(s.id, salt))
}

// ================= 本地持久化（演示版） =================
// 正式版由后端数据库持久化；演示版把业务状态快照保存到浏览器 localStorage，
// 刷新页面不丢数据。换浏览器或清理站点数据会回到初始演示数据（用户菜单可手动恢复）。
const DB_KEY = 'cubeark_db_v1'
type MapEntry<T> = Array<[number, T]>

interface DbSnapshot {
  v: 1
  sites: Site[]; siteSeq: number
  roomsMeta: RoomMeta[]; roomSeq: number
  roomRacks: MapEntry<RackInfo[]>; rackSeq: number
  rackSlots: MapEntry<USlot[]>; deviceSeq: number; demoDeviceIds: number[]
  warehouses: MapEntry<WarehouseDevice[]>
  stockLogs: StockLog[]; idcBarcodes: MapEntry<string>
  itAssets: MapEntry<ITAsset[]>; itSeq: number
  ledgerMetas: MapEntry<LedgerMeta>
  accountTables: MapEntry<AccountTable[]>; tableSeq: number; acctSeq: number
  floorPlans: FloorPlan[]; planSeq: number; pointSeq: number
  repairRecords: RepairRecord[]; repairSeq: number
  vlanPlans: MapEntry<VlanPlan[]>; ipEntries: MapEntry<IpEntry[]>; vlanSeq: number; ipSeq: number
  topoGraphs: TopoGraph[]; topoSeq: number
  users: AppUser[]; userSeq: number
  snmpConfigs: MapEntry<SnmpConfig>; hwCaps: MapEntry<HwCaps>
  orderSeq: number
}

function mapEntries<V>(m: Map<number, V>): Array<[number, V]> { return [...m.entries()] }
function fillMap<V>(m: Map<number, V>, entries: Array<[number, V]>) {
  m.clear()
  for (const [k, v] of entries) m.set(k, v)
}
function fillArray<T>(target: T[], next: T[]) {
  target.splice(0, target.length, ...next)
}

function buildSnapshot(): DbSnapshot {
  return {
    v: 1,
    sites: JSON.parse(JSON.stringify(sites)), siteSeq,
    roomsMeta: JSON.parse(JSON.stringify(roomsMeta)), roomSeq,
    roomRacks: JSON.parse(JSON.stringify(mapEntries(roomRacks))), rackSeq,
    rackSlots: JSON.parse(JSON.stringify(mapEntries(rackSlots))), deviceSeq,
    demoDeviceIds: [...demoDeviceIds],
    warehouses: JSON.parse(JSON.stringify(mapEntries(warehouses))),
    stockLogs: JSON.parse(JSON.stringify(stockLogs)),
    idcBarcodes: JSON.parse(JSON.stringify(mapEntries(idcBarcodes))),
    itAssets: JSON.parse(JSON.stringify(mapEntries(itAssets))), itSeq,
    ledgerMetas: JSON.parse(JSON.stringify(mapEntries(ledgerMetas))),
    accountTables: JSON.parse(JSON.stringify(mapEntries(accountTables))), tableSeq, acctSeq,
    floorPlans: JSON.parse(JSON.stringify(floorPlans)), planSeq, pointSeq,
    repairRecords: JSON.parse(JSON.stringify(repairRecords)), repairSeq,
    vlanPlans: JSON.parse(JSON.stringify(mapEntries(vlanPlans))),
    ipEntries: JSON.parse(JSON.stringify(mapEntries(ipEntries))), vlanSeq, ipSeq,
    topoGraphs: JSON.parse(JSON.stringify(topoGraphs)), topoSeq,
    users: JSON.parse(JSON.stringify(users)), userSeq,
    snmpConfigs: JSON.parse(JSON.stringify(mapEntries(snmpConfigs))),
    hwCaps: JSON.parse(JSON.stringify(mapEntries(hwCaps))),
    orderSeq
  }
}

// 旧快照里点位 id 可能与后加点位重复（早期 pointSeq 偏小），载入时统一重排，
// 否则列表按 key 复用会把点位渲染成别的设备的图标/编号
function repairPointIds() {
  let maxId = 0
  for (const plan of floorPlans) for (const pt of plan.points) if (pt.id > maxId) maxId = pt.id
  const seen = new Set<number>()
  for (const plan of floorPlans) for (const pt of plan.points) {
    if (seen.has(pt.id)) { maxId += 1; pt.id = maxId }
    else seen.add(pt.id)
  }
  pointSeq = Math.max(pointSeq, maxId)
}

function applySnapshot(d: DbSnapshot) {
  fillArray(sites, d.sites); siteSeq = d.siteSeq
  fillArray(roomsMeta, d.roomsMeta); roomSeq = d.roomSeq
  fillMap(roomRacks, d.roomRacks); rackSeq = d.rackSeq
  fillMap(rackSlots, d.rackSlots); deviceSeq = d.deviceSeq
  demoDeviceIds.clear(); d.demoDeviceIds.forEach(id => demoDeviceIds.add(id))
  fillMap(warehouses, d.warehouses)
  fillArray(stockLogs, d.stockLogs)
  fillMap(idcBarcodes, d.idcBarcodes)
  fillMap(itAssets, d.itAssets); itSeq = d.itSeq
  fillMap(ledgerMetas, d.ledgerMetas)
  fillMap(accountTables, d.accountTables); tableSeq = d.tableSeq; acctSeq = d.acctSeq
  fillArray(floorPlans, d.floorPlans); planSeq = d.planSeq; pointSeq = d.pointSeq
  repairPointIds()
  // v1.12 之前的快照没有维修记录字段，缺失时保留演示数据（不能整体抛错，否则会丢弃全部本地数据）
  if (Array.isArray(d.repairRecords)) {
    fillArray(repairRecords, d.repairRecords)
    repairSeq = Math.max(repairSeq, d.repairSeq ?? 0, ...repairRecords.map(r => r.id))
  }
  fillMap(vlanPlans, d.vlanPlans); fillMap(ipEntries, d.ipEntries)
  vlanSeq = d.vlanSeq; ipSeq = d.ipSeq
  fillArray(topoGraphs, d.topoGraphs); topoSeq = d.topoSeq
  fillArray(users, d.users); userSeq = d.userSeq
  fillMap(snmpConfigs, d.snmpConfigs); fillMap(hwCaps, d.hwCaps)
  orderSeq = d.orderSeq
}

let lastSnapshotJson = ''

function persistNow() {
  if (typeof window === 'undefined' || !window.localStorage) return
  try {
    const json = JSON.stringify(buildSnapshot())
    lastSnapshotJson = json
    window.localStorage.setItem(DB_KEY, json)
  } catch {
    /* 超出配额或隐私模式时静默失败 */
  }
}
function persistIfChanged() {
  if (typeof window === 'undefined' || !window.localStorage) return
  try {
    const json = JSON.stringify(buildSnapshot())
    if (json === lastSnapshotJson) return
    lastSnapshotJson = json
    window.localStorage.setItem(DB_KEY, json)
  } catch {
    /* ignore */
  }
}

// 清空全部业务数据（站点/机房/机柜/设备/资产/点位/维修/拓扑/VLAN/信息表），保留登录账号
function clearBusinessData() {
  sites.length = 0; siteSeq = 0
  roomsMeta.length = 0; roomSeq = 0
  roomRacks.clear(); rackSeq = 0
  rackSlots.clear(); deviceSeq = 0
  demoDeviceIds.clear()
  warehouses.clear()
  stockLogs.length = 0; orderSeq = 0
  idcBarcodes.clear()
  itAssets.clear(); itSeq = 0
  ledgerMetas.clear()
  accountTables.clear(); tableSeq = 0; acctSeq = 0
  floorPlans.length = 0; planSeq = 0; pointSeq = 0
  repairRecords.length = 0; repairSeq = 0
  vlanPlans.clear(); ipEntries.clear(); vlanSeq = 0; ipSeq = 0
  topoGraphs.length = 0; topoSeq = 0
  snmpConfigs.clear(); hwCaps.clear()
}

if (!SEED_DEMO) clearBusinessData()

function initPersistence() {
  if (typeof window === 'undefined' || !window.localStorage) return
  try {
    const raw = window.localStorage.getItem(DB_KEY)
    if (raw) {
      const d = JSON.parse(raw) as DbSnapshot
      if (d && d.v === 1) applySnapshot(d)
    }
  } catch {
    /* 快照损坏时使用初始演示数据 */
  }
  lastSnapshotJson = JSON.stringify(buildSnapshot())
  window.setInterval(persistIfChanged, 3000)
  window.addEventListener('pagehide', persistNow)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') persistNow()
  })
}
initPersistence()

/** 清空本机保存的全部数据并重新加载（回到空白系统；登录账号恢复为初始三个账号） */
export function clearAllData() {
  try { window.localStorage.removeItem(DB_KEY) } catch { /* ignore */ }
  window.location.reload()
}

/** 当前本地快照大小（字节，便于排查存储占用） */
export function localDbSize(): number {
  try { return (window.localStorage.getItem(DB_KEY) ?? '').length } catch { return 0 }
}
