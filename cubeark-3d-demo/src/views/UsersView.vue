<script setup lang="ts">
// 用户管理（仅超级管理员）：三种角色账号的增删改与站点授权
import { computed, ref } from 'vue'
import ModalDialog from '../components/ModalDialog.vue'
import { getUsers, createUser, updateUser, deleteUser, getSites } from '../api/mock'
import { auth } from '../store/auth'
import type { AppUser, UserRole } from '../types'
import { ROLE_NAME } from '../types'

const tick = ref(0)
const rows = computed<AppUser[]>(() => { tick.value; return getUsers() })
const sites = computed(() => getSites())

const toast = ref('')
let toastTimer: number | undefined
function showToast(msg: string, isErr = false) {
  toast.value = msg
  window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => (toast.value = ''), 4000)
  const el = document.querySelector('.toast') as HTMLElement | null
  if (el) el.style.borderColor = isErr ? 'rgba(185, 28, 28, 0.5)' : 'rgba(21, 128, 61, 0.5)'
}

const showDlg = ref(false)
const editing = ref<AppUser | null>(null)
const form = ref({ username: '', name: '', role: 'user' as UserRole, password: '', siteIds: [] as number[] })
const err = ref('')

function openCreate() {
  editing.value = null
  form.value = { username: '', name: '', role: 'user', password: '', siteIds: [] }
  err.value = ''
  showDlg.value = true
}
function openEdit(u: AppUser) {
  editing.value = u
  form.value = { username: u.username, name: u.name, role: u.role, password: '', siteIds: [...u.siteIds] }
  err.value = ''
  showDlg.value = true
}
function toggleSite(id: number) {
  const ids = form.value.siteIds
  const i = ids.indexOf(id)
  if (i >= 0) ids.splice(i, 1)
  else ids.push(id)
}
function submit() {
  err.value = ''
  let res: { ok: boolean; error?: string }
  if (editing.value) {
    res = updateUser(editing.value.id, {
      name: form.value.name,
      role: form.value.role,
      siteIds: form.value.role === 'site_admin' ? form.value.siteIds : [],
      password: form.value.password || undefined
    })
  } else {
    res = createUser({
      username: form.value.username,
      password: form.value.password,
      name: form.value.name,
      role: form.value.role,
      siteIds: form.value.role === 'site_admin' ? form.value.siteIds : []
    })
  }
  if (!res.ok) { err.value = res.error!; return }
  showDlg.value = false
  tick.value++
  showToast(editing.value ? '用户已更新' : '用户已创建')
}
function remove(u: AppUser) {
  if (!window.confirm(`确认删除用户「${u.name}（${u.username}）」？`)) return
  const res = deleteUser(u.id)
  tick.value++
  showToast(res.ok ? `用户 ${u.name} 已删除` : res.error!, !res.ok)
}
function siteNames(u: AppUser) {
  if (u.role !== 'site_admin') return u.role === 'super' ? '全部站点' : '全局只读'
  return u.siteIds.map(id => sites.value.find(s => s.id === id)?.name ?? `#${id}`).join('、') || '未分配'
}
const roleBadge = (r: UserRole) => (r === 'super' ? 'ok' : r === 'site_admin' ? 'warn' : '')
</script>

<template>
  <div class="page">
    <div class="page-head page-narrow">
      <div>
        <h2>用户管理</h2>
        <p class="sub">超级管理员可全局管理；站点管理员仅能管理授权站点；普通用户全局只读（无编辑/删除权限）</p>
      </div>
      <button class="btn primary" @click="openCreate">＋ 新增用户</button>
    </div>

    <div class="card page-narrow" style="padding: 0; overflow: hidden">
      <div style="overflow-x: auto">
        <table class="table" style="min-width: 860px">
          <thead>
            <tr><th>用户名</th><th>姓名</th><th>角色</th><th>管辖范围</th><th>创建日期</th><th style="width: 160px">操作</th></tr>
          </thead>
          <tbody>
            <tr v-for="u in rows" :key="u.id">
              <td class="mono">{{ u.username }}<span v-if="u.id === auth.user?.id" class="badge" style="margin-left: 8px">当前登录</span></td>
              <td><b>{{ u.name }}</b></td>
              <td><span :class="['badge', roleBadge(u.role)]">{{ ROLE_NAME[u.role] }}</span></td>
              <td class="ell" :title="siteNames(u)">{{ siteNames(u) }}</td>
              <td>{{ u.createdAt }}</td>
              <td>
                <button class="btn sm" @click="openEdit(u)">编辑</button>
                <button class="btn danger sm" @click="remove(u)">删除</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <ModalDialog v-if="showDlg" :title="editing ? `编辑用户 · ${editing.name}` : '新增用户'" :width="560" @close="showDlg = false">
      <div class="form-row">
        <div class="field">
          <label>用户名 <b>*</b></label>
          <input v-model="form.username" class="input" maxlength="20" :disabled="!!editing" placeholder="3~20位字母/数字/下划线" />
        </div>
        <div class="field">
          <label>姓名 <b>*</b></label>
          <input v-model="form.name" class="input" maxlength="16" />
        </div>
      </div>
      <div class="form-row">
        <div class="field">
          <label>角色 <b>*</b></label>
          <select v-model="form.role" class="select">
            <option value="super">超级管理员（全局管理）</option>
            <option value="site_admin">站点管理员（管辖指定站点）</option>
            <option value="user">普通用户（全局只读）</option>
          </select>
        </div>
        <div class="field">
          <label>{{ editing ? '重置密码（留空不改）' : '密码 *' }}</label>
          <input v-model="form.password" class="input" type="password" autocomplete="new-password" :placeholder="editing ? '留空表示不修改' : '至少 6 位'" />
        </div>
      </div>
      <div class="field" v-if="form.role === 'site_admin'">
        <label>管辖站点 <b>*</b>（至少选择一个）</label>
        <div class="site-checks">
          <label v-for="s in sites" :key="s.id" class="site-check" :class="{ on: form.siteIds.includes(s.id) }">
            <input type="checkbox" :checked="form.siteIds.includes(s.id)" @change="toggleSite(s.id)" />
            {{ s.name }}
          </label>
        </div>
      </div>
      <p class="tip small">
        超级管理员：全部站点与模块、用户管理；站点管理员：仅授权站点的编辑操作；普通用户：可查看全部站点数据，但所有新增/编辑/删除/出入库操作被隐藏。
      </p>
      <p v-if="err" style="color: var(--danger); font-size: 12px">{{ err }}</p>
      <template #foot>
        <button class="btn" @click="showDlg = false">取消</button>
        <button class="btn primary" @click="submit">保存</button>
      </template>
    </ModalDialog>

    <div class="toast" v-if="toast">{{ toast }}</div>
  </div>
</template>

<style scoped>
.page-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
.page-head .sub { font-size: 12px; color: var(--text-faint); margin-top: 4px; }
.site-checks { display: flex; flex-wrap: wrap; gap: 8px; }
.site-check {
  display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--text-muted);
  border: 1px solid var(--line-strong); border-radius: var(--radius-sm); padding: 6px 12px; cursor: pointer;
  transition: all var(--tr);
}
.site-check.on { border-color: rgba(1, 1, 32, 0.45); background: var(--accent-deep); color: var(--accent); }
.site-check input { accent-color: var(--accent); }
</style>
