export interface RackInfo {
  id: number
  code: string
  row_no: number
  col_no: number
  u_total: number
  pos: { x: number; y: number; z: number }
  rotation_y: number
  used_u: number
  usage_pct: number
  health: 1 | 2
  alarm_count: number
}

export interface RoomSceneData {
  room: { id: number; name: string; floor?: string }
  racks: RackInfo[]
}

export interface DeviceBrief {
  id: number
  sn: string
  name: string
  category: number
  model: { vendor: string; model: string; u_height: number; model3d_key?: string | null }
  status: number
  manage_ip?: string
  biz_ip?: string
  health: 1 | 2
}

// 设备七分类（全局统一：3D配色/入库/台账/3D编辑共用）
export const DEVICE_CATS: Array<{ v: number; label: string; color: string }> = [
  { v: 1, label: '虚拟化服务器', color: '#42a5f5' },
  { v: 2, label: '交换机', color: '#26a69a' },
  { v: 3, label: '防火墙', color: '#e53935' },
  { v: 4, label: '存储', color: '#ffa726' },
  { v: 5, label: 'HPC登陆节点', color: '#ab47bc' },
  { v: 6, label: 'HPC计算节点', color: '#7e57c2' },
  { v: 7, label: '其他', color: '#90a4ae' }
]
export const CAT_NAME: Record<number, string> = {
  1: '虚拟化服务器', 2: '交换机', 3: '防火墙', 4: '存储',
  5: 'HPC登陆节点', 6: 'HPC计算节点', 7: '其他'
}

// 设备二级分组（设备大类）：台账/环境总览/入库等按大类归并
export const DEVICE_GROUP: Record<number, string> = {
  1: '服务器设备', 2: '网络设备', 3: '网络设备', 4: '存储设备',
  5: '服务器设备', 6: '服务器设备', 7: '其他设备'
}
export const DEVICE_GROUPS = ['网络设备', '服务器设备', '存储设备', '其他设备']

export interface USlot {
  u_no: number
  status: 0 | 1 | 2
  device: DeviceBrief | null
}

export interface RackSceneData {
  rack: { id: number; code: string; u_total: number }
  u_slots: USlot[]
}

export interface WarehouseDevice {
  id: number
  sn: string
  name: string
  category: number
  vendor: string
  model: string
  u_height: number
  manage_ip?: string  // 下架回库时保留，重新上架自动带回
  biz_ip?: string
}

export interface CheckDropResult {
  ok: boolean
  u_end: number
  conflicts: string[]
}

// ===== 多站点层（阶段1新增）：站点 -> 机房 -> 机柜 -> U位资产 =====

export interface Site {
  id: number
  name: string
  address: string
  owner: string
  remark: string
}

export interface RoomMeta {
  id: number
  siteId: number
  code: string
  name: string
  floor: string
}

export interface SiteStats {
  roomCount: number
  rackCount: number
  usagePct: number
  alarmRacks: number
}

// ===== 阶段2：资产出入库（机房资产 / IT仓库资产）与设备台账 =====
export type AssetKind = 'idc' | 'it'
export type StockOp = '入库' | '出库' | '领用' | '归还' | '上架' | '下架' | '报废'

export interface StockLog {
  id: number
  kind: AssetKind
  title: string
  barcode: string
  sn: string
  op: StockOp
  operator: string
  time: string
  siteId: number
  roomId?: number
  reason: string
  remark: string
}

export interface ITAsset {
  id: number
  barcode: string
  name: string
  type: string
  spec: string
  status: '在库' | '领用中' | '已出库' | '报废'
  holder: string
  remark: string
}

export interface LedgerMeta {
  deviceId: number
  mac?: string
  warrantyEnd?: string
  owner?: string
  remark?: string
}

