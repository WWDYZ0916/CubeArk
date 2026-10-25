<script setup lang="ts">
// 登录页（bare 路由）：演示账号本地校验，登录后按角色进入平台
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppLogo from '../components/AppLogo.vue'
import { login, manageableSiteIds } from '../store/auth'
import { appState } from '../store/app'
import { ROLE_NAME } from '../types'

const route = useRoute()
const router = useRouter()

const username = ref('')
const password = ref('')
const err = ref('')
const busy = ref(false)
const userRef = ref<HTMLInputElement>()

const DEMOS = [
  { u: 'admin', p: 'admin123', role: ROLE_NAME.super, desc: '全局管理 · 站点/用户/全部模块' },
  { u: 'siteadmin', p: 'site123', role: ROLE_NAME.site_admin, desc: '仅管辖「合肥一号站点」' },
  { u: 'viewer', p: 'view123', role: ROLE_NAME.user, desc: '全局只读 · 无编辑删除权限' }
]
const demoHint = computed(() => DEMOS)

function fill(d: (typeof DEMOS)[number]) {
  username.value = d.u
  password.value = d.p
  err.value = ''
}

function doLogin() {
  if (busy.value) return
  err.value = ''
  if (!username.value.trim() || !password.value) {
    err.value = '请输入用户名和密码'
    return
  }
  busy.value = true
  window.setTimeout(() => {
    const res = login(username.value, password.value)
    busy.value = false
    if (!res.ok || !res.user) {
      err.value = res.error ?? '登录失败'
      return
    }
    const ids = manageableSiteIds()
    if (ids.length && !ids.includes(appState.currentSiteId)) appState.currentSiteId = ids[0]
    const redirect = String(route.query.redirect ?? '')
    router.replace(redirect && redirect !== '/' ? redirect : '/landing')
  }, 260)
}

onMounted(() => userRef.value?.focus())
</script>

<template>
  <div class="login-page">
    <div class="login-shell">
      <aside class="brand-pane">
        <div class="brand-row">
          <AppLogo :size="34" />
          <span class="brand-name">Cube<em>Ark</em></span>
        </div>
        <h1>让每一台设备<br />都有迹可循。</h1>
        <p class="brand-sub">综合机房 &amp; 楼宇 IT 资产运维平台 · 3D 机房 / 资产台账 / 出入库 / 拓扑 / 楼层点位 / VLAN 规划</p>
        <div class="brand-stats">
          <div class="bs"><b>3D</b><span>机房可视化</span></div>
          <div class="bs"><b>5</b><span>运维阶段全覆盖</span></div>
          <div class="bs"><b>3</b><span>级角色权限</span></div>
        </div>
        <div class="brand-foot">CubeArk · 离线私有化部署 · RHEL 8.10</div>
      </aside>

      <main class="form-pane">
        <div class="form-card">
          <h2>登录平台</h2>
          <p class="form-sub">使用分配给你的账号登录，不同角色看到的功能不同</p>

          <form @submit.prevent="doLogin">
            <div class="field">
              <label>用户名</label>
              <input ref="userRef" v-model="username" class="input" placeholder="请输入用户名" autocomplete="username" />
            </div>
            <div class="field">
              <label>密码</label>
              <input v-model="password" class="input" type="password" placeholder="请输入密码" autocomplete="current-password" />
            </div>
            <p v-if="err" class="err">{{ err }}</p>
            <button type="submit" class="btn primary login-btn" :disabled="busy">{{ busy ? '登录中…' : '登 录' }}</button>
          </form>

          <div class="demo-box">
            <div class="demo-title">演示账号（点击自动填入）</div>
            <button v-for="d in demoHint" :key="d.u" class="demo-item" @click="fill(d)">
              <span class="demo-role">{{ d.role }}</span>
              <span class="demo-name">{{ d.u }} / {{ d.p }}</span>
              <span class="demo-desc">{{ d.desc }}</span>
            </button>
          </div>
        </div>
      </main>
    </div>
  </div>
</template>

