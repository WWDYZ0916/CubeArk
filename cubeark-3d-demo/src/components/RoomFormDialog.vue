<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import ModalDialog from './ModalDialog.vue'
import { saveRoom } from '../api/mock'
import type { RoomMeta } from '../types'

const props = defineProps<{ room: RoomMeta | null; siteId: number }>() // room=null 新增
const emit = defineEmits<{ (e: 'close'): void; (e: 'saved'): void }>()

const form = reactive({ code: '', name: '', floor: '' })
const errors = reactive<{ code?: string; name?: string }>({})
const saving = ref(false)

watch(
  () => props.room,
  r => {
    form.code = r?.code ?? ''
    form.name = r?.name ?? ''
    form.floor = r?.floor ?? ''
    errors.code = undefined
    errors.name = undefined
  },
  { immediate: true }
)

function submit() {
  errors.code = form.code.trim() ? undefined : '机房编码不能为空'
  errors.name = form.name.trim() ? undefined : '机房名称不能为空'
  if (errors.code || errors.name) return
  saving.value = true
  const res = saveRoom({
    id: props.room?.id,
    siteId: props.siteId,
    code: form.code,
    name: form.name,
    floor: form.floor
  })
  saving.value = false
  if (!res.ok) {
    errors.code = res.error
    return
  }
  emit('saved')
  emit('close')
}
</script>

<template>
  <ModalDialog :title="room ? '编辑机房' : '新增机房'" @close="emit('close')">
    <div class="form-row">
      <div class="field">
        <label>机房编码 <b>*</b></label>
        <input v-model="form.code" class="input" placeholder="如 HF-IDC-02" maxlength="32" />
        <p v-if="errors.code" class="err">{{ errors.code }}</p>
      </div>
      <div class="field">
        <label>楼层</label>
        <input v-model="form.floor" class="input" placeholder="如 3F / B1" maxlength="16" />
      </div>
    </div>
    <div class="field">
      <label>机房名称 <b>*</b></label>
      <input v-model="form.name" class="input" placeholder="如 合肥二号机房" maxlength="32" />
      <p v-if="errors.name" class="err">{{ errors.name }}</p>
    </div>
    <template #foot>
      <button class="btn" @click="emit('close')">取消</button>
      <button class="btn primary" :disabled="saving" @click="submit">保存</button>
    </template>
  </ModalDialog>
</template>
