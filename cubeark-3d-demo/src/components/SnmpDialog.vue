<script setup lang="ts">
// SNMP 采集配置弹窗（交换机/服务器）：版本/团体名或v3认证/端口 + 测试连接（演示模拟）
import { ref } from 'vue'
import ModalDialog from './ModalDialog.vue'
import { getSnmpConfig, saveSnmpConfig, testSnmp } from '../api/mock'
import type { SnmpConfig, SnmpTestResult } from '../types'

const props = defineProps<{ deviceId: number; deviceName: string; manageIp?: string }>()
const emit = defineEmits<{ (e: 'close'): void; (e: 'saved'): void }>()

const form = ref<SnmpConfig>(getSnmpConfig(props.deviceId))
const test = ref<SnmpTestResult | null>(null)
const err = ref('')
const testing = ref(false)

function doTest() {
  err.value = ''
  testing.value = true
  test.value = null
  // 测试使用当前填写值：先保存配置再模拟采集
  const res = saveSnmpConfig(props.deviceId, { ...form.value })
  if (!res.ok) {
    testing.value = false
    test.value = { ok: false, message: res.error!, latencyMs: 0 }
    return
  }
  window.setTimeout(() => {
    test.value = testSnmp(props.deviceId)
    testing.value = false
  }, 320)
}
function save() {
  err.value = ''
  const res = saveSnmpConfig(props.deviceId, { ...form.value })
  if (!res.ok) { err.value = res.error!; return }
  emit('saved')
  emit('close')
}
</script>

<template>
  <ModalDialog :title="`SNMP 采集配置 · ${deviceName}`" :width="580" @close="emit('close')">
    <div class="form-row">
      <div class="field" style="max-width: 190px">
        <label>采集开关</label>
        <label class="sw">
          <input v-model="form.enabled" type="checkbox" />
          <span>{{ form.enabled ? '已启用' : '未启用' }}</span>
        </label>
      </div>
      <div class="field" style="max-width: 150px">
        <label>SNMP 版本</label>
        <select v-model="form.version" class="select">
          <option value="v1">v1</option>
          <option value="v2c">v2c（团体名）</option>
          <option value="v3">v3（用户+认证）</option>
        </select>
      </div>
      <div class="field" style="max-width: 110px">
        <label>端口</label>
        <input v-model.number="form.port" class="input" type="number" min="1" max="65535" />
      </div>
    </div>
    <div class="form-row" v-if="form.version !== 'v3'">
      <div class="field">
        <label>团体名（community / 只读密码）</label>
        <input v-model="form.community" class="input" type="password" autocomplete="new-password" placeholder="如 public 或自定义只读团体名" />
      </div>
    </div>
    <div class="form-row" v-else>
      <div class="field">
        <label>v3 用户名</label>
        <input v-model="form.v3User" class="input" maxlength="32" autocomplete="off" />
      </div>
      <div class="field">
        <label>认证密码</label>
        <input v-model="form.authPass" class="input" type="password" autocomplete="new-password" />
      </div>
    </div>
    <p class="tip small">
      采集地址：<b>{{ manageIp || '未配置管理IP' }}</b>（{{ form.port }}/UDP）· 采集项：进/排风温度、CPU温度、CPU/内存使用率、风扇、磁盘与系统健康。
      「测试并采集」会同时通过 SNMP 读取设备硬件能力（CPU 数量、电源数量、风扇数量、温度传感器数量），之后的 CPU（单路 / 双路）与电源（单电源 / 双电源）展示以此为准；未采集的设备显示「未采集」。
      演示环境为模拟采集；正式环境由后端按此配置经 SNMP 采集。
    </p>
    <div v-if="test" class="snmp-result" :class="test.ok ? 'ok' : 'fail'">
      {{ test.message }}<template v-if="test.ok"> · 用时 {{ test.latencyMs }}ms</template>
    </div>
    <p v-if="err" style="color: var(--danger); font-size: 12px">{{ err }}</p>
    <template #foot>
      <button class="btn snmp-test" :disabled="testing" @click="doTest">{{ testing ? '采集中…' : '测试并采集' }}</button>
      <button class="btn" @click="emit('close')">取消</button>
      <button class="btn primary" @click="save">保存配置</button>
    </template>
  </ModalDialog>
</template>

<style scoped>
.sw { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text-muted); padding: 7px 0; }
.sw input { accent-color: var(--accent); }
.snmp-test { margin-right: auto; }
.snmp-result {
  margin-top: 4px; padding: 8px 12px; border-radius: var(--radius-sm); font-size: 12px;
  border: 1px solid rgba(185, 28, 28, 0.35); background: rgba(185, 28, 28, 0.06); color: var(--danger);
}
.snmp-result.ok { border-color: rgba(21, 128, 61, 0.4); background: rgba(21, 128, 61, 0.07); color: var(--ok); }
</style>
