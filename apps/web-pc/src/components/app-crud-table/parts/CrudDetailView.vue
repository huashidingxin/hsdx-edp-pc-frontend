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

<template>
  <div class="crud-detail-view">
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

    <!-- 加载中 -->
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