export interface LedgerRow {
  id: number
  sn: string
  name: string
  vendor: string
  model: string
  category: number
  status: string
  mounted: boolean
  siteId: number
  siteName: string
  roomId?: number
  roomName?: string
  rackId?: number
  rackCode?: string
  uHeight?: number
  uStart?: number
  uEnd?: number
  manageIp?: string
  bizIp?: string
  meta: Partial<LedgerMeta>
}

export interface IDCAssetRow {
  deviceId: number
  barcode: string
  name: string
  category: number
  sn: string
  vendor: string
  model: string
  uHeight: number
  status: '在库' | '已上架'
  roomId?: number
  roomName?: string
  rackId?: number
  rackCode?: string
  uStart?: number
  uEnd?: number
}

// ===== 硬件状态与SNMP采集（交换机/服务器） =====
export interface HWStatus {
  inlet: number
  cpu: number
  psu: '正常' | '告警' | '未采集'
  fan: '正常' | '告警'
  psuDetail?: string  // 电源明细（如 PSU1/PSU2 在线 1+1冗余 / 单电源）
  fanRpm?: string     // 风扇转速/明细
}

// SNMP 采集到的硬件能力（电源数量/CPU 数量/风扇/温度传感器），未采集时无记录
export interface HwCaps {
  psuCount: 1 | 2
  cpuCount: 1 | 2   // 单路/双路 CPU，由 SNMP 采集识别
  fanCount: number
  sensorCount: number
  collectedAt: string
}

export type SnmpVersion = 'v1' | 'v2c' | 'v3'

export interface SnmpConfig {
  enabled: boolean
  version: SnmpVersion
  community: string  // v1/v2c 团体名
  v3User: string     // v3 用户名
  authPass: string   // v3 认证密码
  port: number       // 默认 161
}

// 设备环境采集值（演示数据；正式由后端经 SNMP 采集）
export type PsuState = 'ok' | 'fail' | 'na'

export interface DeviceEnv {
  deviceId: number
  inlet: number      // 进风温度 ℃
  outlet: number     // 排风温度 ℃
  cpu1: number       // CPU1 温度 ℃
  cpu2: number       // CPU2 温度 ℃（单路 CPU 设备为 0，不展示）
  cpuCount: 0 | 1 | 2 // 0=尚未通过 SNMP 采集；1=单路；2=双路
  cpuUsage: number   // CPU 使用率 %
  memUsage: number   // 内存使用率 %
  psuCount: 0 | 1 | 2      // 0=尚未通过 SNMP 采集；1=单电源；2=双电源
  psu1: PsuState
  psu2: PsuState           // 单电源设备为 'na'（不适用）
  fan: 'ok' | 'fail'
  disk: 'ok' | 'fail'
  mem: 'ok' | 'fail'
  healthOk: number
  healthCritical: number
}

export interface SiteEnvRow {
  siteId: number
  siteName: string
  name: string
  category: number
  ip: string
  location: string
  env: DeviceEnv
}

export interface SnmpTestResult {
  ok: boolean
  message: string
  latencyMs: number
  env?: DeviceEnv
}

// ===== 2D网络拓扑（阶段3） =====
export type TopoKind = 'core' | 'agg' | 'acc' | 'fw' | 'srv' | 'other'

export interface TopoNode {
  id: string
  x: number
  y: number
  kind: TopoKind
  label: string
  ip?: string
  sn?: string    // 绑定资产设备SN，双击跳台账
  remark?: string
}

export interface TopoEdge {
  id: string
  source: string
  target: string
  label?: string  // 链路标注：10G/GE/双上联
}

export interface TopoGraph {
  id: number
  siteId: number
  name: string
  nodes: TopoNode[]
  edges: TopoEdge[]
}

// ===== VLAN规划 / IP台账（阶段5） =====
export type IpStatus = '空闲' | '已分配' | '保留'

export interface VlanPlan {
  id: number
  vlanId: number     // 1~4094
  name: string
  cidr: string       // 如 192.168.30.0/24
  gateway: string
  ipRange: string    // 可用IP范围 如 192.168.30.11-250（空=整段）
  purpose: string    // 用途
  owner: string      // 负责人
  remark: string
}

