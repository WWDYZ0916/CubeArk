<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import ModalDialog from './ModalDialog.vue'
import { saveITAsset } from '../api/mock'
import type { ITAsset } from '../types'

const props = defineProps<{ asset: ITAsset | null; siteId: number }>() // asset=null 新增
const emit = defineEmits<{ (e: 'close'): void; (e: 'saved'): void }>()

const form = reactive({ barcode: '', name: '', type: '键鼠', spec: '', remark: '' })
const err = ref('')

watch(
  () => props.asset,
  a => {
    form.barcode = a?.barcode ?? `IT-${Date.now().toString().slice(-6)}`
    form.name = a?.name ?? ''
    form.type = a?.type ?? '键鼠'
    form.spec = a?.spec ?? ''
    form.remark = a?.remark ?? ''
    err.value = ''
  },
  { immediate: true }
)

function submit() {
  const res = saveITAsset(props.siteId, { id: props.asset?.id, ...form })
  if (!res.ok) {
    err.value = res.error!
    return
  }
  emit('saved')
  emit('close')
}
</script>

<template>
  <ModalDialog :title="asset ? '编辑IT资产' : '新增IT资产'" @close="emit('close')">
    <div class="form-row">
      <div class="field">
        <label>资产条码 <b>*</b></label>
        <input v-model="form.barcode" class="input" maxlength="32" />
      </div>
      <div class="field">
        <label>分类</label>
        <select v-model="form.type" class="select">
          <option>键鼠</option><option>外设</option><option>耗材</option><option>其他</option>
        </select>
      </div>
    </div>
    <div class="form-row">
      <div class="field">
        <label>品名 <b>*</b></label>
        <input v-model="form.name" class="input" placeholder="如 无线鼠标" maxlength="32" />
      </div>
      <div class="field">
        <label>规格</label>
        <input v-model="form.spec" class="input" placeholder="如 罗技 M330" maxlength="64" />
      </div>
    </div>
    <div class="field">
      <label>备注</label>
      <textarea v-model="form.remark" class="textarea" rows="2" maxlength="128" />
    </div>
    <p v-if="err" style="color: var(--danger); font-size: 12px; margin-bottom: 8px">{{ err }}</p>
    <template #foot>
      <button class="btn" @click="emit('close')">取消</button>
      <button class="btn primary" @click="submit">保存</button>
    </template>
  </ModalDialog>
</template>