<style scoped>
.login-page {
  min-height: 100vh;
  background:
    radial-gradient(720px 480px at 88% -10%, rgba(189, 187, 255, 0.18), transparent 60%),
    radial-gradient(620px 420px at -8% 110%, rgba(239, 44, 193, 0.05), transparent 60%),
    #ffffff;
  display: flex; align-items: center; justify-content: center;
  padding: 32px;
  overflow-y: auto;
}
.login-shell {
  width: min(1060px, 100%);
  display: grid; grid-template-columns: 1.08fr 0.92fr;
  background: #ffffff;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  box-shadow: 0 24px 70px -30px rgba(1, 1, 32, 0.25);
  overflow: hidden;
  min-height: 560px;
}
.brand-pane {
  background: #010120;
  color: #ffffff;
  padding: 44px 46px;
  display: flex; flex-direction: column;
  position: relative;
}
.brand-pane::after {
  content: ''; position: absolute; inset: 0; pointer-events: none;
  background:
    radial-gradient(420px 320px at 90% 0%, rgba(189, 187, 255, 0.22), transparent 60%),
    radial-gradient(360px 280px at 0% 100%, rgba(239, 44, 193, 0.14), transparent 60%);
}
.brand-row { display: flex; align-items: center; gap: 10px; position: relative; z-index: 1; }
.brand-name { font-size: 20px; font-weight: 600; letter-spacing: -0.02em; }
.brand-name em { font-style: normal; color: #bdbbff; }
.brand-pane h1 {
  margin-top: auto;
  font-size: clamp(30px, 3.2vw, 42px);
  line-height: 1.22; letter-spacing: -0.03em; font-weight: 600;
  position: relative; z-index: 1;
}
.brand-sub {
  margin-top: 14px; font-size: 13px; line-height: 1.8;
  color: rgba(255, 255, 255, 0.62); position: relative; z-index: 1;
}
.brand-stats { display: flex; gap: 10px; margin-top: 26px; position: relative; z-index: 1; }
.bs {
  flex: 1; padding: 12px 14px; border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.04); border-radius: var(--radius-sm);
  display: flex; flex-direction: column; gap: 4px;
}
.bs b { font-size: 20px; color: #bdbbff; font-variant-numeric: tabular-nums; }
.bs span { font-size: 11px; color: rgba(255, 255, 255, 0.55); }
.brand-foot { margin-top: 30px; font-size: 11px; color: rgba(255, 255, 255, 0.35); position: relative; z-index: 1; font-family: var(--font-mono); letter-spacing: 0.04em; }

.form-pane { padding: 40px 44px; display: flex; flex-direction: column; justify-content: center; }
.form-card h2 { font-size: 24px; letter-spacing: -0.02em; }
.form-sub { margin: 8px 0 22px; font-size: 12px; color: var(--text-faint); }
.form-card .field { margin-bottom: 14px; }
.form-card .field label { display: block; font-size: 12px; color: var(--text-muted); margin-bottom: 6px; }
.form-card .input { width: 100%; padding: 10px 12px; }
.err { color: var(--danger); font-size: 12px; margin-bottom: 10px; }
.login-btn { width: 100%; padding: 11px; margin-top: 4px; }

.demo-box { margin-top: 26px; border-top: 1px solid var(--line); padding-top: 16px; }
.demo-title { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-faint); font-family: var(--font-mono); margin-bottom: 8px; }
.demo-item {
  width: 100%; display: grid; grid-template-columns: auto 1fr; grid-template-rows: auto auto;
  column-gap: 10px; row-gap: 2px; text-align: left;
  background: transparent; border: 1px solid transparent; border-radius: var(--radius-sm);
  padding: 8px 10px; cursor: pointer; transition: all var(--tr); margin-bottom: 2px;
}
.demo-item:hover { background: var(--bg-elevated); border-color: var(--line); }
.demo-role { grid-row: 1 / 3; align-self: center; font-size: 11px; color: var(--accent); background: rgba(189, 187, 255, 0.28); border-radius: 3px; padding: 3px 8px; white-space: nowrap; }
.demo-name { font-size: 12px; font-family: var(--font-mono); color: var(--text); }
.demo-desc { font-size: 11px; color: var(--text-faint); }
.copy { margin-top: 22px; font-size: 12px; color: var(--text-faint); text-align: center; }
.copy .link { cursor: pointer; color: var(--accent); }

@media (max-width: 860px) {
  .login-shell { grid-template-columns: 1fr; }
  .brand-pane { display: none; }
  .form-pane { padding: 32px 26px; }
}
</style>
