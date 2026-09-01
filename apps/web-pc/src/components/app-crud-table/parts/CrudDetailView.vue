<script setup>
/**
 * CrudDetailView - 详情视图（modal/drawer/page 三模式统一）
 *
 * Props: mode, title, description, modelValue, fields, editing, disabled,
 *        formAttrs, saving, loading, validateMessages, setFieldRef, detailError
 * Slots: detail-title, detail-description, form-description, form-default,
 *        动态 field_<slot>
 * Events: update:modelValue, reset, submit, close, form-mounted
 */
import { computed, ref, useSlots, watch } from 'vue';

import {
  Button,
  Col,
  Divider,
  Form,
  FormItem,
  Result,
  Row,
  Spin,
} from 'antdv-next';

import AppField from '#/components/AppField.vue';

const props = defineProps({
  mode: { type: String, default: 'modal' }, // 'modal' | 'drawer' | 'page'
  title: { type: String, default: '' },
  description: { type: String, default: '' },
  modelValue: { type: Object, default: () => ({}) },
  fields: { type: Array, default: () => [] },
  editing: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  formAttrs: { type: Object, default: () => ({}) },
  saving: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
  refreshing: { type: Boolean, default: false },
  validateMessages: { type: Object, default: () => ({}) },
  setFieldRef: { type: Function, default: null },
  detailError: { type: Object, default: null },
});

const emit = defineEmits([
  'update:modelValue',
  'reset',
  'submit',
  'close',
  'formMounted',
]);

const slots = useSlots();

// 表单实例 ref，挂载后通过 emit 通知父组件
const formRef = ref(null);
watch(formRef, (instance) => {
  if (instance) emit('formMounted', instance);
});

function updateField(field, value) {
  emit('update:modelValue', { ...props.modelValue, [field]: value });
}

function handleClose() {
  emit('close');
}

const detailTitle = computed(() => {
  if (props.editing) {
    return props.modelValue?.id
      ? `编辑 - ${props.title}`
      : `新增 - ${props.title}`;
  }
  return `查看 - ${props.title}`;
});
</script>

<style scoped>
/* 后台刷新进度条动画 */
.refreshing-bar-inner {
  width: 30%;
  animation: refreshing-slide 1.2s ease-in-out infinite;
}

@keyframes refreshing-slide {
  0% {
    transform: translateX(-100%);
  }
  50% {
    transform: translateX(300%);
  }
  100% {
    transform: translateX(-100%);
  }
}
</style>

<template>
  <div class="crud-detail-view relative">
    <!-- 后台刷新中：非阻塞加载指示器（顶部进度条） -->
    <div v-if="refreshing" class="refreshing-bar absolute left-0 right-0 top-0 z-10 h-0.5 overflow-hidden bg-blue-100">
      <div class="refreshing-bar-inner h-full bg-blue-500"></div>
    </div>

    <!-- 错误状态 -->
    <Result
      v-if="detailError"
      status="error"
      title="加载失败"
      :sub-title="detailError?.message || '详情加载失败'"
    >
      <template #extra>
        <Button type="primary" @click="handleClose">返回列表</Button>
      </template>
    </Result>

    <!-- 加载中（阻塞：无行数据时等待首次加载） -->
    <div
      v-else-if="loading"
      class="detail-loading flex items-center justify-center py-8"
    >
      <Spin size="large" />
    </div>

    <!-- 正常内容 -->
    <template v-else>
      <!-- 标题区（仅 page 模式显示） -->
      <div v-if="title && mode === 'page'" class="detail-header mb-4">
        <slot name="detail-title" :editing="editing" :model-value="modelValue">
          <h3 class="mb-0 text-lg font-semibold">{{ detailTitle }}</h3>
        </slot>
        <slot
          name="detail-description"
          :editing="editing"
          :model-value="modelValue"
        >
          <p v-if="description" class="mt-1 text-gray-500">{{ description }}</p>
        </slot>
      </div>

      <slot
        name="form-description"
        :editing="editing"
        :model-value="modelValue"
      ></slot>

      <Form
        ref="formRef"
        :model="modelValue"
        :disabled="disabled"
        :validate-messages="validateMessages"
        v-bind="formAttrs"
        layout="vertical"
      >
        <slot
          name="form-default"
          :model-value="modelValue"
          :fields="fields"
          :editing="editing"
        >
          <Row :gutter="[16, 0]">
            <template
              v-for="field in fields"
              :key="field.renderKey || field.field"
            >
              <Col v-if="field.type === 'title'" :span="24">
                <h4 class="mb-2 mt-4 font-semibold">{{ field.label }}</h4>
              </Col>

              <Col v-else-if="field.type === 'divider'" :span="24">
                <Divider>{{ field.label }}</Divider>
              </Col>

              <Col v-else-if="field.type === 'slot'" :span="field.span || 6">
                <FormItem :label="field.label">
                  <slot
                    :name="`field_${field.slot || field.field}`"
                    :field="field"
                    :model-value="modelValue[field.field]"
                    :form-value="modelValue"
                    :update="(v) => updateField(field.field, v)"
                  ></slot>
                </FormItem>
              </Col>

              <Col v-else :span="field.span || 6">
                <AppField
                  :ref="(el) => setFieldRef?.(field.renderKey, el)"
                  :model-value="modelValue[field.field]"
                  :field="field"
                  :readonly="!editing"
                  @update:model-value="(v) => updateField(field.field, v)"
                />
              </Col>
            </template>
          </Row>
        </slot>
      </Form>
    </template>
  </div>
</template>
