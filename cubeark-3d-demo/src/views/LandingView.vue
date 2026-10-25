<script setup lang="ts">
// 平台首页 —— 独立全屏「设备健康监控大屏」（不套侧边栏壳层）
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import AppLogo from '../components/AppLogo.vue'
import SegBar from '../components/SegBar.vue'
import { getSites, siteStats, getAllSiteEnvRows } from '../api/mock'
import { manageableSiteIds } from '../store/auth'
import { auth } from '../store/auth'
import type { Site, SiteEnvRow } from '../types'
import { CAT_NAME, DEVICE_GROUP, DEVICE_GROUPS, ROLE_NAME } from '../types'

const router = useRouter()

const salt = ref(0)
const autoRefresh = ref(true)
const lastAt = ref(new Date())
const now = ref(new Date())
const isFull = ref(false)
const fSite = ref(0)
const fGroup = ref('')
const onlyBad = ref(false)

const sites = computed<Site[]>(() => {
  const ids = manageableSiteIds()
  return getSites().filter(s => ids.includes(s.id))
})
const userName = computed(() => auth.user?.name ?? '-')
const userRole = computed(() => (auth.user ? ROLE_NAME[auth.user.role] : ''))

function isBad(r: SiteEnvRow) {
  return r.env.healthCritical > 0 || r.env.fan === 'fail' || r.env.psu1 === 'fail' || r.env.psu2 === 'fail'
}
function badReason(r: SiteEnvRow) {
  if (r.env.fan === 'fail') return '风扇异常'
  if (r.env.psu1 === 'fail' || r.env.psu2 === 'fail') return '电源异常'
  return '健康 critical'
}
function peakTemp(r: SiteEnvRow) {
  return Math.max(r.env.inlet, r.env.outlet, r.env.cpu1, r.env.cpu2)
}

const envRowsAll = computed<SiteEnvRow[]>(() => {
  salt.value
  const ids = manageableSiteIds()
  return getAllSiteEnvRows(salt.value).filter(r => ids.includes(r.siteId))
})

const siteCards = computed(() => {
  salt.value
  return sites.value.map(s => {
    const rows = envRowsAll.value.filter(r => r.siteId === s.id)
    const bad = rows.filter(isBad).length
    const st = siteStats(s.id)
    return {
      site: s, stats: st,
      devices: rows.length, bad, ok: rows.length - bad,
      maxTemp: rows.length ? Math.max(...rows.map(peakTemp)) : 0
    }
  })
})

const totals = computed(() => {
  const list = siteCards.value
  const devices = list.reduce((n, c) => n + c.devices, 0)
  const bad = list.reduce((n, c) => n + c.bad, 0)
  const racks = list.reduce((n, c) => n + c.stats.rackCount, 0)
  const rooms = list.reduce((n, c) => n + c.stats.roomCount, 0)
  const alarmRacks = list.reduce((n, c) => n + c.stats.alarmRacks, 0)
  const usage = list.length ? Math.round((list.reduce((n, c) => n + c.stats.usagePct, 0) / list.length) * 10) / 10 : 0
  return { sites: list.length, rooms, racks, devices, bad, alarmRacks, usage }
})

const hotTop = computed(() =>
  [...envRowsAll.value].sort((a, b) => peakTemp(b) - peakTemp(a)).slice(0, 8)
)
const badList = computed(() => envRowsAll.value.filter(isBad))

const detailGroups = computed(() => {
  const groups = new Map<number, SiteEnvRow[]>()
  for (const r of envRowsAll.value) {
    if (fSite.value && r.siteId !== fSite.value) continue
    if (fGroup.value && (DEVICE_GROUP[r.category] ?? '其他设备') !== fGroup.value) continue
    if (onlyBad.value && !isBad(r)) continue
    if (!groups.has(r.siteId)) groups.set(r.siteId, [])
    groups.get(r.siteId)!.push(r)
  }
  return sites.value
    .filter(s => groups.has(s.id))
    .map(s => ({
      site: s,
      rows: groups.get(s.id)!.sort((a, b) => Number(isBad(b)) - Number(isBad(a)) || peakTemp(b) - peakTemp(a))
    }))
})

