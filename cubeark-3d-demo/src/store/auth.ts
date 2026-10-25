import { reactive } from 'vue'
import type { AppUser } from '../types'
import { getSites, loginLocal } from '../api/mock'

// 会话状态：sessionStorage 持久化（刷新保持登录，关闭标签页即退出）
const KEY = 'cubeark_user'
function load(): AppUser | null {
  try {
    const raw = sessionStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as AppUser) : null
  } catch {
    return null
  }
}

export const auth = reactive<{ user: AppUser | null }>({ user: load() })

export function login(username: string, password: string) {
  const res = loginLocal(username, password)
  if (res.ok && res.user) {
    auth.user = res.user
    sessionStorage.setItem(KEY, JSON.stringify(res.user))
  }
  return res
}

export function logout() {
  auth.user = null
  sessionStorage.removeItem(KEY)
}

export const isSuper = () => auth.user?.role === 'super'
export const isSiteAdmin = () => auth.user?.role === 'site_admin'
// 普通用户全局只读：所有新增/编辑/删除/出入库等操作隐藏或禁用
export const canEdit = () => !!auth.user && auth.user.role !== 'user'

// 可见站点：超管/普通用户=全部；站点管理员=管辖站点
export function manageableSiteIds(): number[] {
  if (!auth.user) return []
  if (auth.user.role === 'site_admin') return auth.user.siteIds.slice()
  return getSites().map(s => s.id)
}
export function canManageSite(siteId: number): boolean {
  if (!auth.user) return false
  if (auth.user.role === 'site_admin') return auth.user.siteIds.includes(siteId)
  return true
}
