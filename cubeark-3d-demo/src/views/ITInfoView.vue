<script setup lang="ts">
// IT信息统计（通用信息表）：一个站点多张表（服务器账号/交换机/监控/无线AP/显示器/电脑等）
// 列抬头可自定义（9列），分组可预设/重命名；Excel列位映射：A名称 B IP C用户名 D密码 E远程方式 F网址/备注 G序列号
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import * as XLSX from 'xlsx'
import ModalDialog from '../components/ModalDialog.vue'
import {
  getSiteById, getAccountTables, createAccountTable, renameAccountTable, deleteAccountTable,
  importAccountTables, getServerAccounts, accountGroups, accountGroupOptions,
  saveServerAccount, deleteServerAccount, saveTableColumns, saveTablePresets, renameAccountGroup
} from '../api/mock'
import { downloadCsv, stampName } from '../utils/export'
import { canEdit } from '../store/auth'
import type { ServerAccount } from '../types'
import { ACCOUNT_HEADERS } from '../types'

const route = useRoute()
const router = useRouter()
const siteId = computed(() => Number(route.params.siteId))
const siteName = computed(() => getSiteById(siteId.value)?.name ?? '-')

const tick = ref(0)
const keyword = ref('')
const fGroup = ref('')
const showPwd = ref(false)

// ---- 多表管理 ----
const tables = computed(() => { tick.value; return getAccountTables(siteId.value) })
const curTableId = ref(0)
const curTable = computed(() => tables.value.find(t => t.id === curTableId.value) ?? null)
watch(tables, list => {
  if (!list.some(t => t.id === curTableId.value)) {
    curTableId.value = list[0]?.id ?? 0
    fGroup.value = ''
  }
}, { immediate: true })

