<script setup lang="ts">
// 全局布局壳：玻璃顶栏（品牌Logo + 菜单快搜 + 站点切换 + 用户栏）+ 侧边菜单 + 路由内容区
// 3D 机房页面在 /sites/:siteId/rooms/:roomId/3d 路由内，与本壳解耦
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import SiteSwitcher from './components/SiteSwitcher.vue'
import AppLogo from './components/AppLogo.vue'
import ModalDialog from './components/ModalDialog.vue'
import { appState } from './store/app'
import { auth, logout, isSuper } from './store/auth'
import { getSiteById, changePassword, clearAllData } from './api/mock'
import { ROLE_NAME } from './types'

const route = useRoute()
const router = useRouter()

const siteName = computed(() => getSiteById(appState.currentSiteId)?.name ?? '未选择')
const sid = computed(() => appState.currentSiteId)

// ---- 导航（扁平二级：分组 → 模块） ----
type NavItem = { label: string; to: string; match: string }
type NavGroup = { group: string; items: NavItem[] }

const menu = computed<NavGroup[]>(() => {
  const groups: NavGroup[] = [
    { group: '总览', items: [
      { label: '平台首页', to: '/landing', match: '/landing' },
      { label: '站点管理', to: '/sites', match: '/sites' }
    ] },
    { group: `站点工作区 · ${siteName.value}`, items: [
      { label: '机房管理', to: `/sites/${sid.value}/rooms`, match: '/rooms' },
      { label: '资产出入库', to: `/sites/${sid.value}/assets`, match: '/assets' },
      { label: '设备台账', to: `/sites/${sid.value}/devices`, match: '/devices' },
      { label: '硬件维修记录', to: `/sites/${sid.value}/repairs`, match: '/repairs' },
      { label: 'IT信息统计', to: `/sites/${sid.value}/infos`, match: '/infos' },
      { label: '网络拓扑', to: `/sites/${sid.value}/topology`, match: '/topology' },
      { label: '楼层点位', to: `/sites/${sid.value}/floors`, match: '/floors' },
      { label: 'VLAN规划', to: `/sites/${sid.value}/vlan`, match: '/vlan' }
    ] }
  ]
  if (isSuper()) {
    groups.push({ group: '系统管理', items: [{ label: '用户管理', to: '/users', match: '/users' }] })
  }
  return groups
})
const activeMatch = (prefix: string) => route.path.startsWith(prefix)

// ---- 用户胶囊 / 退出登录 / 修改密码 ----
const userOpen = ref(false)
const userWrapRef = ref<HTMLElement>()
const roleLabel = computed(() => (auth.user ? ROLE_NAME[auth.user.role] : ''))
const appToast = ref('')
let appToastTimer: number | undefined
function showAppToast(msg: string) {
  appToast.value = msg
  window.clearTimeout(appToastTimer)
  appToastTimer = window.setTimeout(() => (appToast.value = ''), 3500)
}
function doClearAll() {
  userOpen.value = false
  if (!window.confirm('将清空本机保存的全部业务数据（站点/机房/机柜/设备/资产/点位/维修记录等），登录账号保留。此操作不可撤销，确认继续？')) return
  clearAllData()
}
function doLogout() {
  userOpen.value = false
  logout()
  router.replace('/login')
}

const pwdOpen = ref(false)
const pwdForm = ref({ old: '', next: '', confirm: '' })
const pwdErr = ref('')
function openPwd() {
  userOpen.value = false
  pwdForm.value = { old: '', next: '', confirm: '' }
  pwdErr.value = ''
  pwdOpen.value = true
}
function submitPwd() {
  pwdErr.value = ''
  if (!auth.user) return
  const f = pwdForm.value
  if (!f.old) { pwdErr.value = '请输入当前密码'; return }
  if (!f.next || f.next.length < 6) { pwdErr.value = '新密码至少 6 位'; return }
  if (f.next !== f.confirm) { pwdErr.value = '两次输入的新密码不一致'; return }
  const res = changePassword(auth.user.id, f.old, f.next)
  if (!res.ok) { pwdErr.value = res.error!; return }
  auth.user.password = f.next
  sessionStorage.setItem('cubeark_user', JSON.stringify(auth.user))
  pwdOpen.value = false
  showAppToast('密码修改成功，下次登录请使用新密码')
}

// 点击胶囊外部时收起下拉
function onDocClick(e: MouseEvent) {
  if (userOpen.value && userWrapRef.value && !userWrapRef.value.contains(e.target as Node)) {
    userOpen.value = false
  }
}
onMounted(() => document.addEventListener('click', onDocClick))
onBeforeUnmount(() => document.removeEventListener('click', onDocClick))

// ---- 顶部菜单快搜（仅导航壳层：过滤菜单项并跳转） ----
const keyword = ref('')
const showDrop = ref(false)
const hits = computed(() => {
  const k = keyword.value.trim().toLowerCase()
  if (!k) return []
  const out: Array<{ label: string; to: string; group: string }> = []
  for (const g of menu.value) {
    for (const it of g.items) {
      if (it.label.toLowerCase().includes(k)) out.push({ label: it.label, to: it.to, group: g.group.split(' · ')[0] })
    }
  }
  return out.slice(0, 8)
})
function jump(to: string) {
  keyword.value = ''
  showDrop.value = false
  router.push(to)
}
function onSearchBlur() {
  window.setTimeout(() => (showDrop.value = false), 180)
}
</script>

