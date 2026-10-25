<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import ModalDialog from './ModalDialog.vue'
import { saveSite } from '../api/mock'
import type { Site } from '../types'

const props = defineProps<{ site: Site | null }>() // null=新增
const emit = defineEmits<{ (e: 'close'): void; (e: 'saved'): void }>()

const form = reactive({ name: '', address: '', owner: '', remark: '' })
const errors = reactive<{ name?: string }>({})
const saving = ref(false)

watch(
  () => props.site,
  s => {
    form.name = s?.name ?? ''
    form.address = s?.address ?? ''
    form.owner = s?.owner ?? ''
    form.remark = s?.remark ?? ''
    errors.name = undefined
  },
  { immediate: true }
)

function submit() {
  errors.name = form.name.trim() ? undefined : '站点名称不能为空'
  if (errors.name) return
  saving.value = true
  const res = saveSite({
    id: props.site?.id,
    name: form.name,
    address: form.address,
    owner: form.owner,
    remark: form.remark
  })
  saving.value = false
  if (!res.ok) {
    errors.name = res.error
    return
  }
  emit('saved')
  emit('close')
}
</script>

<template>
  <ModalDialog :title="site ? '编辑站点' : '新增站点'" @close="emit('close')">
    <div class="field">
      <label>站点名称 <b>*</b></label>
      <input v-model="form.name" class="input" placeholder="如：合肥一号站点" maxlength="32" />
      <p v-if="errors.name" class="err">{{ errors.name }}</p>
    </div>
    <div class="form-row">
      <div class="field">
        <label>地址</label>
        <input v-model="form.address" class="input" placeholder="详细地址" maxlength="64" />
      </div>
      <div class="field">
        <label>负责人</label>
        <input v-model="form.owner" class="input" placeholder="负责人姓名" maxlength="16" />
      </div>
    </div>
    <div class="field">
      <label>备注</label>
      <textarea v-model="form.remark" class="textarea" rows="2" placeholder="备注信息" maxlength="128" />
    </div>
    <template #foot>
      <button class="btn" @click="emit('close')">取消</button>
      <button class="btn primary" :disabled="saving" @click="submit">保存</button>
    </template>
  </ModalDialog>
</template>
