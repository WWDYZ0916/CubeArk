<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import SiteFormDialog from '../components/SiteFormDialog.vue'
import SegBar from '../components/SegBar.vue'
import { getSites, deleteSite, siteStats, getRooms, getAllSiteEnvRows, getSiteEnvRows } from '../api/mock'
import { appState } from '../store/app'
import { canEdit, isSuper, manageableSiteIds } from '../store/auth'
import type { Site, SiteEnvRow } from '../types'
import { CAT_NAME, DEVICE_GROUP, DEVICE_GROUPS } from '../types'

const router = useRouter()
const route = useRoute()
const tick = ref(0)
const siteList = computed<Site[]>(() => {
  tick.value
  const ids = manageableSiteIds()
  return getSites().filter(s => ids.includes(s.id))
})
const dialogSite = ref<Site | null>(null)
const showDialog = ref(false)

const envBoardRef = ref<HTMLElement>()
onMounted(() => {
  if (!manageableSiteIds().includes(appState.currentSiteId)) {
    appState.currentSiteId = manageableSiteIds()[0] ?? appState.currentSiteId
  }
  if (route.query.focus === 'env') {
    nextTick(() => envBoardRef.value?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }
})

const toast = ref('')
let toastTimer: number | undefined
function showToast(msg: string, isErr = false) {
  toast.value = msg
  window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => (toast.value = ''), 4000)
  const el = document.querySelector('.toast') as HTMLElement | null
  if (el) el.style.borderColor = isErr ? 'rgba(185, 28, 28, 0.5)' : 'rgba(21, 128, 61, 0.5)'
}

function usageBadge(pct: number) {
  return pct >= 85 ? 'orange' : pct >= 60 ? 'warn' : 'ok'
}

function openCreate() {
  dialogSite.value = null
  showDialog.value = true
}
function openEdit(s: Site) {
  dialogSite.value = s
  showDialog.value = true
}
function removeSite(s: Site) {
  if (!window.confirm(`确认删除站点「${s.name}」？`)) return
  const res = deleteSite(s.id)
  if (!res.ok) {
    showToast(res.error!, true)
    return
  }
  if (appState.currentSiteId === s.id) appState.currentSiteId = getSites()[0]?.id ?? 1
  tick.value++
  showToast(`站点 ${s.name} 已删除`)
}
function enter(s: Site) {
  appState.currentSiteId = s.id
  router.push(`/sites/${s.id}/rooms`)
}
function onSaved() {
  tick.value++
  showToast('站点已保存')
}

// ---- 站点设备环境总览（交换机/服务器温度·电源·风扇，SNMP采集演示数据） ----
const envSalt = ref(0)
const envSiteId = ref(0)
const envRows = computed(() => {
  tick.value
  envSalt.value
  const ids = manageableSiteIds()
  if (envSiteId.value && ids.includes(envSiteId.value)) return getSiteEnvRows(envSiteId.value, envSalt.value)
  return getAllSiteEnvRows(envSalt.value).filter(r => ids.includes(r.siteId))
})
function refreshEnv() {
  envSalt.value++
  showToast('环境数据已刷新（演示数据）')
}
const OK_BANDS: Array<[number, string]> = [[100, '#34c759']]
const BAD_BANDS: Array<[number, string]> = [[45, '#f5a623'], [100, '#ff4d4f']]
const statusBands = (ok: boolean) => (ok ? OK_BANDS : BAD_BANDS)

// 二级分组：网络设备 / 服务器设备 / 存储设备 / 其他设备
const envGroup = ref('')
const envGroups = computed(() => {
  const map = new Map<string, SiteEnvRow[]>()
  for (const r of envRows.value) {
    const g = DEVICE_GROUP[r.category] ?? '其他设备'
    if (envGroup.value && envGroup.value !== g) continue
    if (!map.has(g)) map.set(g, [])
    map.get(g)!.push(r)
  }
  return DEVICE_GROUPS.filter(g => map.has(g)).map(name => ({ name, rows: map.get(name)! }))
})
</script>

