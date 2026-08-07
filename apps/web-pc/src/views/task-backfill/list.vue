<script setup>
import { computed, ref } from 'vue';

import { Radio, Tag } from 'antdv-next';

import AppCrudTable from '#/components/app-crud-table/AppCrudTable.vue';

import { useAppStore } from '#/store';

// 全局选择的项目 ID（"所有项目"时为空），列表请求自动携带
const currentProjectId = computed(() => useAppStore().defaultProject?.id || undefined);

// 查询参数：computed 保持引用稳定，避免页面重渲染时生成新对象触发列表深 watch 刷新
const extraQuery = computed(() => ({ project_id: currentProjectId.value }));

// 查询范围：2=项目范围（最大权限，默认） 1=仅本人
const listScope = ref(2);
const scopeOptions = [
  { label: '全部', value: 2 },
  { label: '只看自己的', value: 1 },
];

const filterFields = ref([
  { field: 'project_id', label: '项目ID', type: 'number', span: 8 },
  { field: 'state', label: '状态', type: 'select', span: 8, options: [
    { label: '待审批', value: 0 },
    { label: '已通过', value: 1 },
    { label: '已驳回', value: 2 },
  ]},
  { field: 'user_id', label: '申请人ID', type: 'number', span: 8 },
]);

const formFields = ref([
  { field: 'backfill_date', type: 'text', label: '实际执行日期', span: 12, displayOnly: true },
  { field: 'state_label', type: 'text', label: '状态', span: 12, displayOnly: true },
  { field: 'reason', type: 'textarea', label: '后补原因', span: 24 },
  { field: 'task', type: 'slot', label: '原任务', span: 24 },
  { field: 'audit_info', type: 'slot', label: '审批信息', span: 24 },
]);

const stateColors = {
  0: 'orange',
  1: 'green',
  2: 'red',
};

const gridColumns = ref([
  { field: 'backfill_date', title: '实际执行日期', width: 120 },
  {
    field: 'state',
    title: '状态',
    width: 100,
    slots: { default: 'default_state' },
  },
  { field: 'reason', title: '后补原因', minWidth: 200 },
  { field: 'user', title: '申请人', width: 100, slots: { default: 'default_user' } },
  { field: 'created_at', title: '申请时间', width: 160 },
]);
</script>

<template>
  <AppCrudTable
    api-url="task-backfills"
    :filter-fields="filterFields"
    :fields="formFields"
    :extra-query="extraQuery"
    :list-scope="listScope"
    permission-name="task_backfill"
    :inline-actions="['view', 'audit']"
    :grid-options="{ columns: gridColumns, showOverflow: false, columnConfig: { resizable: true } }"
    :open-mode="{ create: 'modal', detail: 'modal' }"
    :form-attrs="{ layout: 'vertical', size: 'medium' }"
    title="后补任务记录申请"
    class="p-4"
  >
    <template #filter-prepend>
      <div class="mb-3 flex items-center gap-2">
        <span class="text-sm text-gray-500">查询范围</span>
        <Radio.Group
          v-model:value="listScope"
          :options="scopeOptions"
          option-type="button"
          size="small"
        />
      </div>
    </template>
    <template #default_state="{ row }">
      <Tag :color="stateColors[row.state] || 'default'">{{ row.state_label || '-' }}</Tag>
    </template>
    <template #default_user="{ row }">
      {{ row.user?.name || row.user?.username || '-' }}
    </template>

    <template #field_task="{ modelValue }">
      <div v-if="modelValue" class="text-sm">
        <div>任务日期：{{ modelValue.date || '-' }}</div>
        <div class="mt-1 text-gray-500">{{ modelValue.content || '-' }}</div>
      </div>
      <div v-else class="text-sm text-gray-400">独立后补记录</div>
    </template>
    <template #field_audit_info="{ modelValue }">
      <div v-if="modelValue" class="text-sm">
        <div>审批时间：{{ modelValue.audit_time || modelValue.created_at || '-' }}</div>
        <div v-if="modelValue.reason" class="mt-1 text-red-500">意见：{{ modelValue.reason }}</div>
      </div>
      <div v-else class="text-sm text-gray-400">待审批</div>
    </template>
  </AppCrudTable>
</template>