<template>
  <!-- bare 路由（如 /landing 落地页）不套深色运维壳，整屏独立 -->
  <router-view v-if="route.meta.bare" />
  <div v-else class="layout">
    <header class="topbar">
      <div class="brand">
        <AppLogo :size="27" />
        Cube<em>Ark</em>
        <small>综合机房&楼宇IT资产运维平台</small>
      </div>

      <div class="top-search">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
          <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
        </svg>
        <input
          v-model="keyword" class="input" placeholder="快速跳转模块…"
          @focus="showDrop = true" @blur="onSearchBlur" @keydown.escape="showDrop = false"
        />
        <div v-if="showDrop && hits.length" class="search-drop">
          <div class="sd-group">匹配模块</div>
          <div v-for="h in hits" :key="h.to + h.label" class="sd-item" @mousedown.prevent="jump(h.to)">
            <span class="sd-dot"></span>{{ h.label }}<span style="margin-left:auto; font-size:11px; color: var(--text-faint)">{{ h.group }}</span>
          </div>
        </div>
        <div v-else-if="showDrop && keyword.trim()" class="search-drop">
          <div class="sd-item" style="cursor: default">无匹配模块</div>
        </div>
      </div>

      <SiteSwitcher />

      <div ref="userWrapRef" class="top-user-wrap">
        <div class="top-user" :title="`${auth.user?.name ?? ''} · ${roleLabel}`" @click="userOpen = !userOpen">
          <span class="avatar">{{ (auth.user?.name ?? '?').slice(0, 1) }}</span>
          <span class="uname">{{ auth.user?.name }}</span>
          <span class="role-tag">{{ roleLabel }}</span>
          <svg class="caret" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="m6 9 6 6 6-6"/></svg>
        </div>
        <div v-if="userOpen" class="user-drop">
          <div class="ud-info">
            <b>{{ auth.user?.username }}</b>
            <span>{{ roleLabel }}</span>
          </div>
          <div class="ud-item" @click="openPwd">修改密码</div>
          <div class="ud-item" @click="doClearAll">清空所有数据</div>
          <div class="ud-item danger" @click="doLogout">退出登录</div>
        </div>
      </div>
    </header>

    <div class="body-row">
      <aside class="sidebar">
        <div v-for="g in menu" :key="g.group" class="menu-group">
          <h4>{{ g.group }}</h4>
          <a
            v-for="it in g.items" :key="it.label"
            class="menu-item" :class="{ active: activeMatch(it.match) }"
            @click="router.push(it.to)"
          >{{ it.label }}</a>
        </div>
      </aside>

      <main class="content">
        <router-view />
      </main>
    </div>

    <!-- 修改密码 -->
    <ModalDialog v-if="pwdOpen" title="修改密码" :width="420" @close="pwdOpen = false">
      <div class="field">
        <label>当前密码 <b>*</b></label>
        <input v-model="pwdForm.old" type="password" class="input" autocomplete="current-password" />
      </div>
      <div class="field">
        <label>新密码 <b>*</b></label>
        <input v-model="pwdForm.next" type="password" class="input" autocomplete="new-password" placeholder="至少 6 位" />
      </div>
      <div class="field">
        <label>确认新密码 <b>*</b></label>
        <input v-model="pwdForm.confirm" type="password" class="input" autocomplete="new-password" @keydown.enter="submitPwd" />
      </div>
      <p v-if="pwdErr" style="color: var(--danger); font-size: 12px">{{ pwdErr }}</p>
      <template #foot>
        <button class="btn" @click="pwdOpen = false">取消</button>
        <button class="btn primary" @click="submitPwd">确认修改</button>
      </template>
    </ModalDialog>

    <div class="toast" v-if="appToast">{{ appToast }}</div>
  </div>
</template>

<style scoped>
.sd-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--accent); box-shadow: 0 0 7px var(--accent); flex: none; }
.top-user-wrap { position: relative; }
.top-user { cursor: pointer; }
.top-user:hover { border-color: rgba(1, 1, 32, 0.28); }
.caret { color: var(--text-faint); flex: none; }
.role-tag {
  font-size: 10px; color: var(--accent); background: rgba(189, 187, 255, 0.28);
  border-radius: 3px; padding: 2px 7px; white-space: nowrap;
}
.uname { max-width: 110px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.user-drop {
  position: absolute; right: 0; top: calc(100% + 8px); width: 190px; z-index: 220;
  background: #ffffff; border: 1px solid var(--line-strong); border-radius: var(--radius-sm);
  box-shadow: var(--shadow-2, 0 18px 40px -18px rgba(1, 1, 32, 0.35)); overflow: hidden;
}
.ud-info { padding: 10px 12px 8px; border-bottom: 1px solid var(--line); display: flex; flex-direction: column; gap: 2px; }
.ud-info b { font-size: 13px; }
.ud-info span { font-size: 11px; color: var(--text-faint); }
.ud-item { padding: 9px 12px; font-size: 13px; cursor: pointer; transition: background var(--tr); }
.ud-item:hover { background: var(--bg-elevated); }
.ud-item.danger { color: var(--danger); }
</style>
