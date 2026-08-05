<script setup>
/**
 * P5-011 定位访问审计（web-pc）：
 * 查看历史查询/导出/反查轨迹的访问记录（GET location/audits），只读。
 */
import { ref } from 'vue';

import AppCrudTable from '#/components/app-crud-table/AppCrudTable.vue';

const filterFields = ref([
  { field: 'date', label: '日期', type: 'date', span: 8 },
  { field: 'user_id', label: '访问人ID', type: 'number', span: 8 },
  { field: 'target_user_id', label: '被查人ID', type: 'number', span: 8 },
]);

const gridColumns = ref([
  { field: 'audit_time', title: '访问时间', width: 170 },
  { field: 'user_name', title: '访问人', width: 140 },
  { field: 'target_name', title: '被查人', width: 140 },
  { field: 'reason', title: '操作详情', minWidth: 280 },
]);
</script>

<template>
  <AppCrudTable
    api-url="location/audits"
    :filter-fields="filterFields"
    :fields="[]"
    :grid-options="{ columns: gridColumns, showOverflow: false, columnConfig: { resizable: true } }"
    :show-actions="false"
    :toolbar="{ filter: true, create: false, refresh: true, print: false, export: false, more: false }"
    title="定位审计"
    class="p-4"
  />
</template>
