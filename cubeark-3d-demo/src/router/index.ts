import { createRouter, createWebHashHistory } from 'vue-router'
import { auth, isSuper } from '../store/auth'

// hash 模式：nginx 静态托管无需额外 history 回退配置，离线部署更稳
const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: '/landing' },
    { path: '/landing', name: 'landing', component: () => import('../views/LandingView.vue'), meta: { bare: true } },
    { path: '/login', name: 'login', component: () => import('../views/LoginView.vue'), meta: { bare: true } },
    { path: '/sites', name: 'sites', component: () => import('../views/SitesView.vue') },
    { path: '/sites/:siteId/rooms', name: 'rooms', component: () => import('../views/RoomsView.vue') },
    { path: '/sites/:siteId/rooms/:roomId/3d', name: 'room3d', component: () => import('../views/Room3DView.vue') },
    // 阶段2~5 模块占位（侧边菜单统一承载）
    { path: '/sites/:siteId/assets', name: 'assets', component: () => import('../views/AssetsView.vue') },
    { path: '/sites/:siteId/devices', name: 'devices', component: () => import('../views/DevicesView.vue') },
    { path: '/sites/:siteId/repairs', name: 'repairs', component: () => import('../views/RepairsView.vue') },
    { path: '/sites/:siteId/infos', name: 'infos', component: () => import('../views/ITInfoView.vue') },
    { path: '/sites/:siteId/topology', name: 'topology', component: () => import('../views/TopologyView.vue') },
    { path: '/sites/:siteId/floors', name: 'floors', component: () => import('../views/FloorsView.vue') },
    { path: '/sites/:siteId/vlan', name: 'vlan', component: () => import('../views/VlanView.vue') },
    { path: '/users', name: 'users', component: () => import('../views/UsersView.vue') }
  ]
})

// 登录守卫：未登录 → /login；用户管理仅超管；站点管理员只能进管辖站点
router.beforeEach(to => {
  if (to.name === 'login') {
    return auth.user ? '/landing' : true
  }
  // 平台首页是大屏独立页（bare，不套壳层），但仍需登录
  if (to.name === 'landing' && !auth.user) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }
  if (to.meta.bare) return true
  if (!auth.user) return { name: 'login', query: { redirect: to.fullPath } }
  if (to.name === 'users' && !isSuper()) return '/sites'
  const siteId = Number(to.params.siteId ?? 0)
  if (siteId && auth.user.role === 'site_admin' && !auth.user.siteIds.includes(siteId)) {
    const first = auth.user.siteIds[0]
    if (!first) return '/sites'
    return to.fullPath.replace(`/sites/${siteId}`, `/sites/${first}`)
  }
  return true
})

export default router
