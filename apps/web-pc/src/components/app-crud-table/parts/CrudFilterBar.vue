<script setup>
/**
 * CrudFilterBar - 筛选区
 *
 * Props: fields, modelValue, expanded, collapseRows, canExpand
 * Slots: 动态 filter_<field>, prepend, actions
 * Events: update:modelValue, reset, apply, update:expanded
 */
import { computed, watch } from 'vue';
import { Button, Col, Form, Row, Space } from 'antdv-next';

import AppField from '#/components/AppField.vue';

const props = defineProps({
  fields: { type: Array, default: () => [] },
  modelValue: { type: Object, default: () => ({}) },
  expanded: { type: Boolean, default: false },
  collapseRows: { type: Number, default: 1 },
  canExpand: { type: Boolean, default: false },
  showActions: { type: Boolean, default: true },
  filterImmediate: { type: Boolean, default: false },
});

const emit = defineEmits([
  'update:modelValue',
  'reset',
  'apply',
  'update:expanded',
]);

function updateField(field, value) {
  emit('update:modelValue', { ...props.modelValue, [field]: value });
}

function handleReset() {
  emit('reset');
}

function handleApply() {
  emit('apply');
}

function toggleExpand() {
  emit('update:expanded', !props.expanded);
}

// 当不显示按钮且启用立即筛选时，监听 modelValue 变化自动触发查询
watch(
  () => props.modelValue,
  () => {
    if (!props.showActions && props.filterImmediate) {
      handleApply();
    }
  },
  { deep: true }
);

// 每行最大 4 列（span=6），操作按钮占 1 列
const ACTION_SPAN = 6;

// 收起时可见字段（根据 span 动态计算，总和不超过 18）
const collapsedInfo = computed(() => {
  const result = [];
  let usedSpan = 0;
  const maxSpan = 24 - ACTION_SPAN; // 18
  for (const field of props.fields) {
    const span = field.col || field.span || 6;
    if (usedSpan + span <= maxSpan) {
      result.push(field);
      usedSpan += span;
    } else {
      break;
    }
  }
  return result;
});

// 当前可见字段（展开时全部显示，收起时只显示 collapsedInfo）
const visibleFields = computed(() => {
  return props.expanded ? props.fields : collapsedInfo.value;
});
</script>

<template>
  <div v-if="fields.length > 0" class="crud-filter-bar">
    <slot name="prepend"></slot>
    <Form class="crud-filter-bar__form">
      <Row :gutter="12">
        <Col
          v-for="item in visibleFields"
          :key="item.field"
          :span="item.col || item.span || 6"
        >
          <slot
            v-if="item.type === 'slot'"
            :name="`filter_${item.field}`"
            :field="item"
            :model-value="modelValue[item.field]"
            :update="(v) => updateField(item.field, v)"
          ></slot>
          <AppField
            v-else
            :model-value="modelValue[item.field]"
            :show-label="true"
            :field="item"
            @update:model-value="(v) => updateField(item.field, v)"
          />
        </Col>

        <!-- 操作区：紧跟最后一个可见字段，自动换行到尾部 -->
        <Col v-if="showActions" :span="6">
          <slot
            name="actions"
            :reset="handleReset"
            :apply="handleApply"
            :toggle-expand="toggleExpand"
            :expanded="expanded"
          >
            <Space :size="8" class="filter-actions pb-3">
              <Button
                v-if="canExpand"
                type="link"
                size="small"
                @click="toggleExpand"
              >
                {{ expanded ? '收起' : '展开' }}
                <i
                  :class="
                    expanded
                      ? 'icon-[mdi--chevron-up]'
                      : 'icon-[mdi--chevron-down]'
                  "
                ></i>
              </Button>
              <Button size="middle" @click="handleReset">
                <i class="icon-[mdi--restore]"></i> 重置
              </Button>
              <Button type="primary" size="middle" @click="handleApply">
                <i class="icon-[mdi--magnify]"></i> 查询
              </Button>
            </Space>
          </slot>
        </Col>
      </Row>
    </Form>
  </div>
</template>

<style scoped>
.crud-filter-bar {
  padding: 0 20px 12px;
}

.crud-filter-bar__form {
  padding-top: 4px;
}

.filter-actions {
  display: flex;
  justify-content: flex-end;
  height: 100%;
  align-items: center;
}
</style>
