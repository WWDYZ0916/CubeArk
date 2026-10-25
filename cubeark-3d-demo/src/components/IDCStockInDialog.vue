<script setup lang="ts">
import { reactive, ref } from 'vue'
import ModalDialog from './ModalDialog.vue'
import { addIDCStock, getRooms } from '../api/mock'

// 机房设备入库：录入后进入本站点「设备库」，可在3D机房拖拽上架
const props = defineProps<{ siteId: number }>()
const emit = defineEmits<{ (e: 'close'): void; (e: 'saved'): void }>()

const form = reactive({
  barcode: '', name: '', sn: '', category: 1,
  vendor: '', model: '', uHeight: 2, roomId: 0, remark: ''
})
const err = ref('')
const rooms = getRooms(props.siteId)

const CATS = [
  { v: 1, label: '虚拟化服务器' }, { v: 2, label: '交换机' }, { v: 3, label: '防火墙' },
  { v: 4, label: '存储' }, { v: 5, label: 'HPC登陆节点' }, { v: 6, label: 'HPC计算节点' },
  { v: 7, label: '其他' }
]

function submit() {
  err.value = ''
  const res = addIDCStock({ ...form, siteId: props.siteId, roomId: form.roomId || undefined })
  if (!res.ok) {
    err.value = res.error!
    return
  }
  emit('saved')
  emit('close')
}
</script>

<template>
  <ModalDialog title="机房设备入库" :width="560" @close="emit('close')">
    <div class="form-row">
      <div class="field">
        <label>设备名称 <b>*</b></label>
        <input v-model="form.name" class="input" placeholder="如：虚拟化节点-05" maxlength="32" />
      </div>
      <div class="field">
        <label>资产条码</label>
        <input v-model="form.barcode" class="input" placeholder="扫码或手输" maxlength="32" />
      </div>
    </div>
    <div class="form-row">
      <div class="field">
        <label>SN 序列号 <b>*</b></label>
        <input v-model="form.sn" class="input" placeholder="全库唯一" maxlength="64" />
      </div>
      <div class="field">
        <label>设备类型 <b>*</b></label>
        <select v-model.number="form.category" class="select">
          <option v-for="c in CATS" :key="c.v" :value="c.v">{{ c.label }}</option>
        </select>
      </div>
    </div>
      <div class="form-row">
      <div class="field">
        <label>品牌</label>
        <input v-model="form.vendor" class="input" placeholder="如 Dell / H3C" maxlength="32" list="vendorList" />
        <datalist id="vendorList">
          <option>H3C</option><option>Dell</option><option>浪潮</option><option>华为</option><option>NATAPP</option><option>飞塔</option><option>Cisco</option>
        </datalist>
      </div>
      <div class="field">
        <label>型号</label>
        <input v-model="form.model" class="input" placeholder="如 R740" maxlength="32" list="modelList" />
        <datalist id="modelList">
          <option>H3C S7506</option><option>H3C S5130S</option><option>H3C S6520X</option>
          <option>Dell R740</option><option>Dell R750</option><option>Dell R840</option>
          <option>NATAPP N8000</option><option>飞塔 FG-1000D</option><option>浪潮 NF5280M6</option>
        </datalist>
      </div>
      <div class="field" style="max-width: 110px">
        <label>U高度 <b>*</b></label>
        <input v-model.number="form.uHeight" class="input" type="number" min="1" max="20" />
      </div>
    </div>
    <div class="field">
      <label>归属机房（可选，入库后存放于站点库房，3D拖拽上架时再选机柜U位）</label>
      <select v-model.number="form.roomId" class="select">
        <option :value="0">暂不指定</option>
        <option v-for="r in rooms" :key="r.id" :value="r.id">{{ r.name }}（{{ r.code }}）</option>
      </select>
    </div>
    <div class="field">
      <label>备注</label>
      <textarea v-model="form.remark" class="textarea" rows="2" maxlength="128" />
    </div>
    <p v-if="err" class="err" style="color: var(--danger); font-size: 12px; margin-bottom: 8px">{{ err }}</p>
    <template #foot>
      <button class="btn" @click="emit('close')">取消</button>
      <button class="btn primary" @click="submit">入库</button>
    </template>
  </ModalDialog>
</template>
