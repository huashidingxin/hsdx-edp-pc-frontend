<script setup>
import { ref } from 'vue';

import { Tag } from 'antdv-next';

import AppCrudTable from '#/components/app-crud-table/AppCrudTable.vue';

const filterFields = ref([
  { field: 'project_id', label: '项目ID', type: 'number', span: 8 },
  { field: 'state', label: '状态', type: 'select', span: 8, options: [
    { label: '待处理', value: 1 },
    { label: '处理中', value: 2 },
    { label: '已完成', value: 3 },
  ]},
  { field: 'level_id', label: '级别ID', type: 'number', span: 8 },
]);

const formFields = ref([
  { field: 'code', type: 'text', label: '编号', span: 12, displayOnly: true },
  { field: 'state_label', type: 'text', label: '状态', span: 12, displayOnly: true },
  { field: 'description', type: 'textarea', label: '问题描述', span: 24 },
  { field: 'requirement', type: 'textarea', label: '整改要求', span: 24 },
  { field: 'deadline', type: 'text', label: '整改期限', span: 12, displayOnly: true },
  { field: 'nonconformances', type: 'slot', label: '关联不符合项', span: 24 },
]);

const stateColors = {
  1: 'orange',
  2: 'blue',
  3: 'green',
};

// 后端子项关系序列化不含 label，本地映射（P3-N01 状态语义）
const ncStateLabel = (s) => ({ 0: '草稿', 1: '待审核', 2: '已通过', 3: '已退回' }[s] ?? '-');
const ncRectifyLabel = (s) => ({ 0: '待整改', 1: '整改中', 2: '已整改', 3: '已关闭' }[s] ?? '-');
const ncRectifyColor = (s) => (s === 3 ? 'green' : s === 1 ? 'blue' : s === 2 ? 'green' : 'orange');

const gridColumns = ref([
  { field: 'code', title: '编号', minWidth: 120 },
  {
    field: 'state',
    title: '状态',
    width: 100,
    slots: { default: 'default_state' },
  },
  { field: 'description', title: '问题描述', minWidth: 200 },
  { field: 'deadline', title: '整改期限', width: 120 },
  { field: 'created_at', title: '创建时间', width: 160 },
]);
</script>

<template>
  <AppCrudTable
    api-url="issues"
    :filter-fields="filterFields"
    :fields="formFields"
    permission-name="issue"
    :inline-actions="['view']"
    :grid-options="{ columns: gridColumns, showOverflow: false, columnConfig: { resizable: true } }"
    :open-mode="{ create: 'modal', detail: 'modal' }"
    :form-attrs="{ layout: 'vertical', size: 'medium' }"
    title="问题跟踪"
    class="p-4"
  >
    <template #default_state="{ row }">
      <Tag :color="stateColors[row.state] || 'default'">{{ row.state_label || row.state_desc || '-' }}</Tag>
    </template>

    <template #field_nonconformances="{ modelValue }">
      <div v-if="modelValue && modelValue.length" class="space-y-2">
        <div v-for="(nc, i) in modelValue" :key="i" class="rounded border p-2 text-sm">
          <div class="flex items-center justify-between">
            <span>{{ nc.code || '-' }}</span>
            <!-- P3-N06 子项整改状态驱动问题关闭 -->
            <span class="space-x-1">
              <Tag :color="nc.state === 2 ? 'green' : (nc.state === 3 ? 'red' : 'orange')">
                {{ ncStateLabel(nc.state) }}
              </Tag>
              <Tag :color="ncRectifyColor(nc.rectify_state)">
                {{ ncRectifyLabel(nc.rectify_state) }}
              </Tag>
            </span>
          </div>
          <div class="mt-1 text-gray-500">{{ nc.content }}</div>
        </div>
      </div>
      <div v-else class="text-sm text-gray-400">无关联不符合项</div>
    </template>
  </AppCrudTable>
</template>