const OK_BANDS: Array<[number, string]> = [[100, '#34c759']]
const BAD_BANDS: Array<[number, string]> = [[45, '#f5a623'], [100, '#ff4d4f']]
const bands = (ok: boolean) => (ok ? OK_BANDS : BAD_BANDS)

function tempClass(t: number) {
  return t >= 75 ? 'hot' : t >= 65 ? 'warm' : ''
}

function refresh() {
  salt.value++
  lastAt.value = new Date()
}
const timeText = computed(() => lastAt.value.toLocaleTimeString('zh-CN', { hour12: false }))
const clock = computed(() => now.value.toLocaleTimeString('zh-CN', { hour12: false }))

let refreshTimer: number | undefined
let clockTimer: number | undefined
onMounted(() => {
  refreshTimer = window.setInterval(() => { if (autoRefresh.value) refresh() }, 30000)
  clockTimer = window.setInterval(() => { now.value = new Date() }, 1000)
  document.addEventListener('fullscreenchange', onFsChange)
})
onBeforeUnmount(() => {
  window.clearInterval(refreshTimer)
  window.clearInterval(clockTimer)
  document.removeEventListener('fullscreenchange', onFsChange)
})

function onFsChange() { isFull.value = !!document.fullscreenElement }
async function toggleFull() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen()
    else await document.documentElement.requestFullscreen()
  } catch {
    /* 浏览器不支持或用户拒绝时忽略 */
  }
}

function enterSite(siteId: number) { router.push(`/sites/${siteId}/rooms`) }
function enterWorkspace() { router.push('/sites') }
</script>