<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h2>站点管理</h2>
        <p class="sub">多站点机房资产统一管理 · 站点 → 机房 → 机柜 → U位资产</p>
      </div>
      <button v-if="isSuper()" class="btn primary" @click="openCreate">＋ 新增站点</button>
    </div>

    <div class="grid">
      <div v-for="s in siteList" :key="s.id" class="card hoverable site-card">
        <div class="card-title">
          {{ s.name }}
          <span v-if="s.remark" class="badge">{{ s.remark }}</span>
        </div>
        <div class="row-line"><span>地址</span><b>{{ s.address || '-' }}</b></div>
        <div class="row-line"><span>负责人</span><b>{{ s.owner || '-' }}</b></div>
        <div class="row-line">
          <span>机房 {{ siteStats(s.id).roomCount }} 个 · 机柜 {{ siteStats(s.id).rackCount }} 台</span>
        </div>
        <div class="row-line">
          <span :class="['badge', usageBadge(siteStats(s.id).usagePct)]">U位使用率 {{ siteStats(s.id).usagePct }}%</span>
          <span v-if="siteStats(s.id).alarmRacks" class="badge danger">告警机柜 {{ siteStats(s.id).alarmRacks }}</span>
          <span v-else class="badge ok">无告警</span>
        </div>
        <div class="actions">
          <button class="btn primary sm" @click="enter(s)">进入机房（{{ getRooms(s.id).length }}）</button>
          <button v-if="canEdit()" class="btn sm" @click="openEdit(s)">编辑</button>
          <button v-if="isSuper()" class="btn danger sm" @click="removeSite(s)">删除</button>
        </div>
      </div>
    </div>
    <p v-if="!siteList.length" class="empty">暂无站点，点击右上角「新增站点」创建</p>

    <!-- 站点设备环境总览：各站点交换机/服务器的温度·电源·风扇状态（SNMP采集演示） -->
    <div ref="envBoardRef" class="card env-board">
      <div class="env-head">
        <div class="env-title">站点设备环境总览 <span class="env-sub">网络设备 / 服务器设备 / 存储设备</span></div>
        <div class="env-actions">
          <select v-model.number="envSiteId" class="select env-site-select">
            <option :value="0">全部站点</option>
            <option v-for="s in siteList" :key="s.id" :value="s.id">{{ s.name }}</option>
          </select>
          <select v-model="envGroup" class="select env-site-select" style="width: 128px">
            <option value="">全部大类</option>
            <option v-for="g in DEVICE_GROUPS" :key="g" :value="g">{{ g }}</option>
          </select>
          <button class="btn sm ghost" @click="refreshEnv">刷新数据</button>
        </div>
      </div>
      <p class="tip small">
        温度/电源/风扇经设备管理IP SNMP 采集（设备详情 → SNMP设置 配置版本与密码后测试）；当前为演示数据，点击刷新数值小幅波动。
      </p>
      <div class="env-wrap">
        <table class="table env-table">
          <thead>
            <tr>
              <th>站点</th><th>设备</th>
              <th>进风温度</th><th>排风温度</th><th>CPU1温度</th><th>CPU2温度</th>
              <th>CPU使用率</th><th>内存使用率</th><th>电源</th><th>风扇</th><th>系统健康</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="g in envGroups" :key="g.name">
              <tr class="env-group-row">
                <td :colspan="11"><b>{{ g.name }}</b>{{ g.rows.length }} 台设备</td>
              </tr>
              <tr v-for="(r, i) in g.rows" :key="`${r.siteId}-${r.name}-${i}`">
                <td style="white-space: nowrap">{{ r.siteName }}</td>
                <td style="white-space: nowrap" :title="`${CAT_NAME[r.category] ?? '其他'} · ${r.location} · ${r.ip}`"><b>{{ r.name }}</b></td>
                <td class="env-cell"><SegBar :value="r.env.inlet" :max="60"  :segments="12" /><span>{{ r.env.inlet }}℃</span></td>
                <td class="env-cell"><SegBar :value="r.env.outlet" :max="70"  :segments="12" /><span>{{ r.env.outlet }}℃</span></td>
                <td class="env-cell"><SegBar :value="r.env.cpu1" :max="100"  :segments="12" /><span>{{ r.env.cpu1 }}℃</span></td>
                <td class="env-cell">
                  <em v-if="r.env.cpuCount === 1" class="single-psu" title="SNMP 识别为单路 CPU">单CPU</em>
                  <template v-else><SegBar :value="r.env.cpu2" :max="100"  :segments="12" /><span>{{ r.env.cpu2 }}℃</span></template>
                </td>
                <td class="env-cell"><SegBar :value="r.env.cpuUsage" :max="100"  :segments="12" /><span>{{ r.env.cpuUsage }}%</span></td>
                <td class="env-cell"><SegBar :value="r.env.memUsage" :max="100"  :segments="12" /><span>{{ r.env.memUsage }}%</span></td>
                <td class="env-cell">
                  <em v-if="r.env.psuCount === 0" class="single-psu" title="尚未通过 SNMP 采集电源信息">未采集</em>
                  <template v-else>
                    <span class="psu-pair"><SegBar :value="r.env.psu1 === 'ok' ? 100 : 40" :max="100" :bands="statusBands(r.env.psu1 === 'ok')"  :segments="12" /><em>PS1 {{ r.env.psu1 === 'ok' ? 'ok' : 'fail' }}</em></span>
                    <span v-if="r.env.psuCount > 1" class="psu-pair"><SegBar :value="r.env.psu2 === 'ok' ? 100 : 40" :max="100" :bands="statusBands(r.env.psu2 === 'ok')"  :segments="12" /><em>PS2 {{ r.env.psu2 === 'ok' ? 'ok' : 'fail' }}</em></span>
                    <em v-else class="single-psu">单电源</em>
                  </template>
                </td>
                <td class="env-cell"><SegBar :value="r.env.fan === 'ok' ? 100 : 40" :max="100" :bands="statusBands(r.env.fan === 'ok')"  :segments="12" /><span>{{ r.env.fan === 'ok' ? 'ok' : 'fail' }}</span></td>
                <td class="env-cell">
                  <SegBar :value="r.env.healthCritical ? 55 : 100" :max="100" :bands="statusBands(!r.env.healthCritical)"  :segments="12" />
                  <span>{{ r.env.healthCritical ? `critical (${r.env.healthCritical})` : `ok (${r.env.healthOk})` }}</span>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
        <p v-if="!envRows.length" class="empty">暂无交换机/服务器/存储等在用设备</p>
        <p v-else-if="!envGroups.length" class="empty">当前大类下暂无设备</p>
      </div>
    </div>

    <SiteFormDialog v-if="showDialog" :site="dialogSite" @close="showDialog = false" @saved="onSaved" />
    <div class="toast" v-if="toast">{{ toast }}</div>
  </div>
