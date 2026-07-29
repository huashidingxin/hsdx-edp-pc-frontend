<script setup>
/**
 * CrudAuditModal - 审核弹窗
 *
 * Props: open, row, apiUrl, idKey
 * Events: update:open, audited
 */
import { ref, watch } from 'vue';

import {
  Form,
  FormItem,
  Input,
  message,
  Modal,
  Radio,
  RadioGroup,
} from 'antdv-next';

import Resource from '#/api/resource';

const props = defineProps({
  open: { type: Boolean, default: false },
  row: { type: Object, default: null },
  apiUrl: { type: String, default: '' },
  idKey: { type: String, default: 'id' },
});

const emit = defineEmits(['update:open', 'audited']);

const auditForm = ref({ status: 1, reason: '' });
const submitting = ref(false);

watch(
  () => props.open,
  (val) => {
    if (val) auditForm.value = { status: 1, reason: '' };
  },
);

function handleCancel() {
  emit('update:open', false);
}

async function handleOk() {
  // 校验：不通过时 reason 必填
  if (auditForm.value.status === 0 && !auditForm.value.reason?.trim()) {
    message.error('请输入原因');
    return;
  }

  submitting.value = true;
  try {
    const id = props.row?.[props.idKey];
    const url = `${props.apiUrl}/${id}/audit`;
    await new Resource(url).store(auditForm.value);
    message.success('审核成功');
    emit('update:open', false);
    auditForm.value = { status: 1, reason: '' };
    emit('audited');
  } catch (error) {
    console.error('[CrudAuditModal] submit error:', error);
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <Modal
    :open="open"
    title="审核"
    :confirm-loading="submitting"
    @cancel="handleCancel"
    @ok="handleOk"
  >
    <Form layout="vertical">
      <FormItem label="审核状态" required>
        <RadioGroup v-model:value="auditForm.status">
          <Radio :value="1">通过</Radio>
          <Radio :value="0">不通过</Radio>
        </RadioGroup>
      </FormItem>
      <FormItem v-if="auditForm.status === 0" label="审核意见" required>
        <Input.TextArea
          v-model:value="auditForm.reason"
          placeholder="请输入原因"
          :rows="3"
        />
      </FormItem>
    </Form>
  </Modal>
</template>