<template>
  <div class="dash">
    <header class="head">
      <div class="brand">
        <AppLogo :size="26" />
        <span class="wm">Cube<em>Ark</em></span>
      </div>
      <div class="head-title">
        <b>设备健康监控大屏</b>
        <span>跨站点硬件健康总览 · 温度 / 电源 / 风扇 / 系统健康</span>
      </div>
      <div class="head-right">
        <span class="clock">{{ clock }}</span>
        <span class="refresh-at">刷新 {{ timeText }}</span>
        <label class="auto"><input v-model="autoRefresh" type="checkbox" /> 自动 30s</label>
        <button class="hd-btn" @click="refresh">刷新</button>
        <button class="hd-btn" @click="toggleFull">{{ isFull ? '退出全屏' : '全屏' }}</button>
        <span class="who">{{ userName }}<i>{{ userRole }}</i></span>
        <button class="hd-btn primary" @click="enterWorkspace">进入工作台</button>
      </div>
    </header>

    <div class="body">
      <!-- KPI -->
      <section class="kpis">
        <div class="kpi">
          <span>站点</span><b>{{ totals.sites }}</b>
        </div>
        <div class="kpi">
          <span>机房 / 机柜</span><b>{{ totals.rooms }}<em>/</em>{{ totals.racks }}</b>
        </div>
        <div class="kpi">
          <span>在用设备</span><b>{{ totals.devices }}</b>
        </div>
        <div class="kpi" :class="{ bad: totals.bad }">
          <span>异常设备</span><b>{{ totals.bad }}</b>
        </div>
        <div class="kpi" :class="{ bad: totals.alarmRacks }">
          <span>告警机柜</span><b>{{ totals.alarmRacks }}</b>
        </div>
        <div class="kpi">
          <span>平均 U 位使用率</span><b>{{ totals.usage }}<em>%</em></b>
        </div>
      </section>

      <!-- 站点健康概览（通栏） -->
      <section class="sites">
        <div class="block-head">
          <b>站点健康概览</b>
          <span>共 {{ siteCards.length }} 个站点 · 健康 / 异常设备比例 · 站点增多时区域内滚动</span>
        </div>
        <div class="site-grid">
          <div v-for="c in siteCards" :key="c.site.id" class="site-card">
            <div class="sc-top">
              <b>{{ c.site.name }}</b>
              <span v-if="c.bad" class="badge danger">{{ c.bad }} 台异常</span>
              <span v-else class="badge ok">全部健康</span>
              <button class="mini" @click="enterSite(c.site.id)">进入机房 →</button>
            </div>
            <div class="sc-nums">
              <div><i>机房</i><b>{{ c.stats.roomCount }}</b></div>
              <div><i>机柜</i><b>{{ c.stats.rackCount }}</b></div>
              <div><i>在用设备</i><b>{{ c.devices }}</b></div>
              <div><i>告警柜</i><b :class="{ red: c.stats.alarmRacks }">{{ c.stats.alarmRacks }}</b></div>
              <div><i>最高温度</i><b :class="tempClass(c.maxTemp)">{{ c.maxTemp }}<em>℃</em></b></div>
            </div>
            <div class="sc-bar">
              <div class="usage"><i :style="{ width: Math.min(c.stats.usagePct, 100) + '%' }"></i></div>
              <span>U 位 {{ c.stats.usagePct }}%</span>
            </div>
            <div class="sc-health">
              <div class="hbar">
                <i class="ok" :style="{ width: c.devices ? (c.ok / c.devices) * 100 + '%' : '0%' }"></i>
                <i class="bad" :style="{ width: c.devices ? (c.bad / c.devices) * 100 + '%' : '0%' }"></i>
              </div>
              <span>健康 {{ c.ok }} · 异常 {{ c.bad }}</span>
            </div>
          </div>
        </div>
      </section>

      <!-- 明细 + 温度 Top + 异常设备 -->
      <section class="low">
        <div class="panel">
          <div class="panel-head">
            <b>全部设备环境明细</b>
            <div class="filters">
              <select v-model.number="fSite" class="select">
                <option :value="0">全部站点</option>
                <option v-for="s in sites" :key="s.id" :value="s.id">{{ s.name }}</option>
              </select>
              <select v-model="fGroup" class="select">
                <option value="">全部大类</option>
                <option v-for="g in DEVICE_GROUPS" :key="g" :value="g">{{ g }}</option>
              </select>
              <label class="auto"><input v-model="onlyBad" type="checkbox" /> 仅看异常</label>
            </div>
          </div>
          <div class="panel-body table-wrap">
            <table class="table dash-table">
              <thead>
                <tr>
                  <th>设备</th><th>类型</th><th>位置</th>
                  <th>进风</th><th>排风</th><th>CPU1</th><th>CPU2</th>
                  <th>CPU</th><th>内存</th><th>电源</th><th>风扇</th><th>系统健康</th>
                </tr>
              </thead>
              <tbody>
                <template v-for="g in detailGroups" :key="g.site.id">
                  <tr class="site-row">
                    <td :colspan="12"><b>{{ g.site.name }}</b>{{ g.rows.length }} 台设备</td>
                  </tr>
                  <tr v-for="(r, i) in g.rows" :key="`${g.site.id}-${r.name}-${i}`">
                    <td><b>{{ r.name }}</b></td>
                    <td>{{ CAT_NAME[r.category] ?? '其他' }}</td>
                    <td class="ell" :title="r.location">{{ r.location }}</td>
                    <td class="cell"><SegBar :value="r.env.inlet" :max="60" :segments="10" />{{ r.env.inlet }}℃</td>
                    <td class="cell"><SegBar :value="r.env.outlet" :max="70" :segments="10" />{{ r.env.outlet }}℃</td>
                    <td class="cell"><SegBar :value="r.env.cpu1" :max="100" :segments="10" />{{ r.env.cpu1 }}℃</td>
                    <td class="cell">
                      <span v-if="r.env.cpuCount === 1" class="single-psu" title="SNMP 识别为单路 CPU">单CPU</span>
                      <template v-else><SegBar :value="r.env.cpu2" :max="100" :segments="10" />{{ r.env.cpu2 }}℃</template>
                    </td>
                    <td class="cell"><SegBar :value="r.env.cpuUsage" :max="100" :segments="10" />{{ r.env.cpuUsage }}%</td>
                    <td class="cell"><SegBar :value="r.env.memUsage" :max="100" :segments="10" />{{ r.env.memUsage }}%</td>
                    <td class="cell">
                      <span v-if="r.env.psuCount === 0" class="single-psu" title="尚未通过 SNMP 采集电源信息">未采集</span>
                      <template v-else>
                        <span class="psu"><SegBar :value="r.env.psu1 === 'ok' ? 100 : 40" :max="100" :bands="bands(r.env.psu1 === 'ok')" :segments="8" />PS1</span>
                        <span v-if="r.env.psuCount > 1" class="psu"><SegBar :value="r.env.psu2 === 'ok' ? 100 : 40" :max="100" :bands="bands(r.env.psu2 === 'ok')" :segments="8" />PS2</span>
                        <span v-else class="single-psu">单电源</span>
                      </template>
                    </td>
                    <td class="cell"><SegBar :value="r.env.fan === 'ok' ? 100 : 40" :max="100" :bands="bands(r.env.fan === 'ok')" :segments="8" />{{ r.env.fan }}</td>
                    <td class="cell">
                      <SegBar :value="r.env.healthCritical ? 55 : 100" :max="100" :bands="bands(!r.env.healthCritical)" :segments="8" />
                      {{ r.env.healthCritical ? `critical (${r.env.healthCritical})` : `ok (${r.env.healthOk})` }}
                    </td>
                  </tr>
                </template>
              </tbody>
            </table>
            <p v-if="!detailGroups.length" class="empty">当前筛选条件下暂无设备</p>
          </div>
        </div>

        <div class="side-col">
          <div class="panel">
            <div class="panel-head"><b>温度 Top {{ hotTop.length }}</b><span>按 CPU 峰值排序</span></div>
            <div class="panel-body">
              <div v-for="(r, i) in hotTop" :key="`hot-${r.siteId}-${r.name}`" class="row-item">
                <span class="idx">{{ String(i + 1).padStart(2, '0') }}</span>
                <span class="nm">{{ r.name }}</span>
                <span class="loc">{{ r.siteName }} · {{ r.location }}</span>
                <span class="val" :class="tempClass(peakTemp(r))">{{ Math.max(r.env.cpu1, r.env.cpu2) }}<em>℃</em></span>
              </div>
              <p v-if="!hotTop.length" class="empty">暂无环境数据</p>
            </div>
          </div>

          <div class="panel">
            <div class="panel-head">
              <b>异常设备</b><span>{{ badList.length }} 台 · 电源 / 风扇 / 系统健康</span>
            </div>
            <div class="panel-body">
              <div v-for="r in badList" :key="`bad-${r.siteId}-${r.name}`" class="row-item">
                <span class="nm">{{ r.name }}</span>
                <span class="loc">{{ r.siteName }} · {{ r.location }}</span>
                <span class="badge danger">{{ badReason(r) }}</span>
              </div>
              <p v-if="!badList.length" class="empty">全部设备健康</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.dash {
  position: fixed; inset: 0; display: flex; flex-direction: column; overflow: hidden;
  background:
    radial-gradient(900px 520px at 92% -12%, rgba(189, 187, 255, 0.20), transparent 62%),
    radial-gradient(720px 500px at -6% 112%, rgba(239, 44, 193, 0.05), transparent 60%),
    #fbfbfd;
}

