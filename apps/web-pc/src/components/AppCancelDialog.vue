<script setup>
import { onMounted, reactive, ref } from 'vue';

import { Button, Input, message, Modal, Select } from 'antdv-next';

import Resource from '#/api/resource';

/**
 * 通用取消原因弹窗（对齐 web-admin AppCancel）
 * 默认插槽可自定义触发按钮（<slot :open="openDialog">）
 * 确认后 emit('confirm', { reason_id, other_reason })
 */
const props = defineProps({
  type: { type: String, default: '' },
  buttonText: { type: String, default: '取消' },
});

const emit = defineEmits(['confirm']);

const open = ref(false);
const saving = ref(false);
const reasons = ref([]);
const form = reactive({ reason_id: undefined, other_reason: '' });

async function loadReasons() {
  try {
    const { data } = await new Resource('cancel-reasons').list({
      per_page: 'all',
      type: props.type,
    });
    reasons.value = [...(data || []), { id: 0, name: '其他原因' }];
    form.reason_id = reasons.value[0]?.id;
  } catch (error) {
    console.error(error);
  }
}

function openDialog() {
  form.other_reason = '';
  open.value = true;
}

async function submit() {
  if (form.reason_id === undefined) {
    message.warning('请选择取消原因');
    return;
  }
  if (form.reason_id === 0 && !form.other_reason.trim()) {
    message.warning('请输入其他原因');
    return;
  }
  saving.value = true;
  try {
    emit('confirm', { reason_id: form.reason_id, other_reason: form.other_reason.trim() });
    open.value = false;
  } finally {
    saving.value = false;
  }
}

onMounted(loadReasons);
</script>

<template>
  <slot :open="openDialog">
    <Button danger @click="openDialog">{{ buttonText }}</Button>
  </slot>

  <Modal
    :open="open"
    title="取消原因"
    :confirm-loading="saving"
    ok-text="确定取消"
    cancel-text="暂不取消"
    @ok="submit"
    @cancel="open = false"
  >
    <div class="space-y-4 py-2">
      <div>
        <div class="mb-1 text-sm text-gray-600">原因</div>
        <Select
          v-model:value="form.reason_id"
          :options="reasons.map((r) => ({ value: r.id, label: r.name }))"
          style="width: 100%"
        />
      </div>
      <div v-if="form.reason_id === 0">
        <div class="mb-1 text-sm text-gray-600">其他原因</div>
        <Input.TextArea
          v-model:value="form.other_reason"
          :rows="2"
          placeholder="请输入取消原因"
        />
      </div>
    </div>
  </Modal>
</template>
