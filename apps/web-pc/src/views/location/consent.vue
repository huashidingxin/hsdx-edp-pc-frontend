<script setup>
/**
 * P5-002 定位告知书签署记录（web-pc）：
 * 查看电子签署记录（GET location/consents），只读，支持按用户/状态筛选。
 */
import { ref } from 'vue';

import { Tag } from 'antdv-next';

import AppCrudTable from '#/components/app-crud-table/AppCrudTable.vue';

const statusOptions = [
  { value: 1, label: '已签署' },
  { value: 0, label: '已撤回' },
];

const filterFields = ref([
  { field: 'user_id', label: '员工ID', type: 'number', span: 8 },
  { field: 'status', label: '状态', type: 'select', span: 8, attrs: { options: statusOptions } },
]);

const gridColumns = ref([
  { field: 'user_name', title: '员工', minWidth: 140 },
  { field: 'version', title: '版本', width: 90 },
  { field: 'status', title: '状态', width: 100, slots: { default: 'default_status' } },
  { field: 'signed_at', title: '签署时间', width: 170 },
  { field: 'device', title: '设备', minWidth: 130 },
  { field: 'ip', title: 'IP', width: 130 },
  { field: 'revoked_at', title: '撤回时间', width: 170 },
  { field: 'revoked_name', title: '撤回人', width: 130 },
]);

const statusColorMap = { 1: 'green', 0: 'red' };
</script>

<template>
  <AppCrudTable
    api-url="location/consents"
    :filter-fields="filterFields"
    :fields="[]"
    :grid-options="{ columns: gridColumns, showOverflow: false, columnConfig: { resizable: true } }"
    :show-actions="false"
    :toolbar="{ filter: true, create: false, refresh: true, print: false, export: false, more: false }"
    title="定位告知书"
    class="p-4"
  >
    <template #default_status="{ row }">
      <Tag :color="statusColorMap[row.status] || 'default'">{{ row.status_label || '-' }}</Tag>
    </template>
  </AppCrudTable>
</template>