/* ---------- 顶部深色条 ---------- */
.head {
  flex: none; height: 62px; display: flex; align-items: center; gap: 16px;
  padding: 0 22px; background: #010120; color: #fff;
  box-shadow: 0 8px 24px -18px rgba(1, 1, 32, 0.8);
}
.brand { display: flex; align-items: center; gap: 9px; flex: none; }
.brand :deep(.app-logo) { color: #bdbbff; }
.brand :deep(.lg-ark), .brand :deep(.lg-node) { color: #ffffff; }
/* 深色页头需显式指定字色：theme.css 的全局 .brand 会把文字设成深色（浅色页头用） */
.wm { font-size: 17px; font-weight: 500; letter-spacing: -0.4px; color: #ffffff; }
.wm em { font-style: normal; color: #bdbbff; }
.head-title { display: flex; flex-direction: column; gap: 1px; padding-left: 16px; border-left: 1px solid rgba(255, 255, 255, 0.14); min-width: 0; }
.head-title b { font-size: 15px; font-weight: 500; letter-spacing: -0.2px; white-space: nowrap; }
.head-title span { font-size: 11px; color: rgba(255, 255, 255, 0.55); white-space: nowrap; }
.head-right { margin-left: auto; display: flex; align-items: center; gap: 12px; flex-wrap: wrap; justify-content: flex-end; }
.clock { font-family: var(--font-mono); font-size: 13px; color: #ffffff; font-variant-numeric: tabular-nums; letter-spacing: 0.5px; }
.refresh-at { font-size: 11px; color: rgba(255, 255, 255, 0.5); font-family: var(--font-mono); }
.auto { display: inline-flex; align-items: center; gap: 5px; font-size: 11.5px; color: rgba(255, 255, 255, 0.72); cursor: pointer; white-space: nowrap; }
.auto input { accent-color: #bdbbff; }
.hd-btn {
  border: 1px solid rgba(255, 255, 255, 0.18); background: transparent; color: rgba(255, 255, 255, 0.86);
  border-radius: 4px; padding: 5px 12px; font-size: 12px; cursor: pointer; white-space: nowrap;
  transition: all var(--tr); font-family: inherit;
}
.hd-btn:hover { background: rgba(255, 255, 255, 0.10); color: #fff; }
.hd-btn.primary { background: #ffffff; color: #010120; border-color: #ffffff; font-weight: 500; }
.hd-btn.primary:hover { background: #ecebff; }
.who { display: flex; align-items: center; gap: 6px; font-size: 12px; color: rgba(255, 255, 255, 0.82); white-space: nowrap; }
.who i { font-style: normal; font-size: 10px; padding: 1px 6px; border-radius: 3px; background: rgba(189, 187, 255, 0.22); color: #cdc9f5; }

/* ---------- 主体 ---------- */
.body { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 12px; padding: 14px 20px 16px; }

.kpis { flex: none; display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 10px; }
.kpi {
  background: #ffffff; border: 1px solid var(--line); border-radius: 8px; padding: 7px 12px;
  box-shadow: var(--shadow-1); display: flex; flex-direction: column; gap: 1px;
}
.kpi span { font-size: 10px; color: var(--text-faint); font-family: var(--font-mono); letter-spacing: 0.06em; text-transform: uppercase; white-space: nowrap; }
.kpi b { font-size: 23px; line-height: 1.1; font-weight: 500; letter-spacing: -0.8px; color: var(--text); font-variant-numeric: lining-nums tabular-nums; }
.kpi b em { font-style: normal; font-size: 13px; color: var(--text-faint); letter-spacing: -0.2px; margin: 0 1px; }
.kpi.bad b { color: var(--danger); }

.sites { flex: none; display: flex; flex-direction: column; gap: 8px; }
.low { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(0, 1.92fr) minmax(340px, 1fr); gap: 12px; }
.side-col { min-height: 0; display: flex; flex-direction: column; gap: 12px; }
.side-col .panel { flex: 1; min-height: 0; }

.block-head { flex: none; display: flex; align-items: baseline; gap: 8px; }
.block-head b { font-size: 13px; font-weight: 500; }
.block-head span { font-size: 11px; color: var(--text-faint); }

.site-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 400px));
  justify-content: start; gap: 10px;
  max-height: clamp(120px, 26vh, 300px); overflow-y: auto; padding-right: 2px;
}
.site-card {
  background: #ffffff; border: 1px solid var(--line); border-radius: 8px; padding: 11px 13px;
  box-shadow: var(--shadow-1); display: flex; flex-direction: column; gap: 7px;
}
.sc-top { display: flex; align-items: center; gap: 8px; }
.sc-top b { font-size: 13.5px; font-weight: 500; }
.sc-top .badge { margin-left: auto; }
.sc-top .mini { margin-left: 10px; }
.sc-nums { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 4px; }
.sc-nums div { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.sc-nums i { font-style: normal; font-size: 9.5px; color: var(--text-faint); white-space: nowrap; }
.sc-nums b { font-size: 16px; font-weight: 500; letter-spacing: -0.4px; font-variant-numeric: lining-nums tabular-nums; }
.sc-nums b em { font-style: normal; font-size: 9.5px; color: var(--text-faint); }
.sc-nums b.red { color: var(--danger); }
.sc-nums b.hot { color: var(--danger); }
.sc-nums b.warm { color: var(--orange); }
.sc-bar { display: flex; align-items: center; gap: 10px; }
.sc-bar .usage { flex: 1; height: 4px; border-radius: 3px; background: var(--bg-elevated); overflow: hidden; }
.sc-bar .usage i { display: block; height: 100%; background: var(--accent); }
.sc-bar span { font-size: 10.5px; color: var(--text-muted); font-variant-numeric: tabular-nums; white-space: nowrap; }
.sc-health { display: flex; align-items: center; gap: 10px; }
.sc-health .hbar { flex: 1; display: flex; height: 5px; border-radius: 3px; overflow: hidden; background: var(--bg-elevated); }
.sc-health .hbar .ok { background: #34c759; }
.sc-health .hbar .bad { background: #ff4d4f; }
.sc-health span { font-size: 10.5px; color: var(--text-faint); white-space: nowrap; }
.mini {
  border: 0; background: transparent; color: var(--accent); font-size: 11.5px; cursor: pointer;
  padding: 0; white-space: nowrap; font-family: inherit;
}
.mini:hover { text-decoration: underline; }

.panel {
  min-height: 0; display: flex; flex-direction: column;
  background: #ffffff; border: 1px solid var(--line); border-radius: 8px; box-shadow: var(--shadow-1);
}
.panel-head {
  flex: none; display: flex; align-items: center; gap: 10px; padding: 11px 14px;
  border-bottom: 1px solid var(--line);
}
.panel-head b { font-size: 13px; font-weight: 500; }
.panel-head span { font-size: 11px; color: var(--text-faint); }
.panel-body { flex: 1; min-height: 0; overflow: auto; padding: 6px 14px 10px; }

.row-item { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px solid var(--line); font-size: 12.5px; }
.row-item:last-child { border-bottom: 0; }
.idx { flex: none; width: 20px; font-family: var(--font-mono); font-size: 10.5px; color: var(--text-faint); }
.nm { flex: none; max-width: 34%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500; }
.loc { flex: 1; min-width: 0; color: var(--text-faint); font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.val { flex: none; font-variant-numeric: tabular-nums; color: var(--text-muted); }
.val em { font-style: normal; font-size: 10px; color: var(--text-faint); }
.val.hot { color: var(--danger); font-weight: 500; }
.val.warm { color: var(--orange); }

.filters { margin-left: auto; display: flex; align-items: center; gap: 8px; }
.filters .select { width: 140px; padding: 4px 8px; font-size: 12px; }
.filters .auto { color: var(--text-muted); }

.table-wrap { padding: 0; }
.dash-table { min-width: 1040px; font-size: 12px; }
.dash-table th {
  padding: 8px 10px; font-size: 10px;
  background: rgba(251, 251, 253, 0.96);
}
.dash-table td { padding: 7px 10px; }
.site-row td { background: var(--bg-elevated); font-size: 11.5px; color: var(--text-muted); padding: 6px 10px; }
.site-row b { color: var(--text); font-weight: 500; margin-right: 8px; }
.cell { white-space: nowrap; font-variant-numeric: tabular-nums; }
.cell :deep(.segbar) { margin-right: 6px; }
.psu { display: inline-flex; align-items: center; gap: 3px; margin-right: 8px; color: var(--text-muted); font-size: 10.5px; }
.single-psu { font-size: 10px; color: var(--text-faint); }

.empty { text-align: center; color: var(--text-faint); padding: 18px 0; font-size: 12px; }

/* ---------- 响应式 ---------- */
@media (max-width: 1680px) {
  .refresh-at { display: none; }
}
@media (max-width: 1400px) {
  .kpis { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .low { grid-template-columns: minmax(0, 1.5fr) minmax(300px, 1fr); }
  .head-title span { display: none; }
}
@media (max-width: 1100px) {
  .dash { overflow-y: auto; }
  .low { grid-template-columns: 1fr; flex: none; }
  .side-col { flex-direction: row; flex-wrap: wrap; }
  .side-col .panel { flex: 1 1 320px; }
  .panel { max-height: 52vh; }
}
@media (max-width: 760px) {
  .head { height: auto; flex-wrap: wrap; padding: 10px 14px; gap: 10px; }
  .head-right { width: 100%; flex-wrap: wrap; gap: 8px; }
  .kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .body { padding: 12px; }
  .sc-nums { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .site-grid { grid-template-columns: 1fr; max-height: none; }
  .side-col { flex-direction: column; }
}
</style>
