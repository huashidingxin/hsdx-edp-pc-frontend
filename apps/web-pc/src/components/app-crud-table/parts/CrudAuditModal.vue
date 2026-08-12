<script setup>
/**
 * CrudAuditModal - 审核弹窗
 *
 * Props: open, submitting
 * Events: update:open, submit
 */
import { ref, watch } from 'vue';

import {
  Form,
  FormItem,
  Input,
  Modal,
  Radio,
  RadioGroup,
} from 'antdv-next';

const props = defineProps({
  open: { type: Boolean, default: false },
  submitting: { type: Boolean, default: false },
});

const emit = defineEmits(['update:open', 'submit']);

const auditForm = ref({ status: 1, reason: '' });

watch(
  () => props.open,
  (val) => {
    if (val) auditForm.value = { status: 1, reason: '' };
  },
);

function handleCancel() {
  emit('update:open', false);
}

function handleOk() {
  emit('submit', { ...auditForm.value });
}
</script>

<template>
  <Modal
    :open="open"
    title="审核"
    :confirm-loading="submitting"
    :mask-closable="false"
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
