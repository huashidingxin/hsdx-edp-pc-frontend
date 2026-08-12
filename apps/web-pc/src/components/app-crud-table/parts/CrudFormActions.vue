<script setup>
/**
 * CrudFormActions - 详情操作按钮组件
 *
 * 用于 Modal/Drawer 的 #footer 插槽和 Page 模式的按钮区域。
 * 渲染规则：
 *   editing && !disabled → 显示 取消 + 保存
 *   否则                  → 仅显示 关闭
 *
 * Slots: form-actions（完全替换默认按钮区）、form-action（追加按钮）
 */
import { Button, Space } from 'antdv-next';

defineProps({
  editing: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  saving: { type: Boolean, default: false },
});

const emit = defineEmits(['submit', 'reset', 'close']);

function handleSubmit() {
  emit('submit');
}

function handleReset() {
  emit('reset');
}

function handleClose() {
  emit('close');
}
</script>

<template>
  <div class="crud-form-actions flex justify-end gap-2">
    <slot
      name="form-actions"
      :submit="handleSubmit"
      :reset="handleReset"
      :close="handleClose"
      :saving="saving"
    >
      <Space>
        <Button @click="handleClose">取消</Button>
        <Button
          v-if="editing && !disabled"
          type="primary"
          :loading="saving"
          @click="handleSubmit"
        >
          保存
        </Button>
      </Space>
      <slot
        name="form-action"
        :submit="handleSubmit"
        :reset="handleReset"
        :close="handleClose"
        :saving="saving"
      ></slot>
    </slot>
  </div>
</template>