const rows = computed<ServerAccount[]>(() => {
  tick.value
  if (!curTableId.value) return []
  return getServerAccounts(siteId.value, curTableId.value, { keyword: keyword.value || undefined, group: fGroup.value || undefined })
})
const groups = computed<string[]>(() => { tick.value; return curTableId.value ? accountGroups(siteId.value, curTableId.value) : [] })
// 分组下拉选项 = 预设分组 + 实际行分组
const groupOpts = computed<string[]>(() => { tick.value; return curTableId.value ? accountGroupOptions(siteId.value, curTableId.value) : [] })
// 当前列抬头（9列，可自定义）
const headers = computed<string[]>(() => {
  tick.value
  const c = curTable.value?.columns
  return c && c.length === 9 ? c : [...ACCOUNT_HEADERS]
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

// ---- 表 新建/重命名/删除 ----
const showTableDlg = ref(false)
const tableDlgMode = ref<'new' | 'rename'>('new')
const tableDlgName = ref('')
const tableDlgErr = ref('')
function openTableNew() {
  tableDlgMode.value = 'new'
  tableDlgName.value = ''
  tableDlgErr.value = ''
  showTableDlg.value = true
}
function openTableRename() {
  if (!curTable.value) return
  tableDlgMode.value = 'rename'
  tableDlgName.value = curTable.value.name
  tableDlgErr.value = ''
  showTableDlg.value = true
}
function submitTableDlg() {
  if (tableDlgMode.value === 'new') {
    const res = createAccountTable(siteId.value, tableDlgName.value)
    if (!res.ok) { tableDlgErr.value = res.error!; return }
    if (res.table) curTableId.value = res.table.id
  } else {
    const res = renameAccountTable(siteId.value, curTableId.value, tableDlgName.value)
    if (!res.ok) { tableDlgErr.value = res.error!; return }
  }
  tick.value++
  showTableDlg.value = false
  showToast(tableDlgMode.value === 'new' ? '新表已创建' : '表已重命名')
}
function removeTable() {
  if (!curTable.value) return
  if (!window.confirm(`确认删除表「${curTable.value.name}」及其 ${curTable.value.rows.length} 条记录？`)) return
  deleteAccountTable(siteId.value, curTableId.value)
  tick.value++
  showToast('表已删除')
}

// ---- 编辑弹窗 ----
const showDialog = ref(false)
const editing = ref<ServerAccount | null>(null)
const form = ref(emptyForm())
const err = ref('')
function emptyForm() {
  return { group: '', server: '', ip: '', username: '', password: '', remoteType: '远程桌面', url: '', sn: '', remark: '' }
}
function openCreate() {
  editing.value = null
  form.value = { ...emptyForm(), group: fGroup.value || '' }
  err.value = ''
  showDialog.value = true
}
function openEdit(r: ServerAccount) {
  editing.value = r
  form.value = { group: r.group, server: r.server, ip: r.ip, username: r.username, password: r.password, remoteType: r.remoteType, url: r.url, sn: r.sn, remark: r.remark }
  err.value = ''
  showDialog.value = true
}
function submit() {
  const res = saveServerAccount(siteId.value, curTableId.value, { id: editing.value?.id, ...form.value })
  if (!res.ok) { err.value = res.error!; return }
  tick.value++
  showDialog.value = false
  showToast(editing.value ? '已更新' : '已新增')
}
function remove(r: ServerAccount) {
  if (!window.confirm(`确认删除「${r.server}」（${r.ip}）？`)) return
  deleteServerAccount(siteId.value, curTableId.value, r.id)
  tick.value++
}

// ---- 远程连接 ----
function connect(r: ServerAccount) {
  const t = r.remoteType.toLowerCase()
  if (t.includes('web') && r.url) { window.open(r.url, '_blank'); return }
  if (t.includes('ssh')) { window.open(`ssh://${r.username ? r.username + '@' : ''}${r.ip}`, '_blank'); return }
  if (t.includes('远程桌面') || t.includes('rdp')) {
    window.navigator.clipboard?.writeText(r.ip).catch(() => {})
    showToast(`远程桌面需本地客户端：IP ${r.ip} 已复制，请用 mstsc / 远程桌面工具连接`)
    return
  }
  if (r.url) { window.open(r.url, '_blank'); return }
  showToast('未配置网址，无法直接打开')
}

// ---- Excel 导入（多Sheet：每个Sheet识别为一张表，Sheet名=表名；同名表追加） ----
const showImport = ref(false)
const importing = ref(false)
const previewTables = ref<Array<{ name: string; rows: Array<Omit<ServerAccount, 'id'>> }>>([])
const importErr = ref('')
const fileRef = ref<HTMLInputElement>()

function parseSheet(grid: string[][]): Array<Omit<ServerAccount, 'id'>> {
  const ipRe = /\d{1,3}(\.\d{1,3}){3}/
  let group = '导入数据'
  const out: Array<Omit<ServerAccount, 'id'>> = []
  for (const row of grid) {
    const a = String(row[0] ?? '').trim()
    const b = String(row[1] ?? '').trim()
    if (!a && !b) continue
    if (a === '服务器' || b === 'IP') continue
    if (a && !ipRe.test(b) && !b) {
      if (a.length <= 20) group = a
      continue
    }
    if (a && ipRe.test(b)) {
      const f = String(row[5] ?? '').trim()
      const isUrl = /^https?:\/\//i.test(f)
      out.push({
        group, server: a, ip: b,
        username: String(row[2] ?? '').trim(),
        password: String(row[3] ?? '').trim(),
        remoteType: String(row[4] ?? '').trim() || '其他',
        url: isUrl ? f : '',
        sn: String(row[6] ?? '').trim(),
        remark: isUrl ? '' : f
      })
    }
  }
  return out
}
async function onPickFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  importErr.value = ''
  previewTables.value = []
  try {
    const buf = await file.arrayBuffer()
    const wb = XLSX.read(buf, { type: 'array' })
    const out: Array<{ name: string; rows: Array<Omit<ServerAccount, 'id'>> }> = []
    for (const sn of wb.SheetNames) {
      const grid = XLSX.utils.sheet_to_json<string[]>(wb.Sheets[sn], { header: 1, raw: false, defval: '' })
      const rows = parseSheet(grid)
      if (rows.length) {
        const name = sn.replace(/[\\/:*?"<>|]/g, '_').trim().slice(0, 32) || `表${out.length + 1}`
        out.push({ name, rows })
      }
    }
    if (!out.length) importErr.value = '未识别到数据行：需要 A列=服务器名、B列=IP（可先在Excel中整理为该列序）'
    previewTables.value = out
  } catch (ex: unknown) {
    importErr.value = `解析失败：${ex instanceof Error ? ex.message : String(ex)}`
  } finally {
    if (fileRef.value) fileRef.value.value = ''
  }
}
function confirmImport() {
  importing.value = true
  const n = importAccountTables(siteId.value, previewTables.value)
  importing.value = false
  showImport.value = false
  previewTables.value = []
  tick.value++
  showToast(`已导入 ${n} 条账号（同名表自动合并）`)
}

// ---- 列名设置（当前表9列抬头自定义） ----
const showCols = ref(false)
const colsForm = ref<string[]>([...ACCOUNT_HEADERS])
const colsErr = ref('')
function openCols() {
  if (!curTable.value) return
  colsForm.value = [...headers.value]
  colsErr.value = ''
  showCols.value = true
}
function saveCols() {
  const res = saveTableColumns(siteId.value, curTableId.value, colsForm.value)
  if (!res.ok) { colsErr.value = res.error!; return }
  showCols.value = false
  tick.value++
  showToast('列名已更新（表头/导出同步生效）')
}

// ---- 分组设置：已有分组重命名（批量应用到行）+ 预设分组 ----
const showGrp = ref(false)
const grpForm = ref<Array<{ old: string; name: string; count: number }>>([])
const presetsText = ref('')
const grpErr = ref('')
function openGrp() {
  tick.value
  if (!curTable.value) return
  grpForm.value = accountGroups(siteId.value, curTableId.value).map(g => ({
    old: g, name: g,
    count: curTable.value!.rows.filter(r => r.group === g).length
  }))
  presetsText.value = (curTable.value.groupPresets ?? []).join('\n')
  grpErr.value = ''
  showGrp.value = true
}
function saveGrp() {
  for (const g of grpForm.value) {
    if (g.name.trim() && g.name.trim() !== g.old) {
      const res = renameAccountGroup(siteId.value, curTableId.value, g.old, g.name)
      if (!res.ok) { grpErr.value = res.error!; return }
    } else if (!g.name.trim()) {
      grpErr.value = `分组「${g.old}」名称不能为空`
      return
    }
  }
  saveTablePresets(siteId.value, curTableId.value, presetsText.value.split('\n'))
  showGrp.value = false
  tick.value++
  showToast('分组设置已保存')
}

// ---- CSV 导出（当前表，使用自定义列名） ----
function exportCsv() {
  if (!curTable.value) return
  downloadCsv(stampName(curTable.value.name, 'csv'), headers.value,
    rows.value.map(r => [r.group, r.server, r.ip, r.username, r.password, r.remoteType, r.url, r.sn, r.remark])
  )
}

const RT_CLASS: Record<string, string> = { '远程桌面': 'ok', 'SSH': 'warn', 'web': 'orange' }
</script>

<template>
  <div class="page">
    <div class="page-head page-narrow">
      <div>
        <div class="crumb">
          <span class="link" @click="router.push('/sites')">站点管理</span>
          <span class="sep">/</span><span>{{ siteName }}</span>
        </div>
        <h2 style="margin-top: 6px">IT信息统计</h2>
        <p class="sub">通用信息表：服务器账号 / 交换机 / 监控 / 无线AP / 显示器 / 电脑等 · 多表管理 · 列名与分组可自定义 · Excel每个Sheet导入一张表</p>
      </div>
      <div style="display: flex; gap: 8px">
        <button class="btn" :disabled="!curTable" @click="exportCsv">导出CSV</button>
        <template v-if="canEdit()">
          <button class="btn primary" @click="showImport = true">导入Excel</button>
          <button class="btn primary" :disabled="!curTable" @click="openCreate">＋ 新增</button>
        </template>
      </div>
    </div>

    <div class="tabs page-narrow">
      <button
        v-for="t in tables" :key="t.id"
        :class="{ on: t.id === curTableId }"
        :title="`${t.name}（${t.rows.length}条）`"
        @click="curTableId = t.id; fGroup = ''"
      >{{ t.name }} <span class="tab-count">{{ t.rows.length }}</span></button>
      <button v-if="canEdit()" class="tab-add" title="新建表" @click="openTableNew">＋</button>
    </div>

    <div class="card page-narrow">
      <div class="filters">
        <input v-model="keyword" class="input" style="width: 260px" placeholder="搜索 服务器/IP/用户名/序列号/备注" :disabled="!curTable" />
        <select v-model="fGroup" class="select" style="width: 170px">
          <option value="">全部分组</option>
          <option v-for="g in groups" :key="g" :value="g">{{ g }}</option>
        </select>
        <label v-if="canEdit()" class="pwd-toggle">
          <input type="checkbox" v-model="showPwd" /> 显示密码
        </label>
        <span style="flex: 1"></span>
        <span class="count">共 {{ rows.length }} 条</span>
        <template v-if="canEdit()">
          <button class="btn sm" :disabled="!curTable" @click="openCols">列名设置</button>
          <button class="btn sm" :disabled="!curTable" @click="openGrp">分组设置</button>
          <button class="btn sm" :disabled="!curTable" @click="openTableRename">重命名表</button>
          <button class="btn danger sm" :disabled="!curTable" @click="removeTable">删除表</button>
        </template>
      </div>
      <div style="overflow-x: auto; max-height: calc(100vh - 300px)">
        <table class="table" style="min-width: 1180px">
          <thead>
            <tr>
              <th v-for="(h, i) in headers" :key="i">{{ h }}</th>
              <th style="width: 190px">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in rows" :key="r.id">
              <td><span class="badge">{{ r.group }}</span></td>
              <td><b>{{ r.server }}</b></td>
              <td class="mono">{{ r.ip }}</td>
              <td>{{ r.username || '-' }}</td>
              <td class="mono pwd-cell" @click="canEdit() && (showPwd = !showPwd)" :title="canEdit() ? (showPwd ? '点击隐藏' : '点击显示') : '只读账号不可查看密码'">
                {{ showPwd && canEdit() ? r.password : '••••••' }}
              </td>
              <td><span :class="['badge', RT_CLASS[r.remoteType] ?? '']">{{ r.remoteType }}</span></td>
              <td>
                <a v-if="r.url" :href="r.url" target="_blank" rel="noopener" class="link-text">{{ r.url }}</a>
                <span v-else>-</span>
              </td>
              <td class="mono">{{ r.sn || '-' }}</td>
              <td class="ell" :title="r.remark">{{ r.remark || '-' }}</td>
              <td>
                <button class="btn primary sm" @click="connect(r)">连接</button>
                <template v-if="canEdit()">
                  <button class="btn sm" @click="openEdit(r)">编辑</button>
                  <button class="btn danger sm" @click="remove(r)">删除</button>
                </template>
              </td>
            </tr>
          </tbody>
        </table>
        <p v-if="!tables.length" class="empty">暂无表：点击上方「＋」新建表，或右上角「导入Excel」（每个Sheet自动建一张表）</p>
        <p v-else-if="!rows.length" class="empty">当前表暂无数据：点击右上角「导入Excel」或「＋ 新增」手动录入</p>
      </div>
    </div>

    <!-- 新增/编辑（字段标签跟随自定义列名） -->
    <ModalDialog v-if="showDialog" :title="editing ? `编辑 · ${editing.server}` : `新增记录 · ${curTable?.name ?? ''}`" :width="600" @close="showDialog = false">
      <div class="form-row">
        <div class="field">
          <label>{{ headers[0] }}（可输入新分组，回车确认）</label>
          <input v-model="form.group" class="input" list="grpList" maxlength="24" />
          <datalist id="grpList"><option v-for="g in groupOpts" :key="g" :value="g" /></datalist>
        </div>
        <div class="field" style="max-width: 190px">
          <label>{{ headers[5] }}</label>
          <select v-model="form.remoteType" class="select">
            <option>远程桌面</option><option>SSH</option><option>web</option><option>其他</option>
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="field">
          <label>{{ headers[1] }} <b>*</b></label>
          <input v-model="form.server" class="input" maxlength="32" />
        </div>
        <div class="field">
          <label>{{ headers[2] }} <b>*</b></label>
          <input v-model="form.ip" class="input" maxlength="64" placeholder="多IP可换行分隔" />
        </div>
      </div>
      <div class="form-row">
        <div class="field">
          <label>{{ headers[3] }}</label>
          <input v-model="form.username" class="input" maxlength="32" />
        </div>
        <div class="field">
          <label>{{ headers[4] }}</label>
          <input v-model="form.password" class="input" maxlength="128" />
        </div>
      </div>
      <div class="form-row">
        <div class="field">
          <label>{{ headers[6] }}</label>
          <input v-model="form.url" class="input" maxlength="128" placeholder="https://..." />
        </div>
        <div class="field">
          <label>{{ headers[7] }}</label>
          <input v-model="form.sn" class="input" maxlength="64" />
        </div>
      </div>
      <div class="field">
        <label>{{ headers[8] }}</label>
        <input v-model="form.remark" class="input" maxlength="128" />
      </div>
      <p v-if="err" style="color: var(--danger); font-size: 12px">{{ err }}</p>
      <template #foot>
        <button class="btn" @click="showDialog = false">取消</button>
        <button class="btn primary" @click="submit">保存</button>
      </template>
    </ModalDialog>

    <!-- 列名设置 -->
    <ModalDialog v-if="showCols" :title="`列名设置 · ${curTable?.name ?? ''}`" :width="560" @close="showCols = false">
      <p class="tip small" style="margin-bottom: 10px">自定义本表 9 列抬头（表头展示与导出同步生效；第2列默认为名称、第3列为IP，导入Excel列序仍按 A名称 B IP … 映射）</p>
      <div class="cols-grid">
        <div v-for="i in 9" :key="i" class="field">
          <label>第{{ i }}列</label>
          <input v-model="colsForm[i - 1]" class="input" maxlength="12" />
        </div>
      </div>
      <p v-if="colsErr" style="color: var(--danger); font-size: 12px">{{ colsErr }}</p>
      <template #foot>
        <button class="btn" @click="showCols = false">取消</button>
        <button class="btn" @click="colsForm = [...ACCOUNT_HEADERS]">恢复默认</button>
        <button class="btn primary" @click="saveCols">保存</button>
      </template>
    </ModalDialog>

    <!-- 分组设置 -->
    <ModalDialog v-if="showGrp" :title="`分组设置 · ${curTable?.name ?? ''}`" :width="520" @close="showGrp = false">
      <template v-if="grpForm.length">
        <p class="tip small" style="margin-bottom: 8px">已有分组（重命名将批量应用到该分组全部记录）：</p>
        <div v-for="(g, i) in grpForm" :key="g.old" class="field" style="margin-bottom: 8px">
          <label>{{ g.old }} · {{ g.count }} 条</label>
          <input v-model="grpForm[i].name" class="input" maxlength="24" />
        </div>
      </template>
      <p v-else class="tip small" style="margin-bottom: 8px">本表暂无分组（导入或录入时填写分组后在此管理）。</p>
      <div class="field">
        <label>预设分组（每行一个，录入时下拉可选，无需已有记录）</label>
        <textarea v-model="presetsText" class="textarea" rows="4" placeholder="如：&#10;OA服务器&#10;带外管理&#10;核心交换" />
      </div>
      <p v-if="grpErr" style="color: var(--danger); font-size: 12px">{{ grpErr }}</p>
      <template #foot>
        <button class="btn" @click="showGrp = false">取消</button>
        <button class="btn primary" @click="saveGrp">保存</button>
      </template>
    </ModalDialog>

    <!-- 表 新建/重命名 -->
    <ModalDialog v-if="showTableDlg" :title="tableDlgMode === 'new' ? '新建表' : `重命名表 · ${curTable?.name}`" :width="420" @close="showTableDlg = false">
      <div class="field">
        <label>表名称 <b>*</b>（如 服务器账号 / 交换机账号 / 监控设备 / 无线AP / 电脑台账）</label>
        <input v-model="tableDlgName" class="input" maxlength="32" @keyup.enter="submitTableDlg" />
      </div>
      <p v-if="tableDlgErr" style="color: var(--danger); font-size: 12px">{{ tableDlgErr }}</p>
      <template #foot>
        <button class="btn" @click="showTableDlg = false">取消</button>
        <button class="btn primary" @click="submitTableDlg">保存</button>
      </template>
    </ModalDialog>

    <!-- Excel导入（v-if：未挂载时彻底关闭，修复无法退出问题） -->
    <ModalDialog v-if="showImport" title="导入 Excel（多表）" :width="680" @close="showImport = false">
      <div class="field">
        <label>选择 .xlsx 文件：每个 Sheet 识别为一张表（Sheet名=表名，同名表自动合并追加）；列序 A服务器 B IP C用户名 D密码 E远程方式 F网址 G序列号，标题行自动识别为分组</label>
        <input ref="fileRef" type="file" accept=".xlsx,.xls" class="input" @change="onPickFile" />
      </div>
      <p v-if="importErr" style="color: var(--danger); font-size: 12px; margin-bottom: 10px">{{ importErr }}</p>
      <template v-if="previewTables.length">
        <p style="font-size: 13px; margin-bottom: 8px">
          识别到 <b style="color: var(--accent)">{{ previewTables.length }}</b> 张表
          共 <b style="color: var(--accent)">{{ previewTables.reduce((s, t) => s + t.rows.length, 0) }}</b> 条，预览各表前 4 条：
        </p>
        <div style="overflow-x: auto; max-height: 260px">
          <table class="table" style="min-width: 620px">
            <thead><tr><th>表（Sheet）</th><th>分组</th><th>服务器</th><th>IP</th><th>用户名</th><th>远程方式</th></tr></thead>
            <tbody>
              <template v-for="t in previewTables" :key="t.name">
                <tr v-for="(p, i) in t.rows.slice(0, 4)" :key="t.name + i">
                  <td><b class="badge">{{ t.name }}</b></td>
                  <td>{{ p.group }}</td><td><b>{{ p.server }}</b></td><td class="mono">{{ p.ip }}</td>
                  <td>{{ p.username }}</td><td>{{ p.remoteType }}</td>
                </tr>
                <tr v-if="t.rows.length > 4" :key="t.name + '-more'">
                  <td colspan="6" style="color: var(--text-faint); font-size: 12px">… 其余 {{ t.rows.length - 4 }} 条</td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>
      </template>
      <template #foot>
        <button class="btn" @click="showImport = false">取消</button>
        <button class="btn primary" :disabled="!previewTables.length || importing" @click="confirmImport">
          确认导入 {{ previewTables.length ? `(${previewTables.reduce((s, t) => s + t.rows.length, 0)}条)` : '' }}
        </button>
      </template>
    </ModalDialog>

    <div class="toast" v-if="toast">{{ toast }}</div>
  </div>
</template>

<style scoped>
.page-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; flex-wrap: wrap; gap: 10px; }
.page-head .sub { font-size: 12px; color: var(--text-faint); margin-top: 4px; }
.tabs { display: flex; gap: 8px; margin-bottom: 14px; flex-wrap: wrap; }
.tabs button {
  background: var(--bg-panel); border: 1px solid var(--line-strong); color: var(--text-muted);
  padding: 7px 16px; border-radius: 8px; cursor: pointer; font-size: 13px; transition: all var(--tr);
  max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.tabs button.on { background: var(--accent-deep); border-color: rgba(1, 1, 32, 0.35); color: var(--accent); }
.tab-count { font-size: 11px; opacity: 0.75; margin-left: 4px; }
.tab-add { width: 36px !important; padding: 7px 0 !important; text-align: center; }
.filters { display: flex; gap: 10px; align-items: center; margin-bottom: 12px; flex-wrap: wrap; }
.count { font-size: 12px; color: var(--text-faint); }
.mono { font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace; font-size: 12px; }
.pwd-cell { cursor: pointer; color: var(--text-muted); user-select: none; }
.pwd-toggle { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text-muted); cursor: pointer; }
.cols-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px 12px; }
.link-text { color: var(--accent); text-decoration: none; }
.link-text:hover { text-decoration: underline; }
</style>