export interface IpEntry {
  id: number
  planId: number     // 归属VLAN
  ip: string
  status: IpStatus
  ref: string        // 关联设备/点位描述
  remark: string
}

// ===== 楼层图纸点位（阶段4：PDF底图 + 网口/电话/监控/显示器/主机/笔记本打点） =====
export type PointType = 'net' | 'phone' | 'cam' | 'monitor' | 'pc' | 'laptop' | 'printer' | 'ap'
export type PointStatus = '在用' | '空闲' | '损坏报废'

export interface FloorPoint {
  id: number
  type: PointType
  code: string       // 点位编号 NK/Tel/Cam/Mon/PC/NB-楼层-序号
  location: string   // 位置描述
  ip: string
  vlan: string
  phone: string      // 电话号（仅电话点位）
  switchName?: string // 网口点位：所连交换机
  switchPort?: string // 网口点位：交换机端口
  model?: string     // 设备型号（打印机/无线AP）
  sn?: string        // 序列号（所有点位均可填）
  mac?: string       // 本机MAC（主机/笔记本）
  dockMac?: string   // 拓展坞MAC（主机/笔记本）
  owner: string      // 使用人
  dept: string       // 部门
  status: PointStatus
  remark: string
  x: number          // 归一化坐标 0~1（相对图纸页）
  y: number
  page: number       // PDF页码
}

export interface FloorPlan {
  id: number
  siteId: number
  building: string   // 楼宇
  floor: string      // 楼层
  name: string       // 图纸名称
  pdfName: string    // 原始PDF文件名（空=空白画布）
  pageCount: number
  points: FloorPoint[]
}

// ===== 硬件维修记录 =====
export interface RepairRecord {
  id: number
  siteId: number
  deviceCode: string     // 设备编号（可从设备台账选择，也可手动录入）
  sn: string             // SN 号（可从设备台账选择，也可手动录入）
  reason: string         // 送修原因
  symptom: string        // 故障现象
  reportedAt: string     // 报修时间（datetime-local）
  needOutsource: boolean // 是否需要外出维修
  finishedAt: string     // 维修完成时间
  result: string         // 维修结果
  scrapped: boolean      // 是否报废
}

// ===== 用户与权限（三种角色：超级管理员 / 站点管理员 / 普通用户） =====
export type UserRole = 'super' | 'site_admin' | 'user'

export interface AppUser {
  id: number
  username: string
  password: string   // 演示系统本地校验；正式环境由后端认证并下发会话
  name: string
  role: UserRole
  siteIds: number[]  // 站点管理员管辖站点；超级管理员/普通用户忽略
  createdAt: string
}

export const ROLE_NAME: Record<UserRole, string> = {
  super: '超级管理员',
  site_admin: '站点管理员',
  user: '普通用户'
}

// ===== IT信息统计 · 服务器账号表（对应用户Excel：服务器/IP/用户名/密码/远程方式/网址/序列号） =====
export interface ServerAccount {
  id: number
  group: string      // 分组（如 HF-OA服务器 / 物理服务器带外管理）
  server: string
  ip: string
  username: string
  password: string
  remoteType: string // 远程桌面 / SSH / web / 其他
  url: string        // 管理网址
  sn: string         // 序列号
  remark: string
}

// 多表结构：一个站点下多张信息表（Excel一个Sheet=一张表；可放服务器账号/交换机/监控/无线AP等）
export const ACCOUNT_HEADERS = ['分组', '服务器', 'IP', '用户名', '密码', '远程方式', '网址', '序列号', '备注']

export interface AccountTable {
  id: number
  name: string
  rows: ServerAccount[]
  columns?: string[]      // 自定义列抬头（9列，缺省用 ACCOUNT_HEADERS）
  groupPresets?: string[] // 预设分组（datalist 可选，无需已有行）
}
