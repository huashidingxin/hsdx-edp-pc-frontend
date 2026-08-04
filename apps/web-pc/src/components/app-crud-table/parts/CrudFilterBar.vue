<script setup>
/**
 * CrudFilterBar - 筛选区
 *
 * Props: fields, modelValue, expanded, canExpand
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

// 展开/收起由 useCrudTableFilters 统一计算，避免壳组件和筛选栏重复截断字段。
const visibleFields = computed(() => props.fields);
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

        <!-- 操作区：紧跟筛选字段，展开/收起与查询按钮保持邻近 -->
        <Col v-if="showActions" :span="6" class="filter-actions-col">
          <slot
            name="actions"
            :reset="handleReset"
            :apply="handleApply"
            :toggle-expand="toggleExpand"
            :expanded="expanded"
          >
            <Space :size="8" class="filter-actions pb-3">
              <Button size="middle" @click="handleReset">
                <i class="icon-[mdi--restore]"></i> 重置
              </Button>
              <Button type="primary" size="middle" @click="handleApply">
                <i class="icon-[mdi--magnify]"></i> 查询
              </Button>
              <Button
                v-if="canExpand"
                type="link"
                size="small"
                class="filter-expand-btn"
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

.filter-actions-col {
  display: flex;
  align-items: center;
}

.filter-expand-btn {
  padding-inline: 4px !important;
  color: #667085;
}

.filter-expand-btn:hover {
  color: #1677ff;
}
</style>