</template>

<style scoped>
.page-head {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 18px;
}
.page-head h2 { font-size: 19px; letter-spacing: 1px; }
.page-head .sub { font-size: 12px; color: var(--text-faint); margin-top: 4px; }
.site-card .row-line span { color: var(--text-faint); }

/* 站点设备环境总览 */
.env-board { margin-top: 16px; }
.env-head { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; }
.env-title { font-size: 14px; font-weight: 500; color: var(--text); }
.env-sub { font-size: 11px; color: var(--text-faint); font-weight: 400; margin-left: 6px; }
.env-actions { margin-left: auto; display: flex; gap: 8px; align-items: center; }
.env-site-select { width: 170px; padding: 4px 8px; }
.env-wrap { overflow: auto; max-height: 440px; }
.env-table { min-width: 1180px; }
.env-table th, .env-table td { padding-left: 9px; padding-right: 9px; }
.env-table th { white-space: nowrap; }
.env-cell { white-space: nowrap; font-variant-numeric: tabular-nums; }
.env-cell span { margin-left: 7px; font-size: 12px; color: var(--text-muted); }
.psu-pair { display: inline-flex; align-items: center; gap: 4px; margin-right: 10px; }
.psu-pair:last-child { margin-right: 0; }
.psu-pair em { font-style: normal; font-size: 11px; color: var(--text-muted); }
.single-psu { font-style: normal; font-size: 10.5px; color: var(--text-faint); }
.env-group-row td {
  background: var(--bg-elevated);
  font-size: 12px; color: var(--text-muted);
  padding-top: 7px; padding-bottom: 7px;
}
.env-group-row b { color: var(--text); font-weight: 600; margin-right: 8px; }
</style>
